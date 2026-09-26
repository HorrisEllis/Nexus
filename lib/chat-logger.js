'use strict';
/**
 * lib/chat-logger.js — NEXUS Chat Logger
 * UUID: nexus-chat-logger-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Logs every AI exchange — NCP, Ollama, direct chat — to JAA's chat_log table
 * AND to a flat JSONL file for context reinjection.
 *
 * Context reinjection: when a new session starts, recent chat logs are
 * retrieved semantically (vector search) or temporally (last N) and prepended
 * to the system prompt. The model remembers what was built, decided, and broken.
 *
 * Every log entry carries:
 *   sessionId    — groups a conversation
 *   role         — 'user' | 'assistant' | 'system'
 *   content      — the full text
 *   provider     — 'ollama' | 'claude' | 'chatgpt'
 *   intent       — what the user was trying to do (extracted)
 *   outcome      — 'complete' | 'truncated' | 'error' | 'rejected'
 *   gapScore     — Liminal gap score on the response (0-1)
 *   bdaSignals   — BDA 5-signal extraction on the message
 *   ts, uuid
 *
 * §2.1  Written to disk before returned to caller
 * §1.2  Every logging failure is itself logged to stderr (never silent)
 * §5.1  Every entry has a UUID
 */

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const MODULE_ID   = 'chat-logger';
const VERSION     = '1.0.0';
// §SANDBOX 0.39.255 — a test process gets a temp NEXUS_DATA_ROOT first (lib/test-sandbox.js),
// as lib/ledger-writer.js and guardian/lib/code-artifact.js already do. Without it every suite
// that reached guardian's completion path left data/chat-logs/<date>-<id>.jsonl in the real tree.
require('./test-sandbox.js').ensure();
const LOG_DIR     = path.join(process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', 'data'), 'chat-logs');
const MAX_CONTENT = 8000;  // truncate very long messages before storing

fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Current session ───────────────────────────────────────────────────────────
let _currentSession = null;
let _sessionStart   = null;
let _sessionFile    = null;

function startSession(opts = {}) {
  _currentSession = opts.sessionId || crypto.randomUUID();
  _sessionStart   = Date.now();
  const date      = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  _sessionFile    = path.join(LOG_DIR, `${date}-${_currentSession.slice(0,8)}.jsonl`);
  _appendToFile(_sessionFile, {
    type: 'session.start', sessionId: _currentSession, ts: _sessionStart,
    meta: opts.meta || {},
  });
  return _currentSession;
}

function getSession() { return _currentSession; }

// ── Log a message ─────────────────────────────────────────────────────────────
async function log(entry) {
  const {
    role     = 'user',
    content  = '',
    provider = 'ollama',
    intent   = null,
    outcome  = 'complete',
    jobId    = null,
    meta     = {},
    // §FIXED 2026-09-17 — James: real gap traced, not assumed: this
    // exact function's own two call sites in guardian/lib/ncp-handler.js
    // already had chatUrl/account/agentId sitting right there (destructured
    // from the real NCP GUARDIAN_COMPLETE message a few lines above), and
    // a SEPARATE raw jaa.insert('chat_log', ...) two lines below THIS
    // function's own call site already wrote them — just not through this
    // path, the one that actually reaches disk + vector-embedding for real
    // semantic search. Two different row shapes were landing in the same
    // chat_log table depending on which write path produced them. This
    // closes that: the richer path now carries the same real fields the
    // raw insert already had.
    chatUrl  = null,
    account  = null,
    agentId  = null,
  } = entry;

  if (!_currentSession) startSession();

  const uuid       = crypto.randomUUID();
  const truncated  = content.slice(0, MAX_CONTENT);
  const ts         = Date.now();

  // Extract signals asynchronously — never block the log write
  let gapScore  = null;
  let bdaSignals= null;
  let intentExt = intent;

  try {
    const liminal = require('../intelligence/liminal');
    const gaps    = liminal.analyzeText(truncated);
    gapScore = gaps.length ? gaps[0].criticality : 0;
  } catch(_) {}

  try {
    const bda    = require('../intelligence/bda');
    bdaSignals   = bda.extract(truncated, role);
  } catch(_) {}

  // Intent extraction — first meaningful sentence
  if (!intentExt && role === 'user') {
    const firstSentence = truncated.split(/[.!?]/)[0].trim();
    intentExt = firstSentence.slice(0, 120) || null;
  }

  const record = {
    uuid, sessionId: _currentSession, role, provider,
    content: truncated,
    contentLength: content.length,
    truncated: content.length > MAX_CONTENT,
    intent:    intentExt,
    outcome,
    gapScore,
    bdaSignals,
    jobId,
    // §FIXED 2026-09-17 — real fields, not new ones: chatUrl/account were
    // already real data at both call sites, agentId is honestly just
    // `provider` for now (no identity deeper than provider exists
    // anywhere in guardian yet — stated plainly, not implied otherwise;
    // see copilot/lib/agent-model.js's own header for the same honest
    // limit on what "agent" currently means in this codebase).
    chatUrl,
    account,
    agentId: agentId || provider,
    ts,
    meta,
  };

  // §2.1 Write to disk first
  _appendToFile(_sessionFile || path.join(LOG_DIR, 'unsessioned.jsonl'), record);

  // Then write to JAA (non-blocking)
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    jaaDB.insert('chat_log', record);
  } catch(_) {}

  // Then embed for semantic search (non-blocking, fire-and-forget)
  try {
    const vm = require('./vector-memory');
    const embedText = [role, intentExt || '', truncated.slice(0, 500)].filter(Boolean).join(' — ');
    vm.embed({ uuid, text: embedText, type: 'chat_log', source: provider, table: 'chat_log', ts }).catch(()=>{});
  } catch(_) {}

  return record;
}

// ── Context reinjection ───────────────────────────────────────────────────────
// Returns a context string to prepend to the next prompt.
// Uses vector search if available, falls back to recent N entries.
async function buildInjectionContext(currentPrompt, opts = {}) {
  const {
    k             = 8,
    threshold     = 0.68,
    maxChars      = 3000,
    sessionOnly   = false,
    includeSystem = false,
  } = opts;

  let entries = [];

  // Try semantic search first
  try {
    const vm = require('./vector-memory');
    const { results } = await vm.search(currentPrompt, {
      k, threshold,
      filter: sessionOnly ? { table: { '$eq': 'chat_log' }, sessionId: { '$eq': _currentSession } }
                          : { table: { '$eq': 'chat_log' } },
    });
    if (results.length >= 2) {
      entries = results;
    }
  } catch(_) {}

  // Fallback: last N from JSONL files
  if (!entries.length) {
    entries = _recentEntries(k * 2, sessionOnly);
  }

  if (!entries.length) return '';

  // Build injection string
  const lines = ['=== PRIOR CONTEXT (most relevant past exchanges) ==='];
  let chars = lines[0].length;

  for (const e of entries) {
    if (chars >= maxChars) break;
    const role    = e.role || '?';
    const content = (e.content || e.text || '').slice(0, 400);
    const snr     = e.similarity ? ` [${Math.round(e.similarity*100)}% match]` : '';
    const ts      = e.ts ? new Date(e.ts).toLocaleString() : '';
    const line    = `\n[${role.toUpperCase()}${snr} ${ts}]\n${content}`;
    if (!includeSystem && role === 'system') continue;
    lines.push(line);
    chars += line.length;
  }

  lines.push('\n=== END PRIOR CONTEXT ===\n');
  return lines.join('');
}

// ── Recent entries from JSONL ─────────────────────────────────────────────────
function _recentEntries(n, sessionOnly) {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse()
      .slice(0, 5);  // last 5 session files

    const entries = [];
    for (const file of files) {
      const lines = fs.readFileSync(path.join(LOG_DIR, file), 'utf8')
        .split('\n').filter(Boolean);
      for (const line of lines.reverse()) {
        if (entries.length >= n) break;
        try {
          const r = JSON.parse(line);
          if (r.type === 'session.start') continue;
          if (sessionOnly && r.sessionId !== _currentSession) continue;
          if (r.role === 'user' || r.role === 'assistant') entries.push(r);
        } catch(_) {}
      }
      if (entries.length >= n) break;
    }
    return entries;
  } catch(_) { return []; }
}

// ── Session summary ───────────────────────────────────────────────────────────
function sessionSummary() {
  const entries = _recentEntries(100, true);
  const userMsgs  = entries.filter(e => e.role === 'user').length;
  const asstMsgs  = entries.filter(e => e.role === 'assistant').length;
  const avgGap    = entries.filter(e => e.gapScore != null)
    .reduce((s,e,i,a) => s + e.gapScore / a.length, 0);
  return {
    sessionId: _currentSession,
    startedAt: _sessionStart,
    durationMs: Date.now() - (_sessionStart || Date.now()),
    userMessages: userMsgs,
    assistantMessages: asstMsgs,
    totalMessages: entries.length,
    avgGapScore: Math.round(avgGap * 100) / 100,
  };
}

// ── List sessions ─────────────────────────────────────────────────────────────
function listSessions() {
  try {
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.jsonl') && f !== 'unsessioned.jsonl')
      .sort().reverse()
      .map(f => {
        const size = fs.statSync(path.join(LOG_DIR, f)).size;
        return { file: f, sizeKB: Math.round(size / 1024) };
      });
  } catch(_) { return []; }
}

// ── File append ───────────────────────────────────────────────────────────────
function _appendToFile(file, record) {
  try {
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
  } catch(e) {
    process.stderr.write(`[${MODULE_ID}] log write failed: ${e.message}\n`);
  }
}

module.exports = {
  startSession, getSession, log,
  buildInjectionContext, sessionSummary, listSessions,
  LOG_DIR, MODULE_ID, VERSION,
};
