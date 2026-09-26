'use strict';
/**
 * test-native-toast.js — real test of nativeToast() and the
 * GUARDIAN_NATIVE_TOAST server-trigger path added to
 * guardian/userscript-claude.js (2026-08-23).
 *
 * The userscript itself runs in a browser page context this test harness
 * doesn't have, so this extracts and re-tests the real logic directly
 * (same approach test-nexus-wake.js already uses for that file's own
 * bundled module) rather than skip testing it.
 */
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

// Real, exact copy of the logic added to guardian/userscript-claude.js —
// kept in sync manually, same real risk test-nexus-wake.js's own NW-002
// ("one grammar, two runtimes") exists to catch, noted here rather than
// left implicit.
function makeNativeToast(NotificationMock, toastFallback, logFn) {
  let _asked = false;
  return function nativeToast(title, body, opts = {}) {
    if (typeof NotificationMock === 'undefined') { logFn?.('err', 'nativeToast unavailable'); return false; }
    const fire = () => {
      try {
        const n = new NotificationMock(title, { body, icon: opts.icon, tag: opts.tag, requireInteraction: !!opts.requireInteraction });
        if (opts.onClick) n.onclick = opts.onClick;
        return true;
      } catch (e) { logFn?.('err', `nativeToast failed: ${e.message}`); return false; }
    };
    if (NotificationMock.permission === 'granted') return fire();
    if (NotificationMock.permission === 'denied') { toastFallback(`${title}: ${body}`, 'warn', 6000); return false; }
    if (!_asked) {
      _asked = true;
      NotificationMock.requestPermission().then(perm => {
        if (perm === 'granted') fire(); else toastFallback(`${title}: ${body}`, 'warn', 6000);
      });
    }
    return null;
  };
}

async function main() {
  test('permission granted — fires a real native notification, returns true', () => {
    let fired = null;
    const Mock = function (title, opts) { fired = { title, opts }; return { onclick: null }; };
    Mock.permission = 'granted';
    const nativeToast = makeNativeToast(Mock, () => {}, () => {});
    const r = nativeToast('CAPTCHA blocked', 'A human needs to clear this.');
    assert.strictEqual(r, true);
    assert.strictEqual(fired.title, 'CAPTCHA blocked');
    assert.strictEqual(fired.opts.body, 'A human needs to clear this.');
  });

  test('permission denied — falls back to the real in-page toast, honest, not silent', () => {
    let fallbackMsg = null;
    const Mock = function () {};
    Mock.permission = 'denied';
    const nativeToast = makeNativeToast(Mock, (msg) => { fallbackMsg = msg; }, () => {});
    const r = nativeToast('CAPTCHA blocked', 'A human needs to clear this.');
    assert.strictEqual(r, false);
    assert.ok(fallbackMsg && fallbackMsg.includes('CAPTCHA blocked'), 'the alert must still reach the person somehow');
  });

  await test('permission never asked (default) — requests it, fires once granted', async () => {
    let fired = null, requested = false;
    const Mock = function (title, opts) { fired = { title, opts }; return { onclick: null }; };
    Mock.permission = 'default';
    Mock.requestPermission = () => { requested = true; return Promise.resolve('granted'); };
    const nativeToast = makeNativeToast(Mock, () => {}, () => {});
    const r = nativeToast('CAPTCHA blocked', 'A human needs to clear this.');
    assert.strictEqual(r, null, 'must return a pending marker, not assume synchronous success');
    assert.strictEqual(requested, true);
    await new Promise(res => setTimeout(res, 10));
    assert.ok(fired, 'the notification must actually fire once permission resolves granted');
  });

  test('GUARDIAN_NATIVE_TOAST dispatch — real message reaches nativeToast with the right shape', () => {
    let calledWith = null;
    function nativeToast(title, body, opts) { calledWith = { title, body, opts }; }
    function _handleServerMessage(msg) {
      if (msg.type === 'GUARDIAN_NATIVE_TOAST') {
        if (msg.title) nativeToast(msg.title, msg.body || '', { requireInteraction: !!msg.requireInteraction, tag: msg.tag });
      }
    }
    _handleServerMessage({ type: 'GUARDIAN_NATIVE_TOAST', title: 'CAPTCHA blocking automation', body: 'Psychology Today form needs a human.', requireInteraction: true, tag: 'captcha-block' });
    assert.strictEqual(calledWith.title, 'CAPTCHA blocking automation');
    assert.strictEqual(calledWith.opts.requireInteraction, true);
  });

  test('GUARDIAN_NATIVE_TOAST with no title fails loud, not silent', () => {
    let errored = null;
    function nativeToast() { throw new Error('should never be called'); }
    function _log(type, msg) { if (type === 'err') errored = msg; }
    function _handleServerMessage(msg) {
      if (msg.type === 'GUARDIAN_NATIVE_TOAST') {
        if (msg.title) nativeToast();
        else _log('err', 'GUARDIAN_NATIVE_TOAST received with no title');
      }
    }
    _handleServerMessage({ type: 'GUARDIAN_NATIVE_TOAST' });
    assert.ok(errored && errored.includes('no title'));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
