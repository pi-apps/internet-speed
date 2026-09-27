import crypto from 'node:crypto';
import site from '../../config/site.config.js';

const SALT = process.env.HASH_SALT || crypto.randomBytes(16).toString('hex');
const COOKIE = 'ts_cid';
const YEAR = 365 * 24 * 60 * 60 * 1000;

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
}

export const hashIp = (ip) =>
  crypto.createHash('sha256').update(SALT + '|' + ip).digest('hex').slice(0, 32);

export function cookieOptions(req) {
  const secure = Boolean(req.secure);
  let sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (sameSite === 'none' && !secure) sameSite = 'lax';
  return { httpOnly: true, sameSite, secure, path: '/' };
}

export function ensureClientId(req, res) {
  let id = req.cookies?.[COOKIE];
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    id = crypto.randomBytes(16).toString('hex');
    res.cookie(COOKIE, id, { ...cookieOptions(req), maxAge: YEAR });
  }
  return id;
}

const geoCache = new Map();
const GEO_TTL = 6 * 60 * 60 * 1000;

export async function lookupGeo(ip) {
  if (site.features.geoLookup === 'none') return null;
  if (!ip || isPrivate(ip)) return { isp: 'Local network', asn: null, country: null, city: null };

  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.data;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3500);
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,isp,as,query&lang=fa`;
    const r = await fetch(url, { signal: ctl.signal });
    const j = await r.json();
    if (j.status !== 'success') return null;
    const data = {
      isp: j.isp || null,
      asn: j.as || null,
      country: j.country || null,
      city: j.city || null,
    };
    geoCache.set(ip, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function isPrivate(ip = '') {
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

export function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

export const str = (v, max = 120) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
