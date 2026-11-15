/* ERAVOS runtime — erv.js → window.Erv · the .erv project file (specs/eravos.erv-format.spec). Domain-free.
 * His words (2026-11-06): "Can we use yaml to save songs like a psd file. Like so it has layers? Like it saves what’s on the canvas?" (09:23:29Z)
 *   · "Nice. That's exactly it. And then the PSD style YAML, maybe ERV as an extension for that." (15:55:01Z)
 * Everything on the canvas as ONE readable YAML file in LAYERS, like a PSD: the canvas view, a Tools group (one layer per tool: where it sits,
 * its preset, every setting), the wires, each domain's own state (whatever its Workspace contributor saves — named by the domain, not here),
 * your files (whatever the project's tools hold). Each layer: on (off = left out when opened) · locked · note · colour. Unknown keys survive (a hand edit or a newer ERAVOS).
 *   Erv.toErv(snap, { name, app }) → text          Erv.fromErv(text, { only? }) → { snap, layers, name }   (throws with line:column on bad YAML)
 *   Erv.layers(text) → the layer list (for "open in part")   Erv.save(name) → downloads <name>.erv   Erv.open(text, o) → restores
 * YAML via js-yaml 4.1.0 (vendor/, MIT), CORE schema only: a file cannot run code or make objects. Workspace's snapshot stays the in-memory
 * form; .erv is that object laid out as layers — snapshot → .erv → snapshot is exact (tests/p120-erv.test.js). */
(function (global) {
  'use strict';
  const Y = () => global.jsyaml;
  const FMT = 1;
  const KNOWN = new Set(['workspace_version', 'saved_at', 'domains', 'organisms', 'wires', 'assets', 'view']);
  function toErv(snap, o) {
    o = o || {}; snap = JSON.parse(JSON.stringify(snap));   // the JSON form the app keeps (undefined dropped; YAML cannot hold it)
    const layers = [];
    layers.push({ id: 'view', kind: 'canvas', label: 'Canvas view', on: true, locked: false, data: snap.view || null });
    layers.push({ id: 'tools', kind: 'group', label: 'Tools', on: true, locked: false, layers: (snap.organisms || []).map(org => {
      const { id, instanceId, state } = org, at = {}, rest = {};
      Object.keys(org).forEach(k => { if (k === 'id' || k === 'instanceId' || k === 'state') return; if (['x', 'y', 'w', 'h'].includes(k)) at[k] = org[k]; else rest[k] = org[k]; });
      const d = global.OrganismFactory && global.OrganismFactory.def(id);
      return Object.assign({ id: instanceId, kind: 'tool', tool: id, label: (d && d.label) || id, on: true, locked: false }, Object.keys(at).length ? { at } : {}, Object.keys(rest).length ? { extra: rest } : {},
        presetOf(instanceId), { state });
    }) });
    layers.push({ id: 'wires', kind: 'wires', label: 'Wires', on: true, locked: false, data: (snap.wires || []).map(w => Object.assign({ from: [w.src, w.srcHook], to: [w.dst, w.dstHook], type: w.type }, extraOf(w, ['src', 'srcHook', 'dst', 'dstHook', 'type']))) });
    Object.keys(snap.domains || {}).forEach(k => layers.push({ id: 'domain:' + k, kind: 'domain', label: k, on: true, locked: false, data: snap.domains[k] }));
    if (snap.assets && Object.keys(snap.assets).length) layers.push({ id: 'assets', kind: 'assets', label: 'Your files', on: true, locked: false, data: snap.assets });
    const extra = {}; Object.keys(snap).forEach(k => { if (!KNOWN.has(k)) extra[k] = snap[k]; });
    const doc = { erv: FMT, name: o.name || 'Untitled', saved: snap.saved_at || new Date().toISOString(), app: o.app || 'ERAVOS', workspace: snap.workspace_version || '1.0.0', layers };
    if (Object.keys(extra).length) doc.extra = extra;
    const head = `# ${doc.name} — an ERAVOS project (.erv: YAML in layers, like a PSD). Each layer: on / locked / note. Open it in ERAVOS (drop it on the canvas).\n`;
    return head + Y().dump(doc, { schema: Y().CORE_SCHEMA, noRefs: true, lineWidth: 160, sortKeys: false, skipInvalid: false, noCompatMode: true });
  }
  // the preset it is on, if it is live — a readable label only (opening restores every setting from state, not by name)
  function presetOf(inst) { const r = global.OrganismFactory && global.OrganismFactory.handle && global.OrganismFactory.handle(inst), n = r && r.ctx && r.ctx.currentPreset; return n ? { preset: n } : {}; }
  function extraOf(o, known) { const x = {}; Object.keys(o).forEach(k => { if (!known.includes(k)) x[k] = o[k]; }); return x; }
  function parse(text) {
    try { return Y().load(String(text), { schema: Y().CORE_SCHEMA }); }
    catch (e) { const m = e.mark ? ` (line ${e.mark.line + 1}, column ${e.mark.column + 1})` : ''; throw new Error('this .erv could not be read' + m + ': ' + (e.reason || e.message)); }
  }
  function flatLayers(ls, out, path) { (ls || []).forEach(l => { out.push(Object.assign({ path: path.concat(l.label || l.id) }, l)); if (l.kind === 'group') flatLayers(l.layers, out, path.concat(l.label || l.id)); }); return out; }
  // layers → snapshot. o.only: a Set of layer ids to open (otherwise every layer that is on); a group off = everything in it off
  function fromErv(text, o) {
    o = o || {}; const doc = typeof text === 'string' ? parse(text) : text;
    if (!doc || typeof doc !== 'object' || doc.erv === undefined) throw new Error('not an .erv file (no "erv:" at the top)');
    if (doc.erv > FMT) throw new Error(`this .erv is format ${doc.erv}; this ERAVOS reads up to ${FMT} — update ERAVOS`);
    const want = (l, parentOn) => parentOn && (o.only ? o.only.has(l.id) || (l.kind === 'group' && (l.layers || []).some(c => o.only.has(c.id))) : l.on !== false);
    const snap = { workspace_version: doc.workspace || '1.0.0', saved_at: doc.saved, domains: {}, organisms: [], wires: [], assets: {}, view: null };
    const off = new Set();
    (doc.layers || []).forEach(l => {
      const on = want(l, true);
      if (l.kind === 'canvas') { if (on) snap.view = l.data === undefined ? null : l.data; }
      else if (l.kind === 'group') (l.layers || []).forEach(t => {
        if (t.kind !== 'tool') return;
        if (!on || !want(t, true)) { off.add(t.id); return; }
        const org = Object.assign({ id: t.tool, instanceId: t.id, state: t.state }, t.at || {}, t.extra || {});   // locked: kept in the file; not yet enforced on open (open gap)
        snap.organisms.push(reorder(org));
      });
      else if (l.kind === 'wires') { if (on) snap.wires = (l.data || []).map(w => Object.assign({ src: w.from[0], srcHook: w.from[1], dst: w.to[0], dstHook: w.to[1], type: w.type }, extraOf(w, ['from', 'to', 'type']))); }
      else if (l.kind === 'domain') { if (on) snap.domains[String(l.id).replace(/^domain:/, '')] = l.data; }
      else if (l.kind === 'assets') { if (on) snap.assets = l.data || {}; }
    });
    snap.wires = snap.wires.filter(w => !off.has(w.src) && !off.has(w.dst));   // a tool left out takes its wires with it
    Object.assign(snap, doc.extra || {});
    return { snap, name: doc.name, layers: flatLayers(doc.layers, [], []) };
  }
  // the snapshot's own key order (so the object is the same, not just equal)
  function reorder(org) { const o = { id: org.id, instanceId: org.instanceId, state: org.state }; Object.keys(org).forEach(k => { if (!(k in o)) o[k] = org[k]; }); return o; }
  const layers = (text) => fromErv(text).layers;
  function save(name) {
    const W = global.Workspace; if (!W) return null; const n = String(name || 'My project').replace(/[\\/:*?"<>|]+/g, '-');
    const text = toErv(W.snapshot(), { name: n, app: 'ERAVOS ' + ((global.ERAVOS_DESKTOP && global.ERAVOS_DESKTOP.version) || '') });
    W.download(n + '.erv', text, 'application/yaml'); if (W.markKept) W.markKept(); return text;
  }
  async function open(text, o) {
    const W = global.Workspace, r = fromErv(text, o); if (!W) return r;
    const ok = await W.restore(r.snap); if (ok && W.markKept) W.markKept(); return Object.assign(r, { ok });
  }
  // a dropped .erv opens (the intake hands it here as text; the kernel knows only "a text file named .erv")
  function attach(K) {
    K.bus.subscribe('intake:file', async (p) => {
      if (!p || !/\.erv$/i.test(p.name || '') || typeof p.text !== 'string') return;
      p.claimed = true;
      try { const r = await open(p.text); if (global.Shell && global.Shell.toast) global.Shell.toast(`Opened “${r.name}” — ${r.snap.organisms.length} tools, ${r.snap.wires.length} wires`, 'good', 3500); }
      catch (e) { K.fault('ASSET_001', { message: (p.name || '.erv') + ': ' + e.message }); if (global.Shell && global.Shell.toast) global.Shell.toast(e.message, 'bad', 7000); }
    }, 'erv');
  }
  // ---- Start › Open .erv…: pick a file, see its layers (like a PSD's panel), switch any off, then open
  function pick() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.erv'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; f.text().then(t => dialog(t, f.name)); }; inp.click();
  }
  function dialog(text, fname) {
    const UI = global.UIKit, h = UI.h; let L;
    try { L = layers(text); } catch (e) { if (global.Shell) global.Shell.toast(e.message, 'bad', 7000); return null; }
    const on = new Map(L.map(l => [l.id, l.on !== false]));
    const ov = h('div', { class: 'overlay erv-open' }), close = () => ov.remove();
    const row = (l) => { const t = UI.Toggle({ label: (l.label || l.id) + (l.preset ? ' — ' + l.preset : '') + (l.note ? ' · ' + l.note : ''), value: on.get(l.id), onChange: (v) => { on.set(l.id, v); if (l.kind === 'group') L.filter(c => c.path[0] === (l.label || l.id) && c.path.length > 1).forEach(c => on.set(c.id, v)); } }); return h('div', { class: 'org-row', style: { margin: '2px 0 2px ' + (l.path.length - 1) * 24 + 'px' } }, [t.el, h('small', { class: 'uk-hint', style: { margin: '0 0 0 8px' }, text: l.kind })]); };
    const go = UI.Button({ label: 'Open', kind: 'primary', onClick: async () => { close(); try { const r = await open(text, { only: new Set(Array.from(on).filter(([, v]) => v).map(([k]) => k)) }); if (global.Shell) global.Shell.toast(`Opened “${r.name}” — ${r.snap.organisms.length} tools, ${r.snap.wires.length} wires`, 'good', 3500); } catch (e) { if (global.Shell) global.Shell.toast(e.message, 'bad', 7000); } } });
    ov.appendChild(h('div', { class: 'boot', style: { maxWidth: '560px' } }, [h('h1', { text: 'Open ' + (fname || '.erv') }), h('p', { class: 'sub', text: 'Its layers, like a PSD’s — switch off what you do not want; it opens without them (and without wires to them).' }),
      h('div', { class: 'uk-group' }, L.map(row)), h('div', { class: 'org-row', style: { gap: '8px', marginTop: '12px' } }, [go.el, UI.Button({ label: 'Cancel', onClick: close }).el])]));
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.body.appendChild(ov); return ov;
  }
  global.Erv = { FMT, toErv, fromErv, layers, save, open, attach, parse, pick, dialog };
})(typeof window !== 'undefined' ? window : globalThis);
