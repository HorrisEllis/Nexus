/* ERAVOS Sounds (3.30) — one page, off the canvas, for every sound you have:
 *   PRESETS  browse every tool's presets by pack (tag) · load into a window on the canvas · add a new window with it ·
 *            save the window's current sound as your own preset
 *   KITS     drum kit packs (data/kits.js): switch packs on/off · load a kit into a Drum Machine · mix & match:
 *            pick a pad from any kit, drop it on any pad of your kit · save your bank as a kit ("Mine")
 *   CAPTURE  record any tool's output for a beat / bar and put it on a Drum Machine pad (save sounds as pad clips)
 * Talks to tools only through their ui:* events and org:state_sync — the same doors their own windows use. */
(function () {
  'use strict';
  const COLOR = { kick: '#ff2266', snare: '#ffaa00', hat: '#ffdd00', openhat: '#ddff44', clap: '#ff66aa', '808': '#aa44ff', rim: '#ff8844', tom: '#44ccff', crash: '#88ffee', perc: '#00ff88', shaker: '#ccff99', cowbell: '#ffcc66', sample: '#aa44ff' };
  let open = null;
  const K = () => window.Kernel, F = () => window.OrganismFactory;
  const inst = (org) => K().registry.byOrganism(org).map(r => r.instance_id);
  const labelOf = (id) => { const r = K().registry.get(id); return r ? (r.descriptor.icon || '') + ' ' + r.descriptor.label + ' ' + id.split('-').slice(-1)[0] : id; };
  function stateOf(id) { return new Promise(res => { let un = K().bus.subscribe('org:state_sync:' + id, (s) => { un(); res(s); }); K().bus.publish('ui:request_state:' + id, {}); setTimeout(() => { un(); res(null); }, 400); }); }
  function audioOut(id) { const r = K().registry.get(id); if (!r) return null; const hk = Array.from(r.hooks.values()).find(x => x.wire_type === 'audio' && x.direction === 'out'); const pt = hk && K().audio.port(id, hk.port || 'out'); return pt && pt.node; }

  function show(tab) {
    if (open) { open.close(); if (!tab) return; }
    const UI = window.UIKit, h = UI.h, S = window.Shell; if (S && S.X) S.X.enterMode('music');
    let view = tab || 'presets', tool = null, q = '', picked = null, drum = inst('eravos.pads')[0] || null;
    const ov = h('div', { class: 'overlay sbk snd', role: 'dialog', 'aria-label': 'Sounds' });
    const tabs = h('div', { class: 'sbk-chips' }), body = h('div', { class: 'snd-body' });
    const close = () => { if (window.Preview) window.Preview.stop(); ov.remove(); document.removeEventListener('keydown', key, true); open = null; };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    ov.append(h('div', { class: 'sbk-box' }, [h('header', { class: 'sbk-head' }, [h('div', {}, [h('b', { text: '🎚 Sounds' }), h('span', { class: 'sbk-sub', text: ' presets · drum kits · capture any sound to a pad' })]), h('button', { class: 'sbk-x', text: '×', title: 'Close (Esc)', onclick: close })]), tabs, body]));
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', key, true);
    const toast = (t, k) => S && S.toast(t, k || 'good', 2200);
    function paint() {
      tabs.innerHTML = ''; [['presets', '🎛 Presets'], ['kits', '🥁 Kits'], ['capture', '🎙 Capture → pad']].forEach(([id, l]) => tabs.appendChild(h('button', { class: 'sbk-chip' + (view === id ? ' on' : ''), text: l, onclick: () => { view = id; paint(); } })));
      body.innerHTML = '';
      if (view === 'presets') presets(); else if (view === 'kits') kits(); else capture();
    }
    // ------------------------------------------------ presets
    function presets() {
      const defs = F().defined().filter(d => !d.hidden && d.presets && Object.keys(d.presets).length).sort((a, b) => a.label.localeCompare(b.label));
      if (!tool) tool = defs[0] && defs[0].id;
      const search = h('input', { class: 'ap-search', placeholder: 'Search presets in every tool…', value: q }); search.oninput = () => { q = search.value.toLowerCase(); paint(); setTimeout(() => { const s = body.querySelector('input'); if (s) { s.focus(); s.selectionStart = s.selectionEnd = s.value.length; } }, 0); };
      const rail = h('nav', { class: 'snd-rail' }, defs.map(d => h('button', { class: 'snd-tool' + (d.id === tool ? ' on' : ''), text: (d.icon || '') + ' ' + d.label + '  ' + Object.keys(d.presets).length, onclick: () => { tool = d.id; paint(); } })));
      const list = h('div', { class: 'snd-list' });
      const shown = q ? defs : defs.filter(d => d.id === tool);
      shown.forEach(d => {
        const names = Object.keys(d.presets).filter(n => !q || (d.label + ' ' + n).toLowerCase().includes(q)); if (!names.length) return;
        const groups = {}; names.forEach(n => { const g = n.includes(' · ') ? n.split(' · ')[0] : 'Built-in'; (groups[g] = groups[g] || []).push(n); });
        list.appendChild(h('div', { class: 'boot-sec', text: (d.icon || '') + ' ' + d.label }));
        Object.keys(groups).forEach(g => { list.appendChild(h('div', { class: 'snd-tag', text: g })); list.appendChild(h('div', { class: 'snd-grid' }, groups[g].map(n => { const b = h('button', { class: 'snd-preset', text: n.includes(' · ') ? n.split(' · ').slice(1).join(' · ') : n, title: 'click: load into the window on the canvas (or add one)', onclick: () => use(d.id, n) }), pv = window.Preview && window.Preview.button(d.id, n); return pv ? h('span', { class: 'pv-row' }, [pv, b]) : b; }))); });
      });
      const t = tool && inst(tool);
      const nameIn = h('input', { class: 'uk-text', placeholder: 'My sound', style: { width: '140px' } });
      const side = h('aside', { class: 'snd-side' }, [h('h4', { text: 'Your windows' }),
        h('p', { class: 'sbk-note', style: { padding: 0 }, text: t && t.length ? 'A preset loads into: ' + labelOf(t[0]) + (t.length > 1 ? ' (the first of ' + t.length + ')' : '') : 'None of this tool on the canvas yet — clicking a preset adds one with it.' }),
        t && t.length ? h('div', { class: 'org-row' }, [nameIn, h('button', { class: 'sbk-alt', text: '＋ Save its sound', onclick: () => { const n = nameIn.value.trim(); if (!n) return nameIn.focus(); K().bus.publish('ui:preset_save:' + t[0], { name: n }); toast('Saved “' + n + '” — it is in that tool’s preset menu as user:' + n); } })]) : h('span')]);
      body.append(h('div', { class: 'snd-cols' }, [rail, h('div', {}, [search, list]), side]));
    }
    function use(org, name) {
      let id = inst(org)[0];
      if (!id) { id = F().spawn(org); if (!id) return; }
      K().bus.publish('ui:preset_load:' + id, { name }); toast('Loaded “' + name + '” into ' + labelOf(id));
    }
    // ------------------------------------------------ kits
    async function kits() {
      const KP = window.KitPacks; if (!KP) { body.textContent = 'No kit packs installed.'; return; }
      const drums = inst('eravos.pads'); if (drum && !drums.includes(drum)) drum = drums[0] || null; if (!drum) drum = drums[0] || null;
      const packsRow = h('div', { class: 'sbk-chips', style: { borderBottom: 0, paddingLeft: 0 } }, [h('span', { class: 'snd-tag', text: 'Packs:' })].concat(KP.list().map(p => h('button', { class: 'sbk-chip' + (KP.enabled(p.id) ? ' on' : ''), text: (KP.enabled(p.id) ? '✓ ' : '') + p.label + ' (' + Object.keys(p.kits).length + ')', title: 'switch this pack on/off', onclick: () => { KP.toggle(p.id, !KP.enabled(p.id)); paint(); } }))));
      const chip = (pd, on, click, title) => h('button', { class: 'snd-pad' + (on ? ' on' : ''), style: { '--c': COLOR[pd.voice] || '#888' }, title: title || pd.voice + (pd.tune ? ' ' + (pd.tune > 0 ? '+' : '') + pd.tune : ''), text: pd.voice === 'sample' ? (pd.sample ? '◉' : '＋') : pd.voice.slice(0, 4), onclick: click });
      const list = h('div', { class: 'snd-kits' }, KP.kits().map(k => h('div', { class: 'snd-kit' }, [
        h('div', { class: 'org-row', style: { justifyContent: 'space-between', margin: 0 } }, [h('b', { text: k.name }), h('small', { class: 'snd-tag', text: k.pack })]),
        h('div', { class: 'snd-pads' }, k.pads.map((pd, i) => chip(pd, picked && picked.kit === k.name && picked.i === i, () => { picked = { kit: k.name, i, pad: pd }; paint(); }, 'pick this pad, then click a pad of YOUR kit (right) to put it there'))),
        h('div', { class: 'org-row', style: { margin: 0 } }, [h('button', { class: 'sbk-alt', text: drum ? '⇢ Load kit' : '＋ Drum Machine with this kit', onclick: () => { if (!drum) drum = F().spawn('eravos.pads'); if (!drum) return; K().bus.publish('ui:kit_load:' + drum, { pads: k.pads }); toast('Loaded ' + k.name); paint(); } }),
          k.packId === 'mine' ? h('button', { class: 'sbk-alt', text: '🗑', title: 'delete this kit', onclick: () => { KP.removeMine(k.name); paint(); } }) : h('span')]),
      ])));
      const side = h('aside', { class: 'snd-side' }, [h('h4', { text: 'Your kit' })]);
      if (!drum) side.append(h('p', { class: 'sbk-note', style: { padding: 0 }, text: 'No Drum Machine on the canvas. Load any kit to add one.' }));
      else {
        if (drums.length > 1) side.append(UI.Select({ options: drums.map(d => ({ value: d, label: labelOf(d) })), value: drum, onChange: (v) => { drum = v; paint(); } }).el);
        const s = await stateOf(drum); if (!open || view !== 'kits') return;
        const bank = s && s.banks ? s.banks[s.params.bank] : null;
        side.append(h('p', { class: 'sbk-note', style: { padding: 0 }, text: picked ? 'Now click a pad here to put “' + picked.pad.voice + '” from ' + picked.kit + ' on it.' : 'Pick a pad in any kit, then click a pad here — mix and match.' }));
        if (bank) side.append(h('div', { class: 'snd-pads big' }, bank.map((pd, i) => chip(pd, false, () => { if (!picked) { K().bus.publish('ui:pad_press:' + drum, { index: i, velocity: 0.9 }); return; } K().bus.publish('ui:pad_set:' + drum, { index: i, pad: picked.pad }); picked = null; paint(); }, picked ? 'put the picked pad here' : 'hear it'))));
        const nm = h('input', { class: 'uk-text', placeholder: 'Kit name', style: { width: '130px' } });
        side.append(h('div', { class: 'org-row' }, [nm, h('button', { class: 'sbk-alt', text: '＋ Save as my kit', onclick: () => { const n = nm.value.trim(); if (!n || !bank) return nm.focus(); KP.saveMine(n, bank); toast('Saved kit “' + n + '” in Mine'); paint(); } })]));
      }
      body.append(packsRow, h('div', { class: 'snd-cols two' }, [list, side]));
    }
    // ------------------------------------------------ capture any sound to a pad
    async function capture() {
      const isDock = (r) => !!((F().def(r.organism_id) || {}).dock); const srcs = K().registry.list().filter(r => r.organism_id !== 'eravos.pads' && audioOut(r.instance_id)).sort((a, b) => isDock(a) - isDock(b)).map(r => r.instance_id), drums = inst('eravos.pads');
      const foc = window.CanvasWM && window.CanvasWM.focused; const own = srcs.filter(i => !isDock(K().registry.get(i))); let src = srcs.includes(foc) ? foc : (own[own.length - 1] || srcs[0]), len = '1 bar', target = drums[0], padIx = -1;
      const go = h('button', { class: 'sbk-go', text: '● Capture', disabled: !src });
      const status = h('p', { class: 'sbk-note', style: { padding: 0 } });
      const row = (l, el) => h('div', { class: 'org-row' }, [h('span', { class: 'snd-tag', text: l }), el]);
      body.append(h('div', { class: 'snd-cap' }, [
        h('p', { text: 'Record what a tool plays — a chord, a wub, a riser, her voice through an effect — and put it on a Drum Machine pad. Press Capture, then play the sound (or press Space) — it records for the length you choose.' }),
        srcs.length ? row('From', UI.Select({ options: srcs.map(d => ({ value: d, label: labelOf(d) })), value: src, onChange: (v) => { src = v; } }).el) : h('p', { class: 'sbk-lock', text: 'Nothing on the canvas makes sound yet — add a synth, then come back.' }),
        row('Length', UI.Select({ options: ['1 beat', '2 beats', '1 bar', '2 bars'], value: len, onChange: (v) => { len = v; } }).el),
        row('To pad', UI.Select({ options: [{ value: -1, label: 'first empty sample pad' }].concat(Array.from({ length: 16 }, (_, i) => ({ value: i, label: 'pad ' + (i + 1) }))), value: -1, onChange: (v) => { padIx = +v; } }).el),
        drums.length > 1 ? row('Drum Machine', UI.Select({ options: drums.map(d => ({ value: d, label: labelOf(d) })), value: target, onChange: (v) => { target = v; } }).el) : h('span'),
        h('div', { class: 'org-row' }, [go]), status]));
      go.onclick = async () => {
        const node = audioOut(src); if (!node) return;
        const ac = K().audio.ctx, beats = { '1 beat': 1, '2 beats': 2, '1 bar': 4, '2 bars': 8 }[len], sec = beats * 60 / ((window.Transport && window.Transport.bpm) || 120);
        // armed: recording starts with the first sound the tool makes (up to 10 s wait), and keeps exactly the length you chose
        const rec = window.AudioRecorder.create(ac, node); await rec.ready; go.disabled = true; status.textContent = '◌ armed — play the sound now (it starts recording on the first note)';
        const an = ac.createAnalyser(); an.fftSize = 512; node.connect(an); const d = new Float32Array(512);
        await rec.start(); let onset = null; const t0 = ac.currentTime;
        while (ac.currentTime - t0 < 10 && onset === null) { await new Promise(r => setTimeout(r, 15)); an.getFloatTimeDomainData(d); if (d.some(v => Math.abs(v) > 0.003)) onset = Math.max(0, ac.currentTime - 0.04); }
        if (onset !== null) { status.textContent = '● recording ' + sec.toFixed(2) + ' s'; await new Promise(r => setTimeout(r, sec * 1000 + 120)); }
        const chunks = await rec.stop(); rec.dispose(); try { node.disconnect(an); } catch (e) {} go.disabled = false;
        if (onset === null) { status.textContent = 'Nothing played within 10 seconds — press Capture and play the sound.'; return; }
        const f0 = Math.round(onset * ac.sampleRate), buf = rec.assemble(chunks, f0, f0 + Math.round(sec * ac.sampleRate));
        if (!buf || !buf.length) { status.textContent = 'Nothing was recorded.'; return; }
        let peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 7) peak = Math.max(peak, Math.abs(d[i])); }
        if (peak < 0.001) { status.textContent = 'It was silent — play the sound while it records (or press Space first).'; return; }
        const name = labelOf(src).trim() + ' ' + len, wav = window.AudioRecorder.encodeWAV(buf, 24), a = K().assets.register(wav, { name: name + '.wav', mime: 'audio/wav' });
        if (!target) target = F().spawn('eravos.pads');
        K().bus.publish('asset:ready', Object.assign({ hash: a.hash, name, target }, padIx >= 0 ? { pad: padIx } : {}));
        K().bus.publish('sounds:captured', { name, target });
        status.textContent = '✓ “' + name + '” is on ' + (padIx >= 0 ? 'pad ' + (padIx + 1) : 'the first empty sample pad') + ' of ' + labelOf(target) + '. Hit it.';
      };
    }
    paint(); document.body.appendChild(ov); open = { close };
  }
  window.Sounds = { open: show };
})();
