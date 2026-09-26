'use strict';
// ── lib/quick-notes.js ──────────────────────────────────────────────────────
// UUID: nexus-quick-notes-v1-0000-3500-0000-000000000001
// Version: 1.0.0
// Phase: 35 — Quick Notes: Synchronized Across All Pills
//
// HTTP-layer agnostic by design — orchestrator.js wires real jaaDB, real
// broadcast(), and the already-verified POST /api/idearium/ideas proxy in;
// this module never imports orchestrator or makes assumptions about
// transport, so it's fully testable without a live server (see
// tests/modules/quick-notes.test.js).
//
// Scope note: the 300ms typing debounce described in docs/home-ui.spec is
// a client-side UI concern (don't fire a request per keystroke) — this
// module only implements the backend create/list/delete + broadcast +
// tag-to-idea surface. The debounce has nothing to verify server-side.

const crypto = require('crypto');

const MODULE_ID = 'quick-notes';
const VERSION   = '1.0.0';
const TABLE     = 'quick_notes';

let _jaa = null;
let _broadcast = () => {};
let _postIdea = null; // async ({text, tags}) => result — injected, not imported

function init(jaaDB, opts = {}) {
  _jaa = jaaDB;
  _broadcast = typeof opts.broadcast === 'function' ? opts.broadcast : () => {};
  _postIdea  = typeof opts.postIdea === 'function' ? opts.postIdea : null;
  return { ok: true };
}

function listNotes() {
  if (!_jaa) return [];
  try {
    return _jaa.query(TABLE, () => true, 200)
      .filter(n => !n.deleted)
      .sort((a, b) => b.ts - a.ts);
  } catch (_) {
    return [];
  }
}

async function createNote({ text, tags = [] }) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'text is required' };
  }
  if (!_jaa) return { ok: false, error: 'quick-notes not initialized' };

  const note = {
    uuid: crypto.randomUUID(),
    text: text.trim(),
    tags: Array.isArray(tags) ? tags : [],
    ts: Date.now(),
    deleted: false,
  };

  try {
    _jaa.insert(TABLE, note);
  } catch (e) {
    return { ok: false, error: `storage failed: ${e.message}` };
  }

  // Broadcast first — every connected pill should see the note immediately,
  // regardless of whether the optional idea-tagging step below succeeds.
  try { _broadcast({ type: 'notes.created', note }); } catch (_) {}

  let idea = null;
  if (note.tags.length && _postIdea) {
    try {
      idea = await _postIdea({ text: note.text, tags: note.tags });
    } catch (e) {
      idea = { ok: false, error: e.message };
    }
  }

  return { ok: true, note, idea };
}

async function deleteNote(uuid) {
  if (!_jaa) return { ok: false, error: 'quick-notes not initialized' };
  try {
    const existing = _jaa.query(TABLE, n => n.uuid === uuid, 1)[0];
    if (!existing) return { ok: false, error: 'note not found' };
    _jaa.update(TABLE, existing.uuid, { ...existing, deleted: true });
    try { _broadcast({ type: 'notes.deleted', uuid }); } catch (_) {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { init, listNotes, createNote, deleteNote, MODULE_ID, VERSION };
