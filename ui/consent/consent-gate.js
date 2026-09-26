'use strict';
/**
 * ui/consent/consent-gate.js — sovereign module. Zero coupling to shell
 * beyond the API below (matches ui/home/DECOMP.md's module contract).
 *
 * API exposed on window.ConsentGate:
 *   ConsentGate.checkAndShow() -> Promise<boolean>  // true if already decided
 *   ConsentGate.on('decided', fn)                    // fn({granted})
 *
 * Backed by orchestrator's GET/POST /api/consent/rfr2 (lib/consent.js).
 * getConsent() returning null means "never asked" — this module is the
 * only thing in the UI allowed to ask.
 */
(function () {
  const API_BASE = ''; // same-origin as orchestrator; override via ConsentGate.configure() if served elsewhere

  const listeners = { decided: [] };
  function _fire(event, payload) { (listeners[event] || []).forEach((fn) => { try { fn(payload); } catch (_) {} }); }

  function _root() { return document.getElementById('consent-gate-root'); }

  async function _fetchConsent() {
    const res = await fetch(`${API_BASE}/api/consent/rfr2`);
    const body = await res.json();
    return body.consent; // null | {granted, firstAskedAt, decidedAt, ...}
  }

  async function _postConsent(granted) {
    const res = await fetch(`${API_BASE}/api/consent/rfr2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granted }),
    });
    return res.json();
  }

  function _show() {
    const root = _root();
    if (root) root.classList.remove('hidden');
  }

  function _hide() {
    const root = _root();
    if (root) root.classList.add('hidden');
  }

  function _wireButtons() {
    const grant = document.getElementById('consent-gate-grant');
    const deny  = document.getElementById('consent-gate-deny');
    if (grant) grant.addEventListener('click', async () => {
      await _postConsent(true);
      _hide();
      _fire('decided', { granted: true });
    });
    if (deny) deny.addEventListener('click', async () => {
      await _postConsent(false);
      _hide();
      _fire('decided', { granted: false });
    });
  }

  /**
   * checkAndShow() — call once on homepage boot. Resolves true if consent
   * was already recorded (no prompt shown), false if the prompt is now
   * showing and waiting on the user (listen for 'decided').
   */
  async function checkAndShow() {
    _wireButtons();
    let consent = null;
    try { consent = await _fetchConsent(); } catch (e) {
      console.warn('[consent-gate] could not reach /api/consent/rfr2 — defaulting to prompt', e.message);
    }
    if (consent && typeof consent.granted === 'boolean' && consent.decidedAt) {
      return true; // already asked, already answered — never re-prompt automatically
    }
    _show();
    return false;
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  window.ConsentGate = { checkAndShow, on };
})();
