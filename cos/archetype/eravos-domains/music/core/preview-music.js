/* Music previews (3.37) — how a music tool is HEARD before you load a preset (runtime/preview.js asks; this answers).
 * A tool says what it is with `preview: '<role>'` in its define(); the role picks a short phrase in A minor at the
 * song tempo (clamped 90–150 so it is neither a drone nor a blur):
 *   bass  — a one-bar riff, low      chord — two held chords      lead — an eight-note line
 *   hit   — the tool's own one-shot  kit   — a two-bar beat from the kit's own kick / snare / hat pads
 * Effects (audio in + audio out, no role) are heard on a beat and chord stabs played through them. */
(function () {
  'use strict';
  if (!window.Preview) return;
  const isFx = (d) => !d.preview && (d.hooks || []).some(h => h.wire_type === 'audio' && h.direction === 'in') && (d.hooks || []).some(h => h.wire_type === 'audio' && h.direction === 'out');
  const sixteenth = () => { const bpm = Math.max(90, Math.min(150, (window.Kernel && window.Kernel.music && window.Kernel.music.bpm) || 124)); return 15000 / bpm; };
  // steps: [step, fn] played on a 16th grid; returns when the last step has played
  async function grid(api, len, at) { const s = sixteenth(); for (let i = 0; i < len; i++) { at(i); await api.wait(s); } }
  function kitIndex(ctx) {
    const st = ctx.stateExtra ? ctx.stateExtra() : null, bank = st && st.banks ? st.banks[ctx.params.get('bank')] || st.banks[0] : null;
    const find = (vs, def) => { const i = bank ? bank.findIndex(p => vs.includes(p.voice)) : -1; return i >= 0 ? i : def; };
    return { kick: find(['kick', '808'], 0), snare: find(['snare', 'clap'], 1), hat: find(['hat', 'shaker', 'openhat'], 2) };
  }
  const PHRASE = {
    bass: (ctx, api) => { const N = [33, null, 33, 45, null, 36, 33, null, 43, null, 40, 33, null, 33, 45, null]; return grid(api, 16, i => { if (N[i] !== null) ctx.audition({ note: N[i], velocity: 0.9, duration: sixteenth() * 1.6 / 1000 }); }); },
    lead: (ctx, api) => { const N = [69, 72, 76, 74, 72, 69, 67, 69]; return grid(api, 16, i => { if (i % 2 === 0) ctx.audition({ note: N[i / 2], velocity: 0.85, duration: sixteenth() * 1.8 / 1000 }); }); },
    chord: async (ctx, api) => { const s = sixteenth(); for (const ch of [[57, 60, 64, 67], [53, 57, 60, 64]]) { ch.forEach(n => ctx.audition({ note: n, velocity: 0.7, duration: s * 14 / 1000 })); await api.wait(s * 16); } },
    hit: async (ctx, api) => { ctx.audition({ velocity: 0.9 }); await api.wait(2400); },
    kit: (ctx, api) => { const k = kitIndex(ctx); return grid(api, 32, i => { const j = i % 16; if (j === 0 || j === 8 || (i >= 16 && j === 10)) ctx.audition({ index: k.kick, velocity: 1 }); if (j === 4 || j === 12) ctx.audition({ index: k.snare, velocity: 0.9 }); if (j % 2 === 0) ctx.audition({ index: k.hat, velocity: j % 4 ? 0.5 : 0.75 }); }); },
  };
  window.Preview.provide({
    id: 'music',
    match: (d) => d.domain === 'music' && (!!PHRASE[d.preview] || isFx(d)),
    async play(ctx, api) {
      const d = window.OrganismFactory.def(ctx.descriptor.id);
      if (PHRASE[d.preview]) { if (typeof ctx.audition !== 'function') throw new Error(d.label + ' cannot be auditioned'); return PHRASE[d.preview](ctx, api); }
      // an effect: drums + stabs through it
      const drums = api.spawn('eravos.pads'), keys = api.spawn('eravos.retro-poly');
      if (!api.connect(drums, ctx, 'audio') || !api.connect(keys, ctx, 'audio')) throw new Error('could not plug a source into ' + d.label);
      const k = kitIndex(drums), stab = [[57, 60, 64], [55, 59, 62]];
      await grid(api, 32, i => { const j = i % 16; if (j === 0 || j === 8) drums.audition({ index: k.kick, velocity: 1 }); if (j === 4 || j === 12) drums.audition({ index: k.snare, velocity: 0.9 }); if (j % 2 === 0) drums.audition({ index: k.hat, velocity: 0.55 });
        if (j === 0 || j === 6 || j === 11) stab[i >> 4].forEach(n => keys.audition({ note: n, velocity: 0.7, duration: sixteenth() * 1.5 / 1000 })); });
      await api.wait(900);   // let the effect's tail ring (echoes, reverb)
    },
  });
})();
