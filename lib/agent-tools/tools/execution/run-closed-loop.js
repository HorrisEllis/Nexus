'use strict';
/**
 * lib/agent-tools/tools/run-closed-loop.js — run_closed_loop tool
 * UUID: nexus-agent-tools-closed-loop-v1-0000-2026-0710-jamesbrooks-001
 * Map: _archive/superseded-docs-2026-08-09/NEXUS-CLOSED-LOOP-MAP-2026-07-10.md
 * (archived 2026-08-09 — superseded by the per-feature *-phasemap.spec convention; content preserved, not deleted, §0.3)
 *
 * §THE CLOSED LOOP — "import a spec → build a repository automatically →
 * chunk it → populate it." Every stage already existed as a real entry
 * point (verified against source in the map doc); nothing chained them.
 * This is the chain, as ONE copilot-callable action:
 *   1. create   → POST /api/spec-engine/specs        (spec → manifest)
 *   2. populate → POST /api/spec-engine/specs/:id/build, looped until
 *                 {done:true}  (WARP-backed chunk dispatch — the build
 *                 spine; each chunk verified on disk before contract close)
 *   3. repo     → POST /api/repos                     (repo from the spec)
 *   4. verify   → the execution pipeline is triggered separately via
 *                 run_pipeline once a .spec path exists on disk; this tool
 *                 reports the spec+repo so that hand-off is one more call,
 *                 rather than pretending to run a sandbox it has no path to.
 *
 * §HONEST BOUNDARIES — orchestrates real stages, reimplements none. A
 * stage failure stops the loop and returns WHERE it stopped with the real
 * error (§1.2), never a fabricated "done". The populate loop has a real
 * safety cap (matches the spec's ~9 sections + headroom), not an infinite
 * wait. WARP stays the build spine for populate — unchanged, just driven.
 */

const http = require('http');

const IDEARIUM_PORT = parseInt(process.env.IDEARIUM_PORT || '4800');

function _req(pathname, { method = 'GET', body = null, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    let data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: IDEARIUM_PORT, path: pathname, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
      timeout: timeoutMs,
    };
    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve({ ok: res.statusCode < 400, status: res.statusCode, body: JSON.parse(b) }); } catch (e) { resolve({ ok: false, error: `bad JSON: ${e.message}`, raw: b.slice(0, 200) }); } });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'idearium timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: `idearium unreachable: ${e.message}` }));
    if (data) req.write(data);
    req.end();
  });
}

module.exports = {
  name: 'run_closed_loop',
  description:
    'Import a spec and automatically build a repository from it: create the spec manifest, chunk it, and populate every chunk via the WARP build spine, then create a repo. ' +
    'Params: name (required unless repoUuid given), description (the spec intent), type (component|service|library, default component), agent (ollama default), ' +
    'repoUuid (optional — build INTO an existing repo, e.g. one just created by the Import Project screen, instead of starting from an empty spec). ' +
    'Returns the spec id, populate progress, and repo id. Use run_pipeline afterward to build→verify→promote from the spec path.',
  parameters: {
    type: 'object',
    properties: {
      name:        { type: 'string', description: 'Spec/repo name (required unless repoUuid given)' },
      description: { type: 'string', description: 'What the spec should build (the intent) — ignored when repoUuid is given, the imported repo IS the intent' },
      type:        { type: 'string', description: 'component | service | library (default component)' },
      agent:       { type: 'string', description: 'Build agent: ollama (default), chatgpt, claude, gemini, deepseek — passed through to spec-engine unchanged, not validated against a whitelist here (see spec-drift.js / provider-routing.js for what guardian actually accepts)' },
      repoUuid:    { type: 'string', description: 'Optional — an existing repo (e.g. from Import Project) to build against. When given, stage 1 resolves that repo\'s real specUuid instead of creating a new empty spec, and stage 3 is skipped (the build writes into the same repo, no duplicate created).' },
    },
    required: [],
  },
  execute: async ({ name, description = '', type = 'component', agent = 'ollama', repoUuid = null } = {}) => {
    // §FIX 2026-09-03 — James: "run_closed_loop creates a brand-new spec
    // from a name/description — it has no path for 'here's a repo I just
    // imported, build against that.'" Real, confirmed gap: stage 1 always
    // POSTed /api/spec-engine/specs (a fresh, empty manifest); nothing
    // let an already-imported repo (ui/import-project/, POST /api/repos/
    // import) become the thing being built. Fixed by branching stage 1:
    // repoUuid given -> resolve that repo's REAL specUuid (GET /api/
    // repos/:uuid -> repo.show, confirmed real route) and populate INTO
    // it. No repoUuid -> unchanged, original create-from-scratch path.
    if (!name && !repoUuid) return { error: 'name is required (or pass repoUuid to build into an already-imported repo)' };
    const trace = [];
    let specUuid;

    if (repoUuid) {
      // ── Stage 1 (existing-repo path) — resolve, don't create ──────────
      // §FIX 2026-09-03 — found by actually running this against a real
      // imported repo, not by reading the code: GET /api/repos/:uuid
      // ('repo.show', idearium/api/index.js:1010) returns { ok, repo:
      // {...} } — specUuid is nested under .repo, not top-level. First
      // version of this fix assumed the flat shape and failed on every
      // real repo despite the lookup itself succeeding.
      const repoLookup = await _req(`/api/repos/${repoUuid}`);
      if (!repoLookup.ok || !repoLookup.body?.repo?.specUuid) {
        return { error: `stage 1 (resolve existing repo) failed: repo ${repoUuid} not found or has no specUuid — ${repoLookup.error || JSON.stringify(repoLookup.body).slice(0, 120)}`, stage: 'resolve-repo' };
      }
      specUuid = repoLookup.body.repo.specUuid;
      trace.push({ stage: 'resolve-repo', ok: true, repoUuid, specUuid, fileCount: repoLookup.body.repo.fileCount, name: repoLookup.body.repo.name });
    } else {
      // ── Stage 1 (fresh path, unchanged) — create the spec manifest ────
      const created = await _req('/api/spec-engine/specs', { method: 'POST', body: { name, description: description || name, type, agent } });
      if (!created.ok || !created.body?.manifest?.uuid) {
        return { error: `stage 1 (create) failed: ${created.error || JSON.stringify(created.body).slice(0, 120)}`, stage: 'create' };
      }
      specUuid = created.body.manifest.uuid;
      trace.push({ stage: 'create', ok: true, specUuid });
    }

    // ── Stage 2: populate — drive speceng.build until done (WARP-backed) ──
    // Unchanged — works identically against a fresh specUuid or a
    // resolved-from-repo one; the build endpoint has no concept of where
    // its specUuid came from, by design (§HONEST BOUNDARIES above).
    let done = false, iterations = 0;
    const MAX = 200; // ~9 sections + generous headroom; real cap, not infinite
    while (!done && iterations < MAX) {
      iterations++;
      const built = await _req(`/api/spec-engine/specs/${specUuid}/build`, { method: 'POST', body: { agent } });
      if (!built.ok) {
        return { error: `stage 2 (populate) failed at chunk ${iterations}: ${built.error || JSON.stringify(built.body).slice(0, 120)}`, stage: 'populate', specUuid, trace };
      }
      if (built.body?.done) { done = true; break; }
      // brief yield so async (chatgpt/claude) chunks can settle between calls
      await new Promise((r) => setTimeout(r, 500));
    }
    trace.push({ stage: 'populate', ok: done, chunksDriven: iterations, cappedOut: !done });
    if (!done) {
      return { error: `stage 2 (populate) hit the safety cap after ${iterations} chunks — check chunk status`, stage: 'populate', specUuid, trace };
    }

    // ── Stage 3: create a repo, UNLESS one already exists (repoUuid path) ─
    // §FIX — building into an existing repo must not silently spawn a
    // second repo record pointing at the same (now-mutated) manifest.
    // RepoLayer.ingest()'s own dedup only catches an UNCHANGED rootHash
    // (checked, idearium/repo/index.js) — after populate() writes real
    // content the rootHash changes, so dedup would NOT catch this; the
    // repoUuid branch below is the real fix, not a reliance on dedup.
    let repoId = repoUuid || null;
    if (!repoUuid) {
      const repo = await _req('/api/repos', { method: 'POST', body: { name, specUuid, source: 'closed-loop' } });
      repoId = repo.body?.repo?.uuid || repo.body?.uuid || null;
      trace.push({ stage: 'repo', ok: repo.ok, repoId, note: repo.ok ? undefined : (repo.error || 'repo.ingest returned non-ok') });
    } else {
      trace.push({ stage: 'repo', ok: true, repoId, note: 'built into existing repo — no new repo record created, same repoUuid' });
    }

    return {
      ok: true,
      specUuid,
      repoId,
      builtFromExistingRepo: !!repoUuid,
      chunksPopulated: iterations,
      trace,
      next: `Spec ${specUuid} populated${repoId ? ` — repo ${repoId}${repoUuid ? ' (existing, built into)' : ' created'}` : ''}. Run run_pipeline with this spec's path to build→verify→promote.`,
    };
  },
};
