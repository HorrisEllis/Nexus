'use strict';
// lib/agent-tool-call.js — real, pure parser for the tool-call syntax a
// browser-typed agent reply uses to request a real tool execution.
//
// James, live: "the chats aren't two way. like the tools don't work." Traced
// exactly: guardian's real userscript response-capture (startWatch's own
// MutationObserver, confirmed working — full text + live streaming chunks)
// already works. guardian's real tool-execution route (POST /api/tools/:name,
// confirmed working — calls lib/agent-tools/index.js's own executeTool())
// already works too. The real, precisely-bounded gap: nothing connects
// them — a browser-typed reply has no channel to request a tool call at
// all, and nothing watches for one. This module is that connection's pure
// half: syntax + parsing, no side effects, no network calls, no DOM.
//
// Syntax, chosen deliberately for a plain-text chat reply (not a structured
// API): [[TOOL: tool_name {"param": "value"}]] — double-bracket delimited so
// it's vanishingly unlikely to appear in ordinary prose, single-line so a
// streaming reply's MutationObserver sees it complete once the line
// stabilizes (matching startWatch's own real stability-detection, not a
// separate multi-line parse this codebase's live DOM-watching couldn't
// reliably support), and the tool name + JSON args are both human-readable
// so a person watching the tab can see exactly what's about to run.

const MODULE_ID = 'lib/agent-tool-call';
const VERSION = '1.0.0';

const TOOL_CALL_RE = /\[\[TOOL:\s*([\w-]+)\s*(\{[\s\S]*?\})?\s*\]\]/;
const TOOL_CALL_RE_GLOBAL = new RegExp(TOOL_CALL_RE.source, 'g');

/**
 * parseToolCall(text) — finds the FIRST real tool-call in a reply's text.
 * Returns { found: false } if none, or { found: true, name, args, raw,
 * index } — raw is the exact matched substring (for stripping/replacing),
 * index is its position in the original text.
 *
 * Deliberately first-match-only, not all-matches: a browser-typed reply is
 * processed one tool call at a time, in the real order they were typed —
 * calling this again after handling the first is the real caller's job
 * (this module has no state and doesn't decide that policy).
 */
function parseToolCall(text) {
  if (typeof text !== 'string' || !text) return { found: false };
  const m = TOOL_CALL_RE.exec(text);
  if (!m) return { found: false };

  const name = m[1];
  let args = {};
  if (m[2]) {
    try { args = JSON.parse(m[2]); }
    catch (e) {
      return { found: true, name, args: null, raw: m[0], index: m.index, argsError: `tool call args are not valid JSON: ${e.message}` };
    }
  }
  return { found: true, name, args, raw: m[0], index: m.index };
}

/**
 * parseAllToolCalls(text) — every real tool-call in a reply, in order.
 * Exposed for callers that genuinely need to see the full set up front
 * (e.g. a UI preview) — the live dispatch loop itself uses parseToolCall's
 * one-at-a-time contract, not this.
 */
function parseAllToolCalls(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  let m;
  TOOL_CALL_RE_GLOBAL.lastIndex = 0;
  while ((m = TOOL_CALL_RE_GLOBAL.exec(text)) !== null) {
    const name = m[1];
    let args = {}, argsError = null;
    if (m[2]) {
      try { args = JSON.parse(m[2]); }
      catch (e) { args = null; argsError = `tool call args are not valid JSON: ${e.message}`; }
    }
    out.push({ name, args, raw: m[0], index: m.index, ...(argsError ? { argsError } : {}) });
  }
  return out;
}

/**
 * stripToolCall(text, raw) — removes one real matched tool-call substring
 * from a reply, for building the "here's the reply with the call removed"
 * form some callers may want when re-injecting a tool result. Exact
 * substring removal, not regex re-matching, so it only ever removes the
 * SPECIFIC call a caller already parsed, never a different occurrence.
 */
function stripToolCall(text, raw) {
  if (typeof text !== 'string' || typeof raw !== 'string') return text;
  const idx = text.indexOf(raw);
  if (idx === -1) return text;
  return (text.slice(0, idx) + text.slice(idx + raw.length)).trim();
}

/**
 * formatToolResult(name, result) — the real, plain-text follow-up message
 * to inject back into the chat after a tool call executes. Deliberately
 * plain and readable (not JSON-dumped) since this text is typed into a
 * real chat UI a human may also be watching live.
 */
function formatToolResult(name, result) {
  if (result && result.error) {
    return `[Tool "${name}" failed: ${result.error}]`;
  }
  const body = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  return `[Tool "${name}" result]\n${body}`;
}

module.exports = { parseToolCall, parseAllToolCalls, stripToolCall, formatToolResult, MODULE_ID, VERSION };
