/**
 * idearium/lib/chunk-nodes.js — a real `.chunk` node per chunk.
 *
 * §BUILT 2026-09-15 — James: "chunks should be node types, .chunk, look
 * at the taxonomy."
 *
 * §WHY IT WAS MISSING, HONESTLY — the taxonomy had 36 slots and `chunk`
 * was not one of them, despite a chunk being by far the most-written
 * unit in idearium. It had everything a node type is supposed to be
 * grounded in: a real construction site (spec-engine/index.js's
 * _buildManifest/addChunk), a real lifecycle enum (CHUNK_STATES), a real
 * on-disk artifact (specs/<uuid>/NN-<sectionId>-<uuid8>.md), and real
 * verification (completeChunk's own §1.1 disk check). It was never
 * registered simply because the chunk was always reachable through its
 * manifest, so nothing forced the question. That is exactly the kind of
 * gap NODE-TAXONOMY.md's own reconciliation note describes — real,
 * obvious once looked for, invisible until asked.
 *
 * §WHAT THIS IS AND IS NOT — the `.md` artifact remains the chunk's
 * CONTENT and the manifest remains the chunk's OWNER. This node is the
 * chunk's IDENTITY AND LIFECYCLE RECORD: queryable by type and tag
 * across the whole tree through lib/node-export.js's queryDir() and
 * indexable through lib/node-index.js like every other node type,
 * without a reader needing to know which manifest a chunk belongs to or
 * having to load a whole spec to find out one chunk's state. It is not a
 * second copy of the content — `content` is deliberately NOT a field on
 * the node (see schema.chunk); contentHash is, so a node can be checked
 * against its artifact without duplicating it.
 *
 * §NON-FATAL BY DESIGN — every write here is wrapped and degrades loudly.
 * A chunk is real when its .md file is on disk and its manifest says so;
 * a failed node write costs queryability for that one chunk and must
 * never fail the build that produced it. Same discipline
 * guardian/lib/jobs.js's _persistJob() and lib/gap-field.js's report()
 * already use.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nodeExport = require('../../lib/node-export.js');
const core       = require('./config-core.cjs');

export const MODULE_ID = 'idearium-chunk-nodes';
export const VERSION = '1.0.0';

let _lastError = null;

/**
 * _slug(s) — same dotted-semantic-name grammar the rest of this
 * codebase's node files already use (idearium.cli.exec.capability,
 * schema.chunk, etc: <namespace>.<semantic>.<type>, type always last).
 * A bare uuid filename was the wrong convention — nothing else in
 * data/nodes/ is named that way, and a uuid tells a human nothing about
 * which project or file it is.
 */
function _slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
}

/**
 * chunkNodeId(chunk, specName, specUuid, repoUuid) -> "projectname.<repoUuid|specUuid>.uuid"
 * — the id exportToFile() turns into "<id>.chunk".
 *
 * §2026-09-16 STRUCTURAL — James: "projectname.repoid.uuid.chunk." The
 * quick version (specUuid standing in for repoid) is now the FALLBACK,
 * not the whole story: repoUuid is real, threaded down from
 * idearium/repo/index.js's own id through completeChunk()/failChunk()/
 * addChunk()/ingestFilesAsSpec() (all now take it as an optional param)
 * into writeChunkNode() here. Falls back to specUuid — not to a made-up
 * placeholder — when a chunk genuinely has no repo: cortex/core/raid's
 * contract-intake and lib/zip-ingest both call ingestFilesAsSpec() with
 * no repo layer involved at all, and that's a real, honest state (no
 * repo exists yet, or never will), not a gap to paper over.
 */
function chunkNodeId(chunk, specName, specUuid, repoUuid) {
  const project = _slug(specName || specUuid);
  return `${project}.${repoUuid || specUuid}.${chunk.uuid}`;
}

/** Live config read — same three layers as everything else. */
function _cfg() {
  let persisted = null;
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    const row = jaaDB.getById(core.TABLE, core.ROW_UUID);
    persisted = row && row.values;
  } catch (_) { /* store unreachable — defaults + file still apply */ }
  return core.resolveValues(persisted);
}

function _nodesDir(cfg) {
  const rel = (cfg && cfg.chunking && cfg.chunking.chunk_nodes_dir) || 'data/nodes/chunk';
  // §SANDBOX 2026-09-25 — 'data/…' now follows idearium's data dir (was always idearium/data, even in tests).
  return require('./data-dir.cjs').resolveIdeariumPath(rel);
}

/**
 * toNodePayload(chunk, specUuid) — the real chunk object mapped onto
 * schema.chunk's fields. Every value comes off the chunk as it actually
 * is; nothing is defaulted into existence. A field the chunk genuinely
 * does not have is null, not an invented placeholder — an `agent` of
 * null means nobody has been assigned, which is a real and different
 * statement from 'unknown'.
 */
export function toNodePayload(chunk, specUuid) {
  return {
    uuid: chunk.uuid,
    specUuid,
    sectionId: chunk.sectionId,
    sectionTitle: chunk.sectionTitle || null,
    chunkIdx: typeof chunk.chunkIdx === 'number' ? chunk.chunkIdx : -1,
    status: chunk.status,
    realPath: chunk.realPath || null,
    fileName: chunk.fileName || null,
    filePath: chunk.filePath || null,
    agent: chunk.agent || null,
    agentModel: chunk.agentModel || null,
    attempts: chunk.attempts || 0,
    failureMode: chunk.failureMode || null,
    byteSize: chunk.byteSize || 0,
    // Computed here, not stored on the chunk: the node's whole value is
    // being checkable against the artifact without holding a copy of it.
    contentHash: chunk.content
      ? crypto.createHash('sha256').update(String(chunk.content)).digest('hex')
      : null,
    createdAt: chunk.createdAt || null,
    updatedAt: chunk.updatedAt || null,
    completedAt: chunk.completedAt || null,
  };
}

/**
 * writeChunkNode(chunk, specUuid, { specName, force }) -> the file path
 * written, or null when the write was skipped or failed.
 *
 * Skipped (returns null, no error) when chunking.write_chunk_nodes is
 * off — a real configured choice, not a failure.
 *
 * §OVERWRITE IS CORRECT HERE — unlike most exportToFile() callers, a
 * chunk node is rewritten on every state transition, because the node
 * records a LIFECYCLE and a lifecycle that stopped updating at 'pending'
 * would be worse than absent: it would be confidently wrong. The
 * transition history itself is not lost — lib/node-index.js's per-type
 * ledger table (nodes_chunk_ledger) records every real change, which is
 * the mechanism built for exactly this.
 */
export function writeChunkNode(chunk, specUuid, { specName = null, force = false, repoUuid = null } = {}) {
  if (!chunk || !chunk.uuid || !specUuid) return null;

  const cfg = _cfg();
  if (!force && !cfg.chunking.write_chunk_nodes) return null;

  try {
    const dir = _nodesDir(cfg);
    const payload = toNodePayload(chunk, specUuid);
    const id = chunkNodeId(chunk, specName, specUuid, repoUuid);
    const filePath = nodeExport.exportToFile(
      'chunk',
      id,
      payload,
      {
        context: `idearium spec-engine chunk of spec ${specUuid}`,
        system: 'idearium',
        summary: `${chunk.sectionId} (${chunk.status})`,
        // Real, queryable tags: the spec it belongs to, its state, and
        // its section — the three things anyone actually filters chunks
        // by. specName is included when the caller has it, because
        // filtering by a uuid alone is not something a human does.
        // repo: added alongside spec: (not instead of) — a chunk still
        // belongs to its spec regardless of which repo, if any, wraps
        // it; only present when a real repoUuid was actually passed.
        tags: [
          `spec:${specUuid}`,
          `status:${chunk.status}`,
          `section:${chunk.sectionId}`,
          ...(specName ? [`specName:${String(specName).toLowerCase().replace(/\s+/g, '-')}`] : []),
          ...(chunk.agent ? [`agent:${chunk.agent}`] : []),
          ...(repoUuid ? [`repo:${repoUuid}`] : []),
        ],
      },
      dir
    );
    _lastError = null;
    return filePath;
  } catch (e) {
    // Loud once per distinct reason — a build of 20,000 chunks with a
    // broken node dir must not print 20,000 identical lines, but must
    // not be silent either.
    if (_lastError !== e.message) {
      console.warn(`[${MODULE_ID}] §1.2 chunk node write failed (non-fatal, the chunk itself is unaffected): ${e.message}`);
      _lastError = e.message;
    }
    return null;
  }
}

/**
 * writeManifestChunkNodes(manifest, { force, repoUuid }) -> { written, skipped, failed }.
 * Every chunk of one spec in a single pass — used at ingest, where
 * writing per-chunk through the normal path would mean re-reading config
 * once per file. repoUuid (optional) is forwarded to every chunk in the
 * pass unchanged — one manifest belongs to at most one repo at a time,
 * so there is no per-chunk repoUuid to vary here.
 */
export function writeManifestChunkNodes(manifest, { force = false, repoUuid = null } = {}) {
  if (!manifest || !Array.isArray(manifest.chunks)) return { written: 0, skipped: 0, failed: 0 };
  const cfg = _cfg();
  if (!force && !cfg.chunking.write_chunk_nodes) {
    return { written: 0, skipped: manifest.chunks.length, failed: 0 };
  }
  let written = 0, failed = 0;
  for (const chunk of manifest.chunks) {
    if (chunk.status === 'removed') continue; // §7.4 — soft-deleted, not part of the live node set
    const p = writeChunkNode(chunk, manifest.uuid, { specName: manifest.name, force: true, repoUuid });
    if (p) written++; else failed++;
  }
  if (written) console.log(`[${MODULE_ID}] wrote ${written} .chunk node(s) for spec ${String(manifest.uuid).slice(0, 8)}${failed ? ` (${failed} failed)` : ''}`);
  return { written, skipped: 0, failed };
}

/**
 * removeChunkNode(chunkUuid) — drops the node file for a chunk that was
 * genuinely removed. §7.4 nothing discarded applies to the chunk's own
 * .md artifact (which removeChunk() deliberately leaves on disk); the
 * NODE is an index entry, and an index entry for something no longer in
 * the manifest is just a lie with a timestamp.
 */
export function removeChunkNode(chunkUuid) {
  try {
    const dir = _nodesDir(_cfg());
    if (!fs.existsSync(dir)) return false;
    // The filename is projectname.specUuid.uuid.chunk, not <uuid>.chunk
    // — this caller only ever has the full chunkUuid (see removeChunk()'s
    // call site), and chunkNodeId() now always puts that same full uuid
    // as the id's own trailing segment, so matching the real, whole
    // value (not a truncated 8-char guess) finds the exact node.
    const match = fs.readdirSync(dir).find(f => f.endsWith(`.${chunkUuid}.chunk`));
    if (!match) return false;
    fs.unlinkSync(path.join(dir, match));
    return true;
  } catch (e) {
    console.warn(`[${MODULE_ID}] §1.2 chunk node removal failed for ${chunkUuid} (non-fatal): ${e.message}`);
    return false;
  }
}

/**
 * removeChunkNodes(chunkUuids) -> count — §0.39.266. removeChunkNode() for many at once, one directory
 * read. Used when a whole spec is purged: every nexus/core version wrote ~1,700 .chunk nodes and none
 * were ever removed.
 */
export function removeChunkNodes(chunkUuids) {
  const want = new Set((chunkUuids || []).filter(Boolean));
  if (!want.size) return 0;
  let n = 0;
  try {
    const dir = _nodesDir(_cfg());
    if (!fs.existsSync(dir)) return 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.chunk')) continue;
      const id = f.slice(0, -'.chunk'.length).split('.').pop();
      if (!want.has(id)) continue;
      try { fs.unlinkSync(path.join(dir, f)); n++; } catch (_) {}
    }
  } catch (e) { console.warn(`[${MODULE_ID}] §1.2 bulk chunk node removal failed (non-fatal): ${e.message}`); }
  return n;
}

/** listChunkNodes({ tags }) -> every real .chunk node, optionally tag-filtered. */
export function listChunkNodes({ tags } = {}) {
  try {
    return nodeExport.queryDir(_nodesDir(_cfg()), { type: 'chunk', tags });
  } catch (e) {
    console.warn(`[${MODULE_ID}] §1.2 chunk node query failed: ${e.message}`);
    return [];
  }
}

export default { writeChunkNode, writeManifestChunkNodes, removeChunkNode, listChunkNodes, toNodePayload, MODULE_ID, VERSION };
