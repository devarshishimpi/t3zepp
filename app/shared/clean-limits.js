export function cleanLimitsForWatch(limits) {
  if (!limits || typeof limits !== "object") return limits;
  const providers = (limits.providers || []).map((p) => ({
    driver: p.driver,
    displayName: p.displayName,
    usageLimits: p.usageLimits?.windows?.length ? { windows: p.usageLimits.windows } : undefined,
  }));
  const sources = (limits.sources || [])
    .map((s) => ({
      id: s.id,
      label: s.label,
      accounts: (s.accounts || [])
        .filter((acc) => acc.usageLimits?.windows?.length > 0)
        .map((acc) => ({
          id: acc.id,
          driver: acc.driver,
          plan: acc.plan,
          displayName: acc.displayName,
          label: acc.label,
          usageLimits: { windows: acc.usageLimits.windows },
        })),
    }))
    .filter((s) => s.accounts.length > 0);
  return { providers, sources };
}
