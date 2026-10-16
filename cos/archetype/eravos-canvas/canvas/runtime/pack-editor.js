/* ERAVOS runtime — pack-editor.js (3.34) — ⚙ Settings → “Packs & presets” for ONE tool (each tool is its own world):
 *  · every pack that has something for this tool: switch on/off, open, export; yours: rename, delete
 *  · My presets (the tool's own store) and your packs are editable: save the current sound, edit values in a table
 *    checked against the tool's schema (ContentPacks.toolSchema — generated from the tool's settings), rename, delete
 *  · shipped presets are read-only: copy one into My presets or one of your packs to change it
 *  · ＋ New pack · ⤒ Import (.json, validated — every problem named) · ⤓ the tool's pack schema
 * Domain-free: it knows tools through descriptors and the standard preset hooks only. */
(function (global) {
  'use strict';
  const CP = () => global.ContentPacks;
  const fullName = (pk, n) => { const t = pk.prefix !== undefined ? pk.prefix : pk.label; return (t ? t + ' · ' : '') + n; };
  const download = (name, obj) => { const txt = JSON.stringify(obj, null, 2); if (global.Workspace && global.Workspace.download) global.Workspace.download(name, txt, 'application/json'); else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click(); } };

  function make(rec, K, view) {
    const UI = global.UIKit, h = UI.h, d = rec.def, tool = d.id;
    const el = h('div', { class: 'pe' }), msg = h('div', { class: 'pe-msg', 'aria-live': 'polite' });
    const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); };
    const params = () => (d.config || []).filter(c => !c.hidden);
    const current = () => { const o = {}; params().forEach(c => { if (view.state[c.key] !== undefined) o[c.key] = view.state[c.key]; }); return o; };
    const mine = () => (rec.ctx.presets && rec.ctx.presets.user) || {};
    let editing = null, openPacks = new Set(['__mine']);

    // ---- toolbar
    const saveName = h('input', { class: 'uk-input pe-in', placeholder: 'name for the current sound…', 'aria-label': 'preset name' });
    const saveTo = h('select', { class: 'uk-select', 'aria-label': 'save into' });
    const saveBtn = UI.Button({ label: '＋ Save current sound', kind: 'primary', hint: 'keeps every setting as it is now', onClick: () => {
      const n = saveName.value.trim(); if (!n) { say('Give it a name first.', true); saveName.focus(); return; }
      if (saveTo.value === '__mine') { view.emit('preset_save', { name: n }); say('Saved “' + n + '” in My presets.'); }
      else { const r = CP().user.putPreset(saveTo.value, tool, n, { params: current() }); if (r && r.ok) say('Saved “' + n + '” in ' + CP().get(saveTo.value).label + '.'); else say((r && r.errors || ['could not save']).join(' · '), true); }
      saveName.value = ''; setTimeout(paint, 60);
    } });
    const newPack = UI.Button({ label: '＋ New pack', hint: 'a pack of your own for this tool — export it to share', onClick: () => UI.ask('Name of the new pack', 'My ' + d.label + ' sounds').then((l) => { if (!l) return; const id = CP().user.create(tool, l); openPacks.add(id); paint(); say('Made the pack “' + l + '”.'); }) });
    const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = ''; if (!f) return; let obj; try { obj = JSON.parse(await f.text()); } catch (e) { say('That file is not JSON: ' + e.message, true); return; }
      const r = CP().user.import(obj); if (r.ok) { openPacks.add(r.id); paint(); say('Imported “' + (obj.label || r.id) + '”.'); } else say('Not imported — ' + r.errors.join(' · '), true);
    });
    const imp = UI.Button({ label: '⤒ Import pack', hint: 'a .json pack — checked against this tool’s schema first', onClick: () => file.click() });
    const sch = UI.Button({ label: '⤓ Schema', hint: 'the JSON schema of this tool’s presets (made from its settings)', onClick: () => download(tool.replace(/^eravos\./, '') + '.pack.schema.json', CP().toolSchema(tool)) });
    const list = h('div', { class: 'pe-list' }), ed = h('div', { class: 'pe-edit' });
    el.append(h('div', { class: 'org-row pe-top' }, [saveName, h('span', { class: 'uk-hint', text: 'into' }), saveTo, saveBtn.el]), list, ed, h('div', { class: 'org-row' }, [newPack.el, imp.el, sch.el, file]), msg);

    // ---- one pack card
    function card(p) {
      const isMine = p.id === '__mine', user = !isMine && CP().user.is(p.id), on = isMine || CP().enabled(p.id), open = openPacks.has(p.id);
      const names = p.names;
      const tog = isMine ? h('span', { class: 'pe-badge', text: 'always on' }) : UI.Toggle({ label: '', value: on, onChange: (v) => { CP().setEnabled(p.id, v); paint(); say((v ? 'On: ' : 'Off: ') + p.label + (v ? '' : ' — its presets leave the menu')); } }).el;
      const head = h('div', { class: 'pe-head' }, [
        h('button', { class: 'pe-fold', text: open ? '▾' : '▸', onclick: () => { open ? openPacks.delete(p.id) : openPacks.add(p.id); paint(); } }),
        tog, h('b', { class: 'pe-label', text: p.label }), h('span', { class: 'pe-badge ' + (isMine || user ? 'mine' : 'ship'), text: isMine ? 'my presets' : user ? 'yours' : 'shipped' }),
        h('span', { class: 'uk-hint', text: names.length + ' preset' + (names.length === 1 ? '' : 's') }), h('span', { class: 'wm-spacer' }),
        isMine ? null : h('button', { class: 'pe-act', text: '⤓', title: 'export this pack (.json)', onclick: () => download(p.id + '.pack.json', CP().user.export(p.id)) }),
        user ? h('button', { class: 'pe-act', text: '✎', title: 'rename pack', onclick: () => UI.ask('Pack name', p.label).then((l) => { if (l) { CP().user.rename(p.id, l); paint(); } }) }) : null,
        user ? h('button', { class: 'pe-act bad', text: '🗑', title: 'delete this pack', onclick: () => { if (confirm('Delete the pack “' + p.label + '” and its presets?')) { CP().user.remove(p.id); paint(); } } }) : null,
      ]);
      const c = h('div', { class: 'pe-pack' + (on ? '' : ' off') }, [head]);
      if (open) {
        const body = h('div', { class: 'pe-presets' });
        if (!names.length) body.appendChild(h('div', { class: 'uk-hint', text: isMine ? 'Nothing yet — Save current sound above.' : 'Empty — save into it from above, or copy presets in.' }));
        names.forEach(n => {
          const key = isMine ? 'user:' + n : fullName(p.pk, n), editable = isMine || user, cur = view.state && rec.ctx.currentPreset === key;
          body.appendChild(h('div', { class: 'pe-row' + (cur ? ' cur' : '') }, [
            on && global.Preview ? global.Preview.button(tool, key) : null,
            h('button', { class: 'pe-name', text: n, title: on ? 'load it' : 'switch the pack on to load it', disabled: !on, onclick: () => { view.emit('preset_load', { name: key }); setTimeout(paint, 40); } }),
            h('button', { class: 'pe-act', text: editable ? '✎' : '👁', title: editable ? 'edit values' : 'see values', onclick: () => { editing = { pack: p.id, name: n, key, editable }; paintEdit(); } }),
            h('button', { class: 'pe-act', text: '⧉', title: 'copy into My presets', onclick: () => { const v = valueOf(p.id, n, key); view.emit('preset_put', { name: uniq(n), value: { params: v } }); setTimeout(paint, 60); say('Copied “' + n + '” into My presets.'); } }),
            editable ? h('button', { class: 'pe-act', text: 'Aa', title: 'rename', onclick: () => UI.ask('Preset name', n).then((t) => { if (!t || t === n) return; if (isMine) view.emit('preset_rename', { from: n, to: t }); else CP().user.renamePreset(p.id, tool, n, t); setTimeout(paint, 60); }) }) : null,
            editable ? h('button', { class: 'pe-act bad', text: '×', title: 'delete', onclick: () => { if (!confirm('Delete “' + n + '”?')) return; if (isMine) view.emit('preset_delete', { name: n }); else CP().user.removePreset(p.id, tool, n); if (editing && editing.name === n) { editing = null; paintEdit(); } setTimeout(paint, 60); } }) : null,
          ]));
        });
        c.appendChild(body);
      }
      return c;
    }
    const uniq = (n) => { let t = n, i = 2; while (mine()[t]) t = n + ' ' + i++; return t; };
    function valueOf(packId, n, key) {
      if (packId === '__mine') { const v = mine()[n]; return Object.assign({}, (v && (v.params || v)) || {}); }
      const pk = CP().get(packId), v = pk && pk.items[tool] && pk.items[tool].presets && pk.items[tool].presets[n];
      return Object.assign({}, (v && (v.params || v)) || (rec.ctx.presets.get(key) || {}).params || {});
    }
    function packsHere() {
      const out = [{ id: '__mine', label: 'My presets', names: Object.keys(mine()) }];
      CP().list({ tool }).forEach(p => { const pk = CP().get(p.id); const ps = (pk.items[tool] && pk.items[tool].presets) || {}; if (pk.items[tool] && (Object.keys(ps).length || CP().user.is(p.id))) out.push({ id: p.id, label: p.label, pk, names: Object.keys(ps) }); });
      return out;
    }
    function paint() {
      const ps = packsHere(); list.innerHTML = ''; ps.forEach(p => list.appendChild(card(p)));
      const was = saveTo.value; saveTo.innerHTML = ''; ps.filter(p => p.id === '__mine' || CP().user.is(p.id)).forEach(p => saveTo.appendChild(h('option', { value: p.id, text: p.label })));
      if (Array.from(saveTo.options).some(o => o.value === was)) saveTo.value = was;
    }
    // ---- the value editor (checked against the tool's own schema as you type)
    function paintEdit() {
      ed.innerHTML = ''; if (!editing) return;
      const vals = valueOf(editing.pack, editing.name, editing.key), rows = [], errs = h('div', { class: 'pe-msg bad' });
      const t = h('table', { class: 'pe-table' }, [h('tr', {}, [h('th', { text: 'setting' }), h('th', { text: 'value' }), h('th', { text: 'now' })])]);
      params().forEach(c => {
        const has = c.key in vals, v = has ? vals[c.key] : undefined;
        let inp;
        if (c.type === 'enum') { inp = h('select', { class: 'uk-select' }, [h('option', { value: '', text: '— not set —' })].concat((c.options || []).map(o => { const ov = (o && typeof o === 'object') ? o.value : o; return h('option', { value: String(ov), text: (o && o.label) || String(ov) }); }))); inp.value = has ? String(v) : ''; }
        else if (c.type === 'boolean') { inp = h('select', { class: 'uk-select' }, [h('option', { value: '', text: '— not set —' }), h('option', { value: 'true', text: 'on' }), h('option', { value: 'false', text: 'off' })]); inp.value = has ? String(!!v) : ''; }
        else if (c.type === 'number' || c.type === 'integer') { inp = h('input', { class: 'uk-input', type: 'number', step: c.step || (c.type === 'integer' ? 1 : 'any'), min: c.min, max: c.max, placeholder: 'not set', value: has ? v : '' }); }
        else inp = h('input', { class: 'uk-input', value: has ? v : '', placeholder: 'not set' });
        inp.disabled = !editing.editable;
        rows.push({ c, inp });
        t.appendChild(h('tr', {}, [h('td', { title: c.key, text: (c.group ? c.group + ' · ' : '') + (c.label || c.key) + (c.unit ? ' (' + c.unit + ')' : '') }), h('td', {}, [inp]), h('td', { class: 'uk-hint', text: view.state[c.key] === undefined ? '' : String(view.state[c.key]) })]));
      });
      const read = () => { const o = {}; rows.forEach(({ c, inp }) => { const s = inp.value; if (s === '') return; o[c.key] = c.type === 'boolean' ? s === 'true' : (c.type === 'number' || c.type === 'integer') ? +s : c.type === 'enum' ? ((c.options || []).map(x => (x && typeof x === 'object') ? x.value : x).find(x => String(x) === s)) : s; }); return o; };
      const check = () => { const r = CP().validate({ id: 'check.preset', label: 'check', items: { [tool]: { presets: { [editing.name]: { params: read() } } } } }); errs.textContent = r.ok ? '' : r.errors.join(' · '); return r.ok; };
      rows.forEach(({ inp }) => inp.addEventListener('input', check));
      const btns = [
        UI.Button({ label: '▶ Hear it', hint: 'load these values into the tool now', onClick: () => { if (!check()) return; const v = read(); Object.keys(v).forEach(k => view.emit('config_change', { key: k, value: v[k] })); } }).el,
        editing.editable ? UI.Button({ label: '⟲ Use current sound', hint: 'fill every value from the tool as it is now', onClick: () => { const cur = current(); rows.forEach(({ c, inp }) => { if (cur[c.key] !== undefined) inp.value = String(cur[c.key]); }); check(); } }).el : null,
        editing.editable ? UI.Button({ label: '✓ Save', kind: 'primary', onClick: () => {
          if (!check()) return; const v = { params: read() };
          if (editing.pack === '__mine') view.emit('preset_put', { name: editing.name, value: v }); else { const r = CP().user.putPreset(editing.pack, tool, editing.name, v); if (!r.ok) { errs.textContent = r.errors.join(' · '); return; } }
          say('Saved “' + editing.name + '”.'); setTimeout(paint, 60);
        } }).el : h('span', { class: 'uk-hint', text: 'shipped presets are read-only — ⧉ copy it to change it' }),
        UI.Button({ label: 'Close', onClick: () => { editing = null; paintEdit(); } }).el,
      ];
      ed.append(h('div', { class: 'pe-edhead' }, [h('b', { text: (editing.editable ? '✎ ' : '👁 ') + editing.name }), h('span', { class: 'uk-hint', text: ' — empty = the preset leaves that setting as it is' })]), t, errs, h('div', { class: 'org-row' }, btns));
      check();
    }
    const un = CP().onChange(() => paint()); rec.uiDisposers.push(un);
    view.on('state_sync', () => { if (!list.contains(document.activeElement)) paint(); });
    paint();
    return el;
  }

  function install() {
    if (!global.ToolSettings || !global.ContentPacks) return;
    global.ToolSettings.addSection({ id: 'packs', label: 'Packs & presets', order: 5, when: (d) => (d.config || []).some(c => !c.hidden), make });
  }
  install();
  global.PackEditor = { make };
})(typeof window !== 'undefined' ? window : globalThis);
