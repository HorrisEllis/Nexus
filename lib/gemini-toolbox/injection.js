'use strict';
/**
 * lib/gemini-toolbox/injection.js — the injection tool (§P2 multi-agent)
 * UUID: nexus-gemini-injection-v1-0000-2026-0807-001
 *
 * James: "a parsing tool with a tree command for file structure, cortex recall,
 * to parse any file or data, inject into Gemini."
 *
 * Assembles ONE injection payload per agent = its P1 contract + a file tree +
 * the parsed target + relevant cortex recall — within the agent's token budget,
 * with the static parts marked cacheable (Gemini context caching). Three tools:
 *   tree(path)      — file structure as a text tree (the missing piece)
 *   parseAny(path)  — parse any file/data → plain text (extends parseForGemini)
 *   recall(query)   — cortex memory, injected as context
 *
 * §8.6 composes gemini-toolbox parseForGemini + agent-tools query-recall + the
 * read-file safe-resolve pattern. §data/** refused. §1.2 each part degrades
 * honestly; a missing recall doesn't sink the payload.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '../..');
const { parseForGemini } = require('./index');
const { getContract } = require('./agent-contracts');
const _fsTree = require('../fs-tree');  // §agnostic — tree promoted to lib/fs-tree; delegate

function _safe(rel) {
  const abs = path.resolve(ROOT, rel || '.');
  if (!abs.startsWith(ROOT)) throw new Error('path escapes repo root');
  if (/(^|\/)data(\/|$)/.test(rel || '')) throw new Error('data/** is state, not code — refused');
  return abs;
}

// ── tree(path) — file structure as a text tree ────────────────────────────────
const _IGNORE = new Set(['node_modules', '.git', 'data', '.DS_Store']);
function tree(relPath = '.', opts = {}) {
  const maxDepth = opts.maxDepth != null ? opts.maxDepth : 3;
  const abs = _safe(relPath);
  const lines = [];
  let count = 0;
  const cap = opts.maxEntries || 500;
  function walk(dir, prefix, depth) {
    if (depth > maxDepth || count >= cap) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries = entries.filter(e => !_IGNORE.has(e.name) && !e.name.startsWith('.'))
                     .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (let i = 0; i < entries.length; i++) {
      if (count >= cap) { lines.push(prefix + '… (truncated)'); return; }
      const e = entries[i], last = i === entries.length - 1;
      lines.push(prefix + (last ? '└── ' : '├── ') + e.name + (e.isDirectory() ? '/' : ''));
      count++;
      if (e.isDirectory()) walk(path.join(dir, e.name), prefix + (last ? '    ' : '│   '), depth + 1);
    }
  }
  lines.push(path.relative(ROOT, abs) || '.');
  walk(abs, '', 1);
  return { root: path.relative(ROOT, abs) || '.', entries: count, text: lines.join('\n'), truncated: count >= cap };
}

// ── parseAny(path) — parse any file/data → plain text ─────────────────────────
function parseAny(relPath, opts = {}) {
  const abs = _safe(relPath);
  const ext = path.extname(relPath).toLowerCase();
  // Code/text → the line-numbered parse (reuse parseForGemini). JSON → pretty.
  // Binary → refuse honestly rather than emit garbage.
  const stat = fs.statSync(abs);
  if (stat.size > (opts.maxBytes || 2_000_000)) return { file: relPath, error: 'file too large — chunk it first', size: stat.size };
  if (['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.bin', '.exe'].includes(ext)) {
    return { file: relPath, kind: 'binary', text: `[binary ${ext} file, ${stat.size} bytes — not parsed to text]` };
  }
  if (ext === '.json') {
    try { const j = JSON.parse(fs.readFileSync(abs, 'utf8')); return { file: relPath, kind: 'json', text: JSON.stringify(j, null, 2) }; }
    catch { /* fall through to plain */ }
  }
  return parseForGemini(relPath, opts);   // numbered plain text + chunks + checksum
}

// ── recall(query) — cortex memory, injected ───────────────────────────────────
function recall(query, opts = {}) {
  return new Promise((resolve) => {
    try {
      const body = Buffer.from(JSON.stringify({ intent: opts.intent || 'general', query, tier: opts.tier }));
      const u = new URL((process.env.CORTEX_URL || 'http://127.0.0.1:3748') + '/api/recall');
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }, timeout: opts.timeoutMs || 6000 },
        (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false, error: 'parse' }); } }); });
      req.on('error', () => resolve({ ok: false, error: 'cortex recall unreachable' }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'recall timeout' }); });
      req.write(body); req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

/**
 * buildInjectionPayload(agentId, target, opts) — the whole point: assemble ONE
 * payload for an agent = contract (static, cacheable) + tree + parsed target +
 * recall, within the agent's token budget.
 */
async function buildInjectionPayload(agentId, target = {}, opts = {}) {
  const contract = getContract(agentId);
  if (contract.error) return contract;

  const payload = { agent: agentId, contract, cacheable: ['contract'], parts: {} };

  // File tree (structure orientation).
  if (target.treePath !== null) {
    try { payload.parts.tree = tree(target.treePath || '.', { maxDepth: opts.treeDepth || 2 }); } catch (e) { payload.parts.tree = { error: e.message }; }
  }
  // Parsed target file.
  if (target.file) {
    try { payload.parts.file = parseAny(target.file, opts); } catch (e) { payload.parts.file = { error: e.message }; }
  }
  // Cortex recall (relevant memory).
  if (target.recallQuery) {
    const r = await recall(target.recallQuery, opts);
    payload.parts.recall = r && r.ok !== false ? r : { unavailable: (r && r.error) || 'no recall' };
  }

  // Token budget note — Gemini 1-2M in / 65k out; static contract is cacheable.
  payload.limits = contract.limits;
  payload.note = 'contract is static → cache it across turns; tree+recall are context; file is the working target.';
  return payload;
}

module.exports = { tree, parseAny, recall, buildInjectionPayload, MODULE_ID: 'gemini-injection', VERSION: '1.0.0' };
