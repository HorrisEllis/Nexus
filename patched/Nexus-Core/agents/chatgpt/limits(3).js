// ═══════════════════════════════════════════════════
// NEXUS — ChatGPT Limits
// agents/chatgpt/limits.js
//
// DOM patterns: rate limits, usage bars, message caps.
// Guardian observer reads these; RAID learner consumes.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════
'use strict';

// ── Threshold config ──────────────────────────────
// When percent ≥ WARN → raid.learner flags drift risk
// When percent ≥ HARD → Law I: treat as unavailable
const THRESHOLDS = { warn: 75, hard: 90 };

// ── DOM patterns that signal rate-limiting ────────
const RATE_LIMIT_SELECTORS = [
  '[class*="rate-limit"]',
  '[class*="limit-reached"]',
  '[data-testid*="limit"]',
];

const RATE_LIMIT_TEXT = [
  'message limit',
  "you've reached",
  "you have reached",
  'limit reached',
  'come back later',
  'try again in',
  'too many messages',
  'requests per',
  'slow down',
];

// ── DOM patterns for usage percentage ─────────────
const USAGE_SELECTORS = [
  '[class*="usage"]',
  '[data-testid*="token"]',
  'span[class*="limit"]',
  '[class*="message-count"]',
];

// ── Regex patterns for parsing usage text ─────────
const USAGE_PATTERNS = [
  // "40 of 50 messages" / "40/50 messages"
  /([\d,]+)\s*(?:of|\/)\s*([\d,]+)\s*messages?/i,
  // "10 messages remaining"
  /(\d+)\s*messages?\s*remaining/i,
  // "80% of limit" / "80% used"
  /(\d+)\s*%\s*(?:of\s+)?(?:usage|limit|used)/i,
  // Progress bar aria-valuenow
  /aria-valuenow="(\d+)"/i,
];

// ── Parse usage from DOM text or attribute ────────
function parseUsage(text) {
  if (!text) return null;
  const clean = text.replace(/,/g, '').trim();
  for (const p of USAGE_PATTERNS) {
    const m = clean.match(p);
    if (!m) continue;
    if (m[2]) {
      const used  = parseInt(m[1]);
      const total = parseInt(m[2]);
      if (!total) continue;
      return {
        percent:   Math.round(used / total * 100),
        used,
        total,
        raw:       text,
        atWarn:    Math.round(used / total * 100) >= THRESHOLDS.warn,
        atHard:    Math.round(used / total * 100) >= THRESHOLDS.hard,
      };
    }
    if (m[1]) {
      const percent = parseInt(m[1]);
      return {
        percent,
        raw:    text,
        atWarn: percent >= THRESHOLDS.warn,
        atHard: percent >= THRESHOLDS.hard,
      };
    }
  }
  return null;
}

// ── Detect rate-limit state from DOM text ─────────
function isRateLimited(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return RATE_LIMIT_TEXT.some(s => lower.includes(s));
}

// ── Detect streaming-in-progress ──────────────────
// While streaming: don't inject another prompt
const STREAMING_SELECTORS = [
  '.result-streaming',
  '[data-testid="streaming-indicator"]',
  'button[aria-label*="Stop"]',
];

function isStreaming() {
  if (typeof document === 'undefined') return false;
  return STREAMING_SELECTORS.some(s => !!document.querySelector(s));
}

// ── Availability summary ──────────────────────────
// Returns object usable by RAID learner directly
function availability() {
  if (typeof document === 'undefined') {
    return { available: false, reason: 'no_dom', percent: 0 };
  }

  // Rate limit check via DOM text
  const body = document.body?.innerText || '';
  if (isRateLimited(body)) {
    return { available: false, reason: 'rate_limited', percent: 100 };
  }

  // Usage percentage from DOM
  for (const sel of USAGE_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const parsed = parseUsage(el.textContent || el.getAttribute('aria-valuenow') || '');
    if (parsed) {
      return {
        available: !parsed.atHard,
        reason:    parsed.atHard ? 'usage_hard_limit' : parsed.atWarn ? 'usage_warn' : 'ok',
        percent:   parsed.percent,
        used:      parsed.used,
        total:     parsed.total,
      };
    }
  }

  return { available: true, reason: 'ok', percent: 0 };
}

module.exports = {
  THRESHOLDS,
  RATE_LIMIT_SELECTORS,
  RATE_LIMIT_TEXT,
  USAGE_SELECTORS,
  USAGE_PATTERNS,
  STREAMING_SELECTORS,
  parseUsage,
  isRateLimited,
  isStreaming,
  availability,
};
