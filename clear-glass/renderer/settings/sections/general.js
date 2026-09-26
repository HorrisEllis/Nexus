'use strict';
/**
 * renderer/settings/sections/general.js — General  (styles: general.css)
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

  const setOpt = (patch, msg) => call(() => cg.options.set(patch), 'save').then(() => msg && toast(msg));

  // §NEW 2026-09-25 — page zoom. James: "Yes build all the ui" (Firefox-
  // reference gap: zoom lived under Firefox's Appearance, which this build
  // has no real backend for — see plugins.js's header comment). The zoom
  // plugin itself IS real (src/driver/index.js's native
  // webContents.setZoomFactor(), wired since 2026-08-24) but was only ever
  // reachable via the command palette's toolbar-command dispatch, never a
  // settings control. plugins:invoke is fire-and-forget by design (see
  // bridge.js's own handler comment) — it confirms the command reached the
  // bus, not the resulting zoom factor, so the toast says exactly that and
  // nothing more.
  const ZOOM_PLUGIN_ID = 'b7c8d9e0-1f2a-4b3c-8d9e-0f1a2b3c4d5e';
  const zoomCmd = (mode) => busy(null, async () => {
    await call(() => cg.plugins.invoke(`plugin:${ZOOM_PLUGIN_ID}:zoom-${mode}`, { agentId: 'default' }), 'zoom');
    toast('Zoom command sent to the main window');
  });

  section({
    id: 'general', group: 'Browser', icon: '\u2699', label: 'General',
    keywords: 'tray close start page download folder toolbar pinned copilot pane background tab',
    blurb: 'How Clear Glass behaves as a browser.',
    async render() {
      const [o, cmds] = await Promise.all([call(() => cg.options.get(), 'options'), cg.toolbar.commands().catch(() => [])]);
      const start = h('input', { type: 'url', value: o.defaultStartUrl || 'about:blank' });
      start.addEventListener('change', () => setOpt({ defaultStartUrl: start.value.trim() || 'about:blank' }, 'Start page saved').catch(e => toast(e.message, 'bad')));
      const dl = h('input', { type: 'text', value: o.downloadDirectory || '', placeholder: 'System default Downloads folder' });
      dl.addEventListener('change', () => setOpt({ downloadDirectory: dl.value.trim() || null }, 'Download folder saved').catch(e => toast(e.message, 'bad')));
      const pinned = new Set(o.pinnedToolbarButtons || []);
      const pinnable = (Array.isArray(cmds) ? cmds : (cmds.commands || [])).filter(c => c.pinnable);
      return [
        pane({ title: 'Window', flush: true, body: [
          row('Closing hides to the tray', 'Clear Glass keeps running so agents and Guardian stay connected.', toggle(o.hideToTrayOnClose !== false, (on) => setOpt({ hideToTrayOnClose: on }))),
          row('Open the co-pilot pane with each window', null, toggle(o.autoOpenCopilotPane !== false, (on) => setOpt({ autoOpenCopilotPane: on }))),
          row('\u201CMove to background tab\u201D keeps the tab hidden', null, toggle(!o.backgroundTabDefaults || o.backgroundTabDefaults.openInBackground !== false, (on) => setOpt({ backgroundTabDefaults: { openInBackground: on } }))),
        ] }),
        pane({ title: 'Pages and files', body: h('div', { class: 'grid' }, field('Start page', start), field('Download folder', dl, 'Takes effect for the next download')) }),
        pane({ title: 'Page zoom', sub: 'Applies to the main window.', flush: true, body:
          row('Zoom level', null, btn('−', () => zoomCmd('out'), 'sm'), btn('Reset', () => zoomCmd('reset'), 'sm'), btn('+', () => zoomCmd('in'), 'sm')),
        }),
        pane({ title: 'Toolbar', sub: 'Unpinned commands stay in the command palette.', flush: true, body: pinnable.map(c => row(`${c.icon || ''} ${c.label}`, c.group,
          toggle(pinned.has(c.id), async (on) => { on ? pinned.add(c.id) : pinned.delete(c.id); await setOpt({ pinnedToolbarButtons: [...pinned] }); }, `Pin ${c.label}`))) }),
      ];
    },
  });
})();
