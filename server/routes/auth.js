import { Router } from 'express';
import { asyncRoute } from '../util/async-route.js';
import rateLimit from 'express-rate-limit';
import site from '../../config/site.config.js';
import { verifyAccessToken, probePiApi, newSessionToken, hashToken } from '../util/pi.js';
import {
  upsertUser, createSession, findSession, deleteSession, purgeSessions, claimAnonymousRuns, getUser,
} from '../db.js';
import { ensureClientId, cookieOptions } from '../util/net.js';
import { tokenMatches } from '../util/auth-token.js';

const router = Router();
const COOKIE = 'ng_session';

const authLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes.' },
});

router.post('/pi', authLimit, asyncRoute(async (req, res) => {
  if (!site.pi.enabled) {
    return res.status(503).json({ error: 'Pi sign-in is disabled on this server.', stage: 'disabled' });
  }

  const result = await verifyAccessToken(req.body?.accessToken);

  if (!result.ok) {
    console.error(
      `[pi] sign-in failed | stage=${result.stage} status=${result.status ?? '-'} ` +
      `ms=${result.ms} api=${site.pi.apiBase} | ${result.detail}`
    );

    const status = result.stage === 'rejected' ? 401 : result.stage === 'input' ? 400 : 502;
    return res.status(status).json({
      error: result.detail,
      stage: result.stage,
      hint: hintFor(result.stage),
    });
  }

  const piUser = result.user;
  console.log(`[pi] sign-in ok | user=${piUser.username || piUser.uid.slice(0, 8)} ms=${result.ms}`);

  const user = upsertUser(piUser.uid, piUser.username, piUser.scopes);

  const clientId = ensureClientId(req, res);
  const claimed = claimAnonymousRuns(user.id, clientId);

  const token = newSessionToken();
  const ttl = site.pi.sessionDays * 24 * 60 * 60 * 1000;
  createSession(hashToken(token), user.id, ttl);
  purgeSessions();

  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: ttl });

  res.json({
    signedIn: true,
    user: {
      username: user.username,
      since: user.first_seen,
      scopes: (user.scopes || '').split(' ').filter(Boolean),
    },
    claimedRuns: claimed,
  });
}));

router.get('/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const session = currentSession(req);
  if (!session) return res.json({ signedIn: false });

  const user = getUser(session.user_id);
  const scopes = (user?.scopes || '').split(' ').filter(Boolean);
  res.json({
    signedIn: true,
    user: {
      username: session.username,
      scopes,
      canReceivePayments: scopes.includes('wallet_address'),
    },
  });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) deleteSession(hashToken(token));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ signedIn: false });
});

router.get('/diagnose', asyncRoute(async (req, res) => {
  if (!tokenMatches(site.server.adminToken, req.query.token)) {
    return res.status(403).json({ error: 'Set ADMIN_TOKEN and pass ?token=… to use this endpoint.' });
  }

  const probe = await probePiApi();
  const cookie = cookieOptions(req);

  res.json({
    piApi: { base: site.pi.apiBase, ...probe },
    config: {
      enabled: site.pi.enabled,
      sandbox: site.pi.sandbox,
      clientIdSet: Boolean(site.pi.clientId),
      clientId: site.pi.clientId || null,
      redirectUri: site.pi.redirectUri,
      scopes: site.pi.scopes,
      authorizeUrl: site.pi.authorizeUrl,
      sessionDays: site.pi.sessionDays,
      validationKeySet: Boolean(site.pi.validationKey),
    },
    request: {
      protocol: req.protocol,
      secure: req.secure,
      host: req.headers.host,
      forwardedProto: req.headers['x-forwarded-proto'] || null,
      trustProxy: site.server.trustProxy,
      trustProxyType: typeof site.server.trustProxy,
    },
    cookies: { sameSite: cookie.sameSite, secure: cookie.secure },
    framing: {
      xFrameOptions: 'not sent, so Pi can embed the app',
      frameAncestors: ['self', '*.minepi.com', '*.pinet.com', '*.socialchain.app'],
    },
    checklist: [
      req.secure
        ? 'HTTPS is being detected correctly.'
        : req.headers['x-forwarded-proto'] === 'https'
          ? 'Nginx IS sending X-Forwarded-Proto: https but Express is not trusting it. TRUST_PROXY is not being applied — it must be a number, e.g. TRUST_PROXY=1.'
          : 'This request was not seen as HTTPS. Pi Browser requires HTTPS — check that Nginx sends X-Forwarded-Proto and that TRUST_PROXY is set.',
      probe.reachable
        ? 'Outbound connection to the Pi Platform API works.'
        : 'This server cannot reach the Pi Platform API — sign-in cannot work until it can.',
      'Two sign-in paths exist: ordinary browsers use the OAuth redirect below, the Pi Browser uses window.Pi.authenticate(). Both post their token to /api/auth/pi.',
      site.pi.clientId
        ? 'An OAuth Client ID is configured (needed for ordinary browsers only).'
        : 'PI_CLIENT_ID is empty. Enable Pi Sign-in in the Developer Portal, copy the OAuth Client ID and set it — sign-in cannot work without it.',
      `The redirect URI this server will send is ${site.pi.redirectUri} — it must appear, character for character, in the Redirect URIs list in the Developer Portal.`,
      site.pi.validationKey
        ? 'A domain validation key is configured.'
        : 'PI_VALIDATION_KEY is empty; /validation-key.txt returns 404 and the Developer Portal cannot verify this domain.',
      !site.pi.enabled || cookie.sameSite === 'none'
        ? 'Cookies are set for a framed context, which is what Pi needs.'
        : `Cookies use SameSite=${cookie.sameSite}. Pi loads your app inside its own frame, so the browser will not send them back and the user will look signed out straight after signing in. Set COOKIE_SAMESITE=none.`,
    ],
  });
}));

function hintFor(stage) {
  switch (stage) {
    case 'network':
      return 'This server could not reach api.minepi.com. Check outbound HTTPS, DNS, and any firewall on the VPS.';
    case 'rejected':
      return 'Pi refused the token. It may have already expired — tokens from the implicit flow are short-lived — or the sign-in was started against a different client_id.';
    case 'api':
      return 'The Pi Platform API answered with an unexpected status. Try again shortly; if it persists, check the Pi status channels.';
    case 'input':
      return 'The browser did not send an access token. Reload the page inside the Pi Browser.';
    default:
      return 'See the server log for the full detail line.';
  }
}

export function currentSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return findSession(hashToken(token));
}

export default router;
