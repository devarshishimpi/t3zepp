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
import { PAIRING_PAGE_HTML } from "./pairing-page.js";

const MAX_BODY_BYTES = 4096;
const MAX_RESPONSE_BYTES = 64_000;

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

const LANDING_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>T3 Zepp: T3 Code Companion for Amazfit Watches</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --card-border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --text-subtle: #71717a;
      --accent: #f4f4f5;
      --accent-foreground: #09090b;
      --code-bg: #18181b;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.5;
      padding: 0;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .topbar {
      border-bottom: 1px solid var(--card-border);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(9, 9, 11, 0.8);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--text);
    }
    .logo-badge {
      background: #27272a;
      color: #ffffff;
      font-weight: 700;
      font-size: 11px;
      padding: 3px 6px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .brand-title {
      font-weight: 600;
      font-size: 14px;
      color: #ffffff;
    }
    .nav-links {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .nav-links a {
      color: var(--text-muted);
      font-size: 13px;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s ease;
    }
    .nav-links a:hover { color: #ffffff; }
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 40px 16px 80px 16px;
    }
    header {
      margin-bottom: 32px;
    }
    .badge-subtle {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-subtle);
      border: 1px solid var(--card-border);
      border-radius: 4px;
      padding: 2px 8px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.4px;
      color: #ffffff;
      margin-bottom: 8px;
    }
    p.lead {
      font-size: 15px;
      color: var(--text-muted);
      max-width: 600px;
      line-height: 1.6;
    }
    .header-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    .btn-primary {
      display: inline-block;
      background: var(--accent);
      color: var(--accent-foreground);
      padding: 8px 16px;
      font-weight: 600;
      font-size: 13px;
      border: none;
      border-radius: 6px;
      text-decoration: none;
      transition: background 0.15s ease;
      font-family: inherit;
    }
    .btn-primary:hover { background: #e4e4e7; }
    .btn-secondary {
      display: inline-block;
      background: #18181b;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px 16px;
      font-weight: 500;
      font-size: 13px;
      border-radius: 6px;
      text-decoration: none;
      transition: background 0.15s ease;
      font-family: inherit;
    }
    .btn-secondary:hover { background: #27272a; }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .card h2 {
      font-size: 15px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .card p {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 12px;
      line-height: 1.6;
    }
    .card p:last-child { margin-bottom: 0; }
    .endpoint-box {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #f4f4f5;
      display: block;
      margin: 8px 0;
    }
    .step-list {
      list-style: none;
      counter-reset: step-counter;
      margin-top: 16px;
    }
    .step-item {
      counter-increment: step-counter;
      position: relative;
      padding-left: 36px;
      margin-bottom: 24px;
    }
    .step-item::before {
      content: counter(step-counter);
      position: absolute;
      left: 0;
      top: 0;
      width: 22px;
      height: 22px;
      background: #27272a;
      color: #ffffff;
      font-weight: 600;
      font-size: 11px;
      border-radius: 4px;
      text-align: center;
      line-height: 22px;
    }
    .step-title {
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .step-desc {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 8px;
    }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #e2e8f0;
      overflow-x: auto;
      margin: 8px 0 12px 0;
      line-height: 1.5;
    }
    code {
      font-family: var(--font-mono);
      font-size: 12px;
      background: #27272a;
      padding: 2px 6px;
      border-radius: 4px;
      color: #f4f4f5;
    }
    pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    footer {
      text-align: center;
      font-size: 12px;
      color: var(--text-subtle);
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--card-border);
    }
    footer a { color: var(--text-muted); text-decoration: none; }
    footer a:hover { color: #ffffff; }
  </style>
</head>
<body>
  <nav class="topbar">
    <a href="/" class="brand">
      <span class="logo-badge">T3</span>
      <span class="brand-title">T3 Zepp</span>
    </a>
    <div class="nav-links">
      <a href="/pair">Pairing Tool</a>
      <a href="https://github.com/devarshishimpi/t3zepp" target="_blank" rel="noopener">GitHub</a>
    </div>
  </nav>

  <div class="container">
    <header>
      <div class="badge-subtle">Amazfit watches &bull; Zepp OS &bull; AGPL-3.0</div>
      <h1>T3 Zepp Companion</h1>
      <p class="lead">T3 Zepp is a community-built companion project for the T3 ecosystem, designed to bring useful T3 information to Amazfit watches while leaving room for broader watch-friendly tools and experiences in the future.</p>
      <div class="header-actions">
        <a class="btn-primary" href="/pair">Open Pairing Dashboard</a>
        <a class="btn-secondary" href="https://github.com/devarshishimpi/t3zepp" target="_blank" rel="noopener">GitHub Repository</a>
      </div>
    </header>

    <div class="card">
      <h2>Supported watches</h2>
      <ul>
        <li>Amazfit T-Rex 3 (Zepp OS 4.0)</li>
      </ul>
      <p style="font-size: 12px; color: var(--text-subtle);">Compatibility is confirmed for the models listed here. More Amazfit watches may be added as they are verified.</p>
    </div>

    <div class="card">
      <h2>Public Gateway Endpoint</h2>
      <p>This service acts as an open, multi-tenant proxy gateway for T3 Zepp. You can pair your watch directly without creating a Cloudflare account or hosting your own serverless infrastructure.</p>
      <code class="endpoint-box">https://t3zepp.devarshi.dev</code>
      <p style="font-size: 12px; color: var(--text-subtle);">Device mappings are saved under a random, unguessable Device Key in Cloudflare D1. Updating endpoints when your tunnel restarts requires no watch reconfiguration.</p>
    </div>

    <div class="card">
      <h2>Quickstart Setup Guide</h2>
      <p>Follow these steps to connect a supported Amazfit watch:</p>

      <ol class="step-list">
        <li class="step-item">
          <div class="step-title">Install T3 Zepp onto your watch</div>
          <div class="step-desc">
            Enable Developer Mode in the Zepp app on your phone (Profile &gt; Settings &gt; About, tap Zepp OS version 7 times). Then build and preview from your computer:
          </div>
          <pre><code>git clone https://github.com/devarshishimpi/t3zepp.git
cd t3zepp/app
npm install
npm run preview</code></pre>
          <div class="step-desc">
            Scan the terminal QR code in the Zepp phone app under Profile &gt; Developer Mode.
          </div>
        </li>

        <li class="step-item">
          <div class="step-title">Start an HTTPS tunnel to local T3 Code (Port 3773)</div>
          <div class="step-desc">
            T3 Code listens on port 3773. Run a quick tunnel:
          </div>
          <pre><code># Cloudflare Quick Tunnel (Recommended)
cloudflared tunnel --url http://127.0.0.1:3773

# Or localtunnel
npx localtunnel --port 3773</code></pre>
        </li>

        <li class="step-item">
          <div class="step-title">Issue a read-only session token</div>
          <div class="step-desc">
            In your terminal inside your T3 Code repository:
          </div>
          <pre><code>t3 auth session issue --scope diagnostics:read --scope orchestration:read --ttl 365d --token-only</code></pre>
        </li>

        <li class="step-item">
          <div class="step-title">Generate pairing code &amp; link in Zepp app</div>
          <div class="step-desc">
            Visit <a href="/pair" style="color: #f4f4f5; text-decoration: underline;">/pair</a>, paste your tunnel address and session token, and tap <b>Generate Pairing Code</b>. Enter the 6-digit code in the Zepp app under your watch's page &gt; T3 Zepp &gt; Settings.
          </div>
        </li>

        <li class="step-item">
          <div class="step-title">Sync live metrics on watch</div>
          <div class="step-desc">
            Open T3 Zepp on your supported Amazfit watch and tap <b>Refresh</b>.
          </div>
        </li>
      </ol>
    </div>

    <div class="card">
      <h2>Tunnel Restarts</h2>
      <p>If your quick tunnel restarts and Cloudflare assigns a new HTTPS URL, visit <a href="/pair" style="color: #f4f4f5; text-decoration: underline;">/pair</a>, select <b>Update Tunnel URL</b>, and paste your Device Key and new address. Your watch will immediately route through the new tunnel without touching watch or phone settings.</p>
    </div>

    <footer>
      <p>Unofficial companion &bull; Not affiliated with T3 Tools &bull; AGPL-3.0 License &bull; <a href="https://github.com/devarshishimpi/t3zepp">GitHub</a></p>
    </footer>
  </div>
</body>
</html>`;

export function createWorker({ readUsage = readT3Usage, clock = () => new Date() } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/" || url.pathname === "")) {
        return new Response(request.method === "HEAD" ? null : LANDING_PAGE_HTML, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      }
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
      if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/pair" || url.pathname === "/pair/")) {
        return new Response(request.method === "HEAD" ? null : PAIRING_PAGE_HTML, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      }

      if (url.pathname === "/api/pair/init") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
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

      if (url.pathname !== "/v1/usage") return json({ error: "Not found" }, 404);
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const authorization = request.headers.get("authorization") ?? "";
      const authKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

      const targetWorkerHeader = request.headers.get("x-target-worker");
      if (targetWorkerHeader && /^https?:\/\//i.test(targetWorkerHeader)) {
        const dest = targetWorkerHeader.endsWith("/v1/usage") ? targetWorkerHeader : `${targetWorkerHeader.replace(/\/+$/, "")}/v1/usage`;
        const fwdHeaders = new Headers(request.headers);
        fwdHeaders.delete("host");
        fwdHeaders.delete("x-target-worker");
        return fetch(dest, {
          method: "POST",
          headers: fwdHeaders,
          body: await request.text(),
        });
      }

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
          touchDevice(env.DB, deviceKey);
        }

        if (!customT3Base || !customT3Token) {
          return json({ error: "Missing T3 credentials. Provide a valid Device Key or T3 Base URL and Token in companion settings." }, 400);
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
        return json({ error: "Could not read T3 Usage. Check the T3 connection and credential." }, 502);
      }
    },
  };
}

export default createWorker();
