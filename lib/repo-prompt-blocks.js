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
const VERSION = '1.0.0';
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
  { id: 'tool-syntax', label: 'How to call a tool (browser agents)', enabled: true, when: 'guardian',
    text: [
      'You have real tools available. To use one, respond with EXACTLY this format (a fenced code block, nothing else in that block):',
      '```tool',
      '{"name": "tool_name_here", "arguments": {"param": "value"}}',
      '```',
      'Only one tool call per response. If you don\'t need a tool, just answer normally in plain text — no fenced block.',
      'Available tools: {tools}',
    ].join('\n') },
  { id: 'tool-guide', label: 'Tool guide (what each tool is for)', enabled: true, when: 'tools',
    text: 'YOUR TOOLS (how and when to use them):\n{tool_guide}' },
  { id: 'context-code', label: 'Code matched from this repo', enabled: true, when: 'always',
    text: [
      '## Code from this project that matches your question',
      '(Retrieved for you from this project\'s own index. Rely on it; do not guess at what is in these files.)',
      '',
      '{code}',
    ].join('\n') },
  { id: 'context-map', label: 'Project map (question named no code)', enabled: true, when: 'always',
    text: [
      '## This project, from its graph',
      '(Your question named nothing in the code, so here is the project\'s shape. Ask about a file or symbol for its code.)',
      '{map}',
    ].join('\n') },
  { id: 'question', label: 'The question', enabled: true, when: 'always',
    text: '───\n\n{message}' },
  { id: 'tool-result', label: 'Tool result (follow-up rounds)', enabled: true, when: 'tools',
    text: '[tool result — {name}] {result}' },
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
const PLACEHOLDERS = { persona: ['{persona}'], 'context-code': ['{code}'], 'context-map': ['{map}'], question: ['{message}'],
  'tool-syntax': ['{tools}'], 'tool-guide': ['{tool_guide}'], 'tool-result': ['{name}', '{result}'],
  'inject-resolve': ['{question}', '{symbols}', '{candidates}', '{syntax}', '{code}'] };

function _row(repoUuid) { return (_jaa().query(SETTINGS_TABLE, r => r.repoUuid === repoUuid, 1) || [])[0] || null; }

/** getBlocks(repoUuid) — the stored blocks merged over the defaults (an id the store lacks gets its default). */
function getBlocks(repoUuid) {
  let stored = null;
  try { const r = repoUuid ? _row(repoUuid) : null; stored = r && r.promptBlocks ? (typeof r.promptBlocks === 'string' ? JSON.parse(r.promptBlocks) : r.promptBlocks) : null; }
  catch (e) { console.warn(`[${MODULE_ID}] stored blocks for ${repoUuid} unreadable (${e.message}) — defaults shown, nothing overwritten`); }
  const byId = new Map((Array.isArray(stored) ? stored : []).map(b => [b && b.id, b]));
  return DEFAULT_BLOCKS.map(d => {
    const s = byId.get(d.id);
    if (!s) return { ...d, edited: false };
    return { ...d, enabled: s.enabled !== false, text: typeof s.text === 'string' ? s.text : d.text,
      edited: typeof s.text === 'string' && s.text !== d.text };
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
  else jaa.insert(SETTINGS_TABLE, { uuid: require('crypto').randomUUID(), repoUuid, promptBlocks: value, updatedAt: Date.now() });
  return { ok: true, blocks: getBlocks(repoUuid) };
}

/** resetBlocks(repoUuid, ids?) — back to the default text for the named blocks (all when none named). */
function resetBlocks(repoUuid, ids = null) {
  const want = Array.isArray(ids) && ids.length ? ids : IDS;
  const bad = want.filter(i => !IDS.includes(i));
  if (bad.length) return { ok: false, errors: bad.map(i => `unknown block "${i}"`) };
  return setBlocks(repoUuid, getBlocks(repoUuid).map(b => want.includes(b.id) ? { id: b.id, enabled: true, text: DEFAULT_BLOCKS.find(d => d.id === b.id).text } : { id: b.id, enabled: b.enabled, text: b.text }));
}

function _applies(b, backend) {
  if (b.when === 'always') return true;
  if (b.when === 'tools') return backend === 'guardian' || backend === 'ollama';
  if (b.when === 'guardian') return backend === 'guardian';
  return false;
}

const _fill = (text, map) => text.replace(/\{(message|code|map|persona)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));

/**
 * render({ persona, blocks, message, context, backend }) -> { text, used: [ids] }
 * Pure. context = { kind: 'code'|'map'|null, block } from lib/repo-context.js retrieve({ bare:true }).
 * {tools} and {tool_guide} are left in place — copilot fills them with the real scope at dispatch.
 * The question is always sent: if the 'question' block is disabled or has no {message}, the message goes last,
 * as typed — it is the person's own words, not an injection.
 */
function render({ persona = '', blocks = DEFAULT_BLOCKS, message = '', context = null, backend = null } = {}) {
  const parts = [];
  const used = [];
  let placedMessage = false;
  for (const b of blocks) {
    if (!b.enabled || !_applies(b, backend) || b.id === 'tool-result' || b.id === 'inject-resolve') continue;
    if (b.id === 'context-code' && !(context && context.kind === 'code' && context.block)) continue;
    if (b.id === 'context-map' && !(context && context.kind === 'map' && context.block)) continue;
    const text = _fill(b.text, { persona: String(persona || ''), message: String(message || ''), code: context && context.kind === 'code' ? context.block : '', map: context && context.kind === 'map' ? context.block : '' });
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

/** toolResultTemplate(blocks) — the 'tool-result' text, or null when disabled (copilot then sends results bare). */
function toolResultTemplate(blocks) {
  const b = (blocks || []).find(x => x.id === 'tool-result');
  return b && b.enabled ? b.text : null;
}

module.exports = { MODULE_ID, VERSION, DEFAULT_BLOCKS, IDS, PLACEHOLDERS, getBlocks, setBlocks, resetBlocks, render, renderResolve, toolResultTemplate };
