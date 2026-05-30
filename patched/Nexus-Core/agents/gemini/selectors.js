// NEXUS — Claude DOM Selectors
// agents/claude/selectors.js
// claude.ai — MutationObserver targets. Never polled.
'use strict';

const SELECTORS = {
  textarea:  '[contenteditable="true"].ProseMirror, div[data-placeholder*="message"], div[data-placeholder*="Reply"]',
  response:  '[data-testid="message-content"] .prose, .prose.max-w-full, article .prose',
  sendBtn:   'button[aria-label*="Send"], button[data-testid*="send"], button[aria-label*="send message"]',
  streaming: '[class*="streaming"], [data-testid*="streaming"], .animate-pulse',
  usage:     '.token-count, [class*="usage-indicator"], [class*="message-limit"], [data-testid*="usage"]',
  rateLimit: ['[class*="rate-limit"]', '[class*="usage-limit"]'],
  newChat:   'button[aria-label*="New chat"], a[href*="/new"]',
  stopBtn:   'button[aria-label*="Stop"]',
};

const USAGE_PATTERNS = [
  /([\d,]+)\s*(?:of|\/)\s*([\d,]+)\s*(?:messages?|prompts?)/i,
  /(\d+)\s*(?:messages?|prompts?)\s*(?:remaining|left)/i,
  /(\d+)\s*%/i,
];

const RATE_LIMIT_TEXT = [
  'usage limit', 'hit the usage', 'rate limit', 'limit reached',
  'daily limit', 'try again', 'message limit', 'out of messages',
];

const URL = 'https://claude.ai/new';

function parseUsage(text) {
  if (!text) return null;
  for (const p of USAGE_PATTERNS) {
    const m = text.replace(/,/g, '').match(p);
    if (!m) continue;
    if (m[2]) return { percent: Math.round(parseInt(m[1]) / parseInt(m[2]) * 100), raw: text };
    if (m[1]) return { percent: parseInt(m[1]), raw: text };
  }
  return null;
}

function isRateLimited(text) {
  const lower = (text || '').toLowerCase();
  return RATE_LIMIT_TEXT.some(s => lower.includes(s));
}

module.exports = { SELECTORS, USAGE_PATTERNS, RATE_LIMIT_TEXT, URL, parseUsage, isRateLimited };
