'use strict';
/**
 * clear-glass/src/autofill/matcher.js — real form-field matching
 * UUID: cg-autofill-matcher-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — pure functions, no DOM/network access, so this
 * is fully testable without a live Electron instance (unlike almost
 * everything else this session touching ClearGlass). Takes the exact
 * real shape browser_action's dom_query already returns (checked
 * directly against clear-glass/src/dom/archaeology.js's buildMeta():
 * {id, tag, name, type, attrs:{autocomplete, placeholder, id, ...}}) —
 * no new DOM-extraction capability was needed, that data already
 * exists.
 *
 * §EVIDENCE-GRADED MATCHES, NOT ONE CONFIDENT GUESS — matches this
 * session's own graph-provenance discussion two turns ago: a match
 * from the field's own declared autocomplete attribute is a
 * fundamentally different kind of fact than one inferred from its
 * name attribute matching a regex, which is different again from a
 * guess based on placeholder text. Each match carries its real source
 * and confidence rather than being flattened into one undifferentiated
 * "matched" boolean — the fill step below can (and does) refuse
 * low-confidence matches by default rather than silently typing a
 * possibly-wrong value into a job application.
 */

const { FIELD_TYPES, EXTRA_FIELDS } = require('./store.js');
const { fillTemplate, profileVars } = require('./proposal.js');

// §REAL, NAMED PATTERNS — one array entry per real FIELD_TYPES value,
// each pattern checked in order until one hits. Patterns are checked
// against name/id/placeholder text (lowercased), NOT against
// autocomplete (that's an exact-token match handled separately, since
// it's a real standard, not a heuristic).
// §0.39.265 — job-application and freelance (Upwork, Fiverr) questions, checked
// BEFORE the generic patterns below so "LinkedIn profile URL" is LinkedIn, not
// "website", and "Cover letter" is the letter, not a name field.
const X = EXTRA_FIELDS;
const EXTRA_PATTERNS = [
  { type: 'linkedin',             re: /linked[-_ ]?in/i },
  { type: X.GITHUB_URL,           re: /git[-_ ]?hub/i },
  { type: X.UPWORK_URL,           re: /upwork/i },
  { type: X.FIVERR_URL,           re: /fiverr/i },
  { type: 'cover-letter',         re: /cover[-_ ]?letter|proposal|motivation(al)?[-_ ]?letter|why[-_ ]?(are[-_ ]?)?you[-_ ]?(a[-_ ]?)?(the[-_ ]?)?(best|right)[-_ ]?fit/i },
  { type: X.YEARS_EXPERIENCE,     re: /years?[-_ ]?(of[-_ ]?)?(relevant[-_ ]?|professional[-_ ]?|work[-_ ]?)?experience|experience[-_ ]?(in[-_ ]?)?years/i },
  { type: X.DESIRED_SALARY,       re: /salary|compensation|pay[-_ ]?expectation|expected[-_ ]?(pay|ctc)/i },
  { type: X.HOURLY_RATE,          re: /hourly[-_ ]?rate|rate[-_ ]?per[-_ ]?hour|your[-_ ]?rate|bid[-_ ]?(amount)?$/i },
  { type: X.HOURS_PER_WEEK,       re: /hours[-_ ]?per[-_ ]?week|weekly[-_ ]?hours|availability[-_ ]?\(hours/i },
  { type: X.NOTICE_PERIOD,        re: /notice[-_ ]?period/i },
  { type: X.AVAILABLE_FROM,       re: /start[-_ ]?date|available[-_ ]?(to[-_ ]?start|from)|earliest[-_ ]?start|when[-_ ]?can[-_ ]?you[-_ ]?start/i },
  { type: X.SPONSORSHIP,          re: /sponsor/i },
  { type: X.WORK_AUTHORIZATION,   re: /authori[sz](ed|ation)[-_ ]?to[-_ ]?work|work[-_ ]?authori[sz]ation|right[-_ ]?to[-_ ]?work|eligible[-_ ]?to[-_ ]?work/i },
  { type: X.RELOCATE,             re: /relocat/i },
  { type: X.REMOTE,               re: /remote|work[-_ ]?location[-_ ]?preference|on[-_ ]?site/i },
  { type: X.PRONOUNS,             re: /pronoun/i },
  { type: X.HEADLINE,             re: /headline|professional[-_ ]?(title|role)|your[-_ ]?title$/i },
  { type: X.SUMMARY,              re: /summary|overview|about[-_ ]?(you|yourself|me)|^bio$|biography|professional[-_ ]?bio|describe[-_ ]?yourself/i },
  { type: X.SKILLS,               re: /skills?|expertise|tech(nology)?[-_ ]?stack/i },
  { type: X.LANGUAGES,            re: /languages?[-_ ]?(spoken|you[-_ ]?speak)?$|spoken[-_ ]?languages/i },
  { type: 'portfolio',            re: /portfolio/i },
];

const NAME_PATTERNS = [
  { type: FIELD_TYPES.EMAIL,              re: /e[-_]?mail/i },
  { type: FIELD_TYPES.TEL,                re: /phone|tel(ephone)?|mobile|cell/i },
  { type: FIELD_TYPES.GIVEN_NAME,         re: /^(first|given|fname)[-_ ]?name$|^fname$|^first$/i },
  { type: FIELD_TYPES.FAMILY_NAME,        re: /^(last|family|sur|lname)[-_ ]?name$|^lname$|^last$/i },
  { type: FIELD_TYPES.NAME,               re: /^(full[-_ ]?name|your[-_ ]?name|name)$/i },
  { type: FIELD_TYPES.ADDRESS_LEVEL2,     re: /^city|town$/i },
  { type: FIELD_TYPES.ADDRESS_LEVEL1,     re: /^state|province|region$/i },
  { type: FIELD_TYPES.POSTAL_CODE,        re: /zip|postal[-_ ]?code/i },
  { type: FIELD_TYPES.COUNTRY,            re: /^country$/i },
  { type: FIELD_TYPES.STREET_ADDRESS,     re: /street[-_ ]?address|address[-_ ]?(line)?1?$|^address$/i },
  { type: FIELD_TYPES.ORGANIZATION,       re: /company|employer|organi[sz]ation/i },
  // §NAMED RISK — organization-title (job title) is the single riskiest
  // real pattern here: "title" alone also matches "Mr/Ms/Dr" honorific
  // fields on some forms. Requires a real, more specific compound word
  // to reduce that false-positive rate, at the real cost of missing a
  // form that only ever labels the field bare "Title" — named
  // explicitly rather than silently accepted as equally reliable.
  { type: FIELD_TYPES.ORGANIZATION_TITLE, re: /job[-_ ]?title|position[-_ ]?title|current[-_ ]?title|role[-_ ]?title/i },
  { type: FIELD_TYPES.URL,                re: /portfolio|website|personal[-_ ]?site/i },
];

// §0.39.265 — a field's visible label ("First name *", "Email address") is
// free text, so its patterns are unanchored words, unlike the name/id ones above.
const LABEL_PATTERNS = [
  ...EXTRA_PATTERNS,
  { type: FIELD_TYPES.EMAIL,              re: /e[-_ ]?mail/i },
  { type: FIELD_TYPES.TEL,                re: /phone|mobile|telephone|cell/i },
  { type: FIELD_TYPES.GIVEN_NAME,         re: /first[-_ ]?name|given[-_ ]?name|forename/i },
  { type: FIELD_TYPES.FAMILY_NAME,        re: /last[-_ ]?name|family[-_ ]?name|surname/i },
  { type: FIELD_TYPES.ADDITIONAL_NAME,    re: /middle[-_ ]?name/i },
  { type: FIELD_TYPES.NICKNAME,           re: /preferred[-_ ]?name|nickname/i },
  { type: FIELD_TYPES.NAME,               re: /full[-_ ]?name|^\s*(your[-_ ]?)?name\b/i },
  { type: FIELD_TYPES.POSTAL_CODE,        re: /zip|post[-_ ]?code|postal/i },
  { type: FIELD_TYPES.ADDRESS_LINE2,      re: /address[-_ ]?line[-_ ]?2|apartment|suite/i },
  { type: FIELD_TYPES.STREET_ADDRESS,     re: /street|address[-_ ]?(line[-_ ]?1)?$|^address/i },
  { type: FIELD_TYPES.ADDRESS_LEVEL2,     re: /\bcity\b|\btown\b/i },
  { type: FIELD_TYPES.ADDRESS_LEVEL1,     re: /\bstate\b|province|county|region/i },
  { type: FIELD_TYPES.COUNTRY_NAME,       re: /country/i },
  { type: FIELD_TYPES.ORGANIZATION_TITLE, re: /(current|job|most[-_ ]?recent)[-_ ]?(job[-_ ]?)?title|current[-_ ]?(position|role)/i },
  { type: FIELD_TYPES.ORGANIZATION,       re: /current[-_ ]?(company|employer)|company|employer|organi[sz]ation/i },
  { type: FIELD_TYPES.URL,                re: /website|personal[-_ ]?site|url/i },
];

// A field type whose value lives in the profile's documents, not its fields.
const DOC_SOURCE = { linkedin: ['linkedinUrl'], portfolio: ['portfolioUrl'], 'cover-letter': ['coverLetter', 'proposal'] };
function _valueFor(type, profile) {
  const f = profile.fields || {}, d = profile.documents || {};
  if (DOC_SOURCE[type]) { for (const k of DOC_SOURCE[type]) if (d[k]) return d[k]; return f[type === 'portfolio' ? 'url' : type]; }
  return f[type];
}

// Real autocomplete values can carry multiple space-separated tokens
// per the WHATWG spec (e.g. "shipping given-name") — check every token,
// not just an exact full-string match.
function _matchAutocomplete(autocompleteAttr) {
  if (!autocompleteAttr) return null;
  const tokens = String(autocompleteAttr).toLowerCase().split(/\s+/);
  const known = new Set(Object.values(FIELD_TYPES));
  for (const t of tokens) if (known.has(t)) return t;
  return null;
}

function _matchByPattern(text) {
  if (!text) return null;
  for (const { type, re } of [...EXTRA_PATTERNS, ...NAME_PATTERNS]) if (re.test(text)) return type;
  return null;
}
// A label that is a question ("Why do you want to join our company?") must not
// match a generic word in it ("company" → current employer). Questions only
// match the question-shaped fields; the rest go to on-screen answers (screen-qa).
const QUESTION_TYPES = new Set(['cover-letter', X.SUMMARY, X.YEARS_EXPERIENCE, X.SPONSORSHIP, X.WORK_AUTHORIZATION, X.RELOCATE,
  X.AVAILABLE_FROM, X.DESIRED_SALARY, X.NOTICE_PERIOD, X.REMOTE, X.HOURLY_RATE, X.HOURS_PER_WEEK]);
function _matchByLabel(text) {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 200);
  const question = t.includes('?') || t.length > 60;
  for (const { type, re } of LABEL_PATTERNS) if ((!question || QUESTION_TYPES.has(type)) && re.test(t)) return type;
  return null;
}

/**
 * matchFields(domFields, profile) — real matching, evidence-graded.
 * domFields: the real array dom_query('input, select, textarea')
 * returns. profile: a real AutofillProfile (store.js's shape).
 *
 * Returns [{ cgId, fieldType, value, confidence, source }] — only real
 * matches where the profile actually HAS a value for that fieldType;
 * a field whose purpose is identified but the profile has nothing to
 * put there is not included (nothing to fill, not a failure).
 */
function matchFields(domFields, profile, opts = {}) {
  if (!Array.isArray(domFields)) throw new Error('matchFields: domFields must be a real array (the dom_query result)');
  if (!profile || typeof profile.fields !== 'object') throw new Error('matchFields: profile must be a real AutofillProfile with a fields map');

  const matches = [];
  for (const field of domFields) {
    if (!field || !field.id) continue; // no real cgId to target — can't fill this one regardless of match quality
    const tag = (field.tag || '').toLowerCase();
    if (!['input', 'select', 'textarea'].includes(tag)) continue;
    const type = (field.type || '').toLowerCase();
    if (['submit', 'button', 'hidden', 'checkbox', 'radio', 'file', 'image', 'reset'].includes(type)) continue; // real, deliberate exclusion — a text-value fill doesn't apply to these; file specifically handled separately (see honest limit)

    const autocompleteToken = _matchAutocomplete(field.attrs?.autocomplete);
    const byName = _matchByPattern(field.name);
    const byId = _matchByPattern(field.attrs?.id || field.id_attr);
    const byPlaceholder = _matchByPattern(field.attrs?.placeholder);
    // §0.39.265 — the visible label and aria-label (most application forms, and
    // Upwork/Fiverr, name fields only there); archaeology.js reports both.
    const byLabel = _matchByLabel(field.label) || _matchByLabel(field.attrs?.['aria-label']);

    let fieldType = null, confidence = null, source = null;
    if (autocompleteToken) { fieldType = autocompleteToken; confidence = 'high'; source = 'autocomplete'; }
    else if (byName)       { fieldType = byName;            confidence = 'medium'; source = 'name'; }
    else if (byId)         { fieldType = byId;               confidence = 'medium'; source = 'id'; }
    else if (byLabel)      { fieldType = byLabel;            confidence = 'medium'; source = 'label'; }
    else if (byPlaceholder){ fieldType = byPlaceholder;      confidence = 'low';    source = 'placeholder'; }

    if (!fieldType) continue; // real, honest non-match — not every field on a form is autofillable, and this doesn't guess

    let value = _valueFor(fieldType, profile);
    if (value === undefined || value === null || value === '') continue; // identified, but the real profile has nothing to put there

    // A letter/proposal template: fill {{first_name}}, {{skills}}, … from the
    // profile (and any page vars the caller passes). If a {{placeholder}} is
    // still left (e.g. {{company}}), it is only ever a LOW-confidence match,
    // so the default fill leaves it for you instead of sending "Dear {{company}}".
    let needsEdit = false;
    if (fieldType === 'cover-letter' || /\{\{\s*[\w-]+\s*\}\}/.test(String(value))) {
      const t = fillTemplate(String(value), { ...profileVars(profile), ...(opts.vars || {}) });
      value = t.text;
      if (t.missing.length) { needsEdit = true; confidence = 'low'; }
    }
    if (tag !== 'textarea' && String(value).length > 500) continue; // a long letter never goes into a one-line box

    matches.push({ cgId: field.id, fieldType, value, confidence, source, ...(needsEdit ? { needsEdit: true } : {}) });
  }
  return matches;
}

module.exports = { matchFields, NAME_PATTERNS, LABEL_PATTERNS, EXTRA_PATTERNS, detectFields, fillFields };

// §BUILT 2026-09-19 — James: "library ui." Extracted here after finding
// the exact same detect/fill orchestration (query -> match -> filter ->
// mutate loop -> report) written twice — once for gates/index.js's real
// Guardian/SSE path (agent_manage's autofill_manage tool), once for
// ipc/bridge.js's real, separate UI-facing channel. Two real, different
// callers reaching the same one real implementation now, not two
// implementations of the same real logic (§16.5).

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/** detectFields(dom, autofillStore, {agentId, profileId}) — real preview, no fill. */
async function detectFields(dom, autofillStore, { agentId = 'default', profileId, vars } = {}) {
  const profile = autofillStore.getProfile(profileId);
  if (!profile) return { error: `no autofill profile "${profileId}"` };
  const domFields = await dom.handleQuery({ agentId, selector: 'input, select, textarea' });
  if (domFields?.error) return { error: domFields.error };
  return { profileId, totalFields: domFields.length, matches: matchFields(domFields, profile, { vars }) };
}

/** fillFields(dom, autofillStore, {agentId, profileId, minConfidence}) — real fill, real per-field report. */
async function fillFields(dom, autofillStore, { agentId = 'default', profileId, minConfidence = 'medium', vars } = {}) {
  const profile = autofillStore.getProfile(profileId);
  if (!profile) return { error: `no autofill profile "${profileId}"` };
  const domFields = await dom.handleQuery({ agentId, selector: 'input, select, textarea' });
  if (domFields?.error) return { error: domFields.error };
  const floor = CONFIDENCE_RANK[minConfidence] || CONFIDENCE_RANK.medium;
  const allMatches = matchFields(domFields, profile, { vars });
  const toFill = allMatches.filter(m => CONFIDENCE_RANK[m.confidence] >= floor);
  const skipped = allMatches.filter(m => !toFill.includes(m)).map(m => ({ cgId: m.cgId, fieldType: m.fieldType, confidence: m.confidence, reason: m.needsEdit ? 'template still has {{placeholders}} to fill' : 'below minConfidence' }));
  const filled = [], failed = [];
  for (const m of toFill) {
    try {
      const r = await dom.handleMutate({ agentId, cgId: m.cgId, mutation: { value: m.value } });
      if (r?.error) failed.push({ cgId: m.cgId, fieldType: m.fieldType, error: r.error });
      else filled.push({ cgId: m.cgId, fieldType: m.fieldType, confidence: m.confidence, source: m.source });
    } catch (err) { failed.push({ cgId: m.cgId, fieldType: m.fieldType, error: err.message }); }
  }
  return { profileId, totalFields: domFields.length, filled, skipped, failed };
}
