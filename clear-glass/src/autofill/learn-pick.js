'use strict';
/**
 * clear-glass/src/autofill/learn-pick.js — JA3 (0.60.230): the element picker on a missed field. JA4 (0.60.231): what was learned,
 * listed, and forgotten. JA5 (0.60.232): the pick is also a macro and an automation node (his "as a macro or automation").
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
const VERSION = '1.2.0';   // 1.2.0 (0.60.232 JA5): the macro · 1.1.0 (0.60.231 JA4): list / forget
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

/**
 * §JA4 0.60.231 — what was learned, and its undo (§0.3 reversible). Over the store's own listOrigins / getAllForOrigin / deleteKey.
 * listLearned(siteSettings, url?) → [{ origin, fieldKey, fieldType }] — one site, or every site (only autofill.field.* keys)
 * forgetLearned(siteSettings, url, fieldKey) → { ok, origin, fieldKey, learned } | { ok:false, error } — removes that one entry only
 */
function listLearned(siteSettings, url = null) {
  if (!siteSettings) return [];
  const origins = url ? [url] : (siteSettings.listOrigins ? siteSettings.listOrigins() : []);
  const out = [];
  for (const o of origins) {
    let origin = o; try { origin = new URL(o).origin; } catch (_) {}
    const all = siteSettings.getAllForOrigin(o);
    for (const [fieldKey, fieldType] of Object.entries(M.learnedFromSettings(all))) out.push({ origin, fieldKey, fieldType, selector: all['autofill.selector.' + fieldKey] || null, macro: macroName(o) });
  }
  return out.sort((a, b) => a.origin.localeCompare(b.origin) || a.fieldKey.localeCompare(b.fieldKey));
}
function forgetLearned(siteSettings, url, fieldKey) {
  if (!siteSettings) return { ok: false, error: 'siteSettings unavailable' };
  fieldKey = String(fieldKey || '').trim().toLowerCase();
  if (!url || !fieldKey) return { ok: false, error: 'url and fieldKey are required' };
  let origin = url; try { origin = new URL(url).origin; } catch (_) {}
  if (!siteSettings.deleteKey(url, M.learnKey(fieldKey))) return { ok: false, error: `nothing learned as "${fieldKey}" for ${origin}` };
  try { siteSettings.deleteKey(url, SELECTOR_PREFIX + fieldKey); } catch (_) {}   // §JA5 — its selector goes with it
  return { ok: true, origin, fieldKey, learned: M.learnedFromSettings(siteSettings.getAllForOrigin(url)) };
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
  // the box's own positional xpath, counted by localName the way selector-check.js resolveXPath walks it (JA5: its selector)
  const xp = []; for (let n = f; n && n.nodeType === 1; n = n.parentElement) { const same = n.parentElement ? [...n.parentElement.children].filter(c => c.localName === n.localName) : [n]; xp.unshift(n.localName + '[' + (same.indexOf(n) + 1) + ']'); }
  f.setAttribute('data-cg-learn-pick', '1');
  try { const rec = window.__cgDomMesh.queryOne('[data-cg-learn-pick]'); return rec ? { ...rec, xpath: '/' + xp.join('/') } : rec; } finally { f.removeAttribute('data-cg-learn-pick'); }
})()`;
}

/**
 * §JA5 0.60.232 — James, 2026-10-19: "saves to per site settings, and as a macro or automation" · 2026-10-24: "yes make the macro too."
 * The pick's CSS selector comes from renderer/selector-check.js (key 'input': exactly one match, the editable box picked) and is kept per
 * site as autofill.selector.<fieldKey>. A site's macro is built from its learned fields that have one, saved through macro.js's own create,
 * and exported as a .macro node (the automation form). The profile's values never enter the macro: each step types a {{param}}.
 */
const SELECTOR_PREFIX = 'autofill.selector.';
const paramOf = (fieldType) => String(fieldType).replace(/[^\w]/g, '_');
function _checker() {
  try { return fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'selector-check.js'), 'utf8'); } catch (_) { return null; }
}
/** selectorScript(checkerSource, xpath) → the page's selector-check for that box, as an editable input: { ok, selector, matched } | { ok:false, why } */
function selectorScript(checkerSource, xpath) {
  return `(() => { ${checkerSource}\n;return window.__cgSelectorCheck ? window.__cgSelectorCheck.check(${JSON.stringify({ xpath: String(xpath), key: 'input' })}) : { ok: false, why: 'the selector check did not load' }; })()`;
}
function macroName(url) { let host = url; try { host = new URL(url).host; } catch (_) {} return `autofill ${host}`; }
/** macroFor(siteSettings, url) → { name, urlPattern, steps, params, description, left } — pure over the store (left: learned fields with no selector) */
function macroFor(siteSettings, url) {
  const all = siteSettings.getAllForOrigin(url) || {};
  let origin = url; try { origin = new URL(url).origin; } catch (_) {}
  const steps = [], params = [], left = [];
  for (const [fieldKey, fieldType] of Object.entries(M.learnedFromSettings(all)).sort(([a], [b]) => a.localeCompare(b))) {
    const selector = all[SELECTOR_PREFIX + fieldKey];
    if (!selector) { left.push(fieldKey); continue; }
    const param = paramOf(fieldType);
    steps.push({ action: 'type', data: { selector: String(selector), text: `{{${param}}}`, clearFirst: true } });
    if (!params.includes(param)) params.push(param);
  }
  return { name: macroName(url), urlPattern: `${origin}/*`, steps, params, left,
    description: `Autofill's learned fields for ${origin} (Clear Glass, from the element picker). Each step types a profile value given at run.` };
}
/** saveMacro(macroTool, siteSettings, url, { nodesDir }) → { ok, name, steps, params, left, node?, removed? } | { ok:false, error } — replaces the site's macro */
async function saveMacro(macroTool, siteSettings, url, { nodesDir = null } = {}) {
  if (!macroTool) return { ok: false, error: 'macro tool not available' };
  const m = macroFor(siteSettings, url);
  const had = await macroTool.execute({ action: 'get', name: m.name });
  if (had && had.ok) { const d = await macroTool.execute({ action: 'delete', name: m.name }); if (d && d.error) return { ok: false, error: `could not replace macro "${m.name}": ${d.error}` }; }
  if (!m.steps.length) return { ok: true, name: m.name, steps: 0, params: [], left: m.left, removed: !!(had && had.ok) };
  const c = await macroTool.execute({ action: 'create', name: m.name, urlPattern: m.urlPattern, steps: m.steps, params: m.params, description: m.description });
  if (!c || c.error) return { ok: false, error: `macro "${m.name}" not saved: ${(c && c.error) || 'no answer'}` };
  let node = null;
  if (nodesDir) { try { const x = await macroTool.execute({ action: 'export', name: m.name, dir: nodesDir }); node = (x && x.file) || null; } catch (_) {} }
  return { ok: true, name: m.name, steps: m.steps.length, params: m.params, left: m.left, node };
}

/**
 * pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType, agentId, profileId, label, fill, minConfidence, pickerSource })
 *   → { ok:true, fieldType, fieldKey, stable, cgId, origin, learned, fill? } | { ok:false, cancelled?, error }
 * wc: the application tab's webContents (executeJavaScript / getURL). fill (default true): fill the page again with the new map.
 */
async function pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType, agentId = 'default', profileId, label, fill = true, minConfidence = 'medium', pickerSource, checkerSource, macroTool = null, nodesDir = null } = {}) {
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

  // §JA5 — the box's selector (selector-check.js, as an input), kept per site; then the site's macro is rebuilt with it
  const chk = checkerSource === undefined ? _checker() : checkerSource;
  let sel = null;
  if (chk && field.xpath) { try { sel = await wc.executeJavaScript(selectorScript(chk, field.xpath), true); } catch (e) { sel = { ok: false, why: e.message }; } }
  if (sel && sel.ok && sel.selector) { siteSettings.set(url, SELECTOR_PREFIX + k.key, sel.selector); out.selector = sel.selector; }
  else { try { siteSettings.deleteKey(url, SELECTOR_PREFIX + k.key); } catch (_) {} out.selectorWhy = (sel && sel.why) || (chk ? 'the box gave no xpath' : 'selector-check.js could not be read'); }
  if (macroTool) out.macro = await saveMacro(macroTool, siteSettings, url, { nodesDir });
  if (fill && dom && autofillStore) {
    try { out.fill = await M.fillFields(dom, autofillStore, { agentId, profileId, minConfidence, learned: saved.learned }); }
    catch (e) { out.fill = { error: e.message }; }
  }
  return out;
}

module.exports = { MODULE_ID, VERSION, FIELD_TYPE_SET, SELECTOR_PREFIX, isFillable, needsPick, chooseKey, saveLearned, listLearned, forgetLearned, pickScript, resolveScript, selectorScript, macroName, macroFor, saveMacro, pickAndLearn };
