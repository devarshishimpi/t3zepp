# T3Zepp

**T3 Code companion for Amazfit**

Bring the useful bits of T3 Code to your Amazfit watch: quick updates on usage, limits, notifications, and more.

T3Zepp is an independent companion app for T3 Code, built to bring useful, watch-friendly features to Amazfit watches.

This is an independent community project and is not affiliated with T3 Tools. Preview components and the demo build are derived from the MIT-licensed [T3 Code repository](https://github.com/devarshishimpi/t3code). T3Zepp is licensed under AGPL-3.0; see [LICENSE](LICENSE).

- **Public gateway:** [t3zepp.devarshi.dev](https://t3zepp.devarshi.dev)
- **Pairing dashboard:** [t3zepp.devarshi.dev/pair](https://t3zepp.devarshi.dev/pair)
- **Source:** [github.com/devarshishimpi/t3zepp](https://github.com/devarshishimpi/t3zepp)

## What this project is

T3Zepp brings T3 Code information and watch-ready features to your watch. The current build focuses on usage, limits, and other useful details at a glance.

The project aims to support:

- watch-first access to useful T3 Code data and system health signals
- a simple pairing flow between a watch, phone, and T3 Code server
- watch-friendly notifications and other useful features as they are added

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

The watch requests data over Bluetooth Low Energy from the Zepp phone app. The phone app calls the Worker over HTTPS. The Worker uses a scoped T3 Code session to connect to the user's T3 Code server over WebSocket RPC, then compacts the usage information into a small payload suitable for the watch.

```text
Amazfit watch --BLE--> Zepp phone app --HTTPS--> Cloudflare Worker --WSS--> T3 Code server
                                                    |
                                                    +-- Cloudflare D1 for device pairing
```

The public gateway supports pairing codes and persistent device keys, so users do not need to host a Worker. Self-hosting is optional.

## Install and pair

Most people can use the public Zepp Store release and the hosted proxy. The app is already configured to use **[t3zepp.devarshi.dev](https://t3zepp.devarshi.dev)**, so you do not need to build the app or deploy a Worker.

1. Install T3Zepp from the Zepp Store. The landing page's **Install T3Zepp** button opens the setup guide.
2. Make your T3 Code server reachable over HTTPS. T3 Code listens on port 3773 by default; for a quick Cloudflare Tunnel, run:

   ```sh
   cloudflared tunnel --url http://127.0.0.1:3773
   ```

   You can also use a named Cloudflare Tunnel, Localtunnel, or ngrok. Keep the HTTPS URL it provides.
3. In a terminal with the `t3` CLI, create a read-only session token:

   ```sh
   t3 auth session issue --scope diagnostics:read --scope orchestration:read --ttl 365d --label "T3Zepp" --token-only
   ```

   Keep the token private. You can list or revoke sessions with `t3 auth session list` and `t3 auth session revoke <session-id>`.
4. Open the [pairing dashboard](https://t3zepp.devarshi.dev/pair), enter your T3 Code HTTPS URL and token, and generate a pairing code.
5. In Zepp, open T3Zepp's settings for your watch, enter the pairing code, and save. The phone exchanges it for a device key; open T3Zepp on the watch and tap **Refresh**.

The public proxy stores the server URL and scoped token for the paired device. The watch receives a separate device key, not your T3 Code token. You can update the server URL or revoke the device key from the pairing dashboard.

### Build the watch app from source (optional)

Use this path only if you want to test or modify the watch app. It is not required for the public Zepp Store release.

Install Node.js, npm, and the Zepp Zeus CLI, then run:

```sh
npm install --global @zeppos/zeus-cli
git clone https://github.com/devarshishimpi/t3zepp.git
cd t3zepp
npm install
npm run preview:app
```

Zeus builds the app and displays a QR code. Enable Developer Mode in Zepp by opening **Profile > Settings > About**, tapping the Zepp OS version entry seven times, then opening **Profile > Developer Mode**. Tap **+** and scan the QR code to install the source build.

## Gateway API

The public Worker serves these routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`, `HEAD` | `/` | Astro project landing page |
| `GET`, `HEAD` | `/install` | Astro installation guide |
| `GET`, `HEAD` | `/health` | Health check |
| `GET`, `HEAD` | `/pair` | Astro pairing and device management dashboard |
| `POST` | `/api/pair/init` | Start a pairing session |
| `POST` | `/api/pair/claim` | Exchange a pairing code for a device key |
| `POST` | `/api/device/update` | Update a device's T3 Code endpoint or token |
| `POST` | `/api/device/revoke` | Revoke a device key |
| `POST` | `/v1/usage` | Return compacted usage data for the watch |

The usage endpoint accepts a device key:

```json
{
  "timeZone": "UTC",
  "deviceKey": "tz_live_..."
}
```

For direct, stateless use, it can instead receive a T3 Code URL and scoped token in the JSON body or `X-T3-Base-Url` and `X-T3-Access-Token` headers.

## Self-host the proxy Worker (optional)

The public proxy at `https://t3zepp.devarshi.dev` is the recommended option. Self-host only if you want to operate your own proxy. You need a Cloudflare account, a D1 database, a public HTTPS/WSS address for your T3 Code server, and the Wrangler CLI. From the repository root:

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

The checked-in Wrangler config contains the public project's domain and existing D1 identifier. Replace those values with your own before deploying a self-hosted copy. For a private single-tenant deployment, configure `T3_BASE_URL`, `T3_ACCESS_TOKEN`, and `WORKER_ACCESS_KEY` as Worker secrets. Do not commit `.dev.vars` or secret values. `worker/.dev.vars.example` is a placeholder template for local development.

`npm run deploy:worker` builds and deploys the Astro static pages and Worker together; it uses the D1 database configured in Wrangler and does not create another database. The watch phone service currently points to `https://t3zepp.devarshi.dev` in `app/app-side/index.js`, and the Astro pages contain the public project URLs. To use a self-hosted Worker end to end, update those app and page URLs to your hostname, rebuild and reinstall the watch app, and configure your Wrangler custom domain. The app's stored `workerUrl` key is not currently a user-facing setting.

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
| `npm run dev:site` | Start the Astro site through Vite+ |
| `npm run build:site` | Build the Astro and Tailwind pages into `site/dist` |
| `npm run preview:site` | Preview the production site build |
| `npm run deploy:worker` | Build the site, then deploy it with the Worker and existing D1 binding |

The site uses Astro for its static pages, Tailwind CSS for shared utilities, and Vite+ (`vp`) to run workspace commands. The Worker serves the generated assets while retaining its API and existing D1 binding. The watch app commands require the Zepp Zeus CLI in addition to the npm dependencies. Worker local development may use a local `worker/.dev.vars` file; it is ignored by Git.

## Security and privacy

Use a read-only T3 Code session limited to `diagnostics:read` and `orchestration:read`. The watch does not receive the T3 Code session token and cannot access chat history, files, or tools. The phone stores the device key needed to authenticate to the gateway. Keep session tokens and device keys private, and revoke them when no longer needed.

## References

- [Zepp OS Developer Documentation](https://docs.zepp.com/)
- [Zeus CLI setup](https://docs.zepp.com/docs/guides/quick-start/environment/)
- [Amazfit T-Rex 3 device information](https://docs.zepp.com/docs/reference/related-resources/device-list/)
