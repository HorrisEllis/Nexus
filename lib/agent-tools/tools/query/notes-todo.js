'use strict';
/**
 * lib/agent-tools/tools/query/notes-todo.js — notes_todo tool
 * UUID: nexus-tool-notes-todo-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James: "take notes. to do list." Checked first:
 * zero hits anywhere in lib/ or copilot/ for a notes or todo primitive —
 * genuinely missing, not a duplicate of push-recall (that's semantic
 * chat-history recall, not a deliberate "remember this" write) or
 * propose_idea (that's a reviewed proposal with required evidence, a
 * heavier shape than "note this down"). One real table, two kinds
 * (note/todo), JAA-backed so it survives restart like everything else
 * durable in this codebase.
 *
 * "Poll" from the same request is NOT built here — genuinely ambiguous
 * in a single-user system (poll whom?) and no existing precedent to
 * compose from, unlike everything else this session. Flagged rather
 * than guessed at.
 */
const TABLE = 'notes_todos';
function _jaa() { try { return require('../../../../cortex/memory/jaa-db.js').jaaDB; } catch (_) { return null; } }

const ACTIONS = {
  add: (a) => {
    if (!a.text) return { error: 'add needs text' };
    const kind = a.kind === 'todo' ? 'todo' : 'note';
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    const row = {
      uuid: jaa.uid ? jaa.uid() : `${kind}-${Date.now()}`,
      kind, text: a.text, done: false,
      tags: a.tags || [], ts: Date.now(),
    };
    jaa.insert(TABLE, row);
    return { ok: true, [kind]: row };
  },

  list: (a) => {
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    let rows = jaa.query(TABLE, () => true, 2000) || [];
    if (a.kind) rows = rows.filter(r => r.kind === a.kind);
    if (a.done !== undefined) rows = rows.filter(r => !!r.done === !!a.done);
    return { ok: true, count: rows.length, items: rows.sort((x, y) => y.ts - x.ts) };
  },

  complete: (a) => {
    if (!a.uuid) return { error: 'complete needs uuid' };
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    const count = jaa.update(TABLE, r => r.uuid === a.uuid, { done: true, completedAt: Date.now() });
    return count > 0 ? { ok: true, completed: a.uuid } : { ok: false, error: `no item "${a.uuid}"` };
  },

  delete: (a) => {
    if (!a.uuid) return { error: 'delete needs uuid' };
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    const count = jaa.delete(TABLE, r => r.uuid === a.uuid);
    return count > 0 ? { ok: true, deleted: a.uuid } : { ok: false, error: `no item "${a.uuid}"` };
  },
};

module.exports = {
  name: 'notes_todo',
  description:
    'A real, persistent notes and to-do list. Actions: "add" (needs text; kind: "note" or "todo", ' +
    'default "note"; optional tags), "list" (optional kind/done filter), "complete" (needs uuid — marks a ' +
    'todo done), "delete" (needs uuid).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      text:   { type: 'string', description: 'for "add"' },
      kind:   { type: 'string', enum: ['note', 'todo'], description: 'for "add"/"list"' },
      tags:   { type: 'array', items: { type: 'string' }, description: 'for "add"' },
      done:   { type: 'boolean', description: 'for "list" — filter by completion' },
      uuid:   { type: 'string', description: 'for "complete"/"delete"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `notes_todo ${args.action} failed: ${e.message}` }; }
  },
};
