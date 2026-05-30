// ═══════════════════════════════════════════════════
// NEXUS — Agent DOM Selectors
// agents/chatgpt/selectors.js
// agents/claude/selectors.js
// agents/gemini/selectors.js
//
// Used by extension content scripts.
// MutationObserver watches these for:
//   - textarea: where to inject prompt
//   - response: where to scrape output
//   - usage: where to read usage signals
//   - rateLimit: DOM patterns indicating limit hit
// ═══════════════════════════════════════════════════

'use strict';

// These are observed, not polled. Guardian uses
// MutationObserver on these selectors to detect changes.

const SELECTORS = {
  chatgpt: {
    textarea:  '#prompt-textarea, .ProseMirror[contenteditable]',
    response:  '.markdown.prose, [data-message-author-role="assistant"] .markdown',
    sendBtn:   '[data-testid="send-button"], button[aria-label*="Send"]',
    usage:     '[class*="usage"], [data-testid*="token"]',
    rateLimit: ['[class*="rate-limit"]', 'p:contains("message limit")', '[class*="limit-reached"]'],
    streaming: '.result-streaming, [data-testid="streaming-indicator"]',
    newChat:   'a[href="/"]',
    url:       'https://chatgpt.com/c/',
  },

  claude: {
    textarea:  '[contenteditable="true"].ProseMirror, div[data-placeholder*="message"]',
    response:  '.prose, [data-testid="message-content"] .prose',
    sendBtn:   'button[aria-label*="Send"], button[type="submit"]',
    usage:     '.token-count, [class*="usage-indicator"]',
    rateLimit: ['[class*="rate-limit"]', 'div:contains("hit the usage")'],
    streaming: '[class*="streaming"]',
    newChat:   'button[aria-label*="New chat"]',
    url:       'https://claude.ai/chat',
  },

  gemini: {
    textarea:  'rich-textarea .ql-editor, [contenteditable][aria-label*="message"]',
    response:  'message-content, .response-content',
    sendBtn:   'button[aria-label*="Send"]',
    usage:     '.usage-bar, [class*="usage"]',
    rateLimit: ['[class*="rate-limit"]', 'div:contains("quota exceeded")'],
    streaming: '[class*="loading"]',
    newChat:   'button[aria-label*="New chat"]',
    url:       'https://gemini.google.com/app',
  },
};

// Usage signal patterns — what text/values indicate % used
const USAGE_PATTERNS = {
  chatgpt: [
    /(\d+)\s*(?:of|\/)\s*(\d+)\s*messages?/i,        // "40 of 50 messages"
    /(\d+)%\s*(?:of|used)/i,                           // "80% used"
    /(\d+)\s*messages?\s*remaining/i,                  // "10 messages remaining"
  ],
  claude: [
    /(\d+)%?\s*(?:of|used)/i,
    /(\d+)\s*(?:of|\/)\s*(\d+)/i,
  ],
  gemini: [
    /(\d+)\s*(?:of|\/)\s*(\d+)/i,
    /quota:\s*(\d+)%/i,
  ],
};

// Parse usage reading from DOM text
function parseUsage(service, text) {
  if (!text) return null;
  const patterns = USAGE_PATTERNS[service] || [];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      if (m[2]) {
        // "X of Y" — compute percentage
        return { percent: Math.round((parseInt(m[1]) / parseInt(m[2])) * 100), raw: text };
      }
      if (m[1]) {
        // Direct percentage
        return { percent: parseInt(m[1]), raw: text };
      }
    }
  }
  return null;
}

module.exports = { SELECTORS, USAGE_PATTERNS, parseUsage };
