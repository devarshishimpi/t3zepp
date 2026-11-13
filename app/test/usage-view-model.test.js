import test from "node:test";
import assert from "node:assert/strict";

import { chartValues, formatMoney, formatTokens, summarizeUsage } from "../shared/usage-view-model.js";

test("summarizes all token classes, cost, savings, providers, models and periods", () => {
  const summary = summarizeUsage({
    fetchedAt: "2026-11-09T12:00:00.000Z",
    usage: {
      pricing: { status: "fresh", source: "catalog", knownModels: 1 },
      scanDurationMs: 875,
      sources: [{ status: "partial" }],
      buckets: [
        { provider: "codex", model: "gpt-test", day: "2026-11-08", costUsd: 1.25, cacheSavingsUsd: 0.3, fastCostUsd: 0.1, speedPremiumUsd: 0.02, costSource: "providerReported", categoryCostUsd: { input: 0.3, cacheRead: 0.1, cacheWrite: 0.2, output: 0.65 }, records: 2, sessions: 1, unpricedRecords: 0, totals: { uncachedInputTokens: 100, cachedInputTokens: 40, cacheCreationTokens: 10, outputTokens: 50, reasoningTokens: 20 } },
        { provider: "claude", model: "sonnet", day: "2026-11-09", costUsd: 0.75, cacheSavingsUsd: 0.1, costSource: "unpriced", records: 1, sessions: 1, unpricedRecords: 1, totals: { uncachedInputTokens: 30, cachedInputTokens: 0, cacheCreationTokens: 5, outputTokens: 25, reasoningTokens: 4 } },
      ],
    },
    providers: [{ driver: "codex", usageLimits: { windows: [{ id: "week", usedPercent: 50 }] } }],
    usageLimitSources: [{ id: "source", accounts: [] }],
  });
  assert.equal(summary.totals.tokens, 260);
  assert.equal(summary.totals.reasoningTokens, 24);
  assert.equal(summary.totals.cacheSavingsUsd, 0.4);
  assert.equal(summary.totals.fastCostUsd, 0.1);
  assert.equal(summary.totals.speedPremiumUsd, 0.02);
  assert.equal(summary.totals.categoryCostUsd.output, 0.65);
  assert.equal(summary.totals.costSources.providerReported, 2);
  assert.equal(summary.totals.costSources.unpriced, 1);
  assert.equal(summary.scanDurationMs, 875);
  assert.equal(summary.providers[0].label, "codex");
  assert.equal(summary.models.length, 2);
  assert.equal(summary.sources[0].status, "partial");
  assert.equal(summary.limits.providers[0].usageLimits.windows[0].usedPercent, 50);
  assert.deepEqual(chartValues(summary.periods, "tokens", 1), [60]);
});

test("formatters preserve meaningful precision for small cost and token values", () => {
  assert.equal(formatMoney(0.00004), "$0.00004");
  assert.equal(formatMoney(0.4), "$0.40");
  assert.equal(formatMoney(1234.5), "$1,234.50");
  assert.equal(formatMoney(-0.25), "-$0.25");
  assert.equal(formatMoney(Number.NaN), "-");
  assert.equal(formatTokens(1_250_000), "1.3M");
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(1234), "1,234");
});

test("pricing metadata has display-safe defaults when the T3 Code snapshot omits it", () => {
  const summary = summarizeUsage({ usage: { buckets: [] } });
  assert.deepEqual(summary.pricing, {
    status: "unavailable",
    source: "not reported",
    knownModels: 0,
  });
});

test("chart values preserve zero-usage days across the selected calendar range", () => {
  const values = chartValues([
    { period: "2026-11-08", costUsd: 3, tokens: 30 },
    { period: "2026-11-10", costUsd: 4, tokens: 40 },
  ], "cost", 90, "7d", "2026-11-10T12:00:00.000Z");
  assert.deepEqual(values, [0, 0, 0, 0, 3, 0, 4]);
});

test("24-hour chart includes each hour, including periods without usage", () => {
  const values = chartValues([
    { period: "2026-11-09T12:30:00.000Z", costUsd: 1, tokens: 10 },
    { period: "2026-11-10T11:30:00.000Z", costUsd: 2, tokens: 20 },
  ], "tokens", 90, "24h", "2026-11-10T12:30:00.000Z");
  assert.equal(values.length, 24);
  assert.equal(values[0], 10);
  assert.deepEqual(values.slice(1, -1), Array(22).fill(0));
  assert.equal(values.at(-1), 20);
});
