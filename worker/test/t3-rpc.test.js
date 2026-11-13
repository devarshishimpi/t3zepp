import test from "node:test";
import assert from "node:assert/strict";

import { readT3Usage } from "../src/t3-rpc.js";

class FakeSocket extends EventTarget {
  sent = [];

  accept() {}

  send(raw) {
    const request = JSON.parse(raw);
    this.sent.push(request);
    queueMicrotask(() => {
      if (request._tag === "Request" && request.tag === "server.getUsageSummary") {
        this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ _tag: "Exit", requestId: request.id, exit: { _tag: "Success", value: { buckets: [] } } }),
        }));
      } else if (request._tag === "Request" && request.tag === "subscribeServerConfig") {
        this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ _tag: "Chunk", requestId: request.id, values: [{ type: "snapshot", config: { providers: [], usageLimitSources: [] } }] }),
        }));
      }
    });
  }

  close() {}
}

test("reads only Usage summary and provider configuration through a ticketed T3 socket", async () => {
  const socket = new FakeSocket();
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.pathname === "/api/auth/websocket-ticket/rpc") {
      assert.equal(init.headers.authorization, "Bearer scoped-token");
      return Response.json({ ticket: "short-lived-ticket" });
    }
    assert.equal(url.protocol, "https:");
    assert.equal(url.pathname, "/ws");
    assert.equal(url.searchParams.get("wsTicket"), "short-lived-ticket");
    assert.equal(url.searchParams.get("orchestrationProtocol"), "2");
    return { webSocket: socket, status: 101 };
  };

  const result = await readT3Usage({
    base: "https://t3.example.test",
    accessToken: "scoped-token",
    usageInput: { sinceDay: "2026-11-01", untilDay: "2026-11-09" },
    fetchImpl,
  });

  assert.deepEqual(result, { usage: { buckets: [] }, providers: [], usageLimitSources: [] });
  assert.equal(calls.length, 2);
  assert.deepEqual(socket.sent.filter(({ _tag }) => _tag === "Request").map(({ tag }) => tag).sort(), [
    "server.getUsageSummary",
    "subscribeServerConfig",
  ]);
  assert.deepEqual(
    socket.sent.find(({ _tag, tag }) => _tag === "Request" && tag === "subscribeServerConfig").payload,
    { usageLimitSources: true, workspaceSnapshotsOnDemand: true, providerCatalogsOnDemand: true },
  );
  assert.ok(socket.sent.some(({ _tag, requestId }) => _tag === "Ack" && requestId === "zepp-config"));
  assert.ok(socket.sent.some(({ _tag, requestId }) => _tag === "Interrupt" && requestId === "zepp-config"));
});

test("reads hourly and daily Usage in parallel over one ticketed socket", async () => {
  const socket = new FakeSocket();
  let ticketRequests = 0;
  let socketRequests = 0;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/api/auth/websocket-ticket/rpc") {
      ticketRequests += 1;
      return Response.json({ ticket: "short-lived-ticket" });
    }
    socketRequests += 1;
    return { webSocket: socket, status: 101 };
  };

  const result = await readT3Usage({
    base: "https://t3.example.test",
    accessToken: "scoped-token",
    usageInputs: {
      hourly: { resolution: "hour" },
      daily: { resolution: "day" },
    },
    fetchImpl,
  });

  assert.deepEqual(result.usages, {
    hourly: { buckets: [] },
    daily: { buckets: [] },
  });
  assert.equal(ticketRequests, 1);
  assert.equal(socketRequests, 1);
  assert.deepEqual(socket.sent.filter(({ tag }) => tag === "server.getUsageSummary").map(({ id, payload }) => ({ id, payload })), [
    { id: "zepp-usage-hourly", payload: { resolution: "hour" } },
    { id: "zepp-usage-daily", payload: { resolution: "day" } },
  ]);
});

test("rejects T3 base paths so configured origins cannot change the RPC route", async () => {
  await assert.rejects(() => readT3Usage({
    base: "https://t3.example.test/unexpected",
    accessToken: "scoped-token",
    usageInput: {},
    fetchImpl: async () => { throw new Error("fetch must not run"); },
  }), /public HTTPS origin/);
});

test("does not expose low-level ticket or WebSocket fetch errors", async () => {
  await assert.rejects(() => readT3Usage({
    base: "https://t3.example.test",
    accessToken: "scoped-token",
    usageInput: {},
    fetchImpl: async () => { throw new Error("authorization=private-value"); },
  }), /T3 ticket request failed/);

  await assert.rejects(() => readT3Usage({
    base: "https://t3.example.test",
    accessToken: "scoped-token",
    usageInput: {},
    fetchImpl: async (input) => {
      if (new URL(input).pathname === "/api/auth/websocket-ticket/rpc") {
        return Response.json({ ticket: "short-lived-ticket" });
      }
      throw new Error("wsTicket=private-value");
    },
  }), /T3 WebSocket request failed/);
});
