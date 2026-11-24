'use strict';
/**
 * cos/build/emerge-build.js — a phase built in Emerge by the local models, run by COS, outside Idearium (DB5's first slice).
 * Map: docs/2026-11-20-pipeline-components-to-pillar-phasemap.spec DB5 (the build moves to COS); docs/2026-10-17-pieces-not-order-phasemap.spec EMB3.
 *
 * James, 2026-11-21: "okay. get it to code from end to end. we need that proof that its working." · on taking Idearium out of the path for the
 * proof (it froze mid-build at 08:01 and 13:05, its thread waiting with no CPU and no child): "okay. do it."
 *
 * Nothing here is new behaviour: each step is Nexus's own module, called the way Idearium's _phaseBuild calls it.
 *   plan       lib/phase-plan.js derivePlan        the phase's own words give the file and its signatures; no model
 *   test       lib/test-first.js fromExamples      the phase's examples become its test; no model
 *   code       idearium/lib/emerge-rung.cjs         skeleton, one gap per function, the ladder smallest first (Ollama's job route)
 *   expect     lib/expectation-tests.js run         the rung's check: the module's exports, as planned
 *   proof      the examples test, run against what the rung built, in a scratch folder (nothing written into Nexus unless --land)
 * Every step is a row in cos/data/build/<run>.jsonl (persistence: the run resumes from its rows and the gap files, never from memory).
 *
 *   node cos/build/emerge-build.js --map docs/….spec --phase EMB3_the_autocorrect [--ladder m1,m2,m3] [--land] [--repo nexus-id-repo-50f0890c]
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const MAP = arg('map'), PHASE = arg('phase'), REPO = arg('repo', 'nexus-id-repo-50f0890c'), LAND = !!arg('land');
const LADDER = String(arg('ladder', 'huihui_ai/qwen2.5-coder-abliterate:3b,deepseek-coder-v2:16b,huihui_ai/qwen3-coder-abliterated:30b')).split(',').map((s) => s.trim()).filter(Boolean);
// James, 2026-11-23: "each step builds upon the last". --pieces <file.json>: the phase's small pieces, each [{ name, sig, ret, does, body }], already written and passed: no model is asked again
const PIECES = arg('pieces') ? JSON.parse(fs.readFileSync(arg('pieces'), 'utf8')) : null, pieceBody = (gap) => { const p = (PIECES || []).find((x) => x.name === gap); if (!p) throw new Error('no piece ' + gap); return p.body; };
const OLLAMA = Number(arg('ollama-port', 3749)), TASKS = arg('tasks', path.join(ROOT, 'idearium', 'data', 'tasks'));
if (!MAP || !PHASE) { console.error('usage: --map <docs/….spec> --phase <PHASE_ID> [--ladder a,b,c] [--land]'); process.exit(2); }

const RUN = `cbuild-${Date.now().toString(36)}`, LOG = path.join(ROOT, 'cos', 'data', 'build', RUN + '.jsonl');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
const row = (state, o = {}) => { const r = { run: RUN, map: MAP, phase: PHASE, state, ...o, ts: Date.now() }; fs.appendFileSync(LOG, JSON.stringify(r) + '\n'); console.log(`[${new Date().toLocaleTimeString()}] ${state}${o.note ? ' — ' + o.note : ''}`); };

// the Ollama system's job route (its door records every call on the tape): post, then poll until it answers
const call = (method, p, body, ms = 30000) => new Promise((res, rej) => { const b = body ? JSON.stringify(body) : null;
  const q = http.request({ host: '127.0.0.1', port: OLLAMA, path: p, method, timeout: ms, headers: b ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } : {} }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (_) { res(null); } }); });
  q.on('timeout', () => { q.destroy(); rej(new Error('the Ollama system did not answer in ' + ms + ' ms')); }); q.on('error', rej); if (b) q.write(b); q.end(); });
async function ask(prompt, model, gap) {
  row('gap-asked', { gap, model, promptChars: prompt.length });
  const q = await call('POST', '/api/jobs', { prompt, model, intent: 'build', meta: { source: 'cos.emerge-build', gap, phase: PHASE, run: RUN }, options: { temperature: 0.1 } });
  const id = q && (q.jobId || (q.data && q.data.jobId)); if (!id) throw new Error('the Ollama system did not take the job: ' + JSON.stringify(q).slice(0, 200));
  for (const until = Date.now() + 15 * 60000; Date.now() < until;) {
    await new Promise((r) => setTimeout(r, 3000));
    const g = await call('GET', '/api/jobs/' + encodeURIComponent(id), null, 10000).catch(() => null), j = g && (g.job || (g.data && g.data.job)); if (!j) continue;
    if (j.status === 'complete') { row('gap-answered', { gap, model, ms: j.durationMs || null, chars: String(j.result || '').length }); return String(j.result || ''); }
    if (j.status === 'failed' || j.status === 'cancelled') throw new Error('the Ollama job ' + j.status + ': ' + (j.error || ''));
  }
  throw new Error('the Ollama job did not finish in 15 minutes');
}

// EMB6, the end state first. James, 2026-11-23: "Every step can be broken down using end state first and a dag." · asked who writes it: "The 3b, I approve"
// --end-state: the 3b writes the phase's examples from its own words; each answer is saved before it is checked; the checks are test-first's own
// (examplesFrom, fromExamples, contradictions) plus "a planned function" and "it parses". Checked lines wait for his yes in the Lab; nothing enters the map here.
const END_STATE = !!arg('end-state'), ES_DIR = path.join(ROOT, 'cos', 'data', 'build', 'end-state');
async function endState({ ph, plan, src, mapText }) {
  const TF = require(path.join(ROOT, 'lib', 'test-first.js')), vm = require('vm'), file = path.join(ES_DIR, PHASE + '.json');
  fs.mkdirSync(ES_DIR, { recursive: true });
  const rec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { map: MAP, phase: PHASE, file: src.path, examples: [], answers: [] };
  const save = () => fs.writeFileSync(file, JSON.stringify(rec, null, 1));
  if (rec.examples.length >= 3) { row('end-state-kept', { note: `${rec.examples.length} examples already on disk; no model asked`, file }); return 0; }
  // a plan read from a file that exists names its exports only: each function's parameters are read from that same file (no model)
  const code = (() => { try { return fs.readFileSync(path.join(ROOT, src.path), 'utf8'); } catch (_) { return ''; } })();
  const sigOf = (e) => { if (/\(/.test(e.signature || '')) return e.signature; const n = String(e.name || '').replace(/[^\w$]/g, '');
    const m = n && new RegExp(`(?:function\\s*\\*?\\s*${n}|\\b${n}\\s*[:=]\\s*(?:async\\s+)?(?:function\\s*)?|^\\s*(?:async\\s+)?${n})\\s*\\(([^)]*)\\)`, 'm').exec(code); return m ? `${n}(${m[1].replace(/\s+/g, ' ').trim()})` : null; };
  const fns = (src.exports || []).filter((e) => !/^_/.test(e.name || '')).map((e) => ({ ...e, signature: sigOf(e) })).filter((e) => e.signature), names = new Set(fns.map((e) => e.name)), already = TF.examplesFrom(mapText, PHASE);
  if (!fns.length) { row('refused', { note: 'the plan gives no function signatures to write examples for' }); return 1; }
  const quote = (l) => `      - '${l.replace(/'/g, "''")}'`;
  for (let n = rec.answers.length + 1; n <= 3 && rec.examples.length < 3; n++) {
    const refusedLast = (rec.answers[rec.answers.length - 1] || {}).refused || [];
    const prompt = [`Phase ${PHASE}, file ${src.path}.`, `What it must do: ${String(ph.does || '').trim()}`, `How it is proven: ${String(ph.proof || '').trim()}`,
      'Its functions:', ...fns.map((e) => '  ' + e.signature + (e.does ? ' — ' + e.does : '')), '',
      'Write 3 to 6 examples of what these functions return, one per line, exactly in this form and nothing else:', '  name(args) == expected',
      'Arguments and expected values are plain literals: numbers, true/false/null, strings in double quotes, arrays, objects. No variables, no functions, no comments, no code fence.',
      'Only call the functions listed. Never write the same call twice.',
      ...(refusedLast.length ? ['', 'Your last lines were refused; do not repeat them:', ...refusedLast.map((x) => `  ${x.line}  (${x.why})`)] : [])].join('\n');
    let said; try { said = await ask(prompt, LADDER[0], 'end-state:' + PHASE); } catch (e) { row('end-state-failed', { note: e.message }); return 1; }
    const a = { n, at: new Date().toISOString(), model: LADDER[0], promptChars: prompt.length, said: String(said || ''), kept: [], refused: [] }; rec.answers.push(a); save();   // saved before it is checked
    const lines = a.said.split(/\r?\n/).map((l) => l.trim().replace(/^[-*\d.)\s]+(?=\w)/, '').replace(/^[`'"]+|[`'"]+$/g, '').trim()).filter((l) => /\)\s*==/.test(l));
    for (const line of lines) {
      const why = (() => {
        if (!TF.examplesFrom(`  ${PHASE}:\n    examples:\n${quote(line)}\n`, PHASE).length) return 'not in the form name(args) == expected';
        const nm = (/^(\w+)\s*\(/.exec(line) || [])[1]; if (!names.has(nm)) return `${nm || 'it'} is not one of the planned functions`;
        const k = line.search(/\)\s*==/); try { new vm.Script(`(${line.slice(0, k + 1)}, ${line.slice(k + 1).replace(/^\s*==\s*/, '')})`); } catch (e) { return 'does not parse: ' + e.message; }
        if ([...rec.examples, ...already].some((x) => x === line)) return 'already kept';
        const t = TF.fromExamples({ plan, testPath: 'x.test.js', examples: [...rec.examples.map((x) => x.line), line] }); const c = TF.contradictions(t || '');
        return c.length ? 'contradicts a kept line: ' + c[0] : null; })();
      if (why) a.refused.push({ line, why }); else { a.kept.push(line); rec.examples.push({ line, by: LADDER[0], answer: n, status: 'waiting' }); }
    }
    save(); row('end-state', { note: `answer ${n}: ${a.kept.length} kept, ${a.refused.length} refused; ${rec.examples.length} waiting for his yes`, kept: a.kept, refused: a.refused, file });
  }
  return rec.examples.length >= 3 ? 0 : 1;
}

(async () => {
  row('started', { note: `ladder ${LADDER.join(' → ')}${LAND ? '; lands when the examples pass' : ''}`, ladder: LADDER });
  // 1. the phase, from its map
  const mapText = fs.readFileSync(path.join(ROOT, MAP), 'utf8'), doc = require('js-yaml').load(mapText), ph = doc && doc.phases && doc.phases[PHASE];
  if (!ph) { row('refused', { note: `no phase ${PHASE} in ${MAP}` }); process.exit(1); }
  const files = [].concat(ph.files || []), body = require('js-yaml').dump({ [PHASE]: ph });
  // 2. the plan: deterministic, from the phase's own words (Idearium's planner does the same first)
  const PP = require(path.join(ROOT, 'lib', 'phase-plan.js')), codeOf = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return null; } };
  const dv = PP.derivePlan({ phaseKey: PHASE, body, does: String(ph.does || ''), proof: String(ph.proof || ''), files, registry: [], system: 'idearium', codeOf });
  const plan = dv && (dv.plan || dv);
  const src = plan && (plan.files || []).find((f) => f.path && !/\.test\.[cm]?js$/.test(f.path) && /\.[cm]?js$/.test(f.path));
  if (!src) { row('refused', { note: 'the phase’s words gave no file with signatures: ' + JSON.stringify(dv).slice(0, 300) }); process.exit(1); }
  row('planned', { note: `${src.path}: ${(src.exports || []).map((e) => e.signature || e.name).join('; ')} (no model)`, file: src.path, exports: src.exports });
  if (END_STATE) process.exit(await endState({ ph, plan, src, mapText }));
  // 3. the test, from the phase's examples (no model)
  const TF = require(path.join(ROOT, 'lib', 'test-first.js')), testPath = TF.pathFor(plan, PHASE), moduleType = TF.moduleTypeFor(ROOT, src.path);
  const examples = TF.examplesFrom(mapText, PHASE), tf = TF.fromExamples({ plan, testPath, examples, moduleType }), testText = tf && (tf.content || tf.text || tf.test || (typeof tf === 'string' ? tf : null));
  if (!testText) { row('refused', { note: 'no test from the examples: ' + JSON.stringify(tf).slice(0, 300) }); process.exit(1); }
  row('test-written', { note: `${testPath} from ${examples.length} examples (no model)`, testPath, examples: examples.length });
  // 4. the code: the Emerge rung, its ladder smallest first, each call through the Ollama system
  const ER = require(path.join(ROOT, 'idearium', 'lib', 'emerge-rung.cjs')), EXT = require(path.join(ROOT, 'lib', 'expectation-tests.js'));
  const contract = `${REPO}/${MAP.split('/').pop().replace(/\.spec$/, '').replace(/[^A-Za-z0-9._-]/g, '_')}.${PHASE}`;
  const rung = ER.createRung({ root: ROOT, maxTries: 3, tasksDir: TASKS, model: LADDER[0], method: null,
    ladder: LADDER.map((m) => ({ name: PIECES ? 'the passed pieces' : m, ask: (message, { gap } = {}) => (PIECES ? Promise.resolve(pieceBody(gap)) : ask(message, m, gap)) })), ask: (message, { gap } = {}) => (PIECES ? Promise.resolve(pieceBody(gap)) : ask(message, LADDER[0], gap)),
    expect: async ({ files: fs2 }) => { if (!EXT.forFile(plan, src.path)) return { ok: true, why: 'no expectation test for this file' }; const r = await EXT.run({ root: ROOT, plan, path: src.path, overlays: fs2 }); return r.ok ? { ok: true, why: `its expectation passed (${r.checks || 0} checks)` } : { ok: false, why: EXT.feedback(r, src.path) }; } });
  // 5. heal, then build again (his, 2026-11-21: "It needs to be fixing it. Nexus is an autonomous system ... Have it fix gaps when it enounters
  // them, then run the pipeline again"). A held gap is diagnosed by the strongest model on the ladder from its own refused tries, and the
  // diagnosis is kept in the gap's file as its first lesson: a mechanical repair (data, OS_D5 (c): applies on its own), never code. Bounded.
  const ROUNDS = Math.max(1, Number(arg('rounds', 3)) || 3), store = ER.gapStore(ER.taskDirOf(TASKS, contract, src.path), src.path, { contract });
  const topName = ((src.exports || [])[0] || {}).name || 'autocorrect';
  async function heal(name, why, evidence, built) {
    const rec = store && store.read(name); if (!rec) { row('heal-skipped', { note: `no gap file for ${name}` }); return false; }
    // a module that compiled but failed the examples: what it was and what it returned go in as a refused try, so the next is told not to repeat it
    if (built) rec.attempts = (rec.attempts || []).concat({ n: 'test', at: new Date().toISOString(), model: 'the examples test', body: String(built).slice(0, 2500), said: 'compiled, but the examples test failed:\n' + String(evidence || '').slice(0, 900), fix: '', ok: false });
    const refused = (rec.attempts || []).filter((a) => !a.ok && a.n !== 'diagnosis').slice(-4);
    const prompt = [ER.CARD, '', `This Emerge function keeps failing: ${rec.signature || name}${rec.does ? ' — ' + rec.does : ''}.`, why ? `Where it stopped: ${why}` : '',
      built ? 'The module that compiled (all of it):\n' + String(built).slice(0, 2500) : '',
      evidence ? 'What the test said (actual against expected):\n' + String(evidence).slice(0, 1500) : '', '', 'Its last refused tries, each with what refused it:',
      ...refused.map((a, i) => `--- try ${i + 1} (${a.model || '?'}): ${a.said}\n${String(a.body || '').slice(0, 700)}`), '',
      'In five lines or fewer: why does every try fail, and what exactly must the next try do instead (which Emerge builtins or which functions of this module to use)? Plain words, no code fence.'].filter((x) => x !== '').join('\n');
    let d; try { d = await ask(prompt, LADDER[LADDER.length - 1], 'diagnose:' + name); } catch (e) { row('heal-failed', { note: `${name}: the diagnosis was not answered (${e.message})` }); return false; }
    d = String(d || '').trim().slice(0, 1200); if (!d) { row('heal-failed', { note: `${name}: an empty diagnosis` }); return false; }
    rec.attempts = (rec.attempts || []).concat({ n: 'diagnosis', at: new Date().toISOString(), model: LADDER[LADDER.length - 1], body: '(a diagnosis, not a body)', said: `diagnosed after ${refused.length} refused tries`, fix: d, ok: false });
    rec.diagnosis = { at: new Date().toISOString(), by: LADDER[LADDER.length - 1], text: d, run: RUN }; rec.status = 'open'; store.write(name, rec);
    row('repaired', { kind: 'mechanical', gap: name, note: `${name}: a diagnosis kept as its first lesson — ${d.replace(/\s+/g, ' ').slice(0, 220)}` });
    return true;
  }
  let res = null, t = null, out = '', T = null;
  for (let round = 1; round <= ROUNDS; round++) {
    row('round', { note: `round ${round} of ${ROUNDS}`, round });
    try { res = await rung.build({ file: src.path, exports: PIECES ? PIECES.map((p) => ({ name: p.name, signature: `${p.name}(${p.sig}) -> ${p.ret}`, does: p.does })) : (src.exports || []), expectation: testText, context: String(ph.does || ''), contract }); } catch (e) { res = { ok: false, why: e.message, tries: [] }; }
    row(res.ok ? 'emerge-passed' : 'emerge-held', { note: res.why, tries: (res.tries || []).length, gapFiles: res.gapFiles || [], round });
    // the lab view (his "i need to see pipeline"): each piece's outcome kept in this build's own rows, so COS shows it without reading Idearium's files
    try { const pre = require(path.join(ROOT, 'lib', 'node-export.js')).fileIdOf(src.path + '#'), ps = [];
      for (const fn of (store && fs.existsSync(store.dir) ? fs.readdirSync(store.dir) : []).filter((x) => x.startsWith(pre) && x.endsWith('.gap'))) { const nm = fn.slice(pre.length, -4), r = store.read(nm); if (!r) continue; const a = Array.isArray(r.attempts) ? r.attempts : [];
        ps.push({ name: nm, status: r.status || 'open', tries: a.length, models: [...new Set(a.map((x) => String(x.model || '').replace(/.*\//, '')).filter(Boolean))], last: String((a[a.length - 1] || {}).said || '').slice(0, 140), body: r.status === 'passed' ? String(r.body || '').slice(0, 1200) : null }); }
      row('pieces', { note: `${ps.filter((x) => x.status === 'passed').length} of ${ps.length} pieces passed`, pieces: ps, round }); } catch (e) { row('pieces', { note: 'the pieces were not read: ' + e.message, round }); }
    if (!res.ok) { const m = /gap (\w+) did not fill/.exec(String(res.why || '')); if (round < ROUNDS && await heal(m ? m[1] : topName, res.why)) continue; process.exit(1); }
    // 6. the proof: the examples test, run against what the rung built, in a scratch copy (nothing in Nexus changes unless --land)
    T = fs.mkdtempSync(path.join(os.tmpdir(), 'cbuild-')); const put = (rel, c) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
    for (const pj of ['package.json', path.join(src.path.split('/')[0], 'package.json')]) { const c = codeOf(pj); if (c) put(pj, c); }
    for (const [rel, c] of Object.entries(res.files || {})) put(rel, c); put(testPath, testText);
    t = spawnSync(process.execPath, [path.join(T, testPath)], { cwd: T, encoding: 'utf8', timeout: 120000 });
    out = ((t.stdout || '') + (t.stderr || '')).trim();
    row(t.status === 0 ? 'examples-passed' : 'examples-failed', { note: out.split('\n').slice(-6).join(' | ').slice(0, 600), exit: t.status, scratch: T, round });
    if (t.status === 0) break;
    const diff = out.split('\n').filter((l) => /actual|expected|^\s*[+-] |AssertionError|Error:/.test(l)).slice(0, 24).join('\n') || out.split('\n').slice(-20).join('\n');
    if (round < ROUNDS && await heal(topName, 'it compiled, but the examples test failed', diff, res.source)) continue;
    process.exit(1);
  }
  if (LAND) { for (const [rel, c] of Object.entries(res.files || {})) { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); }
    const tf2 = path.join(ROOT, testPath); fs.mkdirSync(path.dirname(tf2), { recursive: true }); fs.writeFileSync(tf2, testText);
    row('landed', { note: `${Object.keys(res.files || {}).length} file(s) and ${testPath} written into Nexus`, files: Object.keys(res.files || {}) }); }
  process.exit(0);
})().catch((e) => { row('error', { note: e.stack.split('\n').slice(0, 3).join(' | ') }); process.exit(1); });
