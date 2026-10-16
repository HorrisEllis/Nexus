/* __ID__ 0.1.0 — __LABEL__ · spec __TOOL__.spec · template: eravos.tool/1 (generic, domain-agnostic)
 * The engine is the truth for params (config) and ports (hooks). It runs with no window (headless) and
 * talks to the world only through its ports: declared events in/out, typed wires. Nothing else.
 * Replace the example port/param with yours; keep the shape. */
(function () {
  'use strict';
  const S = OrganismSDK.STD;
  OrganismFactory.define({
    id: '__ID__', domain: '__DOMAIN__', version: '0.1.0', label: '__LABEL__', icon: '◆', accent: '#00d4ff',
    category: '__CATEGORY_LABEL__', blurb: 'One sentence: what someone can do with __LABEL__.',
    size: { w: 380, h: 300 }, minSize: { w: 300, h: 220 },
    permissions: ['bus_publish', 'bus_subscribe'],
    provides: ['capability.__TOOL__'],
    hooks: [
      // ports: one in, one out. Types: event topics (with a JSON schema), or typed wires (audio, modulation, image…)
      S.event('__TOOL__.hook.in', 'in', '__TOOL__:input', { type: 'object' }, '1.0.0'),
      S.event('__TOOL__.hook.out', 'out', '__TOOL__:value', { type: 'object', required: ['value'] }, '1.0.0'),
    ],
    config: [
      { key: 'amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Amount', group: 'MAIN' },
      { key: 'mode', type: 'enum', options: ['a', 'b'], default: 'a', label: 'Mode', group: 'MAIN' },
    ],
    ui_hooks: ['poke'],               // UI → engine events this tool accepts (besides the standard ones)
    presets: {},                      // keep empty: presets ship as content packs in packs/<id>/pack.json
    engine(ctx) {
      const P = ctx.params;
      const send = () => ctx.emit('__TOOL__:value', { value: P.get('amount'), mode: P.get('mode') });
      ['amount', 'mode'].forEach(k => P.onChange(k, send));
      ctx.on('__TOOL__:input', { type: 'object' }, (p) => { if (typeof p.amount === 'number') P.set('amount', p.amount); });
      ctx.onUI('poke', null, send);
      ctx.stateExtra = () => ({});     // anything the window needs beyond params
      ctx.saveExtra = () => null;      // anything a save/preset must keep beyond params
      ctx.loadExtra = () => {};
      return { unmount() {} };         // release anything ctx.track() does not
    },
  });
})();
