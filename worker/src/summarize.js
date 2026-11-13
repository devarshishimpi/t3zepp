import { compactUsageSnapshot } from "./compact.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

function tokens(bucket) {
  const totals = bucket.totals || {};
  return [totals.uncachedInputTokens, totals.cachedInputTokens, totals.cacheCreationTokens, totals.outputTokens]
    .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function add(map, key, values) {
  const current = map.get(key);
  if (!current) {
    map.set(key, { ...values });
    return;
  }
  current.costUsd += values.costUsd;
  current.tokens += values.tokens;
  current.records += values.records;
  current.unpricedRecords += values.unpricedRecords;
  map.set(key, current);
}

function createRange(range, window) {
  return {
    range,
    window,
    totals: { costUsd: 0, tokens: 0, sessions: 0, records: 0 },
    models: new Map(),
    providers: new Map(),
    periods: new Map(),
  };
}

function addBucket(target, bucket, periodKey) {
  const costUsd = Number.isFinite(bucket.costUsd) ? bucket.costUsd : 0;
  const tokenCount = tokens(bucket);
  const records = Number.isFinite(bucket.records) ? bucket.records : 0;
  const sessions = Number.isFinite(bucket.sessions) ? bucket.sessions : 0;
  const unpricedRecords = Number.isFinite(bucket.unpricedRecords) ? bucket.unpricedRecords : 0;
  const provider = String(bucket.provider || "unknown");
  const model = String(bucket.model || "unknown");
  const values = { costUsd, tokens: tokenCount, records, unpricedRecords };
  target.totals.costUsd += costUsd;
  target.totals.tokens += tokenCount;
  target.totals.sessions += sessions;
  target.totals.records += records;
  add(target.providers, provider, values);
  add(target.models, `${provider}\u0000${model}`, { ...values, provider, label: model });

  const period = target.periods.get(periodKey) || { period: periodKey, costUsd: 0, tokens: 0, providers: new Map() };
  period.costUsd += costUsd;
  period.tokens += tokenCount;
  const providerValues = period.providers.get(provider) || { costUsd: 0, tokens: 0 };
  providerValues.costUsd += costUsd;
  providerValues.tokens += tokenCount;
  period.providers.set(provider, providerValues);
  target.periods.set(periodKey, period);
}

function roundCost(value) {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Number(value.toFixed(value < 0.01 && value > 0 ? 6 : 4));
}

function roundChartCost(value, peak) {
  if (!Number.isFinite(value) || value === 0) return 0;
  const decimals = peak < 0.0001 && peak > 0 ? 6 : peak < 1 && peak > 0 ? 4 : 2;
  const rounded = Number(value.toFixed(decimals));
  return rounded === 0 && value > 0 ? Number(value.toPrecision(1)) : rounded;
}

function roundTokens(value) {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Math.round(value);
}

function sortedRows(map, metric, isModel = false) {
  return [...map.entries()]
    .map(([id, value]) => ({
      ...(isModel ? {} : { id }),
      ...value,
      provider: value.provider || id,
      label: value.label || id,
      costUsd: roundCost(value.costUsd),
      tokens: roundTokens(value.tokens),
    }))
    .sort((left, right) => right[metric] - left[metric] || left.label.localeCompare(right.label));
}

function completePeriodKeys(target) {
  if (target.range === "24h") {
    const since = Date.parse(target.window.sinceTime);
    return Array.from({ length: 24 }, (_, index) => new Date(since + index * HOUR_MS).toISOString());
  }
  const since = target.window.sinceDay;
  const start = Date.parse(`${since}T00:00:00.000Z`);
  const count = target.range === "7d" ? 7 : target.range === "30d" ? 30 : 90;
  return Array.from({ length: count }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

function makeChart(target, metric) {
  const providers = sortedRows(target.providers, metric).slice(0, 3).map((item) => item.id);
  const keys = completePeriodKeys(target);
  const rawSeries = [...providers, "__other__"].map((provider) => ({
    provider,
    values: keys.map((key) => {
      const period = target.periods.get(key);
      if (!period) return 0;
      if (provider !== "__other__") return period.providers.get(provider)?.[metric] || 0;
      let value = 0;
      for (const [name, amounts] of period.providers) {
        if (!providers.includes(name)) value += amounts[metric];
      }
      return value;
    }),
  })).filter((item) => item.values.some((value) => value > 0));

  const rawPeak = rawSeries.reduce((maximum, item) => item.values.reduce((value, current) => Math.max(value, current), maximum), 0);
  const isCost = metric === "costUsd";
  const peak = isCost ? roundCost(rawPeak) : roundTokens(rawPeak);
  const series = rawSeries.map((item) => ({
    provider: item.provider,
    values: item.values.map((v) => (isCost ? roundChartCost(v, peak) : roundTokens(v))),
  }));
  return { peak, series };
}

function finishRange(target) {
  return {
    window: target.window,
    totals: {
      costUsd: roundCost(target.totals.costUsd),
      tokens: roundTokens(target.totals.tokens),
      sessions: target.totals.sessions,
      records: target.totals.records,
    },
    modelsByCost: sortedRows(target.models, "costUsd", true).slice(0, 8),
    modelsByTokens: sortedRows(target.models, "tokens", true).slice(0, 8),
    charts: {
      cost: makeChart(target, "costUsd"),
      tokens: makeChart(target, "tokens"),
    },
  };
}

export function summarizeUsageRanges({ hourly, daily, providers = [], usageLimitSources = [] }) {
  if (!hourly?.usage || !daily?.usage || !Array.isArray(hourly.usage.buckets) || !Array.isArray(daily.usage.buckets)) {
    throw new Error("T3 returned an incomplete Usage snapshot");
  }

  const dailyUntil = daily.usage.untilDay;
  const targets = {
    "24h": createRange("24h", {
      sinceDay: hourly.usage.sinceDay,
      untilDay: hourly.usage.untilDay,
      sinceTime: hourly.usage.sinceTime,
      untilTime: hourly.usage.untilTime,
      resolution: "hour",
      timeZone: hourly.usage.timeZone || "UTC",
    }),
  };
  for (const [range, days] of Object.entries(RANGE_DAYS)) {
    const sinceDay = new Date(Date.parse(`${dailyUntil}T00:00:00.000Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
    targets[range] = createRange(range, {
      sinceDay,
      untilDay: dailyUntil,
      resolution: "day",
      timeZone: daily.usage.timeZone || "UTC",
    });
  }

  for (const bucket of hourly.usage.buckets) {
    if (bucket.hourStart) addBucket(targets["24h"], bucket, bucket.hourStart);
  }
  for (const bucket of daily.usage.buckets) {
    if (bucket.day < targets["90d"].window.sinceDay || bucket.day > dailyUntil) continue;
    addBucket(targets["90d"], bucket, bucket.day);
    if (bucket.day >= targets["30d"].window.sinceDay) addBucket(targets["30d"], bucket, bucket.day);
    if (bucket.day >= targets["7d"].window.sinceDay) addBucket(targets["7d"], bucket, bucket.day);
  }

  const compact = compactUsageSnapshot({ usage: { buckets: [] }, providers, usageLimitSources });
  return {
    version: 2,
    ranges: Object.fromEntries(Object.entries(targets).map(([range, target]) => [range, finishRange(target)])),
    limits: { providers: compact.providers, sources: compact.usageLimitSources },
  };
}
