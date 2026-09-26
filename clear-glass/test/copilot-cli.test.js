'use strict';
// clear-glass/test/copilot-cli.test.js — renderer/copilot-cli.js (route bar,
// slash commands, history, proposals) in jsdom, and src/copilot/hat.js against
// the real lib/hat-forge on an isolated JAA directory.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
let pass = 0;
const t = async (n, fn) => { await fn(); pass++; console.log(`[PASS] ${n}`); };

(async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="copilot-model"></div><div id="copilot-route"></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(__dirname, '../renderer/copilot-cli.js'), 'utf8'));
  const out = [], calls = [];
  const site = {};
  let ctx = { dom: true, picks: false, cookies: false };
  const cg = {
    api: { get: async () => ({ copilotBackend: 'ollama', copilotAgent: 'gemini', copilotWearHat: true, copilotAutoRunCommands: false }) },
    copilot: {
      hat: async () => ({ ok: true, exists: false, name: 'clear_glass', personaPrompt: 'P' }),
      hatEnsure: async () => ({ ok: true, exists: true, created: true, name: 'clear_glass' }),
      hatUpdate: async (p) => { calls.push(['hatUpdate', p]); return { ok: true }; },
      exec: async (c) => { calls.push(['exec', c]); return { ok: true }; },
    },
    siteSettings: { getAll: async () => ({ ...site }), get: async (u, k) => site[k], set: async (u, k, v) => { site[k] = v; }, deleteKey: async (u, k) => { delete site[k]; } },
    macros: { list: async () => ({ macros: [{ name: 'apply', steps: 2, params: ['name'] }] }), run: async (n, o) => { calls.push(['macro', n, o]); return { ok: true, results: [1, 2] }; } },
    cookies: { count: async () => ({ ok: true, count: 4 }) },
    window: { openSettings: () => calls.push(['settings']) },
  };
  const wv = { getURL: () => 'https://x.io/a', canGoBack: () => false, reload: () => calls.push(['reload']) };
  const cli = w.CGCopilotCLI.create({ cg, agentId: 'a1', wv, print: (r, s) => out.push([r, s]),
    getCtx: () => ctx, setCtx: (k, v) => { ctx = { ...ctx, [k]: v }; }, clearMessages: () => out.push(['cleared']),
    normalizeUrl: (u) => u ? 'https://' + u : '', navigate: (u) => calls.push(['nav', u]) });
  await new Promise(r => setTimeout(r, 20));
  const last = () => out[out.length - 1][1];

  await t('settings seed the route; the toggle bar reflects it', () => {
    assert.deepStrictEqual({ ...cli.route() }, { backend: 'ollama', agent: undefined, hat: true });
    assert.ok(w.document.querySelector('.cr-toggle.on').textContent === 'ollama');
    assert.strictEqual(w.document.querySelector('.cr-agent').style.display, 'none');
  });
  await t('/agent switches to guardian with that agent; clicking the toggle is the same path', async () => {
    await cli.handle('/agent claude');
    assert.deepStrictEqual({ ...cli.route() }, { backend: 'guardian', agent: 'claude', hat: true });
    [...w.document.querySelectorAll('.cr-toggle')].find(b => b.textContent === 'copilot').click();
    assert.strictEqual(cli.route().backend, 'copilot');
    await cli.handle('/backend nope'); assert.match(last(), /must be one of/);
  });
  await t('/hat off removes the hat for this window only; chip reflects it', async () => {
    await cli.handle('/hat off');
    assert.strictEqual(cli.route().hat, false);
    assert.ok(!w.document.querySelector('.cr-hat').classList.contains('on'));
    await cli.handle('/hat'); assert.match(last(), /built-in/);
    await cli.handle('/hat on');
  });
  await t('/forge and /persona go through the hat forge IPC', async () => {
    await cli.handle('/forge'); assert.match(last(), /forged clear_glass/);
    await cli.handle('/persona be terse');
    assert.deepStrictEqual({ ...calls.find(c => c[0] === 'hatUpdate')[1] }, { personaPrompt: 'be terse' });
  });
  await t('plain text is not consumed; /build passes through', async () => {
    assert.strictEqual(await cli.handle('hello there'), false);
    assert.deepStrictEqual({ ...(await cli.handle('/build a thing')) }, { passthrough: '/build a thing' });
  });
  await t('/site reads, sets (JSON-typed), deletes this site\'s settings', async () => {
    await cli.handle('/site zoomFactor 1.25'); assert.strictEqual(site.zoomFactor, 1.25);
    await cli.handle('/site'); assert.match(last(), /zoomFactor = 1.25/);
    await cli.handle('/site zoomFactor --delete'); assert.ok(!('zoomFactor' in site));
  });
  await t('/macro run passes key=value params', async () => {
    await cli.handle('/macro run apply name=Jo');
    const m = calls.find(c => c[0] === 'macro');
    assert.strictEqual(m[1], 'apply'); assert.strictEqual(m[2].params.name, 'Jo');
  });
  await t('proposed commands run only on /run', async () => {
    cli.propose([{ action: 'click', selector: '#go' }, { action: 'navigate', url: 'u' }]);
    assert.ok(!calls.some(c => c[0] === 'exec'));
    await cli.handle('/run 2'); assert.strictEqual(calls.filter(c => c[0] === 'exec').length, 1);
    await cli.handle('/run all'); assert.strictEqual(calls.filter(c => c[0] === 'exec').length, 3);
  });
  await t('/ctx toggles, ↑ recalls history, Tab completes', async () => {
    await cli.handle('/ctx picks on'); assert.strictEqual(ctx.picks, true);
    const input = w.document.createElement('textarea'); input.value = '';
    cli.onKey(new w.KeyboardEvent('keydown', { key: 'ArrowUp' }), input);
    assert.strictEqual(input.value, '/ctx picks on');
    input.value = '/mac'; cli.onKey(new w.KeyboardEvent('keydown', { key: 'Tab' }), input);
    assert.strictEqual(input.value, '/macro ');
  });

  // ── hat.js against the real hat forge, isolated JAA ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hat-'));
  process.env.JAA_DATA_DIR = tmp;
  const hat = require('../src/copilot/hat');
  await t('hat: built-in persona until forged, then a real forged hat found by seedKey', () => {
    const s0 = hat.status();
    assert.strictEqual(s0.exists, false); assert.ok(s0.personaPrompt.length > 40);
    const r = hat.ensure();
    assert.strictEqual(r.created, true, JSON.stringify(r)); assert.strictEqual(r.name, 'clear_glass');
    assert.strictEqual(hat.ensure().created, false, 'idempotent');
    const u = hat.update({ personaPrompt: 'Operate Clear Glass tersely.' });
    assert.strictEqual(u.personaPrompt, 'Operate Clear Glass tersely.');
    assert.match(hat.personaFor(true), /## Hat: clear_glass\nOperate Clear Glass tersely\./);
    assert.strictEqual(hat.personaFor(false), '');
  });
  try { require('../../cortex/memory/jaa-db.js').jaaDB.flush?.(); } catch (_) {}
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
  process.exit(0);
})().catch(e => { console.error('[FAIL]', e); process.exit(1); });
