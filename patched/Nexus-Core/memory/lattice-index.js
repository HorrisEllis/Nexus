// ═══════════════════════════════════════════════════
// NEXUS — Lattice Index (Full Lattice Persistence)
// memory/lattice-index.js
// UUID: nexus-memory-lattice-0000-4000-000000000002
//
// Bridges the ALKKernel causal graph and LatticeBridge
// entity index to persistent JaaDB storage.
//
// DESIGN:
//   The ALKKernel causal graph (foundation/kernel.js)
//   is in-memory only — it is lost on restart. The
//   LatticeBridge entity index (crystalball/lattice-bridge.js)
//   persists individual index entries to 'memory_index'
//   but does not rebuild itself on boot.
//
//   LatticeIndex solves both problems:
//
//   1. PERIODIC SNAPSHOT — every N events (default 500)
//      or on system.shutdown, the causal graph is
//      serialised to JaaDB 'event_log' as a special
//      lattice_snapshot record. On boot, the graph is
//      reconstructed from the snapshot + subsequent
//      event_log entries.
//
//   2. ENTITY INDEX REBUILD — on boot, replays
//      memory_index records to reconstruct the hot
//      in-memory entity index of LatticeBridge so MQL
//      Lane A is live immediately without waiting for
//      new events.
//
//   3. GRAPH QUERY CACHE — provides a cached traversal
//      layer over the kernel graph, adding:
//        - depth-limited ancestor/descendant queries
//        - entity-anchored multi-hop traversal
//        - persisted traversal results for repeat queries
//
// AXIOMS: §M1, §2.1, §2.2, §2.3 — state observable,
//          persisted, reconstructible from log.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('./jaa-db');

const SNAPSHOT_INTERVAL = 500;   // events between graph snapshots
const MAX_TRAVERSAL_CACHE = 256; // LRU cache entries for graph queries

class LatticeIndex {
  constructor({ jaaDB, nexusKernel, latticeBridge }) {
    this._jaa      = jaaDB;
    this._nk       = nexusKernel;
    this._lb       = latticeBridge;    // LatticeBridge instance (may be null pre-phase-2)
    this._eventCount = 0;
    this._traversalCache = new Map(); // queryKey → { result, ts }
    this._snapshotting   = false;
  }

  // ── Lifecycle ──────────────────────────────────────
  async attach() {
    // Rebuild entity index from persisted memory_index records
    await this._rebuildEntityIndex();

    // Rebuild causal graph from latest snapshot + subsequent events
    await this._rebuildCausalGraph();

    // Periodic snapshot trigger
    this._nk.on('**', () => {
      this._eventCount++;
      if (this._eventCount % SNAPSHOT_INTERVAL === 0) {
        this._snapshotGraph(); // non-blocking, errors logged
      }
    });

    // Explicit snapshot request (from CLI or automation)
    this._nk.on('lattice.snapshot.request', e => {
      this._snapshotGraph(e.id);
    });

    // Explicit traversal query
    this._nk.on('lattice.traverse.request', e => this._onTraverseRequest(e));

    // Graceful shutdown — final snapshot
    this._nk.on('system.shutdown', () => this._snapshotGraph());

    this._nk.emit('lattice_index.ready', {
      entityIndexSize:   this._lb ? this._lb._entityIdx?.size ?? 0 : 0,
      traversalCacheMax: MAX_TRAVERSAL_CACHE,
    });
  }

  // ── Entity index rebuild ───────────────────────────
  async _rebuildEntityIndex() {
    if (!this._lb) return;  // LatticeBridge not yet wired (pre-phase-2)

    try {
      const records = await this._jaa.query('memory_index', () => true, Infinity);
      let loaded = 0;

      for (const rec of records) {
        const { keyword, eventId } = rec;
        if (!keyword || !eventId) continue;

        // Rebuild in-memory entity index on LatticeBridge
        if (!this._lb._entityIdx.has(keyword)) {
          this._lb._entityIdx.set(keyword, new Set());
        }
        this._lb._entityIdx.get(keyword).add(eventId);

        // Rebuild type index
        if (rec.eventType) {
          if (!this._lb._typeIdx.has(rec.eventType)) {
            this._lb._typeIdx.set(rec.eventType, new Set());
          }
          this._lb._typeIdx.get(rec.eventType).add(eventId);
        }

        loaded++;
      }

      this._nk.emit('lattice_index.entity_rebuilt', { loaded });
    } catch (e) {
      this._nk.emit('lattice_index.error', {
        phase:   'entity_rebuild',
        error:   e.message,
        code:    'ENTITY_REBUILD_FAILED',
      });
    }
  }

  // ── Causal graph rebuild ───────────────────────────
  async _rebuildCausalGraph() {
    try {
      // Find the most recent snapshot
      const snapshots = await this._jaa.query('event_log',
        r => r.type === 'lattice.snapshot' && r.payload?.graph,
        1  // newest first due to JaaDB scan order
      );

      let snapshotTick = 0;
      let graphNodes   = {};

      if (snapshots.length) {
        const snap = snapshots[0];
        graphNodes   = snap.payload.graph ?? {};
        snapshotTick = snap.payload.tick   ?? 0;

        // Inject snapshot nodes into kernel causal graph
        this._injectGraphNodes(graphNodes);
      }

      // Replay events after the snapshot tick
      const subsequent = await this._jaa.query('event_log',
        r => (r.tick ?? 0) > snapshotTick && r.type !== 'lattice.snapshot',
        Infinity
      );

      // Sort ascending by tick (JaaDB returns newest-first)
      subsequent.sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

      let replayed = 0;
      for (const ev of subsequent) {
        this._injectSingleNode(ev);
        replayed++;
      }

      this._nk.emit('lattice_index.graph_rebuilt', {
        fromSnapshot:   snapshots.length > 0,
        snapshotTick,
        nodesRestored:  Object.keys(graphNodes).length,
        replayed,
      });
    } catch (e) {
      this._nk.emit('lattice_index.error', {
        phase: 'graph_rebuild',
        error: e.message,
        code:  'GRAPH_REBUILD_FAILED',
      });
    }
  }

  _injectGraphNodes(graphMap) {
    for (const [id, node] of Object.entries(graphMap)) {
      if (!this._nk._causalGraph.has(id)) {
        this._nk._causalGraph.set(id, {
          id:        node.id,
          type:      node.type,
          tick:      node.tick,
          causedBy:  node.causedBy,
          relatedTo: node.relatedTo ?? [],
          causes:    node.causes    ?? [],
        });
      }
    }
    // Re-link causes after bulk inject
    for (const [id, node] of this._nk._causalGraph) {
      if (node.causedBy && this._nk._causalGraph.has(node.causedBy)) {
        const parent = this._nk._causalGraph.get(node.causedBy);
        if (!parent.causes.includes(id)) parent.causes.push(id);
      }
    }
  }

  _injectSingleNode(ev) {
    if (!ev.id || this._nk._causalGraph.has(ev.id)) return;
    const node = {
      id:        ev.id,
      type:      ev.type,
      tick:      ev.tick,
      causedBy:  ev.causedBy ?? null,
      relatedTo: ev.relatedTo ?? [],
      causes:    [],
    };
    this._nk._causalGraph.set(ev.id, node);
    if (ev.causedBy && this._nk._causalGraph.has(ev.causedBy)) {
      this._nk._causalGraph.get(ev.causedBy).causes.push(ev.id);
    }
  }

  // ── Graph snapshot ─────────────────────────────────
  async _snapshotGraph(causedBy = null) {
    if (this._snapshotting) return;  // prevent concurrent snapshots
    this._snapshotting = true;

    try {
      const graph = {};
      for (const [id, node] of this._nk._causalGraph) {
        graph[id] = {
          id:        node.id,
          type:      node.type,
          tick:      node.tick,
          causedBy:  node.causedBy,
          relatedTo: node.relatedTo,
          causes:    node.causes,
        };
      }

      const snapRecord = {
        uuid:    uid(),
        type:    'lattice.snapshot',
        tick:    this._nk._ringBuffer.length > 0
          ? this._nk._ringBuffer[this._nk._ringBuffer.length - 1].tick
          : 0,
        payload: {
          graph,
          tick:        this._nk._ringBuffer.length,
          nodeCount:   Object.keys(graph).length,
          snapshotAt:  Date.now(),
        },
        wall:    Date.now(),
        causedBy,
      };

      await this._jaa.insert('event_log', snapRecord);

      this._nk.emit('lattice.snapshot.complete', {
        nodeCount:  Object.keys(graph).length,
        snapshotId: snapRecord.uuid,
      }, causedBy ? { causedBy } : {});

    } catch (e) {
      this._nk.emit('lattice_index.error', {
        phase: 'snapshot',
        error: e.message,
        code:  'SNAPSHOT_FAILED',
      });
    } finally {
      this._snapshotting = false;
    }
  }

  // ── Traversal query (with LRU cache) ──────────────
  _onTraverseRequest(event) {
    const { startId, direction = 'ancestors', depth = 5 } = event.payload ?? {};
    if (!startId) return;

    const cacheKey = `${direction}:${startId}:${depth}`;

    // Cache hit
    if (this._traversalCache.has(cacheKey)) {
      const cached = this._traversalCache.get(cacheKey);
      // 10 second TTL
      if (Date.now() - cached.ts < 10_000) {
        this._nk.emit('lattice.traverse.result', {
          requestId: event.id,
          startId,
          direction,
          depth,
          nodes:     cached.result,
          cached:    true,
        }, { causedBy: event.id });
        return;
      }
      this._traversalCache.delete(cacheKey);
    }

    // Run traversal
    let nodes;
    if (direction === 'ancestors') {
      nodes = this._nk.ancestors?.(startId, depth) ?? this._ancestors(startId, depth);
    } else {
      nodes = this._nk.descendants?.(startId, depth) ?? this._descendants(startId, depth);
    }

    // Cache result (LRU evict if full)
    if (this._traversalCache.size >= MAX_TRAVERSAL_CACHE) {
      const oldest = this._traversalCache.keys().next().value;
      this._traversalCache.delete(oldest);
    }
    this._traversalCache.set(cacheKey, { result: nodes, ts: Date.now() });

    this._nk.emit('lattice.traverse.result', {
      requestId: event.id,
      startId,
      direction,
      depth,
      nodes,
      cached:    false,
    }, { causedBy: event.id });
  }

  // Fallback traversal (if kernel doesn't expose ancestors/descendants)
  _ancestors(id, maxDepth) {
    const result = [];
    let current  = this._nk._causalGraph.get(id);
    let depth    = 0;
    while (current && depth < maxDepth) {
      result.push(current);
      current = current.causedBy
        ? this._nk._causalGraph.get(current.causedBy)
        : null;
      depth++;
    }
    return result;
  }

  _descendants(id, maxDepth) {
    const result = [];
    const queue  = [{ id, depth: 0 }];
    while (queue.length) {
      const { id: cur, depth } = queue.shift();
      if (depth > maxDepth) continue;
      const node = this._nk._causalGraph.get(cur);
      if (!node || depth > 0) { if (node) result.push(node); }
      if (node) {
        for (const child of node.causes ?? []) {
          queue.push({ id: child, depth: depth + 1 });
        }
      }
    }
    return result;
  }

  // ── Entity-anchored multi-hop traversal ────────────
  // Finds events related to a keyword and returns their
  // full causal neighbourhood (for MQL complex queries)
  async multiHopQuery(keyword, hopDepth = 2) {
    if (!this._lb) return [];

    const seedIds = this._lb.queryByKeyword(keyword, 20);
    const visited = new Set();
    const results = [];

    for (const id of seedIds) {
      if (visited.has(id)) continue;
      visited.add(id);

      const ancestors   = this._ancestors(id, hopDepth);
      const descendants = this._descendants(id, hopDepth);

      for (const node of [...ancestors, ...descendants]) {
        if (!visited.has(node.id)) {
          visited.add(node.id);
          results.push(node);
        }
      }
    }

    return results;
  }

  // ── Stats ──────────────────────────────────────────
  get stats() {
    return {
      graphNodes:        this._nk._causalGraph.size,
      traversalCached:   this._traversalCache.size,
      eventsSinceSnap:   this._eventCount % SNAPSHOT_INTERVAL,
      entityIndexSize:   this._lb?._entityIdx?.size ?? 0,
      typeIndexSize:     this._lb?._typeIdx?.size   ?? 0,
    };
  }
}

module.exports = { LatticeIndex };
