# Contributing

Thanks for considering it. A few things that make a change easy to review.

## Before you start

For anything beyond a small fix, open an issue first describing what you want to
change and why. It saves both of us the work of a pull request that heads in a
direction the project will not take.

## Ground rules

- **No frontend framework, no bundler, no build step.** The browser code is
  plain ES modules, on purpose (see the README's "Why no framework" section).
  A new npm dependency for the frontend needs a strong justification.
- **No comments in shipped code.** The project keeps its reasoning in commit
  messages, `DEPLOY.md` and this repository's docs, not inline. If you are
  used to commenting non-obvious code, put the explanation in the pull request
  description instead.
- **If you change what is stored or sent, update the privacy policy in the
  same change.** `public/legal/privacy.html` describes what the code actually
  does; a pull request that changes behaviour without updating it will be
  asked to.
- **Test both Pi code paths.** The OAuth flow (ordinary browser) and the SDK
  flow (Pi Browser) are genuinely different code, not two branches of the same
  one. A change to sign-in, payments or ads needs to be checked in both.

## Local setup

```bash
npm install
npm run fonts
cp .env.example .env
npm run dev
```

Everything except Pi sign-in, payments and ads works with no Pi configuration.
See `DEPLOY.md`'s "Running locally" section for testing the Pi-specific paths
against the sandbox.

## Reporting a bug

Include: what you expected, what happened, the relevant lines from
`docker compose logs web` (or your server's equivalent), and whether it was in
the Pi Browser, an ordinary browser, or both. For a payment or ad issue, the
admin dashboard's diagnostic output (Check the payout path, or the ad totals)
is usually the fastest way to narrow it down.

## Security

If you find a vulnerability, please do not open a public issue. Email the
address in the site's own `/about` page instead.
