'use strict';
/**
 * renderer/settings/sections/connections.js — Connections  (styles: connections.css)
 *
 * v0.39.227 — split out of sections/system.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
 */
/**
 * renderer/settings/sections/system.js — Connections, Co-pilot, Diagnostics
 * §BUILT 2026-09-23. Connections + co-pilot: src/api/settings.js (ApiSettings,
 * the same file-backed store the old page used — not a second config
 * mechanism). (§0.39.274: the API-key fallback is gone — nothing here holds a key.) Diagnostics: errors:recent, vault key
 * status, the live /contract, speech availability.
 */
(function () {
  const { cg, h, call, toast, busy, field, pane, row, btn, chip, toggle, select, section } = window.CGS;

  const NEXUS_PORTS = [['orchestratorPort', 'Orchestrator', 9000], ['cortexPort', 'Cortex', 3748], ['guardianPort', 'Guardian', 7820], ['copilotPort', 'Co-pilot', 3750], ['ollamaPort', 'Ollama bridge', 3749], ['idearium', 'Idearium', 4800]];
  const CG_PORTS = [['ssePort', 'Event stream', 7701], ['ipcPort', 'Command server', 7702], ['tlsPort', 'TLS proxy (JA4)', 7703]];

  async function probe(port) {
    const t0 = performance.now();
    try { const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2500) }); return { ok: r.ok, ms: Math.round(performance.now() - t0), status: r.status }; }
    catch (e) { return { ok: false, ms: null, status: e.name === 'TimeoutError' ? 'timeout' : 'unreachable' }; }
  }

  section({
    id: 'connections', group: 'System', icon: '\u2301', label: 'Connections',
    keywords: 'ports health probe orchestrator cortex guardian copilot ollama idearium sse ipc tls wire',
    blurb: 'Where Clear Glass finds the rest of NEXUS. Port changes take effect after a restart.',
    async render() {
      const s = await call(() => cg.api.get(), 'settings');
      const inputs = {};
      const statusCells = {};
      const mk = ([k, l, d]) => { inputs[k] = h('input', { type: 'number', class: 'mono', min: 1, max: 65535, value: s[k] || d }); statusCells[k] = h('span'); return field(l, h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, inputs[k], statusCells[k])); };
      const probeAll = async () => {
        await Promise.all([...NEXUS_PORTS, ...CG_PORTS.filter(p => p[0] === 'ipcPort')].map(async ([k]) => {
          statusCells[k].replaceChildren(chip('\u2026', 'plain'));
          const r = await probe(parseInt(inputs[k].value, 10));
          statusCells[k].replaceChildren(chip(r.ok ? `${r.ms} ms` : String(r.status), r.ok ? 'ok' : 'bad'));
        }));
      };
      const saveBtn = btn('Save ports', (e) => busy(e.currentTarget, async () => {
        const patch = {};
        for (const [k] of [...NEXUS_PORTS, ...CG_PORTS]) {
          const v = parseInt(inputs[k].value, 10);
          if (!(v > 0 && v < 65536)) throw new Error(`${k}: ${inputs[k].value} isn\u2019t a port number.`);
          patch[k] = v;
        }
        await call(() => cg.api.set(patch), 'save'); toast('Ports saved — restart Clear Glass to apply');
      }), 'primary');
      setTimeout(probeAll, 0);
      return [
        pane({ title: 'NEXUS services', tools: btn('Check again', probeAll, 'sm'), body: h('div', { class: 'grid' }, NEXUS_PORTS.map(mk)) }),
        pane({ title: 'Clear Glass', sub: `Wire server (mesh, automation, Erosmancer proxy): ${window.CGS.WIRE_PORT}`, body: h('div', { class: 'grid' }, CG_PORTS.map(mk)) }),
        h('div', {}, saveBtn),
      ];
    },
  });
})();
