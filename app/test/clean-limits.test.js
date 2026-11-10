import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanLimitsForWatch } from "../shared/clean-limits.js";

test("cleans limits for watch by removing accounts and sources without windows", () => {
  const dirty = {
    providers: [
      { driver: "codex", displayName: "Codex", usageLimits: { windows: [{ id: "w1", usedPercent: 40 }] } },
      { driver: "empty", displayName: "Empty", usageLimits: { windows: [] } },
    ],
    sources: [
      {
        id: "s1",
        label: "Source 1",
        accounts: [
          { id: "a1", driver: "claude", displayName: "Claude 1", plan: "Team", usageLimits: { windows: [{ id: "w2", usedPercent: 10 }] } },
          { id: "a2", driver: "claude", displayName: "Claude 2", usageLimits: { windows: [] } },
        ],
      },
      {
        id: "s2",
        label: "Empty Source",
        accounts: [{ id: "a3", driver: "other", usageLimits: { windows: [] } }],
      },
    ],
  };

  const cleaned = cleanLimitsForWatch(dirty);
  assert.equal(cleaned.providers.length, 2);
  assert.equal(cleaned.providers[0].usageLimits.windows.length, 1);
  assert.equal(cleaned.providers[1].usageLimits, undefined);
  assert.equal(cleaned.sources.length, 1);
  assert.equal(cleaned.sources[0].id, "s1");
  assert.equal(cleaned.sources[0].accounts.length, 1);
  assert.equal(cleaned.sources[0].accounts[0].id, "a1");
});

test("handles null or undefined limits gracefully", () => {
  assert.equal(cleanLimitsForWatch(null), null);
  assert.equal(cleanLimitsForWatch(undefined), undefined);
  assert.deepEqual(cleanLimitsForWatch({}), { providers: [], sources: [] });
});
