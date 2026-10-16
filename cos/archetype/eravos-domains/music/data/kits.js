/* ERAVOS kit packs (3.30) — drum kits as data, grouped in packs you can switch on/off and mix pad by pad.
 * A kit: 16 pads { voice, tune, decay, level, pan, drive, choke } using the Drum Machine's voices
 * (kick snare hat openhat clap 808 rim tom crash perc shaker cowbell sample). Pad order = screen order (top-left = 1).
 * Add a pack at runtime (a dropped pack can too): KitPacks.add({ id, label, kits: { name: [16 pads] } }).
 * Your own kits live in the pack "Mine" (this browser). Packs you switch off are remembered. */
(function () {
  'use strict';
  const P = (voice, o) => Object.assign({ voice }, o || {});
  const packs = [], STORE = 'eravos.kits.v1';
  const mem = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } })();
  mem.off = mem.off || {}; mem.mine = mem.mine || {};
  const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(mem)); } catch (e) {} };
  // 3.32: kit packs live in the one pack registry (ContentPacks, kind "kits" for eravos.pads); "Mine" stays in this browser
  const CP = window.ContentPacks, PID = (id) => 'kits.' + id;
  CP.kind('kits', { add() {}, remove() {} });   // kits are read on demand (items), nothing to merge
  const KitPacks = window.KitPacks = {
    add(pk) { return CP.add({ id: PID(pk.id), label: pk.label, tags: ['kits', pk.label], items: { 'eravos.pads': { kits: pk.kits } } }); },
    // 3.39: Drum Machine 3.0 kit packs are PRESET packs whose presets carry a kit (extra.kit) — listed here from the same
    // data (one source, two views: the tool's preset menu and this page); their id is '@<pack id>'
    list: () => CP.list({ tool: 'eravos.pads', kind: 'kits' }).map(p => ({ id: p.id.replace(/^kits\./, ''), label: p.label, kits: CP.get(p.id).items['eravos.pads'].kits }))
      .concat(CP.list({ tool: 'eravos.pads', kind: 'presets' }).map(p => { const pr = (CP.get(p.id).items['eravos.pads'] || {}).presets || {}, ks = {}; Object.keys(pr).forEach(n => { if (pr[n].extra && Array.isArray(pr[n].extra.kit)) ks[n] = pr[n].extra.kit; }); return { id: '@' + p.id, label: p.label, kits: ks }; }).filter(p => Object.keys(p.kits).length))
      .concat([{ id: 'mine', label: 'Mine', kits: mem.mine }]),
    enabled: (id) => id === 'mine' ? !mem.off.mine : id[0] === '@' ? CP.enabled(id.slice(1)) : CP.enabled(PID(id)),
    toggle(id, on) { if (id === 'mine') { if (on) delete mem.off.mine; else mem.off.mine = 1; keep(); } else CP.setEnabled(id[0] === '@' ? id.slice(1) : PID(id), on); },
    saveMine(name, pads) { mem.mine[name] = pads.map(p => Object.assign({}, p)); keep(); },
    removeMine(name) { delete mem.mine[name]; keep(); },
    kits() { return KitPacks.list().filter(p => KitPacks.enabled(p.id)).flatMap(p => Object.keys(p.kits).map(n => ({ pack: p.label, packId: p.id, name: n, pads: p.kits[n] }))); },
  };
  KitPacks.add({ id: 'island', label: 'Island', kits: {
    'Roots One Drop': [P('kick', { tune: -3, decay: 0.5 }), P('rim', { tune: -2, decay: 0.12 }), P('hat', { tune: -2, decay: 0.06 }), P('openhat', { decay: 0.3 }),
      P('snare', { tune: -4, decay: 0.3 }), P('clap', { decay: 0.2, level: 0.8 }), P('tom', { tune: -5, decay: 0.5 }), P('tom', { tune: 2, decay: 0.4 }),
      P('shaker', { decay: 0.1, level: 0.7 }), P('perc', { tune: -7 }), P('cowbell', { tune: -5, level: 0.7 }), P('crash', { decay: 2.5, level: 0.6 }),
      P('808', { tune: -5, decay: 1.2 }), P('rim', { tune: 5, decay: 0.06 }), P('kick', { tune: -7, decay: 0.9, drive: 0.2 }), P('sample')],
    'Steppers': [P('kick', { tune: -2, decay: 0.45, drive: 0.25 }), P('snare', { tune: -2, decay: 0.25 }), P('hat', { decay: 0.045 }), P('openhat', { decay: 0.35 }),
      P('rim', { decay: 0.1 }), P('clap', { decay: 0.3 }), P('tom', { tune: -7 }), P('tom'),
      P('shaker'), P('perc', { tune: 4 }), P('cowbell', { tune: -3 }), P('crash', { decay: 2 }),
      P('808', { tune: -3, decay: 1.5 }), P('snare', { tune: 7, decay: 0.1 }), P('kick', { tune: -9, decay: 1.2 }), P('sample')],
    'Bun Dem (dancehall)': [P('kick', { tune: 1, decay: 0.35, drive: 0.4 }), P('snare', { tune: 3, decay: 0.15, drive: 0.2 }), P('hat', { tune: 4, decay: 0.03 }), P('openhat', { decay: 0.25 }),
      P('rim', { tune: 4, decay: 0.07 }), P('clap', { tune: 2, decay: 0.2 }), P('perc', { tune: 9 }), P('perc', { tune: 2 }),
      P('shaker', { decay: 0.08 }), P('cowbell'), P('tom', { tune: 9, decay: 0.2 }), P('crash', { decay: 1.6 }),
      P('808', { decay: 1.1, drive: 0.3 }), P('snare', { tune: 12, decay: 0.06 }), P('clap', { tune: -3, decay: 0.5 }), P('sample')],
  } });
  KitPacks.add({ id: '80s', label: '80s', kits: {
    'LinnDrum Room': [P('kick', { tune: 1, decay: 0.3 }), P('snare', { tune: 2, decay: 0.45 }), P('hat', { tune: 2, decay: 0.05 }), P('openhat', { tune: 2, decay: 0.4 }),
      P('clap', { decay: 0.35 }), P('rim', { decay: 0.1 }), P('tom', { tune: 5, decay: 0.6 }), P('tom', { tune: 0, decay: 0.6 }),
      P('tom', { tune: -5, decay: 0.7 }), P('cowbell', { tune: 2 }), P('shaker'), P('crash', { decay: 2.4 }),
      P('perc', { tune: 5 }), P('snare', { tune: -3, decay: 0.8, drive: 0.15 }), P('kick', { tune: -3, decay: 0.6 }), P('sample')],
    "Gated '84": [P('kick', { tune: 2, decay: 0.25, drive: 0.2 }), P('snare', { tune: 0, decay: 0.32, drive: 0.35 }), P('hat', { decay: 0.04 }), P('openhat', { decay: 0.3 }),
      P('clap', { decay: 0.32, drive: 0.2 }), P('rim'), P('tom', { tune: 7, decay: 0.32, drive: 0.3 }), P('tom', { tune: 2, decay: 0.32, drive: 0.3 }),
      P('tom', { tune: -3, decay: 0.32, drive: 0.3 }), P('cowbell'), P('shaker'), P('crash', { decay: 1.8 }),
      P('snare', { tune: 5, decay: 0.2, drive: 0.4 }), P('clap', { tune: -2, decay: 0.45 }), P('kick', { tune: -1, decay: 0.4, drive: 0.4 }), P('sample')],
  } });
  KitPacks.add({ id: 'street', label: 'Street', kits: {
    'Trap 808': [P('kick', { tune: 0, decay: 0.35, drive: 0.5 }), P('snare', { tune: 4, decay: 0.2 }), P('hat', { tune: 5, decay: 0.025 }), P('openhat', { tune: 3, decay: 0.3 }),
      P('clap', { tune: 1, decay: 0.3 }), P('808', { tune: -2, decay: 2.2, drive: 0.35 }), P('rim', { tune: 6 }), P('perc', { tune: 12 }),
      P('crash', { decay: 2 }), P('hat', { tune: 9, decay: 0.02, level: 0.7 }), P('shaker', { decay: 0.06 }), P('cowbell', { tune: 5 }),
      P('808', { tune: 5, decay: 1.6, drive: 0.5 }), P('snare', { tune: 9, decay: 0.08 }), P('808', { tune: -7, decay: 3, drive: 0.6 }), P('sample')],
    'Phonk Cowbell': [P('kick', { tune: -1, decay: 0.4, drive: 0.7 }), P('snare', { tune: 2, decay: 0.2, drive: 0.4 }), P('hat', { decay: 0.03 }), P('openhat', { decay: 0.25 }),
      P('cowbell', { tune: 0, decay: 0.35, drive: 0.4 }), P('cowbell', { tune: 3, decay: 0.35, drive: 0.4 }), P('cowbell', { tune: 7, decay: 0.35, drive: 0.4 }), P('cowbell', { tune: -5, decay: 0.45, drive: 0.4 }),
      P('808', { decay: 1.8, drive: 0.8 }), P('clap', { decay: 0.3, drive: 0.3 }), P('rim', { drive: 0.4 }), P('crash', { decay: 1.5 }),
      P('808', { tune: 3, decay: 1.2, drive: 0.9 }), P('cowbell', { tune: 12, decay: 0.25, drive: 0.5 }), P('kick', { tune: -6, decay: 0.8, drive: 0.9 }), P('sample')],
    'Lo-fi Dust': [P('kick', { tune: -2, decay: 0.3, level: 0.9 }), P('snare', { tune: -5, decay: 0.2, level: 0.85 }), P('hat', { tune: -6, decay: 0.04, level: 0.6 }), P('openhat', { tune: -6, decay: 0.25, level: 0.6 }),
      P('rim', { tune: -3, decay: 0.08 }), P('shaker', { tune: -4, level: 0.6 }), P('tom', { tune: -3, decay: 0.35 }), P('perc', { tune: -8 }),
      P('clap', { tune: -4, decay: 0.2, level: 0.7 }), P('cowbell', { tune: -9, level: 0.5 }), P('crash', { tune: -5, decay: 2, level: 0.5 }), P('808', { tune: -4, decay: 0.9 }),
      P('snare', { tune: -9, decay: 0.12, level: 0.6 }), P('kick', { tune: -6, decay: 0.5, level: 0.8 }), P('sample'), P('sample')],
  } });
  KitPacks.add({ id: 'dark', label: 'Dark', kits: {
    'Witch House': [P('kick', { tune: -5, decay: 0.9, drive: 0.3 }), P('snare', { tune: -9, decay: 0.6 }), P('hat', { tune: -9, decay: 0.08 }), P('openhat', { tune: -7, decay: 0.8 }),
      P('clap', { tune: -7, decay: 0.7 }), P('808', { tune: -9, decay: 3 }), P('rim', { tune: -9 }), P('tom', { tune: -12, decay: 1.2 }),
      P('crash', { tune: -12, decay: 4 }), P('perc', { tune: -12 }), P('shaker', { tune: -9, decay: 0.3 }), P('cowbell', { tune: -12, decay: 0.8 }),
      P('808', { tune: -14, decay: 4, drive: 0.4 }), P('snare', { tune: -14, decay: 1.2, drive: 0.3 }), P('kick', { tune: -12, decay: 2, drive: 0.5 }), P('sample')],
    'Industrial Goth': [P('kick', { tune: -1, decay: 0.35, drive: 1 }), P('snare', { tune: -2, decay: 0.35, drive: 0.9 }), P('hat', { tune: 7, decay: 0.05, drive: 0.6 }), P('openhat', { tune: 5, decay: 0.4, drive: 0.6 }),
      P('clap', { decay: 0.4, drive: 0.8 }), P('rim', { tune: -5, drive: 1 }), P('tom', { tune: -7, decay: 0.5, drive: 0.8 }), P('tom', { tune: -12, decay: 0.7, drive: 0.8 }),
      P('crash', { tune: -3, decay: 2.5, drive: 0.5 }), P('perc', { tune: -14, drive: 1 }), P('cowbell', { tune: -9, drive: 1 }), P('shaker', { drive: 0.7 }),
      P('808', { tune: -5, decay: 1.5, drive: 1 }), P('snare', { tune: 7, decay: 0.12, drive: 1 }), P('kick', { tune: -9, decay: 1, drive: 1 }), P('sample')],
  } });
})();
