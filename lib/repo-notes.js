'use strict';
/**
 * lib/repo-notes.js — notes: on a repo, or on nothing in particular, so nothing he thinks of is lost.
 * component_id: lib.repo-notes
 *
 * James, 2026-10-13: "this is what i mean by i need to be able to log these somewhere, its too much. like can we have a
 * notes or something section for the repos so i can note all of this down? im out of ideas"
 *
 * One table (cortex jaaDB `repo_notes`), one writer (this file). A note is { id, repoUuid (null: not about a repo),
 * kind, title, body, tags, status, pinned, source, createdAt, updatedAt }:
 *   kind    note · idea · decision · todo · question · quote — a decision or a quote is his word on something, kept as
 *           said (docs/CLAUDE.md: quote him, with context)
 *   status  open · done (a todo ticked, a question answered) · archived (nothing is deleted — §0.3; archive hides it)
 *   source  'james' when he wrote it, an agent's name when an agent did — the list says which
 * Search is plain words over title, body and tags. Agents read and add through the same routes and commands he uses.
 */
const crypto = require('crypto');

const MODULE_ID = 'lib.repo-notes';
const VERSION = '1.0.0';
const TABLE = 'repo_notes';
const KINDS = Object.freeze(['note', 'idea', 'decision', 'todo', 'question', 'quote']);
const STATUSES = Object.freeze(['open', 'done', 'archived']);
const MAX_BODY = 20000;

function _jaa() { return require('../cortex/memory/jaa-db.js').jaaDB; }
const _now = () => Date.now();
const _tags = (t) => [...new Set((Array.isArray(t) ? t : String(t || '').split(','))
  .map(x => String(x).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 20);
function _titleOf(body) { const first = String(body || '').split('\n').find(l => l.trim()) || ''; return first.replace(/^#+\s*/, '').trim().slice(0, 120); }

function _check({ kind, status, body }) {
  if (kind !== undefined && !KINDS.includes(kind)) return `kind must be one of ${KINDS.join(', ')}`;
  if (status !== undefined && !STATUSES.includes(status)) return `status must be one of ${STATUSES.join(', ')}`;
  if (body !== undefined && String(body).length > MAX_BODY) return `a note is at most ${MAX_BODY} characters — split it`;
  return null;
}

/** add({ repoUuid, body, title, kind, tags, source, pinned }) → the note */
function add({ repoUuid = null, body = '', title = '', kind = 'note', tags = [], source = 'james', pinned = false } = {}) {
  const text = String(body || '').trim();
  if (!text && !String(title || '').trim()) throw Object.assign(new Error('a note needs some words'), { status: 400 });
  const bad = _check({ kind, body: text });
  if (bad) throw Object.assign(new Error(bad), { status: 400 });
  const t = _now();
  const row = { id: `note-${crypto.randomBytes(5).toString('hex')}`, repoUuid: repoUuid || null, kind, title: String(title || '').trim().slice(0, 160) || _titleOf(text),
    body: text, tags: _tags(tags), status: 'open', pinned: !!pinned, source: String(source || 'james').slice(0, 60), createdAt: t, updatedAt: t };
  _jaa().insert(TABLE, row);
  return row;
}

/** list({ repoUuid, all, q, kind, status, limit }) → notes, pinned first then newest. repoUuid '*' or all:true = every note */
function list({ repoUuid = null, all = false, q = null, kind = null, status = null, tag = null, limit = 200 } = {}) {
  let rows = _jaa().query(TABLE, {}, { limit: 100000 }) || [];
  if (!(all || repoUuid === '*')) rows = rows.filter(r => (r.repoUuid || null) === (repoUuid || null));
  if (status) rows = rows.filter(r => r.status === status);
  else rows = rows.filter(r => r.status !== 'archived');
  if (kind) rows = rows.filter(r => r.kind === kind);
  if (tag) rows = rows.filter(r => (r.tags || []).includes(String(tag).toLowerCase()));
  if (q) {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter(r => { const hay = `${r.title} ${r.body} ${(r.tags || []).join(' ')}`.toLowerCase(); return words.every(w => hay.includes(w)); });
  }
  rows.sort((a, b) => (b.pinned - a.pinned) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
  return rows.slice(0, Math.max(1, Math.min(1000, limit)));
}

function get(id) { return _jaa().get(TABLE, { id: String(id) }) || null; }

/** update(id, { body, title, kind, tags, status, pinned, repoUuid }) → the note */
function update(id, patch = {}) {
  const cur = get(id);
  if (!cur) throw Object.assign(new Error(`no note ${id}`), { status: 404 });
  const bad = _check(patch);
  if (bad) throw Object.assign(new Error(bad), { status: 400 });
  const next = {};
  if (patch.body !== undefined) { next.body = String(patch.body).trim(); if (patch.title === undefined && (!cur.title || cur.title === _titleOf(cur.body))) next.title = _titleOf(next.body); }
  if (patch.title !== undefined) next.title = String(patch.title).trim().slice(0, 160);
  if (patch.kind !== undefined) next.kind = patch.kind;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.pinned !== undefined) next.pinned = !!patch.pinned;
  if (patch.tags !== undefined) next.tags = _tags(patch.tags);
  if (patch.repoUuid !== undefined) next.repoUuid = patch.repoUuid || null;
  next.updatedAt = _now();
  _jaa().update(TABLE, { id: cur.id }, next);
  return { ...cur, ...next };
}

/** counts(repoUuid) → { open, todo, question, idea, decision } for a badge */
function counts(repoUuid = null) {
  const rows = list({ repoUuid, limit: 1000 });
  const c = { open: rows.filter(r => r.status === 'open').length };
  for (const k of KINDS) c[k] = rows.filter(r => r.kind === k && r.status === 'open').length;
  return c;
}

module.exports = { MODULE_ID, VERSION, TABLE, KINDS, STATUSES, add, list, get, update, counts };
