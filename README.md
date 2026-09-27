<div align="center">

# Internet Speed

**A speed and latency test for the Pi Network — with Pi sign-in, a daily leaderboard that pays its winner, donations, ads and a built-in news system.**

[![License: PiOS](https://img.shields.io/badge/license-PiOS-8a2be2)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-3ce8a0)](https://nodejs.org)
[![No framework](https://img.shields.io/badge/frontend-no%20framework-00f5d4)](#why-no-framework)
[![Pi Network](https://img.shields.io/badge/Pi-Testnet%20%26%20Mainnet-ff2e97)](https://minepi.com)

Live on Testnet and Mainnet · Runs anywhere Node runs · No test server of your own required

</div>

---

## What this is

A complete, production-shaped Pi app rather than a demo. It measures two different things and is honest about the difference:

**Speed** comes from the official [OpenSpeedTest](https://openspeedtest.com) widget, embedded in the page. It runs on their servers, so **none of the test traffic touches yours** — the cheapest VPS is enough.

**Latency** is measured by this project's own engine: a real HTTPS round trip from the visitor's browser to ten major services, with the first sample discarded so the figure excludes DNS and TLS setup. A service that does not answer is reported as unreachable, which is information in itself.

Everything else — accounts, leaderboard, rewards, donations, ads, news, the admin dashboard — is built here.

## Why you might want it

If you are building a Pi app, the Pi integration in this repository is probably worth more to you than the speed test. It covers, working and in production:

| | |
|---|---|
| **Authentication** | Both mechanisms — OAuth (Pi Sign-in) in ordinary browsers and `Pi.authenticate()` inside the Pi Browser — chosen at runtime, with server-side verification |
| **U2A payments** | Donations, full three-phase flow, with stale-payment recovery |
| **A2U payments** | Automated payouts from the app wallet, run in the background so no proxy timeout can strand them |
| **Ads** | Interstitial and rewarded, with server-side verification of every rewarded view |
| **Share** | `Pi.openShareDialog` with Web Share and clipboard fallbacks |

Each of those took real debugging. The [gotchas section](#pi-integration-gotchas) below is the list of things that cost time and are not obvious from the documentation.

## Features

**Measurement**
- OpenSpeedTest widget for download and upload
- Ten-target latency engine with live results, colour bands and a verdict
- Every result compared against the site-wide average for that target
- Monitor mode: repeat the latency test every 1, 5 or 15 minutes to catch intermittent problems
- Bandwidth requirements calculator and download-time estimator
- Personal history with a trend chart and CSV export; public aggregate statistics

**Pi Network**
- Sign in with Pi, in the Pi Browser and in any ordinary browser
- History follows the account, not the browser; anonymous runs are migrated on first sign-in
- Donations in Pi with a message carried as the transaction memo
- Daily leaderboard ranked by each user's best run, with an automated reward payout
- Optional ad gates before sign-in and before the latency test

**Operations**
- Admin dashboard at `/admin`, access by Pi username, every runtime setting editable without a restart
- News system: posts written in the dashboard, server-rendered for crawlers, latest three on the home page
- Terms of Service and Privacy Policy written to match what the code actually does
- Four complete themes, responsive to small phones, installable as a web app, `prefers-reduced-motion` honoured

## Quick start

```bash
git clone https://github.com/<you>/internet-speed.git
cd internet-speed
npm install
npm run fonts
cp .env.example .env
npm run dev
```

Open `http://localhost:8080`. Requires Node.js 18 or newer.

**Everything except Pi sign-in, payments and ads works with no Pi configuration at all.** Leave `PI_CLIENT_ID` empty and the sign-in button hides itself; leave `PI_API_KEY` empty and the donation panel stays hidden. Nothing breaks.

With Docker:

```bash
cp .env.example .env
docker compose up -d --build
```

## Deploying

[**DEPLOY.md**](DEPLOY.md) is the full guide: DNS, Docker, Nginx, Let's Encrypt, the Pi Developer Portal, caching behind a CDN, backups, and a troubleshooting table for every failure mode we hit.

Two ready-made environment templates ship with the project:

```bash
cp .env.testnet.example .env    # Testnet deployment
cp .env.mainnet.example .env    # Mainnet deployment
```

Testnet and Mainnet are the same code with different configuration. Each links to the other, and they keep entirely separate databases — a Testnet result can never influence a Mainnet payout.

## Configuration

Everything is environment variables, with the operationally interesting ones also editable from the dashboard at runtime.

| Variable | Purpose |
|---|---|
| `SITE_URL` | Public address; the OAuth redirect URI is derived from it |
| `HASH_SALT` | Secret salt for IP hashing. Set it and never change it |
| `ADMIN_USERNAMES` | Pi usernames allowed into `/admin`, comma separated |
| `PI_CLIENT_ID` | OAuth client ID from the Developer Portal |
| `PI_API_KEY` | Server API key; needed for payments and ad verification |
| `PI_WALLET_PRIVATE_SEED` | App wallet seed; needed for reward payouts only |
| `PI_NETWORK` | `testnet` or `mainnet` |
| `ALT_NETWORK_URL` | Address of the counterpart deployment |
| `TRUST_PROXY` | Set to `1` behind Nginx. Not optional |
| `COOKIE_SAMESITE` | `none` when Pi frames the app |

See [`.env.example`](.env.example) for the complete list with explanations.

## Architecture

```
config/site.config.js     brand, widget URL, ping targets, Pi settings
server/
  index.js                Express, CSP, compression, cache policy, rate limits
  db.js                   SQLite: users, sessions, runs, samples, donations,
                          rewards, ad views, posts, settings
  settings.js             typed settings schema, database backed
  payout.js               background A2U payouts with restart recovery
  util/pi.js              token verification and the payment API
  util/a2u.js             App-to-User payments via pi-backend
  util/ads.js             rewarded ad verification
  util/markup.js          safe Markdown subset for news posts
  util/run-token.js       signed single-use token proving a run took time
  routes/                 auth, runs, stats, payments, rewards, ads, admin, news
public/
  index.html              home: speed test, latency, leaderboard, news
  pages/                  statistics, requirements, guide, about
  admin/                  dashboard
  legal/                  Terms of Service and Privacy Policy
  css/tokens.css          four themes, spacing, type and motion tokens
  js/                     one module per concern, no build step
```

SQLite through `better-sqlite3`. One file, `data/internet-speed.db`, is the entire database.

### Why no framework

There is no bundler, no transpiler and no `node_modules` in the browser. The frontend is ES modules served as written, which means a stack trace points at a real line, a deploy is a file copy, and the site still works in five years without a dependency audit. For an application of this size that is a better trade than a build pipeline.

## Pi integration gotchas

The things that cost the most time, collected so they cost you less.

**Authentication**
- There are **two** mechanisms and they are not interchangeable. Pi Sign-in (OAuth) refuses to run inside the Pi Browser; `Pi.authenticate()` only exists where `window.Pi` does.
- Detect the Pi Browser by **user agent only**. `window.Pi` exists in every browser because the SDK script loads anywhere — using it for detection sends ordinary browsers down the SDK path, where they fail with a `postMessage` origin error.
- `Pi.init()` returns a promise and must settle before any other SDK method runs.
- `Pi.authenticate()` needs at least `username` **and** `payments`. With `username` alone Pi answers a bare "Authentication failed".
- The SDK's own session does not survive a page load. Call `Pi.authenticate()` again before `Pi.createPayment()`, or createPayment silently does nothing at all — no error, no callback.

**Payments**
- A2U pays a **uid**, not a wallet address. Pi supplies the destination. Never ask a user for their address.
- `wallet_address` scope is required for A2U: without it Pi answers `401 missing_scope` because it will not reveal the recipient's public key. The grant belongs to the user, so anyone who signed in before you added the scope must sign in again.
- Pi allows **one open server payment at a time**. An unfinished one blocks every later payout until it is completed or cancelled.
- `pi-backend` sets no timeouts, so a Horizon call can hang indefinitely. Run payouts in the background and poll — never inside the HTTP request, where a proxy read timeout leaves the row stuck forever.
- `pi-backend` pulls in `sodium-native`, which ships **glibc prebuilds only**. On Alpine it crashes the process with nothing in the logs. Use a glibc base image.

**Ads**
- A rewarded ad requires an authenticated user. "Rewarded ad before sign-in" is impossible by design; use an interstitial there.
- Verify every rewarded view server-side at `/v2/ads_network/status/:adId`. Only `mediator_ack_status === "granted"` counts.

**Framing, CSP and cookies**
- Pi embeds the app in an iframe, so `X-Frame-Options` must **not** be sent. Disable Helmet's frameguard and rely on `frame-ancestors`.
- The SDK calls `https://socialchain.app/v2/me` directly from inside the Pi Browser. Leaving it out of `connect-src` surfaces as — again — a generic "Authentication failed".
- Because Pi frames the app, your cookies are third-party: `SameSite=None` is required, which requires `Secure`, which requires `TRUST_PROXY` parsed as a **number**. A string is read as an IP list and silently leaves `req.secure` false.

## A note on the leaderboard

Latency is measured in the visitor's browser and reported to the server, so it **cannot be fully verified**. Attaching money to an unverifiable number invites exactly what you would expect.

The project raises the cost rather than pretending otherwise: the server issues a signed single-use token before each run, the submission must present it and must have taken a plausible amount of wall-clock time, only signed-in accounts rank, and a run needs several reachable targets to qualify. That is friction, not proof.

If you run this on Mainnet with amounts worth attacking, use the `admin-pays` mode and review winners before releasing funds. The dashboard is built for exactly that.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

The speed test engine is [OpenSpeedTest](https://openspeedtest.com), free for personal and commercial use. Per its terms the "Provided by OpenSpeedtest.com" credit stays beneath the widget and in the footer — please keep it if you reuse this.

Fonts are [Manrope](https://github.com/sharanda/manrope) and [Space Grotesk](https://github.com/floriankarsten/space-grotesk), self-hosted.

## License

Released under the [PiOS License](LICENSE).

In short: you may use, modify and distribute this — including commercially — **for applications on the official Pi Network**. You may not use it to infringe Pi Network intellectual property, to attack Pi Network systems, or to build something competitive with Pi Network. The software comes with no warranty.

Pi, Pi Network and the Pi logo are trademarks of the Pi Community Company. This project is independent and not endorsed by them.
