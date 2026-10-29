'use strict';
/**
 * lib/opportunity/contacts.js — the people and addresses behind each application. 0.60.281 (AP2).
 * comp_id: nexus.lib.opportunity.contacts
 * Version: 1.0.0
 *
 * James, 2026-10-29: "also capturing the contact info for job applications."
 *
 * One row per contact in opportunity_contacts (store.js T.contacts): company, name, role, email, phone, site, the job it belongs to (oppId,
 * oppTitle), status, source, the page it came from, when. The rules (docs/2026-10-29-gigs-contacts-snowflake-phasemap.spec):
 *   - AP_D3 capture only what the page shows: mailto:/tel: links, e-mail addresses and phone numbers in the page text, the company the
 *     page names. Nothing is guessed; each row says its source ('page' | 'hand') and the page.
 *   - A contact already held (same email, or same phone, for the same job) is not added twice; a capture fills only its empty fields, never
 *     overwrites what he typed.
 *   - Archived, never deleted (§0.3). Every add, edit and archive is a line in the opportunity ledger.
 *   - status: his own word for it when he sets one; else the job's stage.
 */

const crypto = require('crypto');
const { T, jaa, ledger } = require('./store');

const FIELDS = ['company', 'name', 'role', 'email', 'phone', 'site', 'linkedin', 'notes', 'status'];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// a phone: + or ( or a digit, then 9–15 digits with spaces, dots, dashes or brackets between; dates and prices are filtered after
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?/g;
// addresses a person never answers
const NOREPLY = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|notifications?)@|@(example|sentry|wixpress)\./i;

function _clean(s, max = 200) { return s == null ? null : (String(s).replace(/\s+/g, ' ').trim().slice(0, max) || null); }
function _digits(p) { return String(p || '').replace(/\D/g, ''); }
function _email(e) { const s = _clean(e, 160); return s ? s.toLowerCase().replace(/^mailto:/, '').split('?')[0] : null; }

/**
 * fromPage(page, { company }) → [{ email?, phone?, name?, how }] — what the page itself shows, never more.
 * page: Clear Glass's read (url, text, links: [{ text, href }]).
 */
function fromPage(page = {}, { company = null } = {}) {
  const out = [], seen = new Set();
  const add = (c) => {
    const key = c.email ? `e:${c.email}` : `p:${_digits(c.phone)}`;
    if (seen.has(key)) return; seen.add(key); out.push({ company: _clean(company), ...c });
  };
  for (const l of page.links || []) {
    const href = String(l.href || l.url || '');
    if (/^mailto:/i.test(href)) { const email = _email(href); if (email && !NOREPLY.test(email)) add({ email, name: _nameFrom(l.text, email), how: 'mailto link' }); }
    else if (/^tel:/i.test(href)) { const phone = _clean(decodeURIComponent(href.slice(4)), 40); if (_digits(phone).length >= 7) add({ phone, how: 'tel link' }); }
  }
  const text = String(page.text || '').slice(0, 60000);
  for (const m of text.match(EMAIL_RE) || []) { const email = _email(m); if (email && !NOREPLY.test(email) && !/\.(png|jpe?g|gif|svg|webp)$/i.test(email)) add({ email, how: 'in the page text' }); }
  for (const m of text.match(PHONE_RE) || []) {
    const d = _digits(m);
    if (d.length < 9 || d.length > 15) continue;                         // too short for a phone, or a long id
    if (/^(19|20)\d{2}[\s.-]\d{1,2}[\s.-]\d{1,2}$/.test(m.trim())) continue;   // a date
    add({ phone: _clean(m, 40), how: 'in the page text' });
  }
  return out;
}

/** a mailto link's text is a name when it is not the address itself and reads like a name */
function _nameFrom(text, email) {
  const t = _clean(text, 80);
  if (!t || t.toLowerCase() === email || /@|https?:|^(e-?mail|contact|apply|send|click)/i.test(t)) return null;
  return /^[\p{L}][\p{L}' .-]{1,60}$/u.test(t) ? t : null;
}

function list({ oppId = null, includeArchived = false, q = null } = {}) {
  const needle = q ? String(q).toLowerCase() : null;
  return jaa().query(T.contacts, r => (!oppId || r.oppId === oppId) && (includeArchived || !r.archived)
    && (!needle || FIELDS.concat(['oppTitle']).some(k => r[k] && String(r[k]).toLowerCase().includes(needle))))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function get(id) { return id ? jaa().get(T.contacts, { id }) : null; }

function _same(a, b) {
  if (a.oppId !== b.oppId) return false;
  if (a.email && b.email) return a.email === b.email;
  if (a.phone && b.phone) return _digits(a.phone) === _digits(b.phone);
  return false;
}

/**
 * add(c, { by, source }) — a contact by hand (source 'hand') or from a page (source 'page'). Needs a way to reach someone: an email, a
 * phone, a name, or a site. One the job already holds is merged: its empty fields filled, nothing he typed overwritten.
 */
function add(c = {}, { by = 'user', source = 'hand' } = {}) {
  const row = { oppId: c.oppId || null, oppTitle: _clean(c.oppTitle), pageUrl: _clean(c.pageUrl, 500), how: _clean(c.how, 60) };
  for (const k of FIELDS) row[k] = k === 'email' ? _email(c[k]) : _clean(c[k], k === 'notes' ? 2000 : 200);
  if (!row.email && !row.phone && !row.name && !row.site && !row.linkedin) return { ok: false, error: 'a contact needs an email, a phone, a name, a site or a LinkedIn' };
  if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return { ok: false, error: `"${row.email}" is not an email address` };
  if (row.oppId && !row.oppTitle) { try { const o = jaa().get(T.opps, { id: row.oppId }); if (o) { row.oppTitle = o.title || null; row.company = row.company || o.company || null; } } catch (_) {} }
  const held = list({ oppId: row.oppId, includeArchived: true }).find(x => _same(x, row));
  if (held) {
    const fill = {};
    for (const k of FIELDS.concat(['oppTitle', 'pageUrl'])) if (row[k] && !held[k]) fill[k] = row[k];
    if (by === 'user' && source === 'hand') for (const k of FIELDS) if (row[k] && row[k] !== held[k]) fill[k] = row[k];   // his own word wins
    if (!Object.keys(fill).length) return { ok: true, contact: held, deduped: true };
    jaa().update(T.contacts, { id: held.id }, { ...fill, updatedAt: Date.now() });
    ledger('contact.merged', { oppId: held.oppId, shape: 'contact', tags: [source, by], context: { id: held.id, fields: Object.keys(fill) } });
    return { ok: true, contact: get(held.id), merged: Object.keys(fill) };
  }
  const now = Date.now();
  const contact = { id: crypto.randomUUID(), ...row, source: source === 'page' ? 'page' : 'hand', by, archived: false, createdAt: now, updatedAt: now };
  jaa().insert(T.contacts, contact);
  ledger('contact.added', { oppId: contact.oppId, shape: 'contact', tags: [contact.source, by], context: { id: contact.id, how: contact.how } });
  return { ok: true, contact, created: true };
}

/** update(id, patch, { by }) — his edit; only the contact's own fields change. */
function update(id, patch = {}, { by = 'user' } = {}) {
  const c = get(id);
  if (!c) return { ok: false, error: `no contact ${id}` };
  const set = {};
  for (const k of FIELDS) if (k in patch) set[k] = k === 'email' ? _email(patch[k]) : _clean(patch[k], k === 'notes' ? 2000 : 200);
  if ('oppId' in patch) set.oppId = patch.oppId || null;
  if (set.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(set.email)) return { ok: false, error: `"${set.email}" is not an email address` };
  if (!Object.keys(set).length) return { ok: false, error: `nothing to change — fields: ${FIELDS.join(', ')}, oppId` };
  jaa().update(T.contacts, { id }, { ...set, updatedAt: Date.now() });
  ledger('contact.edited', { oppId: c.oppId, shape: 'contact', tags: [by], context: { id, fields: Object.keys(set) } });
  return { ok: true, contact: get(id) };
}

/** archive(id, { by, archived }) — out of the list, never deleted (§0.3); archived:false brings it back. */
function archive(id, { by = 'user', archived = true } = {}) {
  const c = get(id);
  if (!c) return { ok: false, error: `no contact ${id}` };
  jaa().update(T.contacts, { id }, { archived: !!archived, archivedAt: archived ? Date.now() : null, updatedAt: Date.now() });
  ledger(archived ? 'contact.archived' : 'contact.restored', { oppId: c.oppId, shape: 'contact', tags: [by], context: { id } });
  return { ok: true, contact: get(id) };
}

/** captureFor(opp, page) — the page's contacts onto the job, source 'page'. Returns { added, merged, held, found }. */
function captureFor(opp, page) {
  const found = fromPage(page, { company: opp && opp.company });
  const r = { found: found.length, added: 0, merged: 0, held: 0, contacts: [] };
  for (const f of found) {
    const a = add({ ...f, oppId: opp && opp.id, oppTitle: opp && opp.title, pageUrl: page && page.url }, { by: 'agent', source: 'page' });
    if (!a.ok) continue;
    if (a.created) r.added++; else if (a.merged) r.merged++; else r.held++;
    r.contacts.push(a.contact.id);
  }
  return r;
}

/** withStatus(contact) — his status when set, else the job's stage */
function withStatus(c) {
  if (!c || c.status || !c.oppId) return c;
  try { const o = jaa().get(T.opps, { id: c.oppId }); return o ? { ...c, status: o.stage, statusFrom: 'the job' } : c; } catch (_) { return c; }
}

module.exports = { FIELDS, fromPage, list, get, add, update, archive, captureFor, withStatus, MODULE_ID: 'nexus.lib.opportunity.contacts' };
