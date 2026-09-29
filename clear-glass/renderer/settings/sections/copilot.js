'use strict';
/**
 * renderer/settings/sections/copilot.js — Co-pilot  (styles: copilot.css)
 *
 * v0.39.227 — split out of sections/system.js. Connections + co-pilot use
 * src/api/settings.js (ApiSettings — now JAA-backed, src/storage/jaa.js).
 * §0.39.274 — no API-key fallback any more: when copilot is down the pane goes to Ollama or
 * the Guardian agent directly (src/copilot/bridge.js _ask).
 *
 * §EXPANDED 2026-09-26 — James: "expand the copilot settings… make a
 * clearglass hat for the copilot cli." Now covers every real knob the
 * pane's call path reads (src/copilot/bridge.js send/_route/_callNexus-
 * Copilot): default route (ollama | copilot | guardian + agent — the TV
 * menu's toggle), the Clear Glass hat (src/copilot/hat.js — status, forge,
 * persona editor, model), what each call carries (DOM on/off + budget,
 * timeout), whether proposed ```driver commands run on their own, and the
 * CLI reference (renderer/copilot-cli.js's own HELP, not a copy).
 */
(function () {
  const { cg, h, call, toast, busy, field, pane, row, btn, chip, toggle, select, section } = window.CGS;

  const BACKENDS = [
    { value: 'copilot', label: 'copilot — ollama first, then guardian' },
    { value: 'ollama', label: 'ollama — local models only' },
    { value: 'guardian', label: 'guardian — a specific NCP agent' },
  ];
  const AGENTS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek'];

  function num(value, { min, max, step = 1 }) {
    return h('input', { type: 'number', value: String(value), min: String(min), max: String(max), step: String(step) });
  }

  section({
    id: 'copilot', group: 'System', icon: '✦', label: 'Co-pilot',
    keywords: 'copilot raid routing channel offline ollama model hat persona cli backend guardian ollama agent dom context timeout history commands',
    blurb: 'Who answers, the Clear Glass hat it wears, what each message carries, and whether proposed actions run on their own. Every choice here is the default — the pane’s CLI can change it per window.',
    async render({ rerender }) {
      const s = await call(() => cg.api.get(), 'settings');
      const save = (patch, msg) => call(() => cg.api.set(patch), 'save').then(() => msg && toast(msg));
      const onFail = (e) => toast(e.message, 'bad');

      // ── route ─────────────────────────────────────────────────────────
      const backend = select(BACKENDS, s.copilotBackend || 'copilot');
      const agent = select(AGENTS, s.copilotAgent || 'claude');
      const agentField = field('Guardian agent', agent, 'Used when the backend is guardian');
      const syncAgent = () => { agentField.style.display = backend.value === 'guardian' ? '' : 'none'; };
      backend.addEventListener('change', () => { syncAgent(); save({ copilotBackend: backend.value }, 'Default backend saved').catch(onFail); });
      agent.addEventListener('change', () => save({ copilotAgent: agent.value }, 'Guardian agent saved').catch(onFail));
      syncAgent();

      // ── the hat ───────────────────────────────────────────────────────
      let hat = null;
      try { hat = cg.copilot && cg.copilot.hat ? await cg.copilot.hat() : null; } catch (_) { hat = null; }
      const persona = h('textarea', { rows: '8', class: 'mono', value: (hat && hat.personaPrompt) || '' });
      const hatModel = h('input', { type: 'text', value: (hat && hat.model) || '', placeholder: 'Ollama model tag, e.g. qwen2.5:14b (optional)' });
      const hatBody = !hat ? [h('p', { class: 'blurb', text: 'The hat forge isn’t reachable from this window (copilot IPC not wired). The pane still wears the built-in Clear Glass persona.' })] : [
        row(hat.exists ? `\u{1F3A9} ${hat.name}` : `\u{1F3A9} ${hat.name || 'clear_glass'} (built-in)`,
          hat.exists ? `Forged hat${hat.baseAgent ? ` · base ${hat.baseAgent}` : ''}${hat.uuid ? ` · ${hat.uuid.slice(0, 8)}` : ''}. Found by its role (seedKey clear_glass), so renaming it in the forge keeps it working.`
            : 'Not in the hat forge yet — the pane uses the built-in persona below. Forge it to edit it, give it a model, and see it in every NEXUS hat list.',
          hat.exists ? chip('forged', 'ok') : btn('Forge hat', (e) => busy(e.currentTarget, async () => { const r = await cg.copilot.hatEnsure(); if (r && r.ok === false) throw new Error(r.error); toast(`Forged ${r.name}`); rerender(); }), 'sm primary')),
        row('Wear it by default', 'Its persona rides along on every message from the pane. It never switches what co-pilot wears anywhere else.', toggle(s.copilotWearHat !== false, (on) => save({ copilotWearHat: on }))),
        field('Persona', persona, 'Composed into the system prompt when the hat is worn.'),
        hat.exists ? field('Model', hatModel, 'Only used when ollama answers') : null,
        hat.exists ? h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
          btn('Save hat', (e) => busy(e.currentTarget, async () => {
            const patch = { personaPrompt: persona.value.trim() };
            if (hatModel.value.trim() !== ((hat && hat.model) || '')) patch.model = hatModel.value.trim() || undefined;
            const r = await cg.copilot.hatUpdate(patch); if (r && r.ok === false) throw new Error(r.error); toast('Hat saved'); rerender();
          }), 'primary')) : null,
      ];

      // ── behaviour ─────────────────────────────────────────────────────
      const domMax = num(s.copilotDomMaxChars ?? 3000, { min: 500, max: 50000, step: 500 });
      domMax.addEventListener('change', () => save({ copilotDomMaxChars: Math.max(500, Number(domMax.value) || 3000) }, 'DOM budget saved').catch(onFail));
      const timeout = num(Math.round((s.copilotTimeoutMs ?? 60000) / 1000), { min: 5, max: 600 });
      timeout.addEventListener('change', () => save({ copilotTimeoutMs: Math.max(5, Number(timeout.value) || 60) * 1000 }, 'Timeout saved').catch(onFail));
      const hist = num(s.copilotHistoryMax ?? 200, { min: 10, max: 5000, step: 10 });
      hist.addEventListener('change', () => save({ copilotHistoryMax: Math.max(10, Number(hist.value) || 200) }, 'History size saved').catch(onFail));
      const channel = h('input', { type: 'text', value: s.copilotChannel || 'clear-glass' });
      channel.addEventListener('change', () => save({ copilotChannel: channel.value.trim() || 'clear-glass' }, 'Channel saved').catch(onFail));

      // ── when copilot is down (§0.39.274 — no API key; Ollama or Guardian directly) ──
      const ollamaModel = h('input', { type: 'text', value: s.copilotOllamaModel || '', placeholder: 'default (ollama/config.js)' });
      ollamaModel.addEventListener('change', () => save({ copilotOllamaModel: ollamaModel.value.trim() }, 'Ollama model saved').catch(onFail));

      const help = (window.CGCopilotCLI && window.CGCopilotCLI.HELP) || [];

      return [
        pane({ title: 'Route', sub: 'The default for new windows. The pane’s toggle, /backend and /agent change it for one window.', body: [
          h('div', { class: 'grid' }, field('Default backend', backend), agentField),
          h('div', { class: 'flush-rows' },
            row('Route through NEXUS co-pilot', 'Dual cognition, 7-layer context and every NEXUS tool. Off: straight to Ollama or the Guardian agent.', toggle(s.useCortex !== false, (on) => save({ useCortex: on }))),
            row('RAID routing', 'Picks the provider by task type and health.', toggle(s.raidEnabled !== false, (on) => save({ raidEnabled: on })))),
        ] }),
        pane({ title: 'Clear Glass hat', sub: 'A NEXUS hat (lib/hat-forge): a persona the co-pilot wears for the browser.', body: hatBody }),
        pane({ title: 'Each message carries', flush: true, body: [
          row('Live page DOM', 'The DOM chip in the pane starts on or off with this.', toggle(s.copilotDomContext !== false, (on) => save({ copilotDomContext: on }))),
          row('DOM budget', 'Characters of DOM snapshot per message.', domMax),
          row('Timeout', 'Seconds a backend gets before the pane tries the next one (copilot → Ollama / Guardian).', timeout),
        ] }),
        pane({ title: 'Actions', flush: true, body: [
          row('Run proposed actions on their own', 'Off: the pane lists each ```driver command and runs it only on /run. Every run still takes a rewind snapshot where the action supports it.', toggle(s.copilotAutoRunCommands !== false, (on) => save({ copilotAutoRunCommands: on }))),
          row('Show the route under each reply', 'backend · agent · \u{1F3A9} · model · commands', toggle(s.copilotShowRoute !== false, (on) => save({ copilotShowRoute: on }))),
          row('CLI history size', 'Per window, kept for the session.', hist),
        ] }),
        pane({ title: 'Session', body: h('div', { class: 'grid' }, field('Co-pilot channel', channel, 'Sessions are grouped under this name in NEXUS')) }),
        help.length ? pane({ title: 'CLI', sub: 'Type these in the pane. Tab completes, ↑/↓ walks history.', body: h('pre', { class: 'out', text: help.join('\n') }) }) : null,
        pane({ title: 'When the co-pilot service is down', sub: 'The pane answers through Ollama or a Guardian agent directly — guardian first when the route is guardian, Ollama first otherwise. No API key, no external API.', body: [
          h('div', { class: 'grid' }, field('Ollama model', ollamaModel, 'Empty = NEXUS\'s default model')),
        ] }),
      ].filter(Boolean);
    },
  });
})();
