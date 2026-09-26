'use strict';
/**
 * tests/modules/test-repo-agent.js
 * UUID: nexus-test-repo-agent-v1-0000-2026-0920-jamesbrooks-001
 *
 * §BUILT 2026-09-20 — covers lib/repo-agent.js, the per-compartment agent
 * dispatch (James: "each repo compartment in idearium").
 *
 * §THE CENTRAL ASSERTION. This stands up a REAL http server on copilot's
 * port and captures what actually goes over the wire, because the one
 * thing that must be true — the hat's persona reaching the model, without
 * the host's global agent being switched — is not observable from the
 * return value. A test that only checked dispatch()'s output would pass
 * for an implementation that sent a bare prompt.
 *
 * The stub also asserts the NEGATIVE: /api/agent/switch is registered on
 * it and must never be called. That is the actual design constraint of
 * this module, and it is the kind of thing that silently regresses the
 * first time someone "fixes" hat application by reaching for setCurrentAgent.
 */

const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const RA  = require(path.join(ROOT, 'lib', 'repo-agent.js'));
const RH  = require(path.join(ROOT, 'lib', 'repo-hat.js'));
const MEM = require(path.join(ROOT, 'lib', 'repo-hat-memory.js'));

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const PORT = 3750;
const REPO = { uuid: `ra-test-${Date.now()}`, name: 'scratch project', compartmentId: 'cos.test.scratch' };

// ── Stub copilot ──────────────────────────────────────────────────────────────
const seen = { prompts: [], switches: [], sessions: [], channels: [], bodies: [] };
let replyWith = { status: 200, body: { text: 'stub answer', model_used: 'stub-model', confidence: 0.9, requestId: 'rq-1' } };

function startStub() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let d = '';
      req.on('data', c => { d += c; });
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(d || '{}'); } catch (_) { /* recorded raw below */ }
        if (req.url === '/api/agent/switch') {
          seen.switches.push(body);           // must stay empty
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true }));
        }
        if (req.url === '/api/prompt') {
          seen.prompts.push(body.prompt || '');
          seen.sessions.push(body.sessionId || null);
          seen.channels.push(body.channel || null);
          seen.bodies.push(body);
          res.writeHead(replyWith.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(replyWith.body));
        }
        res.writeHead(404); res.end('{}');
      });
    });
    srv.on('error', reject);
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

async function run() {
  console.log('\ntest-repo-agent\n');

  let srv;
  try { srv = await startStub(); }
  catch (e) {
    console.log(`  ! could not bind 127.0.0.1:${PORT} — ${e.message}`);
    console.log('    a real copilot is probably running; stop it or run this suite alone.\n');
    process.exitCode = 1;
    return;
  }

  try {
    // ── compose() is pure and inspectable ────────────────────────────────────
    const fakeHat = { name: 'repo_agent_scratch', personaPrompt: 'You are the project agent for "scratch project".' };
    const composed = RA.compose({ hat: fakeHat, message: 'what is in here?' });
    check('compose() puts the persona before the message',
      composed.indexOf('project agent') < composed.indexOf('what is in here?'));
    check('compose() separates persona from message', composed.includes('───'));
    check('compose() with no hat returns the bare message',
      RA.compose({ hat: null, message: 'bare' }) === 'bare');

    // ── Session identity is per compartment ──────────────────────────────────
    check('sessionId is derived from the repo uuid',
      RA.sessionIdFor('abc') === 'repo-agent-abc');
    check('two repos never share a session',
      RA.sessionIdFor('abc') !== RA.sessionIdFor('def'));

    // ── A real dispatch ──────────────────────────────────────────────────────
    const r = await RA.dispatch({ repo: REPO, repoDir: null, message: 'summarise this project' });
    check('dispatch succeeds against a reachable backend', r.ok === true, JSON.stringify(r.error));
    check('the backend\'s text is returned verbatim', r.text === 'stub answer');
    check('a hat was forged on demand for a repo that had none', !!r.hatName);
    check('the response carries the model the backend actually used', r.modelUsed === 'stub-model');

    // THE central assertion.
    const sent = seen.prompts[0] || '';
    check('the hat persona actually reached the backend',
      sent.includes('You are the project agent for "scratch project"'),
      sent.slice(0, 120));
    check('the person\'s message reached the backend intact',
      sent.includes('summarise this project'));
    check('the compartment id reached the backend',
      sent.includes('cos.test.scratch'));

    // THE negative assertion — the whole reason this module exists.
    check('the host\'s global agent was NEVER switched',
      seen.switches.length === 0, `${seen.switches.length} switch call(s)`);

    check('the dispatch used this compartment\'s own session',
      seen.sessions[0] === RA.sessionIdFor(REPO.uuid));
    check('the dispatch is tagged as coming from the repo agent',
      seen.channels[0] === 'idearium-repo-agent');
    check('no raw hat field is invented on the outgoing body — the persona travels in the prompt text, never a separate field',
      seen.bodies[0].hat === undefined);
    // §DEFAULT-GUARDIAN 2026-09-21 — this repo has no stored provider, so it
    // now takes the real default (guardian → chatgpt) rather than the old
    // 'auto' default (agent left undefined). Deliberately updated, not a
    // silent pass: was `agent === undefined`.
    check('the fresh repo\'s dispatch carries the real default route (guardian → chatgpt), not an invented one',
      seen.bodies[0].backend === 'guardian' && seen.bodies[0].agent === 'chatgpt');

    // ── Learning reaches the next dispatch ───────────────────────────────────
    RH.learn({ repo: REPO, repoDir: null, kind: 'correction',
               text: 'the build queue poller lives in api/index.js, not spec-engine', source: 'james' });
    await RA.dispatch({ repo: REPO, repoDir: null, message: 'where is the poller?' });
    const second = seen.prompts[1] || '';
    check('an observation taught between dispatches reaches the NEXT prompt',
      second.includes('the build queue poller lives in api/index.js'));
    check('the learned section is marked as learned, not passed off as grounded fact',
      second.includes('What you have learned'));

    // ── Honest failure ───────────────────────────────────────────────────────
    replyWith = { status: 502, body: { ok: false, error: 'ollama unavailable' } };
    const bad = await RA.dispatch({ repo: REPO, repoDir: null, message: 'this will fail' });
    check('a backend failure returns ok:false, not a throw', bad.ok === false);
    check('the backend\'s own error text is preserved', bad.error === 'ollama unavailable');
    check('a failed dispatch still reports which hat was worn', !!bad.hatName);
    replyWith = { status: 200, body: { text: 'stub answer', model_used: 'stub-model' } };

    // ── Guards ───────────────────────────────────────────────────────────────
    check('an empty message is refused before any network call',
      (await RA.dispatch({ repo: REPO, repoDir: null, message: '   ' })).ok === false);
    check('a repo with no uuid is refused',
      (await RA.dispatch({ repo: {}, message: 'hi' })).ok === false);

    // A repo with no compartment must be refused — repo-hat's own rule, and
    // the reason a compartment agent is a compartment agent at all.
    const noComp = await RA.dispatch({ repo: { uuid: 'ra-nocomp-1', name: 'x' }, repoDir: null, message: 'hi' });
    check('a repo with no compartment cannot get an agent',
      noComp.ok === false && noComp.needsHat === true);
    check('the refusal explains why, rather than failing blankly',
      /compartment/i.test(noComp.error || ''), noComp.error);

    // ── History ──────────────────────────────────────────────────────────────
    // Three dispatches reached the backend: two successes and one 502. The
    // guard-refused calls above (empty message, no uuid, no compartment)
    // return before any network call and must NOT appear here — a transcript
    // padded with things that never happened is worse than a short one.
    const hist = RA.history(REPO.uuid, 100);
    check('every exchange is logged to this compartment, not a global log',
      hist.length === 3 && hist.every(h => h.repoUuid === REPO.uuid), `n=${hist.length}`);
    check('guard-refused calls are not logged as exchanges',
      !hist.some(h => /this will fail/.test(h.message) === false && h.message.trim() === ''));
    check('failures are logged with the same weight as successes',
      hist.some(h => h.ok === false && h.error));
    check('history is newest-first', hist.length < 2 || (hist[0].ts >= hist[1].ts));

    // ── status() is one read for the whole tab ───────────────────────────────
    const st = RA.status({ repo: REPO, repoDir: null });
    check('status reports the hat, compartment, memory and session together',
      st.exists === true && st.compartmentId === REPO.compartmentId &&
      st.memory.total >= 1 && st.sessionId === RA.sessionIdFor(REPO.uuid));
    // 0.39.257 — the scope is now enforced for a named backend (copilot's tool loop, allowedTools); not for 'auto'.
    check('status reports the tool scope (all by default) and that it is enforced exactly when a named backend answers',
      st.toolScope === 'all' && st.toolScopeEnforced === (RA.getProvider(REPO.uuid) !== 'auto'));

  } finally {
    // ── Cleanup — no pollution, the rule this session already had to enforce ──
    try { RH.revokeRepoHat(REPO.uuid); } catch (_) {}
    MEM.clear(REPO.uuid);
    RA.clearHistory(REPO.uuid);
    MEM.clear('ra-nocomp-1');
    RA.clearHistory('ra-nocomp-1');
    const leftHat = RH.getRepoHat(REPO.uuid);
    check('the scratch hat was revoked — nothing left in forged_hats', !leftHat);
    check('no observations left behind', MEM.list(REPO.uuid).length === 0);
    check('no exchange log left behind', RA.history(REPO.uuid).length === 0);
    srv.close();
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

setTimeout(() => { run(); }, 2500);
