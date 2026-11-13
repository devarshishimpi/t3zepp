import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDeviceKey,
  generatePairingCode,
  createDevice,
  claimPairingCode,
  getDevice,
  updateDevice,
  revokeDevice,
} from "../src/devices.js";

function createMockDb() {
  const devices = new Map();
  const sessions = new Map();

  return {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          if (sql.includes("UPDATE pairing_sessions SET claimed = 1")) {
            const session = sessions.get(bound[0]);
            if (session && session.claimed === 0 && session.expires_at > bound[1]) {
              session.claimed = 1;
              return { device_key: session.device_key };
            }
            return null;
          }
          if (sql.includes("FROM devices WHERE device_key = ?")) {
            return devices.get(bound[0]) || null;
          }
          if (sql.includes("FROM pairing_sessions WHERE pairing_code = ?")) {
            return sessions.get(bound[0]) || null;
          }
          return null;
        },
        async run() {
          if (sql.includes("UPDATE devices SET t3_base_url = ?")) {
            const d = devices.get(bound[2]);
            if (d) {
              d.t3_base_url = bound[0];
              d.t3_access_token = bound[1];
            }
            return { success: true };
          }
          if (sql.includes("DELETE FROM devices")) {
            devices.delete(bound[0]);
            return { success: true };
          }
          return { success: true };
        },
      };
    },
    async batch(statements) {
      // Execute the two inserts from createDevice
      const [devStmt, sessStmt] = statements;
      // Extract bound from statement objects if needed
      // Here simulate createDevice insert
      devices.set(devStmt._bound[0], {
        device_key: devStmt._bound[0],
        t3_base_url: devStmt._bound[1],
        t3_access_token: devStmt._bound[2],
        label: devStmt._bound[3],
        created_at: devStmt._bound[4],
        last_used_at: devStmt._bound[5],
        request_count: devStmt._bound[6],
      });
      sessions.set(sessStmt._bound[0], {
        pairing_code: sessStmt._bound[0],
        device_key: sessStmt._bound[1],
        expires_at: sessStmt._bound[2],
        claimed: 0,
        created_at: sessStmt._bound[3],
      });
      return [];
    },
  };
}

// Wrap prepare to record _bound
function createTestDb() {
  const db = createMockDb();
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const p = origPrepare(sql);
    const origBind = p.bind.bind(p);
    p.bind = (...args) => {
      p._bound = args;
      return origBind(...args);
    };
    return p;
  };
  return db;
}

test("generateDeviceKey and generatePairingCode generate correct formats", () => {
  const key = generateDeviceKey();
  assert.match(key, /^tz_live_[0-9a-f]{40}$/);

  const code = generatePairingCode();
  assert.match(code, /^\d{6}$/);
});

test("creates device and claims pairing code", async () => {
  const db = createTestDb();
  const res = await createDevice(db, {
    t3BaseUrl: "https://tunnel.example.com",
    t3AccessToken: "sess-token-123",
    label: "Dev Watch",
  });

  assert.match(res.deviceKey, /^tz_live_/);
  assert.match(res.pairingCode, /^\d{6}$/);
  assert.equal(res.t3BaseUrl, "https://tunnel.example.com");

  // Concurrent claims have exactly one winner.
  const claims = await Promise.allSettled([
    claimPairingCode(db, res.pairingCode),
    claimPairingCode(db, res.pairingCode),
  ]);
  assert.equal(claims.filter((claim) => claim.status === "fulfilled").length, 1);
  const claimed = claims.find((claim) => claim.status === "fulfilled").value;
  assert.equal(claimed.deviceKey, res.deviceKey);

  // Claiming again fails
  await assert.rejects(() => claimPairingCode(db, res.pairingCode), /already claimed/);

  // Get device
  const dev = await getDevice(db, res.deviceKey);
  assert.equal(dev.t3_base_url, "https://tunnel.example.com");
  assert.equal(dev.t3_access_token, "sess-token-123");

  // Update device tunnel
  const updated = await updateDevice(db, {
    deviceKey: res.deviceKey,
    t3BaseUrl: "https://new-tunnel.example.com",
  });
  assert.equal(updated.t3BaseUrl, "https://new-tunnel.example.com");
  await assert.rejects(
    () => updateDevice(db, { deviceKey: res.deviceKey, t3BaseUrl: "http://new-tunnel.example.com" }),
    /HTTPS origin/,
  );

  const devAfter = await getDevice(db, res.deviceKey);
  assert.equal(devAfter.t3_base_url, "https://new-tunnel.example.com");
  assert.equal(devAfter.t3_access_token, "sess-token-123");

  // Revoke device
  await revokeDevice(db, res.deviceKey);
  const devRevoked = await getDevice(db, res.deviceKey);
  assert.equal(devRevoked, null);
});
