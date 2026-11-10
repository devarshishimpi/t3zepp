export const PAIRING_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>T3 Zepp Pairing</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --card-border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --text-subtle: #71717a;
      --accent: #f4f4f5;
      --accent-foreground: #09090b;
      --code-bg: #18181b;
      --input-bg: #09090b;
      --input-border: #27272a;
      --input-focus: #52525b;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.5;
      padding: 0;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .topbar {
      border-bottom: 1px solid var(--card-border);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(9, 9, 11, 0.8);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--text);
    }
    .logo-badge {
      background: #27272a;
      color: #ffffff;
      font-weight: 700;
      font-size: 11px;
      padding: 3px 6px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .brand-title {
      font-weight: 600;
      font-size: 14px;
      color: #ffffff;
    }
    .nav-links {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .nav-links a {
      color: var(--text-muted);
      font-size: 13px;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s ease;
    }
    .nav-links a:hover { color: #ffffff; }
    .container {
      max-width: 640px;
      margin: 0 auto;
      padding: 32px 16px 64px 16px;
    }
    header {
      margin-bottom: 24px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #ffffff;
      margin-bottom: 6px;
    }
    p.lead {
      font-size: 14px;
      color: var(--text-muted);
    }
    .tabs-wrapper {
      margin-bottom: 20px;
    }
    .tabs {
      background: #121215;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 3px;
      display: inline-flex;
      gap: 4px;
      width: 100%;
    }
    .tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-subtle);
      font-size: 13px;
      font-weight: 500;
      padding: 7px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      text-align: center;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      background: #27272a;
      color: #ffffff;
      font-weight: 600;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--text);
    }
    .hint {
      font-size: 12px;
      color: var(--text-subtle);
      margin-top: 5px;
      line-height: 1.4;
    }
    input, textarea {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      padding: 9px 12px;
      font-size: 13px;
      color: #ffffff;
      font-family: var(--font-mono);
      outline: none;
      transition: border-color 0.15s ease;
    }
    input:focus, textarea:focus {
      border-color: var(--input-focus);
    }
    .btn-primary {
      width: 100%;
      background: var(--accent);
      color: var(--accent-foreground);
      padding: 10px 16px;
      font-weight: 600;
      font-size: 13px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s ease;
      text-align: center;
      font-family: inherit;
    }
    .btn-primary:hover { background: #e4e4e7; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-danger {
      width: 100%;
      background: #7f1d1d;
      color: #fecaca;
      border: 1px solid #991b1b;
      padding: 10px 16px;
      font-weight: 600;
      font-size: 13px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s ease;
    }
    .btn-danger:hover { background: #991b1b; }
    .result-box {
      display: none;
      background: #141417;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
      text-align: center;
    }
    .pair-code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 0.25em;
      color: #ffffff;
      font-family: var(--font-mono);
      padding: 12px 0;
      text-align: center;
    }
    .device-key-box {
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 12px;
      word-break: break-all;
      color: var(--text-muted);
      margin: 8px 0;
      text-align: left;
    }
    .copy-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #f4f4f5;
      padding: 6px 14px;
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-family: inherit;
      transition: background 0.15s ease;
    }
    .copy-btn:hover { background: #3f3f46; }
    .status-msg {
      margin-top: 12px;
      font-size: 13px;
      font-weight: 500;
      padding: 10px 12px;
      border-radius: 6px;
    }
    .status-success {
      background: #064e3b;
      border: 1px solid #065f46;
      color: #a7f3d0;
    }
    .status-error {
      background: #450a0a;
      border: 1px solid #7f1d1d;
      color: #fecaca;
    }
    footer {
      text-align: center;
      font-size: 12px;
      color: var(--text-subtle);
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--card-border);
    }
    footer a { color: var(--text-muted); text-decoration: none; }
    footer a:hover { color: #ffffff; }
  </style>
</head>
<body>
  <nav class="topbar">
    <a href="/" class="brand">
      <span class="logo-badge">T3</span>
      <span class="brand-title">T3 Zepp Pairing</span>
    </a>
    <div class="nav-links">
      <a href="/">Overview</a>
      <a href="https://github.com/devarshishimpi/t3zepp" target="_blank" rel="noopener">GitHub</a>
    </div>
  </nav>

  <div class="container">
    <header>
      <h1>Device Pairing Dashboard</h1>
      <p class="lead">Connect your Amazfit watch to your T3 Code instance securely without self-hosting.</p>
    </header>

    <div class="tabs-wrapper">
      <div class="tabs">
        <button class="tab-btn active" onclick="showTab('pair')">New Pairing</button>
        <button class="tab-btn" onclick="showTab('update')">Update Tunnel URL</button>
        <button class="tab-btn" onclick="showTab('revoke')">Revoke Key</button>
      </div>
    </div>

    <!-- TAB 1: NEW PAIRING -->
    <div id="tab-pair" class="card">
      <form id="pair-form" onsubmit="handlePair(event)">
        <div class="form-group">
          <label for="t3BaseUrl">T3 Base URL (Public HTTPS)</label>
          <input type="url" id="t3BaseUrl" placeholder="https://my-tunnel.trycloudflare.com" required>
          <div class="hint">The public HTTPS address pointing to your local T3 instance (port 3773).</div>
        </div>

        <div class="form-group">
          <label for="t3Token">T3 Session Token</label>
          <textarea id="t3Token" rows="3" placeholder="Paste token from: t3 auth session issue" required></textarea>
          <div class="hint">Run 't3 auth session issue --scope diagnostics:read --scope orchestration:read --ttl 365d --token-only' in your project.</div>
        </div>

        <div class="form-group">
          <label for="label">Device Label (Optional)</label>
          <input type="text" id="label" placeholder="e.g. My Amazfit watch">
        </div>

        <button type="submit" class="btn-primary" id="pair-btn">Generate Pairing Code</button>
      </form>

      <div id="pair-result" class="result-box">
        <h3 style="color: #ffffff; font-size: 15px; font-weight: 600;">Pairing Code Ready</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Enter this 6-digit code in the Zepp app on your phone:</p>
        <div class="pair-code" id="res-code">000000</div>
        <p style="font-size: 12px; color: var(--text-subtle);" id="res-timer">Valid for 10 minutes</p>

        <div style="margin-top: 16px; text-align: left;">
          <label>Persistent Device Key</label>
          <div class="device-key-box" id="res-key">tz_live_...</div>
          <button type="button" class="copy-btn" onclick="copyKey()">Copy Device Key</button>
        </div>

        <div style="margin-top: 16px;">
          <img id="res-qr" style="width: 140px; height: 140px; border-radius: 6px; background: #fff; padding: 6px;" alt="QR Code">
        </div>
      </div>
      <div id="pair-status" class="status-msg" style="display: none;"></div>
    </div>

    <!-- TAB 2: UPDATE TUNNEL -->
    <div id="tab-update" class="card" style="display: none;">
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">Restarted your tunnel? Update your T3 Base URL here so your watch keeps syncing without changing any phone settings.</p>
      <form id="update-form" onsubmit="handleUpdate(event)">
        <div class="form-group">
          <label for="update-key">Device Key</label>
          <input type="text" id="update-key" placeholder="tz_live_..." required>
        </div>
        <div class="form-group">
          <label for="update-url">New T3 Base URL</label>
          <input type="url" id="update-url" placeholder="https://new-tunnel.trycloudflare.com" required>
        </div>
        <button type="submit" class="btn-primary">Update Endpoint</button>
      </form>
      <div id="update-status" class="status-msg" style="display: none;"></div>
    </div>

    <!-- TAB 3: REVOKE -->
    <div id="tab-revoke" class="card" style="display: none;">
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">Permanently delete a Device Key from the gateway. The watch will be disconnected.</p>
      <form id="revoke-form" onsubmit="handleRevoke(event)">
        <div class="form-group">
          <label for="revoke-key">Device Key to Revoke</label>
          <input type="text" id="revoke-key" placeholder="tz_live_..." required>
        </div>
        <button type="submit" class="btn-danger">Revoke Key</button>
      </form>
      <div id="revoke-status" class="status-msg" style="display: none;"></div>
    </div>

    <footer>
      <p>T3 Zepp &bull; Independent Community Companion &bull; <a href="/">Overview</a> &bull; <a href="https://github.com/devarshishimpi/t3zepp">GitHub</a></p>
    </footer>
  </div>

  <script>
    function showTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.card').forEach(c => c.style.display = 'none');
      if (tab === 'pair') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-pair').style.display = 'block';
      } else if (tab === 'update') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-update').style.display = 'block';
      } else if (tab === 'revoke') {
        document.querySelectorAll('.tab-btn')[2].classList.add('active');
        document.getElementById('tab-revoke').style.display = 'block';
      }
    }

    async function handlePair(e) {
      e.preventDefault();
      const btn = document.getElementById('pair-btn');
      const status = document.getElementById('pair-status');
      const resultBox = document.getElementById('pair-result');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      status.style.display = 'none';

      try {
        const res = await fetch('/api/pair/init', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            t3BaseUrl: document.getElementById('t3BaseUrl').value.trim(),
            t3AccessToken: document.getElementById('t3Token').value.trim(),
            label: document.getElementById('label').value.trim() || 'Amazfit watch',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate pairing code');

        document.getElementById('res-code').textContent = data.pairingCode;
        document.getElementById('res-key').textContent = data.deviceKey;
        document.getElementById('res-qr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(data.deviceKey);
        resultBox.style.display = 'block';
        status.className = 'status-msg status-success';
        status.textContent = 'Pairing code generated! Type ' + data.pairingCode + ' in your Zepp companion settings.';
        status.style.display = 'block';
      } catch (err) {
        status.className = 'status-msg status-error';
        status.textContent = err.message;
        status.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Pairing Code';
      }
    }

    function copyKey() {
      const key = document.getElementById('res-key').textContent;
      navigator.clipboard.writeText(key).then(() => {
        alert('Device Key copied to clipboard!');
      });
    }

    async function handleUpdate(e) {
      e.preventDefault();
      const status = document.getElementById('update-status');
      status.style.display = 'block';
      status.className = 'status-msg';
      status.textContent = 'Updating...';
      try {
        const res = await fetch('/api/device/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deviceKey: document.getElementById('update-key').value.trim(),
            t3BaseUrl: document.getElementById('update-url').value.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update');
        status.className = 'status-msg status-success';
        status.textContent = 'Updated successfully! Watch will now route to the new tunnel.';
      } catch (err) {
        status.className = 'status-msg status-error';
        status.textContent = err.message;
      }
    }

    async function handleRevoke(e) {
      e.preventDefault();
      if (!confirm('Are you sure you want to revoke this Device Key? The watch will disconnect.')) return;
      const status = document.getElementById('revoke-status');
      status.style.display = 'block';
      status.className = 'status-msg';
      status.textContent = 'Revoking...';
      try {
        const res = await fetch('/api/device/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deviceKey: document.getElementById('revoke-key').value.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to revoke');
        status.className = 'status-msg status-success';
        status.textContent = 'Device Key revoked successfully.';
      } catch (err) {
        status.className = 'status-msg status-error';
        status.textContent = err.message;
      }
    }
  </script>
</body>
</html>
`;
