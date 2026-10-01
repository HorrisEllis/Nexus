/**
 * idearium/spec-engine/index.js — Spec Compiler Engine
 * UUID: idearium-spec-engine-v1-0000-4000-0000-000000000001
 * Version: 1.1.0
 * Phase: 40 — Component Descriptor + Spec Chunk System
 * Seam ID: idearium.spec-engine:v1:p0001
 * Component: idearium.spec-engine
 *
 * §1.1 Nothing exists until proven — every chunk verified on disk before contract closed
 * §1.2 Nothing silently fails — every chunk state transition logged
 * §2.1 Disk before behavior — chunk file written before contract status updated
 * §2.2 Disk is source of truth — specs/<spec-uuid>/<chunk-uuid>.md
 * §3.1 Bottom-up — data (chunk files) before contracts before dispatch before UI
 * §5.1 UUID + seam_id + comp_id + contract_id on every chunk
 *
 * Each spec is split into sections. Each section is a chunk — a first-class
 * addressable unit with its own UUID, seam_id, comp_id, contract_id.
 * Like a torrent: independent pieces, tracked through the system.
 *
 * On disk layout:
 *   specs/<spec-uuid>/manifest.json       — spec metadata, chunk list
 *   specs/<spec-uuid>/<chunk-uuid>.md     — chunk content
 *   specs/<spec-uuid>/<spec-uuid>.spec    — full compiled spec (when complete)
 *   specs/<spec-uuid>.tar.gz              — compressed archive (when idle)
 *
 * Contract states per chunk: pending → building → verifying → complete | failed
 */

import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { getTemplate, listTemplates, readSeed } from './templates.js';
import { loadTable, syncTable, migrateOnce, jaaDB } from '../lib/db.js';
import { getValue as getConfigValue } from '../lib/config.js';
// §CHUNK-NODES 2026-09-15 — James: "chunks should be node types, .chunk,
// look at the taxonomy." Every real chunk state transition below now
// also writes a real .chunk node (lib/node-schemas/schema.chunk, type
// registered in lib/node-export.js's KNOWN_TYPES). Non-fatal by design:
// see idearium/lib/chunk-nodes.js's own header — a chunk is real when
// its .md artifact is on disk and the manifest says so; a failed node
// write costs queryability for that chunk, never the build.
import * as chunkNodes from '../lib/chunk-nodes.js';
// §BUILT 2026-09-03 — js-yaml is already a real root-workspace dependency
// (package.json's workspaces include 'idearium'; compiler-bridge.js in
// this same module already imports it, dynamically). Static import here —
// SPEC_SECTIONS is computed at module load, not inside an async function.
// §FIXED 2026-09-06 — James's own real boot log showed this crashing on
// every real npm install: "spec-engine load failed: The requested module
// 'js-yaml' does not provide an export named 'default'". Traced it for
// real, not guessed: root package.json declares "js-yaml": "^5.2.1"; that
// major version's real dist/js-yaml.mjs (confirmed by pulling the actual
// published tarball, not assumed) exports load/dump/etc. as named exports
// only — genuinely no default export at all, a real breaking change from
// 4.x. This session's own earlier testing used a borrowed js-yaml@4.3.0
// copy (the only one available in that sandbox), which still had a
// default — so `import yaml from 'js-yaml'` looked fine there and was
// never actually exercised against the real declared dependency version
// until this real log surfaced it. Named import, matching what 5.x
// actually exports.
import { load } from 'js-yaml';

const _require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODULE_ID   = 'idearium.spec-engine';
const VERSION     = '2.0.0';  // §MERGED 2026-07-11 — rootHash/boundary-engine/ingestFilesAsSpec
                               // (parallel branch) + templateIds[]/buildEngine/ideaUuid (this branch)
                               // reconciled into one mechanism. See CHANGES-2026-07-11-MERGE.md.
const COMP_ID     = 'idearium.spec-engine';
const SEAM_PREFIX = 'idearium.spec-engine:v1:chunk';

// ── Spec storage root ─────────────────────────────────────────────────────────
// §FIXED 2026-09-06 — same real fix as idearium/api/index.js and
// idearium/index.js's own IDEARIUM_DATA_DIR (see api/index.js's comment
// for the full finding). This was the third, separate hardcoded copy of
// the same path — the one that actually caught a leak during testing:
// fixing the other two alone still let one test-generated spec land in
// the real directory, traced directly to this line.
// §SANDBOX 2026-09-25 — idearium/lib/data-dir.cjs decides (test processes get a temp root).
const SPECS_ROOT = path.join(_require('../lib/data-dir.cjs').ideariumDataDir(), 'specs');

// ── Cortex mirror tables ──────────────────────────────────────────────────────
// §DB-MIGRATION 2026-07-15 — spec-engine was the one manifest store still on
// ad-hoc flat-file JSON while repo/index.js and idearium/index.js already run
// through cortex's shared jaaDB (see idearium/lib/db.js's own header). Disk
// stays the source of truth (§2.2 above is unchanged) — these tables are a
// queryable mirror, kept in sync on every saveSpec(), not a second store to
// reconcile by hand.
const MANIFEST_TABLE = 'idearium_spec_manifests';
const CHUNK_TABLE     = 'idearium_spec_chunks';

// §MEMORY 2026-09-21 — James: "idearium crashes when chunking, its not
// stable." Measured, not guessed: ingesting 120 files left 210 MB live AFTER a
// forced GC (17 MB at 20 files), growing with the square of the file count, so
// a 369-file project passes the 1 GB heap cap autopilot gives every child.
// Cause: saveSpec() mirrored the WHOLE manifest — every chunk's full `content`
// — into the shared store on every save, and did it twice (the manifest row
// carries chunks[].content, then the chunk table carries it again), each time
// via loadTable() + full-table JSON.stringify diff. Disk is the source of
// truth (§2.2; loadSpec reads manifest.json and the per-chunk .md files), and
// nothing reads content back out of these tables — the only other readers take
// uuid/specName/ts (nexus/autopilot.js's tail()) or nothing at all
// (idearium/lib/cortex-listeners.js). So the mirror now holds METADATA ONLY,
// and a save touches only the rows that changed.
const _slimChunk = (c, specUuid) => {
  const { content, ...rest } = c;
  return { ...rest, specUuid, contentBytes: content ? Buffer.byteLength(content) : 0 };
};
const _slimManifest = (m) => {
  const { chunks, ...rest } = m;
  return { ...rest, chunkCount: (chunks || []).length };
};
// uuid -> JSON of the last row written, so an unchanged chunk costs one string
// compare instead of a table scan + write. Process-local; a restart simply
// re-writes each row once (they are small now).
const _mirrorSig = new Map();
function _mirrorRow(table, row, ord) {
  const sig = JSON.stringify(row);
  if (_mirrorSig.get(table + row.uuid) === sig) return;
  // insert() keys on row.id and is a Map.set — an O(1) replace. upsert()
  // scans the whole table for the key, which would put the quadratic back.
  jaaDB.insert(table, { ...row, id: row.uuid, _ord: ord });
  _mirrorSig.set(table + row.uuid, sig);
}

// One-time, non-destructive fold of whatever's already on disk into cortex —
// same convention idearium/lib/db.js's migrateOnce() documents (never
// overwrites rows already in the DB, never touches the source files).
function _migrateManifestsOnce() {
  if (!fs.existsSync(SPECS_ROOT)) return;
  let dirs;
  try { dirs = fs.readdirSync(SPECS_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()); }
  catch (e) { console.error(`[${MODULE_ID}] manifest migration scan failed: ${e.message}`); return; }

  const legacy = [];
  for (const d of dirs) {
    const p = path.join(SPECS_ROOT, d.name, 'manifest.json');
    if (!fs.existsSync(p)) continue;
    try { legacy.push(JSON.parse(fs.readFileSync(p, 'utf8'))); }
    catch (e) { console.warn(`[${MODULE_ID}] skipping unreadable manifest ${d.name}: ${e.message}`); }
  }
  if (!legacy.length) return;

  const migManifests = migrateOnce(MANIFEST_TABLE, legacy.map(_slimManifest), 'uuid');
  if (migManifests.migrated) {
    console.log(`[${MODULE_ID}] migrated ${migManifests.count} manifests -> cortex '${MANIFEST_TABLE}'`);
  }
  const allChunks = legacy.flatMap(m => (m.chunks || []).map(c => _slimChunk(c, m.uuid)));
  const migChunks = migrateOnce(CHUNK_TABLE, allChunks, 'uuid');
  if (migChunks.migrated) {
    console.log(`[${MODULE_ID}] migrated ${migChunks.count} chunks -> cortex '${CHUNK_TABLE}'`);
  }
}
_migrateManifestsOnce(); // runs once at module load, mirrors repo/index.js's constructor-time _load()

// One-time slimming of rows written before the mirror went metadata-only:
// they still carry every chunk's content (5.4 MB each for the two tables on
// the reporter's machine) and idearium loads both on boot. Idempotent — a row
// with no `content` is already slim and is skipped, so this is a scan and no
// writes on every boot after the first.
function _slimExistingMirrorOnce() {
  try {
    let slimmed = 0;
    for (const r of loadTable(CHUNK_TABLE)) {
      if (!('content' in r)) continue;
      const { _ord, ...row } = r;
      jaaDB.insert(CHUNK_TABLE, { ..._slimChunk(row, row.specUuid), id: row.uuid, _ord });
      slimmed++;
    }
    for (const r of loadTable(MANIFEST_TABLE)) {
      if (!Array.isArray(r.chunks)) continue;
      const { _ord, ...row } = r;
      jaaDB.insert(MANIFEST_TABLE, { ..._slimManifest(row), id: row.uuid, _ord });
      slimmed++;
    }
    if (slimmed) console.log(`[${MODULE_ID}] slimmed ${slimmed} mirror row(s) — content lives on disk, not in the shared store`);
  } catch (e) { console.warn(`[${MODULE_ID}] mirror slimming skipped (non-fatal): ${e.message}`); }
}
_slimExistingMirrorOnce();

// §BUILT 2026-09-03 — James: "list of primitives... for the spec being
// made and use warps primitives." The real, current set — derived
// directly from warp/core's own real exports (Event, Gate, Axiom,
// Stream, StreamLog; GateFusion's fuseChain/canFuse are real too but are
// composition helpers, not primitives), the exact same filter
// cortex/core/raid/contract-intake.js's WARP_PRIMITIVES already computes
// for its own warpPrimitives validation. Computed independently HERE
// rather than imported from that RAID module — RAID stays untouched per
// "skip raid for now," and warp/core is this session's one shared,
// correct source for what a WARP primitive actually is, not RAID's
// business to own.
const WARP_PRIMITIVES = new Set(
  Object.keys(_require('../../warp/core')).filter(k => ['Event', 'Gate', 'Axiom', 'Stream', 'StreamLog'].includes(k))
);

// ── Standard spec sections (the seam boundaries) ─────────────────────────────
// Each section = one chunk = one SEAM contract = one file on disk.
//
// §BUILT 2026-09-03 — James: "using a yaml with block ids for each block.
// each block is a slot for the chunks." This was a hardcoded 10-entry JS
// array literal — the same 10 ids were ALSO independently hardcoded as the
// disk fileName pattern (`00-meta.md`) and as RepoLayer's sectionId match
// (idearium/repo/index.js's _resolveChunk). Three places agreeing by
// convention, not by declaration. Now declared once, in
// spec-engine/blocks.yaml, and loaded here — `id`/`title`/`desc` unchanged
// (every existing reader of SPEC_SECTIONS is unaffected), plus a new
// `agent` field per block: the default agent that section's chunk gets at
// creation (see _buildManifest below), never the only word on it —
// createSpec's `sectionAgents` overrides per-spec, setChunkAgent()
// overrides per-chunk any time before dispatch.
//
// §1.2 loud, not silent — a missing/malformed blocks.yaml is a hard error
// at module load, not a silent fallback to an empty section list; every
// spec ever created depends on this list being real.
function _loadBlocks() {
  const yamlPath = path.join(__dirname, 'blocks.yaml');
  let raw;
  try { raw = fs.readFileSync(yamlPath, 'utf8'); }
  catch (e) { throw new Error(`[${MODULE_ID}] blocks.yaml unreadable at ${yamlPath}: ${e.message}`); }
  let doc;
  try { doc = load(raw); }
  catch (e) { throw new Error(`[${MODULE_ID}] blocks.yaml failed to parse: ${e.message}`); }
  if (!doc || !Array.isArray(doc.blocks) || !doc.blocks.length) {
    throw new Error(`[${MODULE_ID}] blocks.yaml has no real 'blocks' array — cannot build specs without a section schema`);
  }
  for (const b of doc.blocks) {
    if (!b.id || !b.title) throw new Error(`[${MODULE_ID}] blocks.yaml has a block missing id/title: ${JSON.stringify(b)}`);
  }
  return doc.blocks.map(b => ({ id: b.id, title: b.title, desc: b.desc || '', agent: b.agent || null }));
}
export const SPEC_SECTIONS = _loadBlocks();

// ── Contract states ────────────────────────────────────────────────────────────
export const CHUNK_STATES = {
  PENDING:    'pending',    // created, not yet sent to agent
  BUILDING:   'building',   // dispatched to agent, waiting for response
  VERIFYING:  'verifying',  // agent responded, verifying content + writing to disk
  COMPLETE:   'complete',   // chunk file written to disk, artifact verified
  FAILED:     'failed',     // agent failed, retry available
  ESCALATED:  'escalated',  // too many failures, human review required
};

// ── Ensure spec storage exists ────────────────────────────────────────────────
function _ensureRoot() {
  fs.mkdirSync(SPECS_ROOT, { recursive: true });
}

// ── Dedup key for a spec (name + type hash) ───────────────────────────────────
function _specDedupKey(name, type = 'component') {
  return crypto.createHash('sha1')
    .update(`${name}::${type}`)
    .digest('hex').slice(0, 16);
}

// ── Create a new spec with all chunks initialized ─────────────────────────────
/**
 * _seedSectionsFromTemplate — deterministic, per-template seeding. Returns
 * a { sectionId: content } map (possibly empty). Three honest paths, not
 * blurred into one:
 *
 * (a) genesis (DSL, no other structural mapping) — the ONLY thing exactly
 *     and verifiably extractable is the header block: version, UUID, spine
 *     declaration, spine binding rule. That is a real `meta` section.
 *     §HONEST SCOPE 2026-07-09, unchanged: idearium's SPEC_SECTIONS are
 *     prose sections (meta/purpose/axioms/schema/api/events/integration/
 *     tests) while genesis.spec is a GRAMMAR (`spine WARP`, `bind
 *     kernel.boot -> Stream`). There is no structural mapping from the DSL
 *     to the other seven sections, and inventing one would fabricate
 *     content while claiming determinism. This path is untouched from the
 *     2026-07-09 version — same regexes, same output, same one-chunk scope.
 *
 * (b) the 2026-07-11 named-architecture templates (minimal-kernel,
 *     api-service, event-system, plugin-runtime, ai-agent-system) — each
 *     seedFile IS already-authored content for exactly the role its
 *     `seedSection` names (event-system.spec is a real event_model block,
 *     seeded into 'events'; api-service.spec is a real interfaces block,
 *     seeded into 'api'; etc — see templates.js's provenance comments).
 *     No field-extraction, no reinterpretation: the seed's raw text is the
 *     section's content, verbatim, same principle importSpec uses for a
 *     whole document. Honest because the content was chosen to already BE
 *     that section, not asked to become it.
 *
 * Returns null when nothing can be extracted/applies. A null seed means
 * "dispatch every chunk normally" — never a half-filled chunk presented as
 * complete.
 */
// §MERGED 2026-07-11 — a seed file can carry multiple `## SECTION: <id>`
// blocks, each seeding a different SPEC_SECTIONS id — see
// _seedSectionsFromTemplate below for the full three-convention story.
const SECTION_MARKER_RE = /^##\s*SECTION:\s*([a-z_]+)\s*$/gm;

function _seedSectionsFromTemplate(templateId, specName) {
  const seed = readSeed(templateId);
  const out = {};
  if (!seed) return out;
  const template = getTemplate(templateId);

  if (templateId === 'genesis') {
    const content = _seedMetaFromGenesis(seed, specName, templateId);
    if (content) out.meta = content;
    return out;
  }

  const validIds = new Set(SPEC_SECTIONS.map(s => s.id));
  const markers = [...seed.matchAll(SECTION_MARKER_RE)];
  if (markers.length) {
    for (let i = 0; i < markers.length; i++) {
      const id = markers[i][1];
      if (!validIds.has(id)) continue; // §1.2 — unknown marker ignored, not silently misfiled
      const start = markers[i].index + markers[i][0].length;
      const end   = i + 1 < markers.length ? markers[i + 1].index : seed.length;
      const body  = seed.slice(start, end).trim();
      if (!body) continue;
      out[id] = `Seeded deterministically from template \`${templateId}\` — no agent dispatched.\n\n${body}\n\n` +
                `> Source: idearium/spec-engine/templates/${templateId}.spec § ${id}`;
    }
    return out;
  }

  // Fallback: seedSection convention — whole file, one section, verbatim.
  const seedSection = template?.seedSection;
  if (seedSection && validIds.has(seedSection)) {
    const lines = [
      `Seeded deterministically from template \`${templateId}\` — no agent dispatched.`,
      ``,
      `> Source: idearium/spec-engine/templates/${template.seedFile}`,
      ``,
      `---`,
      ``,
      seed.trim(),
    ];
    out[seedSection] = lines.join('\n');
  }
  return out;
}

function _seedMetaFromGenesis(seed, specName, templateId) {
  const version = seed.match(/^version\s+(\S+)/m)?.[1];
  const uuid    = seed.match(/UUID:\s*(\S+)/)?.[1];
  const spine   = seed.match(/^spine\s+(\S+)/m)?.[1];
  const rule    = seed.match(/^spine\.rule\s*=\s*(\S+)/m)?.[1];
  const prims   = seed.match(/^spine\.primitives\s*=\s*(.+)$/m)?.[1]?.trim();

  // §1.1 — if the template's shape changed and nothing matched, say so by
  // returning null rather than emitting an empty section that looks built.
  if (!version && !uuid && !spine) return null;

  const lines = [
    `# Meta`,
    ``,
    `Seeded deterministically from template \`${templateId}\` — no agent dispatched.`,
    ``,
    `- **Name**: ${specName}`,
    version ? `- **Template version**: ${version}` : null,
    uuid    ? `- **Template UUID**: ${uuid}` : null,
    spine   ? `- **Spine**: ${spine}` : null,
    prims   ? `- **Spine primitives**: ${prims}` : null,
    rule    ? `- **Spine rule**: ${rule}` : null,
    ``,
    `> Source: idearium/spec-engine/templates/${templateId}.spec`,
  ].filter(Boolean);

  return lines.join('\n');
}

// §GENERALIZED 2026-07-10 — chunk/manifest construction pulled out of
// createSpec() so importSpec() can hand it a section list SHAPED BY THE
// SOURCE DOCUMENT instead of being forced through the fixed 10-entry
// SPEC_SECTIONS template. createSpec() below is now a thin wrapper that
// passes SPEC_SECTIONS as its default — behavior for existing callers is
// unchanged, byte for byte.
// §BUILT 2026-09-03 — `agent` default changed from 'ollama' to null. It
// used to be the ONLY agent value every chunk ever got (line below, was
// `agent: agent`). Now it's an explicit spec-wide OVERRIDE: null means
// "use each block's own default from blocks.yaml" (the routing table);
// a real value forces every chunk in this spec to that one agent,
// unchanged behavior for any existing caller that passes one. New
// `sectionAgents` ({ sectionId: agent }) is the third, most specific
// level — a per-block override for this one spec, e.g. from the UI
// before the first build call. Precedence:
//   sectionAgents[section.id]  >  agent (if explicitly given)  >  section.agent (blocks.yaml)  >  'ollama'
// §BUG FOUND BY TESTING 2026-09-03 — first version put section.agent
// ahead of the explicit `agent` override. Since blocks.yaml gives every
// block a real, non-null default, that meant an explicit
// createSpec({agent:'claude'}) call — the exact backward-compat contract
// this param exists to preserve — silently never forced anything; the
// yaml default always won instead. Caught by actually running
// createSpec({agent:'claude'}) and checking every chunk was 'claude': it
// wasn't. Fixed by moving the explicit override ahead of the table
// default — the table is what fills in the GAP when no explicit choice
// was made, not something an explicit choice has to fight past.
function _buildManifest({ name, type = 'component', description = '', agent = null, sectionAgents = {}, warpPrimitives = [], author = 'nexus', templateId = null, templateIds = null, sections = SPEC_SECTIONS, buildEngine = 'auto', ideaUuid = null, dependsOn = {} }) {
  _ensureRoot();
  if (!name) throw new Error('spec name required');
  // §BUILT 2026-09-03 — loud, not silent (§1.2): an unreal primitive name
  // in a manifest that's supposed to declare what WARP primitives this
  // component actually uses would be a lie recorded at creation time, not
  // caught later. Same real-set validation RAID's own warpPrimitives
  // check uses (contract-intake.js), computed independently above.
  if (warpPrimitives.length) {
    const bad = warpPrimitives.filter(p => !WARP_PRIMITIVES.has(p));
    if (bad.length) throw new Error(`warpPrimitives: not real WARP primitives — ${bad.join(', ')} (only ${[...WARP_PRIMITIVES].join(', ')} exist)`);
  }

  // §MERGED 2026-07-11 — two independent sessions extended createSpec
  // differently: this branch (single templateId, seedSection-based
  // single-section seeding) and a parallel one (templateIds[] array,
  // marker-based multi-section seeding, buildEngine selector, ideaUuid
  // linkage). Reconciled here rather than picking one — see
  // _seedSectionsFromTemplate below for how single-section and
  // marker-based templates now both work through one mechanism.
  const idList = (Array.isArray(templateIds) && templateIds.length) ? templateIds
               : (templateId ? [templateId] : []);
  const templates = idList.map(id => {
    const t = getTemplate(id);
    if (!t) throw new Error(`unknown templateId '${id}'. Known: ${listTemplates().map(x => x.id).join(', ')}`);
    return t;
  });
  const template = templates[0] || null; // primary — back-compat for type/single-template readers

  const VALID_ENGINES = ['auto', 'warp', 'direct'];
  if (!VALID_ENGINES.includes(buildEngine)) {
    throw new Error(`unknown buildEngine '${buildEngine}'. Known: ${VALID_ENGINES.join(', ')}`);
  }

  // §1.2 — an unknown templateId is an error, not a silent fallback to none.
  // A spec that claims a template it never used is a lie in its own manifest.
  if (template) type = template.kind;

  const specUuid  = crypto.randomUUID();
  const dedupKey  = _specDedupKey(name, type);

  // §PHASE 6 2026-07-10 — the dedupKey has been computed and stored on every
  // spec since day one and never read. Check it now: if a spec with the same
  // name+type already exists, surface it. Non-blocking — the user may want a
  // deliberate rebuild — but the caller now KNOWS, and can offer to reuse
  // instead of paying full tokens to rebuild something already built.
  const existing = findByDedupKey(name, type);

  const specDir   = path.join(SPECS_ROOT, specUuid);
  const now       = Date.now();

  fs.mkdirSync(specDir, { recursive: true });

  // Build chunk contracts — one per section, each a first-class addressable unit
  const chunks = sections.map((section, idx) => {
    const chunkUuid = crypto.randomUUID();
    return {
      uuid:        chunkUuid,
      specUuid,
      chunkIdx:    idx,
      sectionId:   section.id,
      sectionTitle:section.title,
      sectionDesc: section.desc,
      // §5.1 — every chunk has all four IDs
      comp_id:     COMP_ID,
      seam_id:     `${SEAM_PREFIX}:${specUuid.slice(0,8)}:${section.id}`,
      contract_id: `spec-contract:${specUuid.slice(0,8)}:${section.id}:${chunkUuid.slice(0,8)}`,
      // File on disk — §2.2 disk is source of truth
      filePath:    path.join(specDir, `${chunkUuid}.md`),
      fileName:    `${String(idx).padStart(2,'0')}-${section.id}.md`,
      // Contract state
      status:      CHUNK_STATES.PENDING,
      // §BUILT 2026-09-07 — James: "each chunk would be one component and
      // dependencies." Real infrastructure, same convention RAID's own
      // contract-intake.js already uses (dependsOn: array of real ids
      // this must wait on) — reused, not reinvented. Left empty by
      // default: which standard sections actually depend on which is a
      // real design decision, not guessed at here. opts.dependsOn lets
      // a caller set real edges per section when building a spec whose
      // sections genuinely need ordering (e.g. building something as
      // interconnected as nexus itself).
      dependsOn:   (dependsOn && dependsOn[section.id]) || [],
      // §BUILT 2026-09-03 — per-block routing. Most specific wins:
      // an explicit override for THIS section, then this section's own
      // blocks.yaml default, then a spec-wide forced agent, then ollama.
      // `section.agent` only exists for callers using the real
      // SPEC_SECTIONS default (blocks.yaml) — importSpec's own
      // source-shaped sections have no .agent, so this falls through to
      // `agent`/'ollama' exactly as before for that caller, unaffected.
      // §CHANGED 2026-09-03 — James: "set default to chatgpt, fallback
      // gemini." Was 'ollama'. This tail only fires when nothing more
      // specific said otherwise (sectionAgents override, explicit spec-
      // wide agent, or blocks.yaml's own per-block default) — in
      // practice that's importSpec/ingestFilesAsSpec, whose sections
      // carry no .agent of their own. The real chatgpt→gemini fallback
      // ON DISPATCH FAILURE lives in chunk-dispatch.js (dispatchChunkWithVerification's
      // fallbackAgent), not here — this is just which agent gets tried first.
      agent:       sectionAgents[section.id] || agent || section.agent || 'chatgpt',
      agentModel:  null,         // which model was used
      attempts:    0,
      failureMode: null,
      content:     null,         // filled when COMPLETE
      byteSize:    0,
      createdAt:   now,
      updatedAt:   now,
      completedAt: null,
      tags:        [section.id, type, name.toLowerCase().replace(/\s+/g,'-')],
    };
  });

  const manifest = {
    uuid:        specUuid,
    dedupKey,
    name,
    type,
    description,
    author,
    version:     '0.1.0',
    phase:       '40',
    status:      'building',    // pending | building | complete | archived
    // §BUILT 2026-09-03 — `agent` param is now nullable (see _buildManifest
    // header). manifest.agent stays a real, honest string either way:
    // the forced spec-wide agent if one was given, or 'auto' meaning
    // "each chunk carries its own agent from blocks.yaml/sectionAgents" —
    // never a bare null sitting in a field every other reader (speceng.build's
    // fallback chain, the UI's spec-list agent column) expects to be a string.
    agent: agent || 'auto',
    agentPriority: ['ollama', 'chatgpt', 'claude'],  // LAW_I: local first
    buildEngine,                 // auto | warp | direct — §MERGED
    // §MERGED 2026-07-11 — ideaUuid closes the gap where the promote path
    // reads manifest.ideaUuid but nothing used to write it.
    ideaUuid,
    totalChunks: chunks.length,
    doneChunks:  0,
    failedChunks:0,
    progress:    0,
    createdAt:   now,
    updatedAt:   now,
    completedAt: null,
    archivePath: null,          // set when compressed
    // §PROVENANCE 2026-07-09 — which template seeded this spec, and exactly
    // which sections were filled without an agent. A manifest that cannot say
    // where its content came from cannot be audited, and "deterministic" then
    // becomes a claim rather than a record.
    templateId:     template ? template.id : null,   // primary (back-compat single-field readers)
    templateIds:    templates.map(t => t.id),          // §MERGED — full composed set
    templateSeeded: [],
    // §PHASE 6 — non-null when a spec with the same name+type already existed.
    // The caller can offer reuse; this spec is still created (deliberate rebuild
    // is valid), but the redundancy is now visible instead of silent.
    duplicateOf:    existing ? existing.uuid : null,
    rootHash:       null,  // computed below, after chunks[] exists
    // §BUILT 2026-09-03 — which real WARP primitives (Event/Gate/Axiom/
    // Stream/StreamLog) this spec's component actually uses. Validated
    // above at creation; editable after via setWarpPrimitives (PENDING-
    // equivalent guard doesn't apply here — this is spec-level metadata,
    // not a chunk's dispatch state, so it stays editable any time).
    warpPrimitives,
    chunks,
  };
  manifest.rootHash = computeRootHash(manifest);

  // §2.1 — write manifest to disk before anything else
  const manifestPath = path.join(specDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // §SEEDED 2026-07-09, §MERGED 2026-07-11 — the template's deterministic
  // contribution, applied AFTER the manifest is on disk because
  // completeChunk() reloads the spec to recompute progress. Composes
  // across every selected template — first-listed template wins if two
  // templates both seed the same section. _seedSectionsFromTemplate
  // (below) handles BOTH template conventions that existed independently:
  // a single `seedSection` (whole seed file → one section, this branch's
  // original mechanism) and `## SECTION: <id>` markers (multi-section per
  // template, the parallel branch's mechanism) — whichever the template's
  // seed file actually uses.
  if (templates.length) {
    const seededMap = {}; // sectionId -> { content, fromTemplateId }
    for (const t of templates) {
      const perTemplate = _seedSectionsFromTemplate(t.id, name);
      for (const [sectionId, content] of Object.entries(perTemplate)) {
        if (seededMap[sectionId]) continue; // first pick wins
        seededMap[sectionId] = { content, fromTemplateId: t.id };
      }
    }
    const seededIds = Object.keys(seededMap);
    if (seededIds.length) {
      const actuallySeeded = [];
      for (const sectionId of seededIds) {
        const chunk = manifest.chunks.find(c => c.sectionId === sectionId);
        if (!chunk) continue;
        try {
          completeChunk(specUuid, chunk.uuid, seededMap[sectionId].content);
          actuallySeeded.push(sectionId);
        } catch (e) {
          // §1.2 — a failed seed degrades that one chunk to normal dispatch, loudly.
          console.warn(`[${MODULE_ID}] template seed failed for '${sectionId}', chunk stays PENDING: ${e.message}`);
        }
      }
      if (actuallySeeded.length) {
        // §BUG FIXED 2026-07-09 — provenance must be persisted on the fresh
        // on-disk manifest, not the stale in-memory object, or a seeded
        // chunk reports `agent: 'ollama'` for content no LLM ever touched.
        const fresh = loadSpec(specUuid);
        for (const sectionId of actuallySeeded) {
          const fm = fresh.chunks.find(c => c.sectionId === sectionId);
          if (fm) { fm.agent = 'template'; fm.agentModel = `template:${seededMap[sectionId].fromTemplateId}`; }
        }
        fresh.templateSeeded = actuallySeeded;
        saveSpec(fresh);
        console.log(`[${MODULE_ID}] seeded [${actuallySeeded.join(', ')}] from templates [${templates.map(t=>t.id).join(', ')}] — ` +
          `${actuallySeeded.length} of ${chunks.length} chunks need no agent`);
        return fresh;
      }
      return loadSpec(specUuid);
    }
    console.warn(`[${MODULE_ID}] templates [${templates.map(t=>t.id).join(', ')}] produced no deterministic seed — all ${chunks.length} chunks will dispatch`);
  }

  console.log(`[${MODULE_ID}] spec created: ${specUuid.slice(0,8)} "${name}" · ${chunks.length} chunks · agent:${manifest.agent}` +
    (manifest.agent === 'auto' ? ` (per-block: ${chunks.slice(0, 6).map(c => `${c.sectionId}→${c.agent}`).join(', ')}${chunks.length > 6 ? `, … +${chunks.length - 6} more` : ''})` : ''));
  return manifest;
}

// §BUILT 2026-09-03 — `agent` default is now null (see _buildManifest),
// not 'ollama' — an explicit createSpec({agent:'ollama'}) call still forces
// every chunk to ollama exactly as before; omitting it now means "read each
// block's own default from blocks.yaml" instead of silently meaning
// ollama-for-everything. `sectionAgents` is new and additive.
export function createSpec({ name, type = 'component', description = '', agent = null, sectionAgents = {}, warpPrimitives = [], author = 'nexus', templateId = null, templateIds = null, buildEngine = 'auto', ideaUuid = null, dependsOn = {} }) {
  return _buildManifest({ name, type, description, agent, sectionAgents, warpPrimitives, author, templateId, templateIds, sections: SPEC_SECTIONS, buildEngine, ideaUuid, dependsOn });
}

// §FILE-TREE-FIRST 2026-09-21 — James: "the file tree needs to be generated
// first with the list of files, the kernel, engine and runtime."
// A spec whose chunks ARE the project's files (from lib/file-tree-plan.js),
// not the 10 document sections. Built through the same _buildManifest every
// other spec uses; each chunk then carries realPath (so the build path's
// existing expectCode/extractCode switch applies and the repo materialises
// real files) and `file` {path, layer, purpose} for the file-aware prompt.
//
// Build order is bottom-up by construction, through the dependsOn gate the
// build already honours: every engine file waits on all kernel files, every
// runtime file on all engine files, tests on runtime. A layer with no files
// is skipped over, not waited on. Every file a
// COS template supplied are completed at creation — they cost no dispatch.
export function createFileTreeSpec({ name, description = '', plan, agent = null, author = 'nexus', ideaUuid = null, templateId = null } = {}) {
  if (!plan || !Array.isArray(plan.files) || !plan.files.length) throw new Error('createFileTreeSpec: plan.files is required and non-empty');
  const order = ['kernel', 'engine', 'runtime', 'test'];
  const files = [...plan.files];
  const slug = (p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'file';
  const used = new Set();
  const sid = (p) => { let id = slug(p), n = 2; while (used.has(id)) id = `${slug(p)}-${n++}`; used.add(id); return id; };
  const sections = [];
  for (const f of files) sections.push({ id: sid(f.path), title: f.path, desc: `${f.layer} · ${f.purpose || ''}`.trim(), _file: f });
  const byLayer = {};
  for (const sct of sections) (byLayer[sct._file.layer] = byLayer[sct._file.layer] || []).push(sct.id);
  const dependsOn = {};
  for (const sct of sections) {
    const li = order.indexOf(sct._file.layer);
    if (li <= 0) continue;
    for (let j = li - 1; j >= 0; j--) { if (byLayer[order[j]] && byLayer[order[j]].length) { dependsOn[sct.id] = [...byLayer[order[j]]]; break; } }
  }
  const manifest = _buildManifest({ name, type: 'filetree', description, agent, sectionAgents: {}, warpPrimitives: [], author, templateId: null, templateIds: null, sections, buildEngine: 'auto', ideaUuid, dependsOn });
  // dependsOn stays as SECTION ids — _chunkDependenciesSatisfied() resolves
  // edges by sectionId, the same key every other spec's edges use.
  const fileBySid = new Map(sections.map(x => [x.id, x._file]));
  for (const c of manifest.chunks) {
    const f = fileBySid.get(c.sectionId);
    c.realPath = f.path;
    c.file = { path: f.path, layer: f.layer, purpose: f.purpose || null, source: f.source || null };
  }
  // The plan is data on the manifest (and a .filetree node, written by the
  // caller) — never a markdown file in the project.
  manifest.fileTree = { planSource: plan.planSource || null, template: plan.template || null, templateId, layers: Object.fromEntries(order.map(l => [l, (byLayer[l] || []).length])),
    files: files.map(f => ({ path: f.path, layer: f.layer, purpose: f.purpose || null, source: f.source || null })), rejected: (plan.rejected || []).length };
  saveSpec(manifest);
  for (const c of manifest.chunks) {
    const f = fileBySid.get(c.sectionId);
    if (typeof f.content === 'string' && f.content.length) completeChunk(manifest.uuid, c.uuid, f.content, { preserveWhitespace: true });
    // §FIXED 2026-09-21 — a directory placeholder (.gitkeep / .keep) is empty by
    // definition, so no template ever supplies content for it and it stayed
    // PENDING: the build queue then asked ChatGPT to "write the complete file
    // storage/data/.gitkeep" (James's log), burning a dispatch, a retry ladder and
    // an escalation on a file whose whole purpose is to be empty. It needs no
    // agent; a one-line note keeps it non-empty for the chunk contract and is
    // harmless to git.
    else if (/(^|\/)\.(gitkeep|keep)$/i.test(String(f.path || ''))) {
      completeChunk(manifest.uuid, c.uuid, '# placeholder — keeps this directory in version control\n', { preserveWhitespace: true });
    }
  }
  return loadSpec(manifest.uuid);
}

// §BUILT 2026-09-03 — edit a spec's declared WARP primitives after
// creation. Same real validation as at creation time — a bad name is a
// loud error, never silently dropped or accepted.
export function setWarpPrimitives(specUuid, primitives) {
  if (!Array.isArray(primitives)) throw new Error('primitives must be an array');
  const bad = primitives.filter(p => !WARP_PRIMITIVES.has(p));
  if (bad.length) throw new Error(`warpPrimitives: not real WARP primitives — ${bad.join(', ')} (only ${[...WARP_PRIMITIVES].join(', ')} exist)`);
  const manifest = loadSpec(specUuid);
  manifest.warpPrimitives = primitives;
  manifest.updatedAt = Date.now();
  saveSpec(manifest);
  return manifest;
}

// ── Load spec manifest from disk ──────────────────────────────────────────────
export function loadSpec(specUuid) {
  const manifestPath = path.join(SPECS_ROOT, specUuid, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`spec ${specUuid} not found`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

// §0.39.265 — James: "its really unstable. idearium." loadSpec() parses the whole
// manifest, and a manifest carries every chunk's full content (nexus/core's is
// ~20 MB). RepoLayer._enrich() called it for EVERY repo on EVERY list — the
// library view, the 10-minute nexus-self sync, the build loop — so a plain repo
// list parsed tens of MB synchronously and /health stopped answering. The list
// needs chunk metadata, never content: loadSpecMeta() returns the manifest with
// chunk content stripped, cached against the manifest file's mtime+size (and
// dropped by saveSpec), so it is re-read only when the spec actually changed.
// READ-ONLY by contract — the object is shared between callers; anything that
// mutates and saves must use loadSpec().
const _metaCache = new Map();   // specUuid -> { mtimeMs, size, meta }
export function loadSpecMeta(specUuid) {
  const manifestPath = path.join(SPECS_ROOT, specUuid, 'manifest.json');
  let st;
  try { st = fs.statSync(manifestPath); } catch (_) { throw new Error(`spec ${specUuid} not found`); }
  const hit = _metaCache.get(specUuid);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.meta;
  const m = loadSpec(specUuid);
  const meta = { ...m, chunks: (m.chunks || []).map(({ content, ...c }) => c) };
  _metaCache.set(specUuid, { mtimeMs: st.mtimeMs, size: st.size, meta });
  return meta;
}

// §EXPORT 2026-07-18 — real reconstruction of the original .spec text, for
// export. For an IMPORTED spec this is byte-exact: strips the
// `<!-- imported: ... -->\n\n` tag importSpec() prepends to every chunk
// (see spec-engine's own byte-fidelity work) and concatenates in chunkIdx
// order — the same reconstruction importSpec() already verifies against
// the source at import time, run in reverse. For an agent-BUILT spec
// there's no "original" to recover — this still returns something real
// and useful (chunk content concatenated with section headers), just not
// a claim of exactness, since none was ever made for that path.
const _IMPORT_TAG_RE = /^<!-- imported[^>]*-->\n\n/;
export function reconstructSpecText(specUuid) {
  const manifest = loadSpec(specUuid);
  const chunks = manifest.chunks.slice().sort((a, b) => a.chunkIdx - b.chunkIdx);
  const wasImported = chunks.some(c => c.agent === 'import');
  if (wasImported) {
    return chunks.map(c => (c.content || '').replace(_IMPORT_TAG_RE, '')).join('');
  }
  return chunks.map(c => `# ${c.sectionTitle || c.sectionId}\n\n${c.content || ''}`).join('\n\n---\n\n');
}

// ── Save spec manifest to disk ────────────────────────────────────────────────
export function saveSpec(manifest) {
  const specDir = path.join(SPECS_ROOT, manifest.uuid);
  fs.mkdirSync(specDir, { recursive: true });
  manifest.updatedAt = Date.now();
  _metaCache.delete(manifest.uuid);   // loadSpecMeta re-reads it next time
  // §2.1 disk before behavior — the write cortex mirrors below can lag or
  // fail without losing anything; this line is the one that must not.
  fs.writeFileSync(path.join(specDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Cortex mirror — queryable index over the same manifest, not a second
  // source of truth (§2.2 unchanged: disk is still what loadSpec() reads).
  try {
    _mirrorRow(MANIFEST_TABLE, _slimManifest(manifest), 0);
    (manifest.chunks || []).forEach((c, i) => _mirrorRow(CHUNK_TABLE, _slimChunk(c, manifest.uuid), i));
  } catch (e) {
    // §1.2 loud, non-fatal — disk write above already succeeded.
    console.error(`[${MODULE_ID}] cortex mirror sync failed for ${manifest.uuid}: ${e.message}`);
  }
}

// ── List all specs ────────────────────────────────────────────────────────────
// §PERF 2026-09-21 — listSpecs() JSON.parse'd EVERY manifest (each carries every
// chunk's full content: 3.5 MB for one 369-file import) on every call, and it is
// called from the build-queue poller every 15 s, from GET /api/specs, from the
// boot reconcile and from repo lookups. Nothing in the summary changes unless the
// manifest file does, so the summary is cached against the manifest's mtime+size
// and only re-parsed when it moves. saveSpec() rewrites the file, which changes
// both, so a stale summary cannot be served.
const _summaryCache = new Map();   // dir name -> { mtimeMs, size, summary }
function _summarize(manifest) {
  return (
{
      uuid:        manifest.uuid,
      name:        manifest.name,
      type:        manifest.type,
      status:      manifest.status,
      progress:    manifest.progress,
      totalChunks: manifest.totalChunks,
      doneChunks:  manifest.doneChunks,
      agent:       manifest.agent,
      warpPrimitives: manifest.warpPrimitives || [],
      createdAt:   manifest.createdAt,
      updatedAt:   manifest.updatedAt,
      version:     manifest.version,
      deleted:     !!manifest.deleted,
      deletedAt:   manifest.deletedAt || null,
      // §NEW 2026-09-21 — true from creation until an ingest finishes. A spec still
      // flagged after a restart is an interrupted import (see ingestFilesAsSpec); the
      // build queue must never AI-"generate" its files.
      ingesting:   !!manifest.ingesting,
      // §0.39.265 — the document spec ↔ its generated code spec ("Generate code")
      codeSpecUuid: manifest.codeSpecUuid || null,
      codeFor:      manifest.codeFor || null,
      fileTree:     !!manifest.fileTree,
      // §2026-07-10 — lightweight per-section status for the UI's Spec Library
      // chips. Id/title/done only, NOT content: the list must stay small even
      // with many specs. The detail view loads full chunk content on demand.
      //
      // §BUG FOUND 2026-09-03 — this omitted chunk.uuid entirely. The new
      // per-chunk agent <select> (ui/js/app.js) calls
      // setChunkAgent(specUuid, c.uuid, agent) on change — with no uuid in
      // this list, that call was always setChunkAgent(specUuid, undefined,
      // agent), which fails on the very first real click ("chunk not
      // found"). Caught by tracing the data source, not by clicking it in
      // a browser (no live server here) — real gap either way, fixed at
      // the source rather than patched around in the UI. agent/jobId/
      // dispatchDir/dispatchedAt are the same story: all real scalars
      // (never chunk .content), needed for the UI to show what's
      // actually true instead of falling back to a default that isn't.
      chunks: (manifest.chunks || []).map(c => ({
        uuid: c.uuid, sectionId: c.sectionId, sectionTitle: c.sectionTitle,
        chunkIdx: c.chunkIdx, status: c.status, byteSize: c.byteSize || 0,
        agent: c.agent, agentModel: c.agentModel,
        jobId: c.jobId || null, dispatchDir: c.dispatchDir || null, dispatchedAt: c.dispatchedAt || null,
      })),
      totalBytes: (manifest.chunks || []).reduce((sum, c) => sum + (c.byteSize || 0), 0),
    }
  );
}

export function listSpecs({ includeDeleted = false } = {}) {
  _ensureRoot();
  const specs = [];
  const seen = new Set();
  for (const entry of fs.readdirSync(SPECS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    seen.add(entry.name);
    try {
      const mp = path.join(SPECS_ROOT, entry.name, 'manifest.json');
      const st = fs.statSync(mp);
      let hit = _summaryCache.get(entry.name);
      if (!hit || hit.mtimeMs !== st.mtimeMs || hit.size !== st.size) {
        hit = { mtimeMs: st.mtimeMs, size: st.size, summary: _summarize(loadSpec(entry.name)) };
        _summaryCache.set(entry.name, hit);
      }
      // §NEW 2026-07-16 — see deleteSpec() below. Soft-deleted specs stay on
      // disk (§7.4 nothing discarded) but drop out of the library by default.
      if (hit.summary.deleted && !includeDeleted) continue;
      specs.push(hit.summary);
    } catch (_) {}
  }
  for (const k of _summaryCache.keys()) if (!seen.has(k)) _summaryCache.delete(k);
  return specs.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ── Get next pending chunk for an agent ──────────────────────────────────────
// §BUILT 2026-09-07 — real dependency gate, same convention RAID's own
// contract-intake.js already uses (dependsOn arrays are the edges, the
// chunk list IS the graph — no separate structure invented).
function _chunkDependenciesSatisfied(chunk, allChunks) {
  if (!chunk.dependsOn || !chunk.dependsOn.length) return true;
  return chunk.dependsOn.every((depSectionId) => {
    const dep = allChunks.find((c) => c.sectionId === depSectionId);
    return dep && dep.status === CHUNK_STATES.COMPLETE;
  });
}

export function nextPendingChunk(specUuid) {
  const manifest = loadSpec(specUuid);
  // §FOUND & WIRED 2026-09-07 — a pending chunk whose real dependencies
  // haven't completed yet is skipped, not dispatched out of order. A
  // chunk with no dependsOn (the default, unchanged for every existing
  // spec) is always ready — this is purely additive, changes nothing
  // for a spec that never sets dependsOn.
  return manifest.chunks.find(c => c.status === CHUNK_STATES.PENDING && _chunkDependenciesSatisfied(c, manifest.chunks)) || null;
}

// ── Boot-time orphaned-chunk recovery ──────────────────────────────────────
// §FOUND & FIXED 2026-09-11 — James, live: "the problem is idearium
// doesn't retry, if nexus restarts it wont try to build the chunks
// again." Traced precisely, not guessed: nextPendingChunk() above only
// ever matches status === PENDING. A chunk transitions PENDING ->
// BUILDING the moment it's dispatched to an agent (line ~756) and stays
// BUILDING until either completeChunk() or failChunk() runs. If this
// process dies while a chunk is BUILDING — exactly the window any
// restart can land in — that chunk's status is written to disk as
// 'building' and stays there forever. Not PENDING (nextPendingChunk()
// never finds it again), not COMPLETE (manifest.doneChunks stays short
// of totalChunks forever too) — genuinely, permanently stuck either
// way, invisible to the real build-queue poller (idearium/api/index.js's
// _startBuildQueuePoller) regardless of how many times it ticks.
//
// This is the fix, not a guess at one: any chunk found BUILDING at the
// moment this function runs is provably orphaned, because a chunk can
// only legitimately be BUILDING while the process that dispatched it is
// still alive and this function only ever runs once, at boot, in a
// fresh process — there is no real in-flight dispatch this process
// could be racing against. Reset to PENDING (not FAILED — it never
// actually failed, its outcome is simply unknown, and PENDING is the
// state that makes the real poller pick it back up on its very next
// tick, same dispatch path, same WARP cache, no special-casing).
export function recoverOrphanedChunks() {
  const recovered = [];
  for (const s of listSpecs()) {
    if (s.deleted) continue;
    let manifest;
    try { manifest = loadSpec(s.uuid); } catch (e) { continue; } // §1.2 — a corrupt manifest is a real, separate problem; don't let it crash recovery for every other spec
    let touched = false;
    for (const chunk of manifest.chunks) {
      if (chunk.status !== CHUNK_STATES.BUILDING) continue;
      chunk.status      = CHUNK_STATES.PENDING;
      chunk.updatedAt    = Date.now();
      chunk.jobId        = null;   // §consistent with completeChunk's own convention — a stale in-flight jobId would lie about this chunk's real state
      chunk.dispatchDir  = null;
      touched = true;
      recovered.push({ specUuid: s.uuid, chunkUuid: chunk.uuid, sectionId: chunk.sectionId });
    }
    if (touched) {
      manifest.updatedAt = Date.now();
      saveSpec(manifest);
      console.log(`[${MODULE_ID}] recovered ${recovered.filter(r => r.specUuid === s.uuid).length} orphaned chunk(s) for spec ${s.uuid.slice(0,8)} "${manifest.name}" — reset BUILDING -> PENDING`);
    }
  }
  return recovered;
}

// ── Reassign a pending chunk's agent (UI per-chunk override, pre-dispatch) ────
// §BUILT 2026-09-03 — the per-chunk agent <select> in the UI writes through
// this. Deliberately refuses on anything past PENDING: changing which agent
// "built" a chunk that's already building/complete would rewrite provenance
// for content that agent never touched — §1.2, loud refusal, not a silent
// no-op or an overwrite that makes the record lie.
export function setChunkAgent(specUuid, chunkUuid, agent) {
  // §0.39.267 — '' / null un-pins: the chunk goes back to the default (the repo's Agent-tab switch, else its own agent).
  if (agent === '' || agent === null) {
    const m = loadSpec(specUuid);
    const c = m.chunks.find(x => x.uuid === chunkUuid);
    if (!c) throw new Error(`chunk ${chunkUuid} not found in spec ${specUuid}`);
    if (c.status !== CHUNK_STATES.PENDING) throw new Error(`cannot reassign agent on a '${c.status}' chunk — only PENDING chunks can be reassigned before dispatch`);
    c.agentPinned = false; c.updatedAt = Date.now(); saveSpec(m);
    return c;
  }
  if (typeof agent !== 'string') throw new Error('agent required (non-empty string)');
  const manifest = loadSpec(specUuid);
  const chunk = manifest.chunks.find(c => c.uuid === chunkUuid);
  if (!chunk) throw new Error(`chunk ${chunkUuid} not found in spec ${specUuid}`);
  // §0.39.285 (nexus-14 fork D2) — a FAILED/ESCALATED chunk may be reassigned too: that IS the retry on a backend that
  // answers (James: the dead build kept retrying chatgpt, which returned empty, every 10 min). It goes back to PENDING
  // with a fresh attempt count; the failure is kept as priorFailure.
  const _retry = chunk.status === CHUNK_STATES.FAILED || chunk.status === CHUNK_STATES.ESCALATED;
  if (chunk.status !== CHUNK_STATES.PENDING && !_retry) {
    throw new Error(`cannot reassign agent on a '${chunk.status}' chunk — only PENDING or FAILED chunks can be reassigned`);
  }
  if (_retry) { chunk.priorFailure = chunk.failureMode || null; chunk.status = CHUNK_STATES.PENDING; chunk.attempts = 0; chunk.failureMode = null; }
  // §0.39.267 — a hand-picked agent is pinned: it wins over the repo's Agent-tab switch at build time
  // (idearium/api speceng.build). Names are checked against lib/agent-providers.js, the one list.
  let norm = agent;
  try {
    const P = _require('../../lib/agent-providers.js');
    norm = P.normalize(agent);
    if (!P.isKnown(norm)) throw new Error(`unknown agent "${agent}" — one of: ${P.all().join(', ')}`);
  } catch (e) { if (/unknown agent/.test(e.message)) throw e; }
  chunk.agent = norm;
  chunk.agentPinned = true;
  chunk.updatedAt = Date.now();
  saveSpec(manifest);
  return chunk;
}

// ── Record an in-flight dispatch's return address (the "compartment") ─────────
// §BUILT 2026-09-03 — James: "specs in idearium are also supposed to be
// compartments with the specs as the metadata... contracts always need an
// end point... each contract has the start dir. defaults back to the
// start point." No new compartment gets spawned (RAID stays untouched,
// deliberately, for now) — the spec's own directory on disk already IS
// the compartment; this just writes the real, currently-in-flight job's
// return address into the chunk that's waiting on it, the moment that
// job exists on guardian's side (called from chunk-dispatch.js's
// onQueued hook, BEFORE the up-to-5-minute poll for a browser-automated
// NCP provider, not after) — so a process restart mid-poll leaves a real,
// on-disk trace of what was in flight and where it belongs, instead of
// nothing at all. Cleared by completeChunk/failChunk once the chunk
// actually resolves — a resolved chunk showing a stale in-flight jobId
// would be exactly the kind of state that lies about what's really
// happening (§1.2).
export function recordDispatchJob(specUuid, chunkUuid, { jobId, agent } = {}) {
  const manifest = loadSpec(specUuid);
  const chunk = manifest.chunks.find(c => c.uuid === chunkUuid);
  if (!chunk) throw new Error(`chunk ${chunkUuid} not found in spec ${specUuid}`);
  chunk.jobId       = jobId || null;
  chunk.dispatchDir = path.join(SPECS_ROOT, specUuid);   // "the start dir" — this spec's own compartment
  chunk.dispatchedAt= Date.now();
  if (agent) chunk.agent = agent;   // real, confirmed agent from the queued response, not just what was requested
  saveSpec(manifest);
  return chunk;
}

// ── Mark chunk as building (dispatched to agent) ──────────────────────────────
export function markChunkBuilding(specUuid, chunkUuid, { agent, model } = {}) {
  const manifest = loadSpec(specUuid);
  const chunk = manifest.chunks.find(c => c.uuid === chunkUuid);
  if (!chunk) throw new Error(`chunk ${chunkUuid} not found in spec ${specUuid}`);

  chunk.status    = CHUNK_STATES.BUILDING;
  chunk.agent     = agent || chunk.agent;
  chunk.agentModel= model || null;
  chunk.attempts  = (chunk.attempts || 0) + 1;
  chunk.updatedAt = Date.now();

  saveSpec(manifest);
  return chunk;
}

// ── Complete a chunk — write content to disk, verify, update contract ─────────
// §1.1 — artifact must exist on disk before chunk is marked complete
// §2.1 — file written before manifest updated
export function completeChunk(specUuid, chunkUuid, content, { preserveWhitespace = false, repoUuid = null } = {}) {
  if (!content || !content.trim()) {
    return failChunk(specUuid, chunkUuid, 'agent returned empty content', { repoUuid });
  }

  const manifest = loadSpec(specUuid);
  const chunk    = manifest.chunks.find(c => c.uuid === chunkUuid);
  if (!chunk) throw new Error(`chunk ${chunkUuid} not found`);

  const specDir  = path.join(SPECS_ROOT, specUuid);
  // §NO-MD 2026-09-21 — James: "no md files. only node types." A file
  // chunk is stored under its real extension, not as markdown; document
  // sections (no realPath) are unchanged.
  const ext = chunk.realPath ? (path.extname(chunk.realPath) || '.txt') : '.md';
  const filePath = path.join(specDir, `${String(chunk.chunkIdx).padStart(2,'0')}-${chunk.sectionId}-${chunkUuid.slice(0,8)}${ext}`);

  // §BYTE-FIDELITY FIX 2026-07-14 — this used to unconditionally .trim()
  // content here, downstream of every other caller's own choices about
  // whitespace. Right call for agent-generated text (strips real LLM
  // whitespace noise); wrong call for importSpec, which had already gone
  // to the trouble of preserving exact source bytes up to this point, only
  // to lose them at the actual write. preserveWhitespace: true skips it —
  // default stays trim-on, so every other existing caller (agent builds,
  // API completions, CLI) is unaffected.
  const finalContent = preserveWhitespace ? content : content.trim();

  // §2.1 — write to disk first
  const fileContent = [
    `---`,
    `chunk_uuid: ${chunkUuid}`,
    `spec_uuid: ${specUuid}`,
    `section: ${chunk.sectionId}`,
    `title: ${chunk.sectionTitle}`,
    `comp_id: ${chunk.comp_id}`,
    `seam_id: ${chunk.seam_id}`,
    `contract_id: ${chunk.contract_id}`,
    `agent: ${chunk.agent}`,
    `model: ${chunk.agentModel || 'unknown'}`,
    `status: complete`,
    `completed_at: ${new Date().toISOString()}`,
    `---`,
    ``,
    finalContent,
  ].join('\n');

  fs.writeFileSync(filePath, fileContent, 'utf8');

  // §1.1 — verify artifact exists on disk before marking complete
  if (!fs.existsSync(filePath)) {
    return failChunk(specUuid, chunkUuid, 'file write verification failed — artifact not found after write', { repoUuid });
  }

  chunk.status      = CHUNK_STATES.COMPLETE;
  chunk.filePath    = filePath;
  chunk.content     = finalContent;
  chunk.byteSize    = Buffer.byteLength(fileContent);
  chunk.updatedAt   = Date.now();
  chunk.completedAt = Date.now();
  chunk.failureMode = null;
  // §BUILT 2026-09-03 — resolved; the in-flight return-address record
  // (recordDispatchJob) is stale the instant this chunk is real content
  // on disk. A completed chunk still showing an "in flight" jobId would
  // lie about its own state.
  chunk.jobId       = null;
  chunk.dispatchDir = null;

  // Update spec progress
  manifest.doneChunks  = manifest.chunks.filter(c => c.status === CHUNK_STATES.COMPLETE).length;
  manifest.failedChunks= manifest.chunks.filter(c => c.status === CHUNK_STATES.FAILED || c.status === CHUNK_STATES.ESCALATED).length;
  manifest.progress    = Math.round((manifest.doneChunks / manifest.totalChunks) * 100);
  manifest.updatedAt   = Date.now();
  manifest.rootHash     = computeRootHash(manifest);

  if (manifest.doneChunks === manifest.totalChunks) {
    manifest.status      = 'complete';
    manifest.completedAt = Date.now();
    _assembleFullSpec(manifest);
    console.log(`[${MODULE_ID}] ✓ spec complete: ${specUuid.slice(0,8)} "${manifest.name}" · ${manifest.totalChunks} chunks`);
  }

  saveSpec(manifest);
  // §CHUNK-NODE — written after saveSpec, never before: the node is a
  // record OF a real, persisted state, so writing it first would let a
  // failed save leave a node claiming a completion that never happened.
  chunkNodes.writeChunkNode(chunk, specUuid, { specName: manifest.name, repoUuid });
  console.log(`[${MODULE_ID}] ✓ chunk ${chunk.sectionId} complete · ${chunk.byteSize}b · ${manifest.progress}% done`);
  // §BUILT 2026-09-20 — James: "the ui needs to use a toast to show
  // progress like a loading bar." This real percentage (manifest.progress,
  // computed 3 lines above) only ever reached a console.log before this —
  // the SRESEQUENCED 2026-09-20 UI comment in idearium/api/index.js
  // already describes "idearium.repo.chunk.started/done/fault" arriving
  // over SSE as if it were real; it wasn't, nothing anywhere emitted them.
  // Dynamic import, not _require() — idearium/index.js is a real ESM
  // module (export class IdeaOS), and require() cannot load one (throws
  // ERR_REQUIRE_ESM). Dynamic import() is async, but completeChunk() is
  // not — deliberately not awaited, fire-and-forget: a progress event
  // nobody sees yet is not a reason to make every chunk completion wait
  // on it, or to change this function's long-standing synchronous
  // contract for every existing caller. ESM caches the module after the
  // first real import, so this costs nothing on every call after the
  // first for a given process.
  import('../index.js').then(({ getIdeaOS }) => {
    getIdeaOS().emit('idearium.repo.chunk.progress', {
      specUuid, repoUuid, sectionId: chunk.sectionId, byteSize: chunk.byteSize,
      doneChunks: manifest.doneChunks, totalChunks: manifest.totalChunks, progress: manifest.progress,
    });
  }).catch(e => console.warn(`[${MODULE_ID}] chunk-progress SSE emit failed (non-fatal): ${e.message}`));
  return chunk;
}

// ── Fail a chunk ──────────────────────────────────────────────────────────────
export function failChunk(specUuid, chunkUuid, reason, { repoUuid = null } = {}) {
  const manifest = loadSpec(specUuid);
  const chunk    = manifest.chunks.find(c => c.uuid === chunkUuid);
  if (!chunk) throw new Error(`chunk ${chunkUuid} not found`);

  const maxAttempts = 3;
  chunk.status      = chunk.attempts >= maxAttempts ? CHUNK_STATES.ESCALATED : CHUNK_STATES.FAILED;
  chunk.failureMode = reason;
  chunk.updatedAt   = Date.now();
  // §BUILT 2026-09-03 — same as completeChunk: resolved (as a failure,
  // still resolved), the in-flight record is stale.
  chunk.jobId       = null;
  chunk.dispatchDir = null;

  manifest.failedChunks = manifest.chunks.filter(c =>
    c.status === CHUNK_STATES.FAILED || c.status === CHUNK_STATES.ESCALATED).length;
  manifest.updatedAt = Date.now();

  saveSpec(manifest);
  // §CHUNK-NODE — a failed chunk gets a node too. A node set that only
  // recorded successes would make "how many chunks are stuck" an
  // unanswerable question from the node layer, which is exactly the
  // question it is most useful for.
  chunkNodes.writeChunkNode(chunk, specUuid, { specName: manifest.name, repoUuid });
  console.warn(`[${MODULE_ID}] §1.2 chunk ${chunk.sectionId} ${chunk.status}: ${reason}`);
  return chunk;
}

// ── Assemble complete spec from all chunks ────────────────────────────────────
function _assembleFullSpec(manifest) {
  const specDir  = path.join(SPECS_ROOT, manifest.uuid);
  const sections = manifest.chunks
    .filter(c => c.status === CHUNK_STATES.COMPLETE)
    .sort((a, b) => a.chunkIdx - b.chunkIdx)
    .map(c => {
      const content = c.content || '';
      return `# ${c.sectionTitle}\n\n${content}`;
    });

  const fullSpec = [
    `spec:`,
    `  name: ${manifest.name}`,
    `  uuid: ${manifest.uuid}`,
    `  version: ${manifest.version}`,
    `  type: ${manifest.type}`,
    `  phase: ${manifest.phase}`,
    `  status: complete`,
    `  agent: ${manifest.agent}`,
    `  completed_at: ${new Date().toISOString()}`,
    ``,
    sections.join('\n\n---\n\n'),
  ].join('\n');

  const specPath = path.join(specDir, `${manifest.uuid}.spec`);
  fs.writeFileSync(specPath, fullSpec, 'utf8');
  manifest.specPath = specPath;
}

// ── Soft-delete / restore a spec ──────────────────────────────────────────────
// §NEW 2026-07-16 — archiveSpec() above compresses a *complete* spec to a
// .tar.gz for storage; it does NOT remove it from listSpecs()'s output. There
// was no way to actually get a spec out of the Spec Library UI short of
// deleting its directory by hand on disk — which is exactly what produced a
// 71-spec pile of test/probe fixtures from earlier dev sessions. Consistent
// with §7.4 elsewhere in this codebase ("nothing discarded — archived, not
// deleted") and with how repo.file.delete already works (a status flag
// filtered out of listings, not a real fs delete — see repo/index.js
// deleteFile → removeChunk): this sets a flag, listSpecs() filters it out by
// default, nothing on disk is touched or destroyed. restoreSpec reverses it.
export function deleteSpec(specUuid) {
  const manifest = loadSpec(specUuid);
  manifest.deleted = true;
  manifest.deletedAt = Date.now();
  saveSpec(manifest);
  return manifest;
}

/**
 * purgeSpec(specUuid) -> { purged, chunkNodes, mirrorRows } — §0.39.266. James: "delete old specs,
 * idearium is supposed to do that when removing them from the list." Removes the spec for real: its
 * directory (manifest, .spec, chunk files), its .chunk nodes, its cortex mirror rows, and the caches.
 * Supersedes §7.4 "archived, not deleted" for specs, by James's decision (docs/2026-09-27-registry-
 * harness-and-stability-phasemap.spec D2). Callers decide WHETHER a spec may go (a spec that is a live
 * repo's content is that repo's files) — this only decides HOW.
 */
export function purgeSpec(specUuid) {
  if (!specUuid || !/^[\w-]+$/.test(specUuid)) throw new Error(`invalid spec uuid: ${specUuid}`);
  const specDir = path.join(SPECS_ROOT, specUuid);
  if (!fs.existsSync(specDir)) return { purged: false, reason: 'not on disk' };
  let chunkUuids = [];
  try { chunkUuids = (loadSpecMeta(specUuid).chunks || []).map(c => c.uuid); } catch (_) { /* unreadable manifest — the directory still goes */ }
  fs.rmSync(specDir, { recursive: true, force: true });
  _metaCache.delete(specUuid); _summaryCache.delete(specUuid);
  const chunkNodesRemoved = chunkNodes.removeChunkNodes(chunkUuids);
  let mirrorRows = 0;
  try {
    mirrorRows += jaaDB.delete(MANIFEST_TABLE, r => r.uuid === specUuid) || 0;
    mirrorRows += jaaDB.delete(CHUNK_TABLE, r => r.specUuid === specUuid) || 0;
    for (const k of [..._mirrorSig.keys()]) if (k === MANIFEST_TABLE + specUuid || chunkUuids.some(u => k === CHUNK_TABLE + u)) _mirrorSig.delete(k);
  } catch (e) { console.warn(`[${MODULE_ID}] §1.2 cortex mirror purge failed for ${specUuid} (non-fatal): ${e.message}`); }
  return { purged: true, chunkNodes: chunkNodesRemoved, mirrorRows };
}

export function restoreSpec(specUuid) {
  const manifest = loadSpec(specUuid);
  manifest.deleted = false;
  manifest.deletedAt = null;
  saveSpec(manifest);
  return manifest;
}

// ── Compress spec directory to archive ────────────────────────────────────────
// Called when user navigates away or explicitly archives.
// §2.2 — archive path stored in manifest so it's always findable.
export async function archiveSpec(specUuid) {
  const manifest  = loadSpec(specUuid);
  const specDir   = path.join(SPECS_ROOT, specUuid);
  const archivePath = `${specDir}.tar.gz`;

  // Use zlib + tar via Node streams — no external dependencies
  const { spawn } = await import('child_process');
  await new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-czf', archivePath, '-C', SPECS_ROOT, specUuid]);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
    proc.on('error', reject);
  });

  manifest.archivePath = archivePath;
  manifest.status = manifest.status === 'complete' ? 'archived' : manifest.status;
  saveSpec(manifest);
  console.log(`[${MODULE_ID}] archived: ${archivePath}`);
  return archivePath;
}

// ── Expand archive ────────────────────────────────────────────────────────────
export async function expandSpec(specUuid) {
  const archivePath = path.join(SPECS_ROOT, `${specUuid}.tar.gz`);
  if (!fs.existsSync(archivePath)) throw new Error(`archive not found: ${archivePath}`);

  const { spawn } = await import('child_process');
  await new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', archivePath, '-C', SPECS_ROOT]);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
    proc.on('error', reject);
  });

  return loadSpec(specUuid);
}

// ── Build prompt for a chunk — gives agent full context ───────────────────────
// Agents get: system context, spec metadata, previous chunks, their section task
// §FILE-TREE-FIRST 2026-09-21 — a file chunk is asked for a FILE: its full
// content, in its layer, against the plan and the finished files it builds
// on. The lower layers it may import are included (bounded), because a
// runtime file written without seeing the engine it wires is a guess.
function _buildFilePrompt(manifest, chunk, systemContext = '') {
  const order = { kernel: 0, engine: 1, runtime: 2, test: 3 };
  const mine = order[chunk.file.layer] ?? 2;
  const tree = (manifest.fileTree && manifest.fileTree.files) || [];
  const planText = tree.map(f => `- ${f.path} [${f.layer}]${f.purpose ? ` — ${f.purpose}` : ''}`).join('\n');
  const below = manifest.chunks
    .filter(c => c.file && c.status === CHUNK_STATES.COMPLETE && c.uuid !== chunk.uuid && (order[c.file.layer] ?? 9) < mine)
    .slice(0, 12);
  let budget = 24000;
  const shown = [];
  for (const c of below) {
    const body = String(c.content || '');
    if (!budget) break;
    const take = body.slice(0, Math.min(budget, 4000));
    budget -= take.length;
    shown.push(`--- ${c.realPath} [${c.file.layer}]${take.length < body.length ? ' (truncated)' : ''}\n${take}`);
  }
  return [
    `Write the complete file \`${chunk.realPath}\` for the project "${manifest.name}".`,
    ``,
    `Layer: ${chunk.file.layer}${chunk.file.purpose ? ` — ${chunk.file.purpose}` : ''}`,
    manifest.description ? `Project: ${manifest.description}` : '',
    ``,
    `Layers: kernel = core state/types/invariants, no I/O · engine = domain logic on the kernel · runtime = entrypoints, I/O, wiring, config · test = tests.`,
    `A file may only depend on its own layer and the layers below it.`,
    ``,
    systemContext ? `SYSTEM STATE:\n${systemContext}\n` : '',
    planText ? `THE FILE TREE:\n${planText.slice(0, 6000)}\n` : '',
    shown.length ? `FILES ALREADY BUILT BELOW THIS LAYER:\n${shown.join('\n\n')}\n` : '',
    `Output ONLY the file's full content in one fenced code block. Real, working code — no placeholders, no TODO stubs, no "rest of implementation" comments.`,
  ].filter(Boolean).join('\n');
}

// ── Build prompt for a MANIFEST-FIRST component chunk — I5, minimal input ─────
// §MANIFEST-FIRST 2026-09-25 — spec-engine-manifest-first-phasemap v0.1.0.
// _buildFilePrompt (above) hands an agent up to 12 full files / 24000 chars
// of everything already built in lower layers — real, but the opposite of
// I5 ("a chunk's context = its own manifest entry + its neighbours'
// schemas; nothing else"). That's fine for a layer-gated file-tree spec
// where "what's below" genuinely isn't known in advance. It is NOT fine
// once a manifest exists (P1, before any chunk dispatches): at that point
// every component's consumes/emits SCHEMAS are already on disk, so a
// neighbour's full source is never the right thing to spend context on —
// its schema is. This function is picked by buildChunkPrompt() whenever
// the chunk carries a manifestEntry (set by createComponentManifestSpec /
// P4 CHUNKS dispatch — see the manifest domain in genesis.spec), and is
// additive: _buildFilePrompt and the section-based path below are both
// unchanged for every spec that isn't manifest-first yet.
function _buildManifestEntryPrompt(manifest, chunk, systemContext = '') {
  const entry = chunk.manifestEntry;
  const byId  = new Map((manifest.componentManifest || []).map(e => [e.id, e]));

  // I5: neighbours are ONLY the ids this entry itself declares in depends[]
  // — not "everything built so far," not "everything in this compartment."
  // Only the SHAPE crosses the boundary (signature/schema), never the
  // neighbour's own file content, intent prose, or test bodies.
  const neighbourSchemas = (entry.depends || []).map(depId => {
    const dep = byId.get(depId);
    if (!dep) return `- ${depId}: (no manifest entry found — wire-check should have caught this before dispatch)`;
    const consumes = (dep.consumes || []).map(c => `    consumes ${c.signature}: ${JSON.stringify(c.schema)}`);
    const emits    = (dep.emits    || []).map(e => `    emits ${e.event}${e.residue ? ' (residue)' : ''}: ${JSON.stringify(e.schema)}`);
    return [`- ${depId} (${dep.file}):`, ...consumes, ...emits].join('\n');
  }).join('\n');

  return [
    `Write the complete file \`${entry.file}\` for the project "${manifest.name}".`,
    ``,
    `Component: ${entry.id}`,
    `Intent (the ONE thing this component does — build nothing beyond it): ${entry.intent}`,
    ``,
    systemContext ? `SYSTEM STATE:\n${systemContext}\n` : '',
    `YOUR OWN MANIFEST ENTRY (this is your full contract — implement exactly this, nothing implied beyond it):`,
    `  consumes: ${JSON.stringify(entry.consumes || [], null, 2)}`,
    `  emits:    ${JSON.stringify(entry.emits    || [], null, 2)}`,
    `  data:     ${JSON.stringify(entry.data || { reads: [], writes: [] })}`,
    `  cli:      ${entry.cli || 'null — no CLI surface for this component'}`,
    `  tests:    ${JSON.stringify(entry.tests || [], null, 2)}`,
    ``,
    entry.depends && entry.depends.length
      ? `NEIGHBOUR SCHEMAS — the shape you may call/consume/emit against for each id in your own depends[]. This is a schema, not source: do not guess at how a neighbour is implemented internally, and do not ask for more than its signature shape.\n${neighbourSchemas}\n`
      : `NEIGHBOURS: none — this entry's depends[] is empty.\n`,
    `Rules:`,
    `- Reach every neighbour by its component_id through registry/component-router.js. Never write an import statement to another component/<file>.js.`,
    `- Every event you emit must match one of your declared emits[] entries exactly, including residue:true/false.`,
    `- Every event/command you consume must match one of your declared consumes[] entries exactly.`,
    `- Touch only the directories in data.reads / data.writes above.`,
    `- Write the contract tests from tests[] as real, runnable tests in the same file or its paired test file — not a description of what a test would check.`,
    `- Output ONLY the file's full content in one fenced code block. Real, working code — no placeholders, no TODO stubs, no "rest of implementation" comments.`,
  ].filter(Boolean).join('\n');
}

export function buildChunkPrompt(manifest, chunk, systemContext = '') {
  if (chunk.manifestEntry) return _buildManifestEntryPrompt(manifest, chunk, systemContext);
  if (chunk.file && chunk.realPath) return _buildFilePrompt(manifest, chunk, systemContext);
  const completedChunks = manifest.chunks
    .filter(c => c.status === CHUNK_STATES.COMPLETE && c.chunkIdx < chunk.chunkIdx)
    .map(c => `### ${c.sectionTitle}\n${c.content || ''}`)
    .join('\n\n');

  return [
    `You are building the "${chunk.sectionTitle}" section of a NEXUS component spec.`,
    ``,
    `SPEC CONTEXT:`,
    `  Name: ${manifest.name}`,
    `  Type: ${manifest.type}`,
    `  Description: ${manifest.description || '(none provided)'}`,
    `  UUID: ${manifest.uuid}`,
    `  Chunk: ${chunk.chunkIdx + 1}/${manifest.totalChunks}`,
    `  Section: ${chunk.sectionId}`,
    `  comp_id: ${chunk.comp_id}`,
    `  seam_id: ${chunk.seam_id}`,
    `  contract_id: ${chunk.contract_id}`,
    ``,
    systemContext ? `SYSTEM STATE:\n${systemContext}\n` : '',
    completedChunks ? `PREVIOUSLY COMPLETED SECTIONS:\n${completedChunks}\n` : '',
    `YOUR TASK:`,
    `Write the "${chunk.sectionTitle}" section for this spec.`,
    `${chunk.sectionDesc}`,
    ``,
    `Requirements:`,
    `- Be specific to "${manifest.name}" — not generic`,
    `- Reference AXIOMS-v1.0 where relevant`,
    `- Every UUID/seam_id/comp_id should follow the NEXUS naming convention`,
    `- §1.2: declare all failure modes explicitly`,
    `- §2.1: declare all JAA writes that must happen before behavior`,
    `- Output ONLY the section content — no preamble, no "here is the section:"`,
  ].filter(Boolean).join('\n');
}

export default {
  // §ADDED 2026-07-09 — idearium/api does `m.default || m`, so the DEFAULT
  // export is the real API surface. Named exports alone are invisible to it:
  // `se.listTemplates is not a function` at runtime. Caught by calling the
  // live endpoint, not by reading the file.
  listTemplates, getTemplate, readSeed,
  findByDedupKey, findPriorSection, importSpec,
  createSpec, createFileTreeSpec, loadSpec, loadSpecMeta, saveSpec, listSpecs,
  nextPendingChunk, markChunkBuilding, completeChunk, failChunk, setChunkAgent, recordDispatchJob, setWarpPrimitives,
  recoverOrphanedChunks,
  buildChunkPrompt, archiveSpec, expandSpec, deleteSpec, restoreSpec, purgeSpec,   // purgeSpec: 0.39.266 (D2)
  computeRootHash, findByRootHash, ingestFilesAsSpec, addChunk, removeChunk,
  reconstructSpecText,
  SPEC_SECTIONS, CHUNK_STATES, WARP_PRIMITIVES: [...WARP_PRIMITIVES],
  MODULE_ID, VERSION, COMP_ID,
};

// §RE-EXPORT 2026-07-09 — idearium/api/index.js loads only spec-engine/index.js
// (`import('../spec-engine/index.js')`). Without this, `se.listTemplates()`
// in the `speceng.templates` action would be undefined at runtime: a declared
// wire to nothing, caught before shipping rather than after.
// §PHASE 6 2026-07-10 — intelligence in the loop: "query previous builds to
// reduce tokens and redundancy." Two levers, both previously absent.
//
// findByDedupKey — the spec-level lever. dedupKey (sha1 of name::type) was
// computed and STORED on every spec since day one, and never READ. Creating
// "auth-system"/system twice made two specs and rebuilt every chunk of the
// second at full token cost. This is the missing lookup.
export function findByDedupKey(name, type = 'component') {
  _ensureRoot();
  const key = _specDedupKey(name, type);
  for (const entry of fs.readdirSync(SPECS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const m = loadSpec(entry.name);
      if (m.dedupKey === key) return { uuid: m.uuid, name: m.name, type: m.type, status: m.status, progress: m.progress };
    } catch (_) {}
  }
  return null;
}

// §ROOT HASH 2026-07-11 — "the repo is an archive using the spec, the spec
// is the metadata, like a compartment with the spec as the metadata." The
// repo layer used to keep its OWN copy of file metadata (path+byte-length,
// no actual content) alongside a SEPARATE legacy spec object — two
// disconnected records claiming to describe one thing. Fixed not by adding
// a new archive format on top, but by recognizing the spec's own chunks
// already ARE the archive: real content, already verified on disk (§1.1),
// already tagged with comp_id/seam_id/contract_id. The only missing piece
// was identity — something that says "this exact content" the way JAA's
// store already does (content-addressable, SHA-256 of canonical JSON, same
// content -> same hash — see the james-brooks skill's JAA section). Reusing
// that exact convention here rather than inventing a second one: a spec's
// rootHash is the hash of its ordered (sectionId, chunk-hash) pairs. Two
// specs with identical chunk content produce the identical rootHash — free
// dedup, and a repo becomes addressable by content instead of by an
// arbitrarily-assigned uuid pointing at a copy nobody kept in sync.
function _canonicalJSON(v) {
  if (Array.isArray(v)) return '[' + v.map(_canonicalJSON).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + _canonicalJSON(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function _sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function _hashChunk(c) { return _sha256(_canonicalJSON({ sectionId: c.sectionId, content: c.content || '' })); }

export function computeRootHash(manifest) {
  // §BUG FIXED 2026-07-11 — a removed chunk (removeChunk, soft-delete)
  // still had its content hashed in here, so rootHash never changed on
  // removal — two repos differing only by "one has a deleted file" would
  // report identical content identity, which is wrong: dedup/fork logic
  // reads rootHash as "what this repo actually contains."
  const ordered = manifest.chunks
    .filter(c => c.status !== 'removed')
    .sort((a, b) => a.chunkIdx - b.chunkIdx)
    .map(c => ({ sectionId: c.sectionId, hash: _hashChunk(c) }));
  return _sha256(_canonicalJSON(ordered));
}

// Content-addressable lookup — the repo layer's dedup lever. Same rootHash
// means same content already exists on disk; a caller can reuse it instead
// of writing a byte-identical second copy.
export function findByRootHash(rootHash) {
  _ensureRoot();
  for (const entry of fs.readdirSync(SPECS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const m = loadSpec(entry.name);
      if (m.rootHash === rootHash) return m;
    } catch (_) {}
  }
  return null;
}

// §UNIFIED INGEST 2026-07-11 — "least amount of friction, highest leverage,
// not a wrapper." Dropped repo files used to go through a completely
// separate code path from an imported .spec: RepoLayer built its own
// throwaway spec object and stored file metadata (no content) in its own
// JSON file. That's two storage systems for one concept. This collapses
// them: a dropped file becomes a chunk exactly the way an imported .spec's
// block becomes a chunk (dynamic sections, real content, completeChunk's
// existing §1.1 disk-verification) — same mechanism, same one gate,
// regardless of whether the content arrived as a parsed .spec block or a
// raw file. The repo layer (repo/index.js) no longer needs its own content
// store at all; it becomes a thin index over this.
// §NEW 2026-07-11 — every existing chunk-creation path (createSpec,
// ingestFilesAsSpec) builds a FIXED chunk list at spec-creation time.
// Nothing could add one more chunk to an ALREADY-existing spec — needed
// for the repo file editor's "add a file" action, since v2's repo has no
// content store of its own to add a file TO except through spec-engine.
// Same disk-write/rootHash-recompute path as every other chunk — this is
// not a second mechanism, just a chunk list that can grow after creation.
export function addChunk(specUuid, { sectionId, title = null, content = '', realPath = null, repoUuid = null, dependsOn = [], preserveWhitespace = false } = {}) {
  if (!sectionId) throw new Error('addChunk: sectionId required');
  const manifest = loadSpec(specUuid);
  // §FIXED 2026-09-20 (MCO-B) — this counted REMOVED chunks. removeChunk()
  // is a soft delete, and repo/index.js's _resolveChunk() ignores removed
  // chunks, so a deleted file looked "not found" to writeFile(), which then
  // tried addChunk() and was told the section "already exists". Result: a
  // file could never be re-created at a path it had once been deleted from.
  // Found by restoring a snapshot over the real RepoLayer (undoing a restore
  // has to re-create a file it deleted). A removed chunk stays in the
  // manifest (§7.4 nothing discarded); it just no longer blocks a new one.
  if (manifest.chunks.some(c => c.sectionId === sectionId && c.status !== 'removed')) {
    throw new Error(`addChunk: section '${sectionId}' already exists on this spec — use completeChunk to edit it`);
  }
  // §BUILT 2026-09-19 — James: "file tree with needed files,
  // dependencies, and primitives... build from the bottom up." A
  // dependsOn referencing a sectionId that doesn't exist on this
  // manifest can never be satisfied — _chunkDependenciesSatisfied()
  // would just leave that chunk PENDING forever with no error anywhere
  // to explain why. Fail loudly here instead, at the one point that
  // actually knows the full real sectionId set.
  const realIds = new Set(manifest.chunks.map(c => c.sectionId));
  const badDeps = dependsOn.filter(d => !realIds.has(d));
  if (badDeps.length) {
    throw new Error(`addChunk: dependsOn references section(s) that don't exist on this spec yet — ${badDeps.join(', ')}. Add them first, or fix the reference.`);
  }
  const chunkUuid = crypto.randomUUID();
  const chunkIdx  = manifest.chunks.length;
  const specDir   = path.join(SPECS_ROOT, specUuid);
  const now       = Date.now();
  const chunk = {
    uuid: chunkUuid, specUuid, chunkIdx,
    sectionId, sectionTitle: title || sectionId, sectionDesc: `added file: ${sectionId}`,
    comp_id: COMP_ID, seam_id: `${SEAM_PREFIX}:${specUuid.slice(0,8)}:${sectionId}`,
    contract_id: `spec-contract:${specUuid.slice(0,8)}:${sectionId}:${chunkUuid.slice(0,8)}`,
    filePath: path.join(specDir, `${chunkUuid}.md`),
    fileName: `${String(chunkIdx).padStart(2,'0')}-${sectionId}.md`,
    // §REALPATH 2026-09-15 — a file added through the repo editor (repo/
    // index.js's writeFile "new file" branch) passes its real relative
    // path here so materialize() writes it under that path, same as a
    // dropped file — not the numbered fileName. null for every other
    // addChunk caller (none currently pass it), unaffected.
    realPath,
    // §BOTTOM-UP — the same real field _buildManifest's own initial 10
    // sections already carry and _chunkDependenciesSatisfied()/
    // findNextPendingChunk() already read to decide what's buildable
    // next. Default [] — every existing addChunk caller is unaffected,
    // byte-identical to before this change.
    dependsOn,
    status: CHUNK_STATES.PENDING, agent: 'user', agentModel: null,
    attempts: 0, failureMode: null, content: null, byteSize: 0,
    createdAt: now, updatedAt: now, completedAt: null,
    tags: [sectionId, manifest.type, manifest.name.toLowerCase().replace(/\s+/g,'-')],
  };
  manifest.chunks.push(chunk);
  manifest.totalChunks = manifest.chunks.length;
  saveSpec(manifest);
  // §BUG FIXED 2026-07-11 — completeChunk() returns the single chunk it
  // just completed, not the manifest. Returning that directly here left
  // callers (repo/index.js's writeFile) doing `fresh.chunks.find(...)` on
  // an object with no .chunks property at all — reliable crash on every
  // "add a new file with content" call. Always return the fresh manifest.
  if (content && content.trim()) completeChunk(specUuid, chunkUuid, content, { repoUuid, preserveWhitespace }); // §2026-09-21 opt-in, default unchanged
  return loadSpec(specUuid);
}

// Soft-delete — §7.4 nothing discarded. The chunk stays on disk (its .md
// file untouched) but is excluded from the repo's file listing and no
// longer counts toward totalChunks/progress. Recomputes rootHash so a
// repo's content identity reflects the removal.
export function removeChunk(specUuid, chunkUuid) {
  const manifest = loadSpec(specUuid);
  const chunk = manifest.chunks.find(c => c.uuid === chunkUuid);
  if (!chunk) throw new Error(`chunk ${chunkUuid} not found`);
  chunk.status = 'removed';
  chunk.updatedAt = Date.now();
  manifest.totalChunks = manifest.chunks.filter(c => c.status !== 'removed').length;
  manifest.doneChunks  = manifest.chunks.filter(c => c.status === CHUNK_STATES.COMPLETE).length;
  manifest.progress    = manifest.totalChunks ? Math.round((manifest.doneChunks / manifest.totalChunks) * 100) : 0;
  manifest.rootHash     = computeRootHash(manifest);
  manifest.updatedAt   = Date.now();
  saveSpec(manifest);
  // §CHUNK-NODE — the chunk's own .md artifact stays on disk (§7.4
  // nothing discarded); the NODE goes, because an index entry for
  // something no longer in the manifest is a lie with a timestamp.
  chunkNodes.removeChunkNode(chunkUuid);
  return loadSpec(specUuid);
}

export function ingestFilesAsSpec({ name, files = [], author = 'ingest', repoUuid = null } = {}) {
  if (!files.length) throw new Error('ingestFilesAsSpec: at least one file required');
  // §MCO-F 2026-09-15 — the drop path's own real chunk cap (distinct from
  // lib/project-import.config.js's ZIP.maxFiles, which only bounds the
  // "Upload Project" zip flow). Every dropped file becomes exactly one
  // chunk here, so idearium.config.chunk_cap is the real, live bound on
  // how many a single ingest can create — same config, same source of
  // truth, checked live on every call rather than baked in at boot.
  const cap = getConfigValue('chunk_cap');
  if (files.length > cap) {
    throw new Error(`ingestFilesAsSpec: ${files.length} files exceeds chunk_cap (${cap}) — raise idearium.config.chunk_cap or split the drop`);
  }
  const seenIds = new Map();
  const sections = files.map((f, idx) => {
    const rawPath = f.path || `file-${idx}`;
    // §FIX 2026-09-16 — strip the file's own extension before slugging.
    // _slug() turns every '.' into '-', so a dotted name (README.md,
    // config.json) folded its extension straight into the sectionId
    // ("docs-readme-md"), and _buildManifest's fileName template then
    // re-appended a real ".md" on top of that — "docs/README.md" became
    // fileName "00-docs-readme-md.md", i.e. the extension effectively
    // doubled. Nothing is lost by dropping it here: the real extension
    // survives intact on realPath (set right after this, below), which
    // is what materialize() actually writes to disk — this id is only
    // ever the internal chunk-store slug. `noExt || rawPath` guards the
    // dotfile case (".gitignore" has no separate stem to fall back to).
    const noExt = rawPath.replace(/\.[a-z0-9]+$/i, '');
    let id = _slug((noExt || rawPath).replace(/\//g, '-'));
    const n = (seenIds.get(id) || 0) + 1;
    seenIds.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    return { id, title: rawPath, desc: `ingested file: ${rawPath}` };
  });
  const manifest = _buildManifest({ name, type: 'codebase', description: 'ingested from dropped files', author, sections });

  // §MEMORY 2026-09-21 — James: "idearium crashes when chunking, its not
  // stable." This loop used to run markChunkBuilding() + completeChunk() +
  // loadSpec()/saveSpec() PER FILE. Each of those parses and re-serialises the
  // whole manifest (every chunk's content is inside it) and, before the mirror
  // went metadata-only, copied all of it into the shared store — so an import
  // of N files did ~3N full-manifest round trips, quadratic in bytes moved
  // (369 files: ~1.3 GB written to manifest.json alone) and it ran out of heap
  // at chunk ~313. The files are all in hand, so the chunks are now completed
  // in memory and the manifest is written ONCE.
  //
  // Same result per chunk as the old path — same .md file in the same place with
  // the same front matter, same fields, same FAILED/ESCALATED handling for an
  // empty file — checked by tests/modules/test-ingest-bulk.js against a chunk
  // built the old way (completeChunk) from identical input.
  //
  // `ingesting` is the crash-safety half. It is set on the manifest at creation
  // and only cleared by the single save at the end, so a process death midway
  // leaves a spec that says so. The build queue skips it and the boot
  // reconcile can tell it apart from a spec that is merely waiting to be
  // built. (Before: a half-imported project looked like a spec with pending
  // sections, and idearium's queue asked ChatGPT to "write" the missing files.)
  manifest.ingesting = true;
  saveSpec(manifest);

  const specDir = path.join(SPECS_ROOT, manifest.uuid);
  const now0 = Date.now();
  files.forEach((f, i) => {
    const chunk = manifest.chunks[i];
    chunk.agent = 'ingest'; chunk.agentModel = 'ingest:drop';
    chunk.attempts = (chunk.attempts || 0) + 1;
    // §REALPATH 2026-09-15 — James: "idearium needs to import the files to the
    // repo, not just chunk." repo/index.js and materialize() prefer realPath
    // over the chunk store's numbered fileName, so a dropped file lands at its
    // real path/extension. Sanitized: no leading '/', no '..' segment, so a
    // crafted f.path cannot escape the materialize outDir.
    const clean = String(f.path || '')
      .replace(/^\/+/, '')
      .split('/')
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/');
    chunk.realPath = clean || null;

    // §FIXED 2026-09-19 — a file with no captured content is a real failure of
    // this ingest, never a fabricated placeholder marked COMPLETE (§1.2).
    if (!(f.content && f.content.trim().length > 0)) {
      chunk.status = chunk.attempts >= 3 ? CHUNK_STATES.ESCALATED : CHUNK_STATES.FAILED;
      chunk.failureMode = `no text content captured for ${f.path} — binary, empty, or unreadable at ingest time`;
      chunk.jobId = null; chunk.dispatchDir = null;
      chunk.updatedAt = Date.now();
      console.warn(`[${MODULE_ID}] §1.2 chunk ${chunk.sectionId} ${chunk.status}: ${chunk.failureMode}`);
      return;
    }

    const finalContent = f.content.trim();
    const filePath = path.join(specDir, `${String(chunk.chunkIdx).padStart(2,'0')}-${chunk.sectionId}-${chunk.uuid.slice(0,8)}.md`);
    const fileContent = [
      `---`,
      `chunk_uuid: ${chunk.uuid}`,
      `spec_uuid: ${manifest.uuid}`,
      `section: ${chunk.sectionId}`,
      `title: ${chunk.sectionTitle}`,
      `comp_id: ${chunk.comp_id}`,
      `seam_id: ${chunk.seam_id}`,
      `contract_id: ${chunk.contract_id}`,
      `agent: ${chunk.agent}`,
      `model: ${chunk.agentModel || 'unknown'}`,
      `status: complete`,
      `completed_at: ${new Date().toISOString()}`,
      `---`,
      ``,
      finalContent,
    ].join('\n');
    fs.writeFileSync(filePath, fileContent, 'utf8');
    // §1.1 — the artifact must exist on disk before the chunk is marked complete.
    if (!fs.existsSync(filePath)) {
      chunk.status = CHUNK_STATES.FAILED;
      chunk.failureMode = 'file write verification failed — artifact not found after write';
      chunk.updatedAt = Date.now();
      return;
    }
    chunk.status      = CHUNK_STATES.COMPLETE;
    chunk.filePath    = filePath;
    chunk.content     = finalContent;
    chunk.byteSize    = Buffer.byteLength(fileContent);
    chunk.updatedAt   = Date.now();
    chunk.completedAt = Date.now();
    chunk.failureMode = null;
    chunk.jobId = null; chunk.dispatchDir = null;
  });

  manifest.doneChunks   = manifest.chunks.filter(c => c.status === CHUNK_STATES.COMPLETE).length;
  manifest.failedChunks = manifest.chunks.filter(c => c.status === CHUNK_STATES.FAILED || c.status === CHUNK_STATES.ESCALATED).length;
  manifest.progress     = manifest.totalChunks ? Math.round((manifest.doneChunks / manifest.totalChunks) * 100) : 0;
  manifest.rootHash     = computeRootHash(manifest);
  if (manifest.doneChunks === manifest.totalChunks) {
    manifest.status      = 'complete';
    manifest.completedAt = Date.now();
    _assembleFullSpec(manifest);
    console.log(`[${MODULE_ID}] ✓ spec complete: ${manifest.uuid.slice(0,8)} "${manifest.name}" · ${manifest.totalChunks} chunks`);
  }
  delete manifest.ingesting;        // the ingest finished — this is the ONE save that says so
  manifest.updatedAt = Date.now();
  saveSpec(manifest);

  // §CHUNK-NODE — one pass at the end, after the save it records (never before:
  // a node claiming a completion that never persisted would be a lie).
  chunkNodes.writeManifestChunkNodes(manifest, { repoUuid });
  console.log(`[${MODULE_ID}] ✓ ingested ${manifest.doneChunks}/${manifest.totalChunks} file(s) into "${manifest.name}" in ${Date.now() - now0}ms`);
  // One progress event, not one per file: the loop above is synchronous, so
  // per-file events would only have queued up and flushed together anyway.
  import('../index.js').then(({ getIdeaOS }) => {
    getIdeaOS().emit('idearium.repo.chunk.progress', {
      specUuid: manifest.uuid, repoUuid, sectionId: null, byteSize: 0,
      doneChunks: manifest.doneChunks, totalChunks: manifest.totalChunks, progress: manifest.progress,
    });
  }).catch(e => console.warn(`[${MODULE_ID}] chunk-progress SSE emit failed (non-fatal): ${e.message}`));
  return manifest;
}

// findPriorSection — the chunk-level lever. The WARP exact cache reuses a chunk
// only when the whole PROMPT matches, and a prompt includes the spec name — so
// the same "purpose" section in two differently-named specs never hits. This
// answers "has this exact section (sectionId + sectionDesc) already been built
// somewhere?" so the caller can reuse the content instead of dispatching. It
// returns the newest complete match, or null. Content-addressed on the section
// contract, not the spec identity.
export function findPriorSection(sectionId, sectionDesc = '', excludeSpecUuid = null) {
  _ensureRoot();
  let best = null;
  for (const entry of fs.readdirSync(SPECS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const m = loadSpec(entry.name);
      if (m.uuid === excludeSpecUuid) continue;
      const chunk = (m.chunks || []).find(c =>
        c.sectionId === sectionId &&
        c.status === 'complete' &&
        (!sectionDesc || c.sectionDesc === sectionDesc) &&
        c.content && c.agent !== 'template');   // template seeds are spec-specific, not reusable content
      if (chunk && (!best || (chunk.completedAt || 0) > (best.completedAt || 0))) {
        best = { specUuid: m.uuid, specName: m.name, sectionId,
          content: chunk.content, completedAt: chunk.completedAt, agent: chunk.agent };
      }
    } catch (_) {}
  }
  return best;
}

// §CONSOLIDATED 2026-07-14 — boundary detection, byte-fidelity checking, and
// SPLIT_THRESHOLD_CHARS moved to lib/chunker/index.js so idearium isn't the
// only system with this logic — loom (or anything else that needs to split
// a document) gets the same real implementation, not a second one grown
// independently later. See that file's header for the full history (the
// three-dialect detector, the byte-fidelity trim bugs and their fixes).
const { chunkDocument, structuralProfile, slug: _slug, SPLIT_THRESHOLD_CHARS } = _require('../../lib/chunker/index.js');

// §IMPORT 2026-07-10 — "need a way to import zip or .spec to build a repo."
// §REWRITTEN 2026-07-10 — the original version mapped every block through a
// fixed 10-slot alias table (meta/purpose/schema/api/events/integration/
// tests). That table is many-to-one: 'causal map', 'runtime model',
// 'snapshots' and 'evolution log' all aliased to the SAME 'integration'
// chunk, and a chunk that's already complete is skipped rather than
// appended to — so on a real 11-block spec like causal-nexus.spec, only the
// FIRST block to claim a slot survived; the rest were silently discarded.
// That's a direct contradiction of this file's own "§Information Must Never
// Be Lost" comment. Fixed by not pre-declaring slots at all: the chunk list
// is now built FROM the document's own structure (via _detectSubBoundaries
// above), one chunk per block or per natural sub-boundary inside a dense
// block, so there is no shared bucket left to collide over.
//
// Every block is queued and processed through the real chunk state machine
// (pending -> building -> complete) via markChunkBuilding/completeChunk —
// zero-token, since the content is already authored, but not a shortcut
// around the contract: every chunk is still written to disk and verified
// like any agent-built one, just instantly instead of after a dispatch.
export function importSpec({ name, specText, author = 'import' }) {
  if (!specText || !specText.trim()) throw new Error('importSpec: specText required');
  const specName = name || (specText.match(/name:\s*(\S+)/)?.[1]) || `imported-${Date.now()}`;

  // §CONSOLIDATED 2026-07-14 — block splitting, sub-boundary detection, and
  // the byte-fidelity self-check all now live in lib/chunker/index.js
  // (chunkDocument). This is the same logic that used to be inline here —
  // moved, not reimplemented, so idearium isn't the only caller of it.
  const { queue, byteFidelity, blocksFound } = chunkDocument(specText);
  const roundtrip = byteFidelity.verified;
  if (!roundtrip) {
    console.warn(`[idearium.spec-engine] importSpec: byte-fidelity check FAILED for "${specName}" — ` +
      `reconstructed ${byteFidelity.reconstructedBytes}b vs source ${byteFidelity.sourceBytes}b, ` +
      `first divergence at byte ${byteFidelity.firstDivergence}`);
  }

  const sections = queue.map(q => ({ id: q.id, title: q.title, desc: q.desc }));
  const manifest = _buildManifest({ name: specName, type: 'system', description: 'imported from .spec', author, sections });

  const filled = [];
  for (const q of queue) {
    const chunk = manifest.chunks.find(c => c.sectionId === q.id);
    if (!chunk) continue; // sections[] and queue[] are built 1:1 — should never miss
    markChunkBuilding(manifest.uuid, chunk.uuid, { agent: 'import', model: 'import:.spec' });
    const tag = q.sourceKey ? `imported: ${q.sourceBlock} → ${q.sourceKey}` : `imported block: ${q.sourceBlock}`;
    completeChunk(manifest.uuid, chunk.uuid, `<!-- ${tag} -->\n\n${q.content}`, { preserveWhitespace: true });
    const fresh = loadSpec(manifest.uuid);
    const fc = fresh.chunks.find(c => c.uuid === chunk.uuid);
    if (fc) {
      fc.agent = 'import';
      fc.agentModel = 'import:.spec';
      // §COGNITIVE SEAM 2026-07-14 — "complexity is a shape, not a scalar."
      // Real counts (deps/hookEvents/failureModes/invariantRefs) from the
      // chunk's own content, kept as a vector, not collapsed to one score —
      // enforcement (small, high invariant fan-out) vs kernel (large, spread
      // across categories) need different handling, not the same number.
      fc.structuralProfile = structuralProfile(q.content);
    }
    saveSpec(fresh);
    filled.push(q.id);
  }

  const out = loadSpec(manifest.uuid);
  out.importedBlocks = queue.map(q => q.sourceBlock).filter((v, i, a) => a.indexOf(v) === i);
  out.importedUnmatched = [];   // every block now produces at least one chunk — nothing to lose
  out.byteFidelity = byteFidelity;
  saveSpec(out);
  return { manifest: out, blocksFound, sectionsFilled: filled, unmatched: [], byteFidelity: out.byteFidelity };
}

export { listTemplates, getTemplate, readSeed };
