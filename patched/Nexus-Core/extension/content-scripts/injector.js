// ═══════════════════════════════════════════════════
// NEXUS Guardian — Content Script: Injector
// extension/content-scripts/injector.js
//
// Injects prompts into service textarea elements.
// Uses React synthetic events where needed (ChatGPT).
// Triggers send button after injection.
// ═══════════════════════════════════════════════════

'use strict';

(function () {
  if (window.__nexusInjectorLoaded) return;
  window.__nexusInjectorLoaded = true;

  const service = detectService();

  // DOM selectors per service
  const SELECTORS = {
    chatgpt: {
      textarea: '#prompt-textarea, .ProseMirror[contenteditable]',
      sendBtn:  '[data-testid="send-button"], button[aria-label*="Send"]',
    },
    claude: {
      textarea: '[contenteditable="true"].ProseMirror, div[data-placeholder]',
      sendBtn:  'button[aria-label*="Send"], button[aria-label*="send"]',
    },
    gemini: {
      textarea: '.ql-editor[contenteditable], rich-textarea [contenteditable]',
      sendBtn:  'button[aria-label*="Send"], button.send-button',
    },
  };

  function detectService() {
    const h = window.location.hostname;
    if (h.includes('chatgpt.com'))    return 'chatgpt';
    if (h.includes('claude.ai'))      return 'claude';
    if (h.includes('gemini.google'))  return 'gemini';
    return null;
  }

  function getEl(selector) {
    const selectors = selector.split(',').map(s => s.trim());
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  // Inject text using native input events (bypasses React synthetic event blocking)
  function injectText(el, text) {
    el.focus();

    // For contenteditable elements
    if (el.isContentEditable) {
      el.innerHTML = '';
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // For textarea — use Object.getOwnPropertyDescriptor to bypass React
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function clickSend(sel) {
    await new Promise(r => setTimeout(r, 300));
    const btn = getEl(sel);
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    // Fallback: Enter key
    const textarea = getEl(SELECTORS[service]?.textarea || 'textarea');
    if (textarea) {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      return true;
    }
    return false;
  }

  // Listen for inject command from background
  chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    if (msg.type !== 'inject' || msg.service !== service) return;

    const sel = SELECTORS[service];
    if (!sel) { sendResponse({ ok: false, error: 'unknown service' }); return; }

    // Wait for textarea to exist
    let textarea = null;
    for (let i = 0; i < 30; i++) {
      textarea = getEl(sel.textarea);
      if (textarea) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!textarea) {
      chrome.runtime.sendMessage({ type: 'response_error', error: 'textarea not found' });
      sendResponse({ ok: false, error: 'textarea not found' });
      return;
    }

    injectText(textarea, msg.prompt);
    await new Promise(r => setTimeout(r, 400));
    await clickSend(sel.sendBtn);

    sendResponse({ ok: true });
    return true;
  });

  console.log(`[NEXUS Guardian] Injector active on ${service}`);
})();
