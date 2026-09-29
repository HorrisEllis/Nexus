'use strict';
/**
 * lib/draft-review.js — Ollama drafts, a guardian agent reviews (0.39.282, N23 of docs/2026-09-29-nex-node-store-phasemap.spec)
 *
 * James, 2026-09-29: "What if we have ollama build all of the files first, the best it can. Each chunk, uses a new
 * chat, just to have full context … After that, then hands it off … just tells the agent what's needed and can talk to
 * the agent directly."
 *
 * Stage 1 — the draft: a build chunk goes to Ollama in a FRESH chat (repo-agent dispatch { session }). Its files land
 * where the economy policy puts local work: the repo's staging branch (0.39.281 EC5) or, in review mode, as proposals.
 * Stage 2 — the review: when the chunk was drafted locally, the drafted files (their full content, from the inject
 * nodes) go to a guardian agent as one plain conversation: here is what is needed, here is the draft, check it against
 * that, fix and complete it, reply with each file in full. The agent's files apply by the repo's own mode; the draft
 * stays on the staging branch as provenance, and the run rows link draft → review (draftRunId).
 *
 * The hand-off is honest text sent through the channel the person uses and can join. Nothing here rewrites it to pass
 * as a person typing (the "semantic randomizer" for provider-detection evasion stays excluded).
 */
const MODULE_ID = 'nexus.lib.draft-review';
const VERSION = '1.0.0';
const MAX_FILE_CHARS = 24000;   // one drafted file in the review message; longer ones are cut and say so

/** wasDraftedLocally(r) — the reply came from the local model (ollama), by what the dispatch reports */
function wasDraftedLocally(r) {
  if (!r || !r.ok) return false;
  const who = [r.providerUsed, r.provider, r.backend].filter(Boolean).map(String);
  return who.some(w => /^ollama\b/i.test(w)) || !!(r.injects && r.injects.staged);
}

/** draftFiles(r, RI) -> [{ path, content, status, inject }] — what the draft brought back, with its full content */
function draftFiles(r, RI) {
  const out = [];
  for (const i of ((r && r.injects && r.injects.injects) || [])) {
    let node = null; try { node = i.uuid ? RI.get(i.uuid) : null; } catch (_) {}
    const content = node && typeof node.content === 'string' ? node.content : null;
    if (content == null) continue;   // nothing to review for it (a delete, or the node is gone)
    out.push({ path: i.path || (node && node.path), content, status: i.status || (node && node.status) || null, inject: i.uuid || null });
  }
  return out;
}

/** reviewerFor(configured, RA) -> a guardian agent name, never ollama/auto (the review must not go back to the drafter) */
function reviewerFor(configured, RA) {
  const gp = (RA && typeof RA.guardianProviders === 'function') ? RA.guardianProviders() : [];
  if (configured && gp.includes(configured)) return configured;
  return gp[0] || null;
}

/** reviewMessage({ repoName, title, need, files, absent, note }) -> the plain text the reviewing agent is sent */
function reviewMessage({ repoName, title, need = '', files = [], absent = [], note = '' } = {}) {
  const lines = [
    `Review and finish a draft for ${repoName}${title ? ` — ${title}` : ''}.`,
    '',
    'A local model (Ollama) drafted this, one chunk per fresh chat. Check it against what is needed, fix what is wrong,',
    'complete what is missing, and reply with EVERY file you keep or change IN FULL, one addressed code block per file',
    '(```<lang> <path>), so it is captured and applied. Say briefly what you changed and why.',
    '',
    'WHAT IS NEEDED:',
    need ? String(need).slice(0, 6000) : '(see the phase above)',
  ];
  if (absent.length) lines.push('', `THE DRAFT NEVER PRODUCED (write these too): ${absent.join(', ')}`);
  if (note) lines.push('', `FROM JAMES: ${String(note).slice(0, 2000)}`);
  lines.push('', `THE DRAFT (${files.length} file${files.length === 1 ? '' : 's'}):`);
  for (const f of files) {
    const body = f.content.length > MAX_FILE_CHARS ? `${f.content.slice(0, MAX_FILE_CHARS)}\n… (cut at ${MAX_FILE_CHARS} chars of ${f.content.length} — read the rest with code_read)` : f.content;
    lines.push('', '```' + ((f.path || '').split('.').pop() || '') + ' ' + f.path, body.replace(/\n$/, ''), '```');
  }
  return lines.join('\n');
}

module.exports = { MODULE_ID, VERSION, MAX_FILE_CHARS, wasDraftedLocally, draftFiles, reviewerFor, reviewMessage };
