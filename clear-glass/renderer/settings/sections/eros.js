'use strict';
/**
 * renderer/settings/sections/eros.js — ErosmancerOS  (styles: eros.css)
 *
 * v0.39.227 — split out of sections/macros.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
 */
/**
 * renderer/settings/sections/macros.js — Macros (with step builder) + ErosmancerOS
 * §BUILT 2026-09-23. Macros: list/run plus the step builder the 2026-08-29
 * bridge note deferred ("a real step-builder UI is a separate, larger
 * piece... rather than half-built as a bare JSON textarea"). Every step is a
 * real browser_action action (enum fetched live via macros:schema, not
 * hardcoded) or an erosmancer step; create goes through macro.js's own
 * validation, so the UI can't define a macro the engine would refuse.
 * ErosmancerOS: clear-glass's /eros/* proxy onto erosmancer-os's real REST
 * API (health, connect, behavior profile, routing level, hostile state,
 * adaptive patterns).
 */
(function () {
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, select, agentOptions, section } = window.CGS;

  section({
    id: 'eros', group: 'Agents', icon: '\u2767', label: 'ErosmancerOS',
    keywords: 'erosmancer cdp behavior profile hostile routing adaptive replay human-like',
    blurb: 'The CDP engine behind human-like macro steps and hostile-page handling. Reached through Clear Glass\u2019s own wire, so it has to be running on its port for anything here to work.',
    async render({ rerender }) {
      let health;
      try { health = await wire('/eros/health', { allowNotOk: true }); }
      catch (e) { health = { ok: false, error: e.message }; }
      const connected = health.ok && health.state && health.state !== 'disconnected';
      // §0.39.264 — Clear Glass starts ErosmancerOS and connects it to its own DevTools port
      let sup = null;
      try { sup = await wire('/eros-supervisor', { allowNotOk: true }); } catch (_) {}
      const port = h('input', { type: 'number', value: (sup && sup.cdpPort) || 9333, min: 1 });
      const supLine = sup ? (sup.external ? `running on :${sup.port} (started outside Clear Glass)`
        : sup.state === 'manual' ? 'not started by Clear Glass (EROS_AUTOSTART=0)'
        : `${sup.state} on :${sup.port}${sup.pid ? ` · pid ${sup.pid}` : ''}${sup.restarts ? ` · ${sup.restarts} restart(s)` : ''}${sup.lastError && sup.state !== 'running' ? ` · ${sup.lastError}` : ''}`) : null;
      const startBtn = btn(sup && sup.state === 'running' ? 'Reconnect to Clear Glass' : 'Start ErosmancerOS', (e) => busy(e.currentTarget, async () => {
        const r = await wire('/eros-supervisor/start', { method: 'POST', allowNotOk: true });
        toast(r.ok ? 'ErosmancerOS running and connected' : `ErosmancerOS: ${r.lastError || r.state}`, r.ok ? undefined : 'err'); rerender();
      }), 'primary');
      const conn = pane({ title: 'Connection', sub: connected ? `state: ${health.state}${supLine ? ` · ${supLine}` : ''}` : (health.error || 'not connected'),
        tools: chip(connected ? 'connected' : 'disconnected', connected ? 'ok' : 'warn'),
        body: connected
          ? [h('pre', { class: 'out', text: JSON.stringify(health.status, null, 2) }), h('div', { style: { marginTop: '10px' } }, btn('Disconnect', (e) => busy(e.currentTarget, async () => { await wire('/eros/connect', { method: 'DELETE' }); rerender(); }), 'danger'))]
          : [h('p', { class: 'blurb', text: `Clear Glass starts ErosmancerOS with itself and connects it to its own DevTools port.${supLine ? ` Now: ${supLine}.` : ''}` }),
             h('div', { style: { marginTop: '10px' } }, startBtn),
             h('p', { class: 'blurb', style: { marginTop: '14px' }, text: 'Or point Erosmancer at another Chrome DevTools port (a browser started with --remote-debugging-port).' }),
             h('div', { class: 'grid', style: { marginTop: '10px' } }, field('DevTools port', port)),
             h('div', { style: { marginTop: '10px' } }, btn('Connect', (e) => busy(e.currentTarget, async () => { await wire('/eros/connect', { method: 'POST', body: { target: { type: 'local', port: parseInt(port.value, 10) } } }); toast('Erosmancer connected'); rerender(); }), 'primary'))] });
      if (!connected) return conn;

      const [profiles, hostile, patterns] = await Promise.all([
        wire('/eros/behavior/profiles').catch(() => ({ profiles: ['precise', 'cautious', 'exploratory', 'turbo'] })),
        wire('/eros/hostile/state').catch(e => ({ error: e.message })),
        wire('/eros/adaptive/patterns').catch(e => ({ error: e.message })),
      ]);
      const prof = select(profiles.profiles, 'precise');
      const level = select([{ value: 'direct', label: 'Direct' }, { value: 'parallel', label: 'Parallel' }, { value: 'redundant', label: 'Redundant' }], (health.routing && health.routing.level) || 'direct');
      return [conn,
        pane({ title: 'Behaviour', body: [h('div', { class: 'grid' }, field('Default behaviour profile', prof, 'How clicks, typing and mouse paths are timed'), field('Routing level', level, 'How many targets a command is sent through')),
          h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } },
            btn('Apply profile', (e) => busy(e.currentTarget, async () => { await wire('/eros/behavior/profile', { method: 'POST', body: { sessionId: 'default', profile: prof.value } }); toast(`Profile set to ${prof.value}`); })),
            btn('Apply routing', (e) => busy(e.currentTarget, async () => { await wire('/eros/routing/level', { method: 'POST', body: { level: level.value, reason: 'settings' } }); toast(`Routing set to ${level.value}`); })))] }),
        pane({ title: 'Hostile pages', body: hostile.error ? h('div', { class: 'err-box', text: hostile.error }) : h('pre', { class: 'out', text: JSON.stringify(hostile.states, null, 2) }) }),
        pane({ title: 'What it has learned', body: patterns.error ? h('div', { class: 'err-box', text: patterns.error }) : h('pre', { class: 'out', text: JSON.stringify(patterns.patterns, null, 2) }) }),
      ];
    },
  });
})();
