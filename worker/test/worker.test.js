import test from "node:test";
import assert from "node:assert/strict";

import { createWorker } from "../src/index.js";

const validT3 = {
  t3BaseUrl: "https://t3.example.test",
  t3AccessToken: "scoped-t3-session-token",
};

const request = (body = {}, method = "POST", path = "/v1/usage") =>
  new Request(`https://worker.example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

const mockStaticAssets = {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const pages = {
      "/": "<!doctype html><title>T3 Zepp landing</title>",
      "/install": "<!doctype html><title>Install T3 Zepp</title>",
      "/pair": "<!doctype html><title>T3 Zepp Pairing</title>",
    };
    const html = pages[path];
    return new Response(html ?? "Not found", {
      status: html ? 200 : 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};

test("serves static pages through Assets and health check on /health", async () => {
  const worker = createWorker();
  const env = { ASSETS: mockStaticAssets };
  const root = await worker.fetch(request({}, "GET", "/"), env);
  assert.equal(root.status, 200);
  assert.equal(root.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await root.text();
  assert.match(html, /T3 Zepp landing/);

  const install = await worker.fetch(request({}, "GET", "/install"), env);
  assert.match(await install.text(), /Install T3 Zepp/);

  const health = await worker.fetch(request({}, "GET", "/health"), env);
  assert.deepEqual(await health.json(), { ok: true });

  const missingCreds = await worker.fetch(request({ range: "7d" }), env);
  assert.equal(missingCreds.status, 400);
  assert.equal(missingCreds.headers.get("cache-control"), "no-store");

  const missingApiRoute = await worker.fetch(request({}, "GET", "/api/not-found"), env);
  assert.equal(missingApiRoute.status, 404);
  assert.deepEqual(await missingApiRoute.json(), { error: "Not found" });
});

test("routes only validated range requests through the custom T3 configuration", async () => {
  const calls = [];
  const worker = createWorker({
    clock: () => new Date("2026-11-09T12:00:00.000Z"),
    readUsage: async (input) => {
      calls.push(input);
      const usage = (usageInput) => ({
        buckets: [],
        sinceDay: usageInput.sinceDay,
        untilDay: usageInput.untilDay,
        timeZone: usageInput.timeZone,
      });
      return {
        usages: { hourly: usage(input.usageInputs.hourly), daily: usage(input.usageInputs.daily) },
        providers: [],
        usageLimitSources: [],
      };
    },
  });
  const response = await worker.fetch(request({ ...validT3, range: "30d", timeZone: "UTC", base: "https://evil.test" }), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, no-transform");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].base, validT3.t3BaseUrl);
  assert.equal(calls[0].accessToken, validT3.t3AccessToken);
  assert.equal(calls[0].usageInputs.daily.sinceDay, "2026-08-12");
  assert.equal(calls[0].usageInputs.hourly.resolution, "hour");
  const body = await response.json();
  assert.equal(body.version, 2);
  assert.deepEqual(Object.keys(body.ranges), ["24h", "7d", "30d", "90d"]);
  assert.deepEqual(body.ranges["30d"].window, {
    sinceDay: "2026-10-11",
    untilDay: "2026-11-09",
    resolution: "day",
    timeZone: "UTC",
  });
  assert.deepEqual(body.ranges["24h"].window, {
    sinceDay: "2026-11-08",
    untilDay: "2026-11-09",
    sinceTime: "2026-11-08T12:00:00.000Z",
    untilTime: "2026-11-09T12:00:00.000Z",
    resolution: "hour",
    timeZone: "UTC",
  });
  assert.equal(calls.length, 1);
});

test("ignores request-controlled worker forwarding headers", async () => {
  const calls = [];
  const worker = createWorker({
    readUsage: async (input) => {
      calls.push(input);
      return {
        usages: {
          hourly: { buckets: [], sinceDay: "2026-11-08", untilDay: "2026-11-09", timeZone: "UTC" },
          daily: { buckets: [], sinceDay: "2026-08-12", untilDay: "2026-11-09", timeZone: "UTC" },
        },
        providers: [],
        usageLimitSources: [],
      };
    },
  });
  const forwarded = new Request("https://worker.example.test/v1/usage", {
    method: "POST",
    headers: { "content-type": "application/json", "x-target-worker": "https://attacker.example.test" },
    body: JSON.stringify(validT3),
  });
  const response = await worker.fetch(forwarded, {});
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].base, validT3.t3BaseUrl);
});

test("rejects unknown routes, methods, ranges, oversized bodies, and missing credentials", async () => {
  const worker = createWorker();
  assert.equal((await worker.fetch(request({}, "POST", "/proxy"), {})).status, 404);
  assert.equal((await worker.fetch(request({}, "GET"), {})).status, 405);
  assert.equal((await worker.fetch(request({ ...validT3, range: "all" }), {})).status, 400);
  assert.equal((await worker.fetch(request({ ...validT3, range: "toString" }), {})).status, 400);
  const invalidZone = await worker.fetch(request({ ...validT3, range: "7d", timeZone: "Not/AZone" }), {});
  assert.equal(invalidZone.status, 400);
  const oversized = new Request("https://worker.example.test/v1/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validT3, range: "7d", padding: "x".repeat(5000) }),
  });
  assert.equal((await worker.fetch(oversized, {})).status, 400);
  const malformed = new Request("https://worker.example.test/v1/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid json",
  });
  assert.equal((await worker.fetch(malformed, {})).status, 400);
  assert.equal((await worker.fetch(request({ range: "7d" }), {})).status, 400);
});

test("does not return tokens or echo upstream exceptions", async () => {
  const worker = createWorker({ readUsage: async () => { throw new Error("token=secret-session-value"); } });
  const originalError = console.error;
  const logged = [];
  console.error = (message) => logged.push(message);
  try {
    const response = await worker.fetch(request({ ...validT3, range: "7d" }), {});
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /secret-session-value/);
    assert.doesNotMatch(logged.join("\n"), /secret-session-value|token=/);
    const log = JSON.parse(logged[0]);
    assert.equal(log.event, "t3_usage_upstream_failed");
    assert.equal(log.stage, "upstream_failed");
    assert.equal(log.type, "error");
    assert.equal(Number.isFinite(log.upstreamMs), true);
    assert.equal(Number.isFinite(log.totalMs), true);
  } finally {
    console.error = originalError;
  }
});

test("supports public proxy mode with custom T3 credentials in body, headers, and key", async () => {
  const calls = [];
  const worker = createWorker({
    clock: () => new Date("2026-11-09T12:00:00.000Z"),
    readUsage: async (input) => {
      calls.push(input);
      const usage = (usageInput) => ({
        buckets: [],
        sinceDay: usageInput.sinceDay,
        untilDay: usageInput.untilDay,
        timeZone: usageInput.timeZone,
      });
      return {
        usages: { hourly: usage(input.usageInputs.hourly), daily: usage(input.usageInputs.daily) },
        providers: [],
        usageLimitSources: [],
      };
    },
  });

  // 1. Credentials in JSON body (no worker key, empty env)
  const bodyReq = new Request("https://t3zepp.devarshi.dev/v1/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      range: "7d",
      t3BaseUrl: "https://custom-tunnel.loca.lt",
      t3AccessToken: "user-session-token-123",
    }),
  });
  const bodyResp = await worker.fetch(bodyReq, {});
  assert.equal(bodyResp.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].base, "https://custom-tunnel.loca.lt");
  assert.equal(calls[0].accessToken, "user-session-token-123");

  // 2. Credentials in headers (no worker key, empty env)
  const headerReq = new Request("https://t3zepp.devarshi.dev/v1/usage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-t3-base-url": "https://header-tunnel.example.com",
      "x-t3-access-token": "header-token-456",
    },
    body: JSON.stringify({ range: "24h" }),
  });
  const headerResp = await worker.fetch(headerReq, {});
  assert.equal(headerResp.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].base, "https://header-tunnel.example.com");
  assert.equal(calls[1].accessToken, "header-token-456");

  // 3. Credentials encoded in Bearer key (url#token)
  const keyReq = new Request("https://t3zepp.devarshi.dev/v1/usage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer https://key-tunnel.example.com#key-token-789",
    },
    body: JSON.stringify({ range: "30d" }),
  });
  const keyResp = await worker.fetch(keyReq, {});
  assert.equal(keyResp.status, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].base, "https://key-tunnel.example.com");
  assert.equal(calls[2].accessToken, "key-token-789");
});

test("serves /pair and handles D1 deviceKey pairing and usage flow", async () => {
  const devices = new Map();
  const sessions = new Map();
  const rateLimits = new Map();

  const mockDb = {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          if (sql.includes("INSERT INTO pairing_rate_limits")) {
            const attempts = (rateLimits.get(bound[0]) || 0) + 1;
            rateLimits.set(bound[0], attempts);
            return { attempts };
          }
          if (sql.includes("UPDATE pairing_sessions SET claimed = 1")) {
            const session = sessions.get(bound[0]);
            if (session && session.claimed === 0 && session.expires_at > bound[1]) {
              session.claimed = 1;
              return { device_key: session.device_key };
            }
            return null;
          }
          if (sql.includes("FROM devices WHERE device_key = ?")) {
            return devices.get(bound[0]) || null;
          }
          if (sql.includes("FROM pairing_sessions WHERE pairing_code = ?")) {
            return sessions.get(bound[0]) || null;
          }
          return null;
        },
        async run() {
          if (sql.includes("UPDATE devices SET last_used_at = ?")) {
            const d = devices.get(bound[1]);
            if (d) {
              d.last_used_at = bound[0];
              d.request_count = (d.request_count || 0) + 1;
            }
          }
          if (sql.includes("UPDATE devices SET t3_base_url = ?")) {
            const d = devices.get(bound[2]);
            if (d) {
              d.t3_base_url = bound[0];
              d.t3_access_token = bound[1];
            }
          }
          if (sql.includes("DELETE FROM devices")) {
            devices.delete(bound[0]);
          }
          return { success: true };
        },
      };
    },
    async batch(statements) {
      const [devStmt, sessStmt] = statements;
      devices.set(devStmt._bound[0], {
        device_key: devStmt._bound[0],
        t3_base_url: devStmt._bound[1],
        t3_access_token: devStmt._bound[2],
        label: devStmt._bound[3],
        created_at: devStmt._bound[4],
        last_used_at: devStmt._bound[5],
        request_count: devStmt._bound[6],
      });
      sessions.set(sessStmt._bound[0], {
        pairing_code: sessStmt._bound[0],
        device_key: sessStmt._bound[1],
        expires_at: sessStmt._bound[2],
        claimed: 0,
        created_at: sessStmt._bound[3],
      });
      return [];
    },
  };

  const origPrepare = mockDb.prepare.bind(mockDb);
  mockDb.prepare = (sql) => {
    const p = origPrepare(sql);
    const origBind = p.bind.bind(p);
    p.bind = (...args) => {
      p._bound = args;
      return origBind(...args);
    };
    return p;
  };

  const calls = [];
  const worker = createWorker({
    clock: () => new Date("2026-11-09T12:00:00.000Z"),
    readUsage: async (input) => {
      calls.push(input);
      return {
        usages: {
          hourly: { buckets: [], sinceDay: "2026-11-08", untilDay: "2026-11-09", timeZone: "UTC" },
          daily: { buckets: [], sinceDay: "2026-08-12", untilDay: "2026-11-09", timeZone: "UTC" },
        },
        providers: [],
        usageLimitSources: [],
      };
    },
  });

  const env = { DB: mockDb, ASSETS: mockStaticAssets };

  // 1. GET /pair returns HTML
  const pairPage = await worker.fetch(new Request("https://t3zepp.devarshi.dev/pair"), env);
  assert.equal(pairPage.status, 200);
  assert.match(await pairPage.text(), /T3 Zepp Pairing/);

  // 2. POST /api/pair/init
  const initReq = new Request("https://t3zepp.devarshi.dev/api/pair/init", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" },
    body: JSON.stringify({
      t3BaseUrl: "https://d1-tunnel.example.com",
      t3AccessToken: "d1-token-999",
      label: "My Watch",
    }),
  });
  const initResp = await worker.fetch(initReq, env);
  assert.equal(initResp.status, 200);
  const initData = await initResp.json();
  assert.match(initData.deviceKey, /^tz_live_/);
  assert.match(initData.pairingCode, /^\d{6}$/);

  for (let attempt = 2; attempt <= 5; attempt++) {
    const allowed = await worker.fetch(new Request("https://t3zepp.devarshi.dev/api/pair/init", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" },
      body: JSON.stringify({
        t3BaseUrl: "https://d1-tunnel.example.com",
        t3AccessToken: "d1-token-999",
        label: "My Watch",
      }),
    }), env);
    assert.equal(allowed.status, 200, `attempt ${attempt} should be allowed`);
  }
  const limited = await worker.fetch(new Request("https://t3zepp.devarshi.dev/api/pair/init", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" },
    body: JSON.stringify({
      t3BaseUrl: "https://d1-tunnel.example.com",
      t3AccessToken: "d1-token-999",
      label: "My Watch",
    }),
  }), env);
  assert.equal(limited.status, 429);

  // 3. POST /api/pair/claim
  const claimReq = new Request("https://t3zepp.devarshi.dev/api/pair/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairingCode: initData.pairingCode }),
  });
  const claimResp = await worker.fetch(claimReq, env);
  assert.equal(claimResp.status, 200);
  const claimData = await claimResp.json();
  assert.equal(claimData.deviceKey, initData.deviceKey);

  // 4. POST /v1/usage with deviceKey in Bearer header
  const usageReq = new Request("https://t3zepp.devarshi.dev/v1/usage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${initData.deviceKey}`,
    },
    body: JSON.stringify({ range: "24h" }),
  });
  const usageResp = await worker.fetch(usageReq, env);
  assert.equal(usageResp.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].base, "https://d1-tunnel.example.com");
  assert.equal(calls[0].accessToken, "d1-token-999");

  // 5. POST /api/device/update
  const updateReq = new Request("https://t3zepp.devarshi.dev/api/device/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceKey: initData.deviceKey,
      t3BaseUrl: "https://new-d1-tunnel.example.com",
    }),
  });
  const updateResp = await worker.fetch(updateReq, env);
  assert.equal(updateResp.status, 200);

  // 6. POST /v1/usage now uses updated URL
  const usageReq2 = new Request("https://t3zepp.devarshi.dev/v1/usage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${initData.deviceKey}`,
    },
    body: JSON.stringify({ range: "7d" }),
  });
  const usageResp2 = await worker.fetch(usageReq2, env);
  assert.equal(usageResp2.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].base, "https://new-d1-tunnel.example.com");

  // 7. Revoke deviceKey
  const revokeReq = new Request("https://t3zepp.devarshi.dev/api/device/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceKey: initData.deviceKey }),
  });
  assert.equal((await worker.fetch(revokeReq, env)).status, 200);

  // Now usage with revoked key fails with 401
  const usageReq3 = new Request("https://t3zepp.devarshi.dev/v1/usage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${initData.deviceKey}`,
    },
    body: JSON.stringify({ range: "7d" }),
  });
  assert.equal((await worker.fetch(usageReq3, env)).status, 401);
});
