import { initPi, pi, buildAuthorizeUrl, messageFor, inPiBrowser } from './pi.js';

const out = document.getElementById('log');
const lines = [];

function log(label, value) {
  lines.push(value === undefined ? label : `${label}: ${value}`);
  out.textContent = lines.join('\n');
}

async function inspect() {
  lines.length = 0;

  let cfg = null;
  try {
    cfg = (await (await fetch('/api/config')).json()).pi;
  } catch (err) {
    log('config fetch FAILED', err.message);
    return null;
  }

  await initPi({ pi: cfg });

  log('enabled', String(cfg.enabled));
  log('client id', cfg.clientId || 'NOT SET — this alone breaks sign-in');
  log('redirect uri', cfg.redirectUri);
  log('oauth scopes', (cfg.scopes || []).join(' '));
  log('sdk scopes', (cfg.sdkScopes || []).join(' '));
  log('authorize url', cfg.authorizeUrl);
  log('');
  log('page origin', location.origin);
  log('pi browser', inPiBrowser() ? 'yes' : 'not detected');
  log('sdk present', typeof window.Pi !== 'undefined' ? 'yes' : 'no');
  log('chosen mode', pi.mode === 'sdk' ? 'Pi.authenticate() — the SDK path' : 'OAuth redirect — Pi Sign-in');
  log('');

  if (pi.mode === 'sdk') {
    log('Inside the Pi Browser, Pi Sign-in is not used at all — Pi refuses it there.');
    log('Sign-in goes through window.Pi.authenticate() instead, with no redirect.');
    log('The client_id and redirect URI below only matter for ordinary browsers.');
    log('');
  }

  const originMatches = cfg.redirectUri?.startsWith(location.origin + '/');
  log(
    'redirect uri host',
    originMatches
      ? 'matches this page origin'
      : `DOES NOT match this page origin (${location.origin}) — Pi will refuse the redirect`
  );

  if (!pi.configured) {
    log('');
    log('RESULT', messageFor(pi.reason));
    return null;
  }

  if (pi.mode === 'sdk') {
    log('RESULT', 'ready — press "Run sign-in" to call Pi.authenticate()');
    return cfg;
  }

  log('');
  log('The exact URL sign-in will navigate to');
  log(buildAuthorizeUrl('test-state-value'));
  log('');
  log('Copy the redirect_uri above and confirm it appears, character for');
  log('character, in the Redirect URIs list in the Pi Developer Portal.');
  log('');
  log('RESULT', 'configuration looks complete — press "Run sign-in" to try it end to end');
  return cfg;
}

document.getElementById('run').addEventListener('click', async () => {
  const cfg = await inspect();
  if (!cfg) return;
  const { signIn } = await import('./pi.js');
  try {
    const result = await signIn('/pi-test.html');
    if (result?.redirecting) return;
    log('');
    log('SIGN-IN SUCCEEDED');
    log('username', result.user?.username || '(none)');
    log('claimed runs', String(result.claimedRuns ?? 0));
  } catch (err) {
    log('');
    log('SIGN-IN FAILED');
    log('phase', err.phase || 'unknown');
    log('message', err.message);
    if (err.stage) log('stage', err.stage);
    if (err.hint) log('hint', err.hint);
  }
});

document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(out.textContent);
    document.getElementById('copy').textContent = 'Copied';
  } catch {
    document.getElementById('copy').textContent = 'Select the text manually';
  }
});

inspect();
