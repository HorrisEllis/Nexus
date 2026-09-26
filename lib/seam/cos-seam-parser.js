'use strict';
/**
 * lib/seam/cos-seam-parser.js — extracts real, complete "cos seam" blocks
 * from an agent's response text.
 * UUID: nexus-cos-seam-parser-v1-0000-2026-0906-001
 *
 * §BUILT 2026-09-06 — James: real format, validated against an actual
 * ChatGPT response (screenshot), not invented:
 *
 *   chunk contract #1
 *
 *   =========cos seam start=========
 *   ```js
 *   // code here
 *   ```
 *   =========cos seam end=========
 *   compartment uuid: <uuid>
 *   file name: test.js
 *
 * James's own words on why: "the file is made preemptively, then when the
 * listener detects the cos seam boundary, streams the sse into the file
 * to save instantly." "chunk contract number" doubles as a real integrity
 * check — if guardian dispatched chunk #1 and the seam echoes back "#3",
 * that's an immediate, catchable signal something went wrong (wrong job
 * routed, agent confusion, stale context), not just a label.
 *
 * Deliberately checked before building: lib/seam/queue.js's own
 * QueueCompartment (the real, live object every SEAM-dispatched chunk
 * already is) tracks no target filename or directory at all — unlike
 * idearium/spec-engine's own chunk objects, which already know their real
 * fileName/filePath. That's the real reason the agent needs to declare
 * compartment uuid / file name itself here: for this specific pipeline,
 * guardian genuinely doesn't have anywhere else to get it.
 *
 * Pure function, no I/O, no side effects — the same discipline this whole
 * codebase already holds fault-taxonomy.js/lib/queue.js's own real
 * mechanics to, and the same reason this is trivially, fully testable.
 */

// The code fence lives INSIDE the seam markers (confirmed live: "I'll
// keep the seams outside the code fences, so they can be parsed
// cleanly" — the agent's own words, not assumed). The seam marks "this
// is the deliverable"; the fence marks exactly where the real bytes
// start and stop, so an explanatory aside with its own illustrative code
// block elsewhere in the response is never mistaken for one.
const SEAM_START_RE = /={3,}\s*cos seam start\s*={3,}/i;
const SEAM_END_RE   = /={3,}\s*cos seam end\s*={3,}/i;
const FENCE_RE       = /```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/;
const CONTRACT_RE    = /chunk contract\s*#?\s*(\d+)/i;
const COMPARTMENT_RE = /compartment\s+uuid\s*:\s*([a-zA-Z0-9-]+)/i;
const FILENAME_RE    = /file\s*name\s*:\s*([^\r\n]+)/i;

/**
 * parseCosSeams(text) -> [{ contractNumber, language, code, compartmentUuid,
 * fileName, raw }], one entry per complete seam block found. An
 * unterminated seam (start marker present, no matching end marker yet —
 * the real, expected state while a response is still streaming in) is
 * never included; only genuinely complete blocks are returned, so a
 * caller polling this against a growing `full` string on every
 * GUARDIAN_CHUNK never double-processes or half-processes one.
 */
function parseCosSeams(text) {
  if (!text || typeof text !== 'string') return [];
  const results = [];
  let cursor = 0;

  while (cursor < text.length) {
    const startMatch = SEAM_START_RE.exec(text.slice(cursor));
    if (!startMatch) break;
    const startIdx = cursor + startMatch.index + startMatch[0].length;

    const endMatch = SEAM_END_RE.exec(text.slice(startIdx));
    if (!endMatch) break; // seam opened, not yet closed — real, expected mid-stream state, not an error

    const endIdx = startIdx + endMatch.index;
    const body = text.slice(startIdx, endIdx);

    // The "chunk contract #N" line is real, but appears BEFORE the seam
    // start marker in James's own example, not inside the body — look at
    // the text immediately preceding this seam's start marker, not the
    // whole document (so an earlier chunk's contract number can never
    // leak into a later seam's own). §BUG CAUGHT BEFORE SHIPPING — a
    // fixed 200-char window can still contain MORE than one real "chunk
    // contract #N" mention (a short seam body plus a short gap easily
    // fits two), and CONTRACT_RE has no /g flag, so a plain .exec() took
    // the FIRST match in the window — the wrong, older one — instead of
    // the one actually closest to this seam. Fixed by taking the LAST
    // match in the window, found and confirmed with a real 2-seam test
    // before this fix, not assumed correct.
    const precedingText = text.slice(Math.max(0, cursor + startMatch.index - 200), cursor + startMatch.index);
    const contractMatches = [...precedingText.matchAll(new RegExp(CONTRACT_RE.source, 'gi'))];
    const contractMatch = contractMatches.length ? contractMatches[contractMatches.length - 1] : null;

    // compartment uuid / file name are real, but the exact example
    // showed them AFTER the seam end marker — look in a bounded window
    // after this seam's own end, not the whole rest of the document
    // (so a LATER seam's own metadata can't be misattributed backward).
    const afterEnd = text.slice(endIdx + endMatch[0].length, endIdx + endMatch[0].length + 300);
    const compartmentMatch = COMPARTMENT_RE.exec(afterEnd);
    const fileNameMatch    = FILENAME_RE.exec(afterEnd);

    const fenceMatch = FENCE_RE.exec(body);

    results.push({
      contractNumber:  contractMatch ? parseInt(contractMatch[1], 10) : null,
      language:        fenceMatch ? (fenceMatch[1] || null) : null,
      // §HONEST FALLBACK — if the agent didn't fence the code (asked to,
      // per the real validated format, but not structurally guaranteed),
      // fall back to the raw seam body rather than silently produce no
      // code at all. A caller can tell which happened: fenceMatch-derived
      // code never contains the seam markers themselves; the fallback might.
      code:            fenceMatch ? fenceMatch[2].replace(/\r?\n$/, '') : body.trim(),
      compartmentUuid: compartmentMatch ? compartmentMatch[1] : null,
      fileName:        fileNameMatch ? fileNameMatch[1].trim() : null,
      raw:             text.slice(cursor + startMatch.index, endIdx + endMatch[0].length),
    });

    cursor = endIdx + endMatch[0].length;
  }

  return results;
}

module.exports = { parseCosSeams };
