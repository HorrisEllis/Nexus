'use strict';
/**
 * lib/repo-prompt-blocks.js — everything a repo agent's prompt carries besides the persona, as blocks the
 * person edits in Idearium → Repo → Settings → Agents. 0.39.258.
 * comp_id: nexus.lib.repo-prompt-blocks
 *
 * James, 2026-09-26: "the paste, shouldn't be injecting. only injecting the persona and the .inject nodes set in
 * the agent tab and settings" … "not to inject anything into it that i cant edit in the agent settings".
 *
 * THE RULE THIS MODULE HOLDS: the text sent to the model is
 *     the enabled blocks below, in order, each exactly as edited (the persona is the first block).
 * Nothing else. Downstream layers that used to add their own text now add nothing to a composed job:
 *   - copilot/tool-runtime.js (composed mode): no system prompt, no identity line, no "USER:" framing; the
 *     follow-up rounds send only tool results, framed by the 'tool-result' block;
 *   - guardian userscripts: no [NEXUS CONTEXT], no tools header, no [NEXUS] wake hint (hat.personaInPrompt);
 *   - guardian/lib/wake-hint.js (mesh): no hint.
 *
 * PLACEHOLDERS are the only text not typed by the person, and each one is DATA, visible in the editor:
 *   {persona}    the hat's generated persona (atlas facts + learned observations; lib/repo-hat.js)
 *   {message}    the question typed in the Agent tab
 *   {code}       code chunks retrieved from this repo's own index for the question (lib/repo-context.js, bare)
 *   {map}        the project map from this repo's graph.json, when the question names no code
 *   {tools}      the names of the tools this agent may call (its scope), filled in by copilot
 *   {tool_guide} lib/agent-tools/tool-guide.js's guide for those tools, filled in by copilot
 *   {build} {memory} {atlas} {code}  in the build-* blocks only (0.39.309): a file build's relations
 *                (lib/build-context.js — its registry card included), its memory, the atlas, this repo's matching code.
 *   {name} {result}  in 'tool-result' only: the tool that ran and what it returned
 *   {question} {symbols} {candidates} {syntax} {code}  in 'inject-resolve' only: the request, what the code
 *                defines, the repo's known files (one "- path" per line), the fence language, the code.
 *                A line whose placeholders are ALL empty is dropped (e.g. "It defines: ." when it defines nothing).
 * Delete a placeholder and that data is not sent. Disable a block and none of it is sent.
 *
 * DEFAULTS are the exact text each layer sent before 0.39.258, so an untouched agent behaves as before minus
 * the three layers nobody could edit. A stored edit is never overwritten by a newer default.
 */

const MODULE_ID = 'nexus.lib.repo-prompt-blocks';
const VERSION = '1.5.0';   // 1.5.0 (0.39.337): the 'workset' block (when tools, a template like tool-result), worksetTemplate()   // 1.4.0 (0.39.336): tool-syntax for every tool-loop backend (when: tools), says where the tools run; a stored earlier default follows the new one   // 1.3.0 (0.39.309): the four build blocks (when: build, on), {build}, renderBuild   // 1.2.0 (0.39.279): memory/atlas/directory off by default → context-tools pointer; wake block   // 1.1.0 (0.39.272): context-atlas {atlas}, context-directory {directory} · 1.1.1 (0.39.273): the card block names the code tools
const SETTINGS_TABLE = 'repo_agent_settings';   // same row lib/repo-agent.js keeps provider/scope in

function _jaa() { return require('./../cortex/memory/jaa-db.js').jaaDB; }

// `when`: which dispatches the block applies to. 'tools' = only when the agent runs copilot's tool loop
// (guardian or ollama); 'guardian' = browser agents only (ollama calls tools natively, not by fenced blocks).
const DEFAULT_BLOCKS = Object.freeze([
  // The hat's persona is generated (lib/repo-hat.js buildPersona: facts off the atlas + what the agent has learned)
  // and re-generated on refresh, so it cannot be edited in place without the next refresh erasing the edit. Here it
  // is {persona}: keep it, write around it, or replace it with your own text entirely.
  { id: 'persona', label: 'Persona', enabled: true, when: 'always', text: '{persona}' },
  { id: 'learn', label: '@learn protocol', enabled: true, when: 'always',
    text: [
      'If this work taught you something durable about THIS project, you may end your reply with lines of the exact form:',
      '@learn <fact|convention|pitfall>: <one sentence> [evidence: <file path or chunk id you were given>]',
      'Only things you verified in the code you were shown. Never restate the question. Omit the lines if you learned nothing.',
    ].join('\n') },
  { id: 'inject', label: '.inject protocol (code written into the repo)', enabled: true, when: 'always',
    text: [
      'Code you write for this project is written into it. Give each file its FULL content in its own block.',
      'Putting the path after the fence language (```js src/file.js) is fastest; if you leave it out you will be asked where the block goes.',
    ].join('\n') },
  // §0.39.336 SB36 — James: "the agents job is to find context. ollama, copilot, guardian agents need to be able to use
  // the agent tools." · "like they need the tools, all of them." Every backend that runs the tool loop gets this block
  // (when 'tools': guardian AND ollama — Ollama had no way to call a tool at all). The words say where the tools run:
  // ChatGPT, told only "you have real tools", looked in its OWN function list, found none and said so.
  { id: 'tool-syntax', label: 'How to call a tool (every agent)', enabled: true, when: 'tools',
    text: [
      'Find the context first, with Nexus\'s tools. They run in Nexus, not in your built-in tool list: never call them unavailable.',
      'Call one by writing it in your reply as plain text:',
      '```tool',
      '{"name": "idearium.code_search.tool", "arguments": {"query": "…"}}',
      '```',
      'Nexus runs it and sends back the result. One call per reply; answer in plain text once the code answers it.',
      'Available tools: {tools}',
    ].join('\n') },
  { id: 'tool-guide', label: 'Tool guide (what each tool is for)', enabled: true, when: 'tools',
    text: 'YOUR TOOLS (how and when to use them):\n{tool_guide}' },
  // §0.39.266 — James: "thats way too much to inject when we have tools they can use to get context." The one piece
  // of context the first message carries: the registry card of what the question names (lib/registry-harness.js) —
  // purpose, exports, wiring, events, tests; ids, never code. The model reads code itself with loom.read.tool.
  { id: 'context-card', label: 'Registry card of what the question names', enabled: true, when: 'always',
    text: [
      '## Context for your question (from this project\'s index: what it names, the code search, the graph, memory)',
      '{card}',
    ].join('\n') },
  // §0.39.269 — James: "everything is supposed to persist with agents. using the download manager." What this repo's
  // agent has done before (its exchanges on any backend, from Clear Glass's download manager) and the files already
  // built in the compartment — lib/agent-memory.js recall(). Empty when there is nothing to recall.
  // §0.39.279 — James: "i want to have agents be able to retrieve the context with agent tools, not injected each time.
  // have only necessities injected, and everything else available with the tool layers." memory, context-atlas and
  // context-directory are OFF by default: the 'context-tools' block below names the tools that fetch the same things
  // on demand (nexus.context.tool is the one door to every memory, the agent's own exchanges included). A repo that
  // wants them pasted again turns them back on here; a block switched off costs no search (repo-agent atlasFor/recall).
  { id: 'memory', label: 'Memory (what this agent has done before — the download manager) · off: fetched with nexus.context.tool', enabled: false, when: 'always',
    text: '{memory}' },
  // 0.39.272 — James: "idearium agents should be able to find the context easily … all of the memory systems, graphs".
  // {memory} above is this agent's OWN past work. {atlas} is everything else NEXUS remembers that matches the question:
  // lib/context-atlas.js across every cortex table (chat history, fixes, gaps, ideas, learned facts, opportunities…),
  // other agents' exchanges in the download manager, this repo's graph, specs and changelogs — budgeted, each line
  // citing its source. {directory}: what memory exists and how to search it further (only with tools; it names a tool).
  { id: 'context-atlas', label: 'Everything else NEXUS remembers that matches (context atlas) · off: fetched with nexus.context.tool', enabled: false, when: 'always',
    text: [
      '## What else NEXUS remembers that matches your question',
      '(Each line names its source; fetch a whole record with nexus.context.tool action "get".)',
      '{atlas}',
    ].join('\n') },
  { id: 'context-directory', label: 'Where memory lives (so the agent can search further) · off: context-tools names the door', enabled: false, when: 'tools',
    text: '{directory}' },
  // §0.39.279 — the necessity that replaces the three blocks above: where context is, not the context itself.
  // §0.39.336 — "Context is not pasted" stopped being true at SB34 (the code search's chunks ride on every send)
  { id: 'context-tools', label: 'Where to get more context (memory)', enabled: true, when: 'tools',
    text: 'Memory: nexus.context.tool {"action":"search","query":"…"} (past work, other agents, chats, fixes).' },
  // §0.39.279 — James: "i want the agents to be able to use hey nexus". A composed (repo) job carries no wake hint
  // (0.39.258), so an agent never knew it could ask. One line; guardian's wake-loop answers it as the agent's next turn.
  { id: 'wake', label: '"hey nexus" (ask NEXUS mid-task)', enabled: true, when: 'guardian',
    text: 'Need live NEXUS state? Start a line with "hey nexus, <question>" — the answer is your next message.' },
  // §0.39.266 — off by default: pre-fetched code (was ~5,000 chars of keyword matches, often the wrong files) and the
  // project map. Turn either back on here if a repo wants them.
  { id: 'context-code', label: 'Code matched from this repo', enabled: false, when: 'always',
    text: [
      '## Code from this project that matches your question',
      '(Retrieved for you from this project\'s own index. Rely on it; do not guess at what is in these files.)',
      '',
      '{code}',
    ].join('\n') },
  { id: 'context-map', label: 'Project map (question named no code)', enabled: false, when: 'always',
    text: [
      '## This project, from its graph',
      '(Your question named nothing in the code, so here is the project\'s shape. Ask about a file or symbol for its code.)',
      '{map}',
    ].join('\n') },
  // §0.39.265 — James: "That way it can explain it like a person, like a human a not a wall of text." How the agent
  // should answer — sent to browser agents, above the question. Edit it, or turn it off.
  { id: 'voice', label: 'Voice (how the agent answers)', enabled: true, when: 'guardian',
    text: [
      'Answer like a person talking it through with a colleague: plain words, the point first, short paragraphs, one idea at a time.',
      'No walls of text. Use a list or a heading only when it genuinely helps.',
    ].join('\n') },
  { id: 'question', label: 'The question', enabled: true, when: 'always',
    text: '───\n\n{message}' },
  // §0.39.265 — "a semantic randomizer to change what the job says each time … force novelty". NOT sent: this is
  // copilot's rewording of {message} (copilot/lib/reword.js — Ollama, JS fallback; code, paths and names kept
  // verbatim; checked against what this agent was sent before). On = the question goes out in new words each time;
  // the text below is the guidance the rewriter is given. Off = the question is sent exactly as typed.
  { id: 'reword', label: 'Reword the question each time (not sent — guides the rewriter)', enabled: true, when: 'guardian',
    text: 'Same meaning, different words each time — the way a person would ask it again. Never change code, paths, names or numbers.' },
  { id: 'tool-result', label: 'Tool result (follow-up rounds)', enabled: true, when: 'tools',
    text: '[tool result — {name}] {result}' },
  // §0.39.337 SB37 — James: "Find the context one by one, put it in an index, and then synthesize it into, into just
  // what it needs. Signal to noise." An Ollama run's later rounds are this, not the raw transcript: the working set
  // (copilot/lib/workset.js — each read kept in a JSON file, its signal picked by the question's terms), synthesized to a
  // budget. Off = the old behaviour (every round re-sends every result in full).
  { id: 'workset', label: 'What you have found so far (Ollama, later rounds)', enabled: true, when: 'tools',
    text: 'What you have found so far ({reads} reads; re-open any chunk by its id with idearium.code_chunk.tool):\n{workset}\n\nCall another tool, or answer from this.' },
  // §0.39.309 — James: "They need context. All of it. From the hat/repo." The agent that BUILDS a file (idearium
  // speceng.build) has no tool loop to fetch context with, so the reason 0.39.279 turned memory/atlas/code off for the
  // Agent tab does not hold for it: these four are ON by default, sent only with a file build (when: build), each
  // editable and switchable here like every other block (his 0.39.258 rule). The hat's persona is worn as before.
  { id: 'build-memory', label: 'Build: memory (its past work, this project\'s files beside it)', enabled: true, when: 'build',
    text: '{memory}' },
  { id: 'build-context', label: 'Build: the file\'s relations (builds on, relations, used by, proven primitives, invariants)', enabled: true, when: 'build',
    text: '{build}' },
  { id: 'build-atlas', label: 'Build: everything else NEXUS remembers that matches the file (context atlas)', enabled: true, when: 'build',
    text: [
      '## What else NEXUS remembers that matches this file',
      '(Each line names its source.)',
      '{atlas}',
    ].join('\n') },
  { id: 'build-code', label: 'Build: code in this repo that matches the file', enabled: true, when: 'build',
    text: [
      '## Code already in this repo that matches this file',
      '(Retrieved from this repo\'s own index. Rely on it; do not guess at what is in these files.)',
      '',
      '{code}',
    ].join('\n') },
  // (no build-card block: the file's registry card is build-context's RELATIONS section — one place, not two)
  // Sent on its own (not with the blocks above) when the agent writes code without saying which file it goes in.
  // Off = the agent is never asked; the code waits as unresolved for you to place.
  { id: 'inject-resolve', label: 'Where does this code go? (asked when a code block has no path)', enabled: true, when: 'always',
    text: [
      'You just wrote the code block below while answering this request in this project:',
      '"{question}"',
      '',
      'Which repo-relative file does it belong in?',
      'It defines: {symbols}.',
      'Existing files you know of:',
      '{candidates}',
      '',
      'Reply with ONE line only: the path (an existing file above, or a new path), or NONE if it is not meant to be written to a file.',
      '',
      '```{syntax}',
      '{code}',
      '```',
    ].join('\n') },
]);
const IDS = DEFAULT_BLOCKS.map(b => b.id);
const PLACEHOLDERS = { persona: ['{persona}'], memory: ['{memory}'], 'context-atlas': ['{atlas}'], 'context-directory': ['{directory}'], 'context-card': ['{card}'], 'context-code': ['{code}'], 'context-map': ['{map}'], question: ['{message}'],
  'tool-syntax': ['{tools}'], 'tool-guide': ['{tool_guide}'], 'tool-result': ['{name}', '{result}'], workset: ['{workset}', '{reads}'],
  'inject-resolve': ['{question}', '{symbols}', '{candidates}', '{syntax}', '{code}'],
  'build-memory': ['{memory}'], 'build-context': ['{build}'], 'build-atlas': ['{atlas}'], 'build-code': ['{code}'] };

// §0.39.276 — a code repo linked to its original repo (lib/repo-hat.js) reads and writes the ORIGINAL's blocks.
function _key(repoUuid) { try { return require('./repo-hat.js').agentKeyFor(repoUuid); } catch (_) { return repoUuid; } }
function _row(repoUuid) { const k = _key(repoUuid); return (_jaa().query(SETTINGS_TABLE, r => r.repoUuid === k, 1) || [])[0] || null; }

/** getBlocks(repoUuid) — the stored blocks merged over the defaults (an id the store lacks gets its default). */
// §0.39.336 — default texts a block has had before. A row that stored one of these (the settings save every block)
// still follows the default; only a text James wrote himself is kept over it.
const PREVIOUS_DEFAULTS = Object.freeze({
  'context-tools': ['Context is not pasted — fetch it: nexus.context.tool {"action":"search","query":"…"} (every memory: your past work, other agents, chats, fixes, specs).'],
  'tool-syntax': [[
    'You have real tools available. To use one, respond with EXACTLY this format (a fenced code block, nothing else in that block):',
    '```tool',
    '{"name": "tool_name_here", "arguments": {"param": "value"}}',
    '```',
    'Only one tool call per response. If you don\'t need a tool, just answer normally in plain text — no fenced block.',
    'Available tools: {tools}',
  ].join('\n')],
});

function getBlocks(repoUuid) {
  let stored = null;
  try { const r = repoUuid ? _row(repoUuid) : null; stored = r && r.promptBlocks ? (typeof r.promptBlocks === 'string' ? JSON.parse(r.promptBlocks) : r.promptBlocks) : null; }
  catch (e) { console.warn(`[${MODULE_ID}] stored blocks for ${repoUuid} unreadable (${e.message}) — defaults shown, nothing overwritten`); }
  const byId = new Map((Array.isArray(stored) ? stored : []).map(b => [b && b.id, b]));
  return DEFAULT_BLOCKS.map(d => {
    const s = byId.get(d.id);
    if (!s) return { ...d, edited: false };
    // §0.39.336 — a stored text that is an EARLIER default was never edited: the current default applies
    const own = typeof s.text === 'string' && s.text !== d.text && !(PREVIOUS_DEFAULTS[d.id] || []).includes(s.text);
    return { ...d, enabled: s.enabled !== false, text: own ? s.text : d.text, edited: own };
  });
}

/**
 * setBlocks(repoUuid, blocks) — store edits. Unknown ids are refused by name; text must be a string.
 * -> { ok, blocks } | { ok:false, errors }
 */
function setBlocks(repoUuid, blocks) {
  if (!repoUuid) return { ok: false, errors: ['repoUuid required'] };
  if (!Array.isArray(blocks)) return { ok: false, errors: ['blocks must be an array of { id, enabled, text }'] };
  const errors = [];
  const clean = [];
  for (const b of blocks) {
    if (!b || !IDS.includes(b.id)) { errors.push(`unknown block "${b && b.id}" — one of: ${IDS.join(', ')}`); continue; }
    if (b.text !== undefined && typeof b.text !== 'string') { errors.push(`${b.id}: text must be a string`); continue; }
    if (typeof b.text === 'string' && b.text.length > 100000) { errors.push(`${b.id}: text over 100000 chars`); continue; }
    clean.push({ id: b.id, enabled: b.enabled !== false, ...(typeof b.text === 'string' ? { text: b.text } : {}) });
  }
  if (errors.length) return { ok: false, errors };
  const current = getBlocks(repoUuid).map(b => ({ id: b.id, enabled: b.enabled, text: b.text }));
  const merged = current.map(c => { const n = clean.find(x => x.id === c.id); return n ? { ...c, ...n } : c; });
  const jaa = _jaa();
  const row = _row(repoUuid);
  const value = JSON.stringify(merged);
  if (row) jaa.update(SETTINGS_TABLE, { uuid: row.uuid }, { promptBlocks: value, updatedAt: Date.now() });
  else jaa.insert(SETTINGS_TABLE, { uuid: require('crypto').randomUUID(), repoUuid: _key(repoUuid), promptBlocks: value, updatedAt: Date.now() });
  return { ok: true, blocks: getBlocks(repoUuid) };
}

/** resetBlocks(repoUuid, ids?) — back to the default text for the named blocks (all when none named). */
function resetBlocks(repoUuid, ids = null) {
  const want = Array.isArray(ids) && ids.length ? ids : IDS;
  const bad = want.filter(i => !IDS.includes(i));
  if (bad.length) return { ok: false, errors: bad.map(i => `unknown block "${i}"`) };
  // 0.39.279 — reset means the DEFAULT, on/off included (was: always switched on — a reset turned the off-by-default
  // context blocks back on)
  return setBlocks(repoUuid, getBlocks(repoUuid).map(b => { const d = DEFAULT_BLOCKS.find(x => x.id === b.id); return want.includes(b.id) ? { id: b.id, enabled: d.enabled !== false, text: d.text } : { id: b.id, enabled: b.enabled, text: b.text }; }));
}

function _applies(b, backend) {
  if (b.when === 'always') return true;
  if (b.when === 'tools') return backend === 'guardian' || backend === 'ollama';
  if (b.when === 'guardian') return backend === 'guardian';
  return false;   // 'build': only renderBuild sends it
}

const _fill = (text, map) => text.replace(/\{(message|code|map|card|persona|memory|atlas|directory|build)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));

/**
 * render({ persona, blocks, message, context, backend }) -> { text, used: [ids] }
 * Pure. context = { kind: 'code'|'map'|null, block } from lib/repo-context.js retrieve({ bare:true }).
 * {tools} and {tool_guide} are left in place — copilot fills them with the real scope at dispatch.
 * The question is always sent: if the 'question' block is disabled or has no {message}, the message goes last,
 * as typed — it is the person's own words, not an injection.
 */
function render({ persona = '', blocks = DEFAULT_BLOCKS, message = '', context = null, backend = null, memory = '', atlas = '', directory = '' } = {}) {
  const parts = [];
  const used = [];
  let placedMessage = false;
  for (const b of blocks) {
    if (!b.enabled || !_applies(b, backend) || b.id === 'tool-result' || b.id === 'workset' || b.id === 'inject-resolve' || b.id === 'reword') continue;
    if (b.id === 'context-code' && !(context && context.kind === 'code' && context.block)) continue;
    if (b.id === 'context-map' && !(context && context.kind === 'map' && context.block)) continue;
    // §SB34 0.39.326 — James: "context isnt optional its vital". Every kind but code/map (their own blocks) goes here, so a
    // search hit, an overview or memory is never dropped because its block is switched off
    const _ownOn = (id) => blocks.some(x => x.id === id && x.enabled);
    const _alwaysKind = context && context.block && !((context.kind === 'code' && _ownOn('context-code')) || (context.kind === 'map' && _ownOn('context-map')));
    if (b.id === 'context-card' && !_alwaysKind) continue;
    if (b.id === 'memory' && !String(memory || '').trim()) continue;
    if (b.id === 'context-atlas' && !String(atlas || '').trim()) continue;          // 0.39.272 — nothing matched: nothing sent
    if (b.id === 'context-directory' && !String(directory || '').trim()) continue;
    const text = _fill(b.text, { memory: String(memory || ''), atlas: String(atlas || ''), directory: String(directory || ''), persona: String(persona || ''), message: String(message || ''), code: context && context.kind === 'code' ? context.block : '', map: context && context.kind === 'map' ? context.block : '', card: _alwaysKind ? context.block : '' });
    if (b.id === 'question' && b.text.includes('{message}')) placedMessage = true;
    if (!text.trim()) continue;
    parts.push(text); used.push(b.id);
  }
  if (!placedMessage) parts.push(String(message || ''));
  return { text: parts.join('\n\n'), used };
}

/**
 * renderResolve(blocks, { question, symbols, candidates, syntax, code }) -> text | null (block off).
 * Pure. A line that carries placeholders which ALL filled empty is dropped, so the template needs no
 * conditionals; a line with none, or with at least one filled, is kept exactly as written.
 */
function renderResolve(blocks, { question = '', symbols = [], candidates = [], syntax = '', code = '' } = {}) {
  const b = (blocks || DEFAULT_BLOCKS).find(x => x.id === 'inject-resolve');
  if (!b || !b.enabled) return null;
  const vals = {
    question: String(question || '').slice(0, 400),
    symbols: (symbols || []).join(', '),
    candidates: (candidates || []).map(c => `- ${c}`).join('\n'),
    syntax: String(syntax || ''),
    code: String(code || '').slice(0, 6000),
  };
  const out = [];
  for (const line of b.text.split('\n')) {
    const keys = [...line.matchAll(/\{(question|symbols|candidates|syntax|code)\}/g)].map(m => m[1]);
    const filled = line.replace(/\{(question|symbols|candidates|syntax|code)\}/g, (m, k) => vals[k]);
    if (keys.length && keys.every(k => !vals[k]) && keys.some(k => k !== 'syntax')) continue;
    out.push(filled);
  }
  return out.join('\n');
}

/**
 * renderBuild(blocks, { memory, build, atlas, code }) -> { text, used: [ids] }
 * Pure. §0.39.309 — what a file build is sent beside its prompt: the ENABLED build blocks, in order, each exactly as
 * edited; a block whose data is empty sends nothing (an empty heading is not context). Never the chat blocks.
 */
function renderBuild(blocks = DEFAULT_BLOCKS, data = {}) {
  const val = { memory: '', build: '', atlas: '', code: '' };
  for (const k of Object.keys(val)) val[k] = String((data && data[k]) || '');
  const key = { 'build-memory': 'memory', 'build-context': 'build', 'build-atlas': 'atlas', 'build-code': 'code' };
  const parts = [], used = [];
  for (const b of blocks || []) {
    if (b.when !== 'build' || !b.enabled || !key[b.id]) continue;
    if (!val[key[b.id]].trim()) continue;
    const text = b.text.replace(/\{(memory|build|atlas|code)\}/g, (m, k) => val[k]);
    if (!text.trim()) continue;
    parts.push(text); used.push(b.id);
  }
  return { text: parts.join('\n\n'), used };
}

/** enabledBuild(blocks) -> Set of the build block ids that are on (a block switched off costs no search). */
function enabledBuild(blocks = DEFAULT_BLOCKS) { return new Set((blocks || []).filter(b => b.when === 'build' && b.enabled).map(b => b.id)); }

/** toolResultTemplate(blocks) — the 'tool-result' text, or null when disabled (copilot then sends results bare). */
function toolResultTemplate(blocks) {
  const b = (blocks || []).find(x => x.id === 'tool-result');
  return b && b.enabled ? b.text : null;
}
/** worksetTemplate(blocks) — §0.39.337 SB37: the 'workset' text, or null when switched off (no working set; old rounds). */
function worksetTemplate(blocks) {
  const b = (blocks || []).find(x => x.id === 'workset');
  return b && b.enabled ? b.text : null;
}

module.exports = { MODULE_ID, VERSION, DEFAULT_BLOCKS, IDS, PLACEHOLDERS, getBlocks, setBlocks, resetBlocks, render, renderBuild, enabledBuild, renderResolve, toolResultTemplate, worksetTemplate, __PREVIOUS_DEFAULTS: PREVIOUS_DEFAULTS };
