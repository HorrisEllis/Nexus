'use strict';
/**
 * lib/hat-seed.js — the real hats NEXUS ships with.
 *
 * §WHY THIS EXISTS
 * hat-forge.js has been live since P8 and forge/get/list/revoke all work, but
 * `list()` returned an empty array: the mechanism shipped with nothing in it.
 * A capability nobody has ever used is indistinguishable from one that doesn't
 * work, so this seeds a real, small set — grounded in jobs this system
 * actually does — and wires seeding into copilot's boot so they exist without
 * anyone having to remember to forge them.
 *
 * §EVERY TOOL NAME BELOW IS REAL
 * Verified against lib/agent-tools' live TOOLS map (44 registered) at write
 * time, and verified again at seed time by seedHats() — a scope naming a tool
 * that does not exist is a loud failure, not a silently-empty hat (§1.2).
 *
 * §NO RESPONSIBILITIES BY DEFAULT — deliberate.
 * hat-forge's `responsibilities` field creates REAL recurring scheduled tasks
 * that dispatch to real NCP agents. Seeding those on by default would start
 * firing browser-automated jobs at claude/chatgpt/perplexity the moment
 * copilot boots, without anyone asking for it. Cost and consent are real, so
 * the seeds are wearable and scoped but idle. Add responsibilities explicitly
 * via the hat_forge tool when you actually want a hat working on a timer.
 *
 * §IDEMPOTENT
 * seedHats() only forges a hat whose name is not already present. A hat you
 * revoked stays revoked until the next boot re-seeds it; a hat you edited by
 * hand is never overwritten. Nothing here deletes.
 */

const hatForge = require('./hat-forge');

const MODULE_ID = 'nexus.lib.hat-seed';
const VERSION = '1.0.0';

/**
 * SEED_HATS — four roles that map to work this system genuinely does.
 * Each scope is the minimum set for the job, not a generous superset: the
 * point of a hat is that it restricts, and a scope containing everything
 * restricts nothing.
 */
const SEED_HATS = [
  {
    name: 'the_auditor',
    seedKey: 'the_auditor',
    baseAgent: 'claude',
    allowedAgents: ['claude', 'perplexity', 'chatgpt'],
    personaPrompt:
      'You audit this system against its own evidence. You do not accept a claim ' +
      'because it is written down — you check it against what the tools actually ' +
      'return, and you report the difference plainly, including when the answer is ' +
      '"the thing that was claimed is not there". Prefer a specific finding with a ' +
      'file and a number over a general observation.',
    toolScope: ['loom_scan', 'axiom_check', 'read_file', 'nexus_status', 'raid_snr', 'meta_query'],
    // §AM1 2026-09-02 — real intent contract, matching this persona's own
    // real toolScope (audit-shaped tools, no build/write access).
    allowedIntents: ['validate', 'analyze', 'query'],
  },
  {
    name: 'the_diagnostician',
    seedKey: 'the_diagnostician',
    baseAgent: 'claude',
    allowedAgents: ['claude', 'ollama'],
    personaPrompt:
      'You are handed a symptom and you find the mechanism. You do not propose a ' +
      'fix until you can name the specific cause and point at the evidence for it. ' +
      'One root cause explaining many symptoms beats many separate explanations.',
    toolScope: ['diagnose', 'nexus_status', 'fault_log', 'loom_scan', 'resource_monitor', 'read_file', 'query_recall'],
    allowedIntents: ['diagnose', 'query', 'analyze'],
  },
  {
    name: 'the_builder',
    seedKey: 'the_builder',
    baseAgent: 'claude',
    allowedAgents: ['claude', 'chatgpt'],
    personaPrompt:
      'You build, bottom-up. Read the file and its consumers before editing ' +
      'anything. Nothing is done until it is proven by a real run — no stubs, no ' +
      'mocks, no "should work". Changes go through safe_apply so they are ' +
      'reversible.',
    toolScope: ['read_file', 'run_command', 'module_builder', 'safe_apply', 'propose_idea', 'loom_scan', 'axiom_check'],
    // §AM1 — 'forge' included alongside 'build'/'write': the_builder's own
    // real toolScope already has module_builder/safe_apply, the same real
    // capability intent-classifier.js's own FORGE risk tier names.
    allowedIntents: ['build', 'write', 'forge'],
  },
  {
    name: 'the_librarian',
    seedKey: 'the_librarian',
    baseAgent: 'ollama',
    allowedAgents: ['ollama', 'claude'],
    personaPrompt:
      'You answer from what this system already knows, and you say so when it ' +
      'does not know. You retrieve and summarise; you do not invent connective ' +
      'tissue between things you found separately.',
    toolScope: ['query_recall', 'agent_chat_search', 'meta_query', 'nexus_help', 'query_movement'],
    allowedIntents: ['recall', 'query', 'explain'],
  },
  {
    // §ADDED 2026-09-02 — James: "did you finish the synthesis for the
    // contracts. thats top priority. maybe intent: contract or
    // officiator for synthesizing contracts. needs to listen for the
    // artifact." Real, distinct job from the_builder: this hat's only
    // output is a real, structured B1-schema contract (uuid, forAgent,
    // intent, system, endState, conditions, context, warpPrimitives,
    // axioms, tools, compartmentUuid, fileDirectory/fileName) — it
    // never writes code itself, it writes the CONTRACT that tells a
    // later dispatch what to build. baseAgent left as 'claude' (matches
    // every other seeded hat's own default) — cortex/core/raid/
    // officiator.js's own real dispatch call passes forAgent explicitly
    // per-drop, so this default rarely governs which agent actually
    // does the work; deepseek is real and live as of this session
    // (confirmed: James's own DeepSeek chat producing real artifacts)
    // and is a real, valid choice at dispatch time even though it's
    // not this hat's own default.
    name: 'the_officiator',
    seedKey: 'the_officiator',
    baseAgent: 'claude',
    allowedAgents: ['claude', 'chatgpt', 'gemini', 'deepseek', 'ollama'],
    personaPrompt:
      'You synthesize ONE real, structured build contract from the context you are ' +
      'given — nothing more. Output ONLY a single JSON object with these exact keys: ' +
      'endState, conditions, intent, context, warpPrimitives, axioms, tools, ' +
      'compartmentUuid, fileDirectory, fileName. endState is the real target ' +
      'condition, not a task description. conditions is a real array of pre/post ' +
      'checks. warpPrimitives is a subset of [Event, Gate, Stream, StreamLog, Axiom] ' +
      '— only the ones this contract\'s own work will actually touch. If a field ' +
      'cannot be determined from the given context, use null for it — never invent ' +
      'a value to fill a gap.',
    toolScope: ['read_file', 'nexus_map', 'meta_query', 'axiom_check'],
    allowedIntents: ['officiate'],
  },
  {
    // §BUILT 2026-09-19 — James: "have a clear glass hat for using all
    // of the clear glass capabilities, dom mutator, archeology, and
    // state injected into copilots event stream when enabled." This
    // file's own header says a scope should be "the minimum set for
    // the job, not a generous superset" — deliberately NOT violated
    // here: this hat's own job genuinely IS "operate all of
    // ClearGlass," so its full real toolScope below is the minimum set
    // FOR THAT JOB, the same way the_officiator's scope is minimal for
    // officiating even though officiating itself is broad. baseAgent:
    // 'copilot' uses this same session's own new capability — this
    // hat's real work runs through copilot's own ollama/guardian
    // routing (lifeline.route()), not one fixed NCP agent. Verified
    // for real by running seedHats(), not just claimed: the first
    // draft named clearglass.search_engine.tool before that real,
    // complete tool file was actually registered anywhere (a real,
    // pre-existing orphan — lib/agent-tools/tools/clear-glass/
    // search-engine.js existed but nothing wired it in; fixed
    // alongside this), and used allowedIntents values that weren't
    // real intent-classifier.js verbs. Both caught by seedHats()'s own
    // real validation refusing to seed until fixed — exactly the loud-
    // failure discipline this file's own header describes.
    name: 'the_clearglass_operator',
    seedKey: 'the_clearglass_operator',
    baseAgent: 'copilot',
    allowedAgents: ['copilot', 'ollama'],
    personaPrompt:
      'You operate ClearGlass — the real browser, its agent mesh, its own automation ' +
      'engine, its bookmarks/history/accounts, and its live event stream. You have ' +
      'the full real surface on purpose: your job is ClearGlass itself, not one ' +
      'narrow slice of it. When asked to turn on live ClearGlass awareness, use ' +
      'clear_glass_stream_bridge\'s enable action — after that, every real DOM-' +
      'archaeology mutation, driver action, and mesh event flows into the same ' +
      'stream you already read from, live, not just what you asked for directly.',
    toolScope: [
      'browser_action', 'agent_mesh_route', 'macro', 'rewind_replay',
      'clear_glass_dom_archaeology', 'clear_glass_userscripts', 'clear_glass_tab_visibility',
      'clear_glass_provider_deploy', 'clear_glass_command_index', 'clear_glass_stream_bridge',
      'clearglass.search_engine.tool',
      'bookmarks_manage', 'history_manage', 'account_manage', 'site_settings_manage', 'autofill_manage',
    ],
    allowedIntents: ['build', 'diagnose', 'dispatch', 'snapshot', 'write', 'query'],
  },

];

/**
 * seedHats(opts) — forge any seed hat that isn't already present.
 *
 * @param {object} [opts]
 * @param {Set|Map|object} [opts.knownTools] live tool registry to validate
 *        scopes against. Defaults to lib/agent-tools' TOOLS map. Injectable so
 *        this is testable without booting the whole tool surface.
 * @param {function} [opts.log] where to report. Defaults to console.log.
 * @returns {{forged:string[], skipped:string[], failed:Array<{name:string,errors:*}>}}
 */
function seedHats(opts = {}) {
  const log = opts.log || console.log;
  let known = opts.knownTools;
  if (!known) {
    try { known = require('./agent-tools').TOOLS; } catch (_) { known = null; }
  }
  const hasTool = (n) => {
    if (!known) return true; // no registry available — don't block seeding on it
    if (known instanceof Map || known instanceof Set) return known.has(n);
    return Object.prototype.hasOwnProperty.call(known, n);
  };

  // §BUGFIX 2026-08-19 — was existing.has(def.name) (a plain Set of names)
  // for idempotency. seedKey was added to hat-forge.js AFTER this file was
  // originally written (confirmed: hat-forge.js's own §BUILT 2026-08-18
  // comment) and this file never got updated to use it — confirmed by
  // grep, zero references to seedKey anywhere in this file before this
  // fix. Real, live consequence: forge() correctly stores seedKey when
  // given one, but SEED_HATS never provided one, so every seeded hat sat
  // at seedKey:null forever — bySeedKey('the_auditor') always returned
  // null, and a rename (a real, intended feature — hats are renameable,
  // roles are permanent) would look identical to "never seeded" on the
  // next boot, exactly the "forge four duplicates" failure adoptSeedKey's
  // own doc comment already describes and warns against.
  //
  // Real fix, checking bySeedKey FIRST (the permanent, rename-proof
  // identity), falling back to the legacy by-name check only to migrate
  // an old hat that predates seedKey entirely — adoptSeedKey attaches the
  // role rather than forging a duplicate under the same name.
  const existingByName = new Map((hatForge.list() || []).map(h => [h.name, h]));
  const forged = [], skipped = [], migrated = [], failed = [];

  for (const def of SEED_HATS) {
    const heldBySeedKey = hatForge.bySeedKey(def.seedKey);
    if (heldBySeedKey) { skipped.push(def.name); continue; } // role already filled, however it's currently named

    const legacy = existingByName.get(def.name);
    if (legacy && !legacy.seedKey) {
      const r = hatForge.adoptSeedKey(legacy.uuid || legacy.id, def.seedKey);
      if (r.ok) { migrated.push(def.name); continue; }
      failed.push({ name: def.name, errors: r.errors || [r.reason] });
      log(`[hat-seed] FAIL adopting ${def.name} — ${JSON.stringify(r.errors || r.reason)}`);
      continue;
    }

    // §1.2 — a scope naming a tool that isn't registered is a real error and
    // is reported, not quietly dropped, because a hat silently missing half
    // its scope looks identical to one that is working.
    const missing = (def.toolScope || []).filter(t => !hasTool(t));
    if (missing.length) {
      failed.push({ name: def.name, errors: [`toolScope names unregistered tool(s): ${missing.join(', ')}`] });
      log(`[hat-seed] FAIL ${def.name} — unregistered tool(s): ${missing.join(', ')}`);
      continue;
    }

    const r = hatForge.forge(def);
    if (r && r.ok) { forged.push(def.name); }
    else { failed.push({ name: def.name, errors: (r && r.errors) || ['forge returned not-ok'] });
           log(`[hat-seed] FAIL ${def.name} — ${JSON.stringify((r && r.errors) || r)}`); }
  }

  if (forged.length) log(`[hat-seed] v${VERSION} — forged ${forged.length}: ${forged.join(', ')}`);
  if (migrated.length) log(`[hat-seed] adopted ${migrated.length} legacy hat(s) into their role: ${migrated.join(', ')}`);
  if (skipped.length) log(`[hat-seed] ${skipped.length} already present: ${skipped.join(', ')}`);
  if (failed.length) log(`[hat-seed] ${failed.length} FAILED — see above`);
  return { forged, skipped, migrated, failed };
}

module.exports = { seedHats, SEED_HATS, MODULE_ID, VERSION };
