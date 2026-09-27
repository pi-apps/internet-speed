import site from '../config/site.config.js';
import { readSettings, writeSetting, clearSetting } from './db.js';

export const SCHEMA = [
  { key: 'rewards.enabled', group: 'Reward', label: 'Daily reward enabled', type: 'bool',
    help: 'Requires PI_API_KEY and PI_WALLET_PRIVATE_SEED to be set on the server.' },
  { key: 'rewards.mode', group: 'Reward', label: 'Payout mode', type: 'enum',
    options: ['winner-claims', 'admin-pays'],
    help: 'winner-claims lets the winner press the button themselves. admin-pays hides that button and leaves every payout to you.' },
  { key: 'rewards.amount', group: 'Reward', label: 'Amount per day (π)', type: 'number', min: 0.0001, max: 1000, step: 0.0001 },
  { key: 'rewards.memo', group: 'Reward', label: 'Payment memo', type: 'text', max: 60 },
  { key: 'rewards.minReachable', group: 'Qualifying', label: 'Minimum targets reached', type: 'number', min: 1, max: 20, step: 1,
    help: 'A run below this never ranks. Higher makes a fabricated run more work.' },
  { key: 'rewards.minRunSeconds', group: 'Qualifying', label: 'Minimum run duration (s)', type: 'number', min: 1, max: 600, step: 1 },
  { key: 'rewards.maxRunSeconds', group: 'Qualifying', label: 'Maximum run duration (s)', type: 'number', min: 30, max: 7200, step: 10 },
  { key: 'rewards.dayOffsetMinutes', group: 'Schedule', label: 'Day boundary offset from UTC (min)', type: 'number', min: -720, max: 840, step: 15,
    help: '210 is UTC+3:30. The leaderboard day starts and ends at this offset.' },
  { key: 'rewards.claimWindowDays', group: 'Schedule', label: 'Claim window (days)', type: 'number', min: 1, max: 90, step: 1 },
  { key: 'rewards.leaderboardSize', group: 'Schedule', label: 'Leaderboard rows', type: 'number', min: 3, max: 50, step: 1 },

  { key: 'donations.enabled', group: 'Donations', label: 'Donations enabled', type: 'bool' },
  { key: 'donations.min', group: 'Donations', label: 'Minimum donation (π)', type: 'number', min: 0.0001, max: 1000, step: 0.0001 },
  { key: 'donations.max', group: 'Donations', label: 'Maximum donation (π)', type: 'number', min: 0.01, max: 100000, step: 0.01 },
  { key: 'donations.memoMaxLength', group: 'Donations', label: 'Message length limit', type: 'number', min: 10, max: 200, step: 1 },
  { key: 'donations.mainnetUrl', group: 'Donations', label: 'Mainnet site URL', type: 'text', max: 200 },
  { key: 'donations.mainnetLabel', group: 'Donations', label: 'Mainnet button label', type: 'text', max: 60 },

  { key: 'ads.enabled', group: 'Ads', label: 'Show ads', type: 'bool',
    help: 'Needs the app to be approved for the Pi Developer Ad Network, and PI_API_KEY set so rewarded views can be verified.' },
  { key: 'ads.beforeSignIn', group: 'Ads', label: 'Ad before sign-in', type: 'bool' },
  { key: 'ads.beforeLatency', group: 'Ads', label: 'Ad before the latency test', type: 'bool' },
  { key: 'ads.cooldownSeconds', group: 'Ads', label: 'Seconds between ads at the same gate', type: 'number', min: 0, max: 86400, step: 30 },
  { key: 'ads.blockOnFailure', group: 'Ads', label: 'Block the action if no ad is available', type: 'bool',
    help: 'Off by default. A visitor should not lose the feature because an advert failed to load.' },

  { key: 'features.saveResults', group: 'Site', label: 'Store latency runs', type: 'bool' },
  { key: 'features.publicStats', group: 'Site', label: 'Public statistics', type: 'bool' },
];

const KEYS = new Set(SCHEMA.map((f) => f.key));
let overrides = {};

export function refreshSettings() {
  const stored = readSettings();
  overrides = Object.fromEntries(Object.entries(stored).filter(([k]) => KEYS.has(k)));
  return overrides;
}

function defaultFor(key) {
  const [group, name] = key.split('.');
  if (key === 'rewards.mode') return 'winner-claims';
  return site[group]?.[name];
}

export function get(key) {
  return key in overrides ? overrides[key] : defaultFor(key);
}

export function all() {
  return Object.fromEntries(SCHEMA.map((f) => [f.key, get(f.key)]));
}

export function fields() {
  return SCHEMA.map((f) => ({
    ...f,
    value: get(f.key),
    isDefault: !(f.key in overrides),
    default: defaultFor(f.key),
  }));
}

export function coerce(field, raw) {
  if (field.type === 'bool') return Boolean(raw);
  if (field.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number.`);
    if (field.min !== undefined && n < field.min) throw new Error(`${field.label} must be at least ${field.min}.`);
    if (field.max !== undefined && n > field.max) throw new Error(`${field.label} must be at most ${field.max}.`);
    return n;
  }
  if (field.type === 'enum') {
    if (!field.options.includes(raw)) throw new Error(`${field.label} has an unexpected value.`);
    return raw;
  }
  const text = String(raw ?? '');
  if (field.max && text.length > field.max) throw new Error(`${field.label} is too long.`);
  return text;
}

export function update(patch, by) {
  const applied = {};
  for (const [key, raw] of Object.entries(patch)) {
    const field = SCHEMA.find((f) => f.key === key);
    if (!field) continue;
    const value = coerce(field, raw);
    writeSetting(key, value, by);
    applied[key] = value;
  }
  refreshSettings();
  return applied;
}

export function reset(key, by) {
  if (!KEYS.has(key)) return false;
  clearSetting(key, by);
  refreshSettings();
  return true;
}

refreshSettings();
