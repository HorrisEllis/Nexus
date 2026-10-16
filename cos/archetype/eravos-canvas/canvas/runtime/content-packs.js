/* ERAVOS runtime — content-packs.js → window.ContentPacks (spec eravos.structure § packs, schema schemas/pack.schema.json)
 * Content packs are DATA for tools — presets, kits, patterns, samples — never code. One registry for every domain:
 *   add(pack)            register a pack (from a tool's packs/ folder via the tools index, a dropped .zip, or the user)
 *   setEnabled(id, on)   switch a pack on/off (remembered); its presets appear / disappear in every tool's preset menu
 *   list(filter)         every pack: { id, label, tags, for[], enabled, kinds[], count, preview }
 *   items(toolId, kind)  the enabled items of one kind for one tool → [{ pack, packLabel, name, value }]
 *   kind(name, handler)  a domain teaches the registry a new kind (handler.add/remove get called on enable/disable)
 * Kind "presets" is built in: names show as "<pack label> · <name>" in the tool's preset menu. Domain-free. */
(function (global) {
  'use strict';
  const STORE = 'eravos.contentpacks.v1', packs = new Map(), kinds = new Map(), listeners = new Set();
  const off = (() => { try { return JSON.parse(global.localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } })();
  const keep = () => { try { global.localStorage.setItem(STORE, JSON.stringify(off)); } catch (e) {} };
  const F = () => global.OrganismFactory;
  const tagOf = (pk) => pk.prefix !== undefined ? pk.prefix : pk.label;
  const enabled = (id) => { const pk = packs.get(id); return !!pk && (off[id] !== undefined ? !off[id] : pk.enabled !== false); };
  // presets: merged into the tool's descriptor so every preset menu, the SDK and saving work unchanged
  kinds.set('presets', {
    add(pk, toolId, items, desc) { const d = desc || (F() && F().def(toolId)); if (!d) return; d.presets = d.presets || {}; Object.keys(items).forEach(n => { d.presets[(tagOf(pk) ? tagOf(pk) + ' · ' : '') + n] = items[n]; }); },
    remove(pk, toolId, items) { const d = F() && F().def(toolId); if (!d || !d.presets) return; Object.keys(items).forEach(n => { delete d.presets[(tagOf(pk) ? tagOf(pk) + ' · ' : '') + n]; }); },
  });
  function apply(pk, on, onlyTool, desc) {
    Object.keys(pk.items || {}).forEach(toolId => { if (onlyTool && toolId !== onlyTool) return; const byKind = pk.items[toolId]; Object.keys(byKind).forEach(k => { const h = kinds.get(k); if (h) { try { (on ? h.add : h.remove)(pk, toolId, byKind[k], desc); } catch (e) {} } }); });
  }
  function changed(id) { listeners.forEach(fn => { try { fn(id); } catch (e) {} }); }
  const CP = global.ContentPacks = {
    add(pk) {
      if (!pk || !pk.id || !pk.items) return false; if (packs.has(pk.id)) CP.remove(pk.id);
      const p = Object.assign({ schema: 'eravos.pack/1', version: '1.0.0', tags: [], enabled: true }, pk); p.for = [].concat(p.for || Object.keys(p.items));
      packs.set(p.id, p); if (enabled(p.id)) apply(p, true); changed(p.id); return true;
    },
    remove(id) { const pk = packs.get(id); if (!pk) return false; if (enabled(id)) apply(pk, false); packs.delete(id); changed(id); return true; },
    setEnabled(id, on) { const pk = packs.get(id); if (!pk || enabled(id) === !!on) return false; off[id] = !on; keep(); apply(pk, !!on); changed(id); return true; },
    enabled,
    list(f) {
      f = f || {};
      return Array.from(packs.values()).filter(p => (!f.tool || p.for.includes(f.tool)) && (!f.tag || (p.tags || []).includes(f.tag)) && (!f.kind || p.for.some(t => p.items[t] && p.items[t][f.kind])))
        .map(p => ({ id: p.id, label: p.label, tags: p.tags || [], for: p.for, enabled: enabled(p.id), preview: p.preview || null, author: p.author || '', user: !!p.user,
          kinds: Array.from(new Set(p.for.flatMap(t => Object.keys(p.items[t] || {})))), count: p.for.reduce((n, t) => n + Object.values(p.items[t] || {}).reduce((m, x) => m + (Array.isArray(x) ? 1 : Object.keys(x).length), 0), 0) }));
    },
    get: (id) => packs.get(id) || null,
    items(toolId, kind) { const out = []; packs.forEach(p => { if (!enabled(p.id)) return; const x = p.items[toolId] && p.items[toolId][kind]; if (x) Object.keys(x).forEach(n => out.push({ pack: p.id, packLabel: p.label, name: n, value: x[n] })); }); return out; },
    kind(name, handler) { kinds.set(name, handler); packs.forEach(p => { if (enabled(p.id)) p.for.forEach(t => { const x = p.items[t] && p.items[t][name]; if (x) try { handler.add(p, t, x); } catch (e) {} }); }); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  // ---- 3.34 the schema of ONE tool's packs: generated from that tool's own settings (define() is the truth, R6) —
  // a preset may only name that tool's parameters, with values its parameters accept.
  function paramSchema(c) {
    if (c.type === 'enum') return { enum: (c.options || []).map(o => (o && typeof o === 'object') ? o.value : o) };
    if (c.type === 'boolean') return { type: 'boolean' };
    if (c.type === 'integer') return { type: 'integer', minimum: c.min, maximum: c.max };
    if (c.type === 'number') return { type: 'number', minimum: c.min, maximum: c.max };
    if (c.type === 'string') return { type: 'string' };
    return {};
  }
  CP.toolSchema = function (toolId) {
    const d = F() && F().def(toolId); if (!d) return null;
    const props = {}; (d.config || []).filter(c => !c.hidden).forEach(c => { props[c.key] = Object.assign({ title: c.label || c.key }, paramSchema(c), c.default !== undefined ? { default: c.default } : {}); });
    return { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'eravos/packs/' + toolId + '.schema.json', title: (d.label || toolId) + ' — preset pack',
      description: 'Generated from the tool’s own settings. Extends eravos/pack.schema.json: items["' + toolId + '"].presets.<name>.params may only use these keys.',
      type: 'object', properties: { items: { type: 'object', properties: { [toolId]: { type: 'object', properties: { presets: { type: 'object', additionalProperties: { type: 'object', required: ['params'], properties: { params: { type: 'object', properties: props, additionalProperties: false } } } } } } } } } };
  };
  function checkValue(c, v) {
    if (c.type === 'enum') { const ok = (c.options || []).map(o => (o && typeof o === 'object') ? o.value : o); return ok.includes(v) ? null : `must be one of ${ok.join(', ')}`; }
    if (c.type === 'boolean') return typeof v === 'boolean' ? null : 'must be true or false';
    if (c.type === 'number' || c.type === 'integer') {
      if (typeof v !== 'number' || !isFinite(v)) return 'must be a number'; if (c.type === 'integer' && Math.round(v) !== v) return 'must be a whole number';
      if (c.min !== undefined && v < c.min) return `below ${c.min}`; if (c.max !== undefined && v > c.max) return `above ${c.max}`; return null;
    }
    if (c.type === 'string') return typeof v === 'string' ? null : 'must be text';
    return null;
  }
  /** validate(pack) → { ok, errors[] } — the generic pack rules + each tool's own schema. Honest: every problem is named. */
  CP.validate = function (pk) {
    const e = [];
    if (!pk || typeof pk !== 'object') return { ok: false, errors: ['not a pack (expected a JSON object)'] };
    if (pk.schema !== undefined && pk.schema !== 'eravos.pack/1') e.push('schema must be "eravos.pack/1"');
    if (!pk.id || !/^[a-z0-9][a-z0-9.-]+$/.test(pk.id)) e.push('id: lowercase letters, digits, dots and dashes');
    if (!pk.label || String(pk.label).length > 40) e.push('label: 1–40 characters');
    if (!pk.items || typeof pk.items !== 'object') e.push('items: missing');
    Object.keys(pk.items || {}).forEach(toolId => {
      const d = F() && F().def(toolId); const byKind = pk.items[toolId] || {};
      if (!d) { e.push(`${toolId}: this tool is not installed`); return; }
      const cfg = new Map((d.config || []).map(c => [c.key, c]));
      Object.keys(byKind).forEach(k => { if (!kinds.has(k)) e.push(`${toolId}: kind "${k}" is not known here`); });
      Object.keys(byKind.presets || {}).forEach(n => {
        const pr = byKind.presets[n]; if (!pr || typeof pr.params !== 'object') { e.push(`${d.label} · ${n}: params missing`); return; }
        Object.keys(pr.params).forEach(key => { const c = cfg.get(key); if (!c) e.push(`${d.label} · ${n}: “${key}” is not a setting of ${d.label}`); else { const m = checkValue(c, pr.params[key]); if (m) e.push(`${d.label} · ${n}: ${c.label || key} ${m}`); } });
      });
    });
    return { ok: !e.length, errors: e };
  };
  // ---- 3.34 your packs: made in the preset editor, kept in this browser (exe: the same store), exportable as JSON.
  // Shipped packs are read-only; yours can be renamed, filled, emptied and removed. Imported packs are validated first.
  const USTORE = 'eravos.userpacks.v1';
  const users = (() => { try { return JSON.parse(global.localStorage.getItem(USTORE)) || {}; } catch (e) { return {}; } })();
  const ukeep = () => { try { global.localStorage.setItem(USTORE, JSON.stringify(users)); } catch (e) {} };
  function reg(pk) { CP.add(Object.assign(JSON.parse(JSON.stringify(pk)), { user: true })); } // a copy: the registry must remember what it applied
  CP.user = {
    is: (id) => !!users[id],
    list: (toolId) => Object.values(users).filter(p => !toolId || [].concat(p.for || Object.keys(p.items)).includes(toolId)),
    create(toolId, label) {
      const base = 'mine.' + String(toolId).replace(/^eravos\./, '').replace(/[^a-z0-9-]/g, '') + '.'; let n = 1; while (users[base + n]) n++;
      const pk = { schema: 'eravos.pack/1', id: base + n, version: '1.0.0', label: String(label || 'My pack').slice(0, 40), author: 'me', tags: ['mine'], for: [toolId], enabled: true, items: { [toolId]: { presets: {} } } };
      users[pk.id] = pk; ukeep(); reg(pk); return pk.id;
    },
    putPreset(id, toolId, name, value) {
      const pk = users[id]; if (!pk) return false; const v = { params: Object.assign({}, (value && value.params) || {}) };
      const chk = CP.validate({ id: pk.id, label: pk.label, items: { [toolId]: { presets: { [name]: v } } } }); if (!chk.ok) return chk;
      pk.items[toolId] = pk.items[toolId] || {}; pk.items[toolId].presets = pk.items[toolId].presets || {}; pk.items[toolId].presets[name] = v;
      if (!pk.for.includes(toolId)) pk.for.push(toolId); ukeep(); reg(pk); return { ok: true, errors: [] };
    },
    removePreset(id, toolId, name) { const pk = users[id]; if (!pk || !pk.items[toolId] || !pk.items[toolId].presets) return false; delete pk.items[toolId].presets[name]; ukeep(); reg(pk); return true; },
    renamePreset(id, toolId, from, to) { const ps = users[id] && users[id].items[toolId] && users[id].items[toolId].presets; if (!ps || !ps[from] || !to || ps[to]) return false; ps[to] = ps[from]; delete ps[from]; ukeep(); reg(users[id]); return true; },
    rename(id, label) { if (!users[id] || !label) return false; users[id].label = String(label).slice(0, 40); ukeep(); reg(users[id]); return true; },
    remove(id) { if (!users[id]) return false; delete users[id]; ukeep(); CP.remove(id); return true; },
    export(id) { const pk = users[id] || packs.get(id); if (!pk) return null; const o = Object.assign({}, pk); delete o.user; delete o.prefix; return JSON.parse(JSON.stringify(o)); },
    import(obj) {
      const chk = CP.validate(obj); if (!chk.ok) return chk;
      let id = obj.id; if (packs.has(id) && !users[id]) id = 'mine.' + id;
      const pk = Object.assign({ schema: 'eravos.pack/1', version: '1.0.0', tags: [] }, JSON.parse(JSON.stringify(obj)), { id });
      pk.for = [].concat(pk.for || Object.keys(pk.items)); users[id] = pk; ukeep(); reg(pk); return { ok: true, errors: [], id };
    },
  };
  Object.values(users).forEach(reg);
  // a tool defined after its packs (a pack zip installs later) still gets them
  if (F()) F().onDefine((d) => packs.forEach(p => { if (enabled(p.id) && p.items[d.id]) apply(p, true, d.id, d); }));
})(typeof window !== 'undefined' ? window : globalThis);
