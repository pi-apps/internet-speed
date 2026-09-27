import { get as setting } from '../settings.js';

const DAY_MS = 86_400_000;
const offsetMs = () => Number(setting('rewards.dayOffsetMinutes') || 0) * 60_000;

export function dayKey(timestamp = Date.now()) {
  return new Date(timestamp + offsetMs()).toISOString().slice(0, 10);
}

export function dayRange(key) {
  const start = Date.parse(`${key}T00:00:00Z`) - offsetMs();
  return { from: start, to: start + DAY_MS };
}

export function today() {
  return dayKey();
}

export function lastCompletedDay() {
  return dayKey(Date.now() - DAY_MS);
}

export function isClaimable(key) {
  if (key >= today()) return false;
  const age = Date.now() - dayRange(key).to;
  return age <= Number(setting('rewards.claimWindowDays')) * DAY_MS;
}
