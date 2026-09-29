'use strict';
/**
 * lib/opportunity/apply.js — fill a real application (or a reply box) in Clear Glass, and stop where James decides.
 * comp_id: nexus.lib.opportunity.apply
 * Version: 1.0.0
 *
 * THE FLOW (each step a real clearglass.browser.tool call; each outcome a ledger row):
 *   open a tab (agentId opp-<id>, partition persist:opportunity — a login done once in that partition persists)
 *   → read the page → login wall? NEEDS_LOGIN (James logs in once in that tab; prepare again)
 *   → no fields but an Apply button? press it, read again (one hop)
 *   → Clear Glass autofill (the profile's autofillProfileId)
 *   → read again → planFill(): every remaining field mapped from the answer bank, the profile, the drafts
 *   → open questions with no approved answer: a drafted answer (screening_answer), marked as generated, shown to James
 *   → one sequence call fills everything → read again → READY, or NEEDS_INPUT naming the required fields left empty
 *   → submit only when James approved AND the platform policy is 'auto' (or James himself says submit)
 *
 * PLATFORM POLICY. Several platforms forbid automated submission or messaging in their terms (LinkedIn, Indeed,
 * Upwork, Fiverr). An account ban costs more than any single application, so for those 'auto' needs an explicit
 * acknowledgeTos:true in the policy. Nothing is hidden: the rule, and why, is in PLATFORMS and in every refusal.
 * Filling a form is never automated-submission; the stop at READY is the point where a person presses the button.
 */

const PLATFORMS = Object.freeze({
  'linkedin.com':    { tos: 'LinkedIn User Agreement §8.2 prohibits bots/automated methods to access the service or apply.', autoNeedsAck: true },
  'indeed.com':      { tos: 'Indeed ToS prohibit automated applying/scraping.', autoNeedsAck: true },
  'upwork.com':      { tos: 'Upwork ToS prohibit automated proposals/messages (bots).', autoNeedsAck: true },
  'fiverr.com':      { tos: 'Fiverr Terms prohibit bots/automated messaging and off-platform contact.', autoNeedsAck: true },
  'freelancer.com':  { tos: 'Freelancer.com prohibits automated bidding tools not provided by Freelancer.', autoNeedsAck: true },
});
function platformFor(url) {
  let host = ''; try { host = new URL(url).host.replace(/^www\./, ''); } catch (_) {}
  const key = Object.keys(PLATFORMS).find(k => host === k || host.endsWith('.' + k));
  return { host, key: key || null, ...(key ? PLATFORMS[key] : { tos: null, autoNeedsAck: false }) };
}

/** policyFor(profile, opp) → { mode: 'manual'|'approve'|'auto', acknowledgeTos, autoApproveAbove } */
function policyFor(profile = {}, opp = {}) {
  const p = profile.policy || {};
  const plat = platformFor(opp.applyUrl || opp.url);
  const specific = (plat.key && p[plat.key]) || p[opp.source] || p.default || {};
  return { mode: specific.mode || 'approve', acknowledgeTos: !!specific.acknowledgeTos, autoApproveAbove: specific.autoApproveAbove ?? null, platform: plat };
}
function mayAutoSubmit(profile, opp) {
  const pol = policyFor(profile, opp);
  if (pol.mode !== 'auto') return { ok: false, why: `policy is "${pol.mode}" — James submits (set policy mode "auto" to let the agent press submit)` };
  if (pol.platform.autoNeedsAck && !pol.acknowledgeTos) return { ok: false, why: `${pol.platform.key}: ${pol.platform.tos} Auto-submit here needs acknowledgeTos:true in the policy.` };
  return { ok: true };
}

const LOGIN_RE = /\b(sign in|log in|login|create (an )?account to apply|join to apply)\b/i;
const DONE_RE = /(application (was |has been )?(submitted|received|sent|complete)|thank(s| you) for (applying|your (application|interest))|we('ve| have) received your application|proposal (was )?(sent|submitted)|message sent|your offer (was )?sent)/i;
const ERROR_RE = /\b(this field is required|is required|please (fill|complete|enter|select)|invalid|fix the errors?)\b/i;
const SUBMIT_RE = /^(submit( (your )?application)?|apply( now)?|send( application| proposal| offer| message)?|submit proposal|continue to submit)$/i;
const RESUME_RE = /\b(resume|résumé|cv|curriculum)\b/i;
const COVER_RE = /\bcover\s*letter\b/i;
const CONSENT_RE = /\b(i agree|i accept|consent|privacy policy|terms|acknowledge|certify)\b/i;

/**
 * planFill(fields, { profile, answerFor, coverLetter, resumePath, coverLetterPath }) — pure.
 * → { steps: [{ action, selector, value?|text?|checked?|paths? }], planned: [{ selector, label, source, confidence, value }],
 *     open: [{ selector, label, type }], skipped: [{ selector, label, why }] }
 */
function planFill(fields = [], { profile = {}, answerFor = () => null, coverLetter = null, resumePath = null, coverLetterPath = null } = {}) {
  const steps = [], planned = [], open = [], skipped = [];
  const radios = new Map();
  for (const f of fields) {
    if (f.filled && f.type !== 'radio' && f.type !== 'checkbox') { skipped.push({ selector: f.selector, label: f.label, why: 'already filled' }); continue; }
    const label = (f.question || f.label || f.name || '').trim();
    if (f.type === 'radio') { const k = f.name || f.question || f.selector; if (!radios.has(k)) radios.set(k, []); radios.get(k).push(f); continue; }
    if (f.type === 'file') {
      if (COVER_RE.test(label) && coverLetterPath) { steps.push({ action: 'upload', selector: f.selector, paths: [coverLetterPath] }); planned.push({ selector: f.selector, label, source: 'file:coverLetter', confidence: 'high', value: coverLetterPath }); }
      else if ((RESUME_RE.test(label) || !COVER_RE.test(label)) && resumePath) { steps.push({ action: 'upload', selector: f.selector, paths: [resumePath] }); planned.push({ selector: f.selector, label, source: 'file:resume', confidence: RESUME_RE.test(label) ? 'high' : 'medium', value: resumePath }); }
      else skipped.push({ selector: f.selector, label, why: 'file input with no matching file in the profile' });
      continue;
    }
    if (f.type === 'checkbox') {
      if (CONSENT_RE.test(label)) {
        if (profile.autoConsent === true) { steps.push({ action: 'check', selector: f.selector, checked: true }); planned.push({ selector: f.selector, label, source: 'profile:autoConsent', confidence: 'high', value: true }); }
        else skipped.push({ selector: f.selector, label, why: 'consent box — left for James (profile.autoConsent is off)' });
        continue;
      }
      const a = answerFor(label, { options: ['Yes', 'No'] });
      if (a) { const yes = /^y/i.test(a.answer); steps.push({ action: 'check', selector: f.selector, checked: yes }); planned.push({ selector: f.selector, label, source: a.source, confidence: a.confidence, value: yes }); }
      else skipped.push({ selector: f.selector, label, why: 'checkbox with no known answer' });
      continue;
    }
    if (f.type === 'select') {
      const a = answerFor(label, { options: (f.options || []).map(o => o.text).filter(t => t && !/^(select|choose|--)/i.test(t)) });
      if (a && !a.unmapped) { steps.push({ action: 'select', selector: f.selector, text: a.answer }); planned.push({ selector: f.selector, label, source: a.source, confidence: a.confidence, value: a.answer }); }
      else if (f.required) open.push({ selector: f.selector, label, type: 'select', options: (f.options || []).map(o => o.text).slice(0, 30) });
      else skipped.push({ selector: f.selector, label, why: a && a.unmapped ? `answer "${a.answer}" matches no option` : 'no known answer' });
      continue;
    }
    // text-like: text, email, tel, url, number, textarea, contenteditable, date...
    if (COVER_RE.test(label) && coverLetter) { steps.push({ action: 'setValue', selector: f.selector, value: coverLetter }); planned.push({ selector: f.selector, label, source: 'draft:cover_letter', confidence: 'high', value: `${coverLetter.slice(0, 60)}…` }); continue; }
    const a = answerFor(label);
    if (a) { steps.push({ action: 'setValue', selector: f.selector, value: a.answer }); planned.push({ selector: f.selector, label, source: a.source, confidence: a.confidence, value: a.answer }); continue; }
    if (f.required || f.type === 'textarea') open.push({ selector: f.selector, label, type: f.type });
    else skipped.push({ selector: f.selector, label, why: 'optional field with no known answer' });
  }
  for (const [, group] of radios) {
    const question = (group[0].question || group[0].name || '').trim();
    const opts = group.map(g => g.label || g.value).filter(Boolean);
    const a = answerFor(question, { options: opts });
    const pick = a && !a.unmapped ? group.find(g => (g.label || g.value) === a.answer) : null;
    if (pick) { steps.push({ action: 'check', selector: pick.selector, checked: true }); planned.push({ selector: pick.selector, label: question, source: a.source, confidence: a.confidence, value: a.answer }); }
    else if (group.some(g => g.required)) open.push({ selector: group[0].selector, label: question, type: 'radio', options: opts });
    else skipped.push({ selector: group[0].selector, label: question, why: 'radio group with no known answer' });
  }
  return { steps, planned, open, skipped };
}

function findSubmit(buttons = []) {
  const exact = buttons.find(b => SUBMIT_RE.test(String(b.text || '').trim()));
  if (exact) return exact;
  return buttons.find(b => b.type === 'submit' && /submit|apply|send/i.test(b.text || '')) || null;
}
function findApplyEntry(buttons = [], links = []) {
  return buttons.find(b => /^(easy )?apply( now| for this job)?$|^i'?m interested$/i.test(String(b.text || '').trim()))
      || links.find(l => /^(apply( now| for this job)?|apply on company (site|website))$/i.test(String(l.text || '').trim())) || null;
}
function findReplyBox(fields = [], recipe = {}) {
  if (recipe.replySelector) return fields.find(f => f.selector === recipe.replySelector) || { selector: recipe.replySelector, type: 'textarea' };
  const boxes = fields.filter(f => f.type === 'textarea' || f.type === 'contenteditable');
  return boxes.find(f => /message|reply|write|type/i.test(f.label || '')) || boxes[boxes.length - 1] || null;
}

module.exports = { PLATFORMS, platformFor, policyFor, mayAutoSubmit, planFill, findSubmit, findApplyEntry, findReplyBox,
  LOGIN_RE, DONE_RE, ERROR_RE, SUBMIT_RE };
