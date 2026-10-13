'use strict';
/**
 * tests/modules/test-lean-quiet.test.js — 0.60.26 — what lean mode holds is stopped on purpose, so nothing retries
 * against it or loads a model beside the build.
 *
 * James (2026-10-13): "next. fix anything you can." His 0.60.23 log, lean on: the gap-relay warned "diagnostic
 * disconnected … retrying in 30000ms" all session, cortex warned "relay to intelligence:3753 failing", and the copilot
 * probe loaded qwen2.5-coder:7b every ten minutes.
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-lq-'));
process.env.NEXUS_DATA_ROOT = tmp;
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const quiet = (fn) => async (...a) => { const l = console.log, w = console.warn, out = []; console.log = console.warn = (...x) => out.push(x.join(' ')); try { await fn(...a); } finally { console.log = l; console.warn = w; } return out; };

(async () => {
  console.log('\ntest-lean-quiet\n');
  const LM = require(path.join(ROOT, 'lib/lean-mode.js'));
  const { GapRelay } = require(path.join(ROOT, 'lib/gap-relay.js'));
  try {
    // LQ-01 — a held source is never connected to; said once; released → it connects
    let hits = 0;
    const srv = http.createServer((q, r) => { hits++; r.writeHead(200, { 'Content-Type': 'text/event-stream' }); r.write(': ok\n\n'); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    GapRelay.HELD_CHECK_MS = 40;
    let held = true;
    const relay = new GapRelay({ bus: { emit() {} }, sources: [{ name: 'diagnostic', host: '127.0.0.1', port, path: '/events' }], isHeld: () => held });
    const out = await quiet(async () => { relay.start(); await new Promise(r => setTimeout(r, 200)); })();
    check('LQ-01 a source lean mode holds is not connected to, and it is said once (not a warning every retry)',
      hits === 0 && out.filter(l => /held by lean mode/.test(l)).length === 1 && !out.some(l => /disconnected/.test(l)), JSON.stringify({ hits, out }));
    held = false;
    const out2 = await quiet(async () => { await new Promise(r => setTimeout(r, 200)); })();
    check('LQ-02 lean turned off → the relay connects on its own and says so', hits === 1 && out2.some(l => /released from lean mode/.test(l)), JSON.stringify({ hits, out2 }));
    relay.stop(); srv.close();

    // LQ-03 — a source really down warns at most once a minute, not every backoff step
    const r3 = new GapRelay({ bus: { emit() {} }, sources: [{ name: 'gone', host: '127.0.0.1', port: 1, path: '/events' }] });
    const out3 = await quiet(async () => { r3.start(); await new Promise(r => setTimeout(r, 3500)); })();
    r3.stop();
    check('LQ-03 a source that is really down still warns (§1.2), but once a minute, not on every retry', out3.filter(l => /gone disconnected/.test(l)).length === 1, JSON.stringify(out3));

    // LQ-04 — the copilot probe is held while lean is on
    LM.write(true, { by: 'test' });
    const adv = require(path.join(ROOT, 'copilot/adversarial.js'));
    let res; const out4 = await quiet(async () => { res = await adv.run([]); })();
    check('LQ-04 the copilot adversarial probe does not run while lean mode is on (no model loaded beside the build)', res && res.skipped && (res.reason === 'lean mode' || /^memory/.test(res.reason)), JSON.stringify({ res, out4 }));

    // LQ-05 — wiring: orchestrator passes isHeld from lean mode; cortex skips the intelligence relay while held
    const ORC = fs.readFileSync(path.join(ROOT, 'orchestrator/orchestrator.js'), 'utf8');
    const CX = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
    check('LQ-05 the orchestrator gap-relay reads lean mode, and cortex does not relay to a held intelligence',
      /isHeld: \(name\) => \{ const l = require\('\.\.\/lib\/lean-mode\.js'\)\.read\(\)/.test(ORC) && /if \(_intelligenceHeld\(\)\) return;/.test(CX) && /hold\.includes\('intelligence'\)/.test(CX));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
