'use strict';
/**
 * clear-glass/src/autofill/transfer.js — the autofill data out to one file, and back in
 * comp_id: cg.autofill.transfer
 * Map: docs/2026-10-26-autofill-transfer-phasemap.spec (AT1; AT_D1 the file, AT_D2 how an import lands)
 *
 * James, 2026-10-26: "i want to be able to import and export the data."
 *
 * What travels (everything autofill keeps about him):
 *   profiles  AutofillStore's rows: label, fields, documents, id, createdAt, updatedAt
 *   learned   per site, what a field was learned as (site settings autofill.field.<key>) and its selector (autofill.selector.<key>)
 *   gig       the last gig written (AutofillStore getLastGig)
 *
 * The file is YAML (format clearglass.autofill/1, <date>.autofill), as his .gig is: readable, editable. JSON loads too.
 *
 *   exportAll({ store, siteSettings, now })               → { ok, text, filename, counts }
 *   parseTransfer(text)                                   → { ok, data, warnings } | { ok:false, error }
 *   importAll({ store, siteSettings, text, undoRows, now }) → { ok, counts, refused, warnings, undo: { at, counts } } | { ok:false, error }
 *   undoLast({ store, siteSettings, undoRows })           → { ok, restored } | { ok:false, error }
 *
 * An import merges (AT_D2): a profile with the same id is replaced only when the file's copy is newer; a new id is added as it is; a
 * learned field is set for its site; the file's gig becomes the last gig. What it replaces is kept first (undoRows, one JAA row), so
 * undoLast puts it back. Anything it cannot take (an unknown field, a row with no site) is refused and named (§1.2).
 */
const yaml = require('js-yaml');
const LP = require('./learn-pick.js');
const M = require('./matcher.js');

const MODULE_ID = 'cg.autofill.transfer';
const VERSION = '1.0.0';
const FORMAT = 'clearglass.autofill/1';
const EXT = '.autofill';
const SELECTOR_PREFIX = LP.SELECTOR_PREFIX;

function _day(now) { return new Date(now).toISOString().slice(0, 10); }

function exportAll({ store, siteSettings = null, now = Date.now() } = {}) {
  if (!store) return { ok: false, error: 'the autofill store is not loaded' };
  const profiles = store.listProfiles().map(p => ({ id: p.id, label: p.label, fields: { ...(p.fields || {}) }, documents: { ...(p.documents || {}) }, createdAt: p.createdAt || null, updatedAt: p.updatedAt || null }));
  const learned = siteSettings ? LP.listLearned(siteSettings).map(l => ({ origin: l.origin, fieldKey: l.fieldKey, fieldType: l.fieldType, ...(l.selector ? { selector: l.selector } : {}) })) : [];
  const gig = store.getLastGig ? store.getLastGig() : null;
  const body = { format: FORMAT, exportedAt: new Date(now).toISOString(), profiles, learned, ...(gig ? { gig } : {}) };
  const counts = { profiles: profiles.length, learned: learned.length, gig: gig ? 1 : 0 };
  const head = `# Clear Glass autofill data (${FORMAT}) — ${counts.profiles} profile(s), ${counts.learned} learned field(s)${gig ? ', the last gig' : ''}.\n` +
    `# Load it in Settings → Autofill → Import a file…  An import merges, and "Undo the last import" puts back what it replaced.\n`;
  return { ok: true, text: head + yaml.dump(body, { lineWidth: 120, noRefs: true }), filename: `autofill-${_day(now)}${EXT}`, counts, ...(siteSettings ? {} : { said: 'site settings unavailable: no learned fields exported' }) };
}

function parseTransfer(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, error: 'the file is empty' };
  let data = null;
  try { data = t.startsWith('{') ? JSON.parse(t) : yaml.load(t); } catch (e) { return { ok: false, error: `not an autofill file: ${e.message.split('\n')[0]}` }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'not an autofill file: no fields at the top' };
  const warnings = [];
  if (data.format !== FORMAT) {
    if (data.format === 'clearglass.gig/1' || (data.title && data.packages)) return { ok: false, error: 'this is a gig file: load it under Fiverr gigs → Load a gig file…' };
    if (!Array.isArray(data.profiles)) return { ok: false, error: `not an autofill file (format ${data.format ? `"${data.format}"` : 'missing'}, want ${FORMAT})` };
    warnings.push(`no format line (want ${FORMAT}); read as one`);
  }
  for (const k of ['profiles', 'learned']) if (data[k] != null && !Array.isArray(data[k])) return { ok: false, error: `${k} must be a list` };
  return { ok: true, data: { profiles: data.profiles || [], learned: data.learned || [], gig: data.gig || null }, warnings };
}

function _snapshot(store, siteSettings, learnedRows) {
  // what the import may replace: every profile, the gig, and the prior value of each learned key it touches
  const learned = [];
  if (siteSettings) for (const l of learnedRows) {
    const all = siteSettings.getAllForOrigin(l.origin) || {};
    learned.push({ origin: l.origin, fieldKey: l.fieldKey, fieldType: all[M.learnKey(l.fieldKey)] || null, selector: all[SELECTOR_PREFIX + l.fieldKey] || null });
  }
  return { profiles: store.listProfiles().map(p => JSON.parse(JSON.stringify(p))), gig: store.getLastGig ? store.getLastGig() : null, learned };
}

function importAll({ store, siteSettings = null, text, undoRows = null, now = Date.now() } = {}) {
  if (!store) return { ok: false, error: 'the autofill store is not loaded' };
  const p = parseTransfer(text);
  if (!p.ok) return p;
  const { profiles, learned, gig } = p.data;
  const refused = [], warnings = [...p.warnings];
  const okLearned = learned.filter(l => {
    const fine = l && l.origin && l.fieldKey && l.fieldType;
    if (!fine) refused.push({ what: 'learned', item: l && (l.fieldKey || l.origin) || '(empty row)', why: 'a learned field needs origin, fieldKey and fieldType' });
    return fine;
  });
  if (okLearned.length && !siteSettings) { warnings.push(`site settings unavailable: ${okLearned.length} learned field(s) not imported`); okLearned.length = 0; }
  const before = _snapshot(store, siteSettings, okLearned);
  const counts = { profilesAdded: 0, profilesReplaced: 0, profilesKept: 0, learned: 0, gig: 0 };
  for (const prof of profiles) {
    if (!prof || typeof prof !== 'object' || !prof.fields || typeof prof.fields !== 'object') { refused.push({ what: 'profile', item: (prof && (prof.label || prof.id)) || '(empty)', why: 'a profile needs its fields' }); continue; }
    const have = prof.id ? store.getProfile(prof.id) : null;
    if (have && (have.updatedAt || 0) >= (prof.updatedAt || 0)) { counts.profilesKept++; continue; }
    const r = store.putProfile(prof);
    if (r.error) { refused.push({ what: 'profile', item: prof.label || prof.id, why: r.error }); continue; }
    if (have) counts.profilesReplaced++; else counts.profilesAdded++;
  }
  for (const l of okLearned) {
    const r = LP.saveLearned(siteSettings, l.origin, l.fieldKey, l.fieldType);
    if (!r.ok) { refused.push({ what: 'learned', item: `${l.origin} ${l.fieldKey}`, why: r.error }); continue; }
    if (l.selector) siteSettings.set(l.origin, SELECTOR_PREFIX + String(l.fieldKey).trim().toLowerCase(), String(l.selector));
    counts.learned++;
  }
  if (gig) {
    if (gig.title && store.setLastGig && store.setLastGig(gig)) counts.gig = 1;
    else refused.push({ what: 'gig', item: (gig && gig.title) || '(untitled)', why: 'a gig needs a title' });
  }
  const changed = counts.profilesAdded + counts.profilesReplaced + counts.learned + counts.gig;
  let undo = null;
  if (changed && undoRows) { undoRows.replaceAll([{ id: 'last', at: now, before, counts }]); undo = { at: now, counts }; }
  else if (changed) warnings.push('no undo store: this import cannot be undone in one step');
  return { ok: true, counts, refused, warnings, undo };
}

function undoLast({ store, siteSettings = null, undoRows } = {}) {
  if (!store || !undoRows) return { ok: false, error: 'the autofill store is not loaded' };
  const row = (undoRows.load() || [])[0];
  if (!row || !row.before) return { ok: false, error: 'no import to undo' };
  const b = row.before;
  store.replaceProfiles(b.profiles || []);
  if (store.setLastGig) store.setLastGig(b.gig || null);
  let learned = 0;
  if (siteSettings) for (const l of b.learned || []) {
    const key = M.learnKey(l.fieldKey), sel = SELECTOR_PREFIX + String(l.fieldKey).trim().toLowerCase();
    if (l.fieldType) siteSettings.set(l.origin, key, l.fieldType); else siteSettings.deleteKey(l.origin, key);
    if (l.selector) siteSettings.set(l.origin, sel, l.selector); else { try { siteSettings.deleteKey(l.origin, sel); } catch (_) {} }
    learned++;
  }
  undoRows.replaceAll([]);
  return { ok: true, restored: { profiles: (b.profiles || []).length, gig: b.gig ? 1 : 0, learned }, importedAt: row.at };
}

module.exports = { MODULE_ID, VERSION, FORMAT, EXT, exportAll, parseTransfer, importAll, undoLast };
