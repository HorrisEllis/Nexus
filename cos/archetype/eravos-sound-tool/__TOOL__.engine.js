/* __ID__ 0.1.0 — __LABEL__ · template eravos.tool/1 (sound flavour: needs music.engine)
 * Same shape as the generic template, plus: an audio out port and notes in. The music domain's SDK extension gives
 * ctx.ac (AudioContext), ctx.onNote, ctx.track, ctx.dsp. Nothing here knows any other tool. */
(function () {
  'use strict';
  const S = OrganismSDK.STD;
  OrganismFactory.define({
    id: '__ID__', domain: '__DOMAIN__', version: '0.1.0', label: '__LABEL__', icon: '◆', accent: '#00d4ff',
    category: '__CATEGORY_LABEL__', blurb: 'One sentence: what someone can do with __LABEL__.',
    size: { w: 380, h: 300 }, minSize: { w: 300, h: 220 },
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    provides: ['capability.audio_out', 'capability.note_in'],
    hooks: [S.audio_out('__TOOL__.hook.audio_out'), S.note_in('__TOOL__.hook.note_in')],
    config: [
      { key: 'amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Amount', group: 'MAIN' },
      { key: 'mode', type: 'enum', options: ['a', 'b'], default: 'a', label: 'Mode', group: 'MAIN' },
    ],
    ui_hooks: ['poke'],
    presets: {},
    engine(ctx) {
      const ac = ctx.ac, P = ctx.params;
      const out = ac.createGain(); ctx.track(out); ctx.port('out', { kind: 'audio', direction: 'out', node: out, label: '__LABEL__' });
      function play(note, vel, t, dur) {
        t = Math.max(t || ac.currentTime, ac.currentTime); dur = dur || 0.4;
        const o = ac.createOscillator(), g = ac.createGain(); o.type = P.get('mode') === 'a' ? 'sine' : 'sawtooth';
        o.frequency.value = 440 * Math.pow(2, (note - 69) / 12); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * P.get('amount') * 0.5, t + 0.005); g.gain.setTargetAtTime(0, t + dur, 0.05);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.4); o.onended = () => g.disconnect();
      }
      ctx.onNote((p) => play(p.note, p.velocity, p.time, p.duration));
      ctx.onUI('poke', null, () => play(57, 0.9));
      ctx.audition = (p) => play(p.note || 57, p.velocity || 0.9, ac.currentTime, p.duration);
      return { unmount() {} };
    },
  });
})();
