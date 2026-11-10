function randomHex(bytes) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateDeviceKey() {
  return `tz_live_${randomHex(20)}`;
}

export function generatePairingCode() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = 100000 + (array[0] % 900000);
  return String(code);
}

export async function createDevice(db, { t3BaseUrl, t3AccessToken, label = "T3 Code Instance" }) {
  if (!db) throw new Error("Database is not configured");
  if (!t3BaseUrl || typeof t3BaseUrl !== "string") throw new Error("Invalid T3 Base URL");
  if (!t3AccessToken || typeof t3AccessToken !== "string") throw new Error("Invalid T3 Access Token");

  const normalizedUrl = new URL(t3BaseUrl.trim());
  if (normalizedUrl.protocol !== "https:") throw new Error("T3 Base URL must use HTTPS");
  const origin = normalizedUrl.origin;

  const deviceKey = generateDeviceKey();
  const pairingCode = generatePairingCode();
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes

  await db.batch([
    db.prepare(
      "INSERT INTO devices (device_key, t3_base_url, t3_access_token, label, created_at, last_used_at, request_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(deviceKey, origin, t3AccessToken.trim(), label.trim(), now, null, 0),
    db.prepare(
      "INSERT INTO pairing_sessions (pairing_code, device_key, expires_at, claimed, created_at) VALUES (?, ?, ?, 0, ?)",
    ).bind(pairingCode, deviceKey, expiresAt, now),
  ]);

  return {
    deviceKey,
    pairingCode,
    expiresAt: new Date(expiresAt).toISOString(),
    t3BaseUrl: origin,
  };
}

export async function claimPairingCode(db, pairingCode) {
  if (!db) throw new Error("Database is not configured");
  const cleanCode = String(pairingCode || "").replace(/\D/g, "").trim();
  if (cleanCode.length !== 6) throw new Error("Pairing code must be 6 digits");

  const session = await db.prepare(
    "SELECT pairing_code, device_key, expires_at, claimed FROM pairing_sessions WHERE pairing_code = ?",
  ).bind(cleanCode).first();

  if (!session) throw new Error("Pairing code not found");
  if (session.claimed === 1) throw new Error("Pairing code already claimed");
  if (Date.now() > session.expires_at) throw new Error("Pairing code expired");

  await db.prepare(
    "UPDATE pairing_sessions SET claimed = 1 WHERE pairing_code = ?",
  ).bind(cleanCode).run();

  return {
    deviceKey: session.device_key,
  };
}

export async function getDevice(db, deviceKey) {
  if (!db || !deviceKey || typeof deviceKey !== "string") return null;
  const key = deviceKey.trim();
  return await db.prepare(
    "SELECT device_key, t3_base_url, t3_access_token, label, created_at, last_used_at, request_count FROM devices WHERE device_key = ?",
  ).bind(key).first();
}

export async function updateDevice(db, { deviceKey, t3BaseUrl, t3AccessToken }) {
  if (!db) throw new Error("Database is not configured");
  if (!deviceKey) throw new Error("Missing device key");

  const existing = await getDevice(db, deviceKey);
  if (!existing) throw new Error("Device key not found");

  const newBase = t3BaseUrl ? new URL(t3BaseUrl.trim()).origin : existing.t3_base_url;
  const newToken = t3AccessToken ? t3AccessToken.trim() : existing.t3_access_token;

  await db.prepare(
    "UPDATE devices SET t3_base_url = ?, t3_access_token = ? WHERE device_key = ?",
  ).bind(newBase, newToken, deviceKey.trim()).run();

  return {
    deviceKey: existing.device_key,
    t3BaseUrl: newBase,
  };
}

export async function touchDevice(db, deviceKey) {
  if (!db || !deviceKey) return;
  try {
    await db.prepare(
      "UPDATE devices SET last_used_at = ?, request_count = request_count + 1 WHERE device_key = ?",
    ).bind(Date.now(), deviceKey.trim()).run();
  } catch {
    // Non-blocking telemetry
  }
}

export async function revokeDevice(db, deviceKey) {
  if (!db || !deviceKey) throw new Error("Missing device key");
  await db.prepare("DELETE FROM devices WHERE device_key = ?").bind(deviceKey.trim()).run();
  return { ok: true };
}
