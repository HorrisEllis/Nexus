'use strict';
/**
 * lib/repo-hat.js — the per-repo, compartment-constrained agent.
 * UUID: nexus-repo-hat-v1-0000-2026-0920-jamesbrooks-001
 * Version: 0.1.0
 *
 * §REPO-HAT 2026-09-20 — James: "each repo creates a hat that constrains
 * the agent to the compartment, and the index of the compartment. Like
 * that agent only exists for the project and sole purpose is to help,
 * understand, fix, and expand the projects."
 *
 * §NOT A NEW SUBSYSTEM. lib/hat-forge.js already is this mechanism: a
 * named, reusable bundle of (base agent + scoped tools + persona +
 * responsibilities), stored as DATA, with every reference proven real at
 * forge time — a toolScope naming a tool that does not exist is refused,
 * not silently ignored. This file is the repo-shaped caller of it. It
 * adds exactly three things forge() cannot know on its own:
 *
 *   1. IDENTITY — one hat per repo, found again on the next call rather
 *      than forged twice. Uses hat-forge's own seedKey, which already
 *      refuses two live hats claiming the same role, so the uniqueness
 *      rule lives in one place instead of being re-implemented here.
 *
 *   2. CONSTRAINT — the toolScope below is curated for "understand, fix,
 *      expand one project", and every name in it is verified against the
 *      live registry before forging. A hat carrying all 101 tools is not
 *      constrained to anything.
 *
 *   3. GROUNDING — the persona is built from the repo's REAL index:
 *      its atlas (file count, languages, kinds), its chunk count, its
 *      compartment id. Not a template with the name substituted in. If
 *      the repo has not been indexed, the persona says so plainly rather
 *      than describing a codebase nobody has read.
 *
 * §WHAT THIS DOES NOT DO. Forging a hat does not sandbox anything at the
 * OS level. toolScope is a real restriction on which tools the agent is
 * offered, and that is a genuine constraint — but it is a capability
 * boundary, not a filesystem jail. A tool like run_command, if scoped in,
 * can still reach outside the repo directory. That limit is stated here
 * rather than left for someone to discover.
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const MODULE_ID = 'nexus-repo-hat-v1-0000-2026-0920-jamesbrooks-001';
const VERSION = '0.1.0';

function _forge() { return require(path.join(ROOT, 'lib/hat-forge.js')); }

/**
 * The tools a project agent needs to help, understand, fix and expand ONE
 * project — and nothing else. Every name here exists in the live registry
 * (lib/agent-tools/index.js); forge() re-proves that at forge time and
 * refuses the whole hat if any one of them has gone away.
 *
 * Deliberately absent: account_manage, site_settings_manage, browser_*,
 * clear_glass_*, agent_council, switch_agent and the rest of the host-wide
 * surface. A project agent has no business managing accounts or driving a
 * browser, and leaving them out is the constraint.
 */
const REPO_TOOL_SCOPE = Object.freeze([
  // understand
  'read_file', 'file_tree', 'search_files', 'nexus_map', 'analyze',
  // fix
  'diagnose', 'stub_finder', 'safe_apply', 'run_command', 'fault_log',
  // expand
  'module_builder', 'spec_wizard', 'propose_idea',
  // the compartment itself + its history
  'cos_compartment', 'cos_playground',
  'versionium_commit', 'versionium_history', 'versionium_restore',
  // read this project's chunk nodes for context (search/list, then get one chunk)
  'idearium.repo_chunks.tool',
  // 0.39.272 — every memory system and graph, one door (lib/context-atlas.js)
  'nexus.context.tool',
  // 0.39.273 — the codebase tools: understand, change and check this project (lib/agent-tools/tools/idearium/code.js)
  'idearium.code_map.tool', 'idearium.code_search.tool', 'idearium.code_grep.tool', 'idearium.code_chunk.tool', 'idearium.code_read.tool',
  'idearium.code_refs.tool', 'idearium.code_edit.tool', 'idearium.code_write.tool', 'idearium.code_batch.tool', 'idearium.code_check.tool',
  'idearium.code_changes.tool',
  // 0.39.362 — the work surface: the person's view of every change; prove proposals before saying done
  'idearium.work_surface.tool',
  // 0.39.278 — the tools as layers: list the categories, open one (lib/agent-tools/tools/nexus/tool-layers.js)
  'nexus.tools.tool', 'nexus.tools_expand.tool',
]);

/** Deterministic, stable, and legal under hat-forge's own name rule
 *  (snake_case, 3-49 chars, starts with a letter). */
function hatNameFor(repoUuid) {
  const slug = String(repoUuid || '').replace(/-/g, '').slice(0, 16).toLowerCase();
  return `repo_${slug || 'unknown'}`;
}

/** The role this hat holds. hat-forge refuses a second live hat with the
 *  same seedKey, which is exactly the "one agent per project" rule.
 *
 *  §FIXED 2026-09-20 — this was `repo:<full-uuid>`, which hat-forge's own
 *  validate() rejects: a seedKey must be snake_case, 3-49 chars, starting
 *  with a letter (colons and hyphens are not legal, and a full uuid plus
 *  prefix overruns 49 anyway). Caught by lib/repo-hat.smoke.cjs on the
 *  very first forge. Same 16-char slug as the name, so the two stay
 *  derivable from each other and from the repo uuid. */
function seedKeyFor(repoUuid) {
  const slug = String(repoUuid || '').replace(/-/g, '').slice(0, 16).toLowerCase();
  return `project_agent_${slug || 'unknown'}`;
}

/**
 * Read the repo's real index. Returns what is actually there — never a
 * placeholder. An unindexed repo returns { indexed:false } and the
 * persona below says so.
 */
function readRepoIndex(repoDir) {
  const out = { indexed: false, fileCount: null, chunkCount: null, languages: [], kinds: [], failedCount: null };
  if (!repoDir || !fs.existsSync(repoDir)) return out;
  try {
    const atlasPath = path.join(repoDir, 'atlas.json');
    if (fs.existsSync(atlasPath)) {
      const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
      out.indexed = true;
      out.fileCount = atlas.fileCount ?? null;
      out.failedCount = atlas.failedCount ?? null;
      out.languages = Object.entries(atlas.byLanguage || {})
        .sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`);
      out.kinds = Object.entries(atlas.byKind || {})
        .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`);
    }
  } catch (_) { /* leave as unindexed — never guess */ }
  try {
    const idx = path.join(repoDir, 'chunks', 'index.json');
    if (fs.existsSync(idx)) out.chunkCount = JSON.parse(fs.readFileSync(idx, 'utf8')).length;
  } catch (_) { /* stays null — honestly unknown, not zero */ }
  return out;
}

/**
 * The persona, built from real facts. Every number in it came off disk.
 * If nothing has been indexed, it says exactly that — an agent told it is
 * working on "a 0-file project" would be lied to.
 *
 * §LEARNED 2026-09-20 — James: "learns as it works, updating the .hat and
 * .agent as models." The persona is now COMPOSED from two sources rather
 * than written from one: grounded facts read off the atlas (below), and
 * observations the agent has accumulated (lib/repo-hat-memory.js).
 *
 * The composition is what makes refreshRepoHatPersona() safe. That
 * function rewrites personaPrompt wholesale, on purpose — a persona still
 * claiming "not indexed yet" after indexing is a lie repeated on every
 * dispatch. If learning were accreted INTO this string it would be
 * destroyed by the next refresh, silently. Keeping it in its own store and
 * re-composing here means a refresh re-grounds the facts and preserves the
 * learning, which is the only arrangement where both stay true.
 *
 * Learning is read here, never written — this stays a pure function of
 * (repo, index, store). Nothing about building a persona should mutate
 * what the agent knows.
 */
function buildPersona({ repoName, repoUuid, compartmentId, index }) {
  const lines = [
    `You are the project agent for "${repoName}".`,
    `You exist for this one project and nothing else. Your purpose is to help understand, fix, and expand it.`,
    ``,
    `Compartment: ${compartmentId}`,
    `Repository:  ${repoUuid}`,
  ];
  if (index.indexed) {
    lines.push(
      ``,
      `To work on this project's code (repoUuid="${repoUuid}"): idearium.code_map.tool for its shape, idearium.code_search.tool to find code by what it does, idearium.code_chunk.tool to read one chunk with its card (what it uses, what uses it, its tests), idearium.code_edit.tool / idearium.code_write.tool to change it, idearium.code_check.tool to verify. Read what you need; do not guess what is in a file. (idearium.repo_chunks.tool still lists raw chunk addresses.)`,
    );
    lines.push(
      ``,
      `What has actually been indexed for this project:`,
      `- files: ${index.fileCount ?? 'unknown'}${index.failedCount ? ` (${index.failedCount} failed to parse)` : ''}`,
      `- chunks: ${index.chunkCount ?? 'unknown'}`,
    );
    if (index.languages.length) lines.push(`- languages: ${index.languages.join(', ')}`);
    if (index.kinds.length) lines.push(`- kinds: ${index.kinds.join(', ')}`);
    lines.push(
      ``,
      `Read from that index before acting. Map before you touch anything.`,
    );
  } else {
    lines.push(
      ``,
      `This project has NOT been indexed yet — there is no atlas, no chunk index,`,
      `no dependency graph. Do not describe its contents as if you had read them.`,
      `Run the import pipeline yourself: idearium.repo_chunks.tool {"repoUuid":"${repoUuid}","action":"reindex"}.`,
      `Until it has run, read files directly and say plainly that you are working without an index.`,
    );
  }
  lines.push(
    ``,
    `Rules you hold to:`,
    `- Stay inside this project. If a request is about another project or the host system, say so and stop.`,
    `- Never report something as working that you have not seen work.`,
    `- If you do not know, say you do not know. Do not fill a gap with a plausible guess.`,
    `- Prefer reading the real file over recalling what it probably says.`,
  );

  // Learned observations, if any. personaBlock() returns null — not an
  // empty heading — when nothing has been learned: a persona reading
  // "What you have learned:" followed by nothing tells the model this
  // project has no conventions, a stronger and falser claim than silence.
  // A store that is unreachable must never block forging a hat, so this
  // fails soft and the persona is simply the grounded half.
  try {
    const block = require('./repo-hat-memory.js').personaBlock(repoUuid);
    if (block) lines.push(block);
  } catch (_) { /* grounded persona alone is still correct and complete */ }

  return lines.join('\n');
}

// ── §CODER-LINK 0.39.276 — a spec's code repo wears its original repo's hat ───────────────────────────────────────
// James: "the code tab needs to use the same hat from the original repo. when you click code in the original spec, it
// creates a new repo, i need that repo to use the same hat ... and full agent settings in the original repo."
// The Code button (speceng.codegen) makes a second repo for the code spec. That repo now carries a LINK to the repo the
// spec came from. Through the link the code repo has no hat of its own: it wears the original's, and its agent settings
// (backend switch, Ollama model, tool scope, prompt blocks) are the original's — edited there, in one place. What stays
// the code repo's own: its exchanges, its compartment, and the repoUuid the persona note names for the codebase tools.
// The link lives in a jaa table, not in the ESM repo record, so lib/ (CommonJS) can resolve it with no repo layer.
const LINK_TABLE = 'repo_agent_links';
function _jaa() { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }

/** linkRow(repoUuid) — { repoUuid, originUuid, originName, originCompartmentId } or null. */
function linkRow(repoUuid) {
  if (!repoUuid) return null;
  try { return (_jaa().query(LINK_TABLE, r => r.repoUuid === repoUuid, 1) || [])[0] || null; } catch (_) { return null; }
}

/** originOf(repoUuid) — the repo whose agent this one shares, or null. One hop only; a link to itself is ignored. */
function originOf(repoUuid) {
  const row = linkRow(repoUuid);
  return row && row.originUuid && row.originUuid !== repoUuid ? row.originUuid : null;
}

/** agentKeyFor(repoUuid) — the repo whose settings row, prompt blocks and hat this repo uses (itself when unlinked). */
function agentKeyFor(repoUuid) { return originOf(repoUuid) || repoUuid; }

/**
 * linkCoder(codeRepo, originRepo) — the code repo shares the original's agent. Refuses a link that would chain
 * (the origin is itself linked) or loop, by name, rather than resolving a chain nobody can see.
 */
function linkCoder(codeRepo, originRepo) {
  if (!codeRepo || !codeRepo.uuid || !originRepo || !originRepo.uuid) return { ok: false, errors: ['a code repo and an original repo, each with a uuid, are required'] };
  if (codeRepo.uuid === originRepo.uuid) return { ok: false, errors: ['a repo cannot share its own agent'] };
  if (originOf(originRepo.uuid)) return { ok: false, errors: [`${originRepo.uuid} shares another repo's agent — link to the repo that owns it`] };
  const jaa = _jaa(), row = linkRow(codeRepo.uuid);
  const data = { originUuid: originRepo.uuid, originName: originRepo.name || null, originCompartmentId: originRepo.compartmentId || null, updatedAt: Date.now() };
  try {
    if (row) { if (row.originUuid === originRepo.uuid) return { ok: true, linked: false, originUuid: originRepo.uuid }; jaa.update(LINK_TABLE, { uuid: row.uuid }, data); }
    else jaa.insert(LINK_TABLE, { uuid: require('crypto').randomUUID(), repoUuid: codeRepo.uuid, ...data });
  } catch (e) { return { ok: false, errors: [`could not store the link: ${e.message}`] }; }
  return { ok: true, linked: true, originUuid: originRepo.uuid };
}

/** unlinkCoder(repoUuid) — the repo goes back to its own hat and settings (its own hat is forged on next use). */
function unlinkCoder(repoUuid) {
  const row = linkRow(repoUuid);
  if (!row) return { ok: false, errors: [`${repoUuid} shares no agent`] };
  try { _jaa().delete(LINK_TABLE, r => r.repoUuid === repoUuid); } catch (e) { return { ok: false, errors: [e.message] }; }
  return { ok: true, unlinked: row.originUuid };
}

/**
 * coderNote(repo) — the one honest line added to the shared persona when it is worn IN the code repo: which repo it is
 * working in now, so the codebase tools get the right repoUuid. '' for a repo that has its own hat.
 */
function coderNote(repo) {
  const row = repo && repo.uuid ? linkRow(repo.uuid) : null;
  if (!row || !row.originUuid) return '';
  return [
    ``,
    `You are wearing the hat of "${row.originName || row.originUuid}" (repoUuid="${row.originUuid}") — the project this code was generated from.`,
    `Right now you are working in its code repository "${repo.name || repo.uuid}" (repoUuid="${repo.uuid}", compartment ${repo.compartmentId || 'unknown'}).`,
    `Pass repoUuid="${repo.uuid}" to the idearium.code_* tools to read and change this code; the original project's spec and decisions are the source of what it should do.`,
  ].join('\n');
}

/** wearable(hat, repo) — the hat as it is worn in this repo: the shared persona plus coderNote for a linked repo. */
function wearable(hat, repo) {
  if (!hat) return hat;
  const note = coderNote(repo);
  return note ? { ...hat, personaPrompt: `${hat.personaPrompt || ''}${note}` } : hat;
}

/**
 * getRepoHat(repoUuid) — the live hat for this repo, or null.
 * Resolved by seedKey (the role), not by name, so a renamed hat is still
 * found. hat-forge's own rename() keeps uuid and seedKey stable.
 */
function getRepoHat(repoUuid) {
  try { return _forge().bySeedKey(seedKeyFor(agentKeyFor(repoUuid))) || null; }   // §0.39.276 — a linked code repo wears its original's hat
  catch (_) { return null; }
}

/**
 * ensureRepoHat({ repo, repoDir, baseAgent }) — idempotent.
 * Returns { ok, hat, created } or { ok:false, errors }.
 *
 * Refuses a repo with no compartment: "constrains the agent to the
 * compartment" is the whole point, and a hat scoped to no compartment
 * would be a host-wide agent wearing a project's name.
 */
function ensureRepoHat({ repo, repoDir, baseAgent = 'copilot' } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };
  if (!repo.compartmentId) {
    return { ok: false, errors: [
      'this repo has no compartmentId — a project agent is constrained BY its compartment, and one scoped to nothing would be a host-wide agent wearing a project name. Import through the project-import flow (which creates a real COS compartment) or attach one first.',
    ] };
  }

  const existing = getRepoHat(repo.uuid);
  if (existing) return { ok: true, hat: existing, created: false, sharedFrom: originOf(repo.uuid) };

  // §0.39.276 — a linked code repo never forges a hat of its own: the ORIGINAL's is forged (or found), so both repos
  // wear one hat. The original's index is not read from here (this call was given the code repo's dir), so its persona
  // says "not indexed" until the original repo refreshes its hat — stated by the persona, not guessed.
  const link = linkRow(repo.uuid);
  if (link && link.originUuid) {
    if (!link.originCompartmentId) return { ok: false, errors: [`the original repo ${link.originUuid} has no compartmentId on record — forge its agent from that repo first`] };
    const f = _forge().forge({
      name: hatNameFor(link.originUuid), seedKey: seedKeyFor(link.originUuid), baseAgent, toolScope: [...REPO_TOOL_SCOPE],
      personaPrompt: buildPersona({ repoName: link.originName || link.originUuid, repoUuid: link.originUuid, compartmentId: link.originCompartmentId, index: readRepoIndex(null) }),
    });
    if (!f.ok) return { ok: false, errors: f.errors, schema: f.schema };
    return { ok: true, hat: f.hat || f.record || f, created: true, sharedFrom: link.originUuid };
  }

  const index = readRepoIndex(repoDir);
  const forge = _forge();

  const def = {
    name: hatNameFor(repo.uuid),
    seedKey: seedKeyFor(repo.uuid),
    baseAgent,
    toolScope: [...REPO_TOOL_SCOPE],
    personaPrompt: buildPersona({
      repoName: repo.name || repo.uuid,
      repoUuid: repo.uuid,
      compartmentId: repo.compartmentId,
      index,
    }),
  };

  const result = forge.forge(def);
  if (!result.ok) return { ok: false, errors: result.errors, schema: result.schema };
  return { ok: true, hat: result.hat || result.record || result, created: true, index };
}

/**
 * refreshRepoHatPersona({ repo, repoDir }) — re-ground an existing hat
 * against the index as it is NOW. A hat forged before the repo was
 * chunked carries a persona that says "not indexed yet"; once the
 * pipeline has run, that statement is stale, and a stale persona is a
 * lie told to the agent on every dispatch.
 *
 * Only the persona is rewritten. uuid, seedKey, name, toolScope and any
 * scheduled responsibilities are left exactly as they are.
 */
function refreshRepoHatPersona({ repo, repoDir } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };
  // §0.39.276 — refreshing from a code repo would rewrite the shared hat with the CODE repo's identity. It is the
  // original's hat: refresh it there.
  if (originOf(repo.uuid)) return { ok: false, errors: [`this repo wears the hat of ${originOf(repo.uuid)} — refresh it from that repo`], sharedFrom: originOf(repo.uuid) };
  const hat = getRepoHat(repo.uuid);
  if (!hat) return { ok: false, errors: [`no hat for repo ${repo.uuid} — forge one first`] };

  const index = readRepoIndex(repoDir);
  const personaPrompt = buildPersona({
    repoName: repo.name || repo.uuid,
    repoUuid: repo.uuid,
    compartmentId: repo.compartmentId,
    index,
  });

  // hat-forge owns the table; go through its own update path rather than
  // writing the row from here.
  try {
    const forge = _forge();
    if (typeof forge.update === 'function') {
      // §0.39.273 — the refreshed persona names the codebase tools; a hat forged before them must be able to call what
      // its persona tells it to. The project defaults it lacks are ADDED (nothing is removed) and named in the result.
      const had = Array.isArray(hat.toolScope) ? hat.toolScope : [];
      const toolsAdded = REPO_TOOL_SCOPE.filter(t => !had.includes(t));
      const patch = toolsAdded.length ? { personaPrompt, toolScope: [...had, ...toolsAdded] } : { personaPrompt };
      const r = forge.update(hat.uuid || hat.id, patch);
      if (r && r.ok === false) return { ok: false, errors: r.errors || ['update failed'] };
      return { ok: true, hat: getRepoHat(repo.uuid), index, refreshed: true, toolsAdded };
    }
    // No update() in this build of hat-forge — say so rather than
    // reaching around it into the store.
    return { ok: false, errors: ['lib/hat-forge.js exposes no update() in this build — persona cannot be refreshed in place; revoke and re-forge instead'], index };
  } catch (e) {
    return { ok: false, errors: [`persona refresh failed: ${e.message}`] };
  }
}

/**
 * learn({ repo, repoDir, kind, text, source, evidence }) — record an
 * observation AND push it into the live hat.
 *
 * §THIS IS THE "UPDATING THE .hat" HALF. Recording alone changes a table
 * nobody reads at dispatch time. The hat's personaPrompt is what actually
 * reaches the model, so a real learning step has to end with the hat row
 * itself updated — otherwise the agent "learns" into a drawer and behaves
 * identically on the next prompt, which is the exact shape of a feature
 * that pretends to work.
 *
 * Returns { ok, observation, deduped, hatUpdated }. hatUpdated:false with
 * a reason is a real, reportable outcome — the observation is still
 * stored, and a later refresh will pick it up — never swallowed.
 */
function learn({ repo, repoDir, kind, text, source = 'agent', evidence = null } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };

  const mem = require('./repo-hat-memory.js');
  // §0.39.276 — what a coder learns is learned by the shared agent: stored under the original repo, whose persona
  // composes it in on its next refresh (the persona is not rebuilt from the code repo — see refreshRepoHatPersona).
  const sharedFrom = originOf(repo.uuid);
  const rec = mem.record(sharedFrom || repo.uuid, { kind, text, source, evidence });
  if (!rec.ok) return rec;
  if (sharedFrom) return { ...rec, hatUpdated: false, sharedFrom, reason: `stored on the original repo's agent (${sharedFrom}); its hat picks it up when that repo refreshes` };

  // Re-compose the persona so the new observation is live on the next
  // dispatch. A repo with no hat yet is not an error: the observation is
  // banked, and ensureRepoHat() will compose it in when the hat is forged.
  const hat = getRepoHat(repo.uuid);
  if (!hat) {
    return { ...rec, hatUpdated: false, reason: 'no hat forged for this repo yet — observation stored and will be composed in when one is' };
  }

  const refreshed = refreshRepoHatPersona({ repo, repoDir });
  return refreshed.ok
    ? { ...rec, hatUpdated: true, hat: refreshed.hat }
    : { ...rec, hatUpdated: false, reason: (refreshed.errors || ['persona refresh failed']).join('; ') };
}

/** revokeRepoHat(repoUuid) — hat-forge's own revoke, by this repo's role. */
function revokeRepoHat(repoUuid) {
  if (originOf(repoUuid)) return { ok: false, errors: [`this repo wears the hat of ${originOf(repoUuid)} — revoke it there, or unlink this repo first`] };
  const hat = getRepoHat(repoUuid);
  if (!hat) return { ok: false, errors: [`no hat for repo ${repoUuid}`] };
  try {
    const r = _forge().revoke(hat.uuid || hat.id);
    return (r && r.ok === false) ? { ok: false, errors: r.errors || ['revoke failed'] } : { ok: true, revoked: hat.name };
  } catch (e) { return { ok: false, errors: [`revoke failed: ${e.message}`] }; }
}

module.exports = {
  MODULE_ID, VERSION, REPO_TOOL_SCOPE,
  hatNameFor, seedKeyFor, readRepoIndex, buildPersona,
  getRepoHat, ensureRepoHat, refreshRepoHatPersona, revokeRepoHat, learn,
  linkCoder, unlinkCoder, originOf, agentKeyFor, linkRow, coderNote, wearable,
};
