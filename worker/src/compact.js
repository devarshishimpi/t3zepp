function compactLimits(limits) {
  if (!limits || typeof limits !== "object") return undefined;
  const result = {
    checkedAt: limits.checkedAt,
    windows: Array.isArray(limits.windows)
      ? limits.windows.map(({ id, kind, label, usedPercent, resetsAt, windowDurationMins }) => ({
        id, kind, label, usedPercent, resetsAt, windowDurationMins,
      }))
      : [],
  };
  if (limits.resetCredits) {
    result.resetCredits = {
      availableCount: limits.resetCredits.availableCount,
      nextExpiresAt: limits.resetCredits.nextExpiresAt,
    };
  }
  if (limits.externalUsage) {
    try {
      const url = new URL(limits.externalUsage.url);
      if (url.protocol === "https:") result.externalUsage = { label: limits.externalUsage.label, url: url.origin };
    } catch {
      // Omit malformed external links from the watch payload.
    }
  }
  if (limits.unavailable) result.unavailable = { reason: limits.unavailable.reason };
  return result;
}

function compactProvider(provider) {
  return {
    driver: provider.driver,
    displayName: provider.displayName,
    usageLimits: compactLimits(provider.usageLimits),
  };
}

function compactLimitSource(source) {
  return {
    id: source.id,
    label: source.label,
    error: source.error ? "Source unavailable" : undefined,
    accounts: (source.accounts || []).map((account) => ({
      id: account.id,
      driver: account.driver,
      plan: account.plan,
      displayName: account.displayName,
      label: account.label,
      usageLimits: compactLimits(account.usageLimits),
    })),
  };
}

export function compactUsageSnapshot(data) {
  const usage = data?.usage;
  if (!usage || !Array.isArray(usage.buckets)) throw new Error("T3 returned an incomplete Usage snapshot");
  return {
    usage: {
      contractVersion: usage.contractVersion,
      readAt: usage.readAt,
      timeZone: usage.timeZone,
      sinceDay: usage.sinceDay,
      untilDay: usage.untilDay,
      buckets: usage.buckets.map((bucket) => ({
        day: bucket.day,
        hourStart: bucket.hourStart,
        provider: bucket.provider,
        model: bucket.model,
        totals: {
          uncachedInputTokens: bucket.totals?.uncachedInputTokens,
          cachedInputTokens: bucket.totals?.cachedInputTokens,
          cacheCreationTokens: bucket.totals?.cacheCreationTokens,
          outputTokens: bucket.totals?.outputTokens,
          reasoningTokens: bucket.totals?.reasoningTokens,
        },
        costUsd: bucket.costUsd,
        costSource: bucket.costSource,
        records: bucket.records,
        sessions: bucket.sessions,
        unpricedRecords: bucket.unpricedRecords,
      })),
    },
    providers: (data.providers || []).map(compactProvider),
    usageLimitSources: (data.usageLimitSources || []).map(compactLimitSource),
  };
}
