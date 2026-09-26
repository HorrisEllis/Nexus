'use strict';
/**
 * tests/modules/test-repo-hat-memory.js
 * UUID: nexus-test-repo-hat-memory-v1-0000-2026-0920-jamesbrooks-001
 *
 * §BUILT 2026-09-20 — covers lib/repo-hat-memory.js and the persona
 * composition it feeds in lib/repo-hat.js (James: "learns as it works,
 * updating the .hat and .agent as models").
 *
 * Runs against the REAL jaaDB store, not a mock — the dedup path depends
 * on the store's own predicate matching (_matches' function branch, the
 * one that silently matched every row before its 2026 fix), and a mock
 * that reimplemented that would prove nothing about the real thing. Every
 * test scopes itself to a unique synthetic repoUuid and clears it in a
 * finally, so nothing leaks into the live store — the pollution class
 * cli/clear-idearium.js exists to clean up.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const M  = require(path.join(ROOT, 'lib', 'repo-hat-memory.js'));
const RH = require(path.join(ROOT, 'lib', 'repo-hat.js'));

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const REPOS = [];
function scratchRepo() { const r = `rhm-test-${Date.now()}-${REPOS.length}`; REPOS.push(r); return r; }

const INDEXED = {
  indexed: true, fileCount: 77, chunkCount: 412,
  languages: ['js (61)'], kinds: ['module (50)'], failedCount: 0,
};
const UNINDEXED = { indexed: false, fileCount: null, chunkCount: null, languages: [], kinds: [], failedCount: null };

function persona(repoUuid, index = INDEXED) {
  return RH.buildPersona({ repoName: 'scratch', repoUuid, compartmentId: 'cos.test', index });
}

async function run() {
  console.log('\ntest-repo-hat-memory\n');

  // ── Validation ──────────────────────────────────────────────────────────────
  {
    const R = scratchRepo();
    check('rejects an unknown kind',
      M.record(R, { kind: 'vibe', text: 'something' }).ok === false);
    check('rejects text under 3 chars',
      M.record(R, { kind: 'fact', text: 'ab' }).ok === false);
    check('rejects a missing repoUuid',
      M.record(null, { kind: 'fact', text: 'a real fact' }).ok === false);
    check('accepts all four real kinds',
      M.KINDS.every(k => M.record(R, { kind: k, text: `a real ${k} observation` }).ok));
  }

  // ── Dedup ───────────────────────────────────────────────────────────────────
  {
    const R = scratchRepo();
    const first = M.record(R, { kind: 'convention', text: 'routes live in the route table' });
    check('first sighting is not a dedup', first.ok && first.deduped === false);

    const again = M.record(R, { kind: 'convention', text: '  Routes   Live In The Route Table  ' });
    check('whitespace + case variant dedups onto the same row', again.deduped === true);
    check('dedup bumps occurrences rather than writing a second row',
      again.observation.occurrences === 2 && M.list(R).length === 1,
      `occurrences=${again.observation.occurrences} rows=${M.list(R).length}`);

    // Same text, different kind, is a genuinely different observation.
    M.record(R, { kind: 'pitfall', text: 'routes live in the route table' });
    check('same text under a different kind is NOT deduped', M.list(R).length === 2);
  }

  // ── Evidence upgrade ────────────────────────────────────────────────────────
  {
    const R = scratchRepo();
    M.record(R, { kind: 'fact', text: 'the atlas sits at the repo disk root' });
    const up = M.record(R, { kind: 'fact', text: 'the atlas sits at the repo disk root', evidence: 'repo/index.js:125' });
    check('a later sighting with evidence upgrades one recorded without it',
      up.observation.evidence === 'repo/index.js:125');

    const keep = M.record(R, { kind: 'fact', text: 'the atlas sits at the repo disk root', evidence: 'somewhere-else.js:1' });
    check('existing evidence is not overwritten by a later, different claim',
      keep.observation.evidence === 'repo/index.js:125');
  }

  // ── Persona composition ─────────────────────────────────────────────────────
  {
    const R = scratchRepo();
    const bare = persona(R);
    check('persona with nothing learned has no learned heading',
      !bare.includes('What you have learned'));
    check('personaBlock returns null (not an empty heading) when nothing is learned',
      M.personaBlock(R) === null);
    check('grounded facts are present regardless', bare.includes('files: 77'));

    M.record(R, { kind: 'convention', text: 'new routes go in the route table' });
    const learned = persona(R);
    check('a recorded observation appears in the persona',
      learned.includes('new routes go in the route table'));
    check('learned section is appended, grounded section survives',
      learned.includes('files: 77') && learned.includes('What you have learned'));
  }

  // ── Ordering: corrections outrank conclusions ───────────────────────────────
  {
    const R = scratchRepo();
    M.record(R, { kind: 'fact', text: 'zzz a plain fact' });
    M.record(R, { kind: 'convention', text: 'zzz a convention' });
    M.record(R, { kind: 'pitfall', text: 'zzz a pitfall' });
    M.record(R, { kind: 'correction', text: 'zzz james said otherwise', source: 'james' });
    const block = M.personaBlock(R);
    const order = ['correction', 'pitfall', 'convention', 'fact'].map(k => block.indexOf(`(${k})`));
    check('persona orders correction > pitfall > convention > fact',
      order.every((v, i) => v !== -1 && (i === 0 || v > order[i - 1])),
      JSON.stringify(order));
    check('persona states that a correction outranks a conclusion',
      block.includes('outranks anything you concluded yourself'));
    check('persona states the real files win over a stale observation',
      block.includes('the files win'));
  }

  // ── Recurrence beats recency within a kind ──────────────────────────────────
  {
    const R = scratchRepo();
    M.record(R, { kind: 'fact', text: 'seen once only' });
    for (let i = 0; i < 5; i++) M.record(R, { kind: 'fact', text: 'hit this repeatedly' });
    const block = M.personaBlock(R);
    check('a repeatedly-hit observation is listed before a one-off',
      block.indexOf('hit this repeatedly') < block.indexOf('seen once only'));
    check('recurrence count is shown to the agent', block.includes('[seen 5×]'));
  }

  // ── Persona cap ─────────────────────────────────────────────────────────────
  {
    const R = scratchRepo();
    const n = M.PERSONA_MAX + 6;
    for (let i = 0; i < n; i++) M.record(R, { kind: 'fact', text: `observation number ${i}` });
    const block = M.personaBlock(R);
    const listed = (block.match(/^- \(/gm) || []).length;
    check(`persona is capped at PERSONA_MAX (${M.PERSONA_MAX}) entries`, listed === M.PERSONA_MAX, `listed=${listed}`);
    check('capped persona reports the real total honestly, not the shown count',
      block.includes(`${n} observations`) && block.includes(`${M.PERSONA_MAX} shown`));
    check('everything is still queryable beyond the cap', M.list(R, { limit: 1000 }).length === n);
  }

  // ── The refresh-wipes-learning regression this design exists to prevent ─────
  {
    const R = scratchRepo();
    M.record(R, { kind: 'correction', text: 'do not assume the compartment id is the repo uuid', source: 'james' });
    // Rebuilding the persona from scratch is exactly what refreshRepoHatPersona()
    // does. If learning lived inside personaPrompt, this is where it would vanish.
    const beforeIdx = persona(R, UNINDEXED);
    const afterIdx  = persona(R, INDEXED);
    check('learning survives a persona rebuild against a changed index',
      beforeIdx.includes('do not assume the compartment id') &&
      afterIdx.includes('do not assume the compartment id'));
    check('the rebuild really did re-ground the facts',
      beforeIdx.includes('NOT been indexed') && afterIdx.includes('files: 77'));
  }

  // ── forget / clear ──────────────────────────────────────────────────────────
  {
    const R = scratchRepo();
    const a = M.record(R, { kind: 'fact', text: 'keep this one' });
    const b = M.record(R, { kind: 'fact', text: 'drop this one' });
    M.forget(b.observation.uuid);
    const left = M.list(R);
    check('forget removes exactly the named observation',
      left.length === 1 && left[0].uuid === a.observation.uuid);
    check('forget on an unknown uuid is refused, not silently ok',
      M.forget(null).ok === false);

    const cleared = M.clear(R);
    check('clear reports how many it removed', cleared.ok && cleared.cleared === 1);
    check('clear leaves nothing behind', M.list(R).length === 0);
  }

  // ── stats ───────────────────────────────────────────────────────────────────
  {
    const R = scratchRepo();
    M.record(R, { kind: 'fact', text: 'stat fact one' });
    M.record(R, { kind: 'fact', text: 'stat fact two' });
    M.record(R, { kind: 'correction', text: 'stat correction one' });
    const s = M.stats(R);
    check('stats counts per kind', s.total === 3 && s.byKind.fact === 2 && s.byKind.correction === 1);
    check('stats reports every kind, including empty ones as 0',
      M.KINDS.every(k => typeof s.byKind[k] === 'number'));
  }

  // ── learn() is wired and honest about the hat half ──────────────────────────
  {
    const R = scratchRepo();
    const r = RH.learn({ repo: { uuid: R, compartmentId: 'cos.test', name: 'scratch' }, repoDir: null,
                         kind: 'fact', text: 'learn() banks an observation with no hat forged' });
    check('learn() records even when no hat exists yet', r.ok === true);
    check('learn() reports hatUpdated:false with a real reason, not silence',
      r.hatUpdated === false && typeof r.reason === 'string' && r.reason.length > 10,
      JSON.stringify(r.reason));
    check('the banked observation is really in the store', M.list(R).length === 1);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  let leaked = 0;
  for (const r of REPOS) { M.clear(r); leaked += M.list(r).length; }
  check('every scratch repo cleaned up — no pollution left in the live store', leaked === 0, `leaked=${leaked}`);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

// jaaDB loads its tables asynchronously at require time; give it the same
// settle window intelligence/index.js's own init() uses before its first read.
setTimeout(() => { run(); }, 2500);
