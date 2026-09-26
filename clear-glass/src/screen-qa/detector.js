'use strict';
/**
 * clear-glass/src/screen-qa/detector.js — detect open-ended on-screen
 * questions (job-application screening questions, "why do you want this
 * role?") and build the prompt to answer them.
 *
 * §BUILT 2026-09-21 — James: "clearglass needs to help me with job
 * applications, answering on screen questions... inject dom into copilot
 * cli and have it answer any questions on the screen."
 *
 * Distinct from autofill on purpose. Autofill (clear-glass/src/autofill/
 * matcher.js) fills KNOWN fields (email, name) from a static profile —
 * a lookup. This is for fields autofill would never confidently touch:
 * open-ended text a person actually has to compose an answer to. Same
 * DOM-detection shape as autofill (dom.handleQuery / a field's cgId),
 * but reuses matchFields() only to find out which fields autofill WOULD
 * already handle, so this never asks the AI to write "your email" —
 * it only surfaces fields nothing else already covers.
 *
 * §HONEST LIMIT — v1, backend only. Real and independently testable
 * (deriveQuestion is pure; detectOpenQuestions/answerQuestion take an
 * injected dom/send so they run with no live Electron window). NOT
 * built this pass: the hotkey, the right-click menu entry, the element-
 * picker integration, a settings UI, or the dual answer-preview surface
 * (copilot CLI panel + an isolated toast) James asked for on top of
 * this — those are real, separate, unbuilt UI work sitting on this
 * kernel, not silently assumed done because the backend exists.
 */

const { matchFields } = require('../autofill/matcher.js');

const OPEN_TAGS = new Set(['input', 'textarea']);
const OPEN_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', undefined, null, '']);
// A field autofill would confidently fill is not an "open question" —
// asking the AI to write someone's own email address would be inventing
// an answer to a question that was never actually open-ended.
const AUTOFILL_CONFIDENT = new Set(['high', 'medium']);

/**
 * deriveQuestion(fieldMeta) -> { question, source } | null
 * Pure. Picks the best available text describing what a field is
 * asking, in the order a person reading the page would actually see it:
 * an associated <label>, then aria-label, then placeholder, then a
 * humanized field name. Null (not a guessed empty string) when none
 * exist — a field with no discoverable question is not offered.
 */
function deriveQuestion(fieldMeta) {
  const attrs = fieldMeta.attrs || {};
  if (fieldMeta.label) return { question: fieldMeta.label, source: 'label' };
  if (attrs['aria-label']) return { question: attrs['aria-label'], source: 'aria-label' };
  if (attrs.placeholder) return { question: attrs.placeholder, source: 'placeholder' };
  if (fieldMeta.name) {
    const humanized = String(fieldMeta.name).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    if (humanized) return { question: humanized.charAt(0).toUpperCase() + humanized.slice(1), source: 'name' };
  }
  return null;
}

/**
 * detectOpenQuestions(dom, autofillStore, { agentId, profileId }) ->
 *   { totalFields, questions: [{cgId, question, source, tag}] }
 * Same real dom.handleQuery('input, textarea') surface autofill uses.
 * profileId is optional — without one, nothing is excluded as "autofill
 * would handle this" and every open-shaped field is offered; with one,
 * whatever autofill would confidently fill is left out here.
 */
async function detectOpenQuestions(dom, autofillStore, { agentId = 'default', profileId = null } = {}) {
  const domFields = await dom.handleQuery({ agentId, selector: 'input, textarea' });
  if (domFields?.error) return { error: domFields.error };

  let autofillCgIds = new Set();
  if (profileId) {
    const profile = autofillStore && autofillStore.getProfile(profileId);
    if (profile) {
      autofillCgIds = new Set(
        matchFields(domFields, profile).filter(m => AUTOFILL_CONFIDENT.has(m.confidence)).map(m => m.cgId)
      );
    }
  }

  const questions = [];
  for (const f of domFields) {
    if (!f.id) continue; // no real cgId — same discipline as matchFields
    if (!OPEN_TAGS.has(f.tag)) continue;
    if (f.tag === 'input' && !OPEN_INPUT_TYPES.has(f.type)) continue; // checkbox/radio/submit/hidden/file etc. are never open questions
    if (autofillCgIds.has(f.id)) continue; // autofill already has this one
    const derived = deriveQuestion(f);
    if (!derived) continue; // no discoverable question text — not guessed
    questions.push({ cgId: f.id, question: derived.question, source: derived.source, tag: f.tag });
  }
  return { totalFields: domFields.length, questions };
}

/**
 * buildAnswerPrompt({ question, context }) -> string
 * Pure. context is free text (profile fields + resume text + any
 * per-job extra the person typed — combining is the CALLER's job, kept
 * out of this function so it stays testable with a plain string).
 */
function buildAnswerPrompt({ question, context }) {
  const ctx = (context || '').trim();
  return [
    'You are helping a real person answer a job-application question, in their own voice, first person.',
    'Answer only the question asked. Do not invent facts about them that are not in the context below — if the',
    'context does not cover something the question asks for, say so plainly rather than fabricating it.',
    '',
    `Question: ${question}`,
    '',
    ctx ? `Context about the applicant:\n${ctx}` : 'Context about the applicant: (none given)',
  ].join('\n');
}

/**
 * answerQuestion({ question, context }, send) -> { ok, answer } | { ok:false, error }
 * send: async (message) -> string   the AI call, injected — this module
 * has no transport of its own, same pattern as file-tree-plan.js's ask.
 * Never fabricates an answer if send fails or returns nothing.
 */
async function answerQuestion({ question, context }, send) {
  if (!question) return { ok: false, error: 'question is required' };
  if (typeof send !== 'function') return { ok: false, error: 'no answering agent available' };
  try {
    const reply = await send(buildAnswerPrompt({ question, context }));
    const text = typeof reply === 'string' ? reply.trim() : '';
    if (!text) return { ok: false, error: 'the agent returned no real answer' };
    return { ok: true, answer: text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * injectAnswer(dom, { agentId, cgId, text }) -> the real dom.handleMutate
 * result. Same value-setting fix (native setter + input/change dispatch)
 * every mutate() caller already gets — not reimplemented here.
 */
async function injectAnswer(dom, { agentId = 'default', cgId, text }) {
  if (!cgId) return { error: 'cgId is required' };
  return dom.handleMutate({ agentId, cgId, mutation: { value: text } });
}

module.exports = { deriveQuestion, detectOpenQuestions, buildAnswerPrompt, answerQuestion, injectAnswer };
