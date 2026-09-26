'use strict';
/**
 * renderer/settings/sections/privacy.js — Privacy & data  (styles: privacy.css)
 *
 * v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
 */
/**
 * renderer/settings/sections/browser.js — General, Autofill & screen answers, Privacy
 * §BUILT 2026-09-23. General: NexusOptions (window behaviour, start page,
 * download folder, co-pilot pane, background-tab default) + toolbar pins from
 * src/toolbar/commands.js (the one source of what's pinnable). Autofill:
 * AutofillStore CRUD + the screen Q&A settings that lived in the old page.
 * Privacy: the password vault (metadata only — list() never decrypts),
 * per-site settings, history, downloads.
 */
(function () {
  const { cg, h, call, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, toggle, select, section } = window.CGS;

  // ── Privacy ────────────────────────────────────────────────────────────
  section({
    id: 'privacy', group: 'Browser', icon: '\u26BF', label: 'Privacy & data',
    keywords: 'passwords saved logins site permissions history downloads clear delete',
    blurb: 'Saved passwords, per-site permissions, history and downloads. Passwords are listed without decrypting them.',
    async render({ rerender }) {
      const [pw, origins] = await Promise.all([cg.passwords.list().catch(e => ({ error: e.message })), cg.siteSettings.listOrigins().catch(e => ({ error: e.message }))]);
      return [
        pane({ title: 'Saved passwords', sub: 'Includes sign-ins saved for provider accounts.', flush: true, body: pw.error ? h('div', { class: 'err-box', text: pw.error }) : pw.length ? pw.map(p => row(p.username, `${p.origin} \u00B7 updated ${ago(p.updatedAt)}`,
          btn('Delete', async () => { if (await confirmDo('Delete saved password?', `${p.username} on ${p.origin}.`, 'Delete')) { await busy(null, () => cg.passwords.delete(p.id)); rerender(); } }, 'sm danger'))) : empty('No saved passwords.') }),
        pane({ title: 'Site permissions', flush: true, body: origins.error ? h('div', { class: 'err-box', text: origins.error }) : origins.length ? origins.map(o => row(o, null,
          btn('Show', async () => { const all = await cg.siteSettings.getAll(o).catch(e => ({ error: e.message })); modal({ title: o, body: [h('pre', { class: 'out', text: JSON.stringify(all, null, 2) })] }); }, 'sm'),
          btn('Reset', () => busy(null, async () => { await cg.siteSettings.clear(o); toast(`Reset ${o}`); rerender(); }), 'sm danger'))) : empty('No site has custom permissions.') }),
        pane({ title: 'Clear data', flush: true, body: [
          row('Browsing history', 'Every tab\u2019s history.', btn('Clear history', async () => { if (await confirmDo('Clear all history?', 'This can\u2019t be undone.', 'Clear history')) await busy(null, async () => { await cg.history.clear(); toast('History cleared'); }); }, 'sm danger')),
          row('Finished downloads', 'Removes them from the list; files stay on disk.', btn('Clear list', () => busy(null, async () => { await cg.downloads.clearCompleted(); toast('Download list cleared'); }), 'sm')),
          row('All site permissions', null, btn('Reset all', async () => { if (await confirmDo('Reset every site\u2019s permissions?', 'Sites will ask again.', 'Reset all')) await busy(null, async () => { await cg.siteSettings.clearAll(); rerender(); }); }, 'sm danger')),
        ] }),
      ];
    },
  });
})();
