'use strict';
/**
 * lib/repo-agent-node.js — the compartment agent as portable node files.
 * UUID: nexus-repo-agent-node-v1-0000-2026-0920-jamesbrooks-001
 * Version: 0.1.0
 *
 * §REPO-AGENT-NODE 2026-09-20 — James: "the hat row plus its observation
 * set plus its exchange log is exactly the model to serialise."
 *
 * §WHY NOT .agent, EVEN THOUGH THAT TYPE EXISTS. lib/node-schemas/
 * schema.health is already REAL and already grounded — in cortex/core/raid/
 * index.js's _agentAvailable() per-agent HEALTH snapshot (dispatchName,
 * online, consecutiveFails, callCount, successRate, role). That is runtime
 * reachability telemetry about a provider. This is a portable identity:
 * who an agent is, what it knows, what it has done. Same word, genuinely
 * different thing — the exact collision class already named in this
 * codebase for ledger, gap, wire, contract and macro/debug_macro. Writing
 * this under .agent would make every consumer of that schema read rows
 * that do not match it. New type, `repo_agent`, registered in KNOWN_TYPES.
 *
 * §WHAT IS PORTABLE AND WHAT IS NOT, stated rather than discovered.
 * Exported: the hat definition, every learned observation, and optionally
 * the exchange log. NOT exported: the hat's uuid as an identity claim.
 * importAgent() re-forges — a new uuid — for the same reason
 * hat-forge.importHat() already does: carrying a uuid across a different
 * jaaDB is a false claim of continuity, not portability. seedKey IS
 * carried, because the ROLE ("the agent for this repo") is the thing that
 * genuinely survives the move.
 *
 * §THE GAP THIS CLOSES. hat-forge.exportHat() already wrote a real .hat
 * file — but only the hat row. An agent restored from it arrives with its
 * persona frozen at export time and its entire observation set gone, so
 * everything it had learned was silently dropped on the way. That is why
 * this exports the bundle and re-composes the persona on import rather
 * than trusting the exported string.
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'repo-agent-node';
const VERSION = '0.1.0';
const TYPE = 'agent';               // §2026-09-20 — James: .agent is the agent model/personality with an intent and commands
const LEGACY_TYPE = 'repo_agent';    // 0.39.189 exports; still READ, never written

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIR = path.join(ROOT, 'data', 'exports', 'agents');

function _nx()  { return require('./node-export.js'); }
function _hat() { return require('./repo-hat.js'); }
function _mem() { return require('./repo-hat-memory.js'); }
function _ra()  { return require('./repo-agent.js'); }

/**
 * materialise({ repo, repoDir, destDir, includeLog, logLimit })
 *
 * Writes TWO real node files, not one:
 *   <hatUuid>.hat        — hat-forge's own envelope, unchanged, so anything
 *                          that already reads .hat keeps working
 *   <repoUuid>.agent     — the full portable bundle (schema.agent + the learned model)
 *
 * Returns { ok, hatFile, agentFile, observations, exchanges }.
 */
// ── where a command comes from ─────────────────────────────────────────────
// James (2026-09-21): commands come from cos, agent tools, idearium tools and guardian
// tools. A hat's toolScope names agent-tool-registry tools; each is labelled with the
// registry it belongs to (the tool file's folder, or the cos_ prefix), so a `.agent`'s
// commands say where they come from and the label is derived from the code, not typed.
let _srcMap = null;
function _toolSources() {
  if (_srcMap) return _srcMap;
  _srcMap = new Map();
  const root = path.join(__dirname, 'agent-tools', 'tools');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!e.name.endsWith('.js')) continue;
      const cat = path.basename(path.dirname(f));
      const txt = fs.readFileSync(f, 'utf8');
      for (const m of txt.matchAll(/name:\s*'([a-z0-9_.]+)'/g)) if (!_srcMap.has(m[1])) _srcMap.set(m[1], cat);
      for (const m of txt.matchAll(/toolName\('([a-z0-9-]+)',\s*'([a-z0-9_]+)'\)/g)) _srcMap.set(`${m[1]}.${m[2]}.tool`, m[1]);
    }
  };
  try { walk(root); } catch (_) { /* no tools dir: every command is labelled unknown, never invented */ }
  return _srcMap;
}
function commandSource(name) {
  if (/^cos_/.test(name)) return 'cos';
  const cat = _toolSources().get(name);
  if (!cat) return 'unknown';
  return cat === 'guardian' ? 'guardian' : cat === 'idearium' ? 'idearium' : cat === 'cos' ? 'cos' : 'agent-tools';
}
/** commandIds(toolScope) -> ['agent-tools:read_file', 'cos:cos_compartment', 'idearium:idearium.repo_chunks.tool', ...] */
function commandIds(toolScope) { return (toolScope || []).map(n => `${commandSource(String(n))}:${n}`); }

function materialise({ repo, repoDir, destDir = DEFAULT_DIR, includeLog = true, logLimit = 200 } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };

  const RH = _hat();
  const hat = RH.getRepoHat(repo.uuid);
  if (!hat) return { ok: false, errors: [`no hat forged for repo ${repo.uuid} — nothing to serialise`] };

  const mem = _mem();
  const observations = mem.list(repo.uuid, { limit: 10000 });
  const exchanges = includeLog ? _ra().history(repo.uuid, logLimit) : [];
  const index = RH.readRepoIndex(repoDir);

  fs.mkdirSync(destDir, { recursive: true });

  // 1. The .hat file — delegated, not reimplemented. hat-forge stays the
  //    one source of truth for what a hat IS.
  const hatExport = require('./hat-forge.js').exportHat(hat.name, {
    system: 'nexus.lib.repo-agent-node',
    summary: `Repo hat "${hat.name}" for compartment ${repo.compartmentId || 'unknown'}`,
  }, destDir);
  if (!hatExport.ok) return { ok: false, errors: [hatExport.reason || 'hat export failed'] };

  // 2. The .agent bundle. The first four fields are schema.agent's required ones,
  // each taken from what is really in the hat definition:
  //   name         the hat's name
  //   intent       what the agent is for: its responsibilities, else a plain statement of
  //                its compartment. INTERIM: binding to the repo's own .intent node is not
  //                built (where that node comes from is undecided) - intent_ref carries the
  //                idea/spec uuid when the repo has one, so the link can be made later.
  //   commands     what it may issue: the hat's toolScope
  //   personality  the hat's composed persona
  const intentText = (hat.responsibilities || []).length
    ? hat.responsibilities.join('; ')
    : `Project agent for ${repo.name || repo.uuid}, confined to compartment ${repo.compartmentId || 'unknown'}`;
  const payload = {
    name: hat.name,
    intent: intentText,
    intent_ref: repo.ideaUuid || repo.specUuid || null,
    commands: commandIds(hat.toolScope),
    personality: hat.personaPrompt || '',
    hat: hat.name,
    scope: repo.compartmentId || null,
    learned: observations.map(o => ({ kind: o.kind, text: o.text, occurrences: o.occurrences || 1 })),
    schema: 'nexus.agent/1',
    repo: {
      uuid: repo.uuid,
      name: repo.name || null,
      compartmentId: repo.compartmentId || null,
    },
    // The hat DEFINITION, not its identity. uuid is recorded for
    // provenance only and is never re-used on import.
    hat_definition: {
      name: hat.name,
      seedKey: hat.seedKey || null,
      baseAgent: hat.baseAgent,
      allowedAgents: hat.allowedAgents || null,
      toolScope: hat.toolScope || [],
      model: hat.model || null,
      allowedIntents: hat.allowedIntents || null,
      responsibilities: hat.responsibilities || [],
      personaPrompt: hat.personaPrompt || '',
      _originUuid: hat.uuid || hat.id || null,
    },
    // The learned model. dedupKey travels so an import merges correctly
    // against observations the destination already holds.
    observations: observations.map(o => ({
      kind: o.kind, text: o.text, dedupKey: o.dedupKey,
      source: o.source, evidence: o.evidence || null,
      occurrences: o.occurrences || 1,
      firstSeen: o.firstSeen, lastSeen: o.lastSeen,
    })),
    exchanges: exchanges.map(e => ({
      message: e.message, response: e.response, error: e.error,
      ok: e.ok, backend: e.backend, ts: e.ts,
    })),
    // The index the persona was grounded against AT EXPORT TIME. Carried so
    // an importer can tell whether the persona still describes reality, and
    // never treated as the destination's own index.
    indexAtExport: index,
    exportedAt: Date.now(),
  };

  const agentFile = _nx().exportToFile(TYPE, repo.uuid, payload, {
    system: 'nexus.lib.repo-agent-node',
    summary: `Compartment agent "${hat.name}" — ${observations.length} observation(s), ${exchanges.length} exchange(s)`,
    context: repo.compartmentId || null,
  }, destDir);

  return {
    ok: true,
    hatFile: hatExport.filePath,
    agentFile,
    observations: observations.length,
    exchanges: exchanges.length,
  };
}

/**
 * importAgent(filePath, { repo, repoDir, name, includeLog })
 *
 * Re-forges the hat for the TARGET repo and restores the observation set.
 * The persona is RE-COMPOSED from the destination's own index plus the
 * imported observations — never the exported string, which described a
 * machine this one is not.
 *
 * Merges rather than replaces: an observation the destination already
 * holds has its occurrences summed, via repo-hat-memory's own record()
 * dedup, so importing twice does not double a project's memory.
 */
function importAgent(filePath, { repo, repoDir, name = null, includeLog = false } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['a target repo with a uuid is required'] };
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, errors: [`no such file: ${filePath}`] };

  let envelope;
  try { envelope = _nx().importFromFile(filePath); }
  catch (e) { return { ok: false, errors: [`could not read node file: ${e.message}`] }; }
  if (envelope.type !== TYPE && envelope.type !== LEGACY_TYPE) return { ok: false, errors: [`expected a .${TYPE} export (or a legacy .${LEGACY_TYPE}), got type "${envelope.type}"`] };

  const p = envelope.payload || {};
  // 0.39.190 bundles carry the definition as `hat_definition` (schema.agent's own `hat` is a name string);
  // legacy .repo_agent bundles carried it as `hat`.
  const hd = p.hat_definition || (p.hat && typeof p.hat === 'object' ? p.hat : null);
  if (!hd || !hd.baseAgent) return { ok: false, errors: ['export carries no usable hat definition'] };

  const RH = _hat();
  const forge = require('./hat-forge.js');

  // Forge for the TARGET repo's own role, not the source's. seedKeyFor()
  // owns that naming, so a repo that already has an agent is found rather
  // than collided with.
  const existing = RH.getRepoHat(repo.uuid);
  let hatResult = { ok: true, reused: true };
  if (!existing) {
    hatResult = forge.forge({
      name: name || RH.hatNameFor(repo.uuid),
      seedKey: RH.seedKeyFor(repo.uuid),
      baseAgent: hd.baseAgent,
      allowedAgents: hd.allowedAgents || undefined,
      // A toolScope naming a tool this machine does not have is refused by
      // forge() — correct, and reported rather than silently trimmed.
      toolScope: (hd.toolScope && hd.toolScope.length) ? hd.toolScope : undefined,
      model: hd.model || undefined,
      allowedIntents: hd.allowedIntents || undefined,
      responsibilities: (hd.responsibilities && hd.responsibilities.length) ? hd.responsibilities : undefined,
      personaPrompt: hd.personaPrompt || undefined, // replaced below
    });
    if (!hatResult.ok) return { ok: false, errors: hatResult.errors, schema: hatResult.schema };
  }

  // Restore the learned model, merging on dedupKey.
  const mem = _mem();
  let restored = 0, merged = 0, rejected = 0;
  for (const o of (p.observations || [])) {
    const r = mem.record(repo.uuid, { kind: o.kind, text: o.text, source: o.source || 'imported', evidence: o.evidence || null });
    if (!r.ok) { rejected++; continue; }
    if (r.deduped) merged++; else restored++;
  }

  let exchanges = 0;
  if (includeLog && Array.isArray(p.exchanges)) {
    // Deliberately NOT restored by default. A transcript from another
    // machine is someone else's conversation; it is evidence, not this
    // compartment's history, and silently folding it in would make
    // history() lie about what happened here.
    exchanges = p.exchanges.length;
  }

  // Re-ground the persona against THIS machine's index + the merged
  // observation set. The exported persona described a different tree.
  const refreshed = RH.refreshRepoHatPersona({ repo, repoDir });

  return {
    ok: true,
    hatReused: !!existing,
    hatName: (existing || hatResult.hat || hatResult.record || {}).name || null,
    restored, merged, rejected,
    exchangesInExport: exchanges,
    personaRegrounded: !!refreshed.ok,
    personaReason: refreshed.ok ? undefined : (refreshed.errors || []).join('; '),
    indexAtExport: p.indexAtExport || null,
  };
}

module.exports = { MODULE_ID, VERSION, TYPE, LEGACY_TYPE, DEFAULT_DIR, materialise, importAgent, commandIds, commandSource };
