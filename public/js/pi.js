export const pi = {
  mode: null,
  signedIn: false,
  username: null,
  configured: false,
  reason: null,
};

const STATE_KEY = 'pi_oauth_state';
let cfg = null;

let initPromise = null;

export function inPiBrowser() {
  return /PiBrowser/i.test(navigator.userAgent);
}

export async function initPi(publicConfig) {
  cfg = publicConfig.pi || { enabled: false };

  if (!cfg.enabled) {
    pi.reason = 'disabled';
    return pi;
  }

  if (inPiBrowser() && typeof window.Pi !== 'undefined') {
    try {
      initPromise = Promise.resolve(window.Pi.init({ version: '2.0', sandbox: Boolean(cfg.sandbox) }));
      await initPromise;
      pi.mode = 'sdk';
      pi.configured = true;
    } catch (err) {
      console.warn('[pi] Pi.init failed:', err);
      pi.reason = 'init-failed';
    }
  } else if (cfg.clientId) {
    pi.mode = 'oauth';
    pi.configured = true;
  } else {
    pi.reason = 'no-client-id';
  }

  if (pi.configured) await refreshSession();
  return pi;
}

export async function refreshSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    const data = await res.json();
    pi.signedIn = Boolean(data.signedIn);
    pi.username = data.user?.username || null;
  } catch {
    pi.signedIn = false;
    pi.username = null;
  }
  return pi;
}

export async function signIn(returnTo = location.pathname + location.hash) {
  if (!pi.configured) throw Object.assign(new Error(messageFor(pi.reason)), { phase: 'config' });
  return pi.mode === 'sdk' ? signInWithSdk() : startOauthRedirect(returnTo);
}

async function onIncompletePaymentFound(payment) {
  console.info('[pi] incomplete payment reported:', payment);
  try {
    const { settleIncompletePayment } = await import('./donate.js');
    await settleIncompletePayment(payment);
  } catch (err) {
    console.warn('[pi] could not settle the incomplete payment:', err);
  }
}

export async function ensureSdkSession() {
  if (pi.mode !== 'sdk' || typeof window.Pi?.authenticate !== 'function') return false;
  if (initPromise) await initPromise;

  const scopes = cfg.sdkScopes?.length ? cfg.sdkScopes : ['username', 'payments'];
  const auth = await window.Pi.authenticate(scopes, onIncompletePaymentFound);
  return Boolean(auth?.accessToken);
}

async function signInWithSdk() {
  if (initPromise) await initPromise;

  const scopes = cfg.sdkScopes?.length ? cfg.sdkScopes : ['username', 'payments'];

  let auth;
  try {
    auth = await window.Pi.authenticate(scopes, onIncompletePaymentFound);
  } catch (err) {
    const raw = String(err?.message || err);
    throw Object.assign(new Error(raw || 'Pi Browser did not complete sign-in.'), {
      phase: 'sdk',
      raw,
    });
  }

  if (!auth?.accessToken) {
    throw Object.assign(new Error('Pi did not return an access token.'), { phase: 'sdk' });
  }

  return exchangeToken(auth.accessToken);
}

export function buildAuthorizeUrl(state) {
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope', (cfg.scopes || ['username']).join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

function newState() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function startOauthRedirect(returnTo) {
  const state = newState();
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem('pi_return_to', returnTo);

  const url = buildAuthorizeUrl(state);

  if (window.Pi?.signIn) {
    try {
      window.Pi.signIn({
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        scopes: cfg.scopes,
        state,
      });
      return { redirecting: true };
    } catch (err) {
      console.warn('[pi] Pi.signIn failed, falling back to a plain redirect:', err);
    }
  }

  location.assign(url);
  return { redirecting: true };
}

export async function exchangeToken(accessToken) {
  let res;
  try {
    res = await fetch('/api/auth/pi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ accessToken }),
    });
  } catch (err) {
    throw Object.assign(new Error('Could not reach this site\'s server: ' + err.message), {
      phase: 'server',
    });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Sign-in failed (HTTP ${res.status}).`), {
      phase: 'server',
      stage: data.stage,
      hint: data.hint,
      status: res.status,
    });
  }

  pi.signedIn = true;
  pi.username = data.user?.username || null;
  document.dispatchEvent(new CustomEvent('pi:auth-changed'));
  return data;
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  pi.signedIn = false;
  pi.username = null;
  document.dispatchEvent(new CustomEvent('pi:auth-changed'));
}

export function messageFor(reason) {
  switch (reason) {
    case 'no-client-id':
      return 'Pi sign-in is not configured on this server yet: PI_CLIENT_ID is missing. Enable Pi Sign-in in the Developer Portal, copy the OAuth Client ID, and set it in the environment.';
    case 'init-failed':
      return 'The Pi SDK could not start. Try reloading the page in the Pi Browser.';
    case 'disabled':
      return 'Pi sign-in is switched off on this server.';
    default:
      return 'Pi sign-in is unavailable right now.';
  }
}

export function describeOauthError(code) {
  switch (code) {
    case 'access_denied':
      return 'You declined the consent screen.';
    case 'cancelled':
      return 'Sign-in was cancelled before it was approved.';
    case 'expired':
      return 'The sign-in request timed out. Please try again.';
    case 'server_error':
      return 'Pi hit an unexpected server error. Please try again shortly.';
    default:
      return `Pi returned an error: ${code}`;
  }
}

export { STATE_KEY };
