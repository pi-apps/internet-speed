import site from '../../config/site.config.js';

let client = null;
let loadError = null;

const TIMEOUTS = {
  create: 25_000,
  submit: 100_000,
  complete: 30_000,
};

async function getClient() {
  if (client) return client;
  if (loadError) throw loadError;

  if (!site.pi.apiKey || !site.pi.walletPrivateSeed) {
    loadError = new Error('PI_API_KEY and PI_WALLET_PRIVATE_SEED are both required for A2U payments.');
    throw loadError;
  }

  try {
    const mod = await import('pi-backend');
    const PiNetwork = mod.default?.default || mod.default || mod;
    const options = site.pi.networkPassphrase ? { network: site.pi.networkPassphrase } : undefined;
    client = new PiNetwork(site.pi.apiKey, site.pi.walletPrivateSeed, options);
    return client;
  } catch (err) {
    const missing = err.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/.test(err.message);
    loadError = new Error(
      missing
        ? 'The pi-backend package is not installed. It is an optional dependency; run "npm install pi-backend" on the server if you want App-to-User payouts.'
        : `Could not initialise the Pi backend SDK: ${err.message}`
    );
    throw loadError;
  }
}

export function describeA2UError(err) {
  const parts = [];

  const status = err?.response?.status;
  if (status) parts.push(`HTTP ${status}`);

  const data = err?.response?.data;
  if (data) {
    const codes = data?.extras?.result_codes;
    if (codes) parts.push(`result_codes ${JSON.stringify(codes)}`);
    else if (typeof data === 'string') parts.push(data.slice(0, 200));
    else parts.push(JSON.stringify(data).slice(0, 300));
  }

  const message = err?.message || String(err);
  const explained = hint(message, typeof data === 'object' ? data : null);
  if (!parts.length) return explained;
  return `${explained} (${parts.join(' — ')})`;
}

function hint(message, data) {
  const code = data?.error;
  if (code === 'missing_scope' || /missing_scope|wallet_address/i.test(message)) {
    return 'The winner has not granted the wallet_address scope, so Pi will not reveal the public key to pay them. They need to sign in again and approve wallet access; the reward can be sent once they have.';
  }
  if (/private seed of your app wallet/i.test(message)) {
    return 'The wallet seed does not match the app wallet registered in the Developer Portal. PI_WALLET_PRIVATE_SEED must be the seed of the wallet connected to this app.';
  }
  if (/not found|404/i.test(message)) {
    return 'The app wallet does not exist on this network yet. A Pi account only exists once it has been funded, so send some Pi to it first.';
  }
  if (/timed out after/i.test(message)) return message;
  if (/56-character/i.test(message)) {
    return 'PI_WALLET_PRIVATE_SEED is not a valid seed. It is 56 characters and starts with S.';
  }
  if (/already has a linked txid/i.test(message)) {
    return 'This payment was already submitted to the blockchain. Retrying will resume it rather than paying twice.';
  }
  return message;
}

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

export function a2uConfigured() {
  return Boolean(site.pi.apiKey && site.pi.walletPrivateSeed);
}

export async function createA2UPayment({ uid, amount, memo, metadata }) {
  const pi = await getClient();
  return withTimeout(pi.createPayment({ uid, amount, memo, metadata }), TIMEOUTS.create, 'Creating the payment');
}

export async function submitA2UPayment(paymentId) {
  const pi = await getClient();
  return withTimeout(pi.submitPayment(paymentId), TIMEOUTS.submit, 'Submitting the transaction');
}

export async function completeA2UPayment(paymentId, txid) {
  const pi = await getClient();
  return withTimeout(pi.completePayment(paymentId, txid), TIMEOUTS.complete, 'Completing the payment');
}

export async function incompleteServerPayments() {
  const pi = await getClient();
  const data = await withTimeout(
    pi.getIncompleteServerPayments(),
    TIMEOUTS.create,
    'Listing incomplete payments'
  );
  return Array.isArray(data?.incomplete_server_payments) ? data.incomplete_server_payments : [];
}

export async function cancelA2UPayment(paymentId) {
  const pi = await getClient();
  return withTimeout(pi.cancelPayment(paymentId), TIMEOUTS.complete, 'Cancelling the payment');
}

export async function settleIncompleteServerPayments() {
  const pending = await incompleteServerPayments();
  const handled = [];

  for (const payment of pending) {
    const id = payment?.identifier;
    if (!id) continue;
    const txid = payment?.transaction?.txid;

    try {
      if (txid) {
        await completeA2UPayment(id, txid);
        handled.push({ id, resolved: true, action: 'completed', txid });
      } else {
        await cancelA2UPayment(id);
        handled.push({ id, resolved: true, action: 'cancelled' });
      }
    } catch (err) {
      handled.push({ id, resolved: false, action: txid ? 'complete' : 'cancel', error: describeA2UError(err) });
    }
  }

  return handled;
}

async function runtimeReport() {
  const report = {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    libc: null,
    fastSigning: null,
    piBackend: null,
  };

  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    try {
      report.piBackend = require('pi-backend/package.json').version;
    } catch {
      report.piBackend = 'not installed';
    }
    try {
      const fs = await import('node:fs');
      report.libc = fs.existsSync('/etc/alpine-release')
        ? 'musl (Alpine) - native addons built for glibc will not work here'
        : 'glibc';
    } catch {
      report.libc = 'unknown';
    }
    try {
      const signing = require('stellar-base/lib/signing.js');
      report.fastSigning = signing.FastSigning
        ? 'sodium-native loaded'
        : 'tweetnacl fallback (pure JavaScript, works everywhere)';
    } catch {
      report.fastSigning = 'stellar-base not present';
    }
  } catch (err) {
    report.error = err.message;
  }

  return report;
}

export async function a2uPreflight() {
  const result = {
    apiKey: Boolean(site.pi.apiKey),
    seed: Boolean(site.pi.walletPrivateSeed),
    runtime: await runtimeReport(),
  };

  if (!result.apiKey || !result.seed) {
    result.ok = false;
    result.detail = 'PI_API_KEY and PI_WALLET_PRIVATE_SEED must both be set.';
    return result;
  }

  try {
    const pi = await getClient();
    result.walletAddress = pi.myKeypair?.publicKey?.() || null;
  } catch (err) {
    result.ok = false;
    result.detail = err.message;
    return result;
  }

  try {
    const incomplete = await incompleteServerPayments();
    result.ok = true;
    result.incomplete = incomplete.length;
    result.detail = 'The Pi API accepted the server key and the wallet seed loaded.';
  } catch (err) {
    result.ok = false;
    result.detail = describeA2UError(err);
  }

  return result;
}
