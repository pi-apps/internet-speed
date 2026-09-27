# Deployment guide

Step by step, from a blank VPS to a working site on your own domain.
Written for Ubuntu 22.04 or 24.04; Debian works unchanged.

Because the speed test runs on OpenSpeedTest's servers, your machine only serves
a light site. **Test traffic does not consume your bandwidth.**

| Resource | Minimum |
|---|---|
| RAM | 512 MB |
| CPU | 1 core |
| Disk | 5 GB |
| Traffic | tens of GB per month |

---

## 1. DNS

Point an A record at the server:

```
speed.example.com    A    203.0.113.10
```

Add an AAAA record if you have IPv6. The Cloudflare proxy is fine here, since
test traffic never passes through your server.

```bash
dig +short speed.example.com
```

## 2. Prepare the server

```bash
ssh root@203.0.113.10

apt update && apt upgrade -y
apt install -y curl git ufw unzip

adduser --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Work as `deploy` from here: `ssh deploy@203.0.113.10`

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

## 4. Upload the project

From your own machine:

```bash
scp internet-speed.zip deploy@203.0.113.10:~/
```

On the server:

```bash
unzip internet-speed.zip
cd internet-speed
```

## 5. Configure

```bash
cp .env.example .env
nano .env
```

At minimum set:

```ini
BRAND_NAME=Internet Speed
SITE_URL=https://speed.example.com
CONTACT_EMAIL=you@example.com
TRUST_PROXY=1
COOKIE_SAMESITE=none
HASH_SALT=<output of openssl rand -hex 32>
ADMIN_TOKEN=<output of openssl rand -hex 32>
```

Generate the secrets:

```bash
openssl rand -hex 32
```

`TRUST_PROXY=1` is not optional behind Nginx. Without it Express sees every
visitor as `127.0.0.1`, which breaks provider lookup, rate limiting, and the
`Secure` flag on cookies.

## 6. Start the service

```bash
docker compose up -d --build
docker compose ps
curl -s localhost:8080/api/health
```

The container listens on `127.0.0.1` only. Nginx provides public access.

## 7. Nginx and TLS

```bash
sudo apt install -y nginx certbot

sudo mkdir -p /etc/nginx/snippets
sudo cp nginx/ssl-common.conf /etc/nginx/snippets/ssl-common.conf
sudo cp nginx/internet-speed.conf /etc/nginx/sites-available/internet-speed.conf
sudo ln -sf /etc/nginx/sites-available/internet-speed.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo sed -i 's/speed\.example\.com/speed.YOURDOMAIN.com/g' \
  /etc/nginx/sites-available/internet-speed.conf
```

The config deliberately does not reference `/etc/letsencrypt/options-ssl-nginx.conf`.
That file is created only by certbot's nginx plugin; if you obtain the certificate
with `certonly --standalone` it never exists and Nginx fails to start with
"No such file or directory". `ssl-common.conf` provides the same settings
independently.

Obtain the certificate with Nginx stopped so port 80 is free:

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d speed.YOURDOMAIN.com \
  --agree-tos -m you@example.com --no-eff-email

sudo ls /etc/letsencrypt/live/
sudo nginx -t && sudo systemctl start nginx
```

Because the certificate was issued in standalone mode, renewal also needs port
80. Add hooks so automatic renewal does not fail silently in three months:

```bash
printf '#!/bin/sh\nsystemctl stop nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh
printf '#!/bin/sh\nsystemctl start nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
sudo certbot renew --dry-run
```

## 8. Verify

```bash
curl -sI https://speed.YOURDOMAIN.com | head -3
curl -s  https://speed.YOURDOMAIN.com/api/health
```

---

# Pi Network setup

Pi offers two authentication mechanisms and the site picks the right one at
runtime:

| Environment | Mechanism | Behaviour |
|---|---|---|
| Ordinary browser | Pi Sign-in, OAuth 2.0 implicit on `accounts.pinet.com` | the user is sent to Pi and returns to `/signin/callback` |
| Inside Pi Browser | `window.Pi.authenticate()` from the JS SDK | no redirect; Pi Browser shows the consent dialog natively |

They are not interchangeable. Pi Sign-in refuses to run inside the Pi Browser
("Signing in from inside Pi Browser isn't supported yet"), and
`Pi.authenticate()` only exists where `window.Pi` does. Both paths post their
token to `/api/auth/pi`, which verifies it the same way.

## 1. Register the app

Open `pi://develop.pi` inside the Pi Browser and create a new app. The network
(Mainnet or Testnet) is chosen at creation and **cannot be changed afterwards**.
Pi recommends two separate apps: one on Testnet for development and one on
Mainnet for release. They cannot share a URL.

## 2. Verify domain ownership

Until the domain is verified you can only register a loopback redirect URI.

```ini
PI_VALIDATION_KEY=<the key from the portal>
```

Restart, then confirm from outside:

```bash
curl -s https://YOURDOMAIN.com/validation-key.txt
```

The exact key should come back, with no extra whitespace. Then press
**Verify Domain** under Checklist → App Domain in the portal.

## 3. Enable Pi Sign-in

In the app page, open the **Pi Sign-in** section and switch **Enabled** on. The
portal issues an **oAuth Client ID**:

```ini
PI_CLIENT_ID=rOWjO7_UmFMvpEGw_...
```

This value is public. There is no client secret, because only the implicit flow
is supported.

## 4. Register the redirect URI

In the same section, add:

```
https://YOURDOMAIN.com/signin/callback
```

Character for character, with the protocol and no trailing slash. Portal rules:
production URIs must be `https` on the verified domain; `localhost`, `127.0.0.1`
and `[::1]` are always allowed and may use `http`; any other host is rejected.

## 5. Two details that decide whether the SDK path works

Pi's own integration checklist has two requirements that produce a bare
"Authentication failed" when missed:

**`Pi.init()` must have settled.** It returns a promise and no other SDK method
may run before it resolves. The site awaits it, and awaits it again immediately
before `authenticate`.

**`Pi.authenticate` needs at least `username` and `payments`.** With `username`
alone Pi rejects the request. The OAuth path is the opposite — it does not accept
`payments` at all — so there are two separate variables:

```ini
PI_SCOPES=username wallet_address
PI_SDK_SCOPES=username payments wallet_address
```

**`wallet_address` is required to pay rewards.** Creating an App-to-User payment
needs the recipient's public key, and Pi refuses to hand it over unless that
user granted the scope:

```
401 missing_scope: User hasn't authorized "wallet_address" scope for you to access the public key.
```

The grant belongs to the user, not to the app, so anyone who signed in before
this scope was requested has to sign in once more and approve it. The site shows
them exactly that: if they win while missing the permission, the claim button
reads **Approve wallet access** instead. The admin leaderboard marks such
entries with *no wallet permission*, so you can see before pressing Pay whether
a winner can actually be paid.

Requesting `payments` is only consent to request a payment later. Creating one
requires the Server API Key.

**The Content Security Policy must allow every Pi origin.** The SDK does not
confine itself to `api.minepi.com`: inside the Pi Browser it calls
`https://socialchain.app/v2/me` directly, and the shell talks to
`sandbox.minepi.com` and `app-cdn.minepi.com`. A blocked request surfaces as the
same generic "Authentication failed", with the real cause visible only in the
console. The server ships the full list. If a CDN in front of the site imposes
its own CSP header, the same origins must be there too.

## 6. Cookies

```ini
COOKIE_SAMESITE=none
TRUST_PROXY=1
```

Pi may render the app inside its own frame, which puts your cookies in a
third-party context. Browsers do not send `SameSite=Lax` cookies there, so the
user signs in successfully and immediately appears signed out. `SameSite=None` is
only accepted on `Secure` cookies, which is why `TRUST_PROXY` has to work first.

## 7. Check the configuration before testing

```
https://YOURDOMAIN.com/pi-test.html
```

Shows the exact URL the site will send to `accounts.pinet.com`, the client ID,
the redirect URI and which mechanism the current browser will use. Or from the
server:

```bash
curl -s "https://YOURDOMAIN.com/api/auth/diagnose?token=$ADMIN_TOKEN" | python3 -m json.tool
```

## Pi troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sign-in button hidden | `PI_CLIENT_ID` empty | enable Pi Sign-in in the portal and set the client ID |
| Pi rejects the redirect URI | not registered, or not an exact match | copy `redirectUri` from the diagnose output into the portal verbatim |
| Callback reports a state mismatch | the page was reloaded or opened in another tab | start sign-in again from the site |
| `error=access_denied` | the user declined consent | expected behaviour |
| `stage=rejected` on the server | token expired or issued for another client ID | sign in again; implicit tokens are short-lived |
| `stage=network` on the server | the server cannot reach `api.minepi.com` | open outbound HTTPS and check DNS |
| `Authentication failed` inside Pi Browser | usually a CSP-blocked SDK request | search the console for "violates the following Content Security Policy" |
| `Connecting to 'https://socialchain.app/v2/me' violates…` | origin missing from `connect-src` | update to the current build, which includes it |
| Signed in but immediately signed out | session cookie not sent back | set `COOKIE_SAMESITE=none` and `TRUST_PROXY=1` |
| `postMessage … app-cdn.minepi.com` in an ordinary browser | SDK path selected outside the Pi Browser | update; detection is now by user agent only |
| Production URI cannot be registered | domain not verified yet | complete step 2 |
| `MaxListenersExceededWarning`, `ObjectMultiplex` | a wallet extension in the desktop browser | noise, unrelated to this site |
| Sandbox frame stays empty, `current app not loaded` | something is sending `X-Frame-Options` | it must not be sent; check any proxy or CDN in front |
| `Grammarly.js` warnings | a browser extension | noise, unrelated to this site |
| `_ga` / `_gid` cookie warnings | Google Analytics inside the OpenSpeedTest widget | their domain, not ours; this site has no analytics |

Reference: <https://docs.minepi.com/>

---

# Donations

The donation panel sits under the speed test widget and uses user-to-app
payments. It stays hidden until `PI_API_KEY` is set.

## Requirements

- A **Server API Key** from the Developer Portal. It never leaves the server.
- The **App Wallet** connected in the portal checklist — it receives the payments.
- The `payments` scope, already present in `PI_SDK_SCOPES`.

```ini
PI_API_KEY=<server key from the portal>
DONATIONS_ENABLED=true
DONATION_PRESETS=0.5,1,5,10
DONATION_MEMO_MAX=50
```

## The three phases

1. The browser calls `Pi.createPayment` and the wallet dialog opens, locked until
   the server approves.
2. The server reads `GET /v2/payments/{id}`, confirms the payment belongs to the
   signed-in user, then calls `POST /v2/payments/{id}/approve`.
3. The user signs, the transaction goes on-chain, and the server finalises it with
   `POST /v2/payments/{id}/complete` and the txid.

Nothing counts as received before phase three returns 200.

## Reading donor messages

The donor's text travels with the payment as its memo, so it is visible when the
transaction is reviewed. Do not rely on that alone: blockchain memos are short and
wallet views may truncate them. The full text is always kept in the site's own
database:

```bash
curl -s "https://YOURDOMAIN.com/api/payments/export.csv?token=$ADMIN_TOKEN" -o donations.csv
```

Columns: payment id, time, status, username, amount, **the full message**, txid,
network.

## Incomplete payments

If a user submits the transaction but finalisation fails, the payment stays
incomplete and blocks that user from starting another. The SDK reports it on every
authentication and the site settles it automatically through
`/api/payments/incomplete`.

## Limits

Donations only work inside the Pi Browser; `Pi.createPayment` does not exist
elsewhere. The site hides the form and explains why in an ordinary browser. On
Testnet all amounts are test Pi. Moving to Mainnet requires the API key and the
wallet to be on that network too.

| Symptom | Cause | Fix |
|---|---|---|
| Donation panel not shown | `PI_API_KEY` empty | set the server key |
| Mainnet button not shown | `MAINNET_URL` empty | set it in `.env` |
| "This payment does not belong to you" | session user differs from the payer | sign in again |
| 502 during approval | invalid API key or wrong network | check the key and the app's network |
| User paid but nothing recorded | finalisation failed | settled automatically on their next sign-in |

---

# Running locally

You do not need a server to work on this. Everything except Pi sign-in and
payments runs on your own machine.

```bash
npm install
npm run fonts
cp .env.example .env
npm run dev
```

`npm run dev` restarts on file changes. Open `http://localhost:8080`.

## What works without any Pi setup

The speed widget, the latency test, history, statistics, the requirements
calculator, all four themes and both legal pages. Leave `PI_CLIENT_ID` empty and
the sign-in button hides itself; leave `PI_API_KEY` empty and the donation panel
stays hidden. Nothing breaks.

A minimal local `.env`:

```ini
SITE_URL=http://localhost:8080
TRUST_PROXY=false
HASH_SALT=local-development-only
GEO_PROVIDER=none
```

`GEO_PROVIDER=none` skips the provider lookup, which is the only outbound call
the server makes on its own.

## Testing Pi sign-in locally

The Developer Portal accepts loopback redirect URIs, and unlike production ones
they may use plain `http`:

```
http://localhost:8080/signin/callback
```

Add that to the Redirect URIs list alongside your production URI, then set
`PI_CLIENT_ID` in the local `.env`. The OAuth path then works in an ordinary
desktop browser: you are sent to Pi, approve, and come back to localhost.

For the in-Pi-Browser path you need the Sandbox instead. Set a Development URL in
the portal, then:

```ini
PI_SANDBOX=true
```

and open the **Sandbox URL the portal gives you**, not `localhost` directly. The
sandbox loads your local site inside the Pi container so `window.Pi` exists.
Opening `http://localhost:8080` on its own will never produce a working SDK
session, because there is no Pi container above the page.

If your machine is not reachable from the internet, put a tunnel in front of it
(`cloudflared tunnel --url http://localhost:8080` or similar) and register the
tunnel URL as the Development URL.

### If the sandbox shows an empty frame

The console fills with `Discarding message - current app not loaded` and nothing
renders. The sandbox loads your site inside an iframe, so anything that forbids
framing stops it dead:

- **`X-Frame-Options`** must not be sent at all. This project disables Helmet's
  frameguard for exactly this reason and relies on `frame-ancestors` instead,
  which names the Pi origins explicitly. If you put a proxy or CDN in front that
  adds the header back, the sandbox breaks again.
- **`frame-ancestors`** must include `https://*.minepi.com`. It does by default.
- **The Development URL must match** what you are serving. `http://localhost:8080`
  only works if the site is actually running there on the same machine that has
  the sandbox open.

Check both headers from outside:

```bash
curl -sI https://YOURDOMAIN.com/ | grep -i "x-frame-options"
curl -sI https://YOURDOMAIN.com/ | grep -io "frame-ancestors[^;]*"
```

The first should print nothing at all. The second should list the Pi domains.

## Testing payments locally

Donations and payouts need `PI_API_KEY`, and payouts additionally need
`PI_WALLET_PRIVATE_SEED`. Use a **Testnet app with a Testnet wallet** for this and
keep only test Pi in it. There is no offline simulator: the SDK talks to the real
Pi API, so a local run with a Testnet key moves real Testnet coins.

## Keeping local data separate

```ini
DB_FILE=./data/local.db
```

Then `rm data/local.db*` whenever you want a clean slate. The schema is recreated
on the next start.

## A quick reset

```bash
rm -f data/*.db*
npm run dev
```

---

# Running both networks

Testnet and Mainnet are two deployments of the same code with different
configuration, and each links to the other so a visitor can cross over.

On the **Testnet** site:

```ini
PI_NETWORK=testnet
SITE_URL=https://test.example.com
ALT_NETWORK_URL=https://example.com
```

On the **Mainnet** site:

```ini
PI_NETWORK=mainnet
SITE_URL=https://example.com
ALT_NETWORK_URL=https://test.example.com
```

The button label is worked out from `PI_NETWORK`: the Testnet site offers "Open
the Mainnet site" and the Mainnet site offers "Open the Testnet site". Override
it with `ALT_NETWORK_LABEL` if you prefer different wording. Leave
`ALT_NETWORK_URL` empty and the link disappears everywhere.

Two ready-made templates ship with the project: copy `.env.testnet.example` or
`.env.mainnet.example` to `.env` and fill in the four secrets each marks.

Everything else differs per deployment: each needs its own app in the Developer
Portal, its own client ID, its own server API key and its own wallet. An app's
network is fixed when it is created, so these can never be shared.

The two sites keep separate databases. Accounts, history, leaderboards and
rewards do not cross between them, which is the point: Testnet results should
never influence a Mainnet payout.

---

# News

Posts are written in the admin dashboard and served as real HTML from the
database, so an announcement is visible to a crawler and to anyone with
scripting turned off.

- `/news` lists everything published.
- `/news/<address>` is a single post. An unpublished draft returns 404 rather
  than quietly showing something else.
- The three most recent posts appear at the foot of the home page.

A post has a title, an optional address, an optional summary and a body. Leave
the address empty and it is built from the title; a clash gets a numeric suffix
rather than overwriting an existing URL. Leave the summary empty and the first
line of the body is used.

## Formatting

A deliberately small subset of Markdown: `##` and `###` headings, `-` bullets,
`1.` numbered lists, `>` quotes, `**bold**`, `*italic*`, `` `code` `` and
`[text](https://link)`. Blank lines separate paragraphs.

Everything is escaped before any of that is applied, and only absolute `https`
links are turned into anchors. A full Markdown parser would mean trusting its
HTML passthrough with stored content, which is not a trade worth making for a
few formatting conveniences.

## Drafts and pinning

**Published** off keeps a post visible only in the dashboard. **Pinned** keeps
it at the top of the list and marks it as such.

---

# Ads

The site can show an advert before signing in and before the latency test,
through the Pi Developer Ad Network.

## Before you enable it

- The app must be **approved for the Developer Ad Network** in the Developer
  Portal. Until then the SDK will simply report that ads are unavailable.
- `PI_API_KEY` must be set. A rewarded view is worthless until the server has
  checked it, and that check needs the server key.

```ini
ADS_ENABLED=true
ADS_BEFORE_SIGNIN=true
ADS_BEFORE_LATENCY=true
ADS_COOLDOWN_SECONDS=300
ADS_BLOCK_ON_FAILURE=false
```

All of these are also editable from the admin dashboard without a restart.

## One platform rule worth knowing

**A rewarded ad can only be shown to a user who is already signed in.** Pi
answers `USER_UNAUTHENTICATED` otherwise, and the documentation states it
plainly: rewarded ads exist to reward a user, so there has to be a user.

That makes "rewarded ad before sign-in" impossible by design. The gate before
sign-in therefore shows an **interstitial**, which needs no account. The gate
before the latency test shows a **rewarded** ad when the visitor is signed in
and an interstitial when they are not. Both are full-screen; the difference is
whether Pi can attribute the view to an account.

## Verifying a rewarded view

A modified client can fake the SDK response, so the `adId` it returns proves
nothing. The server checks it against the Platform API and accepts the view only
when `mediator_ack_status` is `granted`. Every result is written to the
`ad_views` table, and a repeated `adId` is answered from that record rather than
asked again.

The dashboard shows total views, how many were granted, and a breakdown per
placement.

## Design decisions you may want to change

**A failed advert never blocks the action.** If the ad cannot load, the Pi
Browser is too old, or the visitor is in an ordinary browser, the sign-in or the
test proceeds anyway. Losing a feature because an advert did not arrive is not
the visitor's fault. `ADS_BLOCK_ON_FAILURE=true` reverses this if you would
rather hold the gate.

**Automatic repeats are never gated.** Monitor mode reruns the latency test on a
timer; interrupting each repeat with a full-screen advert would make the feature
unusable. Only a run the visitor started passes through the gate.

**The cooldown stops the same gate firing repeatedly.** Five minutes by default.

**The site says so in advance.** A short note above the donation panel explains
when an advert will play. Surprising people with a full-screen advert is how a
useful tool starts feeling cheap.

---

# Sharing

`Pi.openShareDialog(title, message)` opens the phone's own share sheet from
inside the Pi Browser. The site uses it in three places:

- **A latency result** — median, provider, how many services answered and the
  closest one.
- **A leaderboard standing** — your rank, the current leader and an invitation
  to beat it. A leaderboard that can be shared recruits its own players.
- **After a donation** — with the donor's own message, if they left one.

Outside the Pi Browser the same buttons fall back to the Web Share API, and to a
clipboard copy where that is missing, so the button always does something.

---

# Admin dashboard

A dashboard at `/admin` where every runtime setting can be changed without
touching the server.

## Who can open it

Access is by Pi username, not by password:

```ini
ADMIN_USERNAMES=yourname
```

Comma separated for several people, without the `@`. Leave it empty and nobody
can open the dashboard, including you. Restart after changing it, because this
one is read from the environment on purpose: a compromised session can then
never grant itself admin rights.

Administrators sign in with Pi exactly like any other visitor; the dashboard
checks the username on the session against the list. A signed-in administrator
also sees an Admin link in the site footer.

`ADMIN_TOKEN` is separate and still used for the CSV exports, which are meant
for scripts rather than browsers.

## What it shows

- **Totals** - runs, runs in the last 24 hours, average latency, Pi accounts,
  donations.
- **Server** - whether the API key and wallet seed are present, who the
  administrators are, and where the leaderboard day currently falls. Secrets are
  never sent to the browser, only whether they are set.
- **Settings** - every runtime option, grouped, with the value marked *default*
  while it still follows the environment file.
- **Leaderboard and payouts** - load any day, see the standings the server would
  use, and pay the winner directly.
- **Payout history** and a log of **recent settings changes**, with who made them.

## What can be changed from the dashboard

| Group | Settings |
|---|---|
| Reward | enabled, payout mode, amount, memo |
| Qualifying | minimum targets reached, minimum and maximum run duration |
| Schedule | day boundary offset from UTC, claim window, leaderboard size |
| Donations | enabled, minimum, maximum, message length, Mainnet link and label |
| Site | store latency runs, public statistics |

Changes are written to the database and take effect immediately - no restart, no
redeploy. The environment file stays the fallback, so removing a database
override returns that setting to whatever `.env` says.

**Payout mode** decides who releases the reward:

- `winner-claims` - the winner presses the button on the leaderboard themselves.
- `admin-pays` - that button never appears and every payout goes through this
  dashboard. Use this on Mainnet, where a fabricated result is worth attacking.

## What cannot be changed there, on purpose

`PI_API_KEY`, `PI_WALLET_PRIVATE_SEED`, `HASH_SALT`, `ADMIN_USERNAMES` and the
database path stay in the environment file. A web form that can edit its own
secrets is a web form that can leak them.

---

# Daily reward (A2U payments)

The leaderboard ranks every signed-in user by their best run of the day, and the
winner of a finished day can claim a payout from the app wallet. This uses
App-to-User payments through the official `pi-backend` package.

## What it needs

```ini
REWARDS_ENABLED=true
PI_API_KEY=<server key from the portal>
PI_WALLET_PRIVATE_SEED=S...
REWARD_AMOUNT=0.1
REWARD_MEMO=Daily latency champion
```

**The private seed is the wallet.** Anyone who reads it can move every coin in
that wallet, and no password protects it. Use a wallet created for this purpose,
keep only what you intend to pay out in it, restrict `.env` to the deploy user
(`chmod 600 .env`), and keep it out of version control. If it ever leaks, move
the funds and generate a new wallet immediately.

The seed is never sent to the browser and never appears in `/api/config`.

## How the winner is decided

- Only signed-in runs count, so entries are tied to a Pi account.
- Each run scores the **average latency across the targets that answered**.
- A run qualifies only if at least `REWARD_MIN_REACHABLE` targets answered.
- Each user is ranked by their **best** qualifying run that day, so testing more
  often cannot hurt and cannot stack.
- Lowest score wins.

The day boundary is UTC unless you shift it with `REWARD_DAY_OFFSET_MINUTES`
(210 for UTC+3:30, for example).

## Claiming

A day becomes claimable once it has finished, and stays claimable for
`REWARD_CLAIM_WINDOW_DAYS`. The winner presses the button on the leaderboard and
the server:

1. recomputes the leaderboard from the database, ignoring anything the browser
   claims,
2. checks the signed-in account is the winner,
3. takes a lock in the `rewards` table so a day can only ever pay once,
4. runs `createPayment` → `submitPayment` → `completePayment`.

If the process fails partway, the payment id and txid are stored and a retry
resumes from where it stopped rather than paying twice.

Today's board is visible but not claimable by the winner, because the standings
can still change until the day ends.

## Settling a day early

An administrator can pay the current leader at any moment, including mid-day,
from the dashboard. Paying freezes that day's board at the instant of payment:
every run recorded afterwards is excluded from that day's standings, so it can
neither change a result that has already been paid nor carry into the next day.
The following day starts a clean leaderboard as usual.

The dashboard warns before doing this, because the rest of the day genuinely
stops counting.

## Which network, and which wallet

Neither is guessed and neither needs configuring.

**The network** comes from Pi. `createPayment` returns a payment record that
carries its own `network` field, and the SDK picks the Horizon endpoint from it:
Testnet for a Testnet app, Mainnet for a Mainnet app. `PI_NETWORK_PASSPHRASE`
exists only as an override and should stay empty.

**The recipient** comes from Pi too. An A2U payment is created against the
user's **uid**, not a wallet address, and Pi fills in the destination address in
the payment record. The site never asks anyone for a wallet address, and it
should not: a mistyped address is money gone.

**The sender** is your app wallet, and this one you must get right.
`PI_WALLET_PRIVATE_SEED` has to be the seed of the wallet connected to this app
in the portal checklist. The SDK checks it and refuses otherwise:

```
You should use a private seed of your app wallet!
```

## If the server restarts when you press Pay

The symptoms: the payout row reads "interrupted by a server restart", and any
button that touches the payment library - **Check the payout path** included -
comes back with "The server did not answer". Nothing else on the site is
affected.

That is a process crash, not a payment error. The payment library depends on a
native signing addon (`sodium-native`) that ships prebuilt binaries for glibc
only. On an Alpine image (musl) it either fails to build or loads a binary that
aborts the process the first time it is used. Docker restarts the container,
the row is marked interrupted, and no JavaScript error is ever logged because
the crash happens below JavaScript.

The Docker image is therefore based on `node:20-bookworm-slim` (glibc). If you
run the site some other way, use a glibc system - Debian, Ubuntu - rather than
Alpine.

Confirm which case you are in:

```bash
docker compose ps
docker compose logs --tail=100 web
```

A restart count that climbs each time you press Pay, with no `[a2u]` error
between the startup banners, is the crash. **Check the payout path** now also
prints the runtime: Node version, platform, libc, and whether signing uses
`sodium-native` or the pure-JavaScript fallback. Either signing method is fine;
a crash is not.

After moving to the glibc image:

```bash
docker compose build --no-cache
docker compose up -d
```

## Payouts run in the background

A blockchain submission can take longer than any proxy is willing to wait. When
the proxy gives up the browser sees a 502 while the server is still working, and
a payout that is actually progressing looks stuck.

So the request only *starts* the payout and returns `202` immediately. The work
continues on the server and writes its progress to the reward row, which the
dashboard polls: `creating`, `submitting`, `completing`, then `paid` or `failed`
with the reason. Closing the page does not stop it.

If the process restarts mid-payout, the row cannot be resumed automatically, so
on startup anything left in flight is marked failed with
"interrupted by a server restart" and can be retried. A payment already created
on the Pi side is picked up again rather than duplicated.

`GET /api/admin/rewards/status?day=YYYY-MM-DD` returns the current state at any
time.

## One open payment at a time

Pi permits a single open server payment per app. If an attempt dies between
creating a payment and completing it, every later payout is refused until that
one is closed — which looks like a payout that fails forever for no reason.

The dashboard has **Settle pending Pi payments** for this. A payment that
already reached the blockchain is completed with its own txid; one that never
did is cancelled. Neither invents a transaction. A payout also runs this check
itself before creating anything new.

## Testing the payout path without paying anyone

The dashboard has a **Check the payout path** button. It confirms that the
server key is accepted, that the wallet seed loads, and prints the wallet
address the seed produces along with any payments Pi still considers
incomplete. It moves no funds.

The wallet address it shows must be the wallet connected to the app in the
portal. If it is not, the seed is for the wrong wallet and every payout will
fail with "You should use a private seed of your app wallet".

Admin view of every payout:

```bash
curl -s "https://YOURDOMAIN.com/api/rewards/history?token=$ADMIN_TOKEN" | python3 -m json.tool
```

## What you should know before turning this on

**Latency figures are measured by the visitor's browser and reported to the
server. They cannot be fully verified.** Nothing stops someone from calling the
API directly with invented numbers. The site raises the cost of doing that:

- The server issues a token before a run starts, signed with `HASH_SALT`. The
  run must present it, must take a plausible amount of wall-clock time, and the
  token cannot be reused. Runs without a valid token are stored but never rank.
- Only signed-in accounts can appear on the leaderboard.
- A run needs several reachable targets to qualify.
- Claims are rate limited and a day can only ever pay once.

None of that is proof. Keep the reward small, watch
`/api/rewards/history`, and treat this as a game rather than a payout scheme. If
you move it to Mainnet with amounts that are worth attacking, review each winner
before releasing funds — for example by setting `REWARDS_ENABLED=false` and
paying manually from the leaderboard data.

| Symptom | Cause | Fix |
|---|---|---|
| Leaderboard empty | no signed-in qualifying runs yet | sign in and run the latency test |
| A run does not rank | no valid run token, or too few targets answered | the run must be started from the site, not posted directly |
| Claim button absent | the day has not finished, or you are not the winner | today's board is not claimable |
| `401 missing_scope` on payout | the winner never granted `wallet_address` | they sign in again and approve wallet access; the reward can then be sent |
| Claim fails with 502 | wallet seed, balance, or network mismatch | the exact reason is stored on the payout row and shown in the dashboard's Detail column |
| A payout is stuck on "processing" | the attempt was cut off, often by a proxy read timeout | press Release in the dashboard, then Retry. The lock also clears itself after five minutes |
| "Wallet private seed must be 56-character long" | `PI_WALLET_PRIVATE_SEED` is wrong or truncated | paste the full seed, which starts with S |
| "You should use a private seed of your app wallet" | the seed belongs to a different wallet | it must be the wallet connected to this app in the portal checklist |
| "The app wallet does not exist on this network yet" | the wallet has never been funded | a Pi account only exists once it holds a balance; send test Pi to it first |
| Payout hangs and never resolves | fixed: the payout no longer runs inside the request | the button returns immediately and the status is polled |
| 502 when starting a payout | the proxy, not the payout | check `docker compose logs -f web` for a `[a2u]` line; the payout itself is unaffected |
| Status stays `submitting` after a restart | the process was replaced mid-payout | it is marked failed on the next start; press Retry |
| "already being processed" | a previous attempt is mid-flight | wait, then retry; it resumes rather than repaying |

---

# npm audit

`npm install` reports warnings and `npm audit` reports advisories. Here is what
each one actually is.

## Deprecation warnings

```
prebuild-install ... stellar-base ... js-xdr ... stellar-sdk
```

All four come from other people's packages, not from this project.
`prebuild-install` belongs to `better-sqlite3`; the three Stellar ones belong to
`pi-backend`, which still depends on the old `stellar-sdk` rather than the
renamed `@stellar/stellar-sdk`. They are notices, not errors, and nothing here
depends on them being resolved.

## The advisories, and what they are worth

Two groups, with different answers.

**qs, via express — fixed.** `package.json` carries an override pinning `qs` to
`^6.16.0`, which removes it. `npm audit fix` alone does not, because Express 4
pins the exact version at the top of the vulnerable range.

**axios and toml, via stellar-sdk, via pi-backend — no fix exists.** `pi-backend`
depends on `stellar-sdk@10.4.1`, which is deprecated and pins old `axios` and
`toml`. Until Pi publishes an updated `pi-backend` there is no version to upgrade
to, and forcing a newer axios would be swapping a known advisory for an unknown
incompatibility in code that moves money.

The exposure is narrow. Almost every axios advisory needs an attacker-controlled
URL, proxy configuration or request body. Here, `pi-backend` only ever calls Pi's
own API with URLs this project constructs, and no visitor input reaches it.
That is a reason not to panic, not a reason to call it safe.

## Reducing what you install

`pi-backend` is an **optional** dependency, and the code loads it lazily. If you
are not paying rewards, do not install it:

```bash
npm install --omit=optional
```

That leaves 113 packages instead of 168 and removes axios, toml and the whole
Stellar tree from disk. The donation flow, sign-in, the leaderboard and every
measurement feature work exactly the same; only the A2U payout needs it, and
attempting one without it returns a clear message telling you to install it.

Note that `npm audit` reads `package.json` rather than what is on disk, so it
still lists these advisories after `--omit=optional`. Check `ls node_modules`
if you want to confirm they are genuinely absent.

## What to do about it

- Run `npm install` and accept the four remaining advisories, or
- run `npm install --omit=optional` if you do not need payouts, and enable them
  later by installing the one package.

Re-check periodically: `npm view pi-backend version`. When Pi ships a release
built on `@stellar/stellar-sdk`, updating the version in `package.json` clears
all four at once.

---

# Publishing to GitHub

The project ships ready to publish. A few reminders specific to this repo:

- `.gitignore` already excludes `node_modules/`, `data/`, `.env` and the
  downloaded fonts. `.env.testnet.example` and `.env.mainnet.example` are
  templates and are meant to be committed; your real `.env` is not.
- The `LICENSE` file is the [PiOS License](https://github.com/pi-apps/PiOS/blob/main/LICENSE).
  If you fork this for your own app, update the copyright line at its top.
- `README.md` is written for GitHub, not for an end user of the site — it
  documents the Pi integration for other developers. Update its gotchas
  section if you find another one; that list is the most valuable part of
  this repository to the next person who touches Pi payments or ads.

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/internet-speed.git
git push -u origin main
```

---

# Behind a CDN

## Caching

| Type | Header | Reason |
|---|---|---|
| HTML | `no-store` | a stale document pairs a new deploy with an old script |
| Fonts, icons | `max-age=31536000, immutable` | the name never changes and neither does the content |
| CSS, JS | `max-age=600, s-maxage=3600, stale-while-revalidate=86400` | the edge serves instantly and refreshes behind it |

Filenames are not content-hashed because ES modules import each other by relative
path, so hashing would mean rewriting every import. `stale-while-revalidate` gives
the same speed without that fragility.

**Purge the cache after every deploy.** Otherwise the edge may serve the previous
CSS and JS for up to an hour, which shows up as a half-styled page. The build
stamp in the footer tells you which version you are looking at.

## Cloudflare specifics

- **Turn Rocket Loader off.** It injects an inline script that the Content
  Security Policy blocks, and it rewrites module loading. There is no way to allow
  it that is worth having: it would need `'unsafe-inline'`, which defeats the
  policy. Speed → Optimization → Content Optimization → Rocket Loader.
- **Turn Auto Minify off for JavaScript.** The code is ES modules.
- **Leave Brotli on.**
- **Web Analytics** loads `beacon.min.js` from its own domain and will be blocked.
  Either disable it, or allow the origins:

```ini
CSP_SCRIPT_SRC_EXTRA=https://static.cloudflareinsights.com
CSP_CONNECT_SRC_EXTRA=https://cloudflareinsights.com
```

Note that the privacy policy states the site carries no third-party analytics. If
you enable Cloudflare's, update that document.

---

# "The site has not updated"

Every response carries a build stamp, so this is answerable rather than guesswork.
It appears in the `X-App-Build` header, in `/api/health`, and in the site footer.

```bash
curl -s https://YOURDOMAIN.com/api/health
curl -sI https://YOURDOMAIN.com/ | grep -i x-app-build
```

If those differ from the footer in your browser, something is caching. If they
match and you still see an old page, the browser itself is at fault.

- **Cloudflare** — Caching → Configuration → Purge Everything.
- **Windows DNS** — `ipconfig /flushdns`, then `nslookup YOURDOMAIN.com`.
- **Hard reload** — `Ctrl+F5`, or DevTools → right-click reload → Empty Cache and
  Hard Reload.
- **Bypass everything** — open `https://YOURDOMAIN.com/?v=1`. If that is current,
  the cause was definitely cache.

---

# Maintenance

**Backups** — all data is in one SQLite file:

```bash
mkdir -p ~/backups
sqlite3 ~/internet-speed/data/internet-speed.db ".backup ~/backups/db-$(date +%F).sqlite"
```

Daily via cron:

```bash
crontab -e
# 0 4 * * * sqlite3 /home/deploy/internet-speed/data/internet-speed.db ".backup /home/deploy/backups/db-$(date +\%F).sqlite"
```

Keep `.env` backed up separately but do keep it: a database without its matching
`HASH_SALT` loses the ability to correlate repeat submissions.

**Updates**

```bash
cd ~/internet-speed && docker compose up -d --build
```

**Logs**

```bash
docker compose logs -f web
sudo tail -f /var/log/nginx/internet-speed.error.log
```

---

# General troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Widget stays blank | the browser cannot reach openspeedtest.com | try another network |
| Widget blocked | `frame-src` in the CSP | `openspeedtest.com` must be listed; it is by default |
| Every latency target unreachable | target origins missing from `connect-src` | restart so the CSP is rebuilt from `pingTargets` |
| One target always unreachable, console shows `403` | that host refuses plain cross-origin requests | replace it in `pingTargets`; test candidates from a browser, not only with curl |
| Latency much higher than command-line ping | expected | the figure includes DNS and TLS; the site explains this |
| All visitors share one IP | `TRUST_PROXY` not set | set it to `1` and restart |
| Provider shows as unknown | the server cannot reach the geolocation service | set `GEO_PROVIDER=none` or open outbound access |
| 429 during a test | rate limiting | raise `limit` in `server/index.js` |
| `open() "/etc/letsencrypt/options-ssl-nginx.conf" failed` | certificate obtained in standalone mode | use `ssl-common.conf` as described in step 7 |
| `cannot load certificate` | certificate not issued yet | check `sudo ls /etc/letsencrypt/live/` and rerun certbot |

---

# Without Docker

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 sqlite3

cd ~/internet-speed
npm install --omit=dev
npm run fonts
cp .env.example .env && nano .env
```

```bash
sudo tee /etc/systemd/system/internet-speed.service > /dev/null <<'UNIT'
[Unit]
Description=Internet Speed
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/internet-speed
EnvironmentFile=/home/deploy/internet-speed/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now internet-speed
sudo systemctl status internet-speed
```

Nginx and TLS are identical to the steps above.
