/**
 * idearium/repo/lift-root.js — a project imported inside its own folder is lifted to the repo's root (0.60.206, SD22).
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec SD22_a_wrapped_repo_lifts_to_its_root
 *
 * James, 2026-10-22, two days on SP5: "im so sick of this phase, been stuck on 2 days. the file is in the directory already for the
 * phase, so what is broken?"
 *
 * What was broken: Looking Glass was imported before 0.60.200 stripped a zip's wrapper folder, so every file of it — lib/title.js,
 * tests/sp5-title.test.js, its phasemap — sits under looking-glass-bundle-v0_4/. The phase names lib/title.js; the build, the proof
 * and the agent all work at the repo's root, where that file is not. Each attempt wrote a second lib/title.js beside the real one.
 *
 *   planLift(paths) → { wrapper, moves:[{from,to}], collisions:[{path, archive}], why }   pure
 *     wrapper    the one top folder that holds the project: most of its files, a project marker at its own top (a phasemap,
 *                PHASEMAP.md, README.md, package.json, phases.json, a build file), and no marker at the repo's root. Else null, said why.
 *     moves      every file under it, one level up
 *     collisions a root file at a path a moved file will take (an agent's copy written at the root) — archived under
 *                .nexus/archive/lift-root/<time>/ before the move, never deleted (§0.3). The project's own file wins: it is the original.
 *   liftRoot(layer, repoUuid, { apply, now }) → the plan, and with apply the moves done (deferred, one refresh)
 */
export const MARKER_RE = /^(package\.json|PHASEMAP\.md|README\.md|ROADMAP\.md|phases\.json|roadmap\.json|[^/]*-phasemap\.spec|pyproject\.toml|go\.mod|Cargo\.toml|build\.gradle(\.kts)?|pom\.xml|Makefile)$/i;
const NEXUS_OWN = /^(\.nexus\/|proof\/PROOF-REPORT\.md$)/;   // what Nexus itself wrote at the root, never a project marker

export function planLift(paths = [], { now = Date.now() } = {}) {
  const files = [...new Set((paths || []).map(p => String(p || '').replace(/^\/+/, '')).filter(Boolean))];
  const own = files.filter(f => !NEXUS_OWN.test(f));
  const counts = {};
  for (const f of own) if (f.includes('/')) { const t = f.split('/')[0]; counts[t] = (counts[t] || 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return { wrapper: null, moves: [], collisions: [], why: 'every file is already at the repo\'s root' };
  const [w, n] = top;
  const share = n / (own.length || 1);
  const markersIn = own.filter(f => f.startsWith(`${w}/`) && f.split('/').length === 2 && MARKER_RE.test(f.split('/')[1]));
  const markersAtRoot = own.filter(f => !f.includes('/') && MARKER_RE.test(f));
  if (markersAtRoot.length) return { wrapper: null, moves: [], collisions: [], why: `the repo's root has its own project marker (${markersAtRoot.join(', ')}): the project is already at the root` };
  if (!markersIn.length) return { wrapper: null, moves: [], collisions: [], why: `${w}/ holds ${n} file(s) but no project marker at its top (a phasemap, PHASEMAP.md, README.md, package.json …): it is a folder of the project, not the project` };
  if (share < 0.5) return { wrapper: null, moves: [], collisions: [], why: `${w}/ holds ${n} of ${own.length} files — not most of them, so it is not the project's folder` };
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const moves = files.filter(f => f.startsWith(`${w}/`)).map(f => ({ from: f, to: f.slice(w.length + 1) }));
  const taken = new Set(files);
  const collisions = moves.filter(m => taken.has(m.to)).map(m => ({ path: m.to, archive: `.nexus/archive/lift-root/${stamp}/${m.to}` }));
  return { wrapper: w, moves, collisions, markers: markersIn, share: Math.round(share * 100) / 100, why: null };
}

export function liftRoot(layer, repoUuid, { apply = false, now = Date.now() } = {}) {
  const repo = layer.get(repoUuid);
  if (!repo) return { ok: false, error: `repo not found: ${repoUuid}` };
  const plan = planLift((repo.files || []).map(f => f.path || f), { now });
  if (!plan.wrapper || !apply) return { ok: true, applied: false, ...plan };
  const done = { archived: [], moved: [], failed: [] };
  for (const c of plan.collisions) {   // the root copy goes to the archive first, so the original can take its path
    const r = layer.moveFile(repoUuid, c.path, c.archive, { defer: true });
    if (r.ok) done.archived.push(c); else done.failed.push({ path: c.path, error: `not archived: ${r.error}` });
  }
  const blocked = new Set(done.failed.map(f => f.path));
  for (const m of plan.moves) {
    if (blocked.has(m.to)) { done.failed.push({ path: m.from, error: `${m.to} could not be archived, so it was not replaced` }); continue; }
    const r = layer.moveFile(repoUuid, m.from, m.to, { defer: true });
    if (r.ok) done.moved.push(m); else done.failed.push({ path: m.from, error: r.error });
  }
  try { layer.refresh(repoUuid); } catch (_) { /* the moves stand; the reindex is said by the refresh itself */ }
  return { ok: done.failed.length === 0, applied: true, ...plan, ...done };
}
