'use strict';
/**
 * lib/reply-continuation.js — a reply that was cut off is finished, not thrown away.
 * comp_id: nexus.lib.reply-continuation
 * Version: 1.0.0 (0.39.289)
 *
 * James, 2026-10-01: "ollama has been known to cut off blocks … if it gets cut off, what about injecting the cut off
 * part into the agent, and having it finish it. like the compounding."
 *
 * Before: a cut reply was judged truncated and the WHOLE chunk was asked for again (the same length limit cut it
 * again), then handed to another provider. Ollama's own signal that it stopped at its token limit (done_reason
 * 'length') was dropped, so a cut file could also land as if complete.
 *
 * Now: the part already written is kept; the agent is shown its tail and asked to continue from exactly there;
 * the two are stitched (overlap removed, a re-opened fence dropped). Up to `maxRounds`; still cut after that is
 * said, never hidden (§1.2). Pure functions + one loop over an injected call — no provider knowledge here, so the
 * Ollama bridge and the spec chunk dispatch use the same rule.
 *
 *   looksCut(text, { doneReason }) -> { cut, reason }
 *   continuePrompt(originalPrompt, partial, { tailChars }) -> prompt
 *   stitch(partial, continuation) -> text
 *   complete(call, prompt, { first, maxRounds, isCut }) -> { text, rounds, cut, reasons[] }
 */

const TAIL_CHARS = 1500;
const MAX_OVERLAP = 600;

function _fenceCount(text) { return (String(text).match(/^\s*```/gm) || []).length; }

/**
 * looksCut — true when the reply ends mid-way: the provider said so (doneReason 'length'), a code fence was opened
 * and never closed, or the last line breaks off mid-sentence/mid-statement. A short or empty reply is NOT cut —
 * there is nothing to continue (that is the empty/too-short failure, handled by the caller).
 */
function looksCut(text, { doneReason = null } = {}) {
  const t = String(text || '');
  if (doneReason === 'length') return { cut: true, reason: 'token limit (done_reason: length)' };
  if (_fenceCount(t) % 2 === 1 && t.trim().length > 3) return { cut: true, reason: 'code fence opened and not closed' };
  if (t.trim().length < 40) return { cut: false, reason: null };
  const lines = t.replace(/\s+$/, '').split('\n');
  const last = (lines[lines.length - 1] || '').trim();
  if (!last) return { cut: false, reason: null };
  // complete endings: prose punctuation, code terminators, a closed fence, shell keywords, a SEAM verdict
  if (/[.!?:)\]'"}\];>`]$/.test(last) || /^(end|fi|done|esac)$/.test(last) || /SEAM\s+VERDICT\s*:\s*(PASS|FAIL)/i.test(last)) return { cut: false, reason: null };
  if (/[,(\[{=+\-*/&|<]$/.test(last) || /\b(and|or|the|a|to|of|with|return|const|let|var|function|import|from)$/.test(last)) return { cut: true, reason: 'ends mid-statement' };
  return last.length < 80 ? { cut: true, reason: 'ends mid-sentence' } : { cut: false, reason: null };
}

function continuePrompt(originalPrompt, partial, { tailChars = TAIL_CHARS } = {}) {
  const p = String(partial || '');
  const tail = p.length > tailChars ? p.slice(-tailChars) : p;
  const inFence = _fenceCount(p) % 2 === 1;
  return [
    'Your previous reply to the task below was cut off before it finished.',
    'Continue it from EXACTLY where it stopped. Do not repeat anything already written, do not restart, do not',
    `summarise, do not apologise.${inFence ? ' You are inside an open code block: continue the code, do not open a new ``` fence, close the block when the code ends.' : ''}`,
    '',
    '=== THE TASK ===',
    String(originalPrompt || '').slice(0, 6000),
    '',
    `=== THE END OF WHAT YOU ALREADY WROTE (last ${tail.length} of ${p.length} characters) ===`,
    tail,
    '=== CONTINUE FROM HERE ===',
  ].join('\n');
}

/** stitch — partial + continuation, with any repeated overlap and a re-opened fence removed. */
function stitch(partial, continuation) {
  const a = String(partial || '');
  let b = String(continuation || '');
  // a model that "continues" by opening a fresh fence inside an open block: drop the duplicate opener
  if (_fenceCount(a) % 2 === 1) b = b.replace(/^\s*```[\w+-]*[ \t]*\n/, '');
  // the longest suffix of a that is a prefix of b (models often repeat the last line or two)
  const max = Math.min(MAX_OVERLAP, a.length, b.length);
  for (let k = max; k >= 8; k--) {
    if (a.endsWith(b.slice(0, k))) return a + b.slice(k);
  }
  // a partial last line re-written whole: replace it
  const lastNl = a.lastIndexOf('\n');
  const lastLine = a.slice(lastNl + 1);
  if (lastLine.trim().length >= 4 && b.trimStart().startsWith(lastLine.trim())) return a.slice(0, lastNl + 1) + b.trimStart();
  return a + b;   // the model continues mid-token as often as mid-line; adding a separator would break code
}

/**
 * complete(call, prompt, { first, maxRounds, isCut }) — call(prompt) -> Promise<{ text, doneReason? }>.
 * `first` is the reply already in hand (or null to make the first call here). Continues while it looks cut,
 * up to maxRounds. A continuation that adds nothing stops the loop (it would repeat forever).
 */
async function complete(call, prompt, { first = null, maxRounds = 3, isCut = looksCut } = {}) {
  let cur = first || await call(prompt);
  let text = String((cur && cur.text) || '');
  const reasons = [];
  let rounds = 0;
  let state = isCut(text, { doneReason: cur && cur.doneReason });
  while (state.cut && rounds < maxRounds) {
    reasons.push(state.reason);
    rounds++;
    let next;
    try { next = await call(continuePrompt(prompt, text)); } catch (e) { reasons.push(`continuation ${rounds} failed: ${e.message}`); break; }
    const add = String((next && next.text) || '');
    if (!add.trim()) { reasons.push(`continuation ${rounds} was empty`); break; }
    const before = text.length;
    text = stitch(text, add);
    if (text.length <= before) { reasons.push(`continuation ${rounds} added nothing new`); break; }
    state = isCut(text, { doneReason: next && next.doneReason });
  }
  return { text, rounds, cut: state.cut, reasons };
}

module.exports = { looksCut, continuePrompt, stitch, complete, MODULE_ID: 'nexus.lib.reply-continuation', VERSION: '1.0.0' };
