/**
 * idearium/api/build-surface.js — the build surface's routes, behind idearium's router. §0.39.280 BS7.
 * UUID: nexus-idearium-api-build-surface-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-build-surface-phasemap.spec (BS7).
 *
 * idearium/api/index.js owns the routes (its route table and switch) and hands each call here with its own helpers
 * (`deps`), so this file holds the logic and nothing of the server:
 *   filesState      GET  /api/repos/:uuid/files/state          BS2 over the disk, the last version and the injects
 *   deviationGet    GET  /api/repos/:uuid/deviation            the newest record (+ history)
 *   deviationRecalc POST /api/repos/:uuid/deviation            recalculate now (reason 'asked')
 *   afterVersion / afterFileChange — the two automatic triggers (a version; a major file change), called by index.js
 *   environmentGet  GET  /api/repos/:uuid/environment          BS4 check + options catalogue + the repo's options
 *   environmentSet  POST /api/repos/:uuid/environment          save the repo's options (normalized, dropped keys named)
 *   environmentSetup POST /api/repos/:uuid/environment/setup   the VM setup job with the extras this repo needs
 *   specPlanGet     GET  /api/repos/:uuid/spec/plan?path=      the spec's phasemap: validated, ordered, next ready
 *   specPlan        POST /api/repos/:uuid/spec/plan            ask the repo's agent to write it (BS5); it always lands (W2):
 *                                                              the reply text, else derived from the spec; {derive:true} = now
 *   specBuild       POST /api/repos/:uuid/spec/build           build the next ready phase (or the one named)
 *   plan            GET  /api/repos/:uuid/plan[?map=]          BS6: steps, gates, ledgers
 *   manage          POST /api/repos/:uuid/manage               one file (or lines of it) handed to the agent (BS8)
 * Every result is { status, json } — index.js writes it.
 */
import path from 'path';

const DEV_TABLE = 'idearium_repo_deviation';
const _prevManifest = new Map();   // repoUuid → the manifest the last recalculation saw (major-change detection)
const _pendingCheck = new Map();   // repoUuid → timer (file changes in a burst are checked once)

const ok = (json) => ({ status: 200, json: { ok: true, data: json } });
const bad = (status, error, extra = {}) => ({ status, json: { ok: false, error, ...extra } });

function _repo(deps, uuid) {
  const repo = deps.getRepoLayer().get(uuid);
  if (!repo) return { error: bad(404, `repo not found: ${uuid}`) };
  const dir = deps.repoDir(uuid);
  if (!dir) return { error: bad(500, 'could not resolve repo directory') };
  return { repo, dir };
}

async function _manifest(repo, dir) {
  const { collectFiles } = await import('../repo/snapshot-files.js');
  const c = collectFiles(repo, dir, 64 * 1024 * 1024);
  return { entries: c.entries, skipped: c.skipped };
}

async function _snapshots(deps, uuid) {
  const { SNAPSHOT_SYSTEM, summarizeRepoSnapshots, snapshotBranch } = await import('../repo/snapshot.js');
  const h = await deps.versionium('GET', `/api/versionium/history?system=${encodeURIComponent(SNAPSHOT_SYSTEM)}&branch=${encodeURIComponent(snapshotBranch(uuid))}&n=1000`);
  if (!h.ok) return { error: h.error || 'versionium unreachable' };
  return { list: summarizeRepoSnapshots(h.data.commits || [], uuid) };   // newest first
}

async function _tree(deps, uuid, commitId) {
  if (!commitId) return null;
  const t = await deps.versionium('GET', `/api/versionium/files/tree?repository=${encodeURIComponent(uuid)}&commitId=${encodeURIComponent(commitId)}`);
  if (!t.ok || !t.data || !Array.isArray(t.data.files)) return { commitId, entries: null, error: t.error || 'no file layer' };
  return { commitId, entries: t.data.files };
}

// ── BS2 ──────────────────────────────────────────────────────────────────────
export async function filesState(deps, uuid) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const { fileStates } = await import('../repo/file-state.js');
  const man = await _manifest(r.repo, r.dir);
  const snaps = await _snapshots(deps, uuid);
  const last = snaps.list && snaps.list.find(s => s.files) || null;
  const version = last ? await _tree(deps, uuid, last.commitId) : null;
  let injects = [];
  try { injects = deps.RI().list(uuid, { limit: 1000 }); } catch (_) {}
  const out = fileStates({ disk: man.entries, version: version && version.entries ? version : null, injects });
  return ok({ repoUuid: uuid, ...out, versionNote: snaps.error ? `versionium: ${snaps.error} — every file shows as new` : !last ? 'no version yet — every file is new until the first snapshot' : version && !version.entries ? `version ${last.commitId} has no file layer (${version.error})` : null,
    skipped: man.skipped.slice(0, 20) });
}

// ── BS3 ──────────────────────────────────────────────────────────────────────
async function _recalc(deps, uuid, reason) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const { deviation } = await import('../repo/deviation.js');
  const man = await _manifest(r.repo, r.dir);
  const snaps = await _snapshots(deps, uuid);
  const list = (snaps.list || []).filter(s => s.files);
  const baseRow = list.length ? (list.slice().reverse().find(s => /^baseline:/.test(s.message || '')) || list[list.length - 1]) : null;
  const lastRow = list[0] || null;
  const baseline = baseRow ? await _tree(deps, uuid, baseRow.commitId) : null;
  const last = lastRow && lastRow !== baseRow ? await _tree(deps, uuid, lastRow.commitId) : baseline;
  const rec = deviation({ baseline: baseline && baseline.entries ? baseline : null, last: last && last.entries ? last : null, current: man.entries, reason });
  const row = { uuid: `dev-${uuid.slice(0, 8)}-${Date.now().toString(36)}`, repoUuid: uuid, ...rec, versionium: snaps.error || null, ts: rec.at };
  deps.appendRow(DEV_TABLE, row);
  _prevManifest.set(uuid, man.entries);
  deps.emit('idearium.repo.deviation', { repoUuid: uuid, reason, fromBaseline: rec.fromBaseline ? rec.fromBaseline.fraction : null, sinceVersion: rec.sinceVersion ? rec.sinceVersion.fraction : null });
  return ok(row);
}
export function deviationRecalc(deps, uuid) { return _recalc(deps, uuid, 'asked'); }
export async function deviationGet(deps, uuid, { history = 20 } = {}) {
  const rows = deps.loadTable(DEV_TABLE).filter(x => x.repoUuid === uuid).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!rows.length) return _recalc(deps, uuid, 'first-read');
  return ok({ ...rows[0], history: rows.slice(0, history).map(x => ({ ts: x.ts, reason: x.reason, fromBaseline: x.fromBaseline ? x.fromBaseline.fraction : null, sinceVersion: x.sinceVersion ? x.sinceVersion.fraction : null })) });
}
/** a version was taken: always recalculate */
export function afterVersion(deps, uuid) { return _recalc(deps, uuid, 'version').catch(() => null); }
/** files changed: recalculate only when the change since the last recalculation is major (checked once per burst) */
export function afterFileChange(deps, uuid, { delayMs = 1500 } = {}) {
  if (_pendingCheck.has(uuid)) return;
  _pendingCheck.set(uuid, setTimeout(async () => {
    _pendingCheck.delete(uuid);
    try {
      const r = _repo(deps, uuid); if (r.error) return;
      const { isMajor } = await import('../repo/deviation.js');
      const man = await _manifest(r.repo, r.dir);
      const prev = _prevManifest.get(uuid);
      if (!prev) { _prevManifest.set(uuid, man.entries); return; }   // first sight since start: this is the reference
      const th = { files: deps.config('repos.deviation_major_files'), fraction: deps.config('repos.deviation_major_fraction') };
      const m = isMajor(prev, man.entries, { files: Number(th.files) || undefined, fraction: Number(th.fraction) || undefined });
      if (m.major) await _recalc(deps, uuid, `major-change (${m.touched} files, ${(m.fraction * 100).toFixed(0)}%)`);
    } catch (_) {}
  }, delayMs));
}

// ── BS4 ──────────────────────────────────────────────────────────────────────
export async function environmentGet(deps, uuid) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const ENV = deps.require('../../cos/testenv/environment.js');
  let base = null;
  try { base = deps.require('../../cos/testenv/index.js').capabilities().vm; } catch (e) { base = { ok: false, reason: e.message }; }
  const options = (r.repo.environment && r.repo.environment.options) || {};
  const c = ENV.check(r.dir, { files: (r.repo.files || []).map(f => ({ path: f.path })), base, options });
  let job = null; try { job = deps.require('../../cos/testenv/setup-job.js').status(); } catch (_) {}
  return ok({ repoUuid: uuid, check: c, options, catalogue: ENV.options(), setup: job ? { state: job.state, startedAt: job.startedAt, endedAt: job.endedAt, last: (job.log || []).slice(-5) } : null });
}
export async function environmentSet(deps, uuid, body) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const ENV = deps.require('../../cos/testenv/environment.js');
  const n = ENV.normalize((body && body.options) || {});
  const prev = (r.repo.environment && r.repo.environment.options) || {};
  const u = deps.getRepoLayer().annotate(uuid, { environment: { options: n.options, updatedAt: Date.now(), previous: prev } });
  if (!u || u.error) return bad(500, `could not save: ${(u && u.error) || 'unknown'}`);
  deps.emit('idearium.repo.environment.options', { repoUuid: uuid, keys: Object.keys(n.options), dropped: n.dropped });
  return ok({ repoUuid: uuid, options: n.options, dropped: n.dropped });
}
export async function environmentSetup(deps, uuid) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const ENV = deps.require('../../cos/testenv/environment.js');
  const options = (r.repo.environment && r.repo.environment.options) || {};
  const c = ENV.check(r.dir, { files: null, options });
  const extras = [...new Set([...(c.vm.extras || []), ...(options.extras || []), ...(options.desktop ? ['desktop'] : [])])];
  const job = deps.require('../../cos/testenv/setup-job.js').start({ extras, node: options.node && options.node !== 'lts' ? options.node : null });
  deps.emit('idearium.repo.environment.setup', { repoUuid: uuid, extras, state: job.state });
  return ok({ repoUuid: uuid, extras, install: c.plan.install, job: { state: job.state, startedAt: job.startedAt } });
}

// ── BS5 / BS9 ────────────────────────────────────────────────────────────────
async function _specMap(deps, repo, dir, specPath) {
  const SP = await import('../repo/spec-plan.js');
  const mapPath = SP.phasemapPathFor(specPath);
  const read = deps.getRepoLayer().readTextFile(repo.uuid, mapPath);
  if (!read || read.error || typeof read.content !== 'string') return { SP, mapPath, exists: false };
  const v = SP.validatePlan(read.content, path.posix.basename(mapPath).replace(/\.spec$/, ''));
  return { SP, mapPath, exists: true, text: read.content, v };
}
export async function specPlanGet(deps, uuid, specPath) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  if (!specPath) return bad(400, 'path (the spec) is required');
  const m = await _specMap(deps, r.repo, r.dir, specPath);
  if (!m.exists) return ok({ repoUuid: uuid, spec: specPath, mapPath: m.mapPath, exists: false, layers: m.SP.LAYERS });
  const ordered = m.SP.orderPhases(m.v.phases);
  const next = m.SP.nextReady(m.v.phases);
  const spec = deps.getRepoLayer().readTextFile(uuid, specPath);
  const cur = spec && typeof spec.content === 'string' ? (await import('crypto')).createHash('sha256').update(spec.content).digest('hex') : null;
  return ok({ repoUuid: uuid, spec: specPath, mapPath: m.mapPath, exists: true, valid: m.v.ok, problems: m.v.problems, layers: m.SP.LAYERS,
    phases: ordered, next: next ? next.id : null, specChanged: m.v.meta.specSha256 && cur ? m.v.meta.specSha256 !== cur : null });
}
export async function specPlan(deps, uuid, body) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const specPath = body && body.path;
  if (!specPath) return bad(400, 'path (the spec) is required');
  const spec = deps.getRepoLayer().readTextFile(uuid, specPath);
  if (!spec || spec.error || typeof spec.content !== 'string') return bad(404, `no spec ${specPath} in this repo`);
  const m = await _specMap(deps, r.repo, r.dir, specPath);
  if (m.exists && !body.replan) return bad(409, `${m.mapPath} exists already — build from it, or ask again with replan:true (the old one is kept in versionium)`, { code: 'PLAN_EXISTS', mapPath: m.mapPath });
  // §0.39.284 W2 — {derive:true}: the plan from the spec's own sections, now, without the agent (CLI / API first)
  if (body.derive) {
    const d = await _landDerived(deps, r.repo, specPath, spec.content, m, 'asked for directly (derive:true)');
    if (!d.ok) return bad(422, d.error, { code: 'NOT_DERIVED', problems: d.problems || [] });
    return ok({ repoUuid: uuid, spec: specPath, mapPath: m.mapPath, state: 'replied', plannedBy: 'derived', phases: d.phases, snapshot: d.snapshot || null });
  }
  const p = m.SP.planPrompt({ repo: r.repo, specPath, specText: spec.content, mapPath: m.mapPath });
  const snap = await deps.snapshot(uuid, { message: `before planning ${specPath}`, causedBy: `idearium.spec.plan:${specPath}` });
  if (!snap.ok) return bad(snap.status === 409 ? 409 : 502, `not planned: the Versionium snapshot before it failed — ${snap.error}`, { code: 'NO_SNAPSHOT' });
  const runId = `plan-${Date.now().toString(36)}`;
  deps.appendRow('idearium_phase_runs', { uuid: `${runId}-started`, runId, repoUuid: uuid, targetRepo: uuid, map: m.mapPath, phase: 'PLAN', title: `plan ${specPath}`, state: 'building', snapshot: snap.data.commitId, spec: specPath, specSha256: p.specSha256, ts: Date.now() });
  deps.emit('idearium.repo.phase.run', { runId, repoUuid: uuid, map: m.mapPath, phase: 'PLAN', state: 'building', snapshot: snap.data.commitId });
  const RA = deps.require('../../lib/repo-agent.js');
  // §0.39.282 N22 — the shadow of a plan run: its phasemap must come back
  const SH = deps.require('../../lib/shadow.js');
  const shadow = SH.declare({ step: 'spec.plan', expects: { files: [m.mapPath] }, subject: { repoUuid: uuid, spec: specPath, runId } });
  Promise.resolve().then(() => RA.dispatch({ repo: r.repo, repoDir: r.dir, message: p.message, provider: body.provider || null, layer: deps.getRepoLayer() }))
    .then(async (res) => {
      let after = await _specMap(deps, r.repo, r.dir, specPath);
      // §0.39.284 W2 — the map lands even when the agent did not write it: from its reply text, else derived from the spec
      let plannedBy = after.exists && after.v.ok ? 'agent' : null, landNote = null;
      if (!plannedBy) {
        const land = await _landFallback(deps, r.repo, specPath, spec.content, m, after, res);
        plannedBy = land.plannedBy; landNote = land.note;
        after = await _specMap(deps, r.repo, r.dir, specPath);
      }
      if (res && res.ok && !(res.injects && res.injects.blocked)) SH.settle(shadow, { files: [...((res.injects && res.injects.injects) || []).map(i => i.path || i.file), ...(after.exists ? [m.mapPath] : [])].filter(Boolean) });
      else SH.drop(shadow);
      // §0.39.282 N21 — a reply blocked at its gate (a refusal) is 'blocked', never 'replied'
      const landed = after.exists && after.v.ok;
      const state = landed ? 'replied' : (res && res.ok ? (res.injects && res.injects.blocked ? 'blocked' : 'replied') : 'failed');
      deps.appendRow('idearium_phase_runs', { uuid: `${runId}-${state}`, runId, repoUuid: uuid, targetRepo: uuid, map: m.mapPath, phase: 'PLAN', state, snapshot: snap.data.commitId,
        plannedBy, note: landNote, phases: landed ? after.v.phases.length : 0,
        error: landed ? null : res && !res.ok ? String(res.error || 'agent failed').slice(0, 500) : (after.exists && !after.v.ok ? `the phasemap came back but is not valid: ${after.v.problems.slice(0, 3).join('; ')}` : (!after.exists ? `no ${m.mapPath} came back (it may be waiting for approval in the Agent tab)` : null)),
        injects: res && res.injects ? { injected: (res.injects.injects || []).map(i => i.path || i.file).filter(Boolean).slice(0, 50) } : null, reply: res && res.text ? String(res.text).slice(0, 4000) : null, ts: Date.now() });
      deps.emit('idearium.repo.phase.run', { runId, repoUuid: uuid, map: m.mapPath, phase: 'PLAN', state });
    })
    .catch((e) => { SH.drop(shadow); deps.appendRow('idearium_phase_runs', { uuid: `${runId}-failed`, runId, repoUuid: uuid, map: m.mapPath, phase: 'PLAN', state: 'failed', error: e.message, ts: Date.now() }); });
  return ok({ repoUuid: uuid, runId, spec: specPath, mapPath: m.mapPath, snapshot: snap.data.commitId, state: 'building', promptChars: p.message.length });
}
// §0.39.284 W2 — the fallbacks, in order: the agent's map from its reply text, then the plan derived from the spec.
// An invalid map the agent DID write is kept beside it (<map>.agent-draft.txt), never overwritten silently (§0.3).
async function _landFallback(deps, repo, specPath, specText, m, after, res) {
  const name = path.posix.basename(m.mapPath).replace(/\.spec$/, '');
  if (after.exists && !after.v.ok) {
    try { deps.getRepoLayer().writeTextFile(repo.uuid, m.mapPath.replace(/\.spec$/, '.agent-draft.txt'), after.text); } catch (_) {}
  }
  const fromReply = res && res.text ? m.SP.planFromReply(res.text, name) : null;
  if (fromReply) {
    const w = deps.getRepoLayer().writeTextFile(repo.uuid, m.mapPath, fromReply.text);
    if (w && !w.error) return { plannedBy: 'agent-reply', note: 'the agent wrote the map in its reply, not as the addressed file — taken from the reply' };
  }
  const why = !res || !res.ok ? `the agent failed (${String((res && res.error) || 'no reply').slice(0, 160)})`
    : after.exists ? `the agent's map was not valid (${after.v.problems.slice(0, 2).join('; ')}) — kept as ${m.mapPath.replace(/\.spec$/, '.agent-draft.txt')}`
    : 'the agent replied without a map';
  const d = await _landDerived(deps, repo, specPath, specText, m, why, { snapshot: false });
  return d.ok ? { plannedBy: 'derived', note: `${why}; the plan was derived from the spec's ${d.sections} section(s)` } : { plannedBy: null, note: `${why}; deriving failed: ${d.error}` };
}
async function _landDerived(deps, repo, specPath, specText, m, reason, { snapshot = true } = {}) {
  const d = m.SP.derivePlan({ specPath, specText, mapPath: m.mapPath, reason });
  if (!d.ok) return { ok: false, error: `the spec could not be planned from its sections: ${(d.problems || []).slice(0, 3).join('; ')}`, problems: d.problems };
  let snap = null;
  if (snapshot && m.exists) {
    const sn = await deps.snapshot(repo.uuid, { message: `before deriving the plan of ${specPath}`, causedBy: `idearium.spec.plan.derive:${specPath}` });
    if (!sn.ok) return { ok: false, error: `not written: the Versionium snapshot before it failed — ${sn.error}` };
    snap = sn.data.commitId;
  }
  const w = deps.getRepoLayer().writeTextFile(repo.uuid, m.mapPath, d.text);
  if (!w || w.error) return { ok: false, error: `could not write ${m.mapPath}: ${(w && w.error) || 'unknown'}` };
  deps.emit('idearium.repo.spec.planned', { repoUuid: repo.uuid, spec: specPath, map: m.mapPath, plannedBy: 'derived', phases: d.phases.length, reason });
  return { ok: true, phases: d.phases.length, sections: d.sections, snapshot: snap };
}
export async function specBuild(deps, uuid, body) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const specPath = body && body.path;
  if (!specPath) return bad(400, 'path (the spec) is required');
  const m = await _specMap(deps, r.repo, r.dir, specPath);
  if (!m.exists) return bad(409, `${specPath} has no phasemap yet — plan it first`, { code: 'NO_PLAN', mapPath: m.mapPath });
  if (!m.v.ok) return bad(422, `${m.mapPath} is not a valid bottom-up map: ${m.v.problems.slice(0, 3).join('; ')}`, { code: 'PLAN_INVALID', problems: m.v.problems });
  const target = body.phase ? m.v.phases.find(p => p.id === body.phase || p.key === body.phase) : m.SP.nextReady(m.v.phases);
  if (!target) return bad(409, body.phase ? `no phase ${body.phase} in ${m.mapPath}` : `nothing ready to build in ${m.mapPath} — every phase is done or waiting on one that is not`, { code: body.phase ? 'NOT_FOUND' : 'NOTHING_READY' });
  const b = await deps.phaseBuild(r.repo, r.dir, { map: m.mapPath, phase: target.id, provider: body.provider || null, note: body.note || '' });
  if (!b.ok) return bad(b.status, b.error, b.extra || {});
  return ok({ ...b.data, phase: target.id, layer: target.layer, mapPath: m.mapPath });
}

// ── BS6 / BS11 ───────────────────────────────────────────────────────────────
export async function plan(deps, uuid, { map = null } = {}) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const BP = await import('../repo/build-plan.js');
  const PH = await import('../repo/phases.js');
  const view = PH.managerView({ repo: r.repo, repoDir: r.dir, runs: [] });
  let phases = view.phases.filter(p => !map || p.map === map);
  // a spec's generated map carries layers: build order is its order (BS5); anything else keeps the manager's order
  const layered = {};
  if (map) {
    const read = deps.getRepoLayer().readTextFile(uuid, map);
    if (read && typeof read.content === 'string') {
      const SP = await import('../repo/spec-plan.js');
      const v = SP.validatePlan(read.content, path.posix.basename(map).replace(/\.spec$/, ''));
      for (const p of v.phases) layered[p.id] = p.layer;
      const order = SP.orderPhases(v.phases).map(p => p.id);
      phases = phases.slice().sort((a, b) => order.indexOf(a.phase_key) - order.indexOf(b.phase_key));
    }
  }
  phases = phases.map(p => ({ ...p, layer: layered[p.phase_key] || p.layer || null }));
  const runs = deps.phaseRuns(uuid);
  const out = BP.buildPlan({ phases, runs });
  const planning = runs.filter(x => x.phase === 'PLAN' && (!map || x.map === map)).slice(0, 5);
  return ok({ repoUuid: uuid, map, ...out, planning });
}

// ── BS8 ──────────────────────────────────────────────────────────────────────
export const MANAGE_ACTIONS = {
  expand:   'Expand it: add what the file is missing for its purpose (read its callers and spec first), keeping its style.',
  iterate:  'Iterate on it: the next improvement it most needs — correctness first, then clarity — and say why that one.',
  refactor: 'Refactor it: same behaviour, better structure. Keep every export and caller working; name what moved.',
  rebuild:  'Rebuild it from its purpose: what it must do (its spec, callers, tests), written anew in full. Nothing it does may be lost.',
  debug:    'Debug it: find the real fault (read the failing tests, logs, callers), fix the cause not the symptom, and prove it.',
  test:     'Write or extend its tests so every behaviour is proven — real inputs, no mocks of the thing under test.',
  document: 'Document it: its header (what, why, contract), and comments where the code is not obvious. No behaviour change.',
  explain:  'Explain it: what it does, how it connects (callers, dependencies), its risks. No changes.',
  review:   'Review it hostilely: bugs, edge cases, security, drift from its spec. List findings; change nothing unless asked.',
  optimize: 'Optimize it where it is measurably slow; name the benchmark (§17.11). No behaviour change.',
};
export async function manage(deps, uuid, body = {}) {
  const r = _repo(deps, uuid); if (r.error) return r.error;
  const file = body.path; const action = body.action;
  if (!file) return bad(400, 'path (the file) is required');
  if (!MANAGE_ACTIONS[action]) return bad(400, `action must be one of ${Object.keys(MANAGE_ACTIONS).join(', ')}`);
  const read = deps.getRepoLayer().readTextFile(uuid, file);
  if (!read || read.error || typeof read.content !== 'string') return bad(404, `no file ${file} in this repo`);
  const total = read.content.replace(/\n$/, '').split('\n').length;
  let from = parseInt(body.from, 10), to = parseInt(body.to, 10);
  const ranged = Number.isFinite(from) && from >= 1;
  if (ranged) { if (!Number.isFinite(to) || to < from) to = from; to = Math.min(to, total); from = Math.min(from, total); }
  const refs = Array.isArray(body.refs) ? body.refs.slice(0, 20).map(x => (typeof x === 'string' ? x : `${x.file || x.path}${x.line ? `:${x.line}` : ''}${x.name ? ` (${x.name})` : ''}`)).filter(Boolean) : [];
  const where = ranged ? `${file} lines ${from}–${to} (of ${total})` : `${file} (${total} lines)`;
  const message = [
    `Manage ONE file in ${r.repo.name}: ${where}.`,
    '',
    `${action.toUpperCase()}. ${MANAGE_ACTIONS[action]}`,
    ranged ? `Change only lines ${from}–${to} unless the change needs more; say if it does.` : '',
    body.note ? `\nFROM JAMES: ${String(body.note).slice(0, 2000)}` : '',
    refs.length ? `\nRELATED (from the Code tab search — read them with your tools):\n${refs.map(x => `  - ${x}`).join('\n')}` : '',
    '',
    `Full context is yours to fetch, not pasted: code_read ${file}${ranged ? ` (lines ${Math.max(1, from - 20)}–${Math.min(total, to + 20)})` : ''}, code_search / code_grep for callers and uses, code_chunk for its cards, nexus.context.tool for memory and history.`,
    ['explain', 'review'].includes(action) ? 'Reply in prose; write no files.' : `Write ${file} in full as one addressed code block (and any other file you must change) so it is captured and applied.`,
  ].filter(x => x !== '').join('\n');
  const snap = ['explain', 'review'].includes(action) ? { ok: true, data: { commitId: null } } : await deps.snapshot(uuid, { message: `before ${action} ${file}`, causedBy: `idearium.file.manage:${action}` });
  if (!snap.ok) return bad(snap.status === 409 ? 409 : 502, `not started: the Versionium snapshot before it failed — ${snap.error}`, { code: 'NO_SNAPSHOT' });
  const runId = `manage-${Date.now().toString(36)}`;
  const base = { runId, repoUuid: uuid, targetRepo: uuid, map: `file:${file}`, phase: action.toUpperCase(), title: `${action} ${where}` };
  // §0.39.282 N22 — the shadow: a writing action must bring ${file} back (written, staged or proposed). What does not come
  // back is an absence (lib/shadow.js → a gap + a liminal item), and the run reads 'incomplete', not 'replied'.
  const SH = deps.require('../../lib/shadow.js');
  const shadow = ['explain', 'review'].includes(action) ? null : SH.declare({ step: `manage.${action}`, expects: { files: [file] }, subject: { repoUuid: uuid, file, runId } });
  deps.appendRow('idearium_phase_runs', { uuid: `${runId}-started`, ...base, state: 'building', snapshot: snap.data.commitId, promptChars: message.length, ts: Date.now() });
  deps.emit('idearium.repo.file.manage', { ...base, state: 'building' });
  const RA = deps.require('../../lib/repo-agent.js');
  Promise.resolve().then(() => RA.dispatch({ repo: r.repo, repoDir: r.dir, message, provider: body.provider || null, layer: deps.getRepoLayer() }))
    .then((res) => {
      // §0.39.282 N21 — a reply blocked at its gate (a refusal) is 'blocked', never 'replied'
      let state = res && res.ok ? (res.injects && res.injects.blocked ? 'blocked' : 'replied') : 'failed';
      let absent = null;
      if (shadow) {
        if (state !== 'replied') SH.drop(shadow);
        else {
          const got = SH.settle(shadow, { files: ((res.injects && res.injects.injects) || []).map(i => i.path || i.file).filter(Boolean) });
          if (!got.ok) { state = 'incomplete'; absent = got.absent.files; }
        }
      }
      deps.appendRow('idearium_phase_runs', { uuid: `${runId}-${state}`, ...base, state, snapshot: snap.data.commitId, ...(absent ? { absent } : {}),
        error: res && !res.ok ? String(res.error || 'agent failed').slice(0, 500) : (absent ? `the reply did not bring back ${absent.join(', ')}` : null),
        injects: res && res.injects ? { injected: (res.injects.injects || []).map(i => i.path || i.file).filter(Boolean).slice(0, 50) } : null, reply: res && res.text ? String(res.text).slice(0, 4000) : null, ts: Date.now() });
      deps.emit('idearium.repo.file.manage', { ...base, state });
      // §0.39.282 N23 — an Ollama draft of a writing action is reviewed by a guardian agent (same as a phase build)
      if (shadow && typeof deps.reviewDraft === 'function')
        deps.reviewDraft({ r: res, state, absent, target: r.repo, base, commitId: snap.data.commitId, req: { message }, note: body.note || '', message })
          .catch(e => console.warn(`[idearium] draft review for ${runId} failed: ${e.message}`));
    })
    .catch((e) => { if (shadow) SH.drop(shadow); deps.appendRow('idearium_phase_runs', { uuid: `${runId}-failed`, ...base, state: 'failed', error: e.message, ts: Date.now() }); });
  return ok({ ...base, state: 'building', snapshot: snap.data.commitId, promptChars: message.length, message, ...(shadow ? { shadow: { id: shadow.id, expects: shadow.expects } } : {}) });
}
