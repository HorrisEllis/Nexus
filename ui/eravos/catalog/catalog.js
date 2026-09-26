/* ═══════════════════════════════════════════════════════════
   ERAVOS CATALOG REGISTRY  v1.0.0
   catalog/catalog.js

   Pure data layer. No DOM. No rendering. No inline logic.

   Responsibilities:
     register(def)           — add an organism to the catalog
     list()                  — all registered organisms
     get(id)                 — one organism by id
     search(query)           — filter by label/summary/category
     categories()            — sorted unique category list
     on(event, fn)           — subscribe to catalog events

   Events emitted on KERNEL.bus:
     catalog:registered      — organism added
     catalog:updated         — organism definition replaced
     catalog:removed         — organism removed

   Called by:
     OrganismFactory          — seeds catalog on reg()
     PackLoader               — registers dynamically loaded organisms
     NexusBridge              — triggers registration after delivery
     CatalogUI                — reads data to render

   K-10: The spec is the source of truth — not runtime state.
   §1.2: Nothing silently fails.
   §2.3: All state observable — list()/get() always queryable.
   ═══════════════════════════════════════════════════════════ */

window.CatalogRegistry = (() => {
'use strict';

const _organisms = new Map(); // id → def
const _listeners = new Map(); // event → fn[]

function _emit(event, data) {
  (_listeners.get(event) || []).forEach(fn => { try { fn(data); } catch(_) {} });
  // Also publish on KERNEL bus if available
  if (typeof KERNEL !== 'undefined' && KERNEL.bus) {
    KERNEL.bus.publish(event, data);
  }
}

/* ── Core API ─────────────────────────────────────────────── */

function register(def) {
  if (!def || !def.id) {
    console.warn('[CatalogRegistry] register: id required');
    return null;
  }
  const existed = _organisms.has(def.id);
  const entry = {
    id:       def.id,
    label:    def.label    || def.id,
    icon:     def.icon     || '◆',
    accent:   def.accent   || null,
    category: def.category || 'Uncategorized',
    summary:  def.summary  || '',
    needs:    Array.isArray(def.needs) ? def.needs : [],
    tags:     Array.isArray(def.tags)  ? def.tags  : [],
    source:   def.source   || 'built-in', // built-in | pack | nexus-build
    registeredAt: Date.now(),
    _def: def, // full def for OrganismFactory.spawn()
  };
  _organisms.set(def.id, entry);
  _emit(existed ? 'catalog:updated' : 'catalog:registered', { id: def.id, entry });
  return entry;
}

function remove(id) {
  if (!_organisms.has(id)) return false;
  _organisms.delete(id);
  _emit('catalog:removed', { id });
  return true;
}

function get(id) {
  return _organisms.get(id) || null;
}

function list() {
  return [..._organisms.values()];
}

function search(query) {
  if (!query) return list();
  const q = query.toLowerCase();
  return list().filter(o =>
    o.label.toLowerCase().includes(q) ||
    o.summary.toLowerCase().includes(q) ||
    o.category.toLowerCase().includes(q) ||
    o.tags.some(t => t.toLowerCase().includes(q))
  );
}

function categories() {
  const cats = new Set(list().map(o => o.category));
  return [...cats].sort();
}

function on(event, fn) {
  if (!_listeners.has(event)) _listeners.set(event, []);
  _listeners.get(event).push(fn);
  return () => {
    const fns = _listeners.get(event) || [];
    const idx = fns.indexOf(fn);
    if (idx >= 0) fns.splice(idx, 1);
  };
}

function status() {
  return {
    count:      _organisms.size,
    categories: categories(),
    sources:    [...new Set(list().map(o => o.source))],
  };
}

return { register, remove, get, list, search, categories, on, status };
})();
