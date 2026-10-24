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

const cmd = process.argv[2];
({ prompts, blind, sheet, score }[cmd] || (() => { console.log('usage: trial.js prompts | blind | sheet | score'); process.exit(1); }))();
