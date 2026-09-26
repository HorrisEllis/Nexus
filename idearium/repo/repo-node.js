/**
 * idearium/repo/repo-node.js — writes the ONE canonical `.repository`
 * node per repo (nexus-repository-system.spec §3: "A repository is a
 * first-class node. Repository UUID is logical identity.").
 *
 * §QUICKEST-PATH 2026-09-16 — this is the smallest real piece that
 * closes the spec's biggest actual gap: a repo's state (identity,
 * source hash, counts, verification result) was scattered across
 * idearium/repo/repos/<uuid>/{atlas.json, verification.json,
 * indexes/*.json, chunks/index.json} with nothing tying them together
 * into one addressable thing — so an agent had to already know that
 * internal layout, which is exactly what the spec's own purpose
 * section says should never be necessary. This node is that one
 * addressable thing. It does NOT attempt the rest of the spec — no
 * AST parsing, no hooks/wires graph, no L4-L8 verification tiers, no
 * snapshots, no .repository compartment/atlas/index config knobs. It
 * is a POINTER node, same discipline as `.chunk`'s relationship to its
 * own .md artifact: it records counts and real on-disk paths, never a
 * copy of atlas/chunk/index content.
 *
 * Deliberately no config layer (unlike chunk-nodes.js's chunking.*
 * knobs) — one fixed directory, data/nodes/repository, same
 * data/nodes/<type> convention every other node type already uses.
 * Add a config knob later if it's ever actually needed; inventing one
 * now would be scope this pass doesn't call for.
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as nodeExport from '../../lib/node-export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MODULE_ID = 'idearium-repo-node';

let _lastError = null;

function _nodesDir() {
  // §SANDBOX 2026-09-25 — was hardcoded, ignoring IDEARIUM_DATA_DIR: even an isolated test wrote here.
  return path.join(createRequire(import.meta.url)('../lib/data-dir.cjs').ideariumDataDir(), 'nodes', 'repository');
}

/**
 * toNodePayload(repo, pipelineResult, repoDir) — maps the real repo
 * record and the real runImportPipeline() result onto schema.repository's
 * fields. Nothing invented: a field the pipeline result doesn't carry
 * (e.g. verification on a run that never reached VERIFYING) is left
 * out, not defaulted to a fake value.
 */
export function toNodePayload(repo, pipelineResult, repoDir) {
  const r = pipelineResult;
  return {
    uuid: repo.uuid,
    name: repo.name,
    specUuid: repo.specUuid,
    rootHash: repo.rootHash || null,
    parent: repo.parent || null,
    state: r.state,
    fileCount: (r.atlas && r.atlas.fileCount) ?? (r.parse && r.parse.fileCount) ?? 0,
    byLanguage: (r.atlas && r.atlas.byLanguage) || null,
    failedCount: (r.atlas && r.atlas.failedCount) ?? null,
    chunkCount: (r.chunks && r.chunks.count) ?? null,
    symbolCount: (r.indexes && r.indexes.symbolCount) ?? null,
    verificationStatus: (r.verification && r.verification.status) || null,
    verificationLevel: (r.verification && r.verification.level) || null,
    paths: {
      atlas: path.join(repoDir, 'atlas.json'),
      chunks: r.chunks ? r.chunks.dir : path.join(repoDir, 'chunks'),
      indexes: path.join(repoDir, 'indexes'),
      verification: path.join(repoDir, 'verification.json'),
    },
    generatedAt: r.finishedAt || Date.now(),
  };
}

/**
 * writeRepositoryNode(repo, pipelineResult, repoDir) -> filePath | null.
 * Id is just the repo's own uuid — repos already have a real, stable,
 * globally-unique identity (idearium-repo-<8char>); unlike chunks there
 * is no filename-collision or truncated-uuid problem to design around
 * here, so no slug/composite id needed.
 */
export function writeRepositoryNode(repo, pipelineResult, repoDir) {
  if (!repo || !repo.uuid || !pipelineResult) return null;
  try {
    const dir = _nodesDir();
    fs.mkdirSync(dir, { recursive: true });
    const payload = toNodePayload(repo, pipelineResult, repoDir);
    const filePath = nodeExport.exportToFile(
      'repository',
      repo.uuid,
      payload,
      {
        context: `idearium repo ${repo.name}`,
        system: 'idearium',
        summary: `${payload.fileCount} files, ${payload.chunkCount ?? '?'} chunks, ${payload.state}`,
        tags: [
          `spec:${repo.specUuid}`,
          `state:${payload.state}`,
          ...(payload.verificationStatus ? [`verification:${payload.verificationStatus}`] : []),
        ],
      },
      dir
    );
    _lastError = null;
    return filePath;
  } catch (e) {
    if (_lastError !== e.message) {
      console.warn(`[${MODULE_ID}] repository node write failed (non-fatal, the repo itself is unaffected): ${e.message}`);
      _lastError = e.message;
    }
    return null;
  }
}
