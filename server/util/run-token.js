import crypto from 'node:crypto';
import { get as setting } from '../settings.js';

const SECRET = process.env.HASH_SALT || crypto.randomBytes(32).toString('hex');
const used = new Map();

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function issueRunToken(clientId) {
  const payload = `${Date.now()}.${crypto.randomBytes(9).toString('base64url')}.${clientId}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyRunToken(token, clientId) {
  if (typeof token !== 'string' || token.length > 300) return null;

  const parts = token.split('.');
  if (parts.length !== 4) return null;

  const [issuedAt, nonce, owner, mac] = parts;
  const payload = `${issuedAt}.${nonce}.${owner}`;

  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(mac);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null;
  if (owner !== clientId) return null;

  const started = Number(issuedAt);
  if (!Number.isFinite(started)) return null;

  const duration = Date.now() - started;
  if (duration < Number(setting('rewards.minRunSeconds')) * 1000) return null;
  if (duration > Number(setting('rewards.maxRunSeconds')) * 1000) return null;

  const key = `${owner}.${nonce}`;
  if (used.has(key)) return null;
  used.set(key, Date.now());

  if (used.size > 5000) {
    const cutoff = Date.now() - Number(setting('rewards.maxRunSeconds')) * 1000;
    for (const [k, at] of used) if (at < cutoff) used.delete(k);
  }

  return duration;
}
