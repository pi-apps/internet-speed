import { STATE_KEY, describeOauthError, exchangeToken } from './pi.js';

const title = document.getElementById('cb-title');
const message = document.getElementById('cb-message');
const actions = document.getElementById('cb-actions');
const debugPanel = document.getElementById('cb-debug');
const debugBody = document.getElementById('cb-debug-body');

function finish(headline, text, { ok = false, detail = null } = {}) {
  title.textContent = headline;
  message.textContent = text;
  actions.classList.remove('hidden');
  if (detail) {
    debugBody.textContent = detail;
    debugPanel.classList.remove('hidden');
  }
  if (ok) {
    const back = sessionStorage.getItem('pi_return_to') || '/#history';
    sessionStorage.removeItem('pi_return_to');
    setTimeout(() => location.replace(back.startsWith('/') ? back : '/'), 1200);
  }
}

async function run() {
  const params = new URLSearchParams(location.hash.slice(1));

  history.replaceState(null, '', location.pathname);

  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  if (!params.has('access_token') && !params.has('error')) {
    finish(
      'Nothing to process',
      'This page is the landing point for Pi sign-in and was opened directly.',
      { detail: 'No access_token and no error were present in the URL fragment.' }
    );
    return;
  }

  const returnedState = params.get('state');
  if (!expectedState || returnedState !== expectedState) {
    finish(
      'Sign-in could not be verified',
      'The security check on the response failed. Please start sign-in again from the site.',
      {
        detail:
          `state mismatch\nexpected: ${expectedState || '(nothing stored)'}\nreturned: ${returnedState || '(none)'}\n\n` +
          'This also happens if you reload this page, or open the link in a different browser tab from the one that started sign-in.',
      }
    );
    return;
  }

  const error = params.get('error');
  if (error) {
    finish('Sign-in did not complete', describeOauthError(error), { detail: `error=${error}` });
    return;
  }

  const accessToken = params.get('access_token');
  message.textContent = 'Verifying your identity with Pi…';

  try {
    const data = await exchangeToken(accessToken);
    const claimed = data.claimedRuns
      ? ` ${data.claimedRuns} earlier run${data.claimedRuns === 1 ? '' : 's'} moved to your account.`
      : '';
    finish(`Welcome, @${data.user?.username || 'pioneer'}`, `You are signed in.${claimed}`, { ok: true });
  } catch (err) {
    finish('Sign-in failed', err.message, {
      detail: [
        `phase: ${err.phase || 'unknown'}`,
        err.status ? `http:  ${err.status}` : null,
        err.stage ? `stage: ${err.stage}` : null,
        err.hint ? `hint:  ${err.hint}` : null,
      ].filter(Boolean).join('\n'),
    });
  }
}

run();
