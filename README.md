# T3 Zepp

T3 Zepp is an unofficial community project for bringing the T3 Code experience to Amazfit watches. It is a broader companion project for the T3 ecosystem, designed to make key T3 information available on a watch while leaving room for richer workflows, utilities, and device-first features in the future.

This is an independent community project and is not affiliated with T3 Tools. Preview components and the demo build are derived from the MIT-licensed [T3 Code repository](https://github.com/devarshishimpi/t3code). T3 Zepp is licensed under AGPL-3.0; see [LICENSE](LICENSE).

- **Public gateway:** [t3zepp.devarshi.dev](https://t3zepp.devarshi.dev)
- **Pairing dashboard:** [t3zepp.devarshi.dev/pair](https://t3zepp.devarshi.dev/pair)
- **Source:** [github.com/devarshishimpi/t3zepp](https://github.com/devarshishimpi/t3zepp)

## What this project is

T3 Zepp is meant to be a flexible companion layer for T3 Code and related tooling. The current build focuses on a practical first layer of watch-friendly visibility, but the project is intentionally designed to grow beyond a single dashboard or stats view.

The project aims to support:

- watch-first access to useful T3 data and system health signals
- a simple pairing flow between a watch, phone, and T3 instance
- future device experiences that go beyond usage summaries
- a lightweight, community-driven extension of the T3 ecosystem

## Current scope

- Usage for the past 24 hours, 7 days, 30 days, and 90 days.
- Token volume, cost, savings, provider attribution, and model breakdowns.
- Provider quota windows and remaining percentages.
- Cached data when the phone or gateway is temporarily unavailable.

This is the current starting point, not the full long-term vision of the project.

## Supported watches

| Watch | Zepp OS | Status |
| --- | --- | --- |
| Amazfit T-Rex 3 | 4.0 | Supported |

More Amazfit models can be listed here as their compatibility is confirmed.

## How it works

The watch requests data over Bluetooth Low Energy from the Zepp phone app. The phone app calls the Worker over HTTPS. The Worker uses a scoped T3 Code session to connect to the user's T3 server over WebSocket RPC, then compacts the usage information into a small payload suitable for the watch.

```text
Amazfit watch --BLE--> Zepp phone app --HTTPS--> Cloudflare Worker --WSS--> T3 Code server
                                                    |
                                                    +-- Cloudflare D1 for device pairing
```

The public gateway supports pairing codes and persistent device keys, so users do not need to host a Worker. Self-hosting is optional.

## Install and pair

### 1. Install the watch app

Enable Developer Mode in the Zepp mobile app: open **Profile > Settings > About**, tap the Zepp OS version entry seven times, then return to Profile and open **Developer Mode**.

From a computer with Node.js, npm, and the Zepp Zeus CLI installed:

```sh
git clone https://github.com/devarshishimpi/t3zepp.git
cd t3zepp
npm install
npm run preview:app
```

Zeus builds the app and displays a QR code. In the Zepp app, open **Profile > Developer Mode**, tap **+**, and scan the code to install T3 Zepp on the watch.

### 2. Expose your T3 Code server

The public gateway needs an HTTPS address for your T3 Code server. T3 Code listens on port 3773 by default. Start a tunnel, for example:

```sh
cloudflared tunnel --url http://127.0.0.1:3773
```

You can also use a named Cloudflare Tunnel, Localtunnel, or ngrok. Keep the HTTPS URL it provides.

### 3. Create a scoped session token

In a terminal where the `t3` CLI is available, create a read-only session token:

```sh
t3 auth session issue --scope diagnostics:read --scope orchestration:read --ttl 365d --label "T3 Zepp" --token-only
```

Keep the token private. You can list or revoke sessions with `t3 auth session list` and `t3 auth session revoke <session-id>`.

### 4. Pair the phone app

1. Open the [pairing dashboard](https://t3zepp.devarshi.dev/pair).
2. Enter the T3 HTTPS URL and the session token, then generate a pairing code.
3. On the phone, open your watch's page under **Profile**, then open **Developer Mode** (or **Mini Apps**) > **T3 Zepp > Settings**.
4. Enter the short-lived pairing code and save. The phone app exchanges it for a device key and stores that key locally.
5. Open T3 Zepp on the watch and tap **Refresh**. The current release supports the Amazfit T-Rex 3 listed above.

The dashboard also lets you update the T3 URL associated with a device key. If a temporary tunnel URL changes, update it there; the watch does not need to be paired again. You can revoke a device key from the dashboard.

## Gateway API

The public Worker serves these routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`, `HEAD` | `/` | Project landing page |
| `GET`, `HEAD` | `/health` | Health check |
| `GET`, `HEAD` | `/pair` | Pairing and device management dashboard |
| `POST` | `/api/pair/init` | Start a pairing session |
| `POST` | `/api/pair/claim` | Exchange a pairing code for a device key |
| `POST` | `/api/device/update` | Update a device's T3 endpoint or token |
| `POST` | `/api/device/revoke` | Revoke a device key |
| `POST` | `/v1/usage` | Return compacted usage data for the watch |

The usage endpoint accepts a device key:

```json
{
  "timeZone": "UTC",
  "deviceKey": "tz_live_..."
}
```

For direct, stateless use, it can instead receive a T3 URL and scoped token in the JSON body or `X-T3-Base-Url` and `X-T3-Access-Token` headers.

## Self-host the Worker (optional)

You need a Cloudflare account, a D1 database, a public HTTPS/WSS address for your T3 server, and the Wrangler CLI. From the repository root:

```sh
npm install
cd worker
npx wrangler d1 create t3zepp-db
```

Set the returned database ID and your hostname in `worker/wrangler.jsonc`, then apply the schema and deploy:

```sh
npx wrangler d1 execute t3zepp-db --remote --file=./schema.sql
cd ..
npm run deploy:worker
```

The checked-in Wrangler config contains the public project's domain and D1 identifier. Replace those values with your own before deploying a self-hosted copy. For a private single-tenant deployment, configure `T3_BASE_URL`, `T3_ACCESS_TOKEN`, and `WORKER_ACCESS_KEY` as Worker secrets. Do not commit `.dev.vars` or secret values. `worker/.dev.vars.example` is a placeholder template for local development.

This deploys the Worker only. The watch phone service currently points to `https://t3zepp.devarshi.dev` in `app/app-side/index.js`, and the Worker pages contain the public project URLs. To use a self-hosted Worker end to end, update those app and page URLs to your hostname, rebuild and reinstall the watch app, and configure your Wrangler custom domain. The app's stored `workerUrl` key is not currently a user-facing setting.

## Development

This repository is an npm workspaces monorepo. Install dependencies once from the root; the root `package-lock.json` locks both workspaces.

| Command | Action |
| --- | --- |
| `npm test` | Run app and Worker unit tests |
| `npm run check` | Syntax-check app and Worker source files |
| `npm run test:app` | Run watch app tests |
| `npm run test:worker` | Run Worker tests |
| `npm run check:app` | Check watch app source |
| `npm run check:worker` | Check Worker source |
| `npm run dev:app` | Start the Zeus app development flow |
| `npm run preview:app` | Build the watch app and show its install QR code |
| `npm run build:app` | Build the watch app package |
| `npm run dev:worker` | Run the Worker locally with Wrangler |
| `npm run deploy:worker` | Deploy the Worker with Wrangler |

The watch app commands require the Zepp Zeus CLI in addition to the npm dependencies. Worker local development may use a local `worker/.dev.vars` file; it is ignored by Git.

## Security and privacy

Use a read-only T3 session limited to `diagnostics:read` and `orchestration:read`. The watch does not receive the T3 session token and cannot access chat history, files, or tools. The phone stores the device key needed to authenticate to the gateway. Keep session tokens and device keys private, and revoke them when no longer needed.

## References

- [Zepp OS Developer Documentation](https://docs.zepp.com/)
- [Zeus CLI setup](https://docs.zepp.com/docs/guides/quick-start/environment/)
- [Amazfit T-Rex 3 device information](https://docs.zepp.com/docs/reference/related-resources/device-list/)
