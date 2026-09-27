import site from '../../config/site.config.js';

const TIMEOUT_MS = 12_000;

export async function verifyRewardedAd(adId) {
  if (!site.pi.apiKey) {
    return { ok: false, reason: 'no-api-key', detail: 'PI_API_KEY is required to verify rewarded ads.' };
  }
  if (typeof adId !== 'string' || !adId || adId.length > 200) {
    return { ok: false, reason: 'bad-id', detail: 'No usable ad identifier was supplied.' };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${site.pi.apiBase}/ads_network/status/${encodeURIComponent(adId)}`, {
      headers: { Authorization: `Key ${site.pi.apiKey}`, Accept: 'application/json' },
      signal: ctl.signal,
    });

    if (res.status === 404) {
      return { ok: false, reason: 'unknown-ad', detail: 'Pi does not recognise that ad identifier.' };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, reason: 'api-error', detail: `Pi answered ${res.status}. ${body.slice(0, 200)}` };
    }

    const dto = await res.json();
    const status = dto?.mediator_ack_status ?? null;

    return {
      ok: status === 'granted',
      status,
      grantedAt: dto?.mediator_granted_at || null,
      revokedAt: dto?.mediator_revoked_at || null,
      reason: status === 'granted' ? null : `mediator_ack_status is ${status ?? 'null'}`,
      detail:
        status === 'granted'
          ? 'The ad network confirmed the view.'
          : 'The ad network has not confirmed this view, so it does not count.',
    };
  } catch (err) {
    const detail =
      err.name === 'AbortError'
        ? `Pi did not answer within ${TIMEOUT_MS / 1000}s.`
        : `${err.name}: ${err.message}`;
    return { ok: false, reason: 'network', detail };
  } finally {
    clearTimeout(timer);
  }
}
