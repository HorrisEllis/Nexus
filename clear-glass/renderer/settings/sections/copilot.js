'use strict';
/**
 * renderer/settings/sections/copilot.js — Co-pilot  (styles: copilot.css)
 *
 * v0.39.227 — split out of sections/system.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
 */
/**
 * renderer/settings/sections/system.js — Connections, Co-pilot, Diagnostics
 * §BUILT 2026-09-23. Connections + co-pilot: src/api/settings.js (ApiSettings,
 * the same file-backed store the old page used — not a second config
 * mechanism). The fallback key is write-only from here: getPublic() never
 * returns it, only hasFallbackKey. Diagnostics: errors:recent, vault key
 * status, the live /contract, speech availability.
 */
(function () {
  const { cg, h, call, toast, busy, field, pane, row, btn, chip, toggle, select, section } = window.CGS;

  section({
    id: 'copilot', group: 'System', icon: '\u2726', label: 'Co-pilot',
    keywords: 'copilot raid routing channel fallback api key model offline',
    blurb: 'Co-pilot runs through NEXUS: Ollama first, then Guardian\u2019s provider tabs. The fallback key is only for when NEXUS itself is down.',
    async render({ rerender }) {
      const s = await call(() => cg.api.get(), 'settings');
      const save = (patch, msg) => call(() => cg.api.set(patch), 'save').then(() => msg && toast(msg));
      const channel = h('input', { type: 'text', value: s.copilotChannel || 'clear-glass' });
      channel.addEventListener('change', () => save({ copilotChannel: channel.value.trim() || 'clear-glass' }, 'Channel saved').catch(e => toast(e.message, 'bad')));
      const key = h('input', { type: 'password', autocomplete: 'off', placeholder: s.hasFallbackKey ? 'A key is saved \u2014 type to replace it' : 'sk-ant-\u2026' });
      const model = select(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'], s.fallbackModel || 'claude-sonnet-4-6');
      model.addEventListener('change', () => save({ fallbackModel: model.value }, 'Model saved').catch(e => toast(e.message, 'bad')));
      return [
        pane({ title: 'Routing', flush: true, body: [
          row('Route through NEXUS co-pilot', 'Dual cognition, 7-layer context and every NEXUS tool. Off means fallback-only.', toggle(s.useCortex !== false, (on) => save({ useCortex: on }))),
          row('RAID routing', 'Picks the provider by task type and health.', toggle(s.raidEnabled !== false, (on) => save({ raidEnabled: on }))),
        ] }),
        pane({ title: 'Session', body: h('div', { class: 'grid' }, field('Co-pilot channel', channel)) }),
        pane({ title: 'Offline fallback', sub: s.hasFallbackKey ? 'A key is saved.' : 'No key saved \u2014 fallback is off.', body: [
          h('div', { class: 'grid' }, field('Anthropic API key', key), field('Model', model)),
          h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } },
            btn('Save key', (e) => busy(e.currentTarget, async () => { if (!key.value.trim()) throw new Error('Paste a key first.'); await save({ fallbackApiKey: key.value.trim() }); toast('Fallback key saved'); rerender(); }), 'primary'),
            s.hasFallbackKey ? btn('Remove key', (e) => busy(e.currentTarget, async () => { await save({ fallbackApiKey: '' }); toast('Fallback key removed'); rerender(); }), 'danger') : null),
        ] }),
      ];
    },
  });
})();
