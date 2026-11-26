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
    id: 'privacy', group: 'Browser', icon: '\u26BF', label: 'Privacy & sites',
    keywords: 'passwords saved logins site permissions history downloads clear delete site settings per site origin camera microphone location notifications clipboard zoom adblock content blocking exceptions fingerprint user agent firefox chrome safari identity spoof',
    related: ['accounts'], blurb: 'What each site is allowed to do, the identity a tab presents, and clearing history and data. Below Clear data: Site settings, then Browser fingerprint.',
    async render({ rerender }) {
      // 2026-11-26 — James: "yes, show the true identity. with the option to change it at anytime." · "okay now to the settings.html also.
      // i dont do cli". options.identity.mode, read live by sign-in pages and new windows (src/contexts/google-signin.js setIdentity).
      const o = await call(() => cg.options.get(), 'options');
      const mode = ((o && o.identity) || {}).mode || 'engine';
      const idSel = select([{ value: 'engine', label: 'True identity (recommended)' }, { value: 'persona', label: 'Firefox persona' }], mode, { 'aria-label': 'Identity sites see', 'data-k': 'identity.mode' });
      idSel.addEventListener('change', () => call(() => cg.options.set({ identity: { mode: idSel.value } }), 'save').then(() => toast(idSel.value === 'engine' ? 'Sites see Clear Glass as it is. New windows and sign-in pages use it.' : 'Sites see a Firefox persona. Google and Cloudflare may refuse it.')));
      return [
        pane({ title: 'Identity', flush: true, body: [
          row('What sites see', 'True identity: the browser as it is, so Google, ChatGPT and Cloudflare sign-ins work. Firefox persona: disguised, and often refused. Applies to new windows and sign-in pages.', idSel),
        ] }),
        pane({ title: 'Clear data', flush: true, body: [
          row('Browsing history', 'Every tab\u2019s history.', btn('Clear history', async () => { if (await confirmDo('Clear all history?', 'This can\u2019t be undone.', 'Clear history')) await busy(null, async () => { await cg.history.clear(); toast('History cleared'); }); }, 'sm danger')),
          row('Finished downloads', 'Removes them from the list; files stay on disk.', btn('Clear list', () => busy(null, async () => { await cg.downloads.clearCompleted(); toast('Download list cleared'); }), 'sm')),
          // §0.39.265 — moved here from the retired Nexus Options panel.
          row('Rewind history', 'Saved page snapshots for the main window.', btn('Clear rewind', async () => { if (await confirmDo('Clear rewind history?', 'Saved snapshots for the main window are deleted.', 'Clear rewind')) await busy(null, async () => { await cg.rewind.clear('default'); toast('Rewind history cleared'); }); }, 'sm danger')),
          row('All site permissions', null, btn('Reset all', async () => { if (await confirmDo('Reset every site\u2019s permissions?', 'Sites will ask again.', 'Reset all')) await busy(null, async () => { await cg.siteSettings.clearAll(); rerender(); }); }, 'sm danger')),
        ] }),
      ];
    },
  });
})();
