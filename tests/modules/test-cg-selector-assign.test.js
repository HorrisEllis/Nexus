'use strict';
/**
 * tests/modules/test-cg-selector-assign.test.js — v0.39.251
 * The element picker assigns selectors (handoff 2026-09-25, step 1).
 *
 *   - clear-glass/src/providers/selector-assign.js: provider-from-URL through
 *     Clear Glass's own provider registry; refusals before anything is sent.
 *   - End to end against guardian's REAL selector map: guardian/lib/selector-map.js
 *     + guardian/lib/agent-registry.js (temp dir — never data/) behind a local
 *     HTTP server that routes exactly as guardian/server.js's
 *     /api/agents/:id/selectors does; the tab push is captured. The picker's
 *     assignment must come out verified, sourced 'picker', with its evidence in
 *     the history, and pushed as GUARDIAN_SELECTORS.
 *   - guardian-picker.js: exactly one added line against git HEAD, no line
 *     removed or changed — its look is James's rule ("do not change any css,
 *     style, themes, any thing about how it looks").
 *   - the area follows the one-JS-one-CSS rule, every rule scoped.
 *   - renderer/selector-check.js in a real page (tests/probe/selector-check-chromium.js),
 *     and the area's whole UI flow (tests/probe/selector-assign-ui-chromium.js), both driven
 *     by Clear Glass's own engine (0.39.262 — was python playwright). Without the engine
 *     (electron not installed) it is reported SKIPPED, never passed.
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { execFileSync, spawnSync } = require('child_process');
require('../../lib/test-sandbox.js').ensure();   // 0.39.255 — the sandbox rule (test-test-sandbox); this suite spawns only the page probes and git
const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0, skipped = 0;
async function test(id, d, fn) {
  try { const r = await fn(); if (r === 'SKIP') { console.log(`  -  ${id} ${d} (SKIPPED)`); skipped++; return; } console.log(`  \u2713 ${id} ${d}`); passed++; }
  catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; }
}

const SA = require(path.join(ROOT, 'clear-glass/src/providers/selector-assign.js'));
const selectorMap = require(path.join(ROOT, 'guardian/lib/selector-map.js'));
const { createAgentRegistry } = require(path.join(ROOT, 'guardian/lib/agent-registry.js'));

function guardianLike() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-selassign-'));
  const registry = createAgentRegistry({ dir });
  const pushes = [];
  const ncp = { push: (provider, msg) => { pushes.push({ provider, msg }); return 2; }, pushTab: () => true };
  const server = http.createServer((req, res) => {
    // Same routing as guardian/server.js §SELECTOR-MAP 0.39.249.
    const m = req.url.match(/^\/api\/agents\/([a-z0-9-]+)\/selectors$/);
    if (!m || req.method !== 'POST') { res.writeHead(404); res.end('{}'); return; }
    let buf = ''; req.on('data', c => buf += c); req.on('end', () => {
      let body; try { body = JSON.parse(buf); } catch (e) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: e.message })); return; }
      const r = selectorMap.assign(registry, ncp, m[1], body.selectors, { source: body.source, evidence: body.evidence });
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r));
    });
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port, registry, pushes, dir })));
}

const EVIDENCE = { url: 'https://chatgpt.com/c/abc', matched: 2, text: 'Latest answer', textLength: 13, depth: 2, tag: 'div' };

(async () => {
  console.log('\ntest-cg-selector-assign — element picker → guardian selector map (0.39.251)\n');

  await test('SA-01', 'provider from URL comes from Clear Glass\u2019s own provider registry', () => {
    assert.strictEqual(SA.providerForUrl('https://chatgpt.com/c/WEB:123').id, 'chatgpt');
    assert.strictEqual(SA.providerForUrl('https://chat.openai.com/').id, 'chatgpt');
    assert.strictEqual(SA.providerForUrl('https://claude.ai/chat/x').id, 'claude');
    assert.strictEqual(SA.providerForUrl('https://example.com/'), null);
    assert.strictEqual(SA.providerForUrl('not a url'), null);
  });

  await test('SA-02', 'nothing leaves Clear Glass without evidence of the live check, or with evidence from another provider\u2019s page', async () => {
    const cases = [
      [{ provider: 'chatgpt', key: 'resp', selector: '.x' }, /evidence/],
      [{ provider: 'chatgpt', key: 'resp', selector: '.x', evidence: { ...EVIDENCE, matched: 0 } }, /matched/],
      [{ provider: 'chatgpt', key: 'resp', selector: '.x', evidence: { ...EVIDENCE, url: 'https://claude.ai/chat/1' } }, /Claude/],
      [{ provider: 'chatgpt', key: 'resp', selector: '.x', evidence: { ...EVIDENCE, url: 'https://example.com' } }, /not a known provider/],
      [{ provider: 'chatgpt', key: 'reply', selector: '.x', evidence: EVIDENCE }, /key/],
    ];
    for (const [p, re] of cases) {
      const r = await SA.assign(p, { port: 1 });   // port 1: proves validation refuses before any request
      assert.strictEqual(r.ok, false); assert.ok(re.test(r.error), `${r.error} !~ ${re}`);
    }
  });

  const g = await guardianLike();
  await test('SA-03', 'end to end: guardian\u2019s real selector map records it verified, sourced picker, evidence kept, pushed to the tabs', async () => {
    const r = await SA.assign({ provider: 'chatgpt', key: 'resp', selector: 'div.markdown.prose.w-full', evidence: EVIDENCE }, { port: g.port });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.guardian.changed, true);
    assert.strictEqual(r.guardian.map.selectors.resp, 'div.markdown.prose.w-full');
    assert.strictEqual(r.guardian.map.verified.resp, true);
    assert.strictEqual(r.guardian.map.source.resp, 'picker');
    const h = g.registry.get('chatgpt').selectorHistory.slice(-1)[0];
    assert.strictEqual(h.source, 'picker');
    assert.strictEqual(h.evidence.url, EVIDENCE.url);
    assert.strictEqual(h.evidence.key, 'resp');
    assert.strictEqual(h.evidence.checkedBy, 'clear-glass/renderer/selector-check.js');
    const push = g.pushes.slice(-1)[0];
    assert.strictEqual(push.msg.type, 'GUARDIAN_SELECTORS');
    assert.strictEqual(push.msg.verified.resp, true);
    assert.strictEqual(r.guardian.pushedToTabs, 2);
  });

  await test('SA-04', 'the same assignment again is recorded as unchanged, not a new change', async () => {
    const before = g.registry.get('chatgpt').selectorHistory.length;
    const r = await SA.assign({ provider: 'chatgpt', key: 'resp', selector: 'div.markdown.prose.w-full', evidence: EVIDENCE }, { port: g.port });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.guardian.changed, false);
    assert.strictEqual(g.registry.get('chatgpt').selectorHistory.length, before);
  });

  await test('SA-05', 'guardian unreachable is a failure, said so — never success', async () => {
    const r = await SA.assign({ provider: 'chatgpt', key: 'send', selector: '[data-testid="send-button"]', evidence: EVIDENCE }, { port: 1, timeoutMs: 1500 });
    assert.strictEqual(r.ok, false); assert.ok(/guardian unreachable/.test(r.error), r.error);
  });
  g.server.close(); fs.rmSync(g.dir, { recursive: true, force: true });

  // Baseline pinned to 0.39.250 (43c3f62), the last picker before 0.39.251's one line — NOT git HEAD, which contains
  // the line once 0.39.251 is committed (this test compared against HEAD in 0.39.251 and could only pass uncommitted).
  // A later change to guardian-picker.js must move this baseline on purpose.
  await test('SA-06', 'guardian-picker.js: exactly one line added to the 0.39.250 picker, nothing removed or changed (its look is untouched)', () => {
    let head;
    try { head = execFileSync('git', ['show', '43c3f62:clear-glass/renderer/guardian-picker.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }); }
    catch (_) { return 'SKIP'; }
    const now = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/guardian-picker.js'), 'utf8');
    const a = head.split('\n'), b = now.split('\n');
    if (a.join('\n') === b.join('\n')) throw new Error('the pick report line is missing');
    assert.strictEqual(b.length, a.length + 1, 'exactly one line added');
    const at = b.findIndex((l, i) => l !== a[i]);
    assert.ok(/guardian\.picker\.picked/.test(b[at]) && !/style|css|class/i.test(b[at].replace(/no visual change/, '')), b[at]);
    assert.deepStrictEqual(b.slice(0, at).concat(b.slice(at + 1)), a, 'every other line identical');
  });

  await test('SA-07', 'the area is one JS + one CSS, loaded before browser.js, every rule scoped to #cg-selector-assign', () => {
    const dir = path.join(ROOT, 'clear-glass/renderer/selector-assign');
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['selector-assign.css', 'selector-assign.js']);
    const css = fs.readFileSync(path.join(dir, 'selector-assign.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const sels = [...css.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim());
    assert.ok(sels.length > 5);
    for (const s of sels) for (const part of s.split(',')) assert.ok(part.trim().startsWith('#cg-selector-assign'), `unscoped: ${part.trim()}`);
    const html = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.html'), 'utf8');
    const iArea = html.indexOf('<script src="selector-assign/selector-assign.js"></script>'), iMain = html.indexOf('<script src="browser.js"></script>');
    assert.ok(iArea > 0 && iArea < iMain, 'area script before browser.js');
    assert.ok(html.includes('<link rel="stylesheet" href="selector-assign/selector-assign.css">'));
    const js = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.js'), 'utf8');
    assert.ok(/CGSelectorAssign\?\.mount\(/.test(js) && /guardian\.picker\.picked/.test(js) && /CGSelectorAssign\?\.offer\(\{ xpath: pick\.xpath/.test(js));
  });

  await test('SA-08', 'Clear Glass exposes the route to the renderer and puts both outcomes on the bus', () => {
    const pre = fs.readFileSync(path.join(ROOT, 'clear-glass/src/preload/index.js'), 'utf8');
    assert.ok(/selectors: \{[\s\S]*?'selectors:provider-for-url'[\s\S]*?'selectors:assign'/.test(pre));
    const br = fs.readFileSync(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'), 'utf8');
    assert.ok(/ipcMain\.handle\('selectors:assign'/.test(br) && /'selectors\.assigned' : 'selectors\.assign\.failed'/.test(br));
  });

  await test('SA-09', 'renderer/selector-check.js passes every case in real Chromium on a saved ChatGPT-like page', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tests/probe/selector-check-chromium.js')], { encoding: 'utf8', timeout: 120000 });
    if (r.error || r.status === 3) return 'SKIP';
    const lines = (r.stdout || '').trim().split('\n').map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
    const bad = lines.filter(l => l.case && !l.pass).map(l => `${l.case}: ${l.why || JSON.stringify(l)}`);
    assert.strictEqual(r.status, 0, bad.join(' | ') || r.stderr.slice(-400));
    assert.ok(lines.filter(l => l.case).length >= 10);
  });

  await test('SA-10', 'the area\u2019s whole flow in real Chromium: offer → live check shown → Assign → guardian\u2019s own answer; refusals shown, never assignable', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tests/probe/selector-assign-ui-chromium.js')], { encoding: 'utf8', timeout: 180000 });
    if (r.error || r.status === 3) return 'SKIP';
    const lines = (r.stdout || '').trim().split('\n').map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
    const bad = lines.filter(l => l.case && !l.pass).map(l => `${l.case}: ${JSON.stringify(l)}`);
    assert.strictEqual(r.status, 0, bad.join(' | ') || r.stderr.slice(-400));
    assert.ok(lines.filter(l => l.case).length >= 9);
  });

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
  process.exit(failed ? 1 : 0);
})();
