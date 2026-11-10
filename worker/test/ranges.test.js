import test from "node:test";
import assert from "node:assert/strict";

import { makeUsageInput } from "../src/ranges.js";

test("24h uses hourly resolution and a precise one-day window", () => {
  const now = new Date("2026-11-09T12:30:00.000Z");
  assert.deepEqual(makeUsageInput("24h", now), {
    sinceDay: "2026-11-08",
    untilDay: "2026-11-09",
    sinceTime: "2026-11-08T12:30:00.000Z",
    untilTime: "2026-11-09T12:30:00.000Z",
    resolution: "hour",
    timeZone: "UTC",
    awaitRefresh: false,
  });
});

test("calendar ranges include the current UTC day", () => {
  const result = makeUsageInput("7d", new Date("2026-03-01T00:15:00.000Z"), "America/New_York");
  assert.equal(result.sinceDay, "2026-02-22");
  assert.equal(result.untilDay, "2026-02-28");
  assert.equal(result.timeZone, "America/New_York");
  assert.equal(result.resolution, "day");
});

test("rejects unknown ranges and invalid time zones", () => {
  assert.throws(() => makeUsageInput("all"));
  assert.throws(() => makeUsageInput("toString"));
  assert.throws(() => makeUsageInput("7d", new Date(), "Not/AZone"));
});
