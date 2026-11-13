import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonBody } from "../shared/parse-json-body.js";

const json = JSON.stringify({ version: 2, model: "é🧪", ranges: { day: { total: 3 } } });
const expected = JSON.parse(json);

test("parses JSON text and already parsed objects", () => {
  assert.deepEqual(parseJsonBody(json), expected);
  assert.equal(parseJsonBody(expected), expected);
});

test("parses byte arrays and Zepp Buffer-shaped bodies", () => {
  const bytes = new TextEncoder().encode(json);
  assert.deepEqual(parseJsonBody(bytes.buffer), expected);
  assert.deepEqual(parseJsonBody(bytes), expected);
  assert.deepEqual(parseJsonBody({ type: "Buffer", data: [...bytes] }), expected);
  assert.deepEqual(parseJsonBody({ type: "Buffer", data: bytes }), expected);
  assert.deepEqual(parseJsonBody({ data: { data: bytes } }), expected);
});

test("parses a hex-encoded JSON body", () => {
  const hex = [...new TextEncoder().encode(json)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  assert.deepEqual(parseJsonBody(hex), expected);
  assert.deepEqual(parseJsonBody(` \r\n${hex}\n `), expected);
  assert.throws(() => parseJsonBody(new Uint8Array([0x7b, 0xff])));
  assert.throws(() => parseJsonBody(null), /Empty response body/);
  assert.throws(() => parseJsonBody(undefined), /Empty response body/);
});

test("preserves recognized payloads even when data property is present", () => {
  const errObj = { error: "Access Denied", data: null };
  assert.deepEqual(parseJsonBody(errObj), errObj);
  const snapObj = { version: 2, ranges: {}, data: null };
  assert.deepEqual(parseJsonBody(snapObj), snapObj);
});
