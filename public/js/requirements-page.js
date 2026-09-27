import { api } from './util.js';
import { initTheme } from './theme.js';
import { pi, initPi, signIn, signOut, messageFor } from './pi.js';
import { initCapability } from './capability.js';
import { initShell, applyBrand, applyNetworkLinks, bindAuthButtons } from './shell.js';

initTheme();
initShell();
initCapability();

const cfg = await api('/api/config').catch(() => null);
if (cfg) {
  applyBrand(cfg);
  applyNetworkLinks(cfg);
  await initPi(cfg);
  bindAuthButtons({ signIn, signOut, messageFor });
}
