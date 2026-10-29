'use strict';
/**
 * lib/repo-history-nodes.js — Idearium's history as nodes, one per unit (HN1/HN2, 0.60.285).
 * comp_id: nexus.lib.repo-history-nodes
 * Spec: docs/idearium-history-nodes.spec MOD-HISTORY-NODES, MOD-HISTORY-WIRE · Map: docs/2026-10-29-history-nodes-phasemap.spec
 *
 * James, 2026-10-29: "i want all the history in idearium saved as nodes per unit. like a .reponse, .input, all of the taxonomy and expand
 * if needed." · "what about .node types for each language/code block for each agent?"
 *
 * One exchange with a repo's agent → nodes in idearium/data/nodes/<type>/ (Idearium's node registry watches those folders):
 *   .exchange   the unit: who answered, ok, how long, and the ids of its parts
 *   .input      the message, whole
 *   .response   the reply, whole (the log row cuts it at 8000 characters)
 *   .tool_call  each tool the agent called: arguments and result, whole
 *   .code_block each fenced block in the reply: language as written and normalized, the agent that wrote it, sha (HN_D2: one type, the
 *               language is a field)
 * Nothing here throws into the agent's dispatch: record() collects errors and says them (HN-002).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NE = require('./node-export.js');

const MODULE_ID = 'nexus.lib.repo-history-nodes';
const ROOT = path.join(__dirname, '..');
const MAX = 2 * 1024 * 1024;   // a unit past 2 MB keeps its first 2 MB, size and sha (HN-001)

const LANG = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', javascript: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript', typescript: 'typescript', py: 'python', python: 'python', python3: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell', shell: 'shell', console: 'shell', ps: 'powershell', ps1: 'powershell', powershell: 'powershell', pwsh: 'powershell',
  json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', md: 'markdown', markdown: 'markdown', sql: 'sql', go: 'go', rs: 'rust', rust: 'rust', java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', 'c++': 'cpp', cs: 'csharp', csharp: 'csharp', rb: 'ruby', ruby: 'ruby', php: 'php', swift: 'swift',
  diff: 'diff', patch: 'diff', dockerfile: 'dockerfile', makefile: 'make', spec: 'yaml', tool: 'tool-call', tool_call: 'tool-call', text: 'text', txt: 'text', '': 'text' };

const sha = (s) => crypto.createHash('sha256').update(String(s == null ? '' : s)).digest('hex');
const _cap = (s) => { const t = String(s == null ? '' : s); return t.length > MAX ? { text: t.slice(0, MAX), oversize: true, size: t.length, sha: sha(t) } : { text: t, oversize: false }; };

/** codeBlocks(text) → [{ index, language, lang, code, lines, sha, unclosed }] — ``` and ~~~ fences; an unclosed one runs to the end, said */
function codeBlocks(text) {
  const lines = String(text || '').split('\n'), out = [];
  let open = null;
  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)?.*$/.exec(line);
    if (!open) { if (m) open = { fence: m[1], language: (m[2] || '').trim(), body: [] }; continue; }
    if (m && m[1][0] === open.fence[0] && m[1].length >= open.fence.length && !m[2]) { out.push(open); open = null; continue; }
    open.body.push(line);
  }
  if (open) { open.unclosed = true; out.push(open); }
  return out.map((b, index) => {
    const code = b.body.join('\n'), language = b.language || '';
    return { index, language, lang: LANG[language.toLowerCase()] || language.toLowerCase() || 'text', code, lines: code ? b.body.length : 0, sha: sha(code), unclosed: !!b.unclosed };
  });
}

/** nodesFor(exchange) → envelope[] — the exchange's parts as node-export envelopes */
function nodesFor(x = {}) {
  if (!x.repoUuid || !x.exchangeId) throw new Error('nodesFor: repoUuid and exchangeId are required');
  const id = String(x.exchangeId), ts = x.ts || Date.now(), sys = { system: 'idearium' };
  const agent = { provider: x.provider || null, model: x.model || null, hat: x.hat || null };
  const env = [];
  const parts = { input: `in:${id}`, response: x.text != null || x.error ? `re:${id}` : null, toolCalls: [], codeBlocks: [], injects: (x.injects || []).map(i => i.uuid || i).filter(Boolean) };
  const msg = _cap(x.message);
  env.push(NE.wrap('input', parts.input, {
    provider: x.provider || 'unknown', prompt: msg.text, source: 'idearium.repo-agent', repoUuid: x.repoUuid, exchangeId: id, hat: x.hat || null,
    chars: String(x.message || '').length, ...(msg.oversize ? { oversize: true, size: msg.size, sha: msg.sha } : {}), ...(x.truncated && x.truncated.message ? { truncated: true } : {}), ts,
  }, { ...sys, context: `what was asked of the repo agent (${x.repoUuid})`, summary: String(x.message || '').replace(/\s+/g, ' ').slice(0, 120) }));
  if (parts.response) {
    const body = x.ok ? String(x.text || '') : String(x.error || '');
    const r = _cap(body);
    env.push(NE.wrap('response', parts.response, {
      jobId: x.jobId || id, provider: x.provider || 'unknown', status: x.ok ? 'complete' : 'error', text: r.text, chars: body.length, contentHash: sha(body),
      source: 'idearium.repo-agent', sinks: { node: { ok: true, detail: 'idearium/data/nodes/response' } }, repoUuid: x.repoUuid, exchangeId: id,
      model: x.model || null, hat: x.hat || null, ...(r.oversize ? { oversize: true, size: r.size } : {}), ...(x.truncated && x.truncated.response ? { truncated: true } : {}), ts,
    }, { ...sys, context: `the repo agent's ${x.ok ? 'reply' : 'failure'} (${x.repoUuid})`, summary: body.replace(/\s+/g, ' ').slice(0, 120) }));
  }
  (x.toolCalls || []).forEach((c, i) => {
    const tid = `tc:${id}:${i}`; parts.toolCalls.push(tid);
    const ok = !(c && c.result && c.result.error) && !(c && c.scopeRejected);
    env.push(NE.wrap('tool_call', tid, { exchangeId: id, index: i, name: String((c && c.name) || 'unknown'), arguments: (c && c.arguments) || {}, result: c ? c.result : null, ok, iteration: c && c.iteration != null ? c.iteration : null, repoUuid: x.repoUuid, agent },
      { ...sys, context: `a tool the repo agent called (${x.repoUuid})`, summary: `${(c && c.name) || '?'} ${ok ? 'ok' : 'failed'}` }));
  });
  if (x.ok) for (const b of codeBlocks(x.text)) {
    const cid = `cb:${id}:${b.index}`; parts.codeBlocks.push(cid);
    env.push(NE.wrap('code_block', cid, { exchangeId: id, ...b, agent, repoUuid: x.repoUuid, ...(x.truncated && x.truncated.response ? { truncated: true } : {}) },
      { ...sys, context: `a ${b.lang} block the repo agent wrote (${x.repoUuid})`, summary: `${b.lang} · ${b.lines} line(s)${b.unclosed ? ' · unclosed' : ''}`, tags: [`lang:${b.lang}`, ...(agent.provider ? [`agent:${agent.provider}`] : [])] }));
  }
  env.unshift(NE.wrap('exchange', `ex:${id}`, {
    exchangeId: id, repoUuid: x.repoUuid, ok: !!x.ok, parts, ts, hat: x.hat || null, provider: x.provider || null, model: x.model || null, backend: x.backend || null,
    error: x.ok ? null : (x.error || null), elapsedMs: x.elapsedMs != null ? x.elapsedMs : null, ...(x.truncated ? { truncated: !!(x.truncated.message || x.truncated.response) } : {}),
  }, { ...sys, context: `one exchange with the repo agent (${x.repoUuid})`, summary: `${x.ok ? '✓' : '✗'} ${x.provider || '?'} · ${parts.toolCalls.length} tool call(s) · ${parts.codeBlocks.length} code block(s)` }));
  return env;
}

/** write(envelopes, { root }) → { written, files, errors } — each to <root>/idearium/data/nodes/<type>/<file id>.<type> */
function write(envelopes, { root = ROOT } = {}) {
  const files = [], errors = [];
  for (const e of envelopes || []) {
    try {
      const dir = path.join(root, 'idearium', 'data', 'nodes', e.type);
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `${NE.fileIdOf(e.id)}.${e.type}`);
      fs.writeFileSync(f, NE.toYaml(e), 'utf8');
      files.push(f);
    } catch (err) { errors.push({ id: e && e.id, why: err.message }); }
  }
  return { written: files.length, files, errors };
}

/** record(row, { text, message, toolCalls, model, root }) — what repo-agent's _log calls; never throws (HN-002) */
function _isTest() { try { return require('./test-sandbox.js').isTestProcess(); } catch (_) { return false; } }
function record(row = {}, { text = null, message = null, toolCalls = null, model = null, root = null, log = console.warn } = {}) {
  // a test process never writes into the real idearium/data/nodes, unless it points at its own (as the Versionium recorder, §17.12)
  root = root || process.env.NEXUS_HISTORY_NODES_ROOT || (_isTest() ? null : ROOT);
  if (!root) return { ok: true, written: 0, skipped: 'a test process: history nodes go to NEXUS_HISTORY_NODES_ROOT only' };
  try {
    const env = nodesFor({ exchangeId: row.uuid, repoUuid: row.repoUuid, message: message != null ? message : row.message, text: row.ok ? (text != null ? text : row.response) : null,
      ok: row.ok, error: row.error, provider: row.provider, model: model || row.model || null, hat: row.hatName, backend: row.backend, toolCalls: toolCalls || [], injects: row.injects || [],
      elapsedMs: row.elapsedMs, ts: row.ts, jobId: row.jobId || null, truncated: row.truncated || null });
    const w = write(env, { root });
    if (w.errors.length) log(`[repo-history-nodes] exchange ${row.uuid}: ${w.errors.length} node(s) not written — ${w.errors[0].why}`);
    return { ok: !w.errors.length, written: w.written, errors: w.errors };
  } catch (e) { log(`[repo-history-nodes] exchange ${row && row.uuid}: not recorded — ${e.message}`); return { ok: false, written: 0, why: e.message }; }
}

/** read({ repoUuid, root, type, lang, provider, limit }) → exchanges newest first, each with its parts' payloads (HN3) */
function read({ repoUuid, root = ROOT, lang = null, provider = null, limit = 50 } = {}) {
  const dir = (t) => path.join(root, 'idearium', 'data', 'nodes', t);
  const load = (t, nid) => { try { return NE.fromYaml(fs.readFileSync(path.join(dir(t), `${NE.fileIdOf(nid)}.${t}`), 'utf8')).payload; } catch (_) { return null; } };
  let names = []; try { names = fs.readdirSync(dir('exchange')).filter(f => f.endsWith('.exchange')); } catch (_) { return []; }
  const ex = names.map(f => { try { return NE.fromYaml(fs.readFileSync(path.join(dir('exchange'), f), 'utf8')).payload; } catch (_) { return null; } })
    .filter(p => p && (!repoUuid || p.repoUuid === repoUuid) && (!provider || p.provider === provider)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const out = [];
  for (const e of ex) {
    const codeBlocks = (e.parts.codeBlocks || []).map(c => load('code_block', c)).filter(Boolean).filter(c => !lang || c.lang === lang);
    if (lang && !codeBlocks.length) continue;
    out.push({ ...e, input: load('input', e.parts.input), response: e.parts.response ? load('response', e.parts.response) : null,
      toolCalls: (e.parts.toolCalls || []).map(c => load('tool_call', c)).filter(Boolean), codeBlocks });
    if (out.length >= limit) break;
  }
  return out;
}

/** backfill({ rows, root }) — old repo_agent_log rows → nodes; a row already written is skipped; cut ones marked truncated (HN-004) */
function backfill({ rows = [], root = ROOT } = {}) {
  let exchanges = 0, written = 0, skipped = 0, truncated = 0; const errors = [];
  for (const row of rows) {
    if (!row || !row.uuid || !row.repoUuid) continue;
    if (fs.existsSync(path.join(root, 'idearium', 'data', 'nodes', 'exchange', `${NE.fileIdOf(`ex:${row.uuid}`)}.exchange`))) { skipped++; continue; }
    const cut = { message: String(row.message || '').length >= 4000, response: String(row.response || '').length >= 8000 };
    if (cut.message || cut.response) truncated++;
    const r = record({ ...row, truncated: cut.message || cut.response ? cut : null }, { root, log: () => {} });
    exchanges++; written += r.written || 0; if (!r.ok) errors.push({ uuid: row.uuid, why: r.why || (r.errors && r.errors[0] && r.errors[0].why) });
  }
  return { ok: !errors.length, exchanges, written, skipped, truncated, errors };
}

module.exports = { MODULE_ID, codeBlocks, nodesFor, write, record, read, backfill, LANG };
