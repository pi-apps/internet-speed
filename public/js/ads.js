import { toast } from './util.js';
import { pi } from './pi.js';

export const ads = {
  enabled: false,
  supported: false,
  reason: null,
};

let cfg = null;
const lastShown = new Map();

export async function initAds(publicConfig) {
  cfg = publicConfig.ads || { enabled: false };
  ads.enabled = Boolean(cfg.enabled);

  if (!ads.enabled) {
    ads.reason = 'disabled';
    return ads;
  }

  if (pi.mode !== 'sdk' || typeof window.Pi?.Ads?.showAd !== 'function') {
    ads.reason = 'not-pi-browser';
    return ads;
  }

  try {
    const features = await window.Pi.nativeFeaturesList();
    ads.supported = Array.isArray(features) && features.includes('ad_network');
    if (!ads.supported) ads.reason = 'old-pi-browser';
  } catch {
    ads.reason = 'feature-check-failed';
  }

  if (ads.supported) preload('interstitial');
  return ads;
}

function preload(type) {
  window.Pi?.Ads?.requestAd?.(type).catch(() => {});
}

function onCooldown(placement) {
  const at = lastShown.get(placement);
  return at ? Date.now() - at < (cfg.cooldownSeconds || 0) * 1000 : false;
}

export async function runAdGate(placement, { label } = {}) {
  if (!ads.enabled || !ads.supported) return { proceed: true, shown: false, reason: ads.reason };
  if (onCooldown(placement)) return { proceed: true, shown: false, reason: 'cooldown' };

  const type = pi.signedIn ? 'rewarded' : 'interstitial';

  try {
    const ready = await window.Pi.Ads.isAdReady(type);
    if (ready?.ready !== true) {
      const requested = await window.Pi.Ads.requestAd(type);

      if (requested?.result === 'ADS_NOT_SUPPORTED') {
        ads.supported = false;
        ads.reason = 'old-pi-browser';
        return { proceed: true, shown: false, reason: 'unsupported' };
      }
      if (requested?.result !== 'AD_LOADED') {
        return allowOrBlock('unavailable', label);
      }
    }

    const shown = await window.Pi.Ads.showAd(type);
    lastShown.set(placement, Date.now());
    preload(type);

    if (type === 'interstitial') {
      return { proceed: true, shown: shown?.result === 'AD_CLOSED', result: shown?.result };
    }

    if (shown?.result === 'AD_REWARDED' && shown.adId) {
      const verified = await verify(shown.adId, placement);
      return { proceed: true, shown: true, rewarded: verified.rewarded, result: shown.result };
    }

    if (shown?.result === 'USER_UNAUTHENTICATED') {
      return { proceed: true, shown: false, reason: 'not-signed-in' };
    }

    return { proceed: true, shown: shown?.result === 'AD_CLOSED', result: shown?.result };
  } catch (err) {
    console.warn('[ads] gate failed:', err);
    return allowOrBlock('error', label);
  }
}

function allowOrBlock(reason, label) {
  if (!cfg.blockOnFailure) return { proceed: true, shown: false, reason };
  toast(`No advert is available right now, so ${label || 'this action'} cannot start. Please try again shortly.`, 'bad', 7000);
  return { proceed: false, shown: false, reason };
}

async function verify(adId, placement) {
  try {
    const res = await fetch('/api/ads/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ adId, placement }),
    });
    return await res.json();
  } catch {
    return { rewarded: false };
  }
}
