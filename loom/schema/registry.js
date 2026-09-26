'use strict';
/**
 * loom/schema/registry.js — disk-first store for declared components,
 * seams, hooks, and wires.
 * comp_id: nexus.loom.registry
 * UUID: nexus-loom-registry-v1-0000-2026-0701-jamesbrooks-001
 *
 * AXIOMS §2.1 (Persistence Is the Golden Rule) / §2.2 (The Storage Device
 * Is the Source of Truth): every write goes to disk before this object's
 * in-memory state is considered authoritative. Load-on-construct,
 * write-on-every-mutation, matching idearium/repo/index.js's own
 * "old repos archived, not deleted" pattern — nothing here deletes,
 * it only appends and marks superseded.
 *
 * This is intentionally NOT a Warp Gate. Gates are pure per Warp's own
 * design law ("no side effects beyond emitting events"). Disk I/O is a
 * side effect. This class is the thing Gates' output gets handed to,
 * living in the driver layer, not inside core dispatch.
 */
const fs = require('fs');
const path = require('path');

const KINDS = ['component', 'seam', 'hook', 'wire', 'concern'];

class LoomRegistry {
  constructor({ dataDir = null } = {}) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    this.file = path.join(this.dataDir, 'registry.json');
    this._state = this._load();
  }

  // §PERF 0.39.260 — has()/get()/all() re-read the store before every read
  // (§FIX 2026-07-02 below: another process may have written it). That
  // re-read was a full JSON.parse of registry.json — 7 MB — per call, which
  // is most of loom/bootstrap.js's measured ~4 minutes (thousands of
  // declare() calls, each doing several has() checks). The re-read is kept;
  // only the parse is skipped when the file's mtime+size are unchanged since
  // this instance last read or wrote it, so another process's write is still
  // seen on the very next read.
  _stat() {
    try { const st = fs.statSync(this.file); return { mtimeMs: st.mtimeMs, size: st.size }; }
    catch (_) { return null; }
  }

  _load() {
    const st = this._stat();
    if (st && this._state && this._stamp && this._stamp.mtimeMs === st.mtimeMs && this._stamp.size === st.size) {
      return this._state;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const state = {};
      for (const k of KINDS) state[k] = raw[k] || {};
      this._stamp = st;
      return state;
    } catch (_) {
      const empty = {};
      for (const k of KINDS) empty[k] = {};
      this._stamp = null;
      return empty;
    }
  }

  _persist() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this._state, null, 2));
    this._stamp = this._stat();
  }

  /**
   * removeWhere(pred) — §0.39.260. The registry was add-only, so a record
   * for a file that was deleted, moved, or should never have been scanned
   * (an imported user project under idearium/repo/repos/) stayed forever,
   * and its hooks were reported as dangling on every boot. pred(kind,
   * record) -> true removes it. One persist for the whole batch. Returns
   * { component: n, hook: n, ... } counts.
   */
  removeWhere(pred) {
    this._state = this._load();
    const removed = {};
    for (const k of KINDS) {
      removed[k] = 0;
      for (const [id, rec] of Object.entries(this._state[k])) {
        if (pred(k, rec)) { delete this._state[k][id]; removed[k]++; }
      }
    }
    if (Object.values(removed).some(n => n > 0)) this._persist();
    return removed;
  }

  has(kind, id) {
    if (!KINDS.includes(kind)) throw new Error(`[loom/registry] unknown kind: ${kind}`);
    // §FIX 2026-07-02 — found by building loom/contracts/index.js: two
    // separate LoomDriver instances pointed at the same dataDir (exactly
    // what a real CLI process and a real API process are) could not see
    // each other's writes, because _state was loaded once at construct
    // time and never refreshed. That directly violates this file's own
    // header comment (§2.2 the storage device IS the source of truth —
    // not "was, at construction time"). Reread before every read op.
    // Writes still go through add() -> _persist() -> disk immediately,
    // unchanged; this only fixes the read side.
    this._state = this._load();
    return Object.prototype.hasOwnProperty.call(this._state[kind], id);
  }

  get(kind, id) {
    this._state = this._load();
    return this._state[kind][id] || null;
  }

  all(kind) {
    this._state = this._load();
    return { ...this._state[kind] };
  }

  /**
   * add — disk-first write. Returns the stored record. Throws if the
   * id already exists (callers should axiom-check has() first — this
   * is the enforcement backstop, not the primary gate).
   *
   * §WIRED 2026-07-19 — cortex-sync.js's record() existed, complete,
   * write-through to Cortex's real loom_events table via the same
   * lib/cortex-write.js every other durable system uses (guardian,
   * eravos, copilot, ollama) — and was never once called from here, the
   * only real mutation path this registry has. registry.json was the
   * only place any of this ever landed. Wired directly after the disk
   * write that was already the source of truth — cortex-sync's own
   * header already documents why this matters (durable history + CFR
   * replay, not registry.json's one-shot flat file) and that record()
   * is fire-and-forget/buffer-safe, so this cannot make add() itself
   * fail or block on Cortex being reachable.
   */
  add(kind, record) {
    if (!KINDS.includes(kind)) throw new Error(`[loom/registry] unknown kind: ${kind}`);
    if (this.has(kind, record.id)) {
      throw new Error(`[loom/registry] duplicate ${kind} id: ${record.id}`);
    }
    this._state[kind][record.id] = { ...record, registeredAt: Date.now() };
    this._persist();
    try { require('./cortex-sync').record('add', kind, this._state[kind][record.id]); } catch (_) {}
    return this._state[kind][record.id];
  }

  /** graph() — hook/wire adjacency, for Lattice L3's stated source
   *  (Architect's GET /api/hooks/graph does the same job for its own
   *  hooks; this is LOOM's equivalent once wires exist).
   *  §part_2 2026-07-10 — now carries the SEMANTIC layer: a wire's intent
   *  (WHY A connects to B) and a component's consumes/produces (what it
   *  depends on / offers). These pass through add() unchanged; graph()
   *  used to strip them. Without them the graph is topology only ("A->B");
   *  with them it answers context+intent ("A->B in order to persist state").
   */
  graph() {
    this._state = this._load();
    const nodes = Object.values(this._state.hook).map(h => ({
      id: h.id, component_id: h.component_id, type: h.type, direction: h.direction,
    }));
    const edges = Object.values(this._state.wire).map(w => ({
      from: w.from_hook_id, to: w.to_hook_id, id: w.id,
      intent: w.intent || null, // the WHY — was silently dropped before
    }));
    const components = Object.values(this._state.component).map(c => ({
      id: c.id, name: c.name || c.id,
      consumes: c.consumes || [], // what this component depends on
      produces: c.produces || [], // what it offers others
      // §SB1-EXT 2026-08-14 — dir/comp_status/comp_dependencies were being
      // WRITTEN correctly (declare() echoes {...event.data} back, and the
      // stored row genuinely has them — checked loom/data/registry.json
      // directly, they're really there) but this projection never
      // included them, so nothing that reads via graph() — including
      // lib/loom-map.js's own getMap(), used by this same session's
      // checkDependencyDrift() — could ever see them. Found by tracing
      // the read path all the way through instead of assuming a passing
      // write-side test meant the field was actually usable end to end.
      dir: c.dir || null,
      comp_status: c.comp_status || null,
      comp_dependencies: c.comp_dependencies || [],
    }));
    return { nodes, edges, components };
  }

  /** contextGraph() — the queryable context+intent view. Resolves wires to
   *  the components on each end (via each hook's component_id) so a relation
   *  reads "component A -> component B: <intent>", not just "hook -> hook".
   *  This is the non-linear system map: declared structure + why. */
  contextGraph() {
    this._state = this._load();
    const hookComp = {};
    for (const h of Object.values(this._state.hook)) hookComp[h.id] = h.component_id;
    const relations = Object.values(this._state.wire).map(w => ({
      from: hookComp[w.from_hook_id] || w.from_hook_id,
      to:   hookComp[w.to_hook_id]   || w.to_hook_id,
      fromHook: w.from_hook_id, toHook: w.to_hook_id,
      intent: w.intent || null,
      wireId: w.id,
    }));
    return {
      components: Object.values(this._state.component).map(c => ({
        id: c.id, name: c.name || c.id, consumes: c.consumes || [], produces: c.produces || [],
      })),
      relations,
    };
  }

  /** impactOf(componentId) — real impact analysis. "If this component's SEAM
   *  breaks, what depends on it and what intents fail downstream?" Walks the
   *  relation graph transitively from componentId, collecting every dependent
   *  and the intent of each broken link. This is what makes the registry a
   *  nervous system instead of a filing cabinet. */
  impactOf(componentId, maxDepth = 8) {
    const { relations } = this.contextGraph();
    // A wire from A's out-hook to B's in-hook means B DEPENDS ON A (A produces,
    // B consumes). So the dependents of componentId are the `to` ends of wires
    // whose `from` is componentId — i.e. who breaks if componentId stops.
    const dependents = new Map(); // componentId -> [{ dependsOn, intent, via }]
    const visited = new Set([componentId]);
    let frontier = [componentId];
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth++;
      const next = [];
      for (const source of frontier) {
        for (const r of relations) {
          if (r.from === source && !visited.has(r.to)) {
            if (!dependents.has(r.to)) dependents.set(r.to, []);
            dependents.get(r.to).push({ dependsOn: source, intent: r.intent, via: r.wireId });
            visited.add(r.to);
            next.push(r.to);
          }
        }
      }
      frontier = next;
    }
    return {
      component: componentId,
      directDependents: relations.filter(r => r.from === componentId).map(r => ({ component: r.to, intent: r.intent })),
      transitiveDependents: [...dependents.entries()].map(([id, links]) => ({ component: id, links })),
      brokenIntents: [...dependents.values()].flat().map(l => l.intent).filter(Boolean),
    };
  }
}

module.exports = { LoomRegistry, KINDS };
