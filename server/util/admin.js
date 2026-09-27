import site from '../../config/site.config.js';
import { currentSession } from '../routes/auth.js';

export function isAdminUsername(username) {
  if (!username) return false;
  return site.server.adminUsernames.includes(String(username).toLowerCase().replace(/^@/, ''));
}

export function adminSession(req) {
  const session = currentSession(req);
  if (!session || !isAdminUsername(session.username)) return null;
  return session;
}

export function requireAdminSession(req, res) {
  const session = adminSession(req);
  if (session) return session;

  if (!site.server.adminUsernames.length) {
    res.status(503).json({
      error: 'No administrator is configured. Set ADMIN_USERNAMES to your Pi username and restart.',
    });
    return null;
  }

  res.status(403).json({ error: 'This area is limited to administrators.' });
  return null;
}
