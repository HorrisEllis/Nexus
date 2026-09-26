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

const { FIELD_TYPES } = require('./store.js');

// §REAL, NAMED PATTERNS — one array entry per real FIELD_TYPES value,
// each pattern checked in order until one hits. Patterns are checked
// against name/id/placeholder text (lowercased), NOT against
// autocomplete (that's an exact-token match handled separately, since
// it's a real standard, not a heuristic).
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
  for (const { type, re } of NAME_PATTERNS) if (re.test(text)) return type;
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
function matchFields(domFields, profile) {
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

    let fieldType = null, confidence = null, source = null;
    if (autocompleteToken) { fieldType = autocompleteToken; confidence = 'high'; source = 'autocomplete'; }
    else if (byName)       { fieldType = byName;            confidence = 'medium'; source = 'name'; }
    else if (byId)         { fieldType = byId;               confidence = 'medium'; source = 'id'; }
    else if (byPlaceholder){ fieldType = byPlaceholder;      confidence = 'low';    source = 'placeholder'; }

    if (!fieldType) continue; // real, honest non-match — not every field on a form is autofillable, and this doesn't guess

    const value = profile.fields[fieldType];
    if (value === undefined || value === null || value === '') continue; // identified, but the real profile has nothing to put there

    matches.push({ cgId: field.id, fieldType, value, confidence, source });
  }
  return matches;
}

module.exports = { matchFields, NAME_PATTERNS, detectFields, fillFields };

// §BUILT 2026-09-19 — James: "library ui." Extracted here after finding
// the exact same detect/fill orchestration (query -> match -> filter ->
// mutate loop -> report) written twice — once for gates/index.js's real
// Guardian/SSE path (agent_manage's autofill_manage tool), once for
// ipc/bridge.js's real, separate UI-facing channel. Two real, different
// callers reaching the same one real implementation now, not two
// implementations of the same real logic (§16.5).

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/** detectFields(dom, autofillStore, {agentId, profileId}) — real preview, no fill. */
async function detectFields(dom, autofillStore, { agentId = 'default', profileId } = {}) {
  const profile = autofillStore.getProfile(profileId);
  if (!profile) return { error: `no autofill profile "${profileId}"` };
  const domFields = await dom.handleQuery({ agentId, selector: 'input, select, textarea' });
  if (domFields?.error) return { error: domFields.error };
  return { profileId, totalFields: domFields.length, matches: matchFields(domFields, profile) };
}

/** fillFields(dom, autofillStore, {agentId, profileId, minConfidence}) — real fill, real per-field report. */
async function fillFields(dom, autofillStore, { agentId = 'default', profileId, minConfidence = 'medium' } = {}) {
  const profile = autofillStore.getProfile(profileId);
  if (!profile) return { error: `no autofill profile "${profileId}"` };
  const domFields = await dom.handleQuery({ agentId, selector: 'input, select, textarea' });
  if (domFields?.error) return { error: domFields.error };
  const floor = CONFIDENCE_RANK[minConfidence] || CONFIDENCE_RANK.medium;
  const allMatches = matchFields(domFields, profile);
  const toFill = allMatches.filter(m => CONFIDENCE_RANK[m.confidence] >= floor);
  const skipped = allMatches.filter(m => !toFill.includes(m)).map(m => ({ cgId: m.cgId, fieldType: m.fieldType, confidence: m.confidence, reason: 'below minConfidence' }));
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
