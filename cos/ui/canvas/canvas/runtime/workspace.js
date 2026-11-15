/* ERAVOS runtime R6 — workspace.js → window.Workspace
 * snapshot(): {workspace_version:'1.0.0', domains:{<id>: state}, organisms:[{id, instanceId, x,y,w,h, state}], wires:[...], assets:{hash: base64}}
 * restore(snap): clear → domain beforeRestore → assets → domain restore → spawn in dependency order → deserialize → wires
 * Domain-free: universe-level state (anything not owned by one organism) is saved by the domain that owns it,
 * through Workspace.contribute({ id, save(K), restore(K, state, snap), beforeRestore(K) }).
 * autosave: IndexedDB 'eravos' store 'autosave', every 30 s + 1.5 s after any change; the last 5 kept ('history')
 * P11.3 (gate S): named projects (projects.save/list/load/remove), save-before-close (dirty since last kept copy),
 * backup()/importBackup() — every save, project and user preset in one file, to carry between addresses (L-03). */
(function (global) {
  'use strict';
  const VERSION = '1.0.0';
  const contributors = [];
  let K, timer = null, lastSaved = null, enabled = true, restoring = false, debounce = null, dirty = false, keptAt = null;
  const HISTORY = 5, PROJ = 'project:';

  function b64(ab) { const b = new Uint8Array(ab); let s = ''; const CH = 0x8000; for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH)); return btoa(s); }
  function unb64(s) { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }

  function snapshot(o) {
    o = o || {};
    K = K || global.Kernel;
    const F = global.OrganismFactory;
    const recs = F.handles().filter(r => r.K === K && !r.service); // services are not part of the work
    const organisms = recs.map(r => {
      const rect = global.CanvasWM && global.CanvasWM.rectOf ? global.CanvasWM.rectOf(r.instanceId) : null;
      return Object.assign({ id: r.id, instanceId: r.instanceId, state: r.ctx.serialize() }, rect || {});
    });
    const ids = new Set(recs.map(r => r.instanceId));
    const wires = K.wires.list().filter(w => ids.has(w.src.instanceId) && ids.has(w.dst.instanceId))
      .map(w => ({ src: w.src.instanceId, srcHook: w.src.hookId, dst: w.dst.instanceId, dstHook: w.dst.hookId, type: w.wire_type }));
    const text = JSON.stringify(organisms);
    const assets = {};
    if (o.assets !== false) K.assets.list().forEach(a => { if (text.indexOf(a.hash) >= 0 && a.data && a.data.byteLength > 8) assets[a.hash] = { name: a.source, mime: a.mime, asset_type: a.asset_type, data: b64(a.data) }; });
    const domains = {};
    live().forEach(c => { if (c.save) { try { domains[c.id] = c.save(K); } catch (e) { K.fault('RUNTIME_003', { message: `workspace save ${c.id}: ${e.message}` }); } } });
    return { workspace_version: VERSION, saved_at: new Date().toISOString(), domains, organisms, wires, assets, view: global.CanvasWM ? Object.assign({}, global.CanvasWM.view) : null };
  }
  function live() { return contributors.filter(c => !c.domain || K.domains.has(c.domain)); }
  function each(fn) { live().forEach(c => { try { fn(c); } catch (e) { K.fault('RUNTIME_003', { message: `workspace ${c.id}: ${e.message}` }); } });
  }

  async function restore(snap) {
    K = K || global.Kernel;
    if (!snap || typeof snap !== 'object') { K.fault('ASSET_001', { message: 'workspace: not an object' }); return false; }
    if (!snap.workspace_version || K.semver.parse(snap.workspace_version)[0] !== 1) { K.fault('MOUNT_005', { message: `workspace version ${snap.workspace_version} unsupported` }); return false; }
    // P38 catalog: a project that names tools this canvas has not installed installs them first (named in a toast), never fails
    if (global.Catalog && Array.isArray(snap.organisms)) {
      const got = await global.Catalog.ensure(snap.organisms.map(o => o.id), K);
      if (got.length && global.Shell) global.Shell.toast(`This project uses ${got.length} tool${got.length > 1 ? 's' : ''} you hadn’t installed — installed: ${got.join(', ')}`, 'good', 6000);
    }
    restoring = true;
    K.bus.publish('workspace:restoring', {});
    try {
      global.OrganismFactory.clearAll(K);
      each(c => c.beforeRestore && c.beforeRestore(K, snap));
      Object.keys(snap.assets || {}).forEach(h => {
        const a = snap.assets[h];
        const rec = K.assets.register(unb64(a.data), { name: a.name, mime: a.mime, asset_type: a.asset_type });
        if (rec.hash !== h) K.fault('ASSET_003', { message: `asset ${a.name}: ${h} ≠ ${rec.hash}` });
      });
      each(c => c.restore && c.restore(K, (snap.domains || {})[c.id], snap));
      // dependency order: organisms with no dependencies first (defs declare dependencies)
      const order = snap.organisms.slice().sort((a, b) => depth(a.id) - depth(b.id));
      const map = {};
      for (const o of order) {
        const want = K.registry.has(o.instanceId) ? undefined : o.instanceId;
        const id = global.OrganismFactory.spawn(o.id, { instanceId: want, x: o.x, y: o.y, w: o.w, h: o.h, state: o.state, K });
        if (id) map[o.instanceId] = id;
      }
      // second pass: states may reference other instances (targets) — re-apply once all exist
      for (const o of order) { const r = global.OrganismFactory.handle(map[o.instanceId]); if (r && o.state && r.def.restoreTwice) r.ctx.deserialize(o.state); }
      (snap.wires || []).forEach(w => {
        if (!map[w.src] || !map[w.dst]) return;
        K.wires.register({ src: { instanceId: map[w.src], hookId: w.srcHook }, dst: { instanceId: map[w.dst], hookId: w.dstHook }, wire_type: w.type });
      });
      if (snap.view && global.CanvasWM && global.CanvasWM.world) { Object.assign(global.CanvasWM.view, snap.view); global.CanvasWM.applyView(); }
      K.bus.publish('workspace:restored', { organisms: Object.keys(map).length });
      return map;
    } finally { restoring = false; }
  }
  function depth(id) { const d = global.OrganismFactory.def(id); return d && d.dependencies ? d.dependencies.length : (d && d.restoreFirst ? -1 : 0); }

  let storageWarned = false;
  async function autosaveNow() {
    if (!enabled || restoring) return;
    try {
      const snap = snapshot();
      if (!snap.organisms.length) return;
      const entry = { time: Date.now(), snap };
      // 3.37 (QA: with storage blocked this still announced "autosaved" while keeping nothing): a failed write is said once
      if (!(await global.OrganismSDK.IDB.put('autosave', 'latest', entry))) {
        if (!storageWarned) { storageWarned = true; K.fault('RUNTIME_003', { organism_id: 'workspace.autosave', message: 'This browser is blocking storage, so your work is not being kept automatically. Save a copy to a file to keep it.' }); }
        K.bus.publish('workspace:autosave-failed', { time: new Date().toISOString() }); return;
      }
      storageWarned = false;
      // rolling history: a bad state never overwrites the only good copy
      const hist = (await global.OrganismSDK.IDB.get('autosave', 'history')) || [];
      if (!hist.length || entry.time - hist[0].time > 60000) { hist.unshift(entry); await global.OrganismSDK.IDB.put('autosave', 'history', hist.slice(0, HISTORY)); }
      else { hist[0] = entry; await global.OrganismSDK.IDB.put('autosave', 'history', hist); }
      lastSaved = new Date();
      K.bus.publish('workspace:autosaved', { time: lastSaved.toISOString() });
    } catch (e) { K.fault('RUNTIME_003', { organism_id: 'workspace.autosave', message: 'autosave: ' + e.message }); }
  }
  function boot(kernel, o) {
    K = kernel; o = o || {};
    // say at once (not 30 s later) when this browser blocks storage
    try { Promise.resolve(global.OrganismSDK.IDB.open()).catch(() => { if (storageWarned) return; storageWarned = true; K.fault('RUNTIME_003', { organism_id: 'workspace.autosave', message: 'This browser is blocking storage, so your work is not being kept automatically. Save a copy to a file to keep it.' }); K.bus.publish('workspace:autosave-failed', { time: new Date().toISOString() }); }); } catch (e) {}
    const interval = (o.interval || 30) * 1000;
    if (timer) clearInterval(timer);
    timer = setInterval(autosaveNow, interval);
    const bump = () => { clearTimeout(debounce); debounce = setTimeout(autosaveNow, 1500); };
    K.bus.subscribe('kernel:organism-mounted', bump, 'workspace');
    if (o.interval === 0) clearInterval(timer);
    K.bus.subscribe('kernel:organism-unmounted', bump, 'workspace');
    // any change a person makes (a knob, a note, a wire) → autosave soon, and the canvas is "unsaved" until kept
    // domain-free: every ui:* intent a window sends counts (reads like request_state / want_* don't), plus wiring and add/remove
    const CHANGE = /^(ui:(?!request_state|want_)[a-z_]+:|kernel:wire-(registered|removed)|kernel:organism-(mounted|unmounted))/;
    if (K.bus.tap) K.bus.tap((topic) => { if (restoring || !CHANGE.test(topic)) return; dirty = true; bump(); });
    if (global.addEventListener && !o.headless) global.addEventListener('beforeunload', (e) => { if (!dirty || !hasWork()) return; e.preventDefault(); e.returnValue = 'You have changes not kept in a project or file.'; return e.returnValue; });
    // intake: file with workspace_version → restore
    K.bus.subscribe('intake:file', async (p) => {
      if (p && p.json && p.json.eravos_backup === 1) { p.claimed = true; await importBackup(p.json); return; }
      if (!p || !p.json || !p.json.workspace_version) return;
      p.claimed = true;
      if (await restore(p.json)) markKept();
    }, 'workspace');
  }
  async function latestAutosave() { const r = await global.OrganismSDK.IDB.get('autosave', 'latest'); return r || null; }
  async function autosaveHistory() { return (await global.OrganismSDK.IDB.get('autosave', 'history')) || []; }
  function hasWork() { const F = global.OrganismFactory; return !!(K && K.registry && K.registry.list().some(r => !(r.descriptor && r.descriptor.system) && !(F && F.handle(r.instance_id) && F.handle(r.instance_id).service))); }
  function markKept() { dirty = false; keptAt = new Date(); (K || global.Kernel).bus.publish('workspace:kept', { time: keptAt.toISOString() }); }

  // ---- named projects (in this app's storage — no file dialog needed)
  const IDBX = () => global.OrganismSDK.IDB;
  async function projIndex() { return (await IDBX().get('autosave', 'projects')) || []; }
  const projects = {
    async list() { return (await projIndex()).slice().sort((a, b) => b.time - a.time); },
    async save(name) {
      name = String(name || '').trim().slice(0, 80); if (!name) return false;
      const snap = snapshot(); const ok = await IDBX().put('autosave', PROJ + name, { time: Date.now(), snap });
      if (!ok) { (K || global.Kernel).fault('RUNTIME_003', { message: `couldn’t save project ${name} — storage full or blocked` }); return false; }
      const idx = (await projIndex()).filter(p => p.name !== name); idx.push({ name, time: Date.now(), tools: snap.organisms.length });
      await IDBX().put('autosave', 'projects', idx); markKept(); return true;
    },
    async load(name) { const r = await IDBX().get('autosave', PROJ + name); if (!r) { (K || global.Kernel).fault('MUTATION_001', { message: `project ${name} not found` }); return false; } const ok = await restore(r.snap); if (ok) markKept(); return ok; },
    async remove(name) { await IDBX().put('autosave', PROJ + name, null); await IDBX().put('autosave', 'projects', (await projIndex()).filter(p => p.name !== name)); return true; },
  };
  // ---- backup: everything this address has kept, in one file → open it at another address (file:// → localhost → exe)
  async function backup() {
    const idx = await projIndex(), out = { eravos_backup: 1, made_at: new Date().toISOString(), origin: (global.location && global.location.origin) || '', latest: await latestAutosave(), history: await autosaveHistory(), projects: [], presets: {} };
    for (const p of idx) { const r = await IDBX().get('autosave', PROJ + p.name); if (r) out.projects.push({ name: p.name, time: r.time, snap: r.snap }); }
    for (const d of (global.OrganismFactory ? global.OrganismFactory.defined() : [])) { const u = await IDBX().get('presets', d.id); if (u && Object.keys(u).length) out.presets[d.id] = u; }
    const assets = {}; for (const id of Object.keys(out.presets)) for (const pr of Object.values(out.presets[id])) for (const h of (pr.assets || [])) { const a = await IDBX().get('assets', h); if (a && a.data) assets[h] = { name: a.name, mime: a.mime, asset_type: a.asset_type, data: b64(a.data) }; }
    out.preset_assets = assets;
    return out;
  }
  async function importBackup(b) {
    if (!b || b.eravos_backup !== 1) { (K || global.Kernel).fault('ASSET_001', { message: 'not an ERAVOS backup file' }); return null; }
    const idx = await projIndex(); let n = 0, presets = 0;
    for (const p of (b.projects || [])) { let name = p.name; if (idx.some(x => x.name === name)) name = name + ' (imported)'; await IDBX().put('autosave', PROJ + name, { time: p.time, snap: p.snap }); idx.push({ name, time: p.time, tools: (p.snap.organisms || []).length }); n++; }
    // the other address's latest autosave becomes a project too, so nothing here is overwritten
    if (b.latest && b.latest.snap && b.latest.snap.organisms && b.latest.snap.organisms.length) { const name = 'Autosave from ' + (b.origin || 'another address') + ' · ' + new Date(b.latest.time).toLocaleString(); await IDBX().put('autosave', PROJ + name, b.latest); idx.push({ name, time: b.latest.time, tools: b.latest.snap.organisms.length }); n++; }
    await IDBX().put('autosave', 'projects', idx);
    for (const id of Object.keys(b.presets || {})) { const cur = (await IDBX().get('presets', id)) || {}; Object.keys(b.presets[id]).forEach(k => { if (!cur[k]) { cur[k] = b.presets[id][k]; presets++; } }); await IDBX().put('presets', id, cur); }
    for (const h of Object.keys(b.preset_assets || {})) { const a = b.preset_assets[h]; await IDBX().put('assets', h, { name: a.name, mime: a.mime, asset_type: a.asset_type, data: unb64(a.data) }); }
    (K || global.Kernel).bus.publish('workspace:backup-imported', { projects: n, presets });
    return { projects: n, presets };
  }
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  global.Workspace = {
    VERSION, snapshot, restore, boot, autosaveNow, latestAutosave, autosaveHistory, download, b64, unb64, projects, backup, importBackup, markKept,
    get dirty() { return dirty; }, get keptAt() { return keptAt; },
    contribute(c) { if (c && c.id && !contributors.some(x => x.id === c.id)) contributors.push(c); },
    setAutosave(v) { enabled = !!v; }, get lastSaved() { return lastSaved; }, get autosaveEnabled() { return enabled; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
