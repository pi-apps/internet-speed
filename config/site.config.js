const env = process.env;

function parseTrustProxy(value) {
  if (value === undefined || value === '') return 'loopback';
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export const site = {
  brand: {
    name: env.BRAND_NAME || 'Internet Speed',
    tagline: 'Your real internet speed, measured properly.',
    description:
      'Run a speed test and measure your latency to the services you actually use.',
    email: env.CONTACT_EMAIL || 'hello@example.com',
    telegram: env.CONTACT_TELEGRAM || 'https://t.me/example',
    url: env.SITE_URL || 'https://speed.example.com',
  },

  widget: {
    url: env.SPEEDTEST_URL || 'https://openspeedtest.com/speedtest',
    credit: 'https://openspeedtest.com',
  },

  pingTargets: [
    { id: 'google', name: 'Google', hint: 'Search', url: 'https://www.google.com/generate_204' },
    { id: 'cloudflare', name: 'Cloudflare', hint: 'CDN edge', url: 'https://cloudflare.com/cdn-cgi/trace' },
    { id: 'youtube', name: 'YouTube', hint: 'Video', url: 'https://www.youtube.com/generate_204' },
    { id: 'github', name: 'GitHub', hint: 'Developers', url: 'https://github.githubassets.com/favicons/favicon.svg' },
    { id: 'wikipedia', name: 'Wikipedia', hint: 'Reference', url: 'https://www.wikipedia.org/static/favicon/wikipedia.ico' },
    { id: 'amazon', name: 'Amazon', hint: 'Commerce', url: 'https://www.amazon.com/favicon.ico' },
    { id: 'microsoft', name: 'Microsoft', hint: 'Cloud', url: 'https://www.microsoft.com/favicon.ico' },
    { id: 'netflix', name: 'Netflix', hint: 'Streaming', url: 'https://www.netflix.com/favicon.ico' },
    { id: 'steam', name: 'Steam', hint: 'Gaming', url: 'https://store.steampowered.com/favicon.ico' },
    { id: 'telegram', name: 'Telegram', hint: 'Messaging', url: 'https://telegram.org/favicon.ico' },
  ],

  pi: {
    enabled: env.PI_ENABLED !== 'false',

    sandbox: env.PI_SANDBOX === 'true',

    clientId: env.PI_CLIENT_ID || '',

    redirectUri:
      env.PI_REDIRECT_URI ||
      `${(env.SITE_URL || 'https://speed.example.com').replace(/\/$/, '')}/signin/callback`,

    scopes: (env.PI_SCOPES || 'username wallet_address').split(/\s+/).filter(Boolean),

    sdkScopes: (env.PI_SDK_SCOPES || 'username payments wallet_address').split(/\s+/).filter(Boolean),
    authorizeUrl: env.PI_AUTHORIZE_URL || 'https://accounts.pinet.com/oauth/authorize',
    apiBase: env.PI_API_BASE || 'https://api.minepi.com/v2',
    validationKey: env.PI_VALIDATION_KEY || '',
    sessionDays: Number(env.PI_SESSION_DAYS || 30),

    apiKey: env.PI_API_KEY || '',

    walletPrivateSeed: env.PI_WALLET_PRIVATE_SEED || '',
    networkPassphrase: env.PI_NETWORK_PASSPHRASE || '',
  },

  ads: {
    enabled: env.ADS_ENABLED === 'true',
    beforeSignIn: env.ADS_BEFORE_SIGNIN !== 'false',
    beforeLatency: env.ADS_BEFORE_LATENCY !== 'false',

    cooldownSeconds: Number(env.ADS_COOLDOWN_SECONDS || 300),

    blockOnFailure: env.ADS_BLOCK_ON_FAILURE === 'true',
  },

  rewards: {
    enabled: env.REWARDS_ENABLED === 'true'
      && Boolean(env.PI_API_KEY)
      && Boolean(env.PI_WALLET_PRIVATE_SEED),
    amount: Number(env.REWARD_AMOUNT || 0.1),
    memo: (env.REWARD_MEMO || 'Daily latency champion').slice(0, 60),
    minReachable: Number(env.REWARD_MIN_REACHABLE || 6),
    minRunSeconds: Number(env.REWARD_MIN_RUN_SECONDS || 6),
    maxRunSeconds: Number(env.REWARD_MAX_RUN_SECONDS || 900),
    minLatencyMs: Number(env.REWARD_MIN_LATENCY_MS || 3),
    dayOffsetMinutes: Number(env.REWARD_DAY_OFFSET_MINUTES || 0),
    claimWindowDays: Number(env.REWARD_CLAIM_WINDOW_DAYS || 7),
    leaderboardSize: Number(env.REWARD_LEADERBOARD_SIZE || 10),
  },

  donations: {
    enabled: env.DONATIONS_ENABLED !== 'false' && Boolean(env.PI_API_KEY),
    presets: (env.DONATION_PRESETS || '0.5,1,5,10').split(',').map(Number).filter(Boolean),
    min: Number(env.DONATION_MIN || 0.01),
    max: Number(env.DONATION_MAX || 1000),

    memoMaxLength: Number(env.DONATION_MEMO_MAX || 50),
    memoPrefix: env.DONATION_MEMO_PREFIX || '',

    mainnetUrl: env.MAINNET_URL || '',
    mainnetLabel: env.MAINNET_LABEL || 'Open the Mainnet site',
  },

  network: {
    name: (env.PI_NETWORK || 'testnet').toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet',
    altUrl: env.ALT_NETWORK_URL || env.MAINNET_URL || '',
    altLabel: env.ALT_NETWORK_LABEL || '',
  },

  csp: {
    scriptSrc: (env.CSP_SCRIPT_SRC_EXTRA || '').split(/\s+/).filter(Boolean),
    connectSrc: (env.CSP_CONNECT_SRC_EXTRA || '').split(/\s+/).filter(Boolean),
  },

  ping: {
    samples: 4,
    timeoutMs: 5000,
    gapMs: 60,
  },

  features: {
    saveResults: env.SAVE_RESULTS !== 'false',
    publicStats: env.PUBLIC_STATS !== 'false',
    geoLookup: env.GEO_PROVIDER || 'ip-api',
  },

  server: {
    port: Number(env.PORT || 8080),
    host: env.HOST || '0.0.0.0',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    dbFile: env.DB_FILE || './data/internet-speed.db',
    adminToken: env.ADMIN_TOKEN || '',
    adminUsernames: (env.ADMIN_USERNAMES || '')
      .split(',')
      .map((n) => n.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
    runsPerClient: 100,
  },
};

export function publicConfig() {
  return {
    brand: site.brand,
    widget: site.widget,
    pi: {
      enabled: site.pi.enabled,
      sandbox: site.pi.sandbox,
      configured: Boolean(site.pi.clientId),
      clientId: site.pi.clientId,
      redirectUri: site.pi.redirectUri,
      scopes: site.pi.scopes,
      sdkScopes: site.pi.sdkScopes,
      authorizeUrl: site.pi.authorizeUrl,
    },
    pingTargets: site.pingTargets,
    ping: site.ping,
    features: site.features,

  ads: {
    enabled: env.ADS_ENABLED === 'true',
    beforeSignIn: env.ADS_BEFORE_SIGNIN !== 'false',
    beforeLatency: env.ADS_BEFORE_LATENCY !== 'false',

    cooldownSeconds: Number(env.ADS_COOLDOWN_SECONDS || 300),

    blockOnFailure: env.ADS_BLOCK_ON_FAILURE === 'true',
  },

  rewards: {
      enabled: site.rewards.enabled,
      amount: site.rewards.amount,
      minReachable: site.rewards.minReachable,
      leaderboardSize: site.rewards.leaderboardSize,
    },
    donations: {
      enabled: site.donations.enabled,
      presets: site.donations.presets,
      min: site.donations.min,
      max: site.donations.max,
      memoMaxLength: site.donations.memoMaxLength,
      mainnetUrl: site.donations.mainnetUrl,
      mainnetLabel: site.donations.mainnetLabel,
    },
    network: {
      name: site.network.name,
      altUrl: site.network.altUrl,
      altLabel:
        site.network.altLabel ||
        (site.network.name === 'mainnet' ? 'Open the Testnet site' : 'Open the Mainnet site'),
      altName: site.network.name === 'mainnet' ? 'Testnet' : 'Mainnet',
    },
  };
}

export function safeOrigin(url = '') {
  try {
    if (url.startsWith('//')) return new URL('https:' + url).origin;
    if (!/^https?:\/\//i.test(url)) return null;
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function targetOrigins() {
  return [...new Set(site.pingTargets.map((t) => safeOrigin(t.url)).filter(Boolean))];
}

export default site;
