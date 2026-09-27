import { recordReward, rewardForDay, beginClaim, releaseStuckClaims } from './db.js';
import {
  createA2UPayment, submitA2UPayment, completeA2UPayment,
  describeA2UError, settleIncompleteServerPayments,
} from './util/a2u.js';

const running = new Map();

export function recoverInterruptedPayouts() {
  const n = releaseStuckClaims('interrupted by a server restart');
  if (n) console.warn(`[a2u] released ${n} payout(s) left mid-flight by a restart`);
  return n;
}

export const payoutInFlight = (day) => running.has(day);

export function startPayout({ day, winner, amount, memo, by }) {
  if (running.has(day)) return false;

  const existing = rewardForDay(day);

  recordReward({
    day,
    userId: winner.user_id,
    username: winner.username,
    score: winner.score,
    amount,
    memo,
    status: existing ? existing.status : 'pending',
  });

  if (!beginClaim(day, winner.user_id)) return false;

  const task = run({ day, winner, amount, memo, by, existing }).finally(() => running.delete(day));
  running.set(day, task);
  return true;
}

async function run({ day, winner, amount, memo, by, existing }) {
  let paymentId = existing?.payment_id || null;
  let txid = existing?.txid || null;

  const save = (patch) =>
    recordReward({ day, userId: winner.user_id, amount, paymentId, txid, ...patch });

  try {
    if (!paymentId) {
      const settled = await settleIncompleteServerPayments();
      const blocked = settled.find((h) => !h.resolved);
      if (settled.length) {
        console.log(`[a2u] settled ${settled.length} stale server payment(s) before ${day}`);
      }
      if (blocked) {
        throw new Error(
          `A previous payout (${blocked.id}) is still open on the Pi side and could not be settled: ${blocked.error}. ` +
          'Pi allows one open server payment at a time.'
        );
      }

      save({ status: 'creating' });
      paymentId = await createA2UPayment({
        uid: winner.user_id,
        amount,
        memo,
        metadata: { kind: 'daily-latency-reward', day, score: winner.score, by: by || null },
      });
      save({ status: 'submitting' });
      console.log(`[a2u] created payment ${paymentId} for ${day}`);
    }

    if (!txid) {
      save({ status: 'submitting' });
      txid = await submitA2UPayment(paymentId);
      console.log(`[a2u] submitted ${paymentId} txid ${txid}`);
      save({ status: 'completing' });
    }

    await completeA2UPayment(paymentId, txid);
    save({ status: 'paid', error: null, paidAt: Date.now() });
    console.log(`[a2u] paid ${amount} Pi to @${winner.username} for ${day}`);
  } catch (err) {
    const detail = describeA2UError(err);
    console.error(`[a2u] payout failed for ${day}: ${detail}`);
    save({ status: 'failed', error: detail.slice(0, 400) });
  }
}
