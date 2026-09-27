import crypto from 'node:crypto';
import site from '../../config/site.config.js';

const TIMEOUT_MS = 15_000;

export async function verifyAccessToken(accessToken) {
  const t0 = Date.now();
  const done = (result) => ({ ...result, ms: Date.now() - t0 });

  if (typeof accessToken !== 'string' || accessToken.length < 8) {
    return done({ ok: false, stage: 'input', detail: 'No access token in the request body.' });
  }
  if (accessToken.length > 4096) {
    return done({ ok: false, stage: 'input', detail: 'Access token is implausibly long.' });
  }

  const url = `${site.pi.apiBase}/me`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: ctl.signal,
    });
  } catch (err) {
    const detail =
      err.name === 'AbortError'
        ? `No response from ${url} within ${TIMEOUT_MS / 1000}s.`
        : `${err.name}: ${err.message} (${url})`;
    return done({ ok: false, stage: 'network', detail });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    return done({
      ok: false,
      stage: 'rejected',
      status: 401,
      detail: 'Pi rejected the access token. It is expired, already used, or for a different app.',
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return done({
      ok: false,
      stage: 'api',
      status: res.status,
      detail: `Pi API returned ${res.status}. ${body.slice(0, 200)}`,
    });
  }

  let dto;
  try {
    dto = await res.json();
  } catch {
    return done({ ok: false, stage: 'parse', status: res.status, detail: 'Pi API returned a non-JSON body.' });
  }

  if (!dto?.uid || typeof dto.uid !== 'string') {
    return done({
      ok: false,
      stage: 'shape',
      status: res.status,
      detail: `Pi API response has no uid. Keys: ${Object.keys(dto || {}).join(', ') || 'none'}`,
    });
  }

  return done({
    ok: true,
    user: {
      uid: dto.uid,
      username: typeof dto.username === 'string' ? dto.username.slice(0, 64) : null,
      scopes: Array.isArray(dto.credentials?.scopes) ? dto.credentials.scopes : [],
      validUntil: dto.credentials?.valid_until?.timestamp || null,
    },
  });
}

export async function probePiApi() {
  const url = `${site.pi.apiBase}/me`;
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer probe' }, signal: ctl.signal });
    return {
      reachable: true,
      status: res.status,
      ms: Date.now() - t0,
      note: res.status === 401
        ? 'Reachable. A 401 here is the expected, healthy answer.'
        : `Reachable, but answered ${res.status} instead of the expected 401.`,
    };
  } catch (err) {
    return {
      reachable: false,
      ms: Date.now() - t0,
      error: `${err.name}: ${err.message}`,
      note: 'This server cannot reach the Pi Platform API. Check outbound HTTPS and DNS.',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function piKeyCall(path, { method = 'GET', body = null } = {}) {
  if (!site.pi.apiKey) {
    const err = new Error('PI_API_KEY is not set on this server, so payments cannot be processed.');
    err.code = 'no-api-key';
    throw err;
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${site.pi.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Key ${site.pi.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }

    if (!res.ok) {
      const err = new Error(
        `Pi API ${method} ${path} returned ${res.status}: ${JSON.stringify(data).slice(0, 300)}`
      );
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const getPayment = (paymentId) => piKeyCall(`/payments/${encodeURIComponent(paymentId)}`);

export const approvePayment = (paymentId) =>
  piKeyCall(`/payments/${encodeURIComponent(paymentId)}/approve`, { method: 'POST' });

export const completePayment = (paymentId, txid) =>
  piKeyCall(`/payments/${encodeURIComponent(paymentId)}/complete`, {
    method: 'POST',
    body: { txid },
  });

export const paymentsConfigured = () => Boolean(site.pi.apiKey);

export const newSessionToken = () => crypto.randomBytes(32).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
