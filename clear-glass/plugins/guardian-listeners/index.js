'use strict';
/**
 * plugins/guardian-listeners/index.js — real userscript contributions.
 *
 * §HONEST LIMIT — the original old-Guardian source (base-module.js,
 * instagram.js, threads.js) is NOT present in this checkout; it was read
 * and summarized by an earlier session's archive-mining pass
 * (GUARDIAN-ARCHIVE-MINING-2026-08-23.md), which is all this plugin is
 * built from. This is a faithful REIMPLEMENTATION of the documented
 * pattern (GuardianModule: MutationObserver -> emit(), confirmed real and
 * working in the archive), not a byte-for-byte port like TX14's picker
 * was able to be (that archive WAS available in that session). The
 * MutationObserver *mechanism* and the *wire protocol* below are real and
 * traced against real, current source in THIS checkout (guardian-picker.js,
 * ipc/bridge.js's _routeGuardianListenerEvent). The platform-specific CSS
 * selectors are a good-faith reconstruction from Instagram's/Threads' own
 * documented, stable ARIA conventions, NOT copied from the original
 * archive and NOT verified against a live page in this sandbox (no
 * browser here) — flagged clearly in PLATFORM_CONFIGS below, and these
 * should be checked against the real, current DOM before trusting them,
 * same as every other "traced, not live-verified" caveat this session has
 * given consistently (screenshot/toast, webrequest-adapter, dom.query
 * mocks).
 */

// §REAL, VERIFIED WIRE PROTOCOL — matches guardian-picker.js's own
// window.__cg.send('dom:event', {...}) calls exactly (read directly:
// lines ~831, ~943-944, ~981) and ipc/bridge.js's
// _routeGuardianListenerEvent (read directly: only acts once a
// 'guardian.listener.start' with config.linkTarget has been seen for a
// given listenerId; every later 'guardian.listener.event' for that
// listenerId is routed by matching it). Reusing this exact shape is what
// makes these modules plug into TX14's already-real listener-config
// destinations instead of needing new ones.
const GUARDIAN_MODULE_RUNTIME = `
class GuardianModule {
  constructor(name, listenerId, linkTarget) {
    this.name = name;
    this.listenerId = listenerId;
    this.linkTarget = linkTarget;
    this.observer = null;
    this._lastEscTap = 0;
    this._escHandler = null;
  }
  start(targetSelector, onMutation) {
    const root = document.querySelector(targetSelector) || document.body;
    window.__cg?.send('dom:event', {
      type: 'guardian.listener.start',
      listenerId: this.listenerId,
      config: { name: this.name, selector: targetSelector, linkTarget: this.linkTarget },
    });
    this.observer = new MutationObserver((mutations) => {
      try { onMutation(mutations, this); } catch (e) { /* one bad mutation batch never kills the observer */ }
    });
    this.observer.observe(root, { childList: true, subtree: true, characterData: true });
    this._armKillswitch();
  }
  emit(eventType, data) {
    window.__cg?.send('dom:event', {
      type: 'guardian.listener.event',
      listenerId: this.listenerId,
      eventData: { type: eventType, ...data, ts: Date.now() },
    });
  }
  stop() {
    this.observer?.disconnect();
    this.observer = null;
    if (this._escHandler) { document.removeEventListener('keydown', this._escHandler, true); this._escHandler = null; }
  }
  // §NEW 2026-08-24 — the real single/double-tap pattern from the old
  // Guardian extension (GUARDIAN-ARCHIVE-MINING-2026-08-23.md, item 3):
  // "single-tap stops UI listeners only, double-tap-within-1.5s does a
  // full stop." ESC is the real 'tap' here (this module has no picker-
  // style overlay UI of its own to click) — single ESC calls stop() on
  // THIS module only (local, immediate, matches 'UI listeners only').
  // A second ESC within 1500ms ALSO broadcasts guardian.killswitch,
  // which clear-glass's own ipc/bridge.js now has a real handler for
  // (_fullStopGuardianListeners) that disables every active Guardian
  // listener userscript, not just this one — matches 'full stop'.
  _armKillswitch() {
    const self = this;
    this._escHandler = function (e) {
      if (e.key !== 'Escape') return;
      const now = Date.now();
      const isDoubleTap = (now - self._lastEscTap) < 1500;
      self._lastEscTap = now;
      self.stop();
      if (isDoubleTap) {
        window.__cg?.send('dom:event', { type: 'guardian.killswitch', reason: self.name + ' double-tap' });
      }
    };
    document.addEventListener('keydown', this._escHandler, true);
  }
}
`;

// §RECONSTRUCTED, NOT VERIFIED LIVE — see file header. Each platform
// config: a root selector to observe, and a classify(node) function that
// inspects an added DOM node and returns { type, text } or null (not a
// match). Kept deliberately simple and adjustable — the real value here
// is the module wiring/protocol, not selector cleverness; a wrong
// selector is a one-line fix once checked against a real, live page.
const PLATFORM_CONFIGS = {
  instagram: {
    name: 'Guardian — Instagram',
    matches: ['https://www.instagram.com/*', 'https://instagram.com/*'],
    rootSelector: 'body',
    classify: `(node) => {
      if (!(node instanceof HTMLElement)) return null;
      // DM thread messages: Instagram's inbox rows/messages carry
      // role="row" or a div[role="button"] inside a [role="grid"] thread
      // list in current builds; textContent of a newly-added message row
      // is the real signal, structure is secondary and the most likely
      // thing to have drifted since this was written.
      if (node.matches?.('[role="row"], [role="gridcell"]') && /messages|direct/i.test(location.pathname)) {
        const text = node.textContent?.trim();
        if (text) return { type: 'dm', text: text.slice(0, 500) };
      }
      // New post/story in feed: article elements are Instagram's real,
      // long-standing convention for a single feed post.
      if (node.tagName === 'ARTICLE') {
        const text = node.querySelector('span, [dir="auto"]')?.textContent?.trim();
        if (text) return { type: 'post', text: text.slice(0, 500) };
      }
      return null;
    }`,
  },
  threads: {
    name: 'Guardian — Threads',
    matches: ['https://www.threads.net/*', 'https://threads.net/*'],
    rootSelector: 'body',
    classify: `(node) => {
      if (!(node instanceof HTMLElement)) return null;
      // Threads shares Meta's design system with Instagram; a new post
      // in the timeline is realistically an article-like container with
      // a role="article" or a direct div[data-pressable-container] child
      // in current builds — same honest caveat as Instagram above.
      if (node.matches?.('[role="article"], article, [data-pressable-container]')) {
        const text = node.querySelector('span, [dir="auto"]')?.textContent?.trim();
        if (text) return { type: 'post', text: text.slice(0, 500) };
      }
      return null;
    }`,
  },
};

/**
 * buildModuleSource(config) — pure. Assembles the final injectable
 * userscript source: runtime + platform classify fn + a real MutationObserver
 * callback wiring them together, plus a killswitch entry point
 * (window.__cgGuardianModule_<Name>.stop()) that stopListenersOnPage
 * below calls into via a real driver.exec eval.
 */
function buildModuleSource(config, linkTarget) {
  const listenerIdExpr = `'gm-' + Math.random().toString(36).slice(2) + Date.now().toString(36)`;
  return `(function() {
${GUARDIAN_MODULE_RUNTIME}
  const classify = ${config.classify};
  const listenerId = ${listenerIdExpr};
  const mod = new GuardianModule(${JSON.stringify(config.name)}, listenerId, ${JSON.stringify(linkTarget)});
  mod.start(${JSON.stringify(config.rootSelector)}, (mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        const result = classify(node);
        if (result) mod.emit(result.type, { text: result.text });
      }
    }
  });
  window.__cgGuardianModule_${config.name.replace(/[^a-zA-Z0-9]/g, '_')} = mod;
})();`;
}

// Default routing: same default TX14's own listener-config-modal offers
// ("Nexus (via IR Layer) — default behaviour" — real, per
// guardian-picker.js's own lm-link-opt-label, read directly). A plugin
// author or a future toolbar-command could make this configurable per
// install; not built in this pass, kept as a real, named limitation
// rather than silently hardcoded with no comment.
const DEFAULT_LINK_TARGET = { type: 'ledger' };

function getInstagramUserscript(entry) {
  const cfg = PLATFORM_CONFIGS.instagram;
  return {
    name: cfg.name,
    source: buildModuleSource(cfg, entry?.linkTarget || DEFAULT_LINK_TARGET),
    matches: cfg.matches,
    persistent: true,
  };
}

function getThreadsUserscript(entry) {
  const cfg = PLATFORM_CONFIGS.threads;
  return {
    name: cfg.name,
    source: buildModuleSource(cfg, entry?.linkTarget || DEFAULT_LINK_TARGET),
    matches: cfg.matches,
    persistent: true,
  };
}

/**
 * stopListenersOnPage(data, ctx) — the real toolbar-command handler.
 * data: { agentId } (forwarded from the renderer's cg.plugins.invoke —
 * see browser.js's activateSpotlightCommand, fixed same date to pass the
 * current agentId instead of an empty payload). Uses the SAME real
 * driver.exec 'eval' mechanism UserscriptManager.inject() itself uses
 * (checked directly before writing this: manager.js's inject() calls
 * this.driver.exec({ action: 'eval', agentId, code: injectable }) — not
 * a new injection path). Stop-only, not a toggle: restarting would need
 * re-invoking start() with the original classify/config closure, which
 * doesn't survive stop() — a genuinely separate, real follow-up
 * (re-running UserscriptManager.inject() for this script id would work,
 * but needs the id, which isn't threaded through to this handler yet),
 * not silently pretended to work here.
 */
function stopListenersOnPage(data, ctx) {
  const agentId = data?.agentId || 'default';
  const code = `(function(){
    var n = 0;
    for (var k in window) {
      if (k.indexOf('__cgGuardianModule_') === 0 && window[k] && typeof window[k].stop === 'function') {
        window[k].stop();
        n++;
      }
    }
    return n;
  })();`;
  ctx.emit('driver.exec', { action: 'eval', agentId, code });
  return { type: 'plugin:guardian-listeners:stop-requested', data: { agentId } };
}

module.exports = { getInstagramUserscript, getThreadsUserscript, stopListenersOnPage, buildModuleSource, PLATFORM_CONFIGS };
