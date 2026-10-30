'use strict';
/**
 * clear-glass/src/autofill/portfolio.js — his portfolio, kept as rows and portable as one .portfolio file (PF1, 0.60.299).
 * comp_id: cg.autofill.portfolio · owner: Clear Glass (autofill content) · schema: lib/node-schemas/schema.portfolio
 * Map: docs/2026-10-30-portfolio-node-per-site-ui-macros-phasemap.spec (PF1; PF_D1 it is Clear Glass autofill's, like .gig/.autofill)
 *
 * James, 2026-10-30: "make a .portfolio node, all nodes are physical files in the backend. import and export. and add per site support."
 *
 * A portfolio is his seller/job-hunt CONTENT: a name, the seller-profile fields (headline, bio, skills) and a list of project items
 * (title, role, description, skills, link, date), optionally tied to a site (PF2). It is NOT an automation node — it lives with autofill
 * (sovereignty §5.15), kept in JAA (cg_portfolio) like AutofillStore's profiles, and travels as a clearglass.portfolio/1 file like .gig.
 *
 *   PortfolioStore: load, list(), get(id), create({name, ...}), update(id, patch), remove(id)  — rows in JAA
 *   exportNode(store, ids?)      → { ok, text, filename, count }           the .portfolio file (YAML; JSON loads too)
 *   parsePortfolio(text)         → { ok, data, warnings } | { ok:false, error }
 *   importNode({ store, text })  → { ok, imported, errors }                upsert by id, newer-wins; a bad item is refused, not half-stored
 */
const path = require('path');
const yaml = require('js-yaml');
const { JaaRows } = require('../storage/jaa');
const { randomUUID } = require('crypto');

const FORMAT = 'clearglass.portfolio/1';
const EXT = '.portfolio';
const NAME_MAX = 80;

function _slug(s) { return String(s || 'portfolio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'portfolio'; }
function _day(now) { return new Date(now).toISOString().slice(0, 10); }

// §PF1 — an item is valid only with a title; the other fields are free text. Returns { ok } | { error }.
function _validateItems(items) {
  if (items == null) return { ok: true };
  if (!Array.isArray(items)) return { error: 'items must be a list of projects' };
  for (const it of items) {
    if (!it || typeof it !== 'object') return { error: 'each item must be a project object' };
    if (!String(it.title || '').trim()) return { error: 'each portfolio item needs a title' };
  }
  return { ok: true };
}
function _cleanItems(items) {
  return (Array.isArray(items) ? items : []).map(it => ({
    title: String(it.title || '').trim(),
    ...(it.role ? { role: String(it.role) } : {}),
    ...(it.description ? { description: String(it.description) } : {}),
    ...(it.skills ? { skills: String(it.skills) } : {}),
    ...(it.link ? { link: String(it.link) } : {}),
    ...(it.date ? { date: String(it.date) } : {}),
  })).filter(it => it.title);
}

class PortfolioStore {
  constructor() { this.data = { portfolios: {} }; }
  _rows() { return this._jaa || (this._jaa = new JaaRows('cg_portfolio', {})); }
  load() {
    const portfolios = {};
    for (const p of this._rows().load()) portfolios[p.id] = p;
    this.data = { portfolios };
    return { ...this.data };
  }
  _persist() {
    this._rows().replaceAll(Object.values(this.data.portfolios || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  }
  list() { return Object.values(this.data.portfolios || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); }
  get(id) { return this.data.portfolios?.[id] || null; }

  create({ name, headline, bio, skills, site, items } = {}) {
    const chk = _validateItems(items); if (chk.error) return chk;
    const id = randomUUID(); const now = Date.now();
    const rec = {
      id, name: String(name || `Portfolio ${this.list().length + 1}`).slice(0, NAME_MAX),
      ...(headline ? { headline: String(headline) } : {}),
      ...(bio ? { bio: String(bio) } : {}),
      ...(skills ? { skills: String(skills) } : {}),
      ...(site ? { site: String(site) } : {}),
      items: _cleanItems(items),
      createdAt: now, updatedAt: now,
    };
    this.data = { ...this.data, portfolios: { ...this.data.portfolios, [id]: rec } };
    this._persist();
    return { ...rec };
  }
  update(id, patch = {}) {
    const existing = this.data.portfolios?.[id];
    if (!existing) return { error: `no portfolio "${id}"` };
    if (patch.items !== undefined) { const chk = _validateItems(patch.items); if (chk.error) return chk; }
    const updated = {
      ...existing,
      ...(patch.name !== undefined ? { name: String(patch.name).slice(0, NAME_MAX) } : {}),
      ...(patch.headline !== undefined ? { headline: String(patch.headline) } : {}),
      ...(patch.bio !== undefined ? { bio: String(patch.bio) } : {}),
      ...(patch.skills !== undefined ? { skills: String(patch.skills) } : {}),
      ...(patch.site !== undefined ? { site: patch.site ? String(patch.site) : null } : {}),
      ...(patch.items !== undefined ? { items: _cleanItems(patch.items) } : {}),
      updatedAt: Date.now(),
    };
    this.data = { ...this.data, portfolios: { ...this.data.portfolios, [id]: updated } };
    this._persist();
    return { ...updated };
  }
  remove(id) {
    if (!this.data.portfolios?.[id]) return { error: `no portfolio "${id}"` };
    const { [id]: _gone, ...rest } = this.data.portfolios;
    this.data = { ...this.data, portfolios: rest };
    this._persist();
    return { ok: true, id };
  }
}

function exportNode(store, ids = null, { now = Date.now() } = {}) {
  if (!store) return { ok: false, error: 'the portfolio store is not loaded' };
  const all = store.list();
  const pick = Array.isArray(ids) && ids.length ? all.filter(p => ids.includes(p.id)) : all;
  const portfolios = pick.map(p => ({ id: p.id, name: p.name, ...(p.headline ? { headline: p.headline } : {}), ...(p.bio ? { bio: p.bio } : {}),
    ...(p.skills ? { skills: p.skills } : {}), ...(p.site ? { site: p.site } : {}), items: p.items || [], createdAt: p.createdAt || null, updatedAt: p.updatedAt || null }));
  const body = { format: FORMAT, exportedAt: new Date(now).toISOString(), portfolios };
  const head = `# Clear Glass portfolio file (${FORMAT}) — ${portfolios.length} portfolio(s).\n` +
    `# Load it in Settings → Autofill → Portfolio → Import a file…  An import merges by id (newer wins).\n`;
  return { ok: true, text: head + yaml.dump(body, { lineWidth: 120, noRefs: true }), filename: `${_slug(portfolios[0] && portfolios[0].name)}-${_day(now)}${EXT}`, count: portfolios.length };
}

function parsePortfolio(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, error: 'the file is empty' };
  let data = null;
  try { data = t.startsWith('{') ? JSON.parse(t) : yaml.load(t); } catch (e) { return { ok: false, error: `not a portfolio file: ${e.message.split('\n')[0]}` }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'not a portfolio file: no fields at the top' };
  const warnings = [];
  if (data.format !== FORMAT) {
    if (!Array.isArray(data.portfolios) && !(data.name && (data.items || data.headline))) return { ok: false, error: `not a portfolio file (format ${data.format ? `"${data.format}"` : 'missing'}, want ${FORMAT})` };
    warnings.push(`no format line (want ${FORMAT}); read as one`);
  }
  let list;
  if (Array.isArray(data.portfolios)) list = data.portfolios;
  else if (data.name || data.items || data.headline) list = [data];   // a single bare portfolio
  else return { ok: false, error: 'no portfolios found' };
  return { ok: true, data: { portfolios: list.filter(x => x && typeof x === 'object') }, warnings };
}

function importNode({ store, text, now = Date.now() } = {}) {
  if (!store) return { ok: false, error: 'the portfolio store is not loaded' };
  const p = parsePortfolio(text);
  if (!p.ok) return p;
  const imported = [], errors = [];
  for (const rec of p.data.portfolios) {
    const name = String(rec.name || '').trim() || 'Portfolio';
    const itemChk = _validateItems(rec.items);
    if (itemChk.error) { errors.push({ name, error: itemChk.error }); continue; }
    const have = rec.id ? store.get(rec.id) : null;
    if (have && (have.updatedAt || 0) >= (rec.updatedAt || now)) { imported.push({ id: have.id, name, kept: true }); continue; }
    if (have) {
      const r = store.update(have.id, { name, headline: rec.headline, bio: rec.bio, skills: rec.skills, site: rec.site, items: rec.items });
      if (r.error) errors.push({ name, error: r.error }); else imported.push({ id: r.id, name: r.name, updated: true });
    } else {
      const r = store.create({ name, headline: rec.headline, bio: rec.bio, skills: rec.skills, site: rec.site, items: rec.items });
      if (r.error) errors.push({ name, error: r.error }); else imported.push({ id: r.id, name: r.name, added: true });
    }
  }
  return { ok: errors.length === 0, imported, errors, warnings: p.warnings };
}

module.exports = { PortfolioStore, exportNode, parsePortfolio, importNode, FORMAT, EXT, NAME_MAX };
