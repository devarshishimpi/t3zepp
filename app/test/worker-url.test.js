import assert from "node:assert/strict";
import { test } from "node:test";
import { endpointUrl } from "../shared/worker-url.js";

test("normalizes a Worker origin and endpoint", () => {
  assert.equal(endpointUrl("https://example.workers.dev"), "https://example.workers.dev/v1/usage");
  assert.equal(endpointUrl("https://example.workers.dev/v1/usage/"), "https://example.workers.dev/v1/usage");
});

test("rejects invalid protocols, hosts, ports, and paths", () => {
  for (const value of [
    "http://example.workers.dev",
    "https://bad_host.example",
    "https://example.workers.dev:99999",
    "https://example.workers.dev/not-usage",
    "https://example.workers.dev/?token=secret",
  ]) {
    assert.throws(() => endpointUrl(value));
  }
});
