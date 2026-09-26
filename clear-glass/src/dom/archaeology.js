'use strict';

/**
 * DOM Archaeology
 * Maps the live DOM into a NEXUS-readable addressable tree.
 * Every node is queryable, mutable, watchable from inside NEXUS.
 * MutationObserver pipeline streams all changes to SSE.
 * Picked elements are registered as named hooks.
 */

const { webContents, BrowserWindow, ipcMain } = require('electron');
const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.

// §MCO10 2026-09-13 — James: "stream the DOM to the compartment ledger per
// contract using the compartment uuid." Same real cross-process HTTP
// pattern already proven by clear-glass/src/mesh/agent-mesh.js's
// _raidDecide() — 127.0.0.1:NEXUS_PORT, short timeout, resolves rather
// than throws on any failure, so an unreachable cortex degrades this to
// exactly "the DOM stream keeps working locally, nothing gets ledgered"
// — never a blocked or crashed DOM stream.
//
// activeCompartmentUuid below is deliberately simple, in-memory, per-
// process state — NOT wired to any real RAID dispatch yet, because
// ClearGlass is not yet a real RAID contract destination (that's a
// separate, unbuilt piece of work). setActiveCompartment() is the real,
// explicit hook for whenever that wiring exists; until then a DOM event
// with no active compartment is reported honestly (see _bindIpc below)
// rather than tagged with a fabricated uuid.
let activeCompartmentUuid = null;
let activeQueueId         = null;

function _reportCompartmentDomEvent(data) {
  if (!activeCompartmentUuid) return; // §1.2 — nothing to ledger, not fabricated
  const http = require('http');
  const body = JSON.stringify({
    type: 'compartment.dom.event',
    payload: {
      compartmentUuid: activeCompartmentUuid,
      queueId:         activeQueueId,
      type:            data.type || 'dom.event',
      agentId:         data.agentId || null,
      dom:             data,
      ts:              data.ts || Date.now(),
    },
  });
  const req = http.request({
    hostname: '127.0.0.1', port: parseInt(process.env.NEXUS_PORT || '3748', 10),
    path: '/api/event', method: 'POST', timeout: 1200,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => { res.on('data', () => {}); });
  req.on('error',   () => {}); // honest-degrade, matching _raidDecide's own contract
  req.on('timeout', () => req.destroy());
  req.write(body);
  req.end();
}

// §ARTIFACTS-LISTENER 2026-09-16 — James: "logs dom mutator in realtime to
// a ledger for each agent and chat url." The stream above was already
// real-time (this.sse.emit in _bindIpc below) but never durable — nothing
// wrote it anywhere that outlives an SSE listener being connected at that
// exact moment, unlike download-capture.js's real provenance (providerId +
// chatUrl) for actual file downloads. This is the same real ledger every
// other real ClearGlass event already goes through — src/main/index.js's
// own _postEvent()/_registerWithNexus() POST :9000/api/ledger, kept local
// here rather than imported for the same reason _reportCompartmentDomEvent
// above is local: honest-degrade, fire-and-forget, never blocks the IPC
// handler that owns it, matching that function's own stated precedent
// (clear-glass/src/mesh/agent-mesh.js's _raidDecide()).
function _ledgerWrite(system, type, payload) {
  const http = require('http');
  const body = JSON.stringify({ system, type, payload });
  const req = http.request({
    hostname: '127.0.0.1', port: parseInt(process.env.ORCHESTRATOR_PORT || '9000', 10),
    path: '/api/ledger', method: 'POST', timeout: 2000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => { res.on('data', () => {}); });
  req.on('error',   () => {});
  req.on('timeout', () => req.destroy());
  req.write(body);
  req.end();
}


// Injected into every page — the DOM mesh observer
const DOM_OBSERVER_SCRIPT = `
(function() {
  if (window.__cgDomMesh) return; // already injected

  const mesh  = new Map();   // nodeId → metadata
  let   nodeCounter = 0;

  function nodeId(el) {
    if (!el.__cgId) {
      el.__cgId = 'cg-' + (++nodeCounter);
      mesh.set(el.__cgId, buildMeta(el));
    }
    return el.__cgId;
  }

  // §BUILT 2026-09-21 — James: "answering on screen questions." Found
  // while building it: buildMeta had no associated-<label> text for a
  // field, only its own attributes — enough for autofill (which matches
  // on autocomplete/name/placeholder tokens) but not enough to know what
  // an OPEN-ENDED question ("Why do you want to work here?") actually
  // asks, since that text usually lives in a separate <label> element,
  // not an attribute of the field itself. Real, standard label
  // association, in the order a browser itself would resolve it: an
  // explicit <label for="id">, a wrapping <label>, then aria-labelledby.
  // Never guesses from unrelated nearby text — an honest null is better
  // than a wrong question.
  function _labelFor(el) {
    if (el.id) {
      // No template literal here on purpose — this function's own source
      // lives inside DOM_OBSERVER_SCRIPT, itself one big template literal
      // (see its opening backtick above); a nested, unescaped backtick
      // would close that outer string early and break every real caller
      // of this whole page script, not just this function.
      const sel = 'label[for="' + (CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]';
      const explicit = document.querySelector(sel);
      if (explicit && explicit.innerText) return explicit.innerText.trim().slice(0, 300);
    }
    const wrapping = el.closest && el.closest('label');
    if (wrapping && wrapping.innerText) return wrapping.innerText.trim().slice(0, 300);
    const labelledBy = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.innerText).filter(Boolean);
      if (parts.length) return parts.join(' ').trim().slice(0, 300);
    }
    return null;
  }

  function buildMeta(el) {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : {};
    const isField = ['input', 'textarea', 'select'].includes(el.tagName?.toLowerCase());
    return {
      id:       el.__cgId || null,
      tag:      el.tagName?.toLowerCase() || '#text',
      nodeType: el.nodeType,
      id_attr:  el.id || null,
      classes:  el.className && typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean) : [],
      text:     el.innerText?.slice(0, 200) || el.textContent?.slice(0, 200) || null,
      attrs:    buildAttrs(el),
      rect:     { top: r.top, left: r.left, width: r.width, height: r.height },
      visible:  r.width > 0 && r.height > 0,
      children: el.childElementCount || 0,
      href:     el.href || null,
      value:    el.value !== undefined ? el.value : null,
      name:     el.name || null,
      type:     el.type || null,
      label:    isField ? _labelFor(el) : null,
    };
  }

  function buildAttrs(el) {
    if (!el.attributes) return {};
    const a = {};
    for (const attr of el.attributes) a[attr.name] = attr.value;
    return a;
  }

  function serialize(el, depth = 0, maxDepth = 4) {
    if (!el || el.nodeType !== 1) return null;
    const meta = buildMeta(el);
    meta.id = nodeId(el);
    if (depth < maxDepth) {
      meta.children = [];
      for (const child of el.children) {
        const s = serialize(child, depth + 1, maxDepth);
        if (s) meta.children.push(s);
      }
    } else {
      meta.children = el.childElementCount;
    }
    return meta;
  }

  // ── MutationObserver ────────────────────────────────────────────────
  const observer = new MutationObserver((mutations) => {
    const changes = [];
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) changes.push({ type: 'added', node: serialize(n, 0, 2) });
        });
        m.removedNodes.forEach(n => {
          if (n.nodeType === 1) changes.push({ type: 'removed', nodeId: n.__cgId, tag: n.tagName?.toLowerCase() });
        });
      } else if (m.type === 'attributes') {
        changes.push({
          type: 'attribute',
          nodeId: nodeId(m.target),
          attr: m.attributeName,
          value: m.target.getAttribute(m.attributeName),
        });
      } else if (m.type === 'characterData') {
        changes.push({ type: 'text', nodeId: nodeId(m.target.parentElement), text: m.target.textContent?.slice(0, 200) });
      }
    }
    if (changes.length && window.__cgEmitDom) {
      window.__cgEmitDom({ type: 'dom.mutations', changes, ts: Date.now() });
    }
  });

  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });

  // ── Public API ──────────────────────────────────────────────────────
  window.__cgDomMesh = {
    query(selector) {
      const els = document.querySelectorAll(selector);
      return [...els].map(el => ({ ...buildMeta(el), id: nodeId(el) }));
    },

    queryOne(selector) {
      const el = document.querySelector(selector);
      return el ? { ...buildMeta(el), id: nodeId(el) } : null;
    },

    getTree(maxDepth = 4) {
      return serialize(document.documentElement, 0, maxDepth);
    },

    getById(cgId) {
      const el = document.querySelector('[__cgId="' + cgId + '"]') ||
                 [...document.querySelectorAll('*')].find(e => e.__cgId === cgId);
      return el ? { ...buildMeta(el), id: nodeId(el) } : null;
    },

    // §BUILT 2026-09-21 — James: "right click, answer question context
    // option." A right-click's own coordinates (already real and window-
    // relative as of the §FIX above in renderer/browser.js) tell us WHERE
    // on the page, not WHICH element — Electron's webview context-menu
    // params carry no live element reference across the process boundary.
    // elementAt closes that gap the same way the browser's own click
    // handling would: document.elementFromPoint at the real coordinates,
    // then the same nodeId() every other real caller here already uses —
    // not a second id-assignment scheme.
    elementAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el ? { ...buildMeta(el), id: nodeId(el) } : null;
    },

    mutate(cgId, mutation) {
      const el = [...document.querySelectorAll('*')].find(e => e.__cgId === cgId);
      if (!el) return { error: 'Element not found' };

      if (mutation.text    !== undefined) el.innerText    = mutation.text;
      if (mutation.html    !== undefined) el.innerHTML    = mutation.html;
      if (mutation.value   !== undefined) {
        // §FIXED 2026-09-19 — James: "autofill... follow axioms." Found
        // while building real form-fill: el.value = mutation.value
        // silently did nothing observable on a React/Vue-controlled
        // input (they override the native value property's setter with
        // their own internal tracking; assigning through the instance
        // property bypasses it entirely — real, well-known, and a real
        // correctness bug here, not an autofill-specific workaround).
        // It also never dispatched input/change, so even a plain
        // vanilla-JS onChange listener never fired. The real fix: call
        // the NATIVE prototype's value setter directly (bypassing
        // whatever the framework overrode it with, the same technique
        // real browser-automation tools use for exactly this reason),
        // then dispatch real, bubbling input and change events so
        // anything listening — React, Vue, or plain JS — actually
        // observes the change. Fixes every real caller of dom_mutate's
        // value mutation, not just autofill.
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                    : el.tagName === 'SELECT'   ? window.HTMLSelectElement.prototype
                    : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) nativeSetter.call(el, mutation.value); else el.value = mutation.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (mutation.style   !== undefined) Object.assign(el.style, mutation.style);
      if (mutation.attrs) {
        for (const [k, v] of Object.entries(mutation.attrs)) {
          if (v === null) el.removeAttribute(k);
          else el.setAttribute(k, v);
        }
      }
      if (mutation.remove) el.remove();
      return { ok: true, nodeId: cgId };
    },

    highlight(selector, color = '#00f5ff') {
      document.querySelectorAll('[data-cg-highlight]').forEach(e => {
        e.style.outline = '';
        delete e.dataset.cgHighlight;
      });
      document.querySelectorAll(selector).forEach(e => {
        e.style.outline = '2px solid ' + color;
        e.dataset.cgHighlight = '1';
      });
    },

    destroy() {
      observer.disconnect();
      window.__cgDomMesh = null;
    },
  };

  // Emit full tree on load
  if (document.readyState === 'complete') {
    if (window.__cgEmitDom) window.__cgEmitDom({ type: 'dom.ready', ts: Date.now() });
  } else {
    window.addEventListener('load', () => {
      if (window.__cgEmitDom) window.__cgEmitDom({ type: 'dom.ready', ts: Date.now() });
    });
  }
})();
`;

class DomArchaeology {
  constructor({ sse }) {
    this.sse   = sse;
    this.picks = new Map(); // name → pick metadata
    this._bindIpc();
  }

  // ── Inject observer into webcontents ─────────────────────────────────
  async inject(wc, agentId) {
    try {
      // Inject DOM mesh observer
      await wc.executeJavaScript(DOM_OBSERVER_SCRIPT, true);

      // Bridge DOM events to SSE via ipc. window.__cgAgentId set here —
      // same convention src/userscripts/manager.js's _buildInjectable()
      // already established for the same real need (a page-side script
      // knowing which agent it's running in) — reused, not reinvented,
      // so every dom:event carries real provenance for the ledger write
      // in _bindIpc below, the same way download-capture.js's providerId
      // does for actual file downloads.
      await wc.executeJavaScript(`
        window.__cgAgentId = ${JSON.stringify(agentId || null)};
        window.__cgEmitDom = (data) => {
          if (window.__cgIpc) window.__cgIpc.send('dom:event', { ...data, agentId: window.__cgAgentId });
        };
        window.__cgSendPick = (data) => {
          if (window.__cgIpc) window.__cgIpc.send('dom:pick-result', data);
        };
      `, true);

      this.sse.emit('dom.injected', { agentId, url: wc.getURL(), ts: Date.now() });
    } catch (err) {
      console.warn('[DOM] Injection error:', err.message);
    }
  }

  // ── IPC handlers from renderer ────────────────────────────────────────
  _bindIpc() {
    ipcMain.on('dom:event', (event, data) => {
      this.sse.emit(data.type || 'dom.event', { ...data, ts: data.ts || Date.now() });
      _reportCompartmentDomEvent(data); // §MCO10 — additive, never blocks the existing SSE path above

      // §ARTIFACTS-LISTENER — chatUrl read fresh from the actual sender at
      // the moment this event arrived, not captured once at inject() time
      // — matches download-capture.js's own reasoning: webContents can
      // navigate to a new chat while the page that produced this event is
      // still the one that matters. Real, durable, per-agent-per-chatUrl
      // record of every real mutation — no sampling, no invented shape.
      let chatUrl = null;
      try { chatUrl = event.sender && typeof event.sender.getURL === 'function' ? event.sender.getURL() : null; } catch (_) {}
      _ledgerWrite('clear-glass', `dom.${data.type || 'event'}`, {
        agentId: data.agentId || null,
        chatUrl,
        dom: data,
      });
    });

    // §MCO10 2026-09-13 — real, explicit hook for associating the live DOM
    // stream with a real RAID compartment/contract, once something (future
    // work — ClearGlass is not yet a RAID dispatch destination) actually
    // calls it. Until then activeCompartmentUuid stays null and DOM events
    // are never ledgered — an honest gap, not a fabricated association.
    ipcMain.handle('compartment:set-active', (event, { compartmentUuid, queueId } = {}) => {
      activeCompartmentUuid = compartmentUuid || null;
      activeQueueId         = queueId || null;
      return { ok: true, compartmentUuid: activeCompartmentUuid, queueId: activeQueueId };
    });

    ipcMain.on('dom:pick-result', (event, data) => {
      const pick = {
        ...data,
        pickId: uuidv4(),
        registeredAt: Date.now(),
      };
      this.sse.emit('dom.picked', pick);
    });
  }

  // ── Query ─────────────────────────────────────────────────────────────
  async handleQuery({ agentId = 'default', selector, cgId, tree = false, x, y }) {
    const wc = this._getWebContents(agentId);
    if (!wc) return { error: 'No webcontents' };

    if (tree) {
      return wc.executeJavaScript('window.__cgDomMesh?.getTree(5)', true);
    }
    if (cgId) {
      return wc.executeJavaScript(`window.__cgDomMesh?.getById(${JSON.stringify(cgId)})`, true);
    }
    if (selector) {
      return wc.executeJavaScript(`window.__cgDomMesh?.query(${JSON.stringify(selector)})`, true);
    }
    // §BUILT 2026-09-21 — the real caller for screen-qa's right-click
    // path: which element is AT this window-relative point, not which
    // elements match a selector.
    if (typeof x === 'number' && typeof y === 'number') {
      return wc.executeJavaScript(`window.__cgDomMesh?.elementAt(${JSON.stringify(x)}, ${JSON.stringify(y)})`, true);
    }
    return { error: 'selector, cgId, x/y, or tree required' };
  }

  // ── Mutate ────────────────────────────────────────────────────────────
  async handleMutate({ agentId = 'default', cgId, selector, mutation }) {
    const wc = this._getWebContents(agentId);
    if (!wc) return { error: 'No webcontents' };

    if (!cgId && selector) {
      // Resolve selector → cgId
      const el = await wc.executeJavaScript(`window.__cgDomMesh?.queryOne(${JSON.stringify(selector)})`, true);
      if (!el) return { error: `Element not found: ${selector}` };
      cgId = el.id;
    }

    const result = await wc.executeJavaScript(
      `window.__cgDomMesh?.mutate(${JSON.stringify(cgId)}, ${JSON.stringify(mutation)})`, true
    );

    this.sse.emit('dom.mutated', { agentId, cgId, mutation, result, ts: Date.now() });
    return result;
  }

  // ── Element pick registration ─────────────────────────────────────────
  async handlePick({ agentId, nodeId, meta, name }) {
    const pick = {
      pickId:    uuidv4(),
      agentId,
      nodeId,
      name:      name || `pick-${this.picks.size + 1}`,   // 0.39.251 — was Object.keys(Map) → always 0, every unnamed pick overwrote 'pick-1'
      meta,
      pickedAt:  Date.now(),
    };
    this.picks.set(pick.name, pick);
    this.sse.emit('dom.pick.registered', pick);
    return pick;
  }

  // ── Highlight ─────────────────────────────────────────────────────────
  async highlight(agentId, selector, color) {
    const wc = this._getWebContents(agentId);
    if (!wc) return;
    await wc.executeJavaScript(
      `window.__cgDomMesh?.highlight(${JSON.stringify(selector)}, ${JSON.stringify(color)})`, true
    ).catch(() => {});
  }

  // ── Token Archaeology ─────────────────────────────────────────────────
  async scanTokens(agentId) {
    const wc = this._getWebContents(agentId);
    if (!wc) return { error: 'No webcontents' };

    const result = await wc.executeJavaScript(`
      (function() {
        const patterns = {
          apiCalls:     [],
          prompts:      [],
          responses:    [],
          tokenCounts:  [],
          modelRefs:    [],
        };

        // Scan script tags for API patterns
        document.querySelectorAll('script').forEach(s => {
          const t = s.textContent;
          if (t.includes('max_tokens') || t.includes('temperature') || t.includes('messages')) {
            patterns.apiCalls.push({ src: 'script', snippet: t.slice(0, 200) });
          }
        });

        // Scan text content for token count patterns
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          const t = node.textContent;
          if (/\\d+\\s*(tokens?|tok)/i.test(t)) {
            patterns.tokenCounts.push({ text: t.trim().slice(0, 100) });
          }
          if (/gpt-[34]|claude-[23]|gemini|llama|mistral/i.test(t)) {
            patterns.modelRefs.push({ text: t.trim().slice(0, 100) });
          }
        }

        // Scan network requests (captured via performance API)
        const entries = performance.getEntriesByType('resource');
        entries.forEach(e => {
          if (e.name.includes('completions') || e.name.includes('messages') ||
              e.name.includes('generate') || e.name.includes('v1/chat')) {
            patterns.apiCalls.push({ url: e.name, duration: Math.round(e.duration) });
          }
        });

        return patterns;
      })()
    `, true);

    this.sse.emit('dom.tokens.scanned', { agentId, result, ts: Date.now() });
    return result;
  }

  _getWebContents(agentId) {
    // 2026-09-19: agent ids (mesh-*, ncp-*: the pages that receive whole code bases) resolve through the ONE shared
    // page-resolver and are NEVER allowed to fall back to the focused window (that typed into whatever page was
    // focused). Non-agent ids keep the legacy fallback: the interactive browser tabs may rely on it.
    try { return this._pageResolver().resolve(agentId); }
    catch (e) { if (/^(mesh|ncp)-/.test(String(agentId))) return null; }
    const all = webContents.getAllWebContents();
    for (const wc of all) {
      try {
        const win = BrowserWindow.fromWebContents(wc);
        if (win && win.getTitle().includes(agentId)) return wc;
      } catch {}
    }
    return webContents.getFocusedWebContents() || all[0] || null;
  }
  _pageResolver() { return this.__resolver || (this.__resolver = require('../driver/page-resolver').createPageResolver({ electron: require('electron') })); }

  listPicks() { return [...this.picks.values()]; }
}

// §MCO19 2026-09-13 — real, direct (same-process) way for another file in
// this same ClearGlass main process (bridge.js, for a new HTTP route) to
// set the same real activeCompartmentUuid/activeQueueId this file's own
// ipcMain.handle('compartment:set-active', ...) already sets — same
// module-level state, two real entry points (one for the renderer via
// IPC, one for an external HTTP caller like RAID via a new bridge.js
// route), not two competing copies of the state.
function setActiveCompartment(compartmentUuid, queueId) {
  activeCompartmentUuid = compartmentUuid || null;
  activeQueueId         = queueId || null;
  return { ok: true, compartmentUuid: activeCompartmentUuid, queueId: activeQueueId };
}

module.exports = DomArchaeology;
module.exports.setActiveCompartment = setActiveCompartment;
