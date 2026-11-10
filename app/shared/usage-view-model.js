export const RANGE_ORDER = Object.freeze(["24h", "7d", "30d", "90d"]);

export function bucketTokens(bucket) {
  const totals = bucket?.totals ?? {};
  return [
    totals.uncachedInputTokens,
    totals.cachedInputTokens,
    totals.cacheCreationTokens,
    totals.outputTokens,
  ].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

export function summarizeUsage(payload, { includeModels = true } = {}) {
  const buckets = Array.isArray(payload?.usage?.buckets) ? payload.usage.buckets : [];
  const totals = {
    costUsd: 0,
    cacheSavingsUsd: 0,
    fastCostUsd: 0,
    ultrafastCostUsd: 0,
    speedPremiumUsd: 0,
    categoryCostUsd: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    uncachedInputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    records: 0,
    sessions: 0,
    unpricedRecords: 0,
    costSources: { providerReported: 0, modelPriced: 0, unpriced: 0 },
  };
  const providers = new Map();
  const models = includeModels ? new Map() : null;
  const periods = new Map();

  for (const bucket of buckets) {
    const cost = Number.isFinite(bucket.costUsd) ? bucket.costUsd : 0;
    totals.costUsd += cost;
    totals.cacheSavingsUsd += Number.isFinite(bucket.cacheSavingsUsd) ? bucket.cacheSavingsUsd : 0;
    totals.fastCostUsd += Number.isFinite(bucket.fastCostUsd) ? bucket.fastCostUsd : 0;
    totals.ultrafastCostUsd += Number.isFinite(bucket.ultrafastCostUsd) ? bucket.ultrafastCostUsd : 0;
    totals.speedPremiumUsd += Number.isFinite(bucket.speedPremiumUsd) ? bucket.speedPremiumUsd : 0;
    totals.records += Number.isFinite(bucket.records) ? bucket.records : 0;
    totals.sessions += Number.isFinite(bucket.sessions) ? bucket.sessions : 0;
    totals.unpricedRecords += Number.isFinite(bucket.unpricedRecords) ? bucket.unpricedRecords : 0;
    if (Object.prototype.hasOwnProperty.call(totals.costSources, bucket.costSource)) {
      totals.costSources[bucket.costSource] += Number.isFinite(bucket.records) ? bucket.records : 0;
    }
    for (const category of ["input", "cacheRead", "cacheWrite", "output"]) {
      const categoryCost = Number(bucket.categoryCostUsd?.[category]);
      if (Number.isFinite(categoryCost)) totals.categoryCostUsd[category] += categoryCost;
    }
    for (const key of ["uncachedInputTokens", "cachedInputTokens", "cacheCreationTokens", "outputTokens", "reasoningTokens"]) {
      const value = Number(bucket.totals?.[key]);
      if (Number.isFinite(value)) totals[key] += value;
    }
    const providerId = String(bucket.provider ?? "unknown");
    const modelName = String(bucket.model ?? "unknown");
    addGroup(providers, providerId, bucket, cost);
    if (models) addGroup(models, `${providerId}\u0000${modelName}`, bucket, cost, { provider: providerId, model: modelName });
    const period = bucket.hourStart ?? bucket.day ?? "unknown";
    const current = periods.get(period) ?? { period, costUsd: 0, tokens: 0, records: 0, providerValues: {} };
    current.costUsd += cost;
    current.tokens += bucketTokens(bucket);
    current.records += Number.isFinite(bucket.records) ? bucket.records : 0;
    const value = current.providerValues[providerId] ?? { costUsd: 0, tokens: 0 };
    value.costUsd += cost;
    value.tokens += bucketTokens(bucket);
    current.providerValues[providerId] = value;
    periods.set(period, current);
  }

  const providerRows = [...providers.values()].sort(byCost).map((item) => ({
    ...item,
    sharePercent: totals.costUsd > 0 ? Math.round((item.costUsd / totals.costUsd) * 100) : 0,
    tokenSharePercent: bucketTokens({ totals }) > 0 ? Math.round((item.tokens / bucketTokens({ totals })) * 100) : 0,
  }));
  const modelRows = models ? [...models.values()].sort(byCost) : [];
  return {
    totals: { ...totals, tokens: bucketTokens({ totals }) },
    providers: providerRows,
    models: modelRows,
    periods: [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)),
    sources: Array.isArray(payload?.usage?.sources) ? payload.usage.sources : [],
    pricing: {
      status: payload?.usage?.pricing?.status ?? "unavailable",
      source: payload?.usage?.pricing?.source ?? "not reported",
      knownModels: Number.isFinite(payload?.usage?.pricing?.knownModels) ? payload.usage.pricing.knownModels : 0,
    },
    window: payload?.window ?? null,
    limits: {
      providers: Array.isArray(payload?.providers) ? payload.providers : [],
      sources: Array.isArray(payload?.usageLimitSources) ? payload.usageLimitSources : [],
    },
    fetchedAt: payload?.fetchedAt ?? payload?.usage?.readAt ?? null,
    scanDurationMs: Number.isFinite(payload?.usage?.scanDurationMs) ? payload.usage.scanDurationMs : 0,
    stale: payload?.stale === true,
  };
}

function addGroup(map, key, bucket, cost, labels = {}) {
  const current = map.get(key) ?? {
    id: key,
    label: labels.model ?? bucket.provider ?? "Unknown provider",
    ...(labels.provider ? { provider: labels.provider } : {}),
    costUsd: 0,
    tokens: 0,
    records: 0,
    unpricedRecords: 0,
  };
  current.costUsd += cost;
  current.tokens += bucketTokens(bucket);
  current.records += Number.isFinite(bucket.records) ? bucket.records : 0;
  current.unpricedRecords += Number.isFinite(bucket.unpricedRecords) ? bucket.unpricedRecords : 0;
  map.set(key, current);
}

const byCost = (left, right) => right.costUsd - left.costUsd || left.label.localeCompare(right.label);

export function formatTokens(value) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  return groupDigits(String(Math.round(value)));
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) return "-";
  const precision = Math.abs(value) < 0.01 ? 6 : Math.abs(value) < 1 ? 4 : 2;
  const [whole, fraction = ""] = Math.abs(value).toFixed(precision).split(".");
  const trimmed = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${value < 0 ? "-" : ""}$${groupDigits(whole)}.${trimmed}`;
}

function groupDigits(value) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function chartPeriodKey(period, hourly) {
  if (!hourly) return String(period).slice(0, 10);
  const date = new Date(period);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shiftCalendarDay(day, offset) {
  const [year, month, date] = String(day).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + offset));
  return Number.isNaN(shifted.getTime()) ? null : shifted.toISOString().slice(0, 10);
}

function completePeriods(periods, range, anchor, window) {
  const end = new Date(anchor);
  if (Number.isNaN(end.getTime())) return periods;

  const hourly = range === "24h";
  const keys = [];
  if (hourly) {
    const untilTime = new Date(window?.untilTime ?? end.toISOString());
    if (Number.isNaN(untilTime.getTime())) return periods;
    const hour = 60 * 60 * 1000;
    let sinceTimeMs = window?.sinceTime ? new Date(window.sinceTime).getTime() : Number.NaN;
    if (!Number.isFinite(sinceTimeMs)) {
      const firstPeriodMs = periods.map((period) => new Date(period.period).getTime()).find(Number.isFinite);
      if (Number.isFinite(firstPeriodMs)) {
        const offset = ((firstPeriodMs % hour) + hour) % hour;
        const approximateSince = untilTime.getTime() - 24 * hour;
        sinceTimeMs = Math.floor((approximateSince - offset) / hour) * hour + offset;
      } else sinceTimeMs = untilTime.getTime() - 24 * hour;
    }
    for (let index = 0; index < 24; index += 1) {
      keys.push(new Date(sinceTimeMs + index * hour).toISOString());
    }
  } else {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0;
    if (days === 0) return periods;
    const untilDay = window?.untilDay ?? end.toISOString().slice(0, 10);
    const sinceDay = window?.sinceDay ?? shiftCalendarDay(untilDay, -days + 1);
    for (let offset = 0; offset < days; offset += 1) {
      const day = shiftCalendarDay(sinceDay, offset);
      if (!day) return periods;
      keys.push(day);
    }
  }

  const values = new Map(keys.map((key) => [key, { period: key, costUsd: 0, tokens: 0 }]));
  for (const period of periods) {
    const key = chartPeriodKey(period.period, hourly);
    const value = values.get(key);
    if (!value) continue;
    value.costUsd += period.costUsd;
    value.tokens += period.tokens;
    for (const [provider, amounts] of Object.entries(period.providerValues || {})) {
      const current = value.providerValues?.[provider] ?? { costUsd: 0, tokens: 0 };
      current.costUsd += amounts.costUsd;
      current.tokens += amounts.tokens;
      value.providerValues ??= {};
      value.providerValues[provider] = current;
    }
  }
  return keys.map((key) => values.get(key));
}

export function chartValues(periods, metric, count = 12, range, anchor, window) {
  const complete = range && anchor ? completePeriods(periods, range, anchor, window) : periods;
  const tail = complete.slice(-count);
  return tail.map((period) => (metric === "tokens" ? period.tokens : period.costUsd));
}

export function chartProviderValues(periods, metric, count, range, anchor, window, providerIds) {
  const complete = range && anchor ? completePeriods(periods, range, anchor, window) : periods;
  const tail = complete.slice(-count);
  const keys = [...providerIds, "__other__"];
  return keys.map((provider) => ({
    provider,
    values: tail.map((period) => {
      const amounts = period.providerValues || {};
      if (provider !== "__other__") return amounts[provider]?.[metric === "tokens" ? "tokens" : "costUsd"] || 0;
      return Object.entries(amounts).reduce((sum, [name, item]) => sum + (providerIds.includes(name) ? 0 : item[metric === "tokens" ? "tokens" : "costUsd"] || 0), 0);
    }),
  }));
}
