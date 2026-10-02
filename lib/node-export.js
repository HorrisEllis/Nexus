'use strict';
/**
 * lib/node-export.js — the single, canonical export/import envelope every
 * real node type (.hat, .contract, .component, .cos, .agent, .model,
 * .schema, .crystal, .ledger, .command, .gap, .pat, .macro, .tool, .node,
 * .failure_mode, .idea, plus the already-real .spec/.nex) shares.
 * UUID: nexus-node-export-v1-0000-2026-0903-001
 *
 * §THE ASK — James: "each export has relevant context, intent, summary,
 * system, intent, export each node using yaml files... all these are
 * exportable and importable [as a] single measurement of unit."
 *
 * §CHECKED BEFORE BUILDING — grepped every one of the 17 named extensions
 * across the real tree before writing a single schema field. Only two are
 * currently real, literal files: .spec (228 real files, its own
 * established convention — SPEC-REGISTRY.md, per-system layout — left
 * alone, not re-wrapped) and .nex (438 real files — cortex's own
 * NEX-SNAP/1.0 snapshot format, cortex/snapshot/index.js, JSON not YAML —
 * also left alone; it already IS a working export format for its one real
 * use, and this module doesn't get to redefine an existing on-disk
 * contract other real code depends on). Every other extension names a
 * REAL backing system that has never had a standalone file form:
 *   .hat          -> lib/hat-forge.js's forged_hats table (HAT_SCHEMA)
 *   .contract     -> cortex/core/raid's real queue rows / RAID contracts
 *   .component    -> loom's component registry (loom/maps/*.js + driver)
 *   .cos          -> cos/ (compartment-OS classes: archetype/blueprint/
 *                    foundation/kernel/vault/etc.)
 *   .agent        -> guardian's provider-routing table (KNOWN_PROVIDERS)
 *   .model        -> a hat's real `model` field (an Ollama model tag)
 *   .schema       -> HAT_SCHEMA-shaped real JS schema objects generally
 *   .crystal      -> meta/crystal-lattice.js's real crystal records
 *   .ledger       -> jaaDB's real ledger table
 *   .command      -> the real command-index (clear-glass's live route
 *                    table / guardian's /cli/commands)
 *   .gap          -> lib/gap-field.js's real gap-field records
 *   .pat          -> lib/case-library.js's real pattern_signature records
 *   .macro        -> the macro-compiler component (§HONEST — this one has
 *                    no .spec anywhere either, per precommit-check.js's
 *                    own standing warning; real code exists but its
 *                    record shape was not independently re-confirmed in
 *                    this pass — flagged, not assumed)
 *   .tool         -> lib/agent-tools/tools/**\/*.js's {name, description,
 *                    parameters, execute} shape
 *   .node         -> a generic loom graph node (component OR hook OR wire)
 *   .failure_mode -> not yet backed by a single named real module found
 *                    this pass (checked: no failure-mode.js, no
 *                    failure_modes table) — genuinely OPEN, not silently
 *                    assumed real
 *   .idea         -> idearium/index.js's real IdeaCreateGate.transform()
 *                    object (idearium.idea.create) — the missing first
 *                    link James named in idea -> spec compiler ->
 *                    compartment/repo -> chunks -> dispatch -> versionium
 *
 * §TAGGED AND QUERYABLE 2026-09-03 — James: "we need to use those tagged
 * and querable." wrap()'s meta.tags is now a real envelope field (not
 * buried inside payload, so it applies uniformly across every type), and
 * queryDir(destDir, {type, tags, tagMode}) is the real function that was
 * missing entirely before this: exportToFile()/importFromFile() only
 * ever handled one exact known path each. queryDir reads real files this
 * module already wrote, through the same fromYaml()/validate() path
 * importFromFile() uses — not a second, parallel read mechanism.
 *
 * §WHAT THIS MODULE ACTUALLY DOES — it does not, itself, know how to
 * fetch a hat or a contract. It is ONLY the envelope: wrap(type, id,
 * payload, meta) produces one real YAML document with a common header
 * (uuid, type, context, intent, summary, system, exported_at, source)
 * around a type-specific `payload`; unwrap(yamlText) parses it back and
 * validates the header shape. Per-type fetchers (hat-forge's get(),
 * RAID's queue lookup, etc.) stay owned by their real systems — this
 * module composes with them (see exportHat() below for the one, fully
 * real, verified first wiring) rather than reaching into their storage
 * directly (§10.3 — one real source of truth per system, this is not a
 * second one).
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const ENVELOPE_VERSION = 1;

// Extensions this module recognizes as real export targets — see the
// header table above for what backs each one today.
const KNOWN_TYPES = Object.freeze([
  'hat', 'contract', 'component', 'cos', 'agent', 'health', 'model', 'schema',
  // §GA1 2026-10-02 — E13: a browser agent provider is a Guardian node first (guardian/data/nodes/provider/)
  'provider',
  // §RENAMED 2026-09-20 — James: RAID's per-agent health snapshot (dispatchName/online/
  // consecutiveFails/successRate, cortex/core/raid/index.js _agentAvailable()) is `health`.
  // `agent` is now for agent MODELS and PERSONALITIES with an intent and commands (a repo
  // compartment's living agent). No `.agent` node file ever existed, so nothing was migrated.
  'crystal', 'ledger', 'command', 'gap', 'pat', 'macro', 'tool', 'node',
  'failure_mode', 'idea', 'framework', 'toolbox', 'job',
  // §ADDED 2026-09-12 — James: "nodes can be imported and exported,
  // schemas for each type." intent didn't exist as a real node type
  // anywhere before this (checked: absent from this list AND from
  // lib/node-schemas/ entirely) despite being referenced conversationally
  // for guardian's own real job routing. See lib/node-schemas/
  // schema.intent's own status:'OPEN' — this is a genuinely new,
  // proposed shape, not extracted from an existing real construction
  // site the way every other entry in this list was.
  // §ADDED 2026-09-12 — James: "each component is a type of node...
  // .component .wire .hook." Unlike intent/system above, these ARE
  // already real, running code — loom/scanners/capability-map.js's own
  // driver.declare('hook'|'wire', ...) calls — just never registered
  // into this shared registry before. See schema.hook/schema.wire's own
  // status:'REAL' for the distinction from intent/system's OPEN status.
  'intent', 'hook', 'wire',
  // §ADDED 2026-09-21 — .inject: one agent-proposed write of one file into a
  // compartment's repo, with its lifecycle (proposed/applied/rejected/
  // reverted) and its own undo. NOT injection / inject_rule, which are both
  // PROMPT-CONTEXT injection. See lib/repo-inject.js.
  'inject',
  // §2026-09-21 — a spec's planned file tree (lib/file-tree-plan.js writeTreeNode)
  'filetree',
  // [SUPERSEDED 2026-09-20: the reasoning below kept `.repo_agent` apart from `agent` because
  // `agent` was RAID's health snapshot. That is now `health`; see the note at 'health' above.]
  // §ADDED 2026-09-20 — James: "the hat row plus its observation set plus
  // its exchange log is exactly the model to serialise." Deliberately NOT
  // folded into the existing 'agent' type: lib/node-schemas/schema.agent is
  // REAL and grounded in cortex/core/raid/index.js's _agentAvailable()
  // per-agent HEALTH snapshot (dispatchName/online/consecutiveFails/
  // successRate) — runtime reachability telemetry about a provider, a
  // genuinely different thing from a portable compartment identity. Same
  // collision class already named for ledger/gap/wire/contract and
  // macro/debug_macro. See lib/repo-agent-node.js.
  'repo_agent', // LEGACY 2026-09-20: 0.39.189's compartment-agent export, superseded by 'agent'. Still readable, never written.
  // §ADDED 2026-09-12 -- James: "each system has a taxonomy for each
  // node type it uses... a living index." Also genuinely new -- see
  // lib/node-schemas/schema.system's own status:'OPEN' note. Grounded
  // in loom/scanners/capability-map.js's real SYSTEMS map and
  // nexus/autopilot.js's real per-kernel definitions, not invented.
  'system',
  // §BUGFIX 2026-09-12 — 'event' and 'capability' already have real,
  // grounded schema files (lib/node-schemas/schema.event, sourced from
  // cortex/data/snapshots/*.nex's real event_log rows; schema.capability,
  // already status:REAL) that predate this session's intent/hook/wire/
  // system work — but neither was ever added to KNOWN_TYPES. Concretely:
  // guardian/lib/node-registry.js's own GUARDIAN_NODE_TYPES already
  // includes 'event' and creates a real guardian/data/nodes/event/
  // folder for it, but exportToFile('event', ...) — and therefore
  // importFromFile() on any hand-authored .event file — throws
  // "unknown type" before nodeSchemas.checkPayload('event', ...) is ever
  // reached. No .event file could ever be created or validated. Same
  // gap for 'capability' (the real target of loom/scanners/
  // capability-map.js's planned second output). Wiring only — no new
  // schema invented, both were already status:REAL.
  'event', 'capability',
  // §ADDED 2026-09-12 — grounded in cortex/core/raid/officiator.js's real
  // synthesizeFromContext()/_synthesizeCore() output shape (see
  // lib/node-schemas/schema.synthesis, status:REAL). No .synthesis file
  // has ever been written to disk with this envelope before — this is
  // the first time the officiator's synthesis object gets a standalone,
  // importable/exportable node form.
  'synthesis',
  // §ADDED 2026-09-12 — James: "input can be the payload for cli" ... "input
  // to any systems cli." Checked every real CLI in the tree, not just
  // guardian's: guardian/lib/jobs.js's createJob() destructure AND
  // copilot/cli.js's real POST /api/prompt body ({prompt, channel,
  // sessionId, provider}) are both real, and genuinely different shapes —
  // schema.input (status:REAL) is the honest union of the two, with only
  // `provider` required across both. cockpit/cli.js was checked and
  // excluded — its REPL never builds a network payload. Also real:
  // copilot/cli.js's own meta-CLI router (`/guardian`, `/cortex`,
  // `/idearium`, `/nexus`, `/cockpit`, `/forge` → spawnSync(cliPath, argv,
  // {stdio:'inherit'})) injects argv directly into any system's CLI as a
  // child process — a second, real injection mode alongside the JSON-body
  // one, though argv itself isn't captured as structured data the way a
  // POST body is.
  // §CORRECTED 2026-09-12 — `output` was originally grounded in
  // writeToNexus()'s internal cortex-write payload — real, but not what a
  // CLI operator actually receives back. Re-grounded in the two real
  // CLI-facing response shapes instead: guardian/server.js's GET
  // /response/:jobId (what guardian/cli.js's pollUntilDone() reads) and
  // copilot/cli.js's own parsed /api/prompt reply. See
  // lib/node-schemas/schema.output, status:REAL.
  'input', 'output',
  // §ADDED 2026-09-12 — the 33rd type, found on a direct re-check after
  // being asked "none of these needed a new type?" Grounded twice,
  // independently: intelligence/schemas.js's real agent_notes JAA table
  // and lib/agent-tools/tools/coordination/agent-notes.js's real tool,
  // same field set. See lib/node-schemas/schema.note, status:REAL.
  'note',
  // §ADDED 2026-09-12 — the 34th type. James: ".Hypothesis." Grounded in
  // copilot/lib/user-model.js's real user_model_hypotheses JAA table —
  // {uuid, claim, claimType, category, confidence, evidence_count,
  // firstSeen, lastSeen, lastEvidence, status, decayRate, source}. Real,
  // live, and only just wired: orchestrator/orchestrator.js's own comment
  // says this table "had one row" before today — never init'd by any live
  // code until this session's jaa-store string-where fix. Not a proposal;
  // a real table now genuinely being written to. See
  // lib/node-schemas/schema.hypothesis, status:REAL.
  'hypothesis',
  // §ADDED 2026-09-12 — the 35th type. Genuinely distinct from `tool`,
  // not a naming variant of it: lib/agent-tools/naming.js's own
  // parseName() returns a different `kind` ('agent_tool' vs 'tool') for
  // `provider.agentName.name.agent.tool` vs `system.name.tool` — two
  // different regexes, two different id shapes (provider+agent-scoped vs
  // system-scoped). Marked OPEN, not REAL: agentToolName() and its regex
  // are real and tested (tests/modules/test-tool-naming-convention.js,
  // TN-003/TN-009), but grep confirms zero real `.agent.tool` instances
  // have been built or registered anywhere yet (lib/agent-tools/index.js
  // only references the convention in a comment) — the name-shape is
  // real, the payload shape beyond it is proposed, not checked against a
  // real instance. See lib/node-schemas/schema.agent_tool.
  //
  // §NOT INCLUDED — MCP tools (orchestrator/lib/mcp-tools-tokensave.js's
  // nexus_grep, nexus_read_range, etc., and everything else in
  // orchestrator/lib/mcp-server.js's TOOLS array). Checked and excluded on
  // purpose: flat snake_case names, zero relation to this dotted
  // system.name.tool / provider.agent.name.agent.tool convention or to
  // lib/agent-tools/ at all — a different, protocol-layer concern
  // (MCP's own tool spec, consumed by external MCP clients). Whether
  // protocol-layer tools deserve their own taxonomy is a separate
  // architectural decision, not folded in here.
  'agent_tool',
  // §ADDED 2026-09-13 — the 36th type. James: "every time something gets
  // prepended to a dispatch, there'd be a real node recording what and
  // why" (the .injection ask, following v0.39.122's "mountain" fix).
  // Grounded in exactly one real construction site, checked directly:
  // copilot/tool-runtime.js's makeNcpCallModel inner callModel — the
  // function that fix patched. makeOllamaCallModel checked and excluded
  // (native ollama `tools` param, never text-injects a guide). See
  // lib/node-schemas/schema.injection, status:REAL.
  'injection',
  // §ADDED 2026-09-12 — migrating data/cortex/memory and
  // data/guardian/memory into real nodes surfaced several tables whose
  // shape was already fully documented in a local schema.* file
  // (mostly intelligence/schemas/) but that file was never added here —
  // same class of gap as event/capability above: real, grounded,
  // checkPayload-passing data that exportToFile() would still have
  // thrown "unknown type" on. Verified against the live rows directly,
  // not assumed from the schema doc alone:
  // - fault: cortex/self-heal/fault-taxonomy.js's real fault_taxonomy
  //   row — data/cortex/memory/fault_taxonomy.json's one real row
  //   checkPayload-passes schema.fault (guardian's local copy, status
  //   REAL) exactly.
  // - bep_pattern: intelligence/schemas.js's real bep_patterns table —
  //   770 real rows, all checkPayload-pass schema.bep_pattern exactly.
  // - resonance_crystal: intelligence/liminal-space/index.js's real
  //   table — NOTE this is what data/cortex/memory/crystals.json
  //   actually is; its rows do NOT match the generic `crystal` type's
  //   fields (a different, unrelated real crystallization mechanism,
  //   meta/crystal-lattice.js's), only schema.resonance_crystal's.
  // - interstitial_space: intelligence/liminal-space's real table — 250
  //   real rows, checkPayload-pass schema.interstitial_space exactly.
  // - account_identity_index_entry: lib/account-identity-index.js's
  //   real table — 2 real rows, checkPayload-pass exactly.
  'fault', 'bep_pattern', 'resonance_crystal', 'interstitial_space',
  'account_identity_index_entry',
  // §ADDED 2026-09-19 — James: "each node type needs a schema to make
  // sure they stay consistent," while wiring intelligence/mastermind.js's
  // detectRecurringPatterns() into the real node-export path. Checked
  // directly against schema.bep_pattern first, not assumed compatible:
  // this real write site upserts on 'sequence', never assigns a uuid, and
  // carries none of bep_pattern's typeA/typeB/crossSystem/count/
  // confidence/description/actionable/crystallised/noiseTainted fields —
  // genuinely a different real shape, not a stricter/looser version of
  // the same one. See schema.pattern_sequence's own header for why this
  // wasn't folded into bep_pattern's required-relaxation instead.
  'pattern_sequence',
  // §ADDED 2026-09-19 — James: "make it into the node type... this
  // needs to be configurable, editable." Distinct from the existing
  // `injection` type (a per-call audit record) — see
  // schema.inject_rule's own header for why these are two real,
  // different things and not one type serving both directions.
  'inject_rule',
  // §ADDED 2026-09-12 — sigma_record. intelligence/schemas.js only ever
  // pointed at its real writers (intelligence/baseline.js,
  // intelligence/cfr/sigma.js) without independently checking their
  // output shape — schema.sigma_record was honestly left status:OPEN,
  // fields:{}. Confirmed directly against data/cortex/memory/
  // sigma_records.json's real rows this pass (723 of them) — real shape
  // is {uuid, sigma, type, axes, reason, intervalMs, cfrState,
  // baselineSnap, source, ts, id}. schema.sigma_record updated to REAL
  // with these fields; this is the first time that promotion is honest.
  'sigma_record',
  // §ADDED 2026-09-12 — hook_contract. Already existed as a REAL,
  // grounded schema (hooks/guardian.hooks.js's GUARDIAN_HOOKS shape) but
  // was never added here either — same class of gap as fault/event
  // above. Checked against the actual live table this pass
  // (data/cortex/memory/hooks.json, loom's real HookRegistry —
  // docs/hooks-migration.spec, "loom — sole write authority") and found
  // real drift: the schema's top-level `status`/`updatedAt` are
  // genuinely nested under a real `meta` object in every live row now,
  // and `version`/`schema`/`frictionScore`/`routerPolicy`/`bindings` are
  // real fields the schema never documented. schema.hook_contract
  // (central + guardian's local copy) corrected to match, with a
  // correction_2026-09-12 field explaining the drift rather than
  // silently rewriting the original claim.
  'hook_contract',
  // §ADDED 2026-09-12 — three genuinely new types, real tables with no
  // prior schema anywhere, authored fresh against their real writers:
  // - component_projection: lib/blueprint.js / lib/blueprint-index.js's
  //   real per-component projection bundle (comp/cli/grammar/ui/config/
  //   seam/doc facets) — data/cortex/memory/component_projections.json,
  //   294 real rows.
  // - constitution_decision: lib/constitutional-ai.js's real per-check
  //   decision log (axiom/pass/reason/severity/blast_radius/cost) —
  //   data/cortex/memory/constitution_decisions.json, 2256 real rows.
  // - chat_log: lib/chat-logger.js's real log() output — the same table
  //   referenced throughout this codebase's own changelog history
  //   (0.39.49's "all chats from the ncp need to log to the chat log
  //   index") — data/cortex/memory/chat_log.json.
  'component_projection', 'constitution_decision', 'chat_log',
  // §ADDED 2026-09-12 — tool_index_entry. lib/tool-index.js's real
  // per-tool usage/reuse index (consumers/intents/edgeCases/calls) —
  // genuinely distinct from `.tool` (a tool's own definition): this is
  // metadata ABOUT a tool's real usage, not the tool itself.
  // data/cortex/memory/tool_index.json, 86 real rows.
  'tool_index_entry',
  // §ADDED 2026-09-12 — raid_contract. `contract` (status:REAL) turned
  // out, on direct verification, to be grounded in lib/end-state.js's
  // real pursuit-contract shape (endState/conditions), a genuinely
  // different real system from RAID's own contract queue. RAID's real,
  // live rows (data/cortex/memory/raid_contract_queue.json, 18 of them,
  // cortex/boot.js's real GET /api/raid/queue) have no endState field
  // anywhere and never will under the current implementation — forcing
  // them through `.contract` would silently conflate two real, distinct
  // things under one name, the same collision class already named for
  // ledger/gap/wire elsewhere in this codebase. Given its own type
  // instead.
  'raid_contract',
  // §ADDED 2026-09-12 — debug_macro. James: "make a .failure_mode and
  // .macro to replicate the bug." Deliberately NOT `.macro` — that
  // type's only real executor (lib/agent-tools/tools/clear-glass/
  // macro.js) plays browser_action steps against clear-glass; a
  // NEXUS-internal fault isn't a browser action, and writing non-
  // browser steps under `.macro` would be exactly the kind of silent
  // same-word-different-thing collision already named for ledger/gap/
  // wire/contract elsewhere in this codebase. A debug_macro's steps
  // instead replay the REAL precursor event chain lib/diagnostic-
  // causal.js's explainFinding() already traces (via intelligence/
  // relational-field), using the same {call, target, args} composed-
  // step shape lib/tool-forge.js's forged tools already use — honestly
  // marked OPEN: no general executor exists yet to actually replay a
  // debug_macro's steps against a live system; it is a real, structured
  // reproduction recipe, not yet auto-playable.
  'debug_macro',
  // §ADDED 2026-09-15 — the 37th type. James: "chunks should be node
  // types, .chunk, look at the taxonomy." Grounded in exactly one real
  // construction site, read directly: idearium/spec-engine/index.js's
  // own chunk object (_buildManifest/addChunk build it,
  // markChunkBuilding -> completeChunk/failChunk mutate it). Every
  // field in schema.chunk is a real property already on that object;
  // only contentHash and specUuid are added at node-write time, and
  // both for a stated reason (see that schema's own field notes).
  // Deliberately not folded into `.component` (a static, language-
  // agnostic declaration — a chunk is a spec-scoped unit with its own
  // verification state) or `.job` (guardian's in-flight dispatch).
  'chunk',
  // §ADDED 2026-09-15 — the 38th type. James: "stream to a .response
  // node in the data folder... make sure they reach the return point."
  // Grounded in guardian/lib/ncp-handler.js's real GUARDIAN_COMPLETE
  // branch. Genuinely distinct from `.output` (which describes the
  // transport reply a CLI reads off GET /response/:jobId — a different
  // real shape, checked, see schema.output's own source note): this is
  // guardian's own durable record of an agent response, which is what
  // makes the return point survivable across a restart. See
  // lib/node-schemas/schema.response, status:REAL.
  'response',
  // §ADDED 2026-09-16 — the 39th type. nexus-repository-system.spec
  // §3: "A repository is a first-class node. Repository UUID is
  // logical identity." Before this, a repo's real state (identity,
  // source hash, file/symbol/chunk counts, verification result) was
  // scattered across idearium/repo/repos/<uuid>/{atlas.json,
  // verification.json, indexes/*.json, chunks/index.json} with no
  // single addressable node tying them together — an agent had to
  // already know that internal layout to answer "is this repo ready,
  // and what's in it," which is exactly what the spec's purpose
  // section says the model should never need to do. See
  // lib/node-schemas/schema.repository, status:REAL — grounded
  // directly in idearium/repo/index.js's real repo record
  // (RepoLayer.get()) and idearium/repo/import-pipeline.js's real
  // runImportPipeline() result, not a new shape invented to fit the
  // spec. Deliberately a POINTER node, same discipline as `.chunk`:
  // it records counts and the on-disk paths of atlas/indexes/chunks/
  // verification, it does not duplicate their contents.
  'repository',
  // [SUPERSEDED in part 2026-09-20: `agent` is no longer RAID's health snapshot (now `health`);
  // the agent_model reasoning below still holds.]
  // §ADDED 2026-09-17 — James: "hats and .agent nodes... a model of the
  // agent. To persist." Checked before adding, not assumed: 'agent' is
  // already a real, live type here — schema.agent, status:REAL, sourced
  // from cortex/core/raid/index.js's _agentAvailable() dispatch-
  // availability snapshot (dispatchName/online/consecutiveFails/
  // callCount/successRate/role). That's real-time reachability data, a
  // genuinely different concern from copilot/lib/agent-model.js's
  // longitudinal behavioral hypothesis model (observe/decay/reconfirm/
  // archive, same lifecycle contract as user-model.js). Giving the
  // hypothesis snapshot its own type rather than folding it into
  // schema.agent — decided explicitly, not defaulted to — so the two
  // never become a competing source of truth for one node type, the
  // same class of collision this session already found and fixed once
  // between RAID's own governance compartment and COS's real one. See
  // lib/node-schemas/schema.agent_model, status:REAL.
  'agent_model',
  // §ADDED 0.39.266 — James: "make the macros and workflow automation, exportable
  // node types. .macro, and maybe .workflow or .framework?" .macro was already
  // here; .workflow is a Clear Glass automation workflow (clear-glass/src/mesh/
  // automation-engine.js) with the macros and sub-workflows it uses bundled —
  // see clear-glass/src/automation/nodes.js. Not .framework: that is already
  // intelligence/framework-builder.js's generated code skeleton.
  'workflow',
  // §0.39.282 N21 — a build step's gate rules (lib/step-gates/*.step_gate, read by lib/step-gate.js)
  'step_gate',
  // .spec and .nex are real, established formats of their own — NOT
  // wrapped in this envelope (see header §CHECKED BEFORE BUILDING).
]);

/**
 * wrap(type, id, payload, meta) -> the envelope object (not yet a string).
 * - type: one of KNOWN_TYPES.
 * - id: the real, stable identifier of the thing being exported (a hat's
 *   uuid, a contract's queue-row uuid, etc.) — never invented here.
 * - payload: the real, type-specific data, passed through unchanged.
 * - meta: { context, intent, summary, system, tags } — all optional;
 *   absence is honestly recorded as null (or [] for tags), never
 *   fabricated. §BUILT 2026-09-03 — James: "we need to use those tagged
 *   and querable." tags lives at the envelope level (not inside payload)
 *   so queryDir() below can filter across every real type uniformly —
 *   a .idea's payload already carries its own real tags field too
 *   (idearium's own idea.tags), meta.tags here is deliberately the same
 *   concept at the export layer, not a second, competing one: callers
 *   exporting something that already has real tags (like an idea) pass
 *   them straight through as meta.tags.
 */
function wrap(type, id, payload, meta = {}) {
  if (!KNOWN_TYPES.includes(type)) {
    throw new Error(`node-export: unknown type "${type}" — must be one of ${KNOWN_TYPES.join(', ')}`);
  }
  if (!id) throw new Error('node-export: id is required — an export with no real identifier cannot be re-imported against its source');
  if (meta.tags !== undefined && !Array.isArray(meta.tags)) {
    throw new Error('node-export: tags must be an array when given');
  }
  const now = Date.now();
  return {
    envelope: ENVELOPE_VERSION,
    uuid: `nexus-export-${type}-${id}`,
    type,
    id,
    context: meta.context || null,
    intent: meta.intent || null,
    summary: meta.summary || null,
    system: meta.system || null,
    tags: meta.tags || [],
    exported_at: now,
    source: meta.source || 'nexus.lib.node-export',
    // §ADDED 2026-09-13 — occurrence tracking (cortex/tools/table-materializer.js's
    // real need: "any data has to be novel or else it's logged as quantity and
    // last seen," James). Additive, envelope-level (not per-type payload) since
    // this describes the MATERIALIZATION process, not the entity's own domain
    // shape — same reasoning exported_at/source already live at this level, not
    // inside payload. All optional, all backward compatible: a reader that
    // doesn't know these fields exist simply doesn't read them; no
    // ENVELOPE_VERSION bump, nothing existing invalidated. Mirrors the exact
    // real precedent already proven in lib/gap-field.js's report() (dedup_key/
    // occurrences/lastSeenAt), generalized here instead of duplicated per type.
    occurrences: meta.occurrences || 1,
    firstSeenAt: meta.firstSeenAt || now,
    lastSeenAt: meta.lastSeenAt || now,
    fingerprint: meta.fingerprint || null,
    payload,
  };
}

/** toYaml(envelopeObj) -> real YAML text. */
function toYaml(envelopeObj) {
  return yaml.dump(envelopeObj, { noRefs: true, lineWidth: 100 });
}

/** fromYaml(yamlText) -> the parsed envelope object, validated. */
function fromYaml(yamlText) {
  const doc = yaml.load(yamlText);
  return validate(doc);
}

/** validate(envelopeObj) -> the same object if valid; throws with a real reason if not. */
function validate(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('node-export: not a real envelope object');
  if (doc.envelope !== ENVELOPE_VERSION) throw new Error(`node-export: envelope version ${doc.envelope} — this module reads version ${ENVELOPE_VERSION} only`);
  if (!KNOWN_TYPES.includes(doc.type)) throw new Error(`node-export: unknown type "${doc.type}"`);
  if (!doc.id) throw new Error('node-export: missing id');
  if (doc.payload === undefined) throw new Error('node-export: missing payload');
  return doc;
}

/**
 * updateOccurrence(type, id, destDir, opts) -> the real file path updated, or
 * null if it doesn't exist yet (caller's job to exportToFile() in that case).
 * The one real, narrow exception to exportToFile()'s "refuse to overwrite"
 * rule — bumping occurrences/lastSeenAt on a node already proven identical
 * (by fingerprint, checked by the caller before calling this) is not a
 * silent overwrite, it's the documented occurrence-tracking mechanism
 * itself. Never touches `payload` — only the envelope's own tracking fields.
 */
function updateOccurrence(type, id, destDir, opts = {}) {
  const filePath = path.join(destDir, `${id}.${type}`);
  if (!fs.existsSync(filePath)) return null;
  const doc = importFromFile(filePath);
  doc.occurrences = (doc.occurrences || 1) + 1;
  doc.lastSeenAt = opts.lastSeenAt || Date.now();
  fs.writeFileSync(filePath, toYaml(doc));
  return filePath;
}

/**
 * exportToFile(type, id, payload, meta, destDir) -> the real file path
 * written, e.g. destDir/<id>.hat. Extension matches `type` literally, per
 * the ask ("export each node using yaml files: .hat, .contract, ...").
 */
function exportToFile(type, id, payload, meta, destDir) {
  const envelopeObj = wrap(type, id, payload, meta);
  fs.mkdirSync(destDir, { recursive: true });
  const filePath = path.join(destDir, `${id}.${type}`);
  fs.writeFileSync(filePath, toYaml(envelopeObj), 'utf8');
  return filePath;
}

/** importFromFile(filePath) -> the validated envelope object. */
function importFromFile(filePath) {
  return fromYaml(fs.readFileSync(filePath, 'utf8'));
}

/**
 * queryDir(destDir, { type, tags, tagMode }) -> [envelopeObj, ...],
 * every real exported envelope in destDir matching the filter.
 * §BUILT 2026-09-03 — James: "we need to use those tagged and querable."
 * exportToFile()/importFromFile() only ever handled one exact path each
 * — no function anywhere in this module could ask "everything of type X"
 * or "everything tagged Y" across a real directory of exports. This is
 * that missing piece, not a second export/import mechanism: it reads
 * real files this same module already wrote, via the same fromYaml()/
 * validate() path importFromFile() uses.
 * - type: optional, one of KNOWN_TYPES — only files ending .<type> are
 *   even opened (cheap filter before the real YAML parse, not after).
 * - tags: optional string[] — envelopes must carry every one of these
 *   (AND, not OR — a caller asking for two tags means both, the more
 *   predictable default when nothing else in this codebase established
 *   a convention either way).
 * - tagMode: 'any' switches the above to OR-match instead of the AND
 *   default, for a caller that genuinely wants either tag to qualify.
 * Malformed files are skipped, not thrown on — one bad export in a
 * directory of hundreds must not fail every real query against the rest
 * (§1.2 loud, but at the file that's actually bad, not the whole call).
 */
function queryDir(destDir, { type, tags, tagMode = 'all' } = {}) {
  if (tags !== undefined && !Array.isArray(tags)) throw new Error('node-export: queryDir tags must be an array when given');
  let files;
  try { files = fs.readdirSync(destDir); } catch (e) { return []; } // no directory yet is a real, honest "nothing exported", not an error
  const results = [];
  for (const file of files) {
    if (type && !file.endsWith(`.${type}`)) continue;
    let doc;
    try { doc = importFromFile(path.join(destDir, file)); }
    catch (e) { continue; } // one malformed export skipped, not fatal to the query
    if (type && doc.type !== type) continue; // real type from inside the envelope, not just the filename's extension
    if (tags && tags.length) {
      const docTags = Array.isArray(doc.tags) ? doc.tags : [];
      const match = tagMode === 'any'
        ? tags.some(t => docTags.includes(t))
        : tags.every(t => docTags.includes(t));
      if (!match) continue;
    }
    results.push(doc);
  }
  return results;
}

module.exports = { wrap, toYaml, fromYaml, validate, exportToFile, updateOccurrence, importFromFile, queryDir, KNOWN_TYPES, ENVELOPE_VERSION };
