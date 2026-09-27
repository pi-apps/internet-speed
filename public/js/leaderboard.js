import { $, $$, api, fmt, toast, esc } from './util.js';
import { share } from './share.js';

let cfg = null;
let day = 'today';
let state = null;

export function initLeaderboard(publicConfig) {
  cfg = publicConfig.rewards || { enabled: false };

  $('#board-days')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $$('#board-days button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    day = btn.dataset.day;
    load();
  });

  $('#reward-claim')?.addEventListener('click', claim);
  $('#board-share')?.addEventListener('click', shareStanding);

  document.addEventListener('pi:auth-changed', load);
  load();
}

function targetDay() {
  if (!state) return undefined;
  return day === 'yesterday' ? state.lastCompletedDay : state.today;
}

export async function load() {
  const list = $('#board-list');
  if (!list) return;

  const query = state ? `?day=${encodeURIComponent(targetDay())}` : '';
  try {
    state = await api('/api/rewards/leaderboard' + query);
  } catch {
    return;
  }

  render();
}

function render() {
  const list = $('#board-list');
  const empty = $('#board-empty');
  const title = $('#board-title');
  const note = $('#board-note');

  if (title) title.textContent = state.settled ? 'Yesterday' : 'Today, so far';
  if (note) {
    if (state.frozenAt) {
      note.textContent = `Settled early — the board froze when the reward was paid.`;
    } else if (state.settled) {
      note.textContent = `Final standings for ${state.day}.`;
    } else {
      note.textContent = 'Still open — the standings change as people test.';
    }
  }

  if (!state.entries.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
  } else {
    empty?.classList.add('hidden');
    list.innerHTML = state.entries
      .map((entry) => {
        const mine = state.you?.username === entry.username;
        return `<li class="board-row" data-rank="${entry.rank}" data-mine="${mine}">
          <span class="board-rank">${entry.rank}</span>
          <span class="board-name">@${esc(entry.username || 'pioneer')}</span>
          <span class="board-runs muted">${entry.runs} run${entry.runs === 1 ? '' : 's'}</span>
          <span class="board-score num">${fmt(entry.score)} ms</span>
        </li>`;
      })
      .join('');
  }

  renderReward();
  $('#board-share')?.classList.toggle('hidden', !state.entries.length);
}

async function shareStanding() {
  if (!state) return;

  const you = state.you;
  const top = state.entries[0];
  const brand = document.querySelector('[data-brand-name]')?.textContent || 'Internet Speed';

  const lines =
    you?.rank
      ? [
          `I'm #${you.rank} on the ${brand} latency leaderboard for ${state.day}.`,
          top ? `Leader: @${top.username} at ${fmt(top.score)} ms.` : null,
          'Think your connection is faster? Prove it:',
          location.origin,
        ]
      : [
          `${brand} latency leaderboard for ${state.day}`,
          top ? `Current leader: @${top.username} at ${fmt(top.score)} ms.` : 'No entries yet.',
          'Measure yours:',
          location.origin,
        ];

  await share({ title: `${brand} leaderboard`, message: lines.filter(Boolean).join('\n') });
}

function renderReward() {
  const bar = $('#reward-bar');
  const claimBtn = $('#reward-claim');
  const title = $('#reward-title');
  const note = $('#reward-note');
  if (!bar) return;

  if (!state.reward.enabled) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  title.textContent = `Daily reward: ${fmt(state.reward.amount)} π`;
  claimBtn.classList.add('hidden');

  if (state.reward.status === 'paid') {
    note.textContent = `Already paid to @${esc(state.reward.claimedBy || 'the winner')}.`;
    bar.dataset.state = 'paid';
    return;
  }
  if (state.reward.status === 'processing') {
    note.textContent = 'A payout is being processed for this day.';
    bar.dataset.state = 'processing';
    return;
  }

  if (state.reward.claimable) {
    bar.dataset.state = 'claimable';

    if (state.you && state.you.canReceivePayments === false) {
      note.textContent =
        'You topped the board that day. Before the reward can be sent, sign in again and approve wallet access - Pi needs that permission to pay you.';
      claimBtn.textContent = 'Approve wallet access';
      claimBtn.classList.remove('hidden');
      claimBtn.dataset.action = 'reauth';
      return;
    }

    note.textContent = 'You topped the board that day. Claim it and it goes straight to your wallet.';
    claimBtn.textContent = 'Claim reward';
    claimBtn.dataset.action = 'claim';
    claimBtn.classList.remove('hidden');
    return;
  }

  bar.dataset.state = 'idle';
  if (!state.you) {
    note.textContent = 'Sign in with Pi to compete for the daily reward.';
  } else if (!state.settled) {
    note.textContent = 'The day has to finish before the reward can be claimed.';
  } else if (state.you.isWinner) {
    note.textContent = 'The claim window for this day has closed.';
  } else {
    note.textContent = 'Awarded to whoever tops the board when the day ends.';
  }
}

async function claim() {
  const btn = $('#reward-claim');

  if (btn.dataset.action === 'reauth') {
    document.dispatchEvent(new CustomEvent('pi:sign-in-requested'));
    return;
  }

  btn.disabled = true;
  const previous = btn.textContent;
  btn.textContent = 'Paying…';

  try {
    const day = state.day;
    await api('/api/rewards/claim', { method: 'POST', body: { day } });
    btn.textContent = 'Sending…';

    const deadline = Date.now() + 4 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const s = await api(`/api/rewards/status?day=${encodeURIComponent(day)}`).catch(() => null);
      if (!s) continue;
      if (s.status === 'paid') {
        toast('Your reward is on its way to your wallet.');
        await load();
        return;
      }
      if (s.status === 'failed') {
        toast(s.error || 'The payout failed. Please try again later.', 'bad', 10000);
        await load();
        return;
      }
    }
    toast('Still processing. Reload the page in a moment to see the result.', 'bad', 9000);
  } catch (err) {
    toast(err.message, 'bad', 9000);
  } finally {
    btn.disabled = false;
    btn.textContent = previous;
  }
}
