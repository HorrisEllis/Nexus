'use strict';
/**
 * lib/component-registry.js — NEXUS Component Registry
 * UUID: nexus-component-registry-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * The self-describing kernel of the NEXUS UI architecture.
 * Every capability in NEXUS is a Component.
 * The registry is the source of truth. CLI and shell are consumers.
 *
 * Authority chain:
 *   Registry  ← source of truth
 *     ↑ CLI       ← reads /api/components/grammar, builds trie
 *       ↑ Shell   ← reads /api/components, renders system map
 *
 * §1.1  validate() before every write — nothing trusted until proven
 * §1.2  every error is logged and returned — nothing swallowed
 * §2.1  JAA write before in-memory index update — disk first
 * §5.1  every component carries UUID + event hooks
 *
 * Modules:
 *   registry-schema  — validation, coercion, id format
 *   registry-store   — JAA persistence + in-memory index
 *   registry-grammar — grammar tree builder and cache
 *   registry-api     — 8 HTTP endpoints, mounted on orchestrator
 *   registry-boot    — boot phase + system online/offline lifecycle
 */

const crypto = require('crypto');

const MODULE_ID = 'component-registry';
const VERSION   = '1.0.0';

// ══ SCHEMA ════════════════════════════════════════════════════════════════════
// CR-004: id format: namespace.name — dot-separated, lowercase
const ID_PATTERN     = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/;
const VALID_METHODS  = new Set(['GET','POST','PUT','DELETE','PATCH']);
const VALID_TYPES    = new Set(['string','number','boolean','enum','json']);
const VALID_RENDERS  = new Set(['table','json','text','panel','none']);
const VALID_HOOK_ON  = new Set(['success','failure','always']);

const REQUIRED_FIELDS = ['id','namespace','name','version','grammar','route','description'];

function _validateId(id) {
  if (!id || typeof id !== 'string') return 'id is required and must be a string';
  if (!ID_PATTERN.test(id))          return `id must match namespace.name format (lowercase, dots). got: "${id}"`;
  return null;
}

function _coerce(raw) {
  const c = { ...raw };
  // Defaults for optional fields
  if (!c.params)       c.params       = [];
  if (!c.hooks)        c.hooks        = [];
  if (!c.permissions)  c.permissions  = ['system'];
  if (!c.tags)         c.tags         = [];
  if (!c.examples)     c.examples     = [];
  if (!c.events)       c.events       = { emits:[], listensTo:[] };
  if (!c.events.emits)      c.events.emits      = [];
  if (!c.events.listensTo)  c.events.listensTo  = [];
  if (!c.returns)      c.returns      = { type:'object', render:'json' };
  if (c.available    === undefined) c.available    = true;
  if (c.deprecated   === undefined) c.deprecated   = false;
  if (!c.deprecatedBy) c.deprecatedBy = null;
  if (!c.registeredBy) c.registeredBy = null;
  if (!c.uuid)         c.uuid         = crypto.randomUUID();
  if (!c.registeredAt) c.registeredAt = Date.now();
  c.updatedAt = Date.now();
  return c;
}

function validate(component) {
  const errors = [];
  if (!component || typeof component !== 'object') {
    return { ok:false, errors:['component must be an object'] };
  }

  // Required fields
  for (const f of REQUIRED_FIELDS) {
    if (component[f] === undefined || component[f] === null || component[f] === '') {
      errors.push(`${f} is required`);
    }
  }

  // id format (CR-004)
  const idErr = _validateId(component.id);
  if (idErr) errors.push(idErr);

  // namespace must match id prefix
  if (component.id && component.namespace &&
      !component.id.startsWith(component.namespace + '.')) {
    errors.push(`namespace "${component.namespace}" must match id prefix of "${component.id}"`);
  }

  // grammar must be non-empty array
  if (!Array.isArray(component.grammar) || component.grammar.length < 1) {
    errors.push('grammar must be a non-empty array of strings');
  }

  // route validation
  if (component.route) {
    if (!VALID_METHODS.has(component.route.method)) {
      errors.push(`route.method must be one of ${[...VALID_METHODS].join(',')}`);
    }
    if (!component.route.path) errors.push('route.path is required');
  }

  // params validation
  if (Array.isArray(component.params)) {
    for (const [i, p] of component.params.entries()) {
      if (!p.name) errors.push(`params[${i}].name is required`);
      if (!VALID_TYPES.has(p.type)) {
        errors.push(`params[${i}].type must be one of ${[...VALID_TYPES].join(',')}`);
      }
      if (p.type === 'enum' && (!Array.isArray(p.values) || !p.values.length)) {
        errors.push(`params[${i}].values required when type is enum`);
      }
    }
  }

  // returns.render
  if (component.returns?.render && !VALID_RENDERS.has(component.returns.render)) {
    errors.push(`returns.render must be one of ${[...VALID_RENDERS].join(',')}`);
  }

  // hooks validation
  if (Array.isArray(component.hooks)) {
    for (const [i, h] of component.hooks.entries()) {
      if (!VALID_HOOK_ON.has(h.on)) {
        errors.push(`hooks[${i}].on must be one of ${[...VALID_HOOK_ON].join(',')}`);
      }
      if (!h.trigger) errors.push(`hooks[${i}].trigger is required`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function getSchema() {
  return {
    id: 'SCHEMA-COMPONENT', name: 'Component',
    requiredFields: REQUIRED_FIELDS,
    idPattern:      ID_PATTERN.toString(),
    validMethods:   [...VALID_METHODS],
    validTypes:     [...VALID_TYPES],
    validRenders:   [...VALID_RENDERS],
  };
}

// ══ STORE ═════════════════════════════════════════════════════════════════════
// In-memory index (hot path) backed by JAA (source of truth on restart)
const _index = new Map(); // Map<id, Component>
let   _jaa   = null;
let   _bus   = null;
let   _ready = false;

function _emit(type, payload) {
  try {
    if (_bus?.emit) _bus.emit(type, { ...payload, source: MODULE_ID, ts: Date.now() });
  } catch(e) {
    console.warn(`[${MODULE_ID}] bus emit failed: ${e.message}`);
  }
  try {
    if (_jaa) _jaa.insert('event_log', {
      uuid: crypto.randomUUID(), type, payload,
      source: MODULE_ID, causedBy: null, ts: Date.now(),
    });
  } catch(_) {}
}

function init(jaaDB, bus) {
  _jaa = jaaDB;
  _bus = bus;

  // Load all non-hard-deleted components from JAA into index
  try {
    const rows = _jaa.query('components', r => !r._hardDeleted, 5000);
    for (const row of rows) _index.set(row.id, row);
    console.log(`[${MODULE_ID}] loaded ${_index.size} components from JAA`);
  } catch(e) {
    console.warn(`[${MODULE_ID}] JAA load failed — starting empty: ${e.message}`);
  }

  _ready = true;
  return { ok: true, count: _index.size };
}

// CR-002: idempotent — re-register = update
function register(raw) {
  // Coerce first, then validate
  const component = _coerce(raw);
  const { ok, errors } = validate(component);
  if (!ok) return { ok:false, errors };

  const existing = _index.get(component.id);
  const created  = !existing;

  // Merge if exists
  const final = existing
    ? { ...existing, ...component, registeredAt: existing.registeredAt, updatedAt: Date.now() }
    : component;

  // §2.1 — JAA first
  try {
    if (existing) {
      _jaa.update('components', existing.uuid, final);
    } else {
      _jaa.insert('components', final);
    }
  } catch(e) {
    return { ok:false, errors:[`JAA write failed: ${e.message}`] };
  }

  // Then index
  _index.set(final.id, final);

  // Invalidate grammar cache
  _grammarInvalidate();

  // Emit event
  _emit(created ? 'component.registered' : 'component.updated',
    created ? { component: final, systemId: final.registeredBy }
            : { id: final.id, component: final });

  return { ok:true, component: final, created };
}

function registerBatch(items) {
  if (!Array.isArray(items)) return register(items);
  const results = [];
  for (const item of items) results.push(register(item));
  return results;
}

function get(id) {
  return _index.get(id) || null;
}

function list(filter = {}) {
  let items = [..._index.values()];

  // Filter out hard-deleted
  items = items.filter(c => !c._hardDeleted);

  if (filter.namespace)  items = items.filter(c => c.namespace === filter.namespace);
  if (filter.tag)        items = items.filter(c => (c.tags||[]).includes(filter.tag));
  if (filter.available !== undefined) items = items.filter(c => c.available === filter.available);
  if (filter.deprecated !== undefined) items = items.filter(c => c.deprecated === filter.deprecated);
  if (filter.q) {
    const q = filter.q.toLowerCase();
    items = items.filter(c =>
      c.id.includes(q) ||
      (c.description||'').toLowerCase().includes(q) ||
      (c.grammar||[]).some(g => g.toLowerCase().includes(q)) ||
      (c.tags||[]).some(t => t.toLowerCase().includes(q))
    );
  }

  return items;
}

function update(id, patch) {
  const existing = _index.get(id);
  if (!existing) return { ok:false, error:`component not found: ${id}` };

  const updated = _coerce({ ...existing, ...patch, id, updatedAt: Date.now() });
  const { ok, errors } = validate(updated);
  if (!ok) return { ok:false, errors };

  try {
    _jaa.update('components', existing.uuid, updated);
  } catch(e) {
    return { ok:false, error:`JAA write failed: ${e.message}` };
  }

  _index.set(id, updated);
  _grammarInvalidate();
  _emit('component.updated', { id, patch, component: updated });

  return { ok:true, component: updated };
}

// CR-003: soft delete only by default
function deprecate(id, replacedBy) {
  const existing = _index.get(id);
  if (!existing) return { ok:false, error:`component not found: ${id}` };

  const updated = { ...existing, deprecated:true, deprecatedBy: replacedBy||null, updatedAt: Date.now() };

  try {
    _jaa.update('components', existing.uuid, updated);
  } catch(e) {
    return { ok:false, error:`JAA write failed: ${e.message}` };
  }

  _index.set(id, updated);
  _grammarInvalidate();
  _emit('component.deprecated', { id, deprecatedBy: replacedBy });

  return { ok:true };
}

function hardDelete(id, confirmationToken) {
  if (confirmationToken !== 'CONFIRM_HARD_DELETE') {
    return { ok:false, error:'hardDelete requires confirmationToken=CONFIRM_HARD_DELETE' };
  }
  const existing = _index.get(id);
  if (!existing) return { ok:false, error:`component not found: ${id}` };

  try {
    _jaa.update('components', existing.uuid, { ...existing, _hardDeleted: true, updatedAt: Date.now() });
  } catch(e) {
    return { ok:false, error:`JAA write failed: ${e.message}` };
  }

  _index.delete(id);
  _grammarInvalidate();
  _emit('component.hard_deleted', { id });

  return { ok:true };
}

// CR-007: system online/offline lifecycle
function markAvailable(systemId, available) {
  let count = 0;
  for (const [id, component] of _index) {
    if (component.registeredBy !== systemId) continue;
    const updated = { ...component, available, updatedAt: Date.now() };
    try { _jaa.update('components', component.uuid, updated); } catch(_) {}
    _index.set(id, updated);
    count++;
  }

  if (count > 0) {
    _grammarInvalidate();
    const type = available ? 'component.available' : 'component.unavailable';
    const ids  = [..._index.values()]
      .filter(c => c.registeredBy === systemId).map(c => c.id);
    _emit(type, { systemId, count, componentIds: ids });
  }

  return { count };
}

// ══ GRAMMAR ════════════════════════════════════════════════════════════════════
// CR-006: grammar is owned by registry. CLI reads. CLI does not write.
let _grammarCache = null;

function _grammarInvalidate() {
  _grammarCache = null;
}

function buildGrammarTree() {
  if (_grammarCache) return _grammarCache;

  const components = list({ available: true, deprecated: false });
  const tree    = {};
  const aliases = {};

  for (const c of components) {
    if (!Array.isArray(c.grammar) || !c.grammar.length) continue;

    // Canonical grammar = first entry
    const canonical = c.grammar[0];
    const parts     = canonical.trim().split(/\s+/);

    // Walk/build tree
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    node[leaf] = { componentId: c.id, params: c.params || [], returns: c.returns };

    // Aliases = grammar[1..n]
    for (let i = 1; i < c.grammar.length; i++) {
      const alias = c.grammar[i].trim();
      aliases[alias] = c.id;
    }
  }

  _grammarCache = {
    tree,
    aliases,
    generatedAt:    Date.now(),
    componentCount: components.length,
  };

  _emit('registry.grammar.rebuilt', {
    componentCount: components.length,
    aliasCount:     Object.keys(aliases).length,
    generatedAt:    _grammarCache.generatedAt,
  });

  return _grammarCache;
}

// ══ API ════════════════════════════════════════════════════════════════════════
// Mounted on orchestrator. All routes under /api/components.
function handleRequest(method, sub, rest, body, searchParams) {
  // GET /api/components/grammar
  if (method === 'GET' && sub === 'grammar') {
    return { ok:true, ...buildGrammarTree() };
  }

  // GET /api/components/schema
  if (method === 'GET' && sub === 'schema') {
    return { ok:true, schema: getSchema() };
  }

  // POST /api/components/register
  if (method === 'POST' && sub === 'register') {
    if (!body) return { ok:false, error:'body required' };
    const results = Array.isArray(body) ? registerBatch(body) : register(body);
    if (Array.isArray(results)) {
      const failed = results.filter(r => !r.ok);
      return { ok: failed.length === 0, results, failed };
    }
    return results;
  }

  // GET /api/components/:id
  if (method === 'GET' && sub && sub !== 'register') {
    const component = get(sub);
    if (!component) return { ok:false, error:`component not found`, id: sub, _status:404 };
    return { ok:true, component };
  }

  // PUT /api/components/:id
  if (method === 'PUT' && sub) {
    if (!body) return { ok:false, error:'body required' };
    const result = update(sub, body);
    if (!result.ok && result.error?.includes('not found')) return { ...result, _status:404 };
    return result;
  }

  // DELETE /api/components/:id
  if (method === 'DELETE' && sub) {
    const hard = searchParams?.get?.('hard') === 'true';
    const result = hard
      ? hardDelete(sub, searchParams.get('confirm') === 'true' ? 'CONFIRM_HARD_DELETE' : '')
      : deprecate(sub, searchParams?.get?.('replacedBy') || undefined);
    if (!result.ok && result.error?.includes('not found')) return { ...result, _status:404 };
    return result;
  }

  // GET /api/components (list)
  if (method === 'GET') {
    const filter = {};
    if (searchParams?.get?.('namespace'))  filter.namespace  = searchParams.get('namespace');
    if (searchParams?.get?.('tag'))        filter.tag        = searchParams.get('tag');
    if (searchParams?.get?.('q'))          filter.q          = searchParams.get('q');
    if (searchParams?.get?.('available'))  filter.available  = searchParams.get('available') !== 'false';
    if (searchParams?.get?.('deprecated')) filter.deprecated = searchParams.get('deprecated') === 'true';
    const components = list(filter);
    return { ok:true, components, count: components.length };
  }

  return { ok:false, error:'route not found', _status:404 };
}

// ══ BOOT ═══════════════════════════════════════════════════════════════════════
// Wires into orchestrator boot sequence and system registration lifecycle.
function bootPhase(seq, jaaDB, bus) {
  seq.phase({
    name:  'component.registry.init',
    type:  'SOFT',
    label: 'Component Registry (self-describing kernel)',
    fn: async () => {
      const result = init(jaaDB, bus);
      return { ok: result.ok, count: result.count };
    },
  });
}

function onSystemRegister(systemId, components, bus) {
  if (!Array.isArray(components) || !components.length) return;
  const stamped = components.map(c => ({ ...c, registeredBy: systemId, registeredAt: Date.now() }));
  const results = registerBatch(stamped);
  const ok      = results.filter(r => r.ok).length;
  const failed  = results.filter(r => !r.ok).length;
  console.log(`[${MODULE_ID}] system:${systemId} registered ${ok} components (${failed} failed)`);
  return { ok: true, registered: ok, failed };
}

function onSystemOffline(systemId) {
  const result = markAvailable(systemId, false);
  console.log(`[${MODULE_ID}] system:${systemId} offline — ${result.count} components unavailable`);
  return result;
}

function onSystemOnline(systemId) {
  const result = markAvailable(systemId, true);
  console.log(`[${MODULE_ID}] system:${systemId} online — ${result.count} components available`);
  return result;
}

// ══ EXPORTS ════════════════════════════════════════════════════════════════════
module.exports = {
  // Schema
  validate, getSchema,
  // Store
  init, register, registerBatch, get, list, update,
  deprecate, hardDelete, markAvailable,
  // Grammar
  buildGrammarTree,
  // API handler (called from orchestrator route handler)
  handleRequest,
  // Boot
  bootPhase, onSystemRegister, onSystemOffline, onSystemOnline,
  // Meta
  MODULE_ID, VERSION,
};
