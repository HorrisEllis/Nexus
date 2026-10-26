#!/usr/bin/env node
'use strict';
/**
 * docs/framework-trial/server.js — the framework trial's SCREEN (AU2 UI). Zero dependencies.
 *
 * James, 2026-10-24: "Now make something. I don't do CLI." The trial's steps (deploy, blind, sheet, score) were CLI-only;
 * this serves them as a page you click. It runs trial.js as a subprocess per step (so trial.js's own process.exit can't
 * take the server down) and reads the files each step writes. Open it in Clear Glass. The real multi-provider deploy needs
 * your agents up (Guardian/Clear Glass); --mock and ollama work without them. Judging stays blind and yours — the page
 * only shows the anonymised answers and records the scores you give.
 *
 * Run:  node docs/framework-trial/server.js   (then open http://127.0.0.1:4820)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DIR = __dirname;
const PORT = parseInt(process.env.TRIAL_UI_PORT || '4820', 10);
const TRIAL = path.join(DIR, 'trial.js');

function readJSON(p, d) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return d; } }
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function body(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch (_) { r({}); } }); }); }

// run trial.js <args> as a subprocess; resolve { ok, out, err }
function runTrial(args, timeoutMs = 20 * 60000) {
  return new Promise(resolve => {
    execFile(process.execPath, [TRIAL, ...args], { cwd: DIR, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (e, out, err) => resolve({ ok: !e, out: out || '', err: (err || '') + (e && e.killed ? ' (timed out)' : '') }));
  });
}

function state() {
  const problems = (readJSON(path.join(DIR, 'problems.json'), { problems: [] }).problems || []).map(p => ({
    id: p.id, title: p.title, domain: p.domain, prompt: p.prompt,
    levels: (p.rubric && p.rubric.levels) || [], checks: (p.rubric && p.rubric.checks) || [],
  }));
  const arms = readJSON(path.join(DIR, 'arms.json'), { arms: {} });
  const ansDir = path.join(DIR, 'answers');
  const answers = {};
  try { for (const d of fs.readdirSync(ansDir).filter(x => /^P\d+$/.test(x))) answers[d] = fs.readdirSync(path.join(ansDir, d)).filter(f => /-[AB]-\d+\.md$/i.test(f)).length; } catch (_) {}
  return {
    problems, arms: Object.keys(arms.arms || {}), armText: arms.arms || {}, answerFormat: arms.answer_format || '',
    answers, hasBlind: fs.existsSync(path.join(DIR, 'key.json')),
    hasScores: fs.existsSync(path.join(DIR, 'scores.csv')), hasResults: fs.existsSync(path.join(DIR, 'results.md')),
  };
}

// the anonymised answers to judge: blind/<P>/<code>.md + the key is NOT sent (judging stays blind)
function blindSet() {
  const dst = path.join(DIR, 'blind'); const out = {};
  try { for (const p of fs.readdirSync(dst).filter(x => /^P\d+$/.test(x))) {
    out[p] = fs.readdirSync(path.join(dst, p)).filter(f => f.endsWith('.md')).map(f => ({ code: f.replace(/\.md$/, ''), text: fs.readFileSync(path.join(dst, p, f), 'utf8') }));
  } } catch (_) {}
  let leaks = ''; try { leaks = fs.readFileSync(path.join(dst, 'LEAKS.md'), 'utf8'); } catch (_) {}
  return { answers: out, leaks };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && u.pathname === '/') {
      // ui.html is the full cockpit; until it lands (the trial's screen folds into BrainOS's Flow canvas, his 2026-10-24 "What about
      // BrainOS?"), serve a minimal page that still drives the API, so the endpoints are usable, not a 404.
      const uiPath = path.join(DIR, 'ui.html');
      if (fs.existsSync(uiPath)) return send(res, 200, fs.readFileSync(uiPath, 'utf8'), 'text/html; charset=utf-8');
      const st = state();
      const page = `<!doctype html><meta charset=utf-8><title>Framework Trial</title><body style="font:14px/1.5 system-ui;max-width:760px;margin:40px auto;color:#ddd;background:#111">`
        + `<h1 style="font-weight:600">Framework trial</h1><p style="color:#9aa">${st.problems.length} problems · arms ${st.arms.join(' / ')} · answers so far: ${Object.values(st.answers).reduce((a,b)=>a+b,0)}. The full cockpit (ui.html) is pending — it folds into BrainOS's Flow canvas. Meanwhile the API is live:</p>`
        + `<pre style="background:#1a1a1a;padding:12px;border-radius:8px">POST /api/deploy {models,arm,run,mock}\nPOST /api/blind\nGET  /api/blind-set\nPOST /api/scores {rows}\nPOST /api/score  → results.md\nGET  /api/results</pre></body>`;
      return send(res, 200, page, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && u.pathname === '/api/state') return send(res, 200, state());
    if (req.method === 'GET' && u.pathname === '/api/blind-set') return send(res, 200, blindSet());
    if (req.method === 'GET' && u.pathname === '/api/results') { let md = ''; try { md = fs.readFileSync(path.join(DIR, 'results.md'), 'utf8'); } catch (_) {} return send(res, 200, { md }); }

    if (req.method === 'POST' && u.pathname === '/api/deploy') {
      const b = await body(req);
      const args = ['deploy', '--model', (b.models && b.models.length ? b.models.join(',') : 'all'), '--arm', b.arm || 'both', '--run', String(b.run || 1)];
      if (b.mock) args.push('--mock');
      const r = await runTrial(args);
      return send(res, 200, { ok: r.ok, log: r.out + r.err, state: state() });
    }
    if (req.method === 'POST' && u.pathname === '/api/blind') { const r = await runTrial(['blind']); return send(res, 200, { ok: r.ok, log: r.out + r.err, state: state() }); }
    if (req.method === 'POST' && u.pathname === '/api/score') { const r = await runTrial(['score']); let md = ''; try { md = fs.readFileSync(path.join(DIR, 'results.md'), 'utf8'); } catch (_) {} return send(res, 200, { ok: r.ok, log: r.out + r.err, md }); }

    // the judge's scores → scores.csv in the exact shape score() reads: problem,code,level,c1..c6,notes
    if (req.method === 'POST' && u.pathname === '/api/scores') {
      const b = await body(req); const rows = ['problem,code,level,c1,c2,c3,c4,c5,c6,notes'];
      for (const r of (b.rows || [])) {
        const checks = (r.checks || []).map(x => x === 1 || x === '1' || x === true ? '1' : (x === 0 || x === '0' || x === false ? '0' : '')).slice(0, 6);
        while (checks.length < 6) checks.push('');
        rows.push([r.problem, r.code, r.level == null ? '' : r.level, ...checks, (r.notes || '').replace(/[\n,]/g, ' ')].join(','));
      }
      fs.writeFileSync(path.join(DIR, 'scores.csv'), rows.join('\n') + '\n');
      return send(res, 200, { ok: true, saved: (b.rows || []).length });
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) { return send(res, 500, { error: e.message }); }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => console.log(`Framework trial UI → http://127.0.0.1:${PORT}  (open it in Clear Glass)`));
}
module.exports = { server, state, blindSet, PORT };
