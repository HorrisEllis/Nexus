'use strict';
/**
 * lib/repo-agent.js — dispatch as one repo compartment's own agent.
 * UUID: nexus-repo-agent-v1-0000-2026-0920-jamesbrooks-001
 * Version: 0.2.0
 *
 * §REPO-AGENT 2026-09-20 — James: "an agent tab for the agent cli for the
 * agent with the repo hat... no, each repo compartment in idearium."
 *
 * §WHY THIS DOES NOT TOUCH copilot/lib/self-model.js. The obvious way to
 * dispatch "as a hat" is copilot's own mechanism: POST /api/agent/switch
 * to setCurrentAgent(hatName), prompt, switch back. Checked, and rejected
 * for this caller: setCurrentAgent mutates copilot's ONE global current
 * agent. Every other surface talking to :3750 at that moment — the
 * tv-shell floating CLI, the guardian panel's ask box, intent-hat-router's
 * own temporary switches — would land under this repo's hat mid-flight.
 * A per-compartment agent that hijacks the host's identity is not
 * compartmentalised; it is the opposite.
 *
 * So nothing here switches anything. A hat's personaPrompt is a STRING
 * meant to be prepended to a system prompt — that is the field's whole
 * definition in lib/hat-forge.js's own schema. This module composes it
 * itself and sends one ordinary prompt, exactly the way guardian's own
 * userscripts already compose buildContextHeader(intel) + text, and the
 * way copilot/tool-runtime.js's makeNcpCallModel builds fullPrompt. One
 * established convention, reused, not a new dispatch path.
 *
 * §THE LIMIT THIS BUYS, STATED PLAINLY. Composing the persona gives real
 * behavioural constraint — the agent is told what project it is, what has
 * actually been indexed, what it has learned, and that it must stay inside
 * the compartment. It does NOT give capability constraint: the hat's
 * toolScope is not enforced through this path, because the backend
 * resolves its own tools and has no idea a hat is involved. An agent that
 * decides to call a tool outside its toolScope will succeed. Enforcing
 * that needs a per-request hat parameter on the backend itself, which does
 * not exist today. Named here rather than left to be discovered.
 *
 * §SESSION. sessionId is derived from the repo uuid, so each compartment
 * gets its own continuous conversation in copilot's own _getSession map —
 * two repos never share history, and the same repo picks up where it left
 * off. That is the compartment boundary doing real work, not decoration.
 */

const crypto = require('crypto');
const http = require('http');
const fs = require('fs');       // 0.39.257 — /debug: syntax check, graph
const path = require('path');

const MODULE_ID = 'repo-agent';
const VERSION = '0.1.0';

const COPILOT_URL = process.env.COPILOT_URL || 'http://127.0.0.1:3750';
const DEFAULT_TIMEOUT_MS = 90000; // matches guardian/ask.js's own askSync budget

const TABLE = 'repo_agent_log';

function _hat()    { return require('./repo-hat.js'); }
function _memory() { return require('./repo-hat-memory.js'); }
function _jaa()    { return require('./../cortex/memory/jaa-db.js').jaaDB; }

// ── Which model wears the hat ─────────────────────────────────────────────────
// §PROVIDER 2026-09-21 — James: "the repo agent needs to be able to use
// chatgpt, gemini, deepseek as the agent wearing the hat. all outputs."
// The path already existed end to end and nothing set it: copilot's
// /api/prompt with backend:'guardian' calls _lifeline.dispatchToNcpAgent —
// guardian -> the provider's userscript (DOM injector in, mutation observer
// for the reply, same as clear-glass's agent mesh / cleardriver) — and
// returns the real text. So a provider here is only a ROUTE on the one
// dispatch the compartment agent already makes: the hat's persona, the
// retrieval context, the @learn protocol, the inject protocol and every
// output handling (learned observations, .inject nodes) are identical
// whichever model answers.
//
// The browser providers are read from guardian's own userscripts on disk,
// not a list kept here: a provider is offered iff guardian/userscript-<name>.js
// exists. ollama goes through copilot's ollama backend; 'auto' leaves the
// choice to copilot's own routing.
const SETTINGS_TABLE = 'repo_agent_settings';
// §0.39.267 — the same reading, now in lib/agent-providers.js so chunk builds, WARP and the UI share it.
function guardianProviders() { return require('./agent-providers.js').guardianProviders(); }
function providers() { return ['auto', 'ollama', ...guardianProviders()]; }

/** routeFor(provider) -> the { backend, agent } copilot's /api/prompt reads. */
function routeFor(provider) {
  if (!provider || provider === 'auto') return { backend: null, agent: null };
  if (provider === 'ollama') return { backend: 'ollama', agent: null };
  return { backend: 'guardian', agent: provider };
}

/** isGuardianProvider(p) — true for a real guardian-routed agent, false for 'auto'/'ollama'. */
function isGuardianProvider(p) { return !!p && p !== 'auto' && p !== 'ollama' && guardianProviders().includes(p); }

// §DEFAULT-GUARDIAN 2026-09-21 — James: "needs to default to guardian ...
// per compartment." A freshly-imported compartment used to default to
// 'auto' (copilot's own routing, which may or may not reach guardian at
// all) — silent and unobservable from the settings tab. Now it defaults to
// a real, named guardian agent, same as every explicitly-set compartment;
// 'auto' remains a valid, explicit choice (CLI/API), just never the
// unstated default. chatgpt is the stated default agent; if this
// deployment's guardian/ has no userscript-chatgpt.js (a different
// provider set), fall through to whichever guardian provider IS on disk
// rather than defaulting to an agent that cannot actually answer — and
// only to 'auto' if guardian has no browser providers at all.
function defaultProvider() {
  const gp = guardianProviders();
  if (gp.includes('chatgpt')) return 'chatgpt';
  return gp[0] || 'auto';
}

// §0.39.276 — a code repo linked to its original repo (lib/repo-hat.js linkCoder) has NO settings row of its own: every
// read and write below goes to the original's, so the backend switch, Ollama model, tool scope and prompt blocks are
// configured in one place — the original repo.
function _key(repoUuid) { try { return _hat().agentKeyFor(repoUuid); } catch (_) { return repoUuid; } }
function _settingsRow(repoUuid) { const k = _key(repoUuid); return (_jaa().query(SETTINGS_TABLE, r => r.repoUuid === k, 1) || [])[0] || null; }
function getProvider(repoUuid) {
  const row = _settingsRow(repoUuid);
  return row && providers().includes(row.provider) ? row.provider : defaultProvider();
}

/**
 * settingsView(repoUuid) — the switch+dropdown shape the Agent tab renders.
 * One derivation, read by both the API route and (via it) the UI, so the
 * on/off meaning of the switch lives in exactly one place. The switch is
 * guardian (on) vs ollama (off), per James 2026-09-21 — 'auto' is not a
 * switch position; a compartment explicitly set to 'auto' (CLI/API) shows
 * as useGuardian:true with guardianAgent:null, honestly, rather than
 * picking a provider on the person's behalf or hiding the real state.
 */
/**
 * backendOf(provider) — the three-way switch position (0.39.253, James: "i want the cli in idearium to be like the 3
 * way cli in the floating menu cli in the tv ui"): 'ollama' | 'copilot' | 'guardian'. 'copilot' is the stored
 * provider 'auto' — no backend is sent and copilot's own DEFAULT_PROVIDER decides, exactly what the TV shell's
 * copilot button sends. One derivation, read by the API and (through it) the UI.
 */
function backendOf(provider) {
  if (provider === 'ollama') return 'ollama';
  if (!provider || provider === 'auto') return 'copilot';
  return 'guardian';
}

/**
 * The Ollama model this compartment's agent uses when ollama wears the hat. null = the ollama bridge's own default
 * (ollama/config.js DEFAULT_MODEL) — nothing is sent, as before 0.39.253.
 */
function getOllamaModel(repoUuid) {
  const row = _settingsRow(repoUuid);
  return row && typeof row.ollamaModel === 'string' && row.ollamaModel ? row.ollamaModel : null;
}
/**
 * setOllamaModel(repoUuid, model, { installed }) — model null/'' clears to the bridge default. A named model must be in
 * `installed` (Ollama's real /api/tags list, fetched by the caller): a model that was never pulled would only fail on
 * the next prompt, so it is refused here, where the person choosing it can see why.
 */
function setOllamaModel(repoUuid, model, { installed = null } = {}) {
  const want = typeof model === 'string' ? model.trim() : '';
  if (want) {
    if (!Array.isArray(installed)) return { ok: false, errors: ['cannot check the model against Ollama\'s installed list — the ollama bridge did not answer'] };
    if (!installed.includes(want)) return { ok: false, errors: [`"${want}" is not installed in Ollama — one of: ${installed.join(', ') || '(none installed)'}`] };
  }
  const jaa = _jaa(), row = _settingsRow(repoUuid), value = want || null;
  if (row) jaa.update(SETTINGS_TABLE, { uuid: row.uuid }, { ollamaModel: value, updatedAt: Date.now() });
  else jaa.insert(SETTINGS_TABLE, { uuid: crypto.randomUUID(), repoUuid: _key(repoUuid), provider: getProvider(repoUuid), ollamaModel: value, updatedAt: Date.now() });
  return { ok: true, repoUuid, ollamaModel: value };
}

// ── Tool scope — §TOOLS 0.39.257 ──────────────────────────────────────────────
// James: "the toolscope for the agents tab. need the full capabilities" — asked which tools, "i want everything, at
// least for now". So 'all' (every registered tool) is the default; 'project' is the repo hat's own toolScope
// (lib/repo-hat.js REPO_TOOL_SCOPE), one command away. Either way the scope is ENFORCED: the dispatch runs copilot's
// real tool loop (body.tools), whose runToolLoop refuses a tool outside allowedTools.
// §0.39.266 — 'harness' (the new default): every tool is ALLOWED, but only the five registry-harness tools are LISTED
// in the prompt; the rest (the browser / Clear Glass tools, COS, versions …) are found with loom.find.tool. James:
// "thats way too much to inject when we have tools they can use to get context" · "those tools are for using
// clearglass and automating. basically giving the agents a browser to use" — kept, not listed.
const TOOL_SCOPES = Object.freeze(['harness', 'all', 'project']);
function getToolScope(repoUuid) {
  const row = _settingsRow(repoUuid);
  return row && TOOL_SCOPES.includes(row.toolScope) ? row.toolScope : 'harness';
}
function setToolScope(repoUuid, scope) {
  if (!TOOL_SCOPES.includes(scope)) return { ok: false, errors: [`tool scope must be one of: ${TOOL_SCOPES.join(', ')}`] };
  const jaa = _jaa(), row = _settingsRow(repoUuid);
  if (row) jaa.update(SETTINGS_TABLE, { uuid: row.uuid }, { toolScope: scope, updatedAt: Date.now() });
  else jaa.insert(SETTINGS_TABLE, { uuid: crypto.randomUUID(), repoUuid: _key(repoUuid), provider: getProvider(repoUuid), toolScope: scope, updatedAt: Date.now() });
  return { ok: true, repoUuid, toolScope: scope };
}
/** The allowedTools a dispatch sends: 'all' and 'harness' → every tool, 'project' → the hat's own list. */
// 0.39.272 — James: "idearium agents should be able to find the context easily". A hat forged before this release
// carries a toolScope without the context atlas; in 'project' scope that agent could not search memory at all. The
// atlas is read-only, so it is always in a project scope — named here, not silently widened.
// 0.39.273 — the read-only codebase tools join it on the same ground: a hat forged before them could not search its
// own project's code by meaning in 'project' scope. The code WRITE tools are not widened in: a hat that lacks them
// gets them when it is re-forged (lib/repo-hat.js REPO_TOOL_SCOPE), never silently.
const ALWAYS_IN_SCOPE = Object.freeze(['nexus.context.tool', ...require('./agent-tools/tools/idearium/code.js').READ_ONLY]);
function scopeFor(repoUuid, hat) {
  if (getToolScope(repoUuid) !== 'project') return 'all';
  const base = (hat && Array.isArray(hat.toolScope) && hat.toolScope.length) ? [...hat.toolScope] : [...(_hat().REPO_TOOL_SCOPE || [])];
  return [...new Set([...base, ...ALWAYS_IN_SCOPE])];
}

/**
 * fillListedTools(text, repoUuid) — §0.39.266. For the 'harness' scope, {tools} and {tool_guide} are filled HERE with
 * the five harness tools and one line naming the other tool groups, so copilot (which fills whatever placeholders
 * are left with the whole allowed scope) never lists all ~100. 'all' / 'project' are left for copilot, as before.
 */
/**
 * listedTools() — §0.39.273: what the harness scope's first message lists. The codebase tools replace loom.read /
 * loom.write in the list (both are still allowed and still work): code_edit changes part of a file where loom.write
 * needed the whole file reproduced, and code_chunk / code_search read by meaning, not by file name alone.
 * loom.find stays listed — it is how every other tool (the browser, COS, versions …) is found.
 */
function listedTools() {
  const { LISTED } = require('./agent-tools/tools/idearium/code.js');
  return [...LISTED, 'loom.find.tool'];
}

function fillListedTools(text, repoUuid) {
  if (getToolScope(repoUuid) !== 'harness') return text;
  let out = String(text || '');
  if (!out.includes('{tools}') && !out.includes('{tool_guide}')) return out;
  const LISTED = listedTools();
  let groups = '';
  try { groups = require('./agent-tools/tool-catalog.js').GROUPS.filter(g => g.id !== 'files').map(g => g.title).join(' · '); } catch (_) {}
  let guide = '';
  try { guide = require('./agent-tools/tool-guide.js').toolGuide([...LISTED]); } catch (_) {}
  guide += '\nAlso: idearium.code_grep.tool (exact text) · code_refs · code_batch · code_changes · loom.card.tool · loom.test.tool.';
  if (groups) guide += `\nMore tools (${groups}): find one with loom.find.tool kind "tool", then call it the same way.`;
  return out.split('{tools}').join(LISTED.join(', ')).split('{tool_guide}').join(guide);
}

/**
 * contextFor({ repo, repoDir, message }) -> { kind, block, chunks, chars, dropped, reason, cards }
 * §0.39.266 — the 'harness' scope's context: the registry card of what the message names (at most two), never code.
 * Other scopes keep lib/repo-context.js's keyword retrieval. Either way { kind, block } feeds compose().
 */
function contextFor({ repo, repoDir, message, bare = true, contextOptions = {} } = {}) {
  const empty = (reason) => ({ kind: null, block: '', chunks: [], chars: 0, dropped: 0, reason });
  if (getToolScope(repo.uuid) === 'harness') {
    try {
      const H = require('./registry-harness.js');
      const idx = H.indexFor(repo, repo.nexusSelf ? null : repoDir);
      const named = H.namedIn(idx, message, 2);
      if (!named.length) return empty('the question names no file — the agent finds what it needs with loom.find.tool');
      const cards = named.map(n => H.card(idx, n.file, { cap: 8 })).filter(c => !c.error);
      const line = (label, v) => (Array.isArray(v) ? (v.length ? `${label}: ${v.join(', ')}` : null) : v ? `${label}: ${v}` : null);
      const block = cards.map(c => [
        `${c.id}  (${c.file}, ${c.lines} lines)`,
        line('purpose', c.purpose), line('exports', c.exports), line('requires', c.requires), line('required by', c.requiredBy),
        line('emits', c.emits.map(e => `${e.event}${e.heardBy.length ? ` → ${e.heardBy.join(', ')}` : ''}`)),
        line('hears', c.listens.map(e => `${e.event}${e.emittedBy.length ? ` ← ${e.emittedBy.join(', ')}` : ''}`)),
        line('routes', c.routes), line('tests', c.tests),
      ].filter(Boolean).join('\n')).join('\n\n');
      return { kind: 'card', block, chunks: [], chars: block.length, dropped: 0, reason: null, cards: cards.map(c => ({ id: c.id, file: c.file })) };
    } catch (e) { return empty(`registry card unavailable: ${e.message}`); }
  }
  if (!repoDir) return empty('no repoDir');
  try { return require('./repo-context.js').retrieve({ repoDir, message, bare, ...contextOptions }); }
  catch (e) { return empty(`retrieval failed: ${e.message}`); }
}

function settingsView(repoUuid) {
  const provider = getProvider(repoUuid);
  const useGuardian = provider !== 'ollama';
  return {
    provider, providers: providers(),
    backend: backendOf(provider),                 // 0.39.253 — the three-way switch position
    useGuardian,                                  // kept for older callers; the switch no longer reads it
    guardianAgent: isGuardianProvider(provider) ? provider : null,
    guardianProviders: guardianProviders(),
    ollamaModel: getOllamaModel(repoUuid),        // 0.39.253 — null = the ollama bridge's default
    toolScope: getToolScope(repoUuid),            // 0.39.257 — 'all' (default) | 'project'; enforced on ollama/guardian
    toolScopes: [...TOOL_SCOPES],
    settingsFrom: _hat().originOf(repoUuid),      // §0.39.276 — non-null: these settings belong to the original repo; change them there
  };
}
function setProvider(repoUuid, provider) {
  const list = providers();
  if (!list.includes(provider)) return { ok: false, errors: [`provider must be one of: ${list.join(', ')}`] };
  const jaa = _jaa(), row = _settingsRow(repoUuid);
  if (row) jaa.update(SETTINGS_TABLE, { uuid: row.uuid }, { provider, updatedAt: Date.now() });
  else jaa.insert(SETTINGS_TABLE, { uuid: crypto.randomUUID(), repoUuid: _key(repoUuid), provider, updatedAt: Date.now() });
  return { ok: true, repoUuid, provider, route: routeFor(provider) };
}

/** One stable session per compartment. */
function sessionIdFor(repoUuid) { return `repo-agent-${repoUuid}`; }
// The id guardian files this compartment's replies under (its own browser tab,
// and the agent_id of every .response in Clear Glass's Responses index).
function agentIdFor(repoUuid) { return `repo-${repoUuid}`; }

// ── Transport ─────────────────────────────────────────────────────────────────
// Plain http.request rather than fetch: this module is required into
// idearium's ESM process through createRequire, and a bare http call has no
// dependency on which fetch implementation that process happens to have.
function _post(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(new Error(`bad url: ${e.message}`)); }
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, json: null, raw: d.slice(0, 500), parseError: e.message }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`timed out after ${timeoutMs}ms`)); });
    req.write(body);
    req.end();
  });
}

// ── Composition ───────────────────────────────────────────────────────────────
// ── Self-learning protocol ───────────────────────────────────────────────────
// §SELF-LEARN 2026-09-21 — the hat previously learned only from recorded
// corrections: nothing turned the agent's own work into observations.
//
// The agent is told it MAY end a reply with lines of the exact form
//   @learn <fact|convention|pitfall>: <text> [evidence: <file or chunk id>]
// dispatch() parses them out, records each through repo-hat's learn() — so
// it is live in the persona on the very next prompt — and strips them from
// the text the person reads.
//
// Why a stated protocol and not extraction from prose: an observation the
// agent explicitly declared is its own claim, attributable and checkable.
// Mining free text for "conventions" would be this module inventing claims
// on the agent's behalf — exactly the plausible-guess-as-fact failure the
// persona tells the agent not to commit.
//
// Constraints, each deliberate:
//   · `correction` is refused. It is the person's kind — the persona ranks it
//     above anything the agent concluded — so an agent able to write one
//     could promote its own guesses over the person's word.
//   · Evidence is GROUNDED only if it names a file or chunk id the agent was
//     actually given this turn. Ungrounded evidence is kept but marked, so a
//     citation the agent could not have read is never passed off as proof.
//   · At most LEARN_MAX per reply. The rest are reported as dropped, never
//     silently kept or silently lost.
const LEARN_KINDS = Object.freeze(['fact', 'convention', 'pitfall']);
const LEARN_MAX = 5;
const LEARN_RE = /^[ \t]*@learn[ \t]+([a-z]+)[ \t]*:[ \t]*(.+?)[ \t]*(?:\[evidence:[ \t]*([^\]]+?)[ \t]*\])?[ \t]*$/i;

const LEARN_PROTOCOL = [
  'If this work taught you something durable about THIS project, you may end your reply with lines of the exact form:',
  '@learn <fact|convention|pitfall>: <one sentence> [evidence: <file path or chunk id you were given>]',
  'Only things you verified in the code you were shown. Never restate the question. Omit the lines if you learned nothing.',
].join('\n');

/**
 * parseLearned(text, { files, chunkIds }) -> { clean, items, rejected, dropped }
 * Pure. items: [{ kind, text, evidence, grounded }]. rejected: lines that
 * looked like @learn but broke a rule, with the reason. Lines are removed
 * from `clean` whether accepted or rejected — a malformed protocol line is
 * still protocol, not prose meant for the person.
 */
function parseLearned(text, { files = [], chunkIds = [] } = {}) {
  const src = String(text || '');
  const known = new Set([...files, ...chunkIds].map(String));
  const keep = [], items = [], rejected = [];
  let dropped = 0;
  for (const line of src.split('\n')) {
    if (!/^[ \t]*@learn\b/i.test(line)) { keep.push(line); continue; }
    const m = line.match(LEARN_RE);
    if (!m) { rejected.push({ line: line.trim(), reason: 'malformed @learn line' }); continue; }
    const kind = m[1].toLowerCase();
    const body = m[2].trim();
    const evidence = m[3] ? m[3].trim() : null;
    if (kind === 'correction') { rejected.push({ line: line.trim(), reason: 'correction is the person\'s kind, not the agent\'s' }); continue; }
    if (!LEARN_KINDS.includes(kind)) { rejected.push({ line: line.trim(), reason: `unknown kind "${kind}"` }); continue; }
    if (body.length < 8) { rejected.push({ line: line.trim(), reason: 'too short to be an observation' }); continue; }
    if (items.length >= LEARN_MAX) { dropped++; continue; }
    const grounded = !!evidence && [...known].some(k => k && (evidence === k || evidence.includes(k)));
    items.push({ kind, text: body, evidence, grounded });
  }
  return { clean: keep.join('\n').replace(/\n+$/, ''), items, rejected, dropped };
}

/**
 * compose({ hat, message }) — the exact text that goes out.
 *
 * Exported and pure so the UI can show the person what their agent is
 * actually being sent. A persona the person cannot read is a persona they
 * cannot correct, and correcting it is half of how this thing learns.
 */
function compose({ hat, message, context = '', blocks = null, backend = null, repoUuid = null, memory = '', atlas = '', directory = '' } = {}) {
  // 0.39.258 — James: "not to inject anything into it that i cant edit in the agent settings." The prompt is the
  // hat's persona plus this repo's prompt blocks (lib/repo-prompt-blocks.js, edited in Settings → Agents), in
  // order, exactly as edited. `context` is { kind, block } from repo-context.retrieve({ bare:true }); a plain
  // string (older callers) is treated as matched code.
  const PB = require('./repo-prompt-blocks.js');
  const ctx = !context ? null : typeof context === 'string' ? { kind: 'code', block: context } : context;
  // No hat, no context, no blocks named: the bare message, as before (nothing to compose it with).
  if (!(hat && hat.personaPrompt) && !(ctx && ctx.block) && !blocks && !repoUuid) return String(message || '');
  const list = blocks || (repoUuid ? PB.getBlocks(repoUuid) : PB.DEFAULT_BLOCKS);
  return PB.render({ persona: (hat && hat.personaPrompt) || '', blocks: list, message, context: ctx, backend, memory, atlas, directory }).text;
}

/**
 * atlasFor({ repo, repoDir, message, blocks, backend }) — 0.39.272. The data for {atlas} and {directory}, computed only
 * when their block is on (a block switched off costs no search). The agent's OWN exchanges are left out of {atlas}:
 * {memory} (lib/agent-memory.js) already carries them. Never throws — a failed search is in `info` and sends nothing.
 */
async function atlasFor({ repo, repoDir = null, message, blocks, backend = null, noContext = false } = {}) {
  const on = (id) => (blocks || []).some(b => b.id === id && b.enabled);
  const out = { atlas: '', directory: '', info: null };
  if (noContext) return out;
  const A = require('./context-atlas.js');
  if (on('context-atlas')) {
    try { const m = await A.block(message, { repoDir, repoUuid: repo && repo.uuid, excludeAgent: repo && repo.uuid ? agentIdFor(repo.uuid) : null, budget: 2400 }); out.atlas = m.text; out.info = { hits: m.hits, total: m.total || 0, reason: m.reason || null }; }
    catch (e) { out.info = { hits: 0, error: e.message }; }
  }
  if (on('context-directory') && (backend === 'guardian' || backend === 'ollama')) {
    try { out.directory = A.directoryBlock(); } catch (e) { out.info = { ...(out.info || {}), directoryError: e.message }; }
  }
  return out;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
/**
 * dispatch({ repo, repoDir, message, backend, agent, timeoutMs })
 *
 * Returns { ok, text, hatName, sessionId, promptChars, backend, requestId }
 * or { ok:false, error, ... }. Never throws for a backend that is simply
 * down — that is a real, reportable state, not an exception.
 *
 * `backend` maps straight onto copilot's own body.backend convention
 * ('guardian' | 'ollama'), omitted for its default routing. `agent` is
 * copilot's provider name, only meaningful when backend === 'guardian'.
 * Neither is invented here; both are that endpoint's existing contract.
 */
async function dispatch({ repo, repoDir, message, backend = null, agent = null, provider = null, timeoutMs = DEFAULT_TIMEOUT_MS, noContext = false, contextOptions = {}, layer = null } = {}) {
  if (!repo || !repo.uuid) return { ok: false, error: 'repo with a uuid is required' };
  if (!message || !String(message).trim()) return { ok: false, error: 'message is required' };

  const RH = _hat();

  // Which model wears the hat: an explicit backend/agent wins, then an
  // explicit provider, then this compartment's stored choice.
  let chosen = provider;
  if (!backend && !agent) {
    if (!chosen) chosen = getProvider(repo.uuid);
    const r = routeFor(chosen);
    if (chosen !== 'auto' && !providers().includes(chosen)) return { ok: false, error: `unknown provider "${chosen}" — one of: ${providers().join(', ')}` };
    backend = r.backend; agent = r.agent;
  }
  // 0.39.258 — the "copilot" position (provider 'auto'). Copilot's plain /api/prompt path adds its own context
  // (user model, session history, recall, mastermind, intent routing) that nobody can edit in the agent settings.
  // So copilot is asked which backend its default resolves to, and the agent's composed prompt goes there directly:
  // copilot still chooses WHO answers; only the repo's blocks decide WHAT is sent. If copilot cannot say, the
  // dispatch fails with the reason rather than falling back to a path that would inject.
  let viaCopilot = null;
  if (!backend && !agent && (chosen === 'auto' || !chosen)) {
    let rr = null;
    try { const g = await _get(`${COPILOT_URL}/api/prompt/resolve`, 5000); rr = g.json || { ok: false, error: `HTTP ${g.status}${g.parseError ? ' — ' + g.parseError : ''}` }; } catch (e) { rr = { ok: false, error: e.message }; }   // _get below (function declaration, hoisted)
    if (!rr || !rr.ok || !rr.backend) {
      return { ok: false, error: `the copilot position could not be resolved to a backend (${(rr && rr.error) || 'no answer from copilot :3750'}) — nothing was sent; pick ollama or guardian, or retry once copilot is up`, provider: 'auto' };
    }
    backend = rr.backend; agent = rr.agent || null;
    viaCopilot = { provider: rr.provider, backend: rr.backend, agent: rr.agent || null, note: rr.note || null };
  }
  // A browser provider answers through a real tab (inject, then wait for the
  // DOM to finish the reply); 90s is too short for a long answer.
  if (backend === 'guardian' && timeoutMs === DEFAULT_TIMEOUT_MS) timeoutMs = 300000;

  // The hat is the agent. No hat, no compartment agent — forge it rather
  // than quietly dispatching an unconstrained host-wide prompt wearing this
  // repo's name, which is precisely what repo-hat.js refuses to allow.
  let hat = RH.getRepoHat(repo.uuid);
  if (!hat) {
    const ensured = RH.ensureRepoHat({ repo, repoDir });
    if (!ensured.ok) {
      return { ok: false, error: (ensured.errors || ['could not forge a hat for this repo']).join('; '), needsHat: true };
    }
    hat = ensured.hat;
  }
  hat = RH.wearable(hat, repo);   // §0.39.276 — a linked code repo wears its original's hat, plus one line saying which repo it is in

  const sessionId = sessionIdFor(repo.uuid);
  // The agent is not asked to go looking. Idearium reads the repo's own chunk index for what the question
  // names and puts it in the prompt, within a hard budget, so a 0.6B-3B model gets the code it needs
  // without planning a search. Only ever reads THIS repo's directory.
  let context = { chunks: [], block: '', chars: 0, dropped: 0, reason: 'disabled by caller' };
  if (!noContext) context = contextFor({ repo, repoDir, message, bare: true, contextOptions });   // §0.39.266 — harness: a card, not code
  const blocks = require('./repo-prompt-blocks.js').getBlocks(repo.uuid);
  // §0.39.265 — James: "a semantic randomizer to change what the job says each time … force novelty." For a
  // browser agent with the 'reword' block on, copilot says the question in new words (copilot/lib/reword.js:
  // Ollama first, JS fallback, code/paths/names verbatim, novel against what this agent was sent before). The
  // original stays the job's canonical meaning, so guardian still recognises the same question (join, reuse).
  let sent = message, reworded = null;
  const rw = backend === 'guardian' ? blocks.find(b => b.id === 'reword' && b.enabled) : null;
  if (rw && String(message || '').trim().length >= 12 && !/^\s*\//.test(message)) {
    try {
      const r = await _post(`${COPILOT_URL}/api/reword`, { text: message, key: agentIdFor(repo.uuid), n: 3, guidance: rw.text }, 90000);
      const j = r.json || {};
      if (r.status === 200 && j.ok && j.text && j.source !== 'original') { sent = j.text; reworded = { source: j.source, novel: j.novel, similarity: j.similarity }; }
      else reworded = { source: 'original', reason: (j.tried || []).map(t => (t.reasons || []).join('; ')).filter(Boolean).slice(0, 2).join(' | ') || j.error || `copilot ${r.status}` };
    } catch (e) { reworded = { source: 'original', reason: `copilot /api/reword: ${e.message}` }; }
  }
  // §0.39.269 — memory: what this repo's agent has done before, on any backend, from Clear Glass's download manager
  // (lib/agent-memory.js). Goes in the editable 'memory' block; empty = the block is left out.
  let memory = { text: '', sources: null, chars: 0 };
  if (!noContext) { try { memory = await require('./agent-memory.js').recall({ agentId: agentIdFor(repo.uuid), query: message }); } catch (e) { memory = { text: '', sources: { error: e.message }, chars: 0 }; } }
  const atl = await atlasFor({ repo, repoDir, message, blocks, backend, noContext });   // 0.39.272 — {atlas} / {directory}
  const prompt = fillListedTools(compose({ hat, message: sent, context: { kind: context.kind || null, block: context.block }, blocks, backend, memory: memory.text, atlas: atl.atlas, directory: atl.directory }), repo.uuid);
  const ctxInfo = { memory: { chars: memory.chars, sources: memory.sources }, atlas: atl.info, reworded, sentMessage: reworded && reworded.source !== 'original' ? sent : null, chunkIds: context.chunks.map(c => c.id), files: [...new Set([...context.chunks.map(c => c.file), ...(context.cards || []).map(c => c.file)])], cards: context.cards || null, kind: context.kind || null, chars: context.chars, dropped: context.dropped, reason: context.reason || null, graph: context.graph || null };
  const started = Date.now();

  const payload = { prompt, channel: 'idearium-repo-agent', sessionId };
  if (backend) payload.backend = backend;
  if (agent) payload.agent = agent;
  // 0.39.253 — the compartment's chosen Ollama model. Unset = nothing sent, the bridge's default applies (as before).
  if (backend === 'ollama') { const m = getOllamaModel(repo.uuid); if (m) payload.model = m; }
  // §TR1 2026-09-22 — James: "What if each container gets a dedicated
  // tab, for each repo." Real gap, confirmed by direct trace this
  // session: this payload never carried anything a downstream system
  // could use to pick a per-repo browser tab. clear-glass's own DOM
  // bridge already accepts a real agentId param for exactly this
  // (screen-qa's detectOpenQuestions/injectAnswer, autofill's
  // detectFields/fillFields all take { agentId = 'default', ... } —
  // clear-glass/src/screen-qa/detector.js, clear-glass/src/autofill/
  // matcher.js). Only guardian-routed (browser-tab) dispatches need
  // this — ollama has no tab to pick between.
  // NOT independently confirmed this session: that copilot's own
  // /api/prompt handler and guardian's NCP dispatch pass this field
  // through untouched end to end. If either strips or ignores it,
  // this line alone does not close the gap — check both before
  // assuming TR1 is done once this patches cleanly.
  // §0.39.269 — every backend: the agent id is who remembers the exchange (guardian files it in the download manager;
  // the ollama bridge records it there too), with the compartment it belongs to.
  payload.agentId = agentIdFor(repo.uuid);
  if (repo.compartmentId) payload.compartmentId = repo.compartmentId;
  payload.repoUuid = repo.uuid;
  // 0.39.265 — the meaning (the prompt as it would read with the question as typed), for guardian's join/reuse
  if (backend === 'guardian' && sent !== message) payload.canonical = compose({ hat, message, context: { kind: context.kind || null, block: context.block }, blocks, backend, memory: memory.text });
  // §FIX 2026-09-23 — James, live, watching a real dispatch show nothing.
  // The 300000ms bump 8 lines above was this function's OWN outer
  // patience (idearium waiting on copilot's whole /api/prompt call) —
  // it never told COPILOT how long IT should wait on guardian, so
  // copilot/lifeline.js's _tryGuardian silently cut that inner hop at
  // its own hardcoded 45s regardless, defeating this bump entirely.
  // Passed through now (copilot/server.js's own 2026-09-23 note); a
  // non-guardian backend's timeoutMs field is simply unused server-side,
  // so this is safe to always include once timeoutMs is set.
  if (backend === 'guardian') payload.timeoutMs = timeoutMs;
  // §TOOLS 0.39.257 — the real tool loop, scope enforced, file tools rooted in this repo, the hat as identity.
  // Only where the backend is named (ollama or a browser agent): 'auto' is copilot's own cascade, which picks its
  // own path. The persona, context and question are still the prompt, exactly as compose() built them.
  const toolScope = (backend === 'guardian' || backend === 'ollama') ? scopeFor(repo.uuid, hat) : null;
  if (toolScope) {
    // 0.39.258 — composed: copilot sends `prompt` as it stands (filling {tools}/{tool_guide} only) and adds no
    // system prompt, identity line or turn labels; follow-up rounds carry only tool results, framed by the
    // editable 'tool-result' block. The identity line that used to go here was a second persona nobody could edit.
    payload.tools = {
      scope: toolScope,
      composed: true,
      resultTemplate: require('./repo-prompt-blocks.js').toolResultTemplate(blocks),
      repoDir: repoDir || null,
      repoUuid: repo.uuid,   // 0.39.266 — the registry harness tools (loom.*.tool) read this, so the model never has to pass it
      maxIterations: 8,      // 0.39.266 — a model that pulls its own context needs a few more rounds than one that was handed it
    };
  }

  let res;
  try {
    res = await _post(`${COPILOT_URL}/api/prompt`, payload, timeoutMs);
  } catch (e) {
    const timedOut = /timed out/i.test(e.message);
    const out = { ok: false, error: timedOut ? `copilot :3750 did not answer in time — ${e.message}` : `copilot :3750 unreachable — ${e.message}`, hatName: hat.name, sessionId, promptChars: prompt.length, context: ctxInfo };
    _log(repo.uuid, { message, out, started, hat, backend });
    // §LATE 0.39.241 — our own wait ran out, but the job may be alive in a tab.
    // A refused connection means no job was ever created: nothing to wait for.
    if (timedOut && backend === 'guardian') out.awaitLate = { agentId: agentIdFor(repo.uuid), since: started };
    return out;
  }

  const out = await _finish({
    repo, repoDir, layer, hat, message, sessionId, prompt, ctxInfo, started, timeoutMs,
    backend, agent, chosen, status: res.status, j: res.json || {}, parseError: res.parseError,
  });
  if (viaCopilot) out.viaCopilot = viaCopilot;   // which backend the copilot position resolved to, shown in the Agent tab
  // §0.39.269 — the ollama bridge records single-shot answers itself; a tool-loop answer is several bridge rounds it
  // skips, so the final exchange is recorded here, once.
  if (out.ok && backend === 'ollama' && payload.tools) {
    require('./agent-memory.js').record({ agentId: agentIdFor(repo.uuid), provider: 'ollama', model: payload.model || null, prompt: message,
      response: out.text, compartmentId: repo.compartmentId || null, repoUuid: repo.uuid, kind: 'agent', source: 'repo-agent' }).catch(() => {});
  }
  // §LATE 0.39.241 — a guardian (browser-tab) dispatch that failed may still be
  // answered: the tab keeps typing after copilot stops waiting, and guardian
  // files the reply into Clear Glass's Responses index under this agent id.
  // The caller is told where to look and from when, instead of guessing.
  // 0.39.244 — only when guardian actually created a job (copilot passes its jobId on the
  // failure). With no job — a refusal before dispatch — nothing can arrive; waiting 15 min
  // for it would be a lie.
  const jobId = (res.json && res.json.jobId) || null;
  if (!out.ok && backend === 'guardian' && jobId) { out.awaitLate = { agentId: agentIdFor(repo.uuid), since: started, jobId }; out.jobId = jobId; }
  return out;
}

/**
 * _finish(ctx) — everything that happens to a reply once its text exists:
 * @learn parsing, .inject nodes, the exchange log. One path for a reply
 * copilot handed back and a reply adopted late from the Responses index, so
 * the two can never be processed differently.
 */
async function _finish({ repo, repoDir, layer, hat, message, sessionId, prompt, ctxInfo, started, timeoutMs = DEFAULT_TIMEOUT_MS,
                         backend = null, agent = null, chosen = null, status, j = {}, parseError = null, late = null }) {
  const RH = _hat();
  // copilot answers /api/prompt with { text, model_used, confidence, ... }
  // on success and { ok:false, error } on its explicit failure branches.
  const rawText = typeof j.text === 'string' ? j.text : null;
  // Self-learning: parse, strip, and record the agent's own @learn lines.
  // Ungrounded evidence is recorded with a marker rather than as proof.
  let learned = null, text = rawText;
  if (rawText !== null && status === 200) {
    const parsed = parseLearned(rawText, { files: ctxInfo.files, chunkIds: ctxInfo.chunkIds });
    text = parsed.clean;
    const recorded = [];
    for (const it of parsed.items) {
      const ev = it.evidence ? (it.grounded ? it.evidence : `${it.evidence} (ungrounded — not in the context given)`) : null;
      try {
        const r = RH.learn({ repo, repoDir, kind: it.kind, text: it.text, source: 'agent', evidence: ev });
        recorded.push({ ...it, ok: !!r.ok, deduped: !!r.deduped, hatUpdated: !!r.hatUpdated, errors: r.ok ? undefined : r.errors });
      } catch (e) { recorded.push({ ...it, ok: false, errors: [e.message] }); }
    }
    if (recorded.length || parsed.rejected.length || parsed.dropped) {
      learned = { recorded, rejected: parsed.rejected, dropped: parsed.dropped };
    }
  }
  // §INJECT 2026-09-21 — addressed code blocks become .inject nodes in this
  // compartment (applied at once in 'auto' mode). Needs the caller's repo
  // layer: with none, nothing is written and the reply says so, rather than
  // the code silently going nowhere.
  let injects = null;
  if (text !== null && status === 200 && /```/.test(text)) {
    if (!layer) injects = { mode: null, injects: [], commands: 0, unresolved: [], refused: [{ reason: 'no repo layer passed to dispatch — code not injected' }] };
    else {
      const RI = require('./repo-inject.js');
      // The agent resolves where its own unaddressed code goes — same backend,
      // a side session so the question never lands in the conversation.
      const resolve = async (q) => {
        // 0.39.258 — only the repo's own 'inject-resolve' block is sent (the tab already has the persona); off = not asked.
        const ask = RI.resolvePrompt({ ...q, question: message }, require('./repo-prompt-blocks.js').getBlocks(repo.uuid));
        if (ask === null) throw new Error('the "where does this code go?" block is switched off in Settings → Agents — place it yourself');
        const rp = await _post(`${COPILOT_URL}/api/prompt`, {
          prompt: ask,
          // 0.39.258 — the repo's own tab and hat, so guardian treats it as composed (adds nothing) like the main turn
          ...(backend === 'guardian' ? { agentId: agentIdFor(repo.uuid) } : {}),
          channel: 'idearium-repo-agent-resolve', sessionId: `${sessionId}-resolve`,
          ...(backend ? { backend } : {}), ...(agent ? { agent } : {}),
        }, Math.min(timeoutMs, 60000));
        if (rp.status !== 200 || typeof (rp.json || {}).text !== 'string') throw new Error((rp.json && rp.json.error) || `backend returned ${rp.status}`);
        return rp.json.text;
      };
      try { injects = await RI.fromReply({ layer, repo, hat, text, repoDir, contextFiles: ctxInfo.files, resolve, exchange: { ts: started } }); }
      catch (e) { injects = { mode: null, injects: [], commands: 0, unresolved: [], refused: [{ reason: `inject failed: ${e.message}` }] }; }
      if (injects && !injects.injects.length && !injects.refused.length && !injects.unresolved.length && !injects.commands) injects = null;
    }
  }
  const out = (status === 200 && text !== null)
    ? {
        ok: true, text, learned, injects,
        hatName: hat.name,
        sessionId,
        promptChars: prompt.length, context: ctxInfo,
        backend: backend || j.provider_used || j.model_used || null,
        provider: chosen || agent || backend || 'auto',
        providerUsed: j.provider_used || agent || null,
        modelUsed: j.model_used || null,
        confidence: typeof j.confidence === 'number' ? j.confidence : null,
        requestId: j.requestId || null,
        elapsedMs: Date.now() - started,
        // 0.39.257 — which tools the agent used this turn, and the scope it ran under
        ...(Array.isArray(j.toolCallLog) ? { toolCalls: j.toolCallLog } : {}),
        ...(j.tools ? { tools: j.tools } : {}),
        ...(late ? { late } : {}),
      }
    : {
        ok: false,
        error: j.error || j.text || parseError || `copilot returned ${status}`,
        hatName: hat.name, sessionId, promptChars: prompt.length, context: ctxInfo,
        ...(Array.isArray(j.toolCallLog) && j.toolCallLog.length ? { toolCalls: j.toolCallLog } : {}),
        elapsedMs: Date.now() - started,
      };

  _log(repo.uuid, { message, out, started, hat, backend, responseId: late ? late.responseId : null });
  return out;
}

// ── Late replies — §LATE 0.39.241 ─────────────────────────────────────────────
// James (0.39.239's open item): the Agent tab should pick up a reply that
// arrives after copilot's wait has ended, from the Responses index by agent,
// instead of staying on "thinking…".
//
// Why a reply can be late: copilot waits on guardian for a fixed budget, but the
// provider tab keeps generating after that budget runs out. Guardian still
// completes the job and files the reply into Clear Glass's Responses index
// (clear-glass/src/downloads/artifact-chat-index.js — guardian/lib/
// code-artifact.js recordAgentResponse), with agent_id = agentIdFor(uuid) and
// raw.prompt = the full composed prompt. Nothing read it back for the tab.
//
// Two operations, split on purpose:
//   findLate  — read-only. Safe to call while the dispatch is still in flight.
//   adoptLate — runs the reply through _finish (learn, inject, log) ONCE per
//               index item. Only called after dispatch() has returned a failure,
//               so a reply is never processed by both paths.
function _index() { return require('../clear-glass/src/downloads/artifact-chat-index.js'); }
const TOOL_ONLY_RE = /^\s*```tool\s*\n[\s\S]*?\n```\s*$/;   // a tool-loop turn, not an answer
function _adoptedIds(repoUuid) {
  return new Set(history(repoUuid, 100000).map(r => r.responseId).filter(Boolean));
}

/**
 * findLate({ repo, since, message, root }) — the newest reply in the Responses
 * index filed under this compartment's agent id at or after `since` (ms), whose
 * recorded prompt contains `message`, and that has not already been adopted.
 * → { ok:true, found:false } | { ok:true, found:true, responseId, jobId, provider, capturedAt, text }
 */
function findLate({ repo, since = 0, message = null, jobId = null, root = null } = {}) {
  if (!repo || !repo.uuid) return { ok: false, error: 'repo with a uuid is required' };
  let IDX, dir;
  try { IDX = _index(); dir = root || IDX.defaultRoot(); }
  catch (e) { return { ok: false, error: `Responses index unavailable — ${e.message}` }; }
  const agentId = agentIdFor(repo.uuid);
  const needle = message ? String(message).trim().slice(0, 200) : '';
  const adopted = _adoptedIds(repo.uuid);
  let rows;
  // 0.39.244 — with the job id guardian created, the match is exact; otherwise agent + time + message.
  try { rows = IDX.queryItems(dir, { agentId, kind: 'chat', ...(jobId ? { jobId } : {}), limit: 25 }); }
  catch (e) { return { ok: false, error: `Responses index read failed — ${e.message}` }; }
  for (const row of rows) {                      // newest first
    if ((row.captured_at || 0) < since) break;
    if (row.status && row.status !== 'ok') continue;
    if (adopted.has(row.id)) continue;
    const item = IDX.readItem(dir, row.id);
    const raw = item && item.raw;
    const text = raw && typeof raw.response === 'string' ? raw.response : null;
    if (!text || !text.trim() || TOOL_ONLY_RE.test(text)) continue;
    if (!jobId && needle && typeof raw.prompt === 'string' && !raw.prompt.includes(needle)) continue;
    return { ok: true, found: true, agentId, responseId: row.id, jobId: item.job_id || null,
             provider: item.provider || raw.provider || null, capturedAt: item.captured_at || row.captured_at, text };
  }
  return { ok: true, found: false, agentId, since };
}

const _adopting = new Set();   // responseIds mid-adoption in this process — two callers never both run _finish
/**
 * adoptLate({ repo, repoDir, layer, responseId, message, since, noContext, root })
 * — take one late reply as this exchange's answer. Idempotent per responseId:
 * a second call returns the logged exchange without re-running learn/inject.
 */
async function adoptLate({ repo, repoDir = null, layer = null, responseId, message, since = 0, noContext = false, root = null } = {}) {
  if (!repo || !repo.uuid) return { ok: false, error: 'repo with a uuid is required' };
  if (!responseId) return { ok: false, error: 'responseId is required' };
  if (!message || !String(message).trim()) return { ok: false, error: 'message is required' };
  const prior = history(repo.uuid, 100000).find(r => r.responseId === responseId);
  if (prior) return { ok: true, alreadyAdopted: true, text: prior.response, hatName: prior.hatName, late: { responseId }, elapsedMs: prior.elapsedMs };
  if (_adopting.has(responseId)) return { ok: false, error: 'this reply is already being adopted', busy: true };
  _adopting.add(responseId);
  try {
    let IDX, dir;
    try { IDX = _index(); dir = root || IDX.defaultRoot(); }
    catch (e) { return { ok: false, error: `Responses index unavailable — ${e.message}` }; }
    const item = IDX.readItem(dir, responseId);
    if (!item || item.error || item.status === 'unreadable') return { ok: false, error: `no readable reply ${responseId} in the Responses index` };
    if (item.agent_id !== agentIdFor(repo.uuid)) return { ok: false, error: `reply ${responseId} belongs to ${item.agent_id || 'no agent'}, not ${agentIdFor(repo.uuid)}` };
    if ((item.captured_at || 0) < since) return { ok: false, error: `reply ${responseId} was captured before this exchange began` };
    const text = item.raw && typeof item.raw.response === 'string' ? item.raw.response : null;
    if (!text || !text.trim()) return { ok: false, error: `reply ${responseId} has no text` };

    const RH = _hat();
    let hat = RH.getRepoHat(repo.uuid);
    if (!hat) return { ok: false, error: 'this compartment has no hat — nothing to adopt the reply as', needsHat: true };
    hat = RH.wearable(hat, repo);
    // The original dispatch's retrieval is not stored; the same retrieval over
    // the same index and message is re-run so @learn evidence is grounded
    // against the same files, not marked ungrounded for want of a list.
    let context = { chunks: [], chars: 0, dropped: 0, reason: noContext ? 'disabled by caller' : 'no repoDir' };
    if (!noContext && repoDir) { try { context = require('./repo-context.js').retrieve({ repoDir, message }); } catch (e) { context = { chunks: [], chars: 0, dropped: 0, reason: `retrieval failed: ${e.message}` }; } }
    const ctxInfo = { chunkIds: context.chunks.map(c => c.id), files: [...new Set(context.chunks.map(c => c.file))], chars: context.chars, dropped: context.dropped, reason: context.reason || null, graph: context.graph || null };
    const started = since || item.captured_at;
    const provider = item.provider || (item.raw && item.raw.provider) || null;
    const out = await _finish({
      repo, repoDir, layer, hat, message, sessionId: sessionIdFor(repo.uuid), prompt: (item.raw && item.raw.prompt) || '', ctxInfo, started,
      backend: 'guardian', agent: provider, chosen: provider, status: 200, j: { text, provider_used: provider },
      late: { responseId, jobId: item.job_id || null, capturedAt: item.captured_at },
    });
    if (out.ok) out.elapsedMs = Math.max(0, (item.captured_at || Date.now()) - started);
    return out;
  } finally { _adopting.delete(responseId); }
}

// ── Exchange log ──────────────────────────────────────────────────────────────
// Per-compartment, not merged into cortex's global chat_log: the whole point
// of a compartment agent is that its history is its own. Failures are logged
// with the same weight as successes — a compartment whose agent has been
// failing for a week should be able to show that.
function _log(repoUuid, { message, out, started, hat, backend, responseId = null }) {
  try {
    _jaa().insert(TABLE, {
      uuid: crypto.randomUUID(),
      repoUuid,
      hatName: hat?.name || null,
      message: String(message).slice(0, 4000),
      response: out.ok ? String(out.text).slice(0, 8000) : null,
      error: out.ok ? null : String(out.error || '').slice(0, 1000),
      ok: !!out.ok,
      backend: backend || out.backend || null,
      promptChars: out.promptChars ?? null,
      context: out.context || null,
      injects: out.injects ? out.injects.injects.map(i => ({ uuid: i.uuid, path: i.path, status: i.status })) : null,
      learned: out.learned ? { recorded: out.learned.recorded.filter(x => x.ok).length, rejected: out.learned.rejected.length, dropped: out.learned.dropped } : null,   // which chunks the agent was given: the evidence a later outcome can be tied to
      elapsedMs: Date.now() - started,
      responseId,   // §LATE 0.39.241 — the Responses-index item this exchange adopted, so it is adopted once
      ts: Date.now(),
    });
  } catch (_) { /* a log write must never take down a real dispatch */ }
}

/** history(repoUuid, limit) — this compartment's own exchanges, newest first. */
function history(repoUuid, limit = 50) {
  if (!repoUuid) return [];
  const rows = _jaa().query(TABLE, r => r.repoUuid === repoUuid, 1000) || [];
  return rows.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
}

/** clearHistory(repoUuid) — forget this compartment's transcript. */
function clearHistory(repoUuid) {
  if (!repoUuid) return { ok: false, errors: ['repoUuid is required'] };
  const before = history(repoUuid, 100000).length;
  try {
    _jaa().delete(TABLE, r => r.repoUuid === repoUuid);
    return { ok: true, cleared: before };
  } catch (e) { return { ok: false, errors: [`clearHistory failed: ${e.message}`] }; }
}

/**
 * status({ repo, repoDir }) — everything the Agent tab needs in one read:
 * whether a hat exists, what it knows, and what it has been doing.
 */
function status({ repo, repoDir } = {}) {
  if (!repo || !repo.uuid) return { ok: false, error: 'repo with a uuid is required' };
  const RH = _hat();
  const hat = RH.getRepoHat(repo.uuid);
  return {
    ok: true,
    repoUuid: repo.uuid,
    compartmentId: repo.compartmentId || null,
    // exists:false is an ordinary state, not an error — same convention
    // repo.hat.show and repo.scan already use so the UI's api() helper
    // does not throw on it.
    exists: !!hat,
    sharedFrom: RH.originOf(repo.uuid),   // §0.39.276 — set: this repo wears that repo's hat and uses its agent settings
    hat: hat ? { name: hat.name, baseAgent: hat.baseAgent, seedKey: hat.seedKey, toolScope: hat.toolScope || [], personaPrompt: hat.personaPrompt || '' } : null,
    index: RH.readRepoIndex(repoDir),
    memory: _memory().stats(repo.uuid),
    sessionId: sessionIdFor(repo.uuid),
    exchanges: history(repo.uuid, 1).length ? history(repo.uuid, 100000).length : 0,
    // 0.39.257 — enforced on the named backends (ollama, a browser agent): the dispatch runs copilot's tool loop
    // with allowedTools. Not on 'auto', which is copilot's own cascade.
    toolScope: getToolScope(repo.uuid),
    toolScopeEnforced: true,   // 0.39.258 — the copilot position resolves to a named backend too, or nothing is sent
  };
}

// ── /tools and /debug — §TOOLS 0.39.257 ───────────────────────────────────────
function _get(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d) }); } catch (e) { resolve({ status: res.statusCode, json: null, parseError: e.message }); } });
    });
    req.on('timeout', () => { req.destroy(new Error(`timed out after ${timeoutMs}ms`)); });
    req.on('error', reject);
  });
}

/** listTools({ repo, q }) — copilot's catalog, marked with this compartment's scope. */
async function listTools({ repo, q = '' } = {}) {
  const hat = _hat().getRepoHat(repo.uuid);
  const scope = scopeFor(repo.uuid, hat);
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (Array.isArray(scope)) qs.set('scope', scope.join(','));
  let r;
  try { r = await _get(`${COPILOT_URL}/api/tools/list?${qs}`); }
  catch (e) { return { ok: false, error: `copilot :3750 unreachable — ${e.message}` }; }
  if (r.status !== 200 || !r.json || !r.json.ok) return { ok: false, error: (r.json && r.json.error) || `copilot returned ${r.status}` };
  return { ok: true, scope: Array.isArray(scope) ? 'project' : 'all', enforced: true, provider: getProvider(repo.uuid), ...r.json };
}

/** _runTool(name, args, repoDir, scope) — one tool via copilot POST /api/tools/run. Never throws. */
async function _runTool(name, args, repoDir, scope) {
  try {
    const r = await _post(`${COPILOT_URL}/api/tools/run`, { name, args, context: repoDir ? { repoDir } : null, scope: Array.isArray(scope) ? scope : undefined }, 30000);
    return r.json || { ok: false, error: `copilot returned ${r.status}` };
  } catch (e) { return { ok: false, error: `copilot :3750 unreachable — ${e.message}` }; }
}

/** The repo's JS/MJS/CJS files that fail `node --check`, up to `max` checked. Local, no model. */
function _syntaxCheck(repoDir, max = 300) {
  const { execFileSync } = require('child_process');
  const files = [];
  const walk = (d, rel) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (files.length >= max) return;
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (/\.(c|m)?js$/.test(e.name)) files.push(r);
    }
  };
  walk(repoDir, '');
  const failed = [];
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', path.join(repoDir, f)], { stdio: 'pipe', timeout: 10000 }); }
    catch (e) { const msg = String((e.stderr && e.stderr.toString()) || e.message).split('\n').find(l => /Error/.test(l)) || 'syntax error'; failed.push({ file: f, error: msg.trim() }); }
  }
  return { checked: files.length, capped: files.length >= max, failed };
}

/** Imports the graph could not resolve — the usual cause of "cannot find module". */
function _graphProblems(repoDir, max = 15) {
  let g; try { g = JSON.parse(fs.readFileSync(path.join(repoDir, 'graph.json'), 'utf8')); } catch (_) { return null; }
  const unresolved = (g.edges || []).filter(e => e.relation === 'imports' && !e.to && e.target)
    .map(e => ({ file: String(e.from || '').replace(/^file:/, ''), target: e.target, line: e.line || null }));
  return { files: g.generatedFrom ? g.generatedFrom.fileCount : null, edges: g.edgeCount || (g.edges || []).length, unresolvedCount: unresolved.length, unresolved: unresolved.slice(0, max) };
}

/**
 * debugReport({ repo, repoDir }) — James: "including debugging, using the intelligence system". What is wrong,
 * from the systems themselves, no model involved: the repo's syntax, its graph's unresolved imports, this agent's
 * own failed exchanges (with the gate each stopped at), and the intelligence system — failure patterns, recorded
 * faults for this agent, idearium's open gaps. Each section says where it came from; an unreachable source is
 * said, not skipped.
 */
async function debugReport({ repo, repoDir } = {}) {
  if (!repo || !repo.uuid) return { ok: false, error: 'repo with a uuid is required' };
  const sections = [];
  const hat = _hat().getRepoHat(repo.uuid);
  const scope = scopeFor(repo.uuid, hat);
  if (repoDir && fs.existsSync(repoDir)) {
    const sx = _syntaxCheck(repoDir);
    sections.push({ title: 'Syntax (node --check)', source: 'this repo', ok: !sx.failed.length,
      lines: sx.failed.length ? sx.failed.map(f => `✗ ${f.file} — ${f.error}`) : [`✓ ${sx.checked} JS file${sx.checked === 1 ? '' : 's'} parse${sx.capped ? ' (first 300 checked)' : ''}`] });
    const gp = _graphProblems(repoDir);
    sections.push(gp
      ? { title: 'Graph (imports)', source: 'graph.json', ok: !gp.unresolvedCount,
          lines: gp.unresolvedCount ? [`${gp.unresolvedCount} import${gp.unresolvedCount === 1 ? '' : 's'} could not be resolved:`, ...gp.unresolved.map(u => `  ${u.file}${u.line ? `:${u.line}` : ''} → ${u.target}`)] : [`✓ every import resolves (${gp.files ?? '?'} files, ${gp.edges} edges)`] }
      : { title: 'Graph (imports)', source: 'graph.json', ok: null, lines: ['no graph yet — reindex the repo (Diagnose → reindex)'] });
  } else sections.push({ title: 'This repo', source: 'disk', ok: false, lines: ['the repo directory could not be found'] });

  const fails = history(repo.uuid, 200).filter(h => !h.ok).slice(-5);
  sections.push({ title: 'This agent\'s recent failures', source: 'exchange log', ok: !fails.length,
    lines: fails.length ? fails.map(h => `${new Date(h.ts).toLocaleString()} — ${String(h.error || h.response || 'failed').slice(0, 240)}`) : ['✓ none in the last 200 exchanges'] });

  const intel = [
    ['Failure patterns', 'intelligence_query', { action: 'failures' }],
    ['Recorded faults for this agent', 'fault_log', { action: 'check', component: agentIdFor(repo.uuid), limit: 5 }],
    ['Open gaps (idearium)', 'diagnose', { action: 'gaps', system: 'idearium' }],
  ];
  for (const [title, name, args] of intel) {
    const r = await _runTool(name, args, repoDir, scope);
    const res = r && r.result;
    const body = !r || r.ok === false ? [`unavailable — ${(r && (r.error || (res && res.error))) || 'no answer'}`]
      : String(JSON.stringify(res, null, 1)).split('\n').slice(0, 25);
    sections.push({ title, source: `intelligence system (${name})`, ok: r && r.ok !== false ? null : false, lines: body });
  }
  return { ok: true, repoUuid: repo.uuid, sections, ts: Date.now() };
}

module.exports = {
  TOOL_SCOPES, ALWAYS_IN_SCOPE, getToolScope, setToolScope, scopeFor, fillListedTools, listedTools, contextFor, listTools, debugReport,
  providers, guardianProviders, routeFor, getProvider, setProvider,
  backendOf, getOllamaModel, setOllamaModel,
  isGuardianProvider, defaultProvider, settingsView,
  LEARN_KINDS, LEARN_MAX, LEARN_PROTOCOL, parseLearned,
  MODULE_ID, VERSION, TABLE, COPILOT_URL, DEFAULT_TIMEOUT_MS,
  sessionIdFor, agentIdFor, compose, atlasFor, dispatch, findLate, adoptLate, history, clearHistory, status,
};
