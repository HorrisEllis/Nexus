'use strict';
// lib/claude-code-backend.js — Claude Code as an Idearium agent backend (IN2a).
// component_id: lib.claude-code-backend
// Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (IN2_claude_code_inside_nexus — slice IN2a)
//
// James, 2026-10-02: "i feel like claude needs a code mode for using claude code. i cant have an agent use this
// window" · "okay but im using idearium". So Claude Code is a backend Idearium's repo agent dispatches to, like ollama
// and guardian: headless (`claude -p --output-format json`), on the machine Idearium runs on, under the account that
// machine's `claude` is signed into. Phase runs, the repo chat and the PH1 proof's retries reach it through the same
// lib/repo-agent.js dispatch().
//
// Claude Code edits files itself. Idearium's repo folder is a projection of its store (re-materialised on writes), so
// Claude Code never touches it: it works in a COPY of the repo (a temp dir). When it finishes, the copy is diffed
// against the repo, and every changed file is written back through the repo layer — the same write path every other
// agent's code takes — or, with no layer, only reported. The diff is the agent's result; nothing it did outside the
// copy exists for Idearium. The diff is against a snapshot of the copy taken when it is made — never the live folder,
// which Idearium re-materialises (proof.json, verification files) while the agent works. Its tools are read and edit only by default (no Bash): running the code is the proof's job.
//
// run() never throws: { ok, text, changes, cost, sessionId, turns, durationMs } or { ok:false, error }. The process
// runner is injectable (opts.spawnImpl) so tests drive a stand-in `claude`, never the real one.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const MODULE_ID = 'lib.claude-code-backend';
const VERSION = '1.0.0';
const DEFAULT_TOOLS = Object.freeze(['Read', 'Edit', 'MultiEdit', 'Write', 'Glob', 'Grep']);
const SKIP = new Set(['.git', 'node_modules', '.nexus', '.claude']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/** the `claude` binary: CLAUDE_CODE_BIN, else `claude` on PATH */
function binary() { return process.env.CLAUDE_CODE_BIN || 'claude'; }

/**
 * mcpConfig() — §IN1: Nexus's own MCP server (orchestrator/lib/mcp-stdio.js) for a headless run, by absolute path: the
 * run's cwd is a copy of another repo, where the root .mcp.json does not exist. null when NEXUS_CLAUDE_CODE_MCP=0 or the
 * server file is missing. Its tools (mcp__nexus__*) are allowed beside the file tools: loom impact, the contract check,
 * the proof check, introspect — a builder can look before it writes and check before it stops.
 */
function mcpConfig() {
  if (process.env.NEXUS_CLAUDE_CODE_MCP === '0') return null;
  const server = path.resolve(__dirname, '..', 'orchestrator', 'lib', 'mcp-stdio.js');
  if (!fs.existsSync(server)) return null;
  return JSON.stringify({ mcpServers: { nexus: { command: process.execPath, args: [server] } } });
}

/** the argv for one headless run (pure — tests read it) */
function argsFor({ tools = DEFAULT_TOOLS, model = null, systemPrompt = null, mcp = mcpConfig() } = {}) {
  const a = ['-p', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--no-session-persistence', '--allowedTools', ...tools, ...(mcp ? ['mcp__nexus'] : [])];
  if (mcp) a.push('--mcp-config', mcp);
  if (model) a.push('--model', String(model));
  if (systemPrompt) a.push('--append-system-prompt', String(systemPrompt));
  return a;
}

function _walk(root, rel = '', out = new Map()) {
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) _walk(root, r, out);
    else if (e.isFile()) { try { const st = fs.statSync(path.join(root, r)); if (st.size <= MAX_FILE_BYTES) out.set(r, st.size); } catch (_) {} }
  }
  return out;
}

/** copyRepo(repoDir) → the temp copy's path (no .git, node_modules, .nexus, .claude) */
function copyRepo(repoDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-claude-code-'));
  fs.cpSync(repoDir, dir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) || src === repoDir });
  return dir;
}

/** snapshot(dir) → Map(path → sha1) of the files as they are now (the copy, the moment it is made) */
function snapshot(dir) {
  const out = new Map();
  for (const [rel] of _walk(dir)) { try { out.set(rel, crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, rel))).digest('hex')); } catch (_) {} }
  return out;
}

/**
 * diffTrees(before, afterDir) → [{ path, op: 'write'|'delete'|'binary', content? }] — what changed in the copy since its
 * snapshot. `before` is that snapshot (a Map from snapshot()) or a directory. Never the live repo folder: Idearium keeps
 * re-materialising it (proof.json, verification files) while the agent works, and those are not the agent's edits.
 */
function diffTrees(before, afterDir) {
  const a = before instanceof Map ? before : snapshot(before), b = _walk(afterDir), out = [];
  for (const [rel] of b) {
    const nb = fs.readFileSync(path.join(afterDir, rel));
    const had = a.has(rel);
    if (had && a.get(rel) === crypto.createHash('sha1').update(nb).digest('hex')) continue;
    if (nb.includes(0)) { out.push({ path: rel, op: 'binary', note: 'a binary file changed — not written back' }); continue; }
    out.push({ path: rel, op: 'write', created: !had, content: nb.toString('utf8') });
  }
  for (const [rel] of a) if (!b.has(rel)) out.push({ path: rel, op: 'delete' });
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

/** parseResult(stdout) → the headless JSON result's fields, or { error } */
function parseResult(stdout) {
  const s = String(stdout || '').trim();
  if (!s) return { error: 'claude printed nothing' };
  let j = null;
  try { j = JSON.parse(s); } catch (_) {
    const last = s.split('\n').reverse().find(l => l.trim().startsWith('{'));   // stream-json: the last line is the result
    try { j = last ? JSON.parse(last) : null; } catch (_) { j = null; }
  }
  if (!j || typeof j !== 'object') return { error: `claude's output is not JSON: ${s.slice(0, 200)}` };
  return {
    isError: !!j.is_error || (j.subtype && j.subtype !== 'success'),
    text: typeof j.result === 'string' ? j.result : '',
    cost: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : null,
    sessionId: j.session_id || null, turns: j.num_turns || null, subtype: j.subtype || null,
    // the tokens Claude Code itself reports (input = fresh + cache read + cache write; output as is) — not estimated
    tokensIn: j.usage ? ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].reduce((n, k) => n + (Number(j.usage[k]) || 0), 0) : null,
    tokensOut: j.usage ? Number(j.usage.output_tokens) || 0 : null,
  };
}

function _exec({ bin, args, cwd, input, timeoutMs, spawnImpl }) {
  return new Promise((resolve) => {
    let child;
    try { child = (spawnImpl || spawn)(bin, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { resolve({ code: null, stdout: '', stderr: '', error: e.message }); return; }
    let stdout = '', stderr = '', done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const t = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) {} finish({ code: null, stdout, stderr, error: `claude did not finish in ${Math.round(timeoutMs / 1000)}s` }); }, timeoutMs);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', e => finish({ code: null, stdout, stderr, error: e.code === 'ENOENT' ? `\`${bin}\` is not installed on this machine (set CLAUDE_CODE_BIN, or install Claude Code and sign in)` : e.message }));
    child.on('close', code => finish({ code, stdout, stderr }));
    try { child.stdin.end(String(input)); } catch (_) {}
  });
}

/**
 * run({ repoDir, prompt, tools?, model?, systemPrompt?, timeoutMs?, keepCopy?, spawnImpl? })
 * → { ok, text, changes, cost, sessionId, turns, durationMs, copyDir? } | { ok:false, error, stderr? }
 */
async function run({ repoDir, prompt, tools = DEFAULT_TOOLS, model = null, systemPrompt = null, timeoutMs = DEFAULT_TIMEOUT_MS, keepCopy = false, spawnImpl = null } = {}) {
  if (!repoDir || !fs.existsSync(repoDir)) return { ok: false, error: 'the repo folder is not on disk' };
  if (!prompt || !String(prompt).trim()) return { ok: false, error: 'nothing to ask' };
  const started = Date.now();
  let copy;
  let before;
  try { copy = copyRepo(repoDir); before = snapshot(copy); } catch (e) { return { ok: false, error: `could not copy the repo to work in: ${e.message}` }; }
  try {
    const x = await _exec({ bin: binary(), args: argsFor({ tools, model, systemPrompt }), cwd: copy, input: prompt, timeoutMs, spawnImpl });
    if (x.error) return { ok: false, error: x.error, stderr: String(x.stderr || '').slice(-1000), timedOut: /did not finish/.test(x.error) };
    const r = parseResult(x.stdout);
    if (r.error) return { ok: false, error: r.error, stderr: String(x.stderr || '').slice(-1000) };
    if (x.code !== 0 || r.isError) return { ok: false, error: `claude ended with ${r.subtype || `exit ${x.code}`}${r.text ? ` — ${r.text.slice(0, 300)}` : ''}`, cost: r.cost, sessionId: r.sessionId, tokensIn: r.tokensIn, tokensOut: r.tokensOut, timedOut: false };
    const changes = diffTrees(before, copy);
    return { ok: true, text: r.text, changes, cost: r.cost, sessionId: r.sessionId, turns: r.turns, tokensIn: r.tokensIn, tokensOut: r.tokensOut, durationMs: Date.now() - started, ...(keepCopy ? { copyDir: copy } : {}) };
  } finally {
    if (!keepCopy) { try { fs.rmSync(copy, { recursive: true, force: true }); } catch (_) {} }
  }
}

/**
 * applyChanges({ layer, repoUuid, changes }) → { written: [{path}], refused: [{path, reason}] } — through the repo layer,
 * the one write path; a binary change is refused with its reason. With no layer nothing is written.
 */
// §0.39.367 CC1 — kept for callers outside the repo agent; the repo agent lands Claude Code's diff through
// lib/repo-inject.js fromChanges() (review mode, the Nexus approval gate, the collapse guard), not through this.
function applyChanges({ layer, repoUuid, changes }) {
  const written = [], refused = [];
  for (const c of changes || []) {
    if (!layer) { refused.push({ path: c.path, reason: 'no repo layer — not written' }); continue; }
    if (c.op === 'binary') { refused.push({ path: c.path, reason: c.note }); continue; }
    const r = c.op === 'delete' ? layer.deleteFile(repoUuid, c.path) : layer.writeFile(repoUuid, c.path, c.content, { preserveWhitespace: true });
    if (r && r.ok) written.push({ path: c.path, op: c.op, created: !!r.created });
    else refused.push({ path: c.path, reason: (r && r.error) || 'the repo layer refused it' });
  }
  return { written, refused };
}

module.exports = { MODULE_ID, VERSION, DEFAULT_TOOLS, binary, mcpConfig, argsFor, copyRepo, snapshot, diffTrees, parseResult, run, applyChanges };
