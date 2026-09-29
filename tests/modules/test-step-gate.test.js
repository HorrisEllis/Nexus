'use strict';
/**
 * tests/modules/test-step-gate.test.js — 0.39.282 N21 (docs/2026-09-29-nex-node-store-phasemap.spec)
 *
 * James, after Idearium showed src/kernel/state.js at 0 bytes with its plan job marked "replied": "Shouldn't generate
 * empty. Why not gate each step with events." Every build step passes a gate (lib/step-gate.js) whose rules are YAML
 * nodes (lib/step-gates/*.step_gate); the outcome is an event (step.passed / step.blocked) on nexus-bus.
 *   SG-0x  the gate and its rule nodes
 *   SG-1x  end to end through the real repo layer: the live refusal is blocked, empty files are never proposed
 *   SG-2x  the wiring: a blocked plan job reads 'blocked', never 'replied'
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

// the reply from the live run (2026-09-29), fence and all
const LIVE_REFUSAL = "I can't safely rebuild src/kernel/state.js because the project-specific code tools are not actually available in this chat.\n```js src/kernel/state.js\n```\n";

async function run() {
  console.log('\ntest-step-gate\n');
  const SG = require(path.join(ROOT, 'lib', 'step-gate.js'));
  const bus = require(path.join(ROOT, 'nexus', 'nexus-bus.js'));
  const seen = [];
  bus.on('step.blocked', e => seen.push(e)); bus.on('step.passed', e => seen.push(e));

  // ── SG-0x the gate ──
  const R = SG.rules();
  check('SG-01 the rules are nodes: reply.accept and code.write load from lib/step-gates/*.step_gate', !!R['reply.accept'] && !!R['code.write'] && /step-gates/.test(R['code.write'].file));
  const yaml = require('js-yaml');
  const schema = yaml.load(fs.readFileSync(path.join(ROOT, 'lib/node-schemas/schema.step_gate'), 'utf8'));
  check('SG-02 step_gate is a schema in the taxonomy', schema.id === 'step_gate' && schema.payload.fields.step && schema.payload.fields.checks);
  check('SG-03 the live refusal is blocked as a refusal', /refusal/.test((SG.check('reply.accept', { text: LIVE_REFUSAL }).reasons[0] || {}).reason || ''));
  check('SG-04 a reply with real code passes, even if it hedges', SG.check('reply.accept', { text: "I can't complete all of it, but here:\n```js a.js\nexport const a = 1;\n```" }).ok);
  check('SG-05 an empty or blank file is blocked', !SG.check('code.write', { path: 'a.js', content: '' }).ok && !SG.check('code.write', { path: 'a.js', content: ' \n\t\n' }).ok);
  check('SG-06 broken json/yaml is blocked; valid passes; unchecked languages pass', !SG.check('code.write', { path: 'c.json', content: '{bad' }).ok
    && SG.check('code.write', { path: 'c.json', content: '{"a":1}' }).ok && !SG.check('code.write', { path: 'c.yaml', content: 'a: [1' }).ok
    && SG.check('code.write', { path: 'x.rs', content: 'fn main() {' }).ok);
  check('SG-07 a step with no rule node passes and says it is ungated', SG.check('no.such.step', {}).ungated === true);
  // §N21 slice 2 — JS parses through Node's own --check (ESM as .mjs, else .cjs; a plain .js with ESM + an error passes
  // `node --check` under Node 22's module detection, which is why it is never checked as .js); TS stays unchecked.
  check('SG-09 broken ESM and CJS JavaScript are blocked; valid ESM/CJS pass; TypeScript is not claimed checked',
    !SG.check('code.write', { path: 'a.js', content: 'export function f( {\n' }).ok && !SG.check('code.write', { path: 'c.js', content: 'module.exports = (;\n' }).ok
    && SG.check('code.write', { path: 'b.js', content: 'import fs from "fs";\nexport const a = 1;\n' }).ok && SG.check('code.write', { path: 'd.cjs', content: 'module.exports = require("x");\n' }).ok
    && SG.check('code.write', { path: 'e.ts', content: 'let x: = 1' }).ok);
  const g = SG.gate('code.write', { path: 'e.js', content: '' }, { causedBy: 'cause-1' });
  const ev = seen.find(e => e.payload && e.payload.eventId === g.eventId);
  check('SG-08 gate() emits step.blocked on nexus-bus with the reasons and the causal id', !!ev && ev.type === 'step.blocked' && ev.causedBy === 'cause-1' && ev.payload.reasons.length === 1);
  const GF = require(path.join(ROOT, 'lib', 'gap-field.js'));
  const gaps = GF.openGaps ? GF.openGaps() : [];
  const gapRow = (Array.isArray(gaps) ? gaps : (gaps.gaps || [])).find(x => x.type === 'step.blocked.code.write.file-non-empty');
  check('SG-08b a block is also a gap (step.blocked.<step>.<check>) naming the path and the event — the road into failure modes',
    !!g.gapId && !!gapRow && gapRow.location === 'e.js' && (gapRow.meta || {}).eventId === g.eventId, JSON.stringify(gapRow || g).slice(0, 300));
  const again = SG.gate('code.write', { path: 'e2.js', content: '' });
  const bumped = (GF.openGaps() || []).filter(x => x.type === 'step.blocked.code.write.file-non-empty');
  check('SG-08c repeats bump the one open gap instead of piling up', bumped.length === 1 && (bumped[0].occurrences || 1) >= 2 && again.gapId === g.gapId, JSON.stringify(bumped).slice(0, 200));

  // ── SG-1x end to end through the real repo layer ──
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  const RI = require(path.join(ROOT, 'lib', 'repo-inject.js'));
  let rec = null;
  for (let i = 0; i < 20; i++) {
    rec = layer.ingest({ name: `step-gate-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }] });
    if (!(rec && rec.error && /no spec-engine/.test(rec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const repo = rec && (rec.repo || rec);
  check('SG-10 a real repo to write into', !!(repo && repo.uuid), JSON.stringify(rec).slice(0, 200));
  if (repo && repo.uuid) {
    RI.setMode(repo.uuid, 'auto');
    const read = p => { const r = layer.readFile(repo.uuid, p); return r && !r.error ? r.content : null; };
    const before = RI.list(repo.uuid).length;
    const a = await RI.fromReply({ layer, repo, hat: null, text: LIVE_REFUSAL });
    check('SG-11 the live refusal: blocked, nothing injected, no src/kernel/state.js', !!a.blocked && a.injects.length === 0 && read('src/kernel/state.js') === null && RI.list(repo.uuid).length === before, JSON.stringify(a).slice(0, 300));
    const b = await RI.fromReply({ layer, repo, hat: null, text: 'Two files:\n```js src/good.js\nexport const g = 1;\n```\n```js src/empty.js\n```\n```json src/bad.json\n{nope\n```\n' });
    check('SG-12 a mixed reply: the good file lands, the empty and the broken one are blocked and named', b.injects.map(i => i.path).join() === 'src/good.js'
      && (b.blockedFiles || []).map(x => x.path).sort().join() === 'src/bad.json,src/empty.js' && read('src/empty.js') === null && /export const g = 1/.test(read('src/good.js') || ''), JSON.stringify(b).slice(0, 400));
    const blockedEvents = seen.filter(e => e.type === 'step.blocked' && e.payload.step === 'code.write' && ['src/empty.js', 'src/bad.json'].includes(e.payload.path));
    check('SG-13 each blocked file is an event whose cause is the reply that passed', blockedEvents.length === 2 && blockedEvents.every(e => e.causedBy && seen.some(p => p.type === 'step.passed' && p.payload.eventId === e.causedBy)));
  }

  // ── SG-2x wiring ──
  const BS = fs.readFileSync(path.join(ROOT, 'idearium/api/build-surface.js'), 'utf8');
  check('SG-20 plan and manage jobs read blocked when the reply was blocked (both sites)', (BS.match(/res\.injects && res\.injects\.blocked \? 'blocked' : 'replied'/g) || []).length === 2);
  check('SG-21 the plan panel labels blocked', /blocked: 'blocked'/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8')));
  check('SG-22 a code-less refusal is gated in repo-agent too', /gate\('reply\.accept', \{ text \}/.test(fs.readFileSync(path.join(ROOT, 'lib/repo-agent.js'), 'utf8')));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 300);
}
setTimeout(() => run().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); }), 500);
