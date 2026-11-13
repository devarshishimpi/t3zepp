import test from "node:test";
import assert from "node:assert/strict";

import { summarizeUsageRanges } from "../src/summarize.js";

const dailyWindow = {
  sinceDay: "2026-08-12",
  untilDay: "2026-11-09",
  timeZone: "UTC",
};

function bucket(day, provider, model, costUsd, outputTokens, hourStart) {
  return {
    day,
    ...(hourStart ? { hourStart } : {}),
    provider,
    model,
    costUsd,
    records: 1,
    sessions: 1,
    unpricedRecords: 0,
    totals: { uncachedInputTokens: outputTokens, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 0 },
  };
}

test("builds all four watch summaries and charts from one hourly and one daily snapshot", () => {
  const summary = summarizeUsageRanges({
    hourly: {
      usage: {
        ...dailyWindow,
        sinceDay: "2026-11-08",
        sinceTime: "2026-11-08T12:00:00.000Z",
        untilTime: "2026-11-09T12:00:00.000Z",
        buckets: [bucket("2026-11-09", "codex", "model-a", 2, 300, "2026-11-09T11:00:00.000Z")],
      },
    },
    daily: {
      usage: {
        ...dailyWindow,
        buckets: [
          bucket("2026-08-12", "old", "old-model", 1, 10),
          bucket("2026-10-11", "claude", "model-b", 3, 200),
          bucket("2026-11-03", "codex", "model-a", 4, 400),
          bucket("2026-11-09", "codex", "model-a", 5, 500),
        ],
      },
    },
    providers: [{ driver: "codex", displayName: "Codex", usageLimits: { windows: [] } }],
  });

  assert.equal(summary.version, 2);
  assert.deepEqual(Object.keys(summary.ranges), ["24h", "7d", "30d", "90d"]);
  assert.equal(summary.ranges["24h"].totals.costUsd, 2);
  assert.equal(summary.ranges["24h"].totals.tokens, 300);
  assert.equal(summary.ranges["7d"].totals.costUsd, 9);
  assert.equal(summary.ranges["30d"].totals.costUsd, 12);
  assert.equal(summary.ranges["90d"].totals.costUsd, 13);
  assert.equal(summary.ranges["30d"].modelsByCost[0].provider, "codex");
  assert.equal(summary.ranges["30d"].modelsByCost[0].label, "model-a");
  assert.equal(summary.ranges["30d"].charts.cost.series[0].provider, "codex");
  assert.equal(summary.ranges["24h"].charts.cost.series[0].values.length, 24);
  assert.equal(summary.ranges["90d"].charts.cost.series[0].values.length, 90);
  assert.equal(summary.limits.providers[0].displayName, "Codex");
  assert.equal(JSON.stringify(summary).includes("old-model"), true);
  assert.equal(JSON.stringify(summary.ranges["7d"]).includes("old-model"), false);
});

test("keeps the all-ranges payload bounded for a dense 90-day snapshot", () => {
  const buckets = [];
  const start = Date.parse("2026-08-12T00:00:00.000Z");
  for (let day = 0; day < 90; day += 1) {
    const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
    for (let provider = 0; provider < 12; provider += 1) {
      for (let model = 0; model < 4; model += 1) {
        buckets.push(bucket(date, `provider-${provider}`, `model-${model}`, 0.0123, 1234));
      }
    }
  }
  const result = summarizeUsageRanges({
    hourly: { usage: { ...dailyWindow, sinceTime: "2026-11-08T12:00:00.000Z", untilTime: "2026-11-09T12:00:00.000Z", buckets: [] } },
    daily: { usage: { ...dailyWindow, buckets } },
  });
  const encoder = new TextEncoder();
  const responseBytes = encoder.encode(JSON.stringify(result)).byteLength;
  const rawBytes = encoder.encode(JSON.stringify({ buckets })).byteLength;
  assert.ok(responseBytes < 64_000);
  assert.ok(responseBytes < rawBytes / 5, `${responseBytes} bytes should be substantially smaller than ${rawBytes} raw bytes`);
});
