import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import site from '../config/site.config.js';

const file = path.resolve(process.cwd(), site.server.dbFile);
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  scopes     TEXT,          -- Pi uid, app-scoped and stable per app
  username   TEXT,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256 of the cookie value, never the value itself
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  TEXT    NOT NULL,
  user_id    TEXT,
  created_at INTEGER NOT NULL,
  isp        TEXT,
  asn        TEXT,
  country    TEXT,
  city       TEXT,
  ip_hash    TEXT,
  platform   TEXT,
  browser    TEXT
);
CREATE TABLE IF NOT EXISTS samples (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id  INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  target  TEXT    NOT NULL,
  latency REAL,
  ok      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_runs_client  ON runs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user    ON runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_run  ON samples(run_id);
CREATE INDEX IF NOT EXISTS idx_samples_tgt  ON samples(target);

CREATE TABLE IF NOT EXISTS donations (
  payment_id   TEXT PRIMARY KEY,
  user_id      TEXT,
  username     TEXT,
  amount       REAL,
  memo         TEXT,          -- the donor's own message, kept in full here
  txid         TEXT,
  status       TEXT NOT NULL, -- pending | approved | completed | cancelled | error
  network      TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_donations_created ON donations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_status  ON donations(status);

CREATE TABLE IF NOT EXISTS rewards (
  day        TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  username   TEXT,
  score      REAL,
  amount     REAL NOT NULL,
  memo       TEXT,
  payment_id TEXT,
  txid       TEXT,
  status     TEXT NOT NULL,
  error      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at    INTEGER,
  PRIMARY KEY (day, user_id)
);
CREATE INDEX IF NOT EXISTS idx_rewards_day ON rewards(day DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_day_only ON rewards(day);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  summary    TEXT,
  body       TEXT NOT NULL,
  published  INTEGER NOT NULL DEFAULT 0,
  pinned     INTEGER NOT NULL DEFAULT 0,
  author     TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, created_at DESC);

CREATE TABLE IF NOT EXISTS ad_views (
  ad_id      TEXT PRIMARY KEY,
  user_id    TEXT,
  username   TEXT,
  placement  TEXT,
  status     TEXT,
  granted    INTEGER NOT NULL DEFAULT 0,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_views_created ON ad_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_views_user    ON ad_views(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
`);

const runColumns = db.prepare(`PRAGMA table_info(runs)`).all().map((c) => c.name);
if (!runColumns.includes('user_id')) {
  db.exec(`ALTER TABLE runs ADD COLUMN user_id TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, created_at DESC)`);
}
if (!runColumns.includes('duration_ms')) {
  db.exec(`ALTER TABLE runs ADD COLUMN duration_ms INTEGER`);
}

const stmt = {
  insertRun: db.prepare(`
    INSERT INTO runs (client_id, user_id, created_at, isp, asn, country, city, ip_hash, platform, browser, duration_ms)
    VALUES (@client_id, @user_id, @created_at, @isp, @asn, @country, @city, @ip_hash, @platform, @browser, @duration_ms)`),
  insertSample: db.prepare(
    `INSERT INTO samples (run_id, target, latency, ok) VALUES (?, ?, ?, ?)`
  ),
  runsByClient: db.prepare(
    `SELECT * FROM runs WHERE client_id = ? AND user_id IS NULL ORDER BY created_at DESC LIMIT ?`
  ),
  runsByUser: db.prepare(
    `SELECT * FROM runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ),
  samplesForRunIds: db.prepare(
    `SELECT run_id, target, latency, ok FROM samples WHERE run_id IN (SELECT value FROM json_each(?))`
  ),
  oldRunIds: db.prepare(
    `SELECT id FROM runs WHERE client_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?`
  ),
  oldUserRunIds: db.prepare(
    `SELECT id FROM runs WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?`
  ),
  clientRunIdsAnon: db.prepare(`SELECT id FROM runs WHERE client_id = ? AND user_id IS NULL`),
  userRunIds: db.prepare(`SELECT id FROM runs WHERE user_id = ?`),
  claimRuns: db.prepare(
    `UPDATE runs SET user_id = ? WHERE client_id = ? AND user_id IS NULL`
  ),

  upsertUser: db.prepare(`
    INSERT INTO users (id, username, scopes, first_seen, last_seen)
    VALUES (@id, @username, @scopes, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      username  = COALESCE(excluded.username, users.username),
      scopes    = COALESCE(excluded.scopes, users.scopes),
      last_seen = excluded.last_seen`),
  getUser: db.prepare(`SELECT * FROM users WHERE id = ?`),
  countUsers: db.prepare(`SELECT COUNT(*) AS n FROM users`),

  insertSession: db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)`),
  findSession: db.prepare(`
    SELECT s.user_id, s.expires_at, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token_hash = ?`),
  purgeSessions: db.prepare(`DELETE FROM sessions WHERE expires_at < ?`),
  deleteRun: db.prepare(`DELETE FROM runs WHERE id = ?`),
  deleteSamples: db.prepare(`DELETE FROM samples WHERE run_id = ?`),
  clientRunIds: db.prepare(`SELECT id FROM runs WHERE client_id = ?`),

  overview: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM runs)                        AS runs,
      (SELECT COUNT(*) FROM runs WHERE created_at > ?)   AS last_24h,
      (SELECT ROUND(AVG(latency),1) FROM samples WHERE ok = 1) AS avg_latency,
      (SELECT COUNT(DISTINCT isp) FROM runs WHERE isp IS NOT NULL) AS providers`),

  byTarget: db.prepare(`
    SELECT s.target                                     AS target,
           ROUND(AVG(CASE WHEN s.ok=1 THEN s.latency END), 1) AS avg_latency,
           ROUND(MIN(CASE WHEN s.ok=1 THEN s.latency END), 1) AS best_latency,
           COUNT(*)                                     AS samples,
           ROUND(100.0 * SUM(s.ok) / COUNT(*), 1)       AS reach_rate
    FROM samples s
    JOIN runs r ON r.id = s.run_id
    WHERE r.created_at > ?
    GROUP BY s.target
    ORDER BY avg_latency IS NULL, avg_latency ASC`),

  byIsp: db.prepare(`
    SELECT r.isp                                        AS isp,
           ROUND(AVG(CASE WHEN s.ok=1 THEN s.latency END), 1) AS avg_latency,
           COUNT(DISTINCT r.id)                         AS runs
    FROM runs r
    JOIN samples s ON s.run_id = r.id
    WHERE r.isp IS NOT NULL AND r.isp <> '' AND r.created_at > ?
    GROUP BY r.isp
    HAVING runs >= ?
    ORDER BY avg_latency ASC
    LIMIT 12`),

  hourly: db.prepare(`
    SELECT CAST(strftime('%H', r.created_at/1000, 'unixepoch') AS INTEGER) AS hour,
           ROUND(AVG(CASE WHEN s.ok=1 THEN s.latency END), 1)             AS avg_latency,
           COUNT(DISTINCT r.id)                                           AS runs
    FROM runs r JOIN samples s ON s.run_id = r.id
    WHERE r.created_at > ?
    GROUP BY hour ORDER BY hour`),

  exportAll: db.prepare(`
    SELECT r.id AS run_id, r.created_at, r.isp, r.asn, r.country, r.city,
           r.platform, r.browser, s.target, s.latency, s.ok
    FROM runs r JOIN samples s ON s.run_id = r.id
    ORDER BY r.created_at DESC LIMIT ?`),
};

const saveRun = db.transaction((run, samples) => {
  const runId = stmt.insertRun.run(run).lastInsertRowid;
  for (const s of samples) {
    stmt.insertSample.run(runId, s.target, s.latency, s.ok ? 1 : 0);
  }

  const stale = run.user_id
    ? stmt.oldUserRunIds.all(run.user_id, site.server.runsPerClient)
    : stmt.oldRunIds.all(run.client_id, site.server.runsPerClient);
  for (const row of stale) {
    stmt.deleteSamples.run(row.id);
    stmt.deleteRun.run(row.id);
  }
  return runId;
});

export function insertRun(run, samples) {
  return saveRun(run, samples);
}

export function listRuns({ userId = null, clientId = null }, limit = 30) {
  const runs = userId
    ? stmt.runsByUser.all(userId, limit)
    : clientId
      ? stmt.runsByClient.all(clientId, limit)
      : [];
  if (!runs.length) return [];

  const byRun = new Map(runs.map((r) => [r.id, { ...r, samples: [] }]));
  for (const s of stmt.samplesForRunIds.all(JSON.stringify(runs.map((r) => r.id)))) {
    byRun.get(s.run_id)?.samples.push({ target: s.target, latency: s.latency, ok: !!s.ok });
  }
  return [...byRun.values()];
}

export function clearRuns({ userId = null, clientId = null }) {
  const rows = userId ? stmt.userRunIds.all(userId) : stmt.clientRunIdsAnon.all(clientId);
  for (const row of rows) {
    stmt.deleteSamples.run(row.id);
    stmt.deleteRun.run(row.id);
  }
  return rows.length;
}

export function upsertUser(id, username, scopes = null) {
  stmt.upsertUser.run({
    id,
    username,
    scopes: Array.isArray(scopes) ? scopes.join(' ') : scopes,
    now: Date.now(),
  });
  return stmt.getUser.get(id);
}

export const getUser = (id) => stmt.getUser.get(id);

export const createSession = (tokenHash, userId, ttlMs) =>
  stmt.insertSession.run(tokenHash, userId, Date.now(), Date.now() + ttlMs);

export function findSession(tokenHash) {
  const row = stmt.findSession.get(tokenHash);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    stmt.deleteSession.run(tokenHash);
    return null;
  }
  return row;
}

export const deleteSession = (tokenHash) => stmt.deleteSession.run(tokenHash);
export const purgeSessions = () => stmt.purgeSessions.run(Date.now()).changes;

export const claimAnonymousRuns = (userId, clientId) =>
  stmt.claimRuns.run(userId, clientId).changes;

export const countUsers = () => stmt.countUsers.get().n;

const donationStmt = {
  upsert: db.prepare(`
    INSERT INTO donations
      (payment_id, user_id, username, amount, memo, txid, status, network, created_at, updated_at, note)
    VALUES
      (@payment_id, @user_id, @username, @amount, @memo, @txid, @status, @network, @now, @now, @note)
    ON CONFLICT(payment_id) DO UPDATE SET
      user_id    = COALESCE(excluded.user_id, donations.user_id),
      username   = COALESCE(excluded.username, donations.username),
      amount     = COALESCE(excluded.amount, donations.amount),
      memo       = COALESCE(excluded.memo, donations.memo),
      txid       = COALESCE(excluded.txid, donations.txid),
      status     = excluded.status,
      network    = COALESCE(excluded.network, donations.network),
      note       = COALESCE(excluded.note, donations.note),
      updated_at = excluded.updated_at`),
  get: db.prepare(`SELECT * FROM donations WHERE payment_id = ?`),
  recent: db.prepare(`
    SELECT username, amount, memo, created_at
    FROM donations WHERE status = 'completed'
    ORDER BY created_at DESC LIMIT ?`),
  totals: db.prepare(`
    SELECT COUNT(*) AS count, ROUND(SUM(amount), 4) AS total
    FROM donations WHERE status = 'completed'`),
  all: db.prepare(`SELECT * FROM donations ORDER BY created_at DESC LIMIT ?`),
};

export function recordDonation(row) {
  donationStmt.upsert.run({
    payment_id: row.paymentId,
    user_id: row.userId ?? null,
    username: row.username ?? null,
    amount: row.amount ?? null,
    memo: row.memo ?? null,
    txid: row.txid ?? null,
    status: row.status,
    network: row.network ?? null,
    note: row.note ?? null,
    now: Date.now(),
  });
  return donationStmt.get.get(row.paymentId);
}

export const getDonation = (paymentId) => donationStmt.get.get(paymentId);
export const recentDonations = (limit = 10) => donationStmt.recent.all(limit);
export const donationTotals = () => donationStmt.totals.get();
export const allDonations = (limit = 5000) => donationStmt.all.all(limit);

const rewardStmt = {
  leaderboard: db.prepare(`
    SELECT best.user_id            AS user_id,
           u.username              AS username,
           ROUND(MIN(best.score), 1) AS score,
           COUNT(*)                AS qualifying_runs
    FROM (
      SELECT r.user_id                                          AS user_id,
             AVG(CASE WHEN s.ok = 1 THEN s.latency END)         AS score,
             SUM(s.ok)                                          AS reached
      FROM runs r
      JOIN samples s ON s.run_id = r.id
      WHERE r.user_id IS NOT NULL
        AND r.created_at >= @from AND r.created_at < @to
        AND r.duration_ms IS NOT NULL
      GROUP BY r.id
    ) AS best
    JOIN users u ON u.id = best.user_id
    WHERE best.reached >= @minReachable AND best.score IS NOT NULL
    GROUP BY best.user_id
    ORDER BY score ASC
    LIMIT @limit`),

  upsert: db.prepare(`
    INSERT INTO rewards (day, user_id, username, score, amount, memo, payment_id, txid, status, error, created_at, updated_at, paid_at)
    VALUES (@day, @user_id, @username, @score, @amount, @memo, @payment_id, @txid, @status, @error, @now, @now, @paid_at)
    ON CONFLICT(day, user_id) DO UPDATE SET
      username   = COALESCE(excluded.username, rewards.username),
      score      = COALESCE(excluded.score, rewards.score),
      payment_id = COALESCE(excluded.payment_id, rewards.payment_id),
      txid       = COALESCE(excluded.txid, rewards.txid),
      status     = excluded.status,
      error      = excluded.error,
      paid_at    = COALESCE(excluded.paid_at, rewards.paid_at),
      updated_at = excluded.updated_at`),

  forDay: db.prepare(`SELECT * FROM rewards WHERE day = ?`),
  recent: db.prepare(`SELECT * FROM rewards ORDER BY day DESC LIMIT ?`),
  claimStart: db.prepare(`
    UPDATE rewards SET status = 'processing', updated_at = @now
    WHERE day = @day AND user_id = @user_id
      AND (status IN ('pending', 'failed')
           OR (status IN ('processing', 'creating', 'submitting', 'completing')
               AND updated_at < @stale))`),
  release: db.prepare(`
    UPDATE rewards SET status = 'failed', error = @error, updated_at = @now
    WHERE day = @day AND status NOT IN ('paid')`),
  releaseAllStuck: db.prepare(`
    UPDATE rewards SET status = 'failed', error = @error, updated_at = @now
    WHERE status IN ('processing', 'creating', 'submitting', 'completing')`),
};

export function leaderboard({ from, to, minReachable, limit }) {
  return rewardStmt.leaderboard.all({ from, to, minReachable, limit });
}

export function recordReward(row) {
  rewardStmt.upsert.run({
    day: row.day,
    user_id: row.userId,
    username: row.username ?? null,
    score: row.score ?? null,
    amount: row.amount,
    memo: row.memo ?? null,
    payment_id: row.paymentId ?? null,
    txid: row.txid ?? null,
    status: row.status,
    error: row.error ?? null,
    paid_at: row.status === 'paid' ? (row.paidAt ?? Date.now()) : (row.paidAt ?? null),
    now: Date.now(),
  });
  return rewardStmt.forDay.get(row.day);
}

export const rewardForDay = (day) => rewardStmt.forDay.get(day);
export const recentRewards = (limit = 30) => rewardStmt.recent.all(limit);

const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
if (userColumns.length && !userColumns.includes('scopes')) {
  db.exec(`ALTER TABLE users ADD COLUMN scopes TEXT`);
}

const rewardColumns = db.prepare(`PRAGMA table_info(rewards)`).all().map((c) => c.name);
if (rewardColumns.length && !rewardColumns.includes('paid_at')) {
  db.exec(`ALTER TABLE rewards ADD COLUMN paid_at INTEGER`);
}

const postStmt = {
  insert: db.prepare(`
    INSERT INTO posts (slug, title, summary, body, published, pinned, author, created_at, updated_at)
    VALUES (@slug, @title, @summary, @body, @published, @pinned, @author, @now, @now)`),
  update: db.prepare(`
    UPDATE posts SET
      slug = @slug, title = @title, summary = @summary, body = @body,
      published = @published, pinned = @pinned, updated_at = @now
    WHERE id = @id`),
  remove: db.prepare(`DELETE FROM posts WHERE id = ?`),
  byId: db.prepare(`SELECT * FROM posts WHERE id = ?`),
  bySlug: db.prepare(`SELECT * FROM posts WHERE slug = ?`),
  published: db.prepare(`
    SELECT * FROM posts WHERE published = 1
    ORDER BY pinned DESC, created_at DESC LIMIT ? OFFSET ?`),
  countPublished: db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE published = 1`),
  all: db.prepare(`SELECT * FROM posts ORDER BY pinned DESC, created_at DESC LIMIT ?`),
};

export function createPost(row) {
  const info = postStmt.insert.run({ ...row, now: Date.now() });
  return postStmt.byId.get(info.lastInsertRowid);
}

export function updatePost(row) {
  postStmt.update.run({ ...row, now: Date.now() });
  return postStmt.byId.get(row.id);
}

export const deletePost = (id) => postStmt.remove.run(id).changes;
export const postById = (id) => postStmt.byId.get(id);
export const postBySlug = (slug) => postStmt.bySlug.get(slug);
export const publishedPosts = (limit = 10, offset = 0) => postStmt.published.all(limit, offset);
export const publishedPostCount = () => postStmt.countPublished.get().n;
export const allPosts = (limit = 200) => postStmt.all.all(limit);

const adStmt = {
  insert: db.prepare(`
    INSERT INTO ad_views (ad_id, user_id, username, placement, status, granted, detail, created_at)
    VALUES (@ad_id, @user_id, @username, @placement, @status, @granted, @detail, @now)
    ON CONFLICT(ad_id) DO NOTHING`),
  get: db.prepare(`SELECT * FROM ad_views WHERE ad_id = ?`),
  totals: db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(granted) AS granted,
           SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS last_24h
    FROM ad_views`),
  byPlacement: db.prepare(`
    SELECT placement, COUNT(*) AS views, SUM(granted) AS granted
    FROM ad_views WHERE created_at > ? GROUP BY placement ORDER BY views DESC`),
};

export function recordAdView(row) {
  const inserted = adStmt.insert.run({
    ad_id: row.adId,
    user_id: row.userId ?? null,
    username: row.username ?? null,
    placement: row.placement ?? null,
    status: row.status ?? null,
    granted: row.granted ? 1 : 0,
    detail: row.detail ?? null,
    now: Date.now(),
  });
  return { fresh: inserted.changes === 1, row: adStmt.get.get(row.adId) };
}

export const getAdView = (adId) => adStmt.get.get(adId);
export const adTotals = () => adStmt.totals.get(Date.now() - 86_400_000);
export const adsByPlacement = (days = 30) => adStmt.byPlacement.all(Date.now() - days * 86_400_000);

const settingStmt = {
  all: db.prepare(`SELECT key, value FROM settings`),
  put: db.prepare(`
    INSERT INTO settings (key, value, updated_at, updated_by)
    VALUES (@key, @value, @now, @by)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`),
  drop: db.prepare(`DELETE FROM settings WHERE key = ?`),
  audit: db.prepare(`SELECT key, updated_at, updated_by FROM settings ORDER BY updated_at DESC LIMIT 40`),
};

export function readSettings() {
  const out = {};
  for (const row of settingStmt.all.all()) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export const writeSetting = (key, value, by) =>
  settingStmt.put.run({ key, value: JSON.stringify(value), now: Date.now(), by: by ?? null });

export const clearSetting = (key) => settingStmt.drop.run(key);
export const settingsAudit = () => settingStmt.audit.all();

const STALE_CLAIM_MS = 5 * 60 * 1000;

export function beginClaim(day, userId) {
  return rewardStmt.claimStart.run({
    day,
    user_id: userId,
    now: Date.now(),
    stale: Date.now() - STALE_CLAIM_MS,
  }).changes === 1;
}

export const releaseStuckClaims = (error) =>
  rewardStmt.releaseAllStuck.run({ error, now: Date.now() }).changes;

export const releaseClaim = (day, error) =>
  rewardStmt.release.run({ day, error: error ?? 'released by an administrator', now: Date.now() }).changes;

export const overview = () => stmt.overview.get(Date.now() - 86_400_000);
export const byTarget = (days = 30) => stmt.byTarget.all(Date.now() - days * 86_400_000);
export const byIsp = (days = 30, minRuns = 3) =>
  stmt.byIsp.all(Date.now() - days * 86_400_000, minRuns);
export const hourly = (days = 7) => stmt.hourly.all(Date.now() - days * 86_400_000);
export const exportAll = (limit = 20000) => stmt.exportAll.all(limit);
