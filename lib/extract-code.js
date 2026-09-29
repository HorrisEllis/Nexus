'use strict';
// lib/extract-code.js — real code extraction from an agent's raw chat reply
// UUID: nexus-lib-extract-code-v1-0000-2026-0919-jamesbrooks-001
//
// §BUILT 2026-09-19 — James: "we need to extract code from the agents.
// that's the gap. we haven't done that once." Checked directly, not
// assumed: guardian/lib/ncp-handler.js:200 (job.responseText = finalText)
// through idearium/spec-engine/chunk-dispatch.js:76-227 to warp-build-
// dispatch.js's generate() — an agent's ENTIRE chat reply (prose +
// fenced code + more prose) flows through as one string, used as-is.
// Nowhere isolates the code from the prose around it. This is that.
//
// §SHARED, NOT SCOPED TO ONE CALLER — chunk-dispatch.js and warp-build-
// dispatch.js both serve idearium's 10 real section types (blocks.yaml:
// meta/purpose/axioms/schema/api/events/integration/failure_modes/
// build_order/tests), most of which are legitimately PROSE, not code.
// Forcing extraction onto every dispatch would break every one of those
// working paths for no reason. This is a standalone, explicitly-invoked
// function — callers that know they're asking for real code call it;
// callers asking for prose don't, and are completely unaffected. See
// this session's other change (warp-build-dispatch.js's opts.expectCode)
// for the one real, opt-in wiring point.
//
// §REUSES A REAL, EXISTING HEURISTIC — unclosed-fence detection is
// exactly userscript-claude.js:598's own check
// ((text.match(/```/g)||[]).length % 2 !== 0), not reinvented here.
//
// §FAIL LOUD, SAME CONVENTION AS THIS SESSION'S OTHER BUILDS — zero
// fences, an unclosed fence, or (by default) more than one ambiguous
// fence are all real failures, not "pick one and hope." A caller that
// genuinely expects multiple files back passes allowMultiple explicitly.

// §DERIVED 2026-09-20 — this was a hand-maintained 30-entry map. It is
// now built from lib/languages.js, the one language table, because a
// measured drift had already opened up: guardian/lib/code-artifact.js
// knew 14 extensions this map did not (.mjs .cjs .h .cc .php .swift .kt
// .bash .ps1 .scss .yml .toml .xml .spec), so the same agent reply
// resolved to a real extension on one path and `ext: null` on this one.
// The SHAPE is unchanged — every fence alias and every canonical name
// maps to its primary extension, exactly as before — so both existing
// consumers (this file's own extractCode, and idearium/api/index.js's
// CODE_EXTENSIONS filter) are unaffected, which EC-030/EC-031 assert.
const _languages = require('./languages.js');
const LANG_TO_EXT = Object.freeze(
  Object.fromEntries(
    Object.keys(_languages.ALIAS_TO_LANGUAGE)
      .map(alias => [alias, _languages.extFor(alias)])
      .filter(([, ext]) => ext)
  )
);

// A real fenced block: ```lang\n...content...\n``` — lang optional,
// content may be empty (an agent DID fence something, even if blank;
// that's a different, still-real failure mode: "fenced nothing").
//
// §MERGED 2026-09-20 — two independent fenced-block extractors existed
// in this tree after two parallel lines landed: this one, and
// guardian/lib/code-artifact.js's own extractCodeBlocks(), built the
// same day for the guardian job-completion path. Two implementations of
// "find the fenced code in an agent's reply" is exactly the competing-
// truth-layers failure §10.3 names — the first time one is fixed, they
// give different answers to the same question. Consolidated here, in
// the shared lib that idearium's dispatch path already imports, with
// the UNION of what each had genuinely proven:
//
//   from this file, kept   — the unclosed-fence guard (an odd ``` count,
//                            userscript-claude.js:598's own real
//                            heuristic), LANG_TO_EXT, and the fail-loud
//                            reason codes. code-artifact.js had none of
//                            these and could silently pair an unclosed
//                            fence with the next unrelated one.
//   from code-artifact.js  — indentation tolerance (a fence nested in a
//                            markdown list is still a real fence, and
//                            agents emit those constantly) and info-
//                            string attributes (```js title="x.js"),
//                            where only the FIRST word is the language.
//                            This file's original regex matched neither.
//
// The exported API is unchanged, so both existing call sites
// (warp-build-dispatch.js, idearium/api/index.js's LANG_TO_EXT) are
// unaffected. `index` is added to each block so a caller that picks
// among several can say WHICH it picked.
const FENCE_RE = /^[ \t]*```([^\n`]*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;

/**
 * extractCode(rawText, opts) — the real extraction.
 *   opts.allowMultiple  — return every block found, instead of requiring
 *                         (and failing on) more than one. Default false.
 *   opts.allowEmpty     — accept a fenced-but-empty block as success.
 *                         Default false — a code fence with nothing
 *                         inside it is a real failure (the agent fenced
 *                         its own admission it didn't write anything),
 *                         not an empty-but-fine chunk.
 *
 * Returns:
 *   { ok: true, blocks: [{ lang, ext, code }], code, lang, ext }
 *     (code/lang/ext are the single block's fields when exactly one was
 *     found — always present when ok, so a single-block caller never has
 *     to branch on allowMultiple to get its own result)
 *   { ok: false, reason, error }
 *     reason one of: 'no_text' | 'unclosed_fence' | 'zero_blocks' |
 *     'ambiguous_multiple_blocks' | 'empty_block'
 */
function extractCode(rawText, opts = {}) {
  const { allowMultiple = false, allowEmpty = false } = opts;

  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: false, reason: 'no_text', error: 'extractCode: no text to extract from' };
  }

  // §REUSED HEURISTIC — see header. An odd fence-marker count means a
  // block was opened and never closed; regex-matching would either miss
  // it entirely or (worse) silently pair it with the NEXT unrelated
  // fence in the message. Fail loud before that can happen.
  const fenceMarkerCount = (rawText.match(/```/g) || []).length;
  if (fenceMarkerCount % 2 !== 0) {
    return { ok: false, reason: 'unclosed_fence', error: 'extractCode: odd number of ``` markers — a code fence was opened and never closed' };
  }

  const blocks = [];
  let m;
  FENCE_RE.lastIndex = 0;
  let idx = 0;
  while ((m = FENCE_RE.exec(rawText)) !== null) {
    // Only the first word of the info string is the language —
    // ```js title="x.js" is a real shape agents emit, and treating the
    // whole info string as the lang made it match nothing in LANG_TO_EXT.
    const info = (m[1] || '').trim();
    const lang = (info.split(/\s+/)[0] || '').toLowerCase();
    const code = m[2].replace(/\n$/, '');
    blocks.push({ index: idx++, info, lang: lang || null, ext: LANG_TO_EXT[lang] || null, code });
  }

  if (blocks.length === 0) {
    // §0.39.267 — a reply read from the page's rendered text (guardian's userscripts before _replyText) has no
    // fences: ChatGPT's code block reads "JavaScript\n[Copy code\n]<code>". When the FIRST line is exactly a known
    // language name, everything after it (minus a copy/edit button label) is that code. Anything else still fails.
    const labelled = _fromLanguageLabel(rawText);
    if (labelled) return labelled;
    return { ok: false, reason: 'zero_blocks', error: 'extractCode: no fenced code block found in the response' };
  }

  const realBlocks = allowEmpty ? blocks : blocks.filter(b => b.code.trim().length > 0);
  if (realBlocks.length === 0) {
    return { ok: false, reason: 'empty_block', error: `extractCode: found ${blocks.length} fenced block(s), all empty — the agent fenced nothing` };
  }

  if (realBlocks.length > 1 && !allowMultiple) {
    return {
      ok: false, reason: 'ambiguous_multiple_blocks',
      error: `extractCode: found ${realBlocks.length} fenced code blocks and allowMultiple was not set — pass { allowMultiple: true } if this response is genuinely expected to contain more than one file`,
    };
  }

  return {
    ok: true,
    blocks: realBlocks,
    // Single-block convenience fields — always the first (only, unless
    // allowMultiple) real block, so a caller expecting one file never
    // has to index into blocks[0] itself.
    code: realBlocks[0].code,
    lang: realBlocks[0].lang,
    ext:  realBlocks[0].ext,
  };
}

const _BUTTON_LINE = /^(copy|copy code|edit|run|download|preview|code)$/i;
function _fromLanguageLabel(rawText) {
  const lines = String(rawText).replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const label = (lines[i] || '').trim().toLowerCase();
  if (!label || !Object.prototype.hasOwnProperty.call(LANG_TO_EXT, label)) return null;
  i++;
  while (i < lines.length && (_BUTTON_LINE.test(lines[i].trim()) || !lines[i].trim())) i++;
  const code = lines.slice(i).join('\n').replace(/\s+$/, '');
  if (!code.trim()) return null;
  const block = { index: 0, info: label, lang: label, ext: LANG_TO_EXT[label] || null, code, unfenced: true };
  return { ok: true, blocks: [block], code, lang: label, ext: block.ext, unfenced: true };
}

module.exports = { extractCode, LANG_TO_EXT };
