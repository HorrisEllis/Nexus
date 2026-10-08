'use strict';
/**
 * tests/modules/test-resource-adaptive.test.js — §0.39.364: the resource monitor drives what runs.
 * James: "what is that performance? and can we start using it with the resource monitor to optimize performance
 * dynamically." From his console, 2026-10-06: two hours of ok ↔ pressure every 10 s at 19.7–20.0% free; "heap 80.4% of
 * allocated" the same; the ladder loading a 7b then a 16b with 1–7% free (both "ollama sent nothing for 45000 ms");
 * deepseek-coder-v2 → HTTP 404 with deepseek-coder-v2:16b-lite-instruct-q4_K_M installed.
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const RM = require(path.join(ROOT, 'lib', 'resource-monitor.js'));
const PR = require(path.join(ROOT, 'lib', 'pipeline-routing.js'));
const PF = require(path.join(ROOT, 'lib', 'phase-faults.js'));
const MI = require(path.join(ROOT, 'ollama', 'lib', 'model-inventory.js'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

console.log('\ntest-resource-adaptive\n');
const GB = 1073741824;
const smp = (free, { heapLimitPct = 0.02, total = 16 * GB } = {}) => ({ system: { freeMemPct: free, freeMem: free * total, totalMem: total, cpuPct: null },
  process: { heapTotal: 100 * 1048576, heapUsed: 90 * 1048576, heapUsedPct: 0.9, heapLimit: 4096 * 1048576, heapLimitPct } });

// ── hysteresis ──
check('RA-01 19.7% free from ok is pressure', RM.classify(smp(0.197)).level === 'pressure');
check('RA-02 21% free while in pressure stays pressure (out at 25%)', RM.classify(smp(0.21), undefined, 'pressure').level === 'pressure');
check('RA-03 26% free while in pressure is ok', RM.classify(smp(0.26), undefined, 'pressure').level === 'ok');
check('RA-04 21% free from ok is ok (the line in is still 20%)', RM.classify(smp(0.21), undefined, 'ok').level === 'ok');
check('RA-05 11% free after critical stays critical (out at 13%)', RM.classify(smp(0.11), undefined, 'critical').level === 'critical');
check('RA-06 14% free after critical is pressure', RM.classify(smp(0.14), undefined, 'critical').level === 'pressure');
// ── heap against its real limit ──
check('RA-07 heap 90% of heapTotal but 2% of its limit is not pressure', RM.classify(smp(0.5)).level === 'ok');
const hp = RM.classify(smp(0.5, { heapLimitPct: 0.85 }));
check('RA-08 heap 85% of its limit is pressure, and says "of its limit"', hp.level === 'pressure' && /of its limit/.test(hp.reasons.join(' ')));
check('RA-09 the sample carries heapLimit and heapLimitPct', (() => { const s = RM.sample(); return s.process.heapLimit > 0 && s.process.heapLimitPct > 0 && s.process.heapLimitPct < 1; })());

// ── confirmation: the flapping log, replayed through the real tick() ──
{
  const seq = [0.197, 0.201, 0.198, 0.205, 0.194, 0.21, 0.19, 0.18, 0.21, 0.22, 0.26, 0.27];   // James's wobble at the line; then really under; back to 21–22%; then really clear
  let i = 0; const logs = [];
  const m = new RM.ResourceMonitor({ name: 't', sampler: () => smp(seq[i++]) });
  const warn = console.warn; console.warn = (x) => logs.push(String(x));
  const levels = seq.map(() => m.tick().level);
  console.warn = warn;
  check('RA-10 the wobble at the line reports nothing; two samples under enter pressure; 21–22% stays; above 25% twice leaves', m.transitions === 2 && logs.length === 2 && levels.join(',') === 'ok,ok,ok,ok,ok,ok,ok,pressure,pressure,pressure,pressure,ok', `${levels.join(',')} | ${logs.join(' | ')}`);
  let j = 0; const crit = [0.5, 0.012];
  const m2 = new RM.ResourceMonitor({ name: 't3', sampler: () => smp(crit[j++]) });
  console.warn = () => {}; const err = console.error; console.error = () => {};
  const l2 = [m2.tick().level, m2.tick().level];
  console.warn = warn; console.error = err;
  check('RA-11 critical is reported on its first sample', l2.join(',') === 'ok,critical');
}
{
  const m = new RM.ResourceMonitor({ name: 't2' });
  const warn = console.warn; console.warn = () => {};
  m.tick(); console.warn = warn;
  check('RA-12 a monitor answers level() and backgroundAllowed()', ['ok', 'pressure', 'critical'].includes(m.level()) && typeof m.backgroundAllowed() === 'boolean');
}

// ── a model that will not fit is not tried ──
const held = [{ name: 'huihui_ai/qwen2.5-coder-abliterate:3b', size: 1.9e9 }];
const f7 = RM.fitsModel({ model: 'huihui_ai/qwen2.5-coder-abliterate:7b', bytes: 4.7e9, loaded: held, sample: smp(0.069) });
check('RA-13 7b with 6.9% free of 16GB does not fit, and says the numbers', !f7.fits && /needs ~5\.\dGB/.test(f7.why) && /Ollama can release/.test(f7.why), f7.why);
check('RA-14 the model already loaded fits', RM.fitsModel({ model: held[0].name, bytes: 1.9e9, loaded: held, sample: smp(0.02) }).fits);
check('RA-15 7b with 60% free fits', RM.fitsModel({ model: 'x:7b', bytes: 4.7e9, loaded: held, sample: smp(0.6) }).fits);
check('RA-16 an unknown size is tried, said so', (() => { const r = RM.fitsModel({ model: 'x', bytes: null, sample: smp(0.01) }); return r.fits && /unknown/.test(r.why); })());

// ── the climb skips, never retries, a no-memory rung ──
(async () => {
  const rungs = [{ provider: 'ollama:a:3b', base: 'ollama' }, { provider: 'ollama:b:7b', base: 'ollama' }, { provider: 'chatgpt', base: 'chatgpt' }];
  const seen = []; const outs = [];
  const r = await PR.climb({ rungs, policy: { ...PR.DEFAULTS, retriesPerRung: 2 },
    attempt: async (rg, i, t) => { seen.push(`${rg.provider}#${t}`); return rg.provider === 'ollama:b:7b' ? { state: 'skipped', trigger: 'no-memory' } : rg.provider === 'chatgpt' ? { state: 'replied' } : { state: 'failed' }; },
    onOutcome: async (o, x) => outs.push(x.next && x.next.how) });
  check('RA-17 a no-memory rung is tried once and the climb goes to the next rung', seen.join(',') === 'ollama:a:3b#1,ollama:a:3b#2,ollama:b:7b#1,chatgpt#1' && r.state === 'replied', seen.join(','));
  const r2 = await PR.climb({ rungs: [rungs[1]], policy: PR.DEFAULTS, attempt: async () => ({ state: 'skipped', trigger: 'no-memory' }) });
  check('RA-18 a ladder whose last rung will not fit ends exhausted', r2.exhausted === true);

  // ── the skip is a first-class fault ──
  check('RA-19 a memory skip is fault mode no-memory', PF.modeOf({ state: 'skipped', memorySkip: true }) === 'no-memory' && PF.modeOf({ state: 'skipped' }) === null);

  // ── model names resolve to the installed tag ──
  const names = ['deepseek-coder-v2:16b-lite-instruct-q4_K_M', 'huihui_ai/qwen2.5-coder-abliterate:3b', 'huihui_ai/qwen2.5-coder-abliterate:7b'];
  check('RA-20 deepseek-coder-v2 resolves to the one installed tag', MI.pick('deepseek-coder-v2', names) === names[0]);
  check('RA-21 a tag in another case resolves', MI.pick('deepseek-coder-v2:16b-lite-instruct-q4_k_m', names) === names[0]);
  check('RA-22 a name with two installed tags is left as asked (no guess)', MI.pick('huihui_ai/qwen2.5-coder-abliterate', names) === 'huihui_ai/qwen2.5-coder-abliterate');
  check('RA-23 an exact name is unchanged; an unknown one too', MI.pick(names[1], names) === names[1] && MI.pick('nope', names) === 'nope');

  // ── wired where it acts ──
  const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  check('RA-24 the phase build checks fitsModel before an Ollama rung and records the skip', /fitsModel\(\{ model: rg\.model, bytes: om\.sizes/.test(idx) && /state: 'skipped', memorySkip: true/.test(idx) && /trigger: 'no-memory'/.test(idx));
  const disp = fs.readFileSync(path.join(ROOT, 'ollama/lib/dispatch.js'), 'utf8');
  check('RA-25 the bridge resolves the model and defers background intents while foreground work runs', /MI\.resolve\(model\)/.test(disp) && /BACKGROUND_INTENTS\.has\(job\.intent\)/.test(disp));
  check('RA-26 the adversarial probe asks the monitor before it runs', /shared\('copilot'\)/.test(fs.readFileSync(path.join(ROOT, 'copilot/adversarial.js'), 'utf8')));
  const oc = fs.readFileSync(path.join(ROOT, 'ollama/lib/ollama-client.js'), 'utf8');
  check('RA-27 the first token gets RAW_FIRST_TOKEN_MS (load + prompt), later tokens the idle timeout', /config\.RAW_FIRST_TOKEN_MS/.test(oc) && /first = false;/.test(oc) && require(path.join(ROOT, 'ollama/config.js')).RAW_FIRST_TOKEN_MS >= 45000);
  check('RA-28 /api/models reports sizes and what is loaded', /sizes, loaded: inv\.loaded/.test(fs.readFileSync(path.join(ROOT, 'ollama/routes/models.js'), 'utf8')));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
})();
