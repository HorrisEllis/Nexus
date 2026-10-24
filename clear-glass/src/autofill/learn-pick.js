'use strict';
/**
 * clear-glass/src/autofill/learn-pick.js — JA3 (0.60.230): the element picker on a missed field.
 * comp_id: nexus.clear-glass.src.autofill.learn-pick
 * UUID: cg-autofill-learn-pick-v1-0000-2026-1024-jamesbrooks-001
 * Map: docs/2026-10-19-gig-autofill-and-learn-phasemap.spec JA3_the_picker_on_a_miss
 *
 * James, 2026-10-19: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per
 * site settings ... and updates the autofill." · 2026-10-24: "ja3".
 *
 * JA1 made matchFields consult a per-site learned map; JA2 saved a pick into it. This is the pick itself:
 *   needsPick(domFields, profile, matches) → { unplaced, unmatched } — what a fill could not place (pure)
 *   chooseKey(field, domFields)            → { key, stable } | { error } — the identity a pick is learned by (pure)
 *   saveLearned(siteSettings, url, fieldKey, fieldType) — the ONE save path (the JA2 route calls it too)
 *   pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType, ... }) — pop the picker, resolve, check, save, fill again
 *
 * Nothing new where something exists (§8.6): the picker is renderer/guardian-picker.js in its field mode (pickField, the one
 * src/providers/attention.js already drives); the picked element is resolved to the dom mesh's own field record
 * (src/dom/archaeology.js __cgDomMesh — the record matchFields reads); a key's stability is selector-check.js's looksGenerated;
 * the save is matcher.js learnKey into the site-settings store. Never throws; a cancel or a refused pick saves nothing and says why.
 */
const fs = require('fs');
const path = require('path');
const { FIELD_TYPES, EXTRA_FIELDS } = require('./store.js');
const M = require('./matcher.js');

const MODULE_ID = 'clear-glass.autofill.learn-pick';
const VERSION = '1.0.0';
const NOT_TEXT = new Set(['submit', 'button', 'hidden', 'checkbox', 'radio', 'file', 'image', 'reset']);   // the same exclusion matchFields makes
const FIELD_TYPE_SET = new Set([...Object.values(FIELD_TYPES), ...Object.values(EXTRA_FIELDS), 'linkedin', 'portfolio', 'cover-letter']);

// selector-check.js's own "this value looks generated" rule (uuids, digit runs, React ids), loaded the way its Node test does.
const _check = require('../../renderer/selector-check.js').create({ document: null });
const looksGenerated = (v) => _check.looksGenerated(v);

function isFillable(field) {
  if (!field || !field.id) return false;
  const tag = String(field.tag || '').toLowerCase();
  if (!['input', 'select', 'textarea'].includes(tag)) return false;
  return !NOT_TEXT.has(String(field.type || '').toLowerCase());
}

/** Whether the profile holds a value for a type — matcher.js valueFor, the lookup the fill itself uses (fields, then documents). */
function _hasValue(type, profile) {
  const v = M.valueFor(type, profile);
  return v !== undefined && v !== null && v !== '';
}

/**
 * needsPick(domFields, profile, matches) — what a fill could not place:
 *   unplaced:  the profile's field types that hold a value and that no field on the page took — pick where each goes
 *   unmatched: the page's fillable fields nothing matched — the boxes the autofill did not understand
 */
function needsPick(domFields = [], profile = {}, matches = []) {
  const taken = new Set(matches.map(m => m.fieldType));
  const matchedIds = new Set(matches.map(m => m.cgId));
  const types = new Set([...Object.keys(profile.fields || {}), ...(profile.documents?.linkedinUrl ? ['linkedin'] : []),
    ...(profile.documents?.portfolioUrl ? ['portfolio'] : []), ...((profile.documents?.coverLetter || profile.documents?.proposal) ? ['cover-letter'] : [])]);
  const unplaced = [...types].filter(t => FIELD_TYPE_SET.has(t) && !taken.has(t) && _hasValue(t, profile)).sort();
  const unmatched = (domFields || []).filter(f => isFillable(f) && !matchedIds.has(f.id))
    .map(f => ({ cgId: f.id, keys: M.fieldKeysOf(f), label: f.label || f.attrs?.['aria-label'] || f.attrs?.placeholder || f.name || null }));
  return { unplaced, unmatched };
}

/**
 * chooseKey(field, domFields) — the identity a pick is learned by: one of fieldKeysOf(field) that no OTHER fillable field on the
 * page shares (exactly one match — selector-assign's evidence rule), a stable one first (not looksGenerated). A unique key that
 * looks generated is used only when nothing stable is unique, and says so (stable:false — it may not match on the next visit).
 */
function chooseKey(field, domFields = []) {
  const keys = M.fieldKeysOf(field);
  if (!keys.length) return { error: 'that field has no id, name, label or placeholder to remember it by' };
  const others = (domFields || []).filter(f => f && f.id !== field.id && isFillable(f));
  const unique = keys.filter(k => !others.some(o => M.fieldKeysOf(o).includes(k)));
  if (!unique.length) return { error: `every name for that field (${keys.join(' · ')}) is shared with another field on the page — it could not be told apart next time` };
  const stable = unique.find(k => !looksGenerated(k));
  return stable ? { key: stable, stable: true } : { key: unique[0], stable: false };
}

/** saveLearned — the one save path (JA2's /cli/autofill/learn and the pick both call it). → { ok, origin, fieldKey, fieldType, learned } | { ok:false, error } */
function saveLearned(siteSettings, url, fieldKey, fieldType) {
  if (!siteSettings) return { ok: false, error: 'siteSettings unavailable' };
  fieldKey = String(fieldKey || '').trim().toLowerCase(); fieldType = String(fieldType || '').trim();
  if (!url) return { ok: false, error: 'no page url (open the application in a tab, or pass url)' };
  if (!fieldKey || !fieldType) return { ok: false, error: 'fieldKey and fieldType are required' };
  if (!siteSettings.set(url, M.learnKey(fieldKey), fieldType)) return { ok: false, error: `could not save for ${url}` };
  let origin = url; try { origin = new URL(url).origin; } catch (_) {}
  return { ok: true, origin, fieldKey, fieldType, learned: M.learnedFromSettings(siteSettings.getAllForOrigin(url)) };
}

function _guardianPicker() {
  try { return fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'guardian-picker.js'), 'utf8'); } catch (_) { return null; }
}
/** The Guardian picker in field mode, as src/providers/attention.js guardianPickScript runs it → Promise<{ xpath, tag, url } | { cancelled }>. */
function pickScript(label, pickerSource) {
  return `(() => { window.__gPickerNoAutostart = true;\n${pickerSource}\n;return window.__gPickerActive && window.__gPickerActive.pickField
    ? window.__gPickerActive.pickField('autofill', ${JSON.stringify(label)})
    : { cancelled: true, error: 'the Guardian picker did not start' }; })()`;
}
/** The picked node → the dom mesh's own field record (the one matchFields reads): the nearest input/textarea/select at or around it. */
function resolveScript(xpath) {
  return `(() => {
  if (!window.__cgDomMesh) return { error: 'the page has no dom mesh (reload the tab)' };
  let el = null; try { el = document.evaluate(${JSON.stringify(String(xpath))}, document, null, 9, null).singleNodeValue; } catch (_) {}
  if (el && el.nodeType !== 1) el = el.parentElement;
  if (!el) return { error: 'the picked element is no longer on the page — pick it again' };
  let f = el.closest('input, textarea, select');
  if (!f && el.tagName === 'LABEL') f = el.control || null;
  if (!f) { const inner = el.querySelectorAll('input, textarea, select'); if (inner.length === 1) f = inner[0]; }
  if (!f) return { error: 'that is a <' + el.tagName.toLowerCase() + '>, not a field you type into — pick the box itself' };
  f.setAttribute('data-cg-learn-pick', '1');
  try { return window.__cgDomMesh.queryOne('[data-cg-learn-pick]'); } finally { f.removeAttribute('data-cg-learn-pick'); }
})()`;
}

/**
 * pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType, agentId, profileId, label, fill, minConfidence, pickerSource })
 *   → { ok:true, fieldType, fieldKey, stable, cgId, origin, learned, fill? } | { ok:false, cancelled?, error }
 * wc: the application tab's webContents (executeJavaScript / getURL). fill (default true): fill the page again with the new map.
 */
async function pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType, agentId = 'default', profileId, label, fill = true, minConfidence = 'medium', pickerSource } = {}) {
  fieldType = String(fieldType || '').trim();
  if (!FIELD_TYPE_SET.has(fieldType)) return { ok: false, error: `unknown fieldType "${fieldType}" (GET /cli/autofill/field-types lists them)` };
  if (!wc || typeof wc.executeJavaScript !== 'function') return { ok: false, error: 'no tab to pick in (open the application in a tab)' };
  if (!siteSettings) return { ok: false, error: 'siteSettings unavailable' };
  const src = pickerSource === undefined ? _guardianPicker() : pickerSource;
  if (!src) return { ok: false, error: 'the Guardian picker (renderer/guardian-picker.js) could not be read' };
  let url = null; try { url = wc.getURL(); } catch (_) {}
  if (!url) return { ok: false, error: 'the tab has no page url' };

  let picked;
  try { picked = await wc.executeJavaScript(pickScript(label || `the ${fieldType} field`, src), true); }
  catch (e) { return { ok: false, error: `the picker could not run on the page: ${e.message}` }; }
  if (!picked || picked.cancelled) return { ok: false, cancelled: true, error: (picked && (picked.error || picked.why)) || 'cancelled — nothing saved' };
  if (!picked.xpath) return { ok: false, error: 'the picker returned no element' };

  let field;
  try { field = await wc.executeJavaScript(resolveScript(picked.xpath), true); }
  catch (e) { return { ok: false, error: `the pick could not be read on the page: ${e.message}` }; }
  if (!field || field.error) return { ok: false, error: (field && field.error) || 'the pick could not be read on the page' };
  if (!isFillable(field)) return { ok: false, error: `that is a ${field.type || field.tag} field, not one that takes text — pick the box itself` };

  let all = [];
  try { all = await dom.handleQuery({ agentId, selector: 'input, select, textarea' }); } catch (_) {}
  if (!Array.isArray(all)) all = [field];
  const k = chooseKey(field, all);
  if (k.error) return { ok: false, error: k.error };

  const saved = saveLearned(siteSettings, url, k.key, fieldType);
  if (!saved.ok) return saved;
  const out = { ok: true, fieldType, fieldKey: k.key, stable: k.stable, cgId: field.id, origin: saved.origin, learned: saved.learned,
    ...(k.stable ? {} : { warning: `"${k.key}" looks generated by the page — it may change, and then this field is asked again` }) };
  if (fill && dom && autofillStore) {
    try { out.fill = await M.fillFields(dom, autofillStore, { agentId, profileId, minConfidence, learned: saved.learned }); }
    catch (e) { out.fill = { error: e.message }; }
  }
  return out;
}

module.exports = { MODULE_ID, VERSION, FIELD_TYPE_SET, isFillable, needsPick, chooseKey, saveLearned, pickScript, resolveScript, pickAndLearn };
