import { BaseSideService } from "@zeppos/zml/base-side";
import { cleanLimitsForWatch } from "../shared/clean-limits.js";
import { parseJsonBody } from "../shared/parse-json-body.js";
import { endpointUrl } from "../shared/worker-url.js";

const SETTINGS = {
  workerUrl: "workerUrl",
  workerKey: "workerKey",
  deviceKey: "deviceKey",
  t3BaseUrl: "t3BaseUrl",
  t3Token: "t3Token",
  snapshotPrefix: "lastSnapshot:",
};
const MAX_CACHED_SNAPSHOT_CHARS = 180_000;

function snapshotScope() {
  const source = `${WORKER_URL}\n${parseStored(SETTINGS.deviceKey) || ""}\n${parseStored(SETTINGS.t3BaseUrl) || ""}\n${parseStored(SETTINGS.t3Token) || ""}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

function snapshotKey() {
  return `${SETTINGS.snapshotPrefix}${snapshotScope()}:v2`;
}

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parseStored(key) {
  try {
    return settings.settingsStorage.getItem(key);
  } catch {
    return null;
  }
}

let inFlightLoad = null;

const WORKER_URL = "https://t3zepp.devarshi.dev";

async function loadUsage(timeZone) {
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    let rawKey = parseStored(SETTINGS.deviceKey);
    let deviceKey = rawKey ? String(rawKey).trim() : "";
    const rawT3Base = parseStored(SETTINGS.t3BaseUrl);
    const t3BaseUrl = rawT3Base ? String(rawT3Base).trim() : "";
    const rawT3Token = parseStored(SETTINGS.t3Token);
    const t3Token = rawT3Token ? String(rawT3Token).trim().replace(/^Bearer\s+/i, "") : "";

    // If deviceKey is a 6-digit pairing code, claim it automatically
    if (/^\d{6}$/.test(deviceKey)) {
      try {
        const claimResp = await fetch({
          url: `${WORKER_URL}/api/pair/claim`,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pairingCode: deviceKey }),
        });
        const claimResult = claimResp?.result || claimResp;
        const claimBody = parseJsonBody(claimResult?.body || claimResult?.data || claimResult);
        if (claimBody?.deviceKey) {
          deviceKey = claimBody.deviceKey;
          try {
            settings.settingsStorage.setItem(SETTINGS.deviceKey, deviceKey);
          } catch {
            // Ignore storage write error
          }
        }
      } catch {
        // Fall back to existing key
      }
    }

    if (!deviceKey && (!t3BaseUrl || !t3Token)) {
      throw new Error("Enter Pairing Code or Device Key in companion settings.");
    }
    const targetUrl = endpointUrl(WORKER_URL);
    const requestHeaders = {
      "content-type": "application/json",
    };
    if (deviceKey) {
      requestHeaders.authorization = `Bearer ${deviceKey}`;
    }
    if (t3BaseUrl) {
      requestHeaders["x-t3-base-url"] = t3BaseUrl;
    }
    if (t3Token) {
      requestHeaders["x-t3-access-token"] = t3Token;
    }

    const requestPayload = { timeZone };
    if (deviceKey) requestPayload.deviceKey = deviceKey;
    if (t3BaseUrl) requestPayload.t3BaseUrl = t3BaseUrl;
    if (t3Token) requestPayload.t3AccessToken = t3Token;

    let response;
    let timer;
    try {
      const fetchPromise = fetch({
        url: targetUrl,
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestPayload),
      });
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timeout")), 25000);
      });
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } catch {
      throw new Error("Phone could not reach the Worker. Check internet and URL.");
    } finally {
      clearTimeout(timer);
    }
    const resp = response?.result && typeof response.result === "object" ? response.result : response;
    const rawBody = resp?.body !== undefined ? resp.body : resp?.data !== undefined ? resp.data : resp;
    const rawStatus = resp?.status ?? resp?.statusCode ?? response?.status;
    const numStatus = Number(rawStatus);
    const status = rawStatus == null ? 200 : (Number.isFinite(numStatus) ? numStatus : 200);

    if (status === 0) throw new Error("Phone could not reach the Worker. Check internet and URL.");
    if (status === 401) throw new Error("Unauthorized. Check your T3 Code token or Worker key.");
    if (status === 503) throw new Error("T3 Code not configured. Set the T3 Code base URL and token in settings.");
    if (status === 429) throw new Error("Too many requests to Worker. Wait a moment and retry.");
    if (status === 502) {
      let customError;
      try {
        const errPayload = parseJsonBody(rawBody);
        if (typeof errPayload?.error === "string" && errPayload.error) {
          customError = errPayload.error;
        }
      } catch {
        // Body is not JSON (e.g. Cloudflare HTML error page); fall through to default
      }
      if (customError) throw new Error(customError);
      throw new Error("T3 Code connection failed. Check your T3 Code server and its tunnel.");
    }
    if (status >= 300) {
      let customError;
      try {
        const errPayload = parseJsonBody(rawBody);
        if (typeof errPayload?.error === "string" && errPayload.error) {
          customError = errPayload.error;
        }
      } catch {}
      if (customError) throw new Error(customError);
      throw new Error(`Worker returned HTTP ${status}. Check the Worker URL.`);
    }
    let body;
    try {
      body = parseJsonBody(rawBody);
    } catch (parseErr) {
      const errDetail = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`Worker returned unreadable data (${errDetail}). Refresh and check Worker logs.`);
    }
    if (status < 200 || !body || typeof body !== "object" || body.version !== 2 || !body.ranges) {
      if (typeof body?.error === "string" && body.error) {
        throw new Error(body.error);
      }
      const rawType = String(typeof rawBody).slice(0, 6);
      const rawLen = typeof rawBody === "string" ? String(rawBody.length).slice(0, 5) : (rawBody?.byteLength != null ? String(rawBody.byteLength).slice(0, 5) : "-");
      const keys = body && typeof body === "object" ? Object.keys(body) : [];
      const keyStr = keys.length > 0 ? keys.slice(0, 3).join(",").slice(0, 14) : "none";
      const vStr = String(body?.version ?? "-").slice(0, 4);
      const diag = `s=${status} v=${vStr} r=${body?.ranges ? 1 : 0} t=${rawType} l=${rawLen} k=${keyStr}`;
      console.log(`[T3 Code Usage] validation failed: ${diag}`);
      throw new Error(`Summary err (${diag}).`);
    }
    console.log(`[T3 Code Usage] parsed response: version=${body.version}, ranges=${Object.keys(body.ranges).join(",")}`);
    body.stale = false;
    body.limits = cleanLimitsForWatch(body.limits);
    const serialized = JSON.stringify(body);
    if (serialized.length <= MAX_CACHED_SNAPSHOT_CHARS) {
      try {
        settings.settingsStorage.setItem(snapshotKey(), serialized);
      } catch {
        // A cache write must not turn a successful network response into a failure.
      }
    }
    return body;
  })();
  try {
    return await inFlightLoad;
  } finally {
    inFlightLoad = null;
  }
}

function cachedUsage() {
  try {
    const value = JSON.parse(parseStored(snapshotKey()) || "null");
    if (value?.version !== 2 || !value?.ranges) return null;
    return { ...value, stale: true };
  } catch {
    return null;
  }
}

AppSideService(
  BaseSideService({
    onInit() {},
    async onRequest(req, res) {
      if (req.method === "GET_USAGE_CACHE") {
        return res(null, cachedUsage() || {});
      }
      if (req.method !== "GET_USAGE") return res("Unsupported request");
      const timeZone = req.params?.timeZone || localTimeZone();
      try {
        const result = await loadUsage(timeZone);
        res(null, result);
      } catch (error) {
        const cached = cachedUsage();
        const message = error instanceof Error ? error.message : "Usage refresh failed.";
        if (cached) return res(null, { ...cached, error: message });
        res(null, { error: message });
      }
    },
    onRun() {},
    onDestroy() {},
  }),
);
