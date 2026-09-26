'use strict';
/**
 * tests/modules/test-repo-agent-learn.js
 * §2026-09-21 — the compartment agent learns from its own work (@learn
 * protocol in lib/repo-agent.js) and the Agent tab shows what each answer
 * was given and what it learned (_agentDetail in idearium/ui/js/app.js).
 *
 * The end-to-end half runs a REAL http stub on copilot's port so the
 * protocol text can be seen going out and the learned observation can be
 * seen reaching the NEXT outgoing prompt — the only proof that learning is
 * live rather than banked.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const RA  = require(path.join(ROOT, 'lib', 'repo-agent.js'));
const RH  = require(path.join(ROOT, 'lib', 'repo-hat.js'));
const MEM = require(path.join(ROOT, 'lib', 'repo-hat-memory.js'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

const REPO = { uuid: `ral-${Date.now()}`, name: 'learn scratch', compartmentId: 'cos.test.learn' };
const prompts = []; let switches = 0; let reply = 'plain answer';

function stub() {
  return new Promise((res, rej) => {
    const s = http.createServer((q, r) => {
      let d = ''; q.on('data', c => d += c); q.on('end', () => {
        if (q.url === '/api/agent/switch') { switches++; }
        if (q.url === '/api/prompt') { try { prompts.push(JSON.parse(d).prompt || ''); } catch (_) {} }
        r.writeHead(200, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify({ text: reply, model_used: 'stub' }));
      });
    });
    s.on('error', rej); s.listen(3750, '127.0.0.1', () => res(s));
  });
}

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}

async function run() {
  console.log('\ntest-repo-agent-learn\n');

  // ── parseLearned: pure ─────────────────────────────────────────────────────
  const P = RA.parseLearned;
  const a = P('answer body\n@learn convention: routes are declared in a table [evidence: api/index.js]', { files: ['api/index.js'] });
  check('a valid @learn line is accepted', a.items.length === 1 && a.items[0].kind === 'convention');
  check('the @learn line is stripped from the text the person reads', a.clean === 'answer body');
  check('evidence naming a file the agent was given is grounded', a.items[0].grounded === true);

  const b = P('x\n@learn fact: the poller runs every fifteen seconds [evidence: nowhere.js]', { files: ['api/index.js'] });
  check('evidence naming something NOT given is marked ungrounded', b.items[0].grounded === false);

  const c = P('x\n@learn correction: you were wrong about everything here');
  check('an agent cannot write a correction', c.items.length === 0 && /person/.test(c.rejected[0]?.reason || ''));
  check('the refused correction line is still stripped', c.clean === 'x');

  check('an unknown kind is rejected with its name',
    /unknown kind "vibe"/.test(P('@learn vibe: something long enough here').rejected[0]?.reason || ''));
  check('a malformed line is rejected, not treated as prose',
    P('@learn no colon here at all').rejected.length === 1);
  check('a too-short observation is rejected', P('@learn fact: tiny').rejected.length === 1);

  const many = Array.from({ length: RA.LEARN_MAX + 3 }, (_, i) => `@learn fact: observation number ${i} is here`).join('\n');
  const m = P(many);
  check(`at most LEARN_MAX (${RA.LEARN_MAX}) accepted, the rest counted as dropped`, m.items.length === RA.LEARN_MAX && m.dropped === 3);
  check('text with no @learn lines is untouched', P('just an answer\n').clean === 'just an answer');
  check('a mid-sentence mention of @learn is not a protocol line', P('use the @learn syntax').items.length === 0 && P('use the @learn syntax').clean === 'use the @learn syntax');

  // ── compose carries the protocol only with a hat ───────────────────────────
  check('compose includes the protocol when a hat exists',
    RA.compose({ hat: { personaPrompt: 'p' }, message: 'q' }).includes('@learn <fact|convention|pitfall>'));
  check('compose with no hat stays the bare message', RA.compose({ hat: null, message: 'bare' }) === 'bare');

  // ── End to end ─────────────────────────────────────────────────────────────
  let srv;
  try { srv = await stub(); } catch (e) { console.log(`  ! cannot bind :3750 — ${e.message}`); process.exitCode = 1; return; }
  try {
    reply = 'Here is the answer.\n@learn pitfall: saveSpec mirrored full chunk content on every write\n@learn correction: trust me instead';
    const r1 = await RA.dispatch({ repo: REPO, repoDir: null, message: 'why did import OOM?' });
    check('dispatch succeeds', r1.ok === true, r1.error);
    check('the protocol reached the backend', (prompts[0] || '').includes('@learn <fact|convention|pitfall>'));
    check('the person sees the answer without protocol lines', r1.text === 'Here is the answer.');
    check('the pitfall was recorded', (r1.learned?.recorded || []).some(x => x.ok && x.kind === 'pitfall'));
    check('the agent-authored correction was rejected, not recorded',
      r1.learned.rejected.length === 1 && !MEM.list(REPO.uuid).some(o => o.kind === 'correction'));
    check('the recorded observation is attributed to the agent',
      MEM.list(REPO.uuid).some(o => o.kind === 'pitfall' && o.source === 'agent'));
    check('an observation with no evidence is stored as unevidenced, not invented evidence',
      MEM.list(REPO.uuid).find(o => o.kind === 'pitfall').evidence === null);

    reply = 'second answer';
    await RA.dispatch({ repo: REPO, repoDir: null, message: 'and now?' });
    check('what the agent learned is LIVE in its NEXT prompt',
      (prompts[1] || '').includes('saveSpec mirrored full chunk content on every write'));

    reply = 'third\n@learn pitfall: saveSpec mirrored full chunk content on every write';
    const r3 = await RA.dispatch({ repo: REPO, repoDir: null, message: 'again' });
    check('re-learning a known observation dedups rather than duplicating',
      r3.learned.recorded[0].deduped === true && MEM.list(REPO.uuid).filter(o => o.kind === 'pitfall').length === 1);

    reply = 'nothing learned here';
    const r4 = await RA.dispatch({ repo: REPO, repoDir: null, message: 'plain' });
    check('a reply with no @learn lines reports learned:null', r4.learned === null);

    const hist = RA.history(REPO.uuid, 10);
    check('the exchange log records the learned summary', hist.some(h => h.learned && h.learned.recorded === 1));
    check('the host global agent was never switched', switches === 0);
  } finally {
    try { RH.revokeRepoHat(REPO.uuid); } catch (_) {}
    MEM.clear(REPO.uuid); RA.clearHistory(REPO.uuid); srv.close();
  }

  // ── _agentDetail, extracted verbatim from app.js ───────────────────────────
  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  const esc = extractFn(APP, 'escapeHtml');
  const det = new Function(`${esc}; ${extractFn(APP, '_agentDetail')}; return _agentDetail;`)();

  const withCtx = det({ context: { chunkIds: ['c1', 'c2'], files: ['a.js'], chars: 900, dropped: 1 } });
  check('the tab shows how many chunks and files the answer was given', /2 chunks · 1 file · 900 chars · 1 dropped/.test(withCtx));
  check('the tab lists the files the answer was grounded on', withCtx.includes('a.js'));
  check('no-context is stated with its reason, not left blank',
    det({ context: { chunkIds: [], files: [], reason: 'no repoDir' } }).includes('none — no repoDir'));
  const learnedHtml = det({ learned: { recorded: [{ ok: true, kind: 'fact', text: 'x is y here', evidence: 'z.js', grounded: false }], rejected: [{ reason: 'r' }], dropped: 0 } });
  check('learned observations are shown, with ungrounded evidence flagged', /\+ \(fact\) x is y here/.test(learnedHtml) && learnedHtml.includes('ungrounded'));
  check('rejections are shown, not hidden', learnedHtml.includes('rejected: r'));
  check('agent text is escaped in the detail', det({ context: { files: ['<img>'], chunkIds: ['c'] } }).includes('&lt;img&gt;'));
  // 0.39.241 — agentSend settles its line through _agentSettle (shared with the late-reply watcher),
  // which attaches the detail whatever the outcome; agentSend calls it on both paths.
  check('agentSend attaches the detail to both success and failure lines',
    /line\.detail = _agentDetail\(r\);/.test(extractFn(APP, '_agentSettle')) &&
    (extractFn(APP, 'agentSend').match(/_agentSettle\(line, r\)/g) || []).length === 2);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}
setTimeout(run, 2500);
