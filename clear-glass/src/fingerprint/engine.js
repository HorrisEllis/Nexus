'use strict';

/**
 * Fingerprint Engine
 * Builds and manages per-agent Firefox fingerprint profiles.
 * Each profile is a sovereign identity: UA, canvas noise, WebGL,
 * fonts, screen, navigator overrides, Accept headers, timezone.
 * 
 * Profiles are SEAM entities — UUID'd, versioned, stored.
 */

const path = require('path');
const fs   = require('fs');
const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.

// Firefox UA pool — realistic, versioned
const FF_UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];

// Firefox Accept header sets (exact Firefox order matters for JA3)
const FF_ACCEPT_HEADERS = {
  navigation: {
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT':             '1',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest':  'document',
    'Sec-Fetch-Mode':  'navigate',
    'Sec-Fetch-Site':  'none',
    'Sec-Fetch-User':  '?1',
  },
  fetch: {
    'Accept':          '*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest':  'empty',
    'Sec-Fetch-Mode':  'cors',
    'Sec-Fetch-Site':  'same-origin',
  },
};

// Firefox-characteristic canvas noise seeds
function canvasNoise(seed) {
  // Deterministic per-profile noise — same agent always produces same fingerprint
  const s = parseInt(seed.replace(/-/g, '').slice(0, 8), 16);
  return {
    r: (s & 0xFF),
    g: ((s >> 8) & 0xFF),
    b: ((s >> 16) & 0xFF),
    noise: ((s >> 24) & 0x0F) / 255,
  };
}

// Firefox WebGL renderer strings
const WEBGL_RENDERERS = [
  { vendor: 'Mozilla', renderer: 'Mozilla' },
  { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1060/PCIe/SSE2' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 580 OpenGL Engine' },
];

// Screen profiles
const SCREEN_PROFILES = [
  { width: 1920, height: 1080, devicePixelRatio: 1 },
  { width: 2560, height: 1440, devicePixelRatio: 1 },
  { width: 1440, height: 900,  devicePixelRatio: 2 },
  { width: 1366, height: 768,  devicePixelRatio: 1 },
];

// Timezone pool
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'America/Denver', 'Europe/London', 'Europe/Berlin',
  'Asia/Tokyo', 'Australia/Sydney',
];

class FingerprintEngine {
  constructor() {
    this.profilesPath = path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'fingerprints.json');
    this.profiles = new Map();
  }

  async load() {
    try {
      fs.mkdirSync(path.dirname(this.profilesPath), { recursive: true });
      if (fs.existsSync(this.profilesPath)) {
        const raw = JSON.parse(fs.readFileSync(this.profilesPath, 'utf8'));
        for (const [id, profile] of Object.entries(raw)) {
          this.profiles.set(id, profile);
        }
        console.log(`[Fingerprint] Loaded ${this.profiles.size} profiles`);
      }
    } catch (err) {
      console.warn('[Fingerprint] Could not load profiles:', err.message);
    }
  }

  async save() {
    const obj = {};
    for (const [id, profile] of this.profiles) obj[id] = profile;
    fs.writeFileSync(this.profilesPath, JSON.stringify(obj, null, 2), 'utf8');
  }

  // ── Profile management ─────────────────────────────────────────────────
  generate(agentId, options = {}) {
    const seed     = agentId || uuidv4();
    const uaIndex  = this._hash(seed) % FF_UA_POOL.length;
    const wglIndex = (this._hash(seed + 'wgl')) % WEBGL_RENDERERS.length;
    const scrIndex = (this._hash(seed + 'scr')) % SCREEN_PROFILES.length;
    const tzIndex  = (this._hash(seed + 'tz'))  % TIMEZONES.length;

    const profile = {
      uuid:      uuidv4(),
      agentId:   seed,
      version:   1,
      ua:        options.ua        || FF_UA_POOL[uaIndex],
      webgl:     options.webgl     || WEBGL_RENDERERS[wglIndex],
      screen:    options.screen    || SCREEN_PROFILES[scrIndex],
      timezone:  options.timezone  || TIMEZONES[tzIndex],
      canvas:    canvasNoise(seed),
      language:  options.language  || 'en-US',
      languages: options.languages || ['en-US', 'en'],
      platform:  options.platform  || 'Win32',
      accept:    FF_ACCEPT_HEADERS,
      fonts:     this._firefoxFontSet(),
      doNotTrack: '1',
      hardwareConcurrency: [2, 4, 8, 16][this._hash(seed + 'cpu') % 4],
      deviceMemory: [4, 8, 16][this._hash(seed + 'mem') % 3],
      createdAt: Date.now(),
      source:    'generated',
    };

    this.profiles.set(agentId, profile);
    this.save().catch(() => {});
    return profile;
  }

  getOrGenerate(agentId) {
    return this.profiles.get(agentId) || this.generate(agentId);
  }

  // Import from Firefox profile export
  importFirefox(agentId, ffProfile) {
    const profile = {
      ...this.generate(agentId),
      ua:       ffProfile.userAgent   || undefined,
      language: ffProfile.intlLocale  || undefined,
      timezone: ffProfile.timezone    || undefined,
      source:   'firefox-import',
      imported: Date.now(),
    };
    // Merge — override only what Firefox provides
    Object.keys(profile).forEach(k => profile[k] === undefined && delete profile[k]);
    this.profiles.set(agentId, profile);
    this.save().catch(() => {});
    return profile;
  }

  // ── Preload script generator ──────────────────────────────────────────
  // Returns JS to inject via Electron preload to spoof navigator, canvas, WebGL
  generateSpoofScript(agentId) {
    const p = this.getOrGenerate(agentId);
    return `
(function() {
  'use strict';

  // ── Navigator overrides ──────────────────────────────────────────────
  const nav = window.navigator;
  const overrides = {
    userAgent:           ${JSON.stringify(p.ua)},
    platform:            ${JSON.stringify(p.platform)},
    language:            ${JSON.stringify(p.language)},
    languages:           ${JSON.stringify(p.languages)},
    hardwareConcurrency: ${p.hardwareConcurrency},
    deviceMemory:        ${p.deviceMemory},
    doNotTrack:          ${JSON.stringify(p.doNotTrack)},
  };

  for (const [key, val] of Object.entries(overrides)) {
    try {
      Object.defineProperty(nav, key, { get: () => val, configurable: true });
    } catch {}
  }

  // Remove webdriver flag
  try {
    Object.defineProperty(nav, 'webdriver', { get: () => false });
  } catch {}

  // Firefox-specific navigator properties
  try {
    Object.defineProperty(nav, 'buildID', { get: () => '20181001000000' });
    Object.defineProperty(nav, 'productSub', { get: () => '20100101' });
    Object.defineProperty(nav, 'vendor', { get: () => '' });
  } catch {}

  // ── Screen overrides ─────────────────────────────────────────────────
  const scr = ${JSON.stringify(p.screen)};
  try {
    Object.defineProperty(window, 'devicePixelRatio', { get: () => scr.devicePixelRatio });
    Object.defineProperty(screen, 'width',  { get: () => scr.width });
    Object.defineProperty(screen, 'height', { get: () => scr.height });
    Object.defineProperty(screen, 'availWidth',  { get: () => scr.width });
    Object.defineProperty(screen, 'availHeight', { get: () => scr.height - 40 });
  } catch {}

  // ── Canvas noise ─────────────────────────────────────────────────────
  const _noise = ${JSON.stringify(p.canvas)};
  const _origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const ctx = _origGetContext.call(this, type, ...args);
    if (!ctx) return ctx;
    if (type === '2d') {
      const _origGetImageData = ctx.getImageData.bind(ctx);
      ctx.getImageData = function(x, y, w, h) {
        const img = _origGetImageData(x, y, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i]     = Math.min(255, img.data[i]     + (_noise.r % 3));
          img.data[i + 1] = Math.min(255, img.data[i + 1] + (_noise.g % 3));
          img.data[i + 2] = Math.min(255, img.data[i + 2] + (_noise.b % 3));
        }
        return img;
      };
    }
    return ctx;
  };

  // ── WebGL overrides ──────────────────────────────────────────────────
  const _wgl = ${JSON.stringify(p.webgl)};
  const _origGetParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 0x1F00) return _wgl.vendor;    // VENDOR
    if (param === 0x1F01) return _wgl.renderer;  // RENDERER
    return _origGetParam.call(this, param);
  };

  // ── Timezone ─────────────────────────────────────────────────────────
  const _tz = ${JSON.stringify(p.timezone)};
  const _origDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function(locale, options = {}) {
    options.timeZone = options.timeZone || _tz;
    return new _origDateTimeFormat(locale, options);
  };
  Object.assign(Intl.DateTimeFormat, _origDateTimeFormat);

  // ── Plugins — mimic Firefox ──────────────────────────────────────────
  Object.defineProperty(nav, 'plugins', {
    get: () => ({ length: 0, item: () => null, namedItem: () => null }),
  });
  Object.defineProperty(nav, 'mimeTypes', {
    get: () => ({ length: 0, item: () => null, namedItem: () => null }),
  });

})();
    `.trim();
  }

  // ── Internals ──────────────────────────────────────────────────────────
  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  _firefoxFontSet() {
    // Firefox default system fonts — not Chrome's set
    return [
      'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New',
      'Georgia', 'Impact', 'Times New Roman', 'Trebuchet MS',
      'Verdana', 'Segoe UI', 'Tahoma', 'Palatino Linotype',
    ];
  }
}

module.exports = FingerprintEngine;
