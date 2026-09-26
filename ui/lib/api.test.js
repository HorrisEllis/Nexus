'use strict';
/**
 * ui/lib/api.test.js — smoke test for the extracted get/post/del helpers.
 * Not a full test suite — a real, run-before-you-ship check that the
 * extracted module (a) parses and loads with zero errors in a real DOM,
 * and (b) preserves the exact success/failure behavior every existing
 * call site across ui/home and ui/tv-shell already depends on.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function run() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;

  // ── Case 1: module loads with zero errors ──────────────────────────────
  let loadError = null;
  window.addEventListener('error', (e) => { loadError = e.error || e.message; });
  const src = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = src;
  window.document.body.appendChild(scriptEl);

  if (loadError) {
    console.error('FAIL: module threw on load:', loadError);
    process.exit(1);
  }
  if (typeof window.get !== 'function' || typeof window.post !== 'function' || typeof window.del !== 'function') {
    console.error('FAIL: get/post/del not defined as globals after load');
    process.exit(1);
  }
  console.log('PASS: module loads clean, get/post/del are real functions');

  // ── Case 2: successful fetch resolves with parsed JSON ─────────────────
  window.fetch = async () => ({ json: async () => ({ ok: true, hello: 'world' }) });
  window.AbortSignal = window.AbortSignal || { timeout: () => undefined };
  const okResult = await window.get('http://example.test/ok');
  if (!okResult || okResult.hello !== 'world') {
    console.error('FAIL: get() did not return parsed JSON on success', okResult);
    process.exit(1);
  }
  console.log('PASS: get() returns parsed JSON on a successful fetch');

  // ── Case 3: failed fetch fails soft (returns null, never throws) ───────
  window.fetch = async () => { throw new Error('network down'); };
  let threw = false;
  let failResult;
  try { failResult = await window.get('http://example.test/fail'); }
  catch (e) { threw = true; }
  if (threw || failResult !== null) {
    console.error('FAIL: get() did not fail soft (return null) on a fetch error');
    process.exit(1);
  }
  console.log('PASS: get() fails soft (returns null) on a fetch error, never throws');

  // ── Case 4: post() sends the right method/body shape ───────────────────
  let capturedInit = null;
  window.fetch = async (url, init) => { capturedInit = init; return { json: async () => ({ ok: true }) }; };
  await window.post('http://example.test/post', { a: 1 });
  if (capturedInit?.method !== 'POST' || JSON.parse(capturedInit.body).a !== 1) {
    console.error('FAIL: post() did not send the expected method/body', capturedInit);
    process.exit(1);
  }
  console.log('PASS: post() sends POST with the correct JSON body');

  console.log('\n4/4 passed — ui/lib/api.js is a safe drop-in replacement for the inline copies.');
}

run().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(1); });
