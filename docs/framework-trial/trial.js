#!/usr/bin/env node
'use strict';
/**
 * docs/framework-trial/trial.js — the framework trial's three steps, no dependencies (2026-10-24).
 *
 * James, 2026-10-24: "I could use you, Gemini and ChatGPT" — his framework tested across three AI systems, each problem asked
 * twice in fresh chats: arm A (baseline instructions) and arm B (his method), judged blind.
 *
 *   node docs/framework-trial/trial.js prompts            write prompts/<P>-<arm>.txt, one per problem and arm, to paste into a fresh chat
 *   node docs/framework-trial/trial.js blind              answers/<P>/<model>-<arm>-<run>.md → blind/<P>/<code>.md, the key in key.json
 *   node docs/framework-trial/trial.js sheet              scores.csv to fill in: one row per blind answer (level 0-3, each check 0/1)
 *   node docs/framework-trial/trial.js score              scores.csv + key.json → results.md: arm B vs arm A, overall, per model, per problem
 *
 * The judge opens only blind/ and the rubrics (problems.json). key.json is read by `score` alone. A blind answer whose text names
 * its arm (e.g. "end-state", "wall or obstacle") is flagged in blind/LEAKS.md: the judge should know a label may be guessable.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = __dirname;
const P = JSON.parse(fs.readFileSync(path.join(DIR, 'problems.json'), 'utf8')).problems;
const ARMS = JSON.parse(fs.readFileSync(path.join(DIR, 'arms.json'), 'utf8'));
const MARKERS = /\b(end-state|wall or (an )?obstacle|negative space|invariants?)\b/i;   // words arm B's instructions use

function promptFor(p, arm) {
  return `${p.prompt}\n\n---\n${ARMS.arms[arm].instructions}\n\n${ARMS.answer_format}\n`;
}

function prompts() {
  const out = path.join(DIR, 'prompts'); fs.mkdirSync(out, { recursive: true });
  for (const p of P) for (const arm of Object.keys(ARMS.arms)) fs.writeFileSync(path.join(out, `${p.id}-${arm}.txt`), promptFor(p, arm));
  console.log(`${P.length * 2} prompts in ${path.relative(process.cwd(), out)}/ — each into a FRESH chat (no memory), saved as answers/<P>/<model>-<A|B>-<run>.md`);
}

function blind() {
  const src = path.join(DIR, 'answers'), dst = path.join(DIR, 'blind');
  if (!fs.existsSync(src)) { console.error('no answers/ yet'); process.exit(1); }
  fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
  const key = {}, leaks = [];
  for (const p of fs.readdirSync(src).filter(d => /^P\d+$/.test(d))) {
    const files = fs.readdirSync(path.join(src, p)).filter(f => /^[a-z0-9]+-[AB]-\d+\.md$/i.test(f));
    const shuffled = files.map(f => [crypto.randomBytes(4).toString('hex'), f]).sort((a, b) => a[0].localeCompare(b[0]));
    fs.mkdirSync(path.join(dst, p), { recursive: true });
    for (const [code, f] of shuffled) {
      const [model, arm, run] = f.replace(/\.md$/, '').split('-');
      const text = fs.readFileSync(path.join(src, p, f), 'utf8');
      fs.writeFileSync(path.join(dst, p, `${code}.md`), text);
      key[`${p}/${code}`] = { problem: p, model: model.toLowerCase(), arm, run: Number(run) };
      if (MARKERS.test(text)) leaks.push(`${p}/${code}`);
    }
  }
  fs.writeFileSync(path.join(DIR, 'key.json'), JSON.stringify(key, null, 2));
  fs.writeFileSync(path.join(dst, 'LEAKS.md'), leaks.length ? `Answers whose wording may reveal their arm (judge knowingly):\n\n${leaks.map(l => `- ${l}`).join('\n')}\n` : 'None.\n');
  console.log(`${Object.keys(key).length} answers blinded into blind/ (${leaks.length} may reveal their arm, listed in blind/LEAKS.md); the key is key.json — don't open it before scoring`);
}

function sheet() {
  const dst = path.join(DIR, 'blind'); const rows = ['problem,code,level,' + Array.from({ length: 6 }, (_, i) => `c${i + 1}`).join(',') + ',notes'];
  for (const p of fs.readdirSync(dst).filter(d => /^P\d+$/.test(d))) for (const f of fs.readdirSync(path.join(dst, p))) rows.push(`${p},${f.replace(/\.md$/, '')},,,,,,,,`);
  fs.writeFileSync(path.join(DIR, 'scores.csv'), rows.join('\n') + '\n');
  console.log(`scores.csv: ${rows.length - 1} rows. level = 0 none · 1 minimal · 2 optimal · 3 exceptional (problems.json rubric); c1..cN = that problem's checks in order, 1 met / 0 not`);
}

function score() {
  const key = JSON.parse(fs.readFileSync(path.join(DIR, 'key.json'), 'utf8'));
  const lines = fs.readFileSync(path.join(DIR, 'scores.csv'), 'utf8').trim().split('\n').slice(1);
  const rows = [];
  for (const l of lines) {
    const c = l.split(','); if (!c[2]) continue;
    const k = key[`${c[0]}/${c[1]}`]; if (!k) continue;
    const checks = c.slice(3, 9).filter(x => x !== '').map(Number);
    rows.push({ ...k, level: Number(c[2]), checks: checks.length ? checks.reduce((a, b) => a + b, 0) / checks.length : null });
  }
  const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  const by = (f) => { const g = {}; for (const r of rows) (g[f(r)] = g[f(r)] || []).push(r); return g; };
  const line = (label, rs) => {
    const A = rs.filter(r => r.arm === 'A'), B = rs.filter(r => r.arm === 'B');
    const la = mean(A.map(r => r.level)), lb = mean(B.map(r => r.level));
    const ca = mean(A.map(r => r.checks).filter(x => x != null)), cb = mean(B.map(r => r.checks).filter(x => x != null));
    return `| ${label} | ${A.length}/${B.length} | ${la.toFixed(2)} | ${lb.toFixed(2)} | ${(lb - la >= 0 ? '+' : '')}${(lb - la).toFixed(2)} | ${(ca * 100).toFixed(0)}% | ${(cb * 100).toFixed(0)}% |`;
  };
  const out = ['# Framework trial — results', '', `Scored answers: ${rows.length}. Level 0–3 (rubric); checks = share of the problem's checks met.`, '',
    '| group | n (A/B) | level A | level B | B − A | checks A | checks B |', '|---|---|---|---|---|---|---|', line('all', rows)];
  for (const [m, rs] of Object.entries(by(r => r.model))) out.push(line(`model: ${m}`, rs));
  for (const [p, rs] of Object.entries(by(r => r.problem))) out.push(line(`problem: ${p}`, rs));
  out.push('', 'A small sample: read the per-problem rows before the overall one. A difference is evidence only if it holds across models and problems (his rule: continuity, not a one-off).');
  fs.writeFileSync(path.join(DIR, 'results.md'), out.join('\n') + '\n');
  console.log(out.join('\n'));
}

// ── deploy (AU2) ──────────────────────────────────────────────────────────────
// James, 2026-10-24: "have that test done automatically." · (of the manual run) "that was done by hand in clearglass."
// Deploy each prompt to its agent and save the reply as answers/<P>/<model>-<arm>-<run>.md (exactly what `blind` reads),
// so the trial collects itself instead of being pasted tab by tab. Judging stays human/blind (the trial's integrity):
// deploy only COLLECTS; blind → sheet → a judge fills scores → score. One door per provider through Nexus's own agent
// list; a provider whose service is not up is reported, never hidden (§1.2). The transport is injectable (setSend) so the
// pipeline is proven offline with a deterministic mock; the real run (ChatGPT/Gemini via Guardian's tabs) is his, live.

function _flags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; f[k] = v; }
  return f;
}

function _http(url, body, timeoutMs = 120000) {
  const http = require('http'); const u = new URL(url); const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: timeoutMs }, r => {
      let buf = ''; r.on('data', c => buf += c); r.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error(`bad JSON from ${u.pathname}`)); } });
    });
    req.on('error', e => reject(new Error(e.code === 'ECONNREFUSED' ? `${u.hostname}:${u.port} not up` : e.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('timed out')); });
    req.write(data); req.end();
  });
}

// the real transport: ollama direct; everything else through Nexus's deploy door (Guardian/copilot), best-effort.
async function _realSend(model, prompt) {
  const m = String(model).toLowerCase();
  if (m === 'ollama' || m.startsWith('ollama:')) {
    const name = m.includes(':') ? m.split(':').slice(1).join(':') : (process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b');
    const r = await _http(process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate', { model: name, prompt, stream: false }, 180000);
    return r.response || '';
  }
  const url = process.env.TRIAL_DEPLOY_URL || `${process.env.GUARDIAN_URL || 'http://127.0.0.1:7820'}/api/complete`;
  const r = await _http(url, { provider: m, prompt }, 180000);
  return r.text || r.reply || r.response || '';
}
let _send = _realSend;
function setSend(fn) { _send = fn || _realSend; }

// deterministic offline replies, so the deploy→blind→sheet→score pipeline is provable without a live agent. Neutral by
// design — it must NOT fake arm B looking better (that is the judge's blind call); it only exercises the plumbing.
function _mockReply(p, arm, model) {
  return `# ${model} ${arm} (mock)\n\nProblem ${p.id}. A placeholder answer for pipeline testing only — no real reasoning.\n\nEnd state: resolved.\n`;
}

async function deploy(argv = []) {
  const f = _flags(argv);
  const models = (!f.model || f.model === 'all') ? ['claude', 'chatgpt', 'gemini'] : String(f.model).split(',').map(s => s.trim());
  const arms = (!f.arm || f.arm === 'both') ? Object.keys(ARMS.arms) : [String(f.arm)];
  const run = Number(f.run || 1);
  let ok = 0, fail = 0; const results = [];
  for (const p of P) for (const arm of arms) for (const model of models) {
    const dir = path.join(DIR, 'answers', p.id); fs.mkdirSync(dir, { recursive: true });
    const rel = `answers/${p.id}/${model}-${arm}-${run}.md`;
    try {
      const reply = f.mock ? _mockReply(p, arm, model) : await _send(model, promptFor(p, arm));
      if (!reply || !String(reply).trim()) throw new Error('empty reply');
      fs.writeFileSync(path.join(DIR, 'answers', p.id, `${model}-${arm}-${run}.md`), String(reply));
      ok++; results.push({ p: p.id, arm, model, ok: true }); console.log(`  ✓ ${p.id} ${arm} ${model} → ${rel}`);
    } catch (e) {
      fail++; results.push({ p: p.id, arm, model, ok: false, error: e.message }); console.log(`  ✗ ${p.id} ${arm} ${model} — ${e.message} (not saved)`);
    }
  }
  console.log(`\ndeployed ${ok} answer(s), ${fail} failed. Next: trial.js blind → sheet → (a judge fills scores.csv, blind) → score`);
  return { ok, fail, results };
}

module.exports = { prompts, blind, sheet, score, deploy, promptFor, setSend, P };

if (require.main === module) {
  const cmd = process.argv[2];
  const fn = { prompts, blind, sheet, score, deploy }[cmd];
  if (!fn) { console.log('usage: trial.js prompts | deploy [--model m|all] [--arm A|B|both] [--run n] [--mock] | blind | sheet | score'); process.exit(1); }
  Promise.resolve(fn(process.argv.slice(3))).catch(e => { console.error(e.message); process.exit(1); });
}
