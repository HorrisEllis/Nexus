'use strict';
/**
 * clear-glass/src/autofill/inline.js — puts the autofill chip (renderer/autofill-inline.js) on a person's page (AF3, 0.60.263)
 * comp_id: clear-glass.autofill.inline
 * Map: docs/2026-10-26-inline-autofill-ui-phasemap.spec (AF3)
 *
 * James, 2026-10-26: "When you click on name it will show autofill?" · "1".
 *
 * attach(wc, deps) — after a page loads: the fields (DomArchaeology.queryFieldsOf, the mesh injected if missing), matched to the ACTIVE
 * profile (AF1: store.activeProfile()) and what was learned for this site; medium confidence and up, never a password field. Each
 * matched field is tagged data-cg-af="<n>" (a bare number, no data). The chip and the values go into an ISOLATED world and a closed
 * shadow root, so the page's scripts never read the profile. Off when Settings says so (options.autofillInline === false) or the site
 * does (site settings autofill.inline = off). Nothing is filled until he clicks.
 */
const fs = require('fs');
const path = require('path');

const WORLD = 1087;   // this chip's isolated world
const SRC = path.join(__dirname, '..', '..', 'renderer', 'autofill-inline.js');
const RANK = { low: 1, medium: 2, high: 3 };

function _label(f) { return String(f.label || f.ariaLabel || f.placeholder || f.name || '').trim().slice(0, 40); }

/** plan(fields, profile, learned) → the chip's fields [{ n, cgId, fieldType, label, value }] — pure, for tests */
function plan(fields, profile, learned = null) {
  if (!Array.isArray(fields) || !profile) return [];
  const M = require('./matcher.js');
  const byId = new Map(fields.map(f => [f.id, f]));
  const out = [];
  for (const m of M.matchFields(fields, profile, { learned })) {
    const f = byId.get(m.cgId) || {};
    if ((RANK[m.confidence] || 0) < RANK.medium || m.needsEdit) continue;
    if (/password/i.test(String(f.type || '')) || m.value == null || String(m.value).trim() === '') continue;
    out.push({ n: out.length + 1, cgId: m.cgId, fieldType: m.fieldType, label: _label(f) || m.fieldType, value: String(m.value).slice(0, 500) });
  }
  return out;
}

async function attach(wc, { dom, store, siteSettings = null, options = null, log = () => {} } = {}) {
  if (!wc || wc.isDestroyed() || !dom || !store) return { ok: false, why: 'not wired' };
  const url = wc.getURL(); if (!/^https?:/i.test(url)) return { ok: false, why: 'not a web page' };
  try { if (options && options.get && options.get().autofillInline === false) return { ok: false, why: 'off in Settings' }; } catch (_) {}
  try { if (siteSettings && siteSettings.get(url, 'autofill.inline') === 'off') return { ok: false, why: 'off for this site' }; } catch (_) {}
  const act = store.activeProfile ? store.activeProfile() : { ok: false };
  if (!act || !act.ok) return { ok: false, why: 'no autofill profile' };
  const fields = await dom.queryFieldsOf(wc, { selector: 'input, select, textarea' });
  if (!Array.isArray(fields)) return { ok: false, why: (fields && fields.error) || 'no fields' };
  let learned = null; try { if (siteSettings) { const m = require('./matcher.js').learnedFromSettings(siteSettings.getAllForOrigin(url)); learned = Object.keys(m).length ? m : null; } } catch (_) {}
  const chip = plan(fields, act.profile, learned);
  if (!chip.length) return { ok: false, why: 'no field here takes the profile' };
  // tag the matched fields in the page's world (where the mesh's ids live): a bare number each, no data
  const tags = chip.map(c => [c.cgId, c.n]);
  await wc.executeJavaScript(`(t => { document.querySelectorAll('[data-cg-af]').forEach(e => e.removeAttribute('data-cg-af')); const all = [...document.querySelectorAll('input, select, textarea')]; for (const [cg, n] of t) { const el = all.find(e => e.__cgId === cg); if (el) el.setAttribute('data-cg-af', String(n)); } })(${JSON.stringify(tags)})`, false);
  const src = fs.readFileSync(SRC, 'utf8');
  const data = { fields: chip.map(({ cgId, ...rest }) => rest), profile: act.profile.label || '' };
  const r = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `${src}(${JSON.stringify(data)})` }], false);
  log(`[autofill-inline] ${chip.length} field(s) on ${new URL(url).host}`);
  return { ok: true, fields: chip.length, chip: r };
}

module.exports = { WORLD, plan, attach };
