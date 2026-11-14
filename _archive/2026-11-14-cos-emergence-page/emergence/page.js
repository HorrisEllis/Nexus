/**
 * cos/ui/emergence/page.js — COS's Emergence page (TV3, 2026-11-01). It joins the shell (COS.page: the contract's routes for this page) and
 * says when COS's door is down; the reading and painting are the shared script's (lib/ui/tv-shell/channels/emergence/emergence.js), the
 * same one the TV channel runs, here asking /api/cos/emergence.
 * James, 2026-11-01: "i also meant cos ui".
 */
(async function () {
  'use strict';
  try { await COS.page('emergence'); }
  catch (e) { const el = document.getElementById('em-crystals'); if (el) (e.down ? COS.down(el, e.message) : COS.say(el, { glyph: 'x', title: 'This page could not start', text: COS.esc(e.message) })); }
})();
