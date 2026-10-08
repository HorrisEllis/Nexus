/**
 * idearium/repo/thread.js — the thread: a spec's blocks ⇄ the phases planned from them ⇄ their runs ⇄ files and
 * changes (RS9, 0.49.0). A projection: it reads the .spec, the phasemaps, the run rows and the pending changes, and
 * stores nothing (§10.3 — the phases stay in their maps, the blocks in the spec).
 * UUID: nexus-idearium-repo-thread-v1-0000-2026-1005-jamesbrooks-001
 * Map: docs/2026-10-05-spec-workshop-rebuild-phasemap.spec (RS9_the_thread)
 *
 * James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected"
 *
 *   thread({ specPath, specText, maps:[{ path, text }], runs, pending, parsePhases, doc })
 *     → { spec:{ path, format, blocks:[{ id, label, kind, line, hash, phases:[keys], stale, planned }] },
 *         maps:[{ path, plannedAt, linked, specMoved }], phases:[{ key, map, title, status, blocks, unknownBlocks, link,
 *         stale:[block ids], specMoved, run, files, changes }], summary, problems }
 *
 * Stale: a map records each block's hash when it was planned (meta.block_hashes, written by spec-plan derivePlan); a
 * phase whose block's hash moved is stale for that block. A map with only spec_sha256 (planned before RS9) can say the
 * spec moved, not which block. A phase naming no block says "no link to its spec" — never guessed from its title.
 */

const _unq = (s) => String(s).trim().replace(/^['"]|['"]$/g, '');

/** the meta of a map: its spec, the whole spec's hash, each block's hash, when it was planned */
export function mapMetaOf(text) {
  const t = String(text || '');
  const spec = (t.match(/^\s{4}spec:\s*['"]?([^'"\n]+?)['"]?\s*$/m) || [])[1] || null;
  const specSha = (t.match(/^\s+spec_sha256:\s*([0-9a-f]{64})/m) || [])[1] || null;
  const plannedAt = (t.match(/^\s+planned_at:\s*(\S+)/m) || [])[1] || null;
  const hashes = {};
  const lines = t.split('\n');
  const i = lines.findIndex(l => /^\s+block_hashes:\s*$/.test(l));
  if (i !== -1) {
    const ind = lines[i].match(/^\s*/)[0].length;
    for (let k = i + 1; k < lines.length; k++) {
      const l = lines[k]; if (!l.trim()) continue;
      if (l.match(/^\s*/)[0].length <= ind) break;
      const m = l.match(/^\s*("(?:[^"\\]|\\.)*"|[^:]+):\s*([0-9a-f]{8,64})\s*$/);
      if (m) { let id = m[1].trim(); try { if (id.startsWith('"')) id = JSON.parse(id); } catch (_) { id = _unq(id); } hashes[id] = m[2]; }
    }
  }
  return { spec, specSha, plannedAt, blockHashes: hashes };
}

export function thread({ specPath, specText = '', maps = [], runs = [], pending = [], parsePhases, doc, sha }) {
  const problems = [];
  const d = doc.parse(specText, { path: specPath });
  const blocks = d.blocks.filter(b => b.kind !== 'preamble');
  const byId = new Map(blocks.map(b => [b.id, b]));
  const wholeSha = sha ? sha(specText) : null;
  const ours = maps.map(m => ({ ...m, meta: mapMetaOf(m.text) })).filter(m => m.meta.spec === specPath);
  const latestRun = (map, key) => runs.filter(r => r.map === map && r.phase === key).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null;
  const phases = [];
  const mapsOut = [];
  for (const m of ours) {
    let parsed = [];
    try { parsed = parsePhases(m.text, m.path) || []; } catch (e) { problems.push({ map: m.path, message: `could not read: ${e.message}` }); }
    const hasHashes = Object.keys(m.meta.blockHashes).length > 0;
    const specMoved = !!(m.meta.specSha && wholeSha && m.meta.specSha !== wholeSha);
    let linked = 0;
    for (const p of parsed) {
      const pb = (p.blocks || []).map(String);
      const known = pb.filter(b => byId.has(b)), unknown = pb.filter(b => !byId.has(b));
      if (known.length) linked++;
      const stale = hasHashes ? known.filter(b => m.meta.blockHashes[b] && !byId.get(b).hash.startsWith(m.meta.blockHashes[b])) : [];
      const run = latestRun(m.path, p.id);
      const files = [...new Set([...(p.files || []).map(f => String(f).split(/[\s(]/)[0]).filter(f => /[\w-]\.[\w]+$/.test(f)), ...((run && run.injects && run.injects.injected) || [])])];
      const changes = pending.filter(c => files.includes(c.path)).map(c => ({ inject: c.uuid || c.inject, path: c.path, status: c.status, op: c.op || 'write' }));
      phases.push({ key: p.id, map: m.path, title: p.title, status: p.status, line: p.line, blocks: pb, unknownBlocks: unknown,
        link: !pb.length ? 'none' : (known.length ? 'linked' : 'broken'), stale, specMoved: specMoved && !hasHashes,
        run: run ? { runId: run.runId, state: run.state, provider: run.provider || null, rung: run.rung || null, rungs: run.rungs || null, error: run.error || null, ts: run.ts || null } : null,
        files, changes });
    }
    mapsOut.push({ path: m.path, plannedAt: m.meta.plannedAt, phases: parsed.length, linked, specMoved, hashes: hasHashes });
  }
  const outBlocks = blocks.map(b => {
    const ps = phases.filter(p => p.blocks.includes(b.id));
    return { id: b.id, label: b.label, kind: b.kind, line: b.line, hash: b.hash, marked: b.marked, bookkeeping: doc.isBookkeeping(b),
      phases: ps.map(p => p.key), planned: ps.length > 0, stale: ps.some(p => p.stale.includes(b.id)),
      done: ps.length > 0 && ps.every(p => p.status === 'done' || p.status === 'complete') };
  });
  const work = outBlocks.filter(b => !b.bookkeeping);   // meta, history, notes … are edited, not built
  const summary = {
    blocks: work.length, planned: work.filter(b => b.planned).length, unplanned: work.filter(b => !b.planned).length,
    staleBlocks: work.filter(b => b.stale).length, phases: phases.length,
    linked: phases.filter(p => p.link === 'linked').length, unlinked: phases.filter(p => p.link === 'none').length,
    broken: phases.filter(p => p.link === 'broken').length, stalePhases: phases.filter(p => p.stale.length || p.specMoved).length,
    maps: mapsOut.length,
  };
  return { spec: { path: specPath, format: d.format, blocks: outBlocks, problems: d.problems }, maps: mapsOut, phases, summary, problems };
}
