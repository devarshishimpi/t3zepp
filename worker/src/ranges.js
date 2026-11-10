export const USAGE_RANGES = Object.freeze({
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
});

function dayStamp(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDay(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function makeUsageInput(range, now = new Date(), timeZone = "UTC") {
  const days = Object.hasOwn(USAGE_RANGES, range) ? USAGE_RANGES[range] : undefined;
  if (!days) throw new Error("Unsupported usage range");
  if (typeof timeZone !== "string" || timeZone.length > 64) {
    throw new Error("Invalid time zone");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(now);
  } catch {
    throw new Error("Invalid time zone");
  }

  if (range === "24h") {
    const until = new Date(now);
    const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
    return {
      sinceDay: dayStamp(since, timeZone),
      untilDay: dayStamp(until, timeZone),
      sinceTime: since.toISOString(),
      untilTime: until.toISOString(),
      resolution: "hour",
      timeZone,
      awaitRefresh: false,
    };
  }

  const until = new Date(now);
  const untilDay = dayStamp(until, timeZone);
  const sinceDay = shiftDay(untilDay, -days + 1);
  return {
    sinceDay,
    untilDay,
    resolution: "day",
    timeZone,
    awaitRefresh: false,
  };
}

export function makeUsageInputs(now = new Date(), timeZone = "UTC") {
  return {
    hourly: makeUsageInput("24h", now, timeZone),
    daily: makeUsageInput("90d", now, timeZone),
  };
}
