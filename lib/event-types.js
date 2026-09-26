'use strict';
/**
 * lib/event-types.js — the real, canonical, system-wide event-type
 * registry. James: "i think it's event driven, i want more event types
 * for the userscripts, that we can map to guardian and clear-glass...
 * each system needs event types in relation to the system and
 * components, commands, and api calls."
 *
 * Checked first (§8.6): no general, canonical registry existed anywhere
 * — a few archived/unintegrated files had their own local EVENT_TYPES,
 * none live or system-wide. This is that missing, single source of
 * truth. Every real emitter below is wired to an actual, real call site
 * in this same commit, not aspirational.
 *
 * Shape every real chat/agent event carries, so a consumer can
 * correlate multiple events about the same turn:
 *   { type, blockId, blockType, source, sessionId, chatUrl, account, ts, ...payload }
 *
 * blockId   — a real, stable identifier for ONE message/turn. Lets a
 *             later event (e.g. chat_artifact) be correlated back to
 *             the chat_response it came from.
 * blockType — what KIND of thing this block is: 'user' | 'assistant' |
 *             'download' | 'artifact' | 'wake'.
 * agent     — which real agent this event is about: 'claude' | 'chatgpt' |
 *             'gemini' | 'perplexity' | 'ollama' (see AGENT below). A real
 *             field, never baked into the type string — "every ChatGPT
 *             research event" is a filter (type IN research_input,
 *             research_output AND agent = 'chatgpt'), not its own type.
 * chunkId   — for chunk_input/chunk_output specifically: the real chunk's
 *             own id, a field value. Never part of the type name — a type
 *             per chunk id would be unbounded and unenumerable.
 */

const CHAT = {
  CHAT_INPUT:    'chat_input',      // a real, complete human message observed
  CHAT_RESPONSE: 'chat_response',   // a real, complete assistant message observed
  CHAT_WAKE:     'chat_wake',       // "hey nexus, ..." detected, from either role
  CHAT_DOWNLOAD: 'chat_download',   // a real file download captured (clear-glass/src/providers/download-capture.js)
  CHAT_ARTIFACT: 'chat_artifact',   // a real, rendered artifact/code-block observed
};

// §2026-08-22 — James's real, valuable instinct (per-agent, per-intent
// event tracking) kept, but restructured to avoid a genuine scaling
// problem in the first draft: agent x intent x direction as literal type
// strings (chatgpt_research_input, claude_build_output, ...) is
// combinatorial — a new agent or intent means hand-writing a fresh batch
// every time, and duplicates already showed up in the first pass
// (chatgpt_chat_input, claude_chat_input/output, claude_build_input/
// output each listed twice) as the first real symptom of that. Worse:
// "chatgpt_chunk_chunkid_input" bakes an unbounded, per-chunk VALUE into
// a fixed type name, which can't work — a chunk id is a real value, not
// something you can enumerate one type per instance of.
//
// Same real filtering power (every ChatGPT research event; every event
// for one chunk), zero per-agent/per-chunk type growth: INTENT stays a
// small, closed taxonomy; agent and chunkId are real fields on the event
// itself (see the shape note at the top of this file), not part of the
// type string.
const INTENT = {
  CHAT_INPUT:     'chat_input',
  CHAT_OUTPUT:    'chat_output',
  RESEARCH_INPUT:  'research_input',
  RESEARCH_OUTPUT: 'research_output',
  LIFELINE_INPUT:  'lifeline_input',    // real, existing mechanism — lib/lifeline.js (ollama-first, guardian fallback)
  LIFELINE_OUTPUT: 'lifeline_output',
  BUILD_INPUT:     'build_input',
  BUILD_OUTPUT:    'build_output',
  SPEC_INPUT:      'spec_input',
  SPEC_OUTPUT:     'spec_output',
  CHUNK_INPUT:     'chunk_input',       // real chunk id goes in the event's chunkId field, never the type name
  CHUNK_OUTPUT:    'chunk_output',
  TOOL_INPUT:      'tool_input',
  TOOL_OUTPUT:     'tool_output',
};

/** Real, known agent identifiers — a field value, never part of a type string. */
const AGENT = { CLAUDE: 'claude', CHATGPT: 'chatgpt', GEMINI: 'gemini', PERPLEXITY: 'perplexity', OLLAMA: 'ollama' };


const COPILOT = {
  CO_PILOT_INPUT:    'co_pilot_input',     // a real prompt sent to copilot/server.js
  CO_PILOT_RESPONSE: 'co_pilot_response',  // a real answer copilot returned
};

const NEXUS = {
  WAKE_DETECTED: 'nexus.wake.detected',   // real, already wired (cortex/boot.js) — kept here for one canonical list, not renamed
};

const ALL = { ...CHAT, ...INTENT, ...COPILOT, ...NEXUS };

/** isValid(type) — real, honest guard: an unregistered type is a real bug, not a typo to silently accept. */
function isValid(type) {
  return Object.values(ALL).includes(type);
}

module.exports = { CHAT, INTENT, AGENT, COPILOT, NEXUS, ALL, isValid, MODULE_ID: 'lib.event-types', VERSION: '1.0.0' };
