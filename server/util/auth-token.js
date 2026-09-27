import crypto from 'node:crypto';

export function tokenMatches(expected, provided) {
  if (!expected || typeof provided !== 'string' || !provided) return false;
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(provided).digest();
  return crypto.timingSafeEqual(a, b);
}

export function requireAdmin(req, res, expected) {
  const provided = typeof req.query.token === 'string' ? req.query.token : '';
  if (tokenMatches(expected, provided)) return true;
  res.status(403).json({ error: 'Not permitted.' });
  return false;
}
