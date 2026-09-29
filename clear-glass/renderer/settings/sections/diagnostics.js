'use strict';
/**
 * renderer/settings/sections/diagnostics.js — Diagnostics  (styles: diagnostics.css)
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

  section({
    id: 'diagnostics', group: 'System', icon: '\u2695', label: 'Diagnostics',
    keywords: 'errors log contract components vault key speech health debug',
    blurb: 'What\u2019s gone wrong recently and what Clear Glass says it can do.',
    async render({ rerender }) {
      const [errs, vault, speech, s] = await Promise.all([cg.errors.recent(40).catch(e => ({ ok: false, error: e.message })), cg.vault.status().catch(() => ({})), cg.speech.available().catch(() => null), cg.api.get().catch(() => ({}))]);
      let contract = null;
      try { contract = await (await fetch(`http://127.0.0.1:${s.ipcPort || 7702}/contract`, { signal: AbortSignal.timeout(2500) })).json(); } catch (e) { contract = { error: e.message }; }
      const errors = (errs && errs.errors) || [];
      const keyChip = (k) => chip(k && k.source === 'safeStorage' ? 'OS keychain' : 'legacy key', k && k.source === 'safeStorage' ? 'ok' : 'warn');
      return [
        pane({ title: 'Recent errors', tools: btn('Refresh', rerender, 'sm'), body: errs.ok === false ? h('div', { class: 'err-box', text: errs.error })
          : errors.length ? h('pre', { class: 'out', text: errors.slice().reverse().map(e => `${e.ts ? new Date(e.ts).toLocaleTimeString() : ''} [${e.source || '?'}] ${e.type || ''} ${e.message || JSON.stringify(e)}${e.count > 1 ? ` \u00D7${e.count}` : ''}`).join('\n') })
          : h('p', { class: 'blurb', text: 'No errors recorded this session.' }) }),
        pane({ title: 'Vaults', flush: true, body: [row('Cookie vault', (vault.cookies && vault.cookies.reason) || 'Saved sessions for every account', keyChip(vault.cookies)), row('Password vault', (vault.passwords && vault.passwords.reason) || 'Saved sign-ins', keyChip(vault.passwords))] }),
        pane({ title: 'Capabilities', sub: contract.error ? contract.error : `v${contract.version} \u00B7 ${(contract.components || []).length} components`, body: contract.error ? null : h('pre', { class: 'out', text: (contract.components || []).map(c => `${c.id.padEnd(34)} ${c.route.method.padEnd(5)} ${c.route.path}`).join('\n') }) }),
        pane({ title: 'Speech to text', body: h('p', { class: 'blurb', text: speech ? JSON.stringify(speech) : 'Unavailable.' }) }),
      ];
    },
  });
})();
