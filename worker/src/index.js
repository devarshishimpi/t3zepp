import { makeUsageInputs, USAGE_RANGES } from "./ranges.js";
import { readT3Usage } from "./t3-rpc.js";
import { summarizeUsageRanges } from "./summarize.js";
import {
  createDevice,
  claimPairingCode,
  getDevice,
  updateDevice,
  touchDevice,
  revokeDevice,
} from "./devices.js";
const MAX_BODY_BYTES = 4096;
const MAX_RESPONSE_BYTES = 64_000;
const PAIRING_INIT_LIMIT = 5;
const PAIRING_CLAIM_LIMIT = 10;

async function rateLimitPairing(request, env, path, limit) {
  if (!env.DB) return true;
  const now = Date.now();
  const windowStart = Math.floor(now / 60_000) * 60_000;
  const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${clientIp}:${path}:${windowStart}`),
  );
  const bucketKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const result = await env.DB.prepare(
    "INSERT INTO pairing_rate_limits (bucket_key, attempts, window_ends_at) VALUES (?, 1, ?) " +
      "ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts",
  ).bind(bucketKey, windowStart + 60_000).first();
  if (now % 60_000 < 5_000) {
    await env.DB.prepare("DELETE FROM pairing_rate_limits WHERE window_ends_at < ?").bind(now - 60 * 60_000).run();
  }
  return Number(result?.attempts) <= limit;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}


function upstreamDiagnostic(error) {
  const message = error instanceof Error ? error.message : "";
  const auth = /^T3 authorization failed \((\d{3})\)$/.exec(message);
  if (auth) return { stage: "t3_authorization", status: Number(auth[1]) };
  const upgrade = /^T3 WebSocket upgrade failed \((\d{3})\)$/.exec(message);
  if (upgrade) return { stage: "t3_websocket_upgrade", status: Number(upgrade[1]) };

  const knownStages = new Map([
    ["T3 did not issue an RPC ticket", "t3_ticket_missing"],
    ["T3 ticket request failed", "t3_ticket_request_failed"],
    ["T3 WebSocket request failed", "t3_websocket_request_failed"],
    ["T3 WebSocket failed", "t3_websocket_error"],
    ["T3 closed the RPC connection", "t3_websocket_closed"],
    ["T3 denied or failed the requested Usage read", "t3_rpc_failed"],
    ["T3 RPC timed out", "t3_rpc_timeout"],
    ["Could not send the T3 RPC request", "t3_rpc_send_failed"],
    ["T3 connection is not configured", "t3_not_configured"],
    ["T3_BASE_URL must be a public HTTPS origin", "invalid_t3_origin"],
    ["T3 returned an incomplete Usage snapshot", "incomplete_t3_snapshot"],
    ["T3 returned an invalid response frame", "invalid_t3_frame"],
  ]);
  const stage = knownStages.get(message);
  if (stage) return { stage };
  const type = error instanceof TypeError ? "type_error" : error instanceof SyntaxError ? "syntax_error" : "error";
  return { stage: "upstream_failed", type };
}

async function requestBody(request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new Error("Request is too large");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) throw new Error("Request is too large");
  const value = JSON.parse(body);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request");
  if (value.range !== undefined && (typeof value.range !== "string" || !Object.hasOwn(USAGE_RANGES, value.range))) {
    throw new Error("Invalid range");
  }
  if (value.timeZone !== undefined && (typeof value.timeZone !== "string" || value.timeZone.length > 100)) {
    throw new Error("Invalid time zone");
  }
  if (value.t3BaseUrl !== undefined && (typeof value.t3BaseUrl !== "string" || value.t3BaseUrl.length > 500)) {
    throw new Error("Invalid t3BaseUrl");
  }
  if (value.t3AccessToken !== undefined && (typeof value.t3AccessToken !== "string" || value.t3AccessToken.length > 1000)) {
    throw new Error("Invalid t3AccessToken");
  }
  if (value.t3Token !== undefined && (typeof value.t3Token !== "string" || value.t3Token.length > 1000)) {
    throw new Error("Invalid t3Token");
  }
  if (value.deviceKey !== undefined && (typeof value.deviceKey !== "string" || value.deviceKey.length > 200)) {
    throw new Error("Invalid deviceKey");
  }
  if (value.pairingCode !== undefined && (typeof value.pairingCode !== "string" || value.pairingCode.length > 20)) {
    throw new Error("Invalid pairingCode");
  }
  if (value.label !== undefined && (typeof value.label !== "string" || value.label.length > 100)) {
    throw new Error("Invalid label");
  }
  return value;
}

export function createWorker({ readUsage = readT3Usage, clock = () => new Date() } = {}) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/health") {
        return request.method === "HEAD"
          ? new Response(null, {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              },
            })
          : json({ ok: true });
      }

      if (url.pathname === "/api/pair/init") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
        if (!(await rateLimitPairing(request, env, url.pathname, PAIRING_INIT_LIMIT))) {
          return json({ error: "Too many pairing attempts. Try again in a minute." }, 429);
        }
        try {
          const input = await requestBody(request);
          const result = await createDevice(env.DB, {
            t3BaseUrl: input.t3BaseUrl,
            t3AccessToken: input.t3AccessToken || input.t3Token,
            label: input.label,
          });
          return json(result, 200);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : "Pairing failed" }, 400);
        }
      }

      if (url.pathname === "/api/pair/claim") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
        if (!(await rateLimitPairing(request, env, url.pathname, PAIRING_CLAIM_LIMIT))) {
          return json({ error: "Too many pairing attempts. Try again in a minute." }, 429);
        }
        try {
          const input = await requestBody(request);
          const result = await claimPairingCode(env.DB, input.pairingCode);
          return json(result, 200);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : "Claim failed" }, 400);
        }
      }

      if (url.pathname === "/api/device/update") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
        try {
          const input = await requestBody(request);
          const authorization = request.headers.get("authorization") ?? "";
          const authKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
          const key = input.deviceKey || authKey;
          const result = await updateDevice(env.DB, {
            deviceKey: key,
            t3BaseUrl: input.t3BaseUrl,
            t3AccessToken: input.t3AccessToken || input.t3Token,
          });
          return json(result, 200);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : "Update failed" }, 400);
        }
      }

      if (url.pathname === "/api/device/revoke") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
        try {
          const input = await requestBody(request);
          const authorization = request.headers.get("authorization") ?? "";
          const authKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
          const key = input.deviceKey || authKey;
          const result = await revokeDevice(env.DB, key);
          return json(result, 200);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : "Revoke failed" }, 400);
        }
      }

      if (url.pathname !== "/v1/usage") {
        if (
          (request.method === "GET" || request.method === "HEAD") &&
          !url.pathname.startsWith("/api/") &&
          env.ASSETS
        ) {
          return env.ASSETS.fetch(request);
        }
        return json({ error: "Not found" }, 404);
      }
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const authorization = request.headers.get("authorization") ?? "";
      const authKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

      const startedAt = Date.now();
      let upstreamMs = 0;
      try {
        const input = await requestBody(request);

        const headerT3Base = request.headers.get("x-t3-base-url");
        const headerT3Token = request.headers.get("x-t3-access-token");
        const keyT3Base = authKey.startsWith("https://") && authKey.includes("#") ? authKey.split("#")[0] : null;
        const keyT3Token = authKey.startsWith("https://") && authKey.includes("#") ? authKey.split("#").slice(1).join("#") : null;

        let customT3Base = (headerT3Base || input.t3BaseUrl || keyT3Base || "").trim();
        let customT3Token = (headerT3Token || input.t3AccessToken || input.t3Token || keyT3Token || "").trim();

        const deviceKey = (input.deviceKey || (authKey && !authKey.startsWith("https://") ? authKey : "")).trim();
        if ((!customT3Base || !customT3Token) && deviceKey && env.DB) {
          const device = await getDevice(env.DB, deviceKey);
          if (!device) {
            return json({ error: "Device key not recognized or revoked. Pair at https://t3zepp.devarshi.dev/pair" }, 401);
          }
          customT3Base = device.t3_base_url;
          customT3Token = device.t3_access_token;
          const touch = touchDevice(env.DB, deviceKey);
          if (ctx?.waitUntil) ctx.waitUntil(touch);
          else await touch;
        }

        if (!customT3Base || !customT3Token) {
          return json({ error: "Missing T3 Code credentials. Provide a valid Device Key or T3 Code server URL and session token in companion settings." }, 400);
        }

        const usageInputs = makeUsageInputs(clock(), input.timeZone ?? "UTC");
        const upstreamStartedAt = Date.now();
        const data = await readUsage({
          base: customT3Base,
          accessToken: customT3Token,
          usageInputs,
        });
        upstreamMs = Date.now() - upstreamStartedAt;
        const compact = summarizeUsageRanges({
          hourly: {
            usage: {
              ...data.usages?.hourly,
              sinceTime: usageInputs.hourly.sinceTime,
              untilTime: usageInputs.hourly.untilTime,
            },
          },
          daily: { usage: data.usages?.daily },
          providers: data.providers,
          usageLimitSources: data.usageLimitSources,
        });
        const body = JSON.stringify({
          ...compact,
          fetchedAt: clock().toISOString(),
        });
        const responseBytes = new TextEncoder().encode(body).byteLength;
        if (responseBytes > MAX_RESPONSE_BYTES) {
          return json({ error: "Usage response is too large for the watch connection" }, 502);
        }
        console.log(JSON.stringify({
          event: "t3_usage_request",
          status: 200,
          ranges: Object.keys(compact.ranges).length,
          upstreamMs,
          totalMs: Date.now() - startedAt,
          responseBytes,
        }));
        return new Response(body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, no-transform",
            "x-content-type-options": "nosniff",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upstream request failed";
        if (
          error instanceof SyntaxError ||
          message.startsWith("Invalid") ||
          message === "Unsupported usage range" ||
          message === "Request is too large"
        ) {
          return json({ error: message }, 400);
        }
        console.error(JSON.stringify({
          event: "t3_usage_upstream_failed",
          upstreamMs,
          totalMs: Date.now() - startedAt,
          ...upstreamDiagnostic(error),
        }));
        return json({ error: "Could not read T3 Code Usage. Check the T3 Code connection and credential." }, 502);
      }
    },
  };
}

export default createWorker();
