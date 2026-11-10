import test from "node:test";
import assert from "node:assert/strict";

import { compactUsageSnapshot } from "../src/compact.js";

test("keeps watch Usage fields and limits while omitting bulky and private metadata", () => {
  const safe = compactUsageSnapshot({
    usage: {
      contractVersion: 6,
      readAt: "2026-11-09T12:00:00Z",
      timeZone: "UTC",
      sinceDay: "2026-11-03",
      untilDay: "2026-11-09",
      buckets: [{
        day: "2026-11-09", provider: "codex", model: "gpt-test", sourcePath: "C:/private/transcripts",
        totals: { uncachedInputTokens: 2, cachedInputTokens: 3, cacheCreationTokens: 4, outputTokens: 5, reasoningTokens: 1 },
        costUsd: 1, cacheSavingsUsd: 0.1, fastCostUsd: 0.2, ultrafastCostUsd: 0.3, speedPremiumUsd: 0.05,
        categoryCostUsd: { input: 0.1, cacheRead: 0.2, cacheWrite: 0.3, output: 0.4 }, records: 4, sessions: 1, unpricedRecords: 0,
      }],
      sources: [{
        fingerprint: { provider: "codex", hostId: "private-host", resolvedHomePath: "C:/Users/private", volumeId: "disk-id" },
        status: "ok", scannedFiles: 5, skippedFiles: 0, malformedRecords: 0, distinctSessions: 1,
        message: "private path detail",
      }],
      pricing: { status: "fresh", source: "catalog", knownModels: 1 },
    },
    providers: [{
      driver: "codex", displayName: "Codex", credentials: { apiKey: "provider-secret" },
      usageLimits: {
        checkedAt: "2026-11-09T12:00:00Z", credentialFingerprint: "fingerprint-secret",
        windows: [{ id: "week", kind: "weekly", label: "Weekly", usedPercent: 30, resetsAt: "2026-11-10T00:00:00Z" }],
        resetCredits: { availableCount: 2, nextCreditId: "credit-secret" },
        externalUsage: { label: "Usage", url: "https://provider.example/usage?token=private" },
      },
    }],
    usageLimitSources: [{
      id: "cliproxy", kind: "cliproxy", label: "CLI Proxy", checkedAt: "2026-11-09T12:00:00Z",
      accounts: [{
        id: "account-id", driver: "codex", email: "private@example.com", plan: "Pro", workspaceId: "workspace-id",
        usageLimits: { checkedAt: "2026-11-09T12:00:00Z", windows: [], resetCredits: { availableCount: 1, nextCreditId: "credit-secret" } },
      }],
    }],
  });

  const json = JSON.stringify(safe);
  assert.match(json, /"costUsd":1/);
  assert.match(json, /"outputTokens":5/);
  assert.equal(json.includes("speedPremiumUsd"), false);
  assert.equal(json.includes("categoryCostUsd"), false);
  assert.equal(json.includes("scannedFiles"), false);
  assert.match(json, /"availableCount":2/);
  for (const privateValue of ["private-host", "C:/Users/private", "disk-id", "private path detail", "provider-secret", "fingerprint-secret", "credit-secret", "private@example.com", "workspace-id", "token=private"]) {
    assert.equal(json.includes(privateValue), false, `unexpected private value: ${privateValue}`);
  }
  assert.equal(safe.providers[0].usageLimits.externalUsage.url, "https://provider.example");
});
