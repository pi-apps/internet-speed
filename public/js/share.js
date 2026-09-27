import { toast } from './util.js';
import { pi } from './pi.js';

export async function share({ title, message }) {
  if (pi.mode === 'sdk' && typeof window.Pi?.openShareDialog === 'function') {
    try {
      window.Pi.openShareDialog(title, message);
      return 'pi';
    } catch (err) {
      console.warn('[share] Pi.openShareDialog failed:', err);
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text: message });
      return 'web-share';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(message);
    toast('Copied to your clipboard.');
    return 'clipboard';
  } catch {
    prompt('Copy this:', message);
    return 'prompt';
  }
}

export const shareSupported = () =>
  (pi.mode === 'sdk' && typeof window.Pi?.openShareDialog === 'function') ||
  Boolean(navigator.share) ||
  Boolean(navigator.clipboard);
