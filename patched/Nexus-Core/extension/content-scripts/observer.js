// ═══════════════════════════════════════════════════
// NEXUS Guardian — Content Script: Observer + Scraper
// extension/content-scripts/observer.js
//
// MutationObserver watches the DOM for:
//   - Response streaming (collect and emit when done)
//   - Usage signals (% of limit used)
//   - Rate limit DOM patterns
//
// Does NOT poll. Only reacts to mutations.
// ═══════════════════════════════════════════════════

'use strict';

(function () {
  if (window.__nexusObserverLoaded) return;
  window.__nexusObserverLoaded = true;

  const service = detectService();
  if (!service) return;

  // Response selectors — where to read generated text
  const RESPONSE_SEL = {
    chatgpt: '[data-message-author-role="assistant"] .markdown, .result-streaming',
    claude:  '[data-testid="message-content"] .prose, .prose.max-w-full',
    gemini:  'message-content, .response-content .markdown',
  };

  // Usage signal selectors
  const USAGE_SEL = {
    chatgpt: '[class*="usage"], [data-testid*="token"], span[class*="limit"]',
    claude:  '.token-count, [class*="usage-indicator"], [class*="message-limit"]',
    gemini:  '.usage-bar, [class*="usage"], [class*="quota"]',
  };

  // Rate limit patterns
  const RATE_LIMIT_PATTERNS = {
    chatgpt: ['message limit', "you've reached", "limit reached", "come back"],
    claude:  ['usage limit', "hit the usage", "rate limit", "limit reached"],
    gemini:  ['quota exceeded', 'rate limit', 'daily limit'],
  };

  function detectService() {
    const h = window.location.hostname;
    if (h.includes('chatgpt.com'))    return 'chatgpt';
    if (h.includes('claude.ai'))      return 'claude';
    if (h.includes('gemini.google'))  return 'gemini';
    return null;
  }

  // ── Response collection ────────────────────────
  let _collecting = false;
  let _responseTimeout = null;
  let _lastResponseText = '';

  function startCollecting() {
    _collecting = true;
    _lastResponseText = '';
    clearTimeout(_responseTimeout);
  }

  function collectResponse() {
    const sel = RESPONSE_SEL[service];
    const els = document.querySelectorAll(sel);
    if (!els.length) return null;

    // Get the last (most recent) response element
    const el   = els[els.length - 1];
    const text = el.innerText || el.textContent || '';
    return text.trim();
  }

  function scheduleResponseCapture() {
    clearTimeout(_responseTimeout);
    _responseTimeout = setTimeout(() => {
      const text = collectResponse();
      if (text && text !== _lastResponseText) {
        _lastResponseText = text;
        _collecting = false;
        // Send to background → WebSocket → NEXUS pipeline
        chrome.runtime.sendMessage({
          type:    'response_ready',
          service,
          content: text,
        });
      }
    }, 1500); // wait 1.5s after last mutation
  }

  // ── Usage signal reading ───────────────────────
  function readUsage() {
    const sel = USAGE_SEL[service];
    if (!sel) return;
    const els = document.querySelectorAll(sel);
    els.forEach(el => {
      const text = el.textContent.trim();
      if (text) {
        chrome.runtime.sendMessage({
          type:    'usage_observed',
          service,
          raw:     text,
          ts:      Date.now(),
        });
      }
    });
  }

  // ── Rate limit detection ───────────────────────
  function checkRateLimit(text) {
    const patterns = RATE_LIMIT_PATTERNS[service] || [];
    const lower    = text.toLowerCase();
    for (const p of patterns) {
      if (lower.includes(p)) {
        chrome.runtime.sendMessage({
          type:    'rate_limit_detected',
          service,
          pattern: p,
          ts:      Date.now(),
        });
        return true;
      }
    }
    return false;
  }

  // ── Main MutationObserver ──────────────────────
  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      const target = mut.target;
      const text   = target.textContent || '';

      // Check for rate limit
      checkRateLimit(text);

      // Detect streaming response
      const responseSel = RESPONSE_SEL[service];
      if (responseSel && target.closest && target.closest(responseSel)) {
        if (!_collecting) startCollecting();
        scheduleResponseCapture();
      }

      // Check usage signals
      const usageSel = USAGE_SEL[service];
      if (usageSel && target.closest && target.closest(usageSel)) {
        readUsage();
      }
    }
  });

  // Observe entire body — all subtree mutations
  observer.observe(document.body, {
    childList:     true,
    subtree:       true,
    characterData: true,
    attributes:    false,
  });

  // Initial usage read on load
  setTimeout(readUsage, 2000);

  // Listen for collect trigger from background/injector
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'inject' && msg.service === service) {
      // Prompt just injected — start collecting response
      setTimeout(startCollecting, 500);
    }
  });

  console.log(`[NEXUS Guardian] Observer active on ${service}`);
})();
