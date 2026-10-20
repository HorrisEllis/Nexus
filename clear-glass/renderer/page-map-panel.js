/**
 * clear-glass/renderer/page-map-panel.js — PM8 0.60.175: the page map beside the page.
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM8_page_map_panel)
 * James, 2026-10-19: "synthesize a fucking map in relation to the weboage to use as a map or reference point for inputs from the cli
 * or the intent. learns over time." · "then it can be a map tool, chunk tool for understanding/analysing/ reverse engineering,, web
 * scraper."
 *
 * The markup is in browser.html (#page-map-panel); this file is only behaviour (CG2). Every answer comes from the driver's page
 * actions (src/page/page-session.js) through window.cg.driver.exec — the same doors the co-pilot and `idearium page` use:
 *   Map      pageMap → the map's lines and what changed since the last visit (the window then stays live: it follows the page)
 *   Find     pageFind { intent } → ranked targets; Show spotlights one on the page; ✓ / ✗ tells the map what happened (pageOutcome)
 *   Chunks   pageChunks { query } → the page's text by section
 *   Scrape   pageScrape → markdown, copied
 */
(function () {
  'use strict';
  const cg = window.cg;
  const $ = (id) => document.getElementById(id);
  const panel = $('page-map-panel');
  if (!panel || !cg || !cg.driver || !cg.driver.exec) return;
  const agentId = () => (window.CG_ACTIVE_AGENT || new URLSearchParams(location.search).get('agentId') || 'default');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const run = async (action, args = {}) => { const r = await cg.driver.exec({ action, agentId: agentId(), ...args }); if (r && r.ok === false && r.error) throw new Error(r.error); return r && r.result !== undefined ? r.result : r; };
  const say = (msg, kind = '') => { const el = $('pm-status'); el.textContent = msg; el.className = `pm-status ${kind}`; };
  let lastFind = null;

  function show(on) { panel.classList.toggle('visible', on); if (on) doMap(); }
  const btn = $('btn-page-map'); if (btn) btn.addEventListener('click', () => show(!panel.classList.contains('visible')));
  $('pm-close').addEventListener('click', () => show(false));

  async function doMap() {
    say('reading the page…');
    try {
      const m = await run('pageMap');
      $('pm-head').innerHTML = `<b>${esc(m.title || '')}</b> <span class="pm-dim">${esc(m.site || '')}</span><div class="pm-feel">${esc(m.feel || '')}${m.visits > 1 ? ` · visit ${m.visits}` : ''}${m.note ? ` · ${esc(m.note)}` : ''}</div>`;
      $('pm-out').innerHTML = `<div class="pm-lines">${(m.lines || []).map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
      say(`${(m.stats && m.stats.blocks) || 0} blocks · ${m.chunks || 0} chunks · following the page`, 'ok');
    } catch (e) { say(`could not map this page: ${e.message}`, 'bad'); }
  }

  async function doFind() {
    const intent = $('pm-intent').value.trim();
    if (!intent) return say('say what you want to do — "type my email", "click apply"', 'bad');
    try {
      const r = lastFind = await run('pageFind', { intent });
      $('pm-out').innerHTML = r.targets.length ? r.targets.map((t, i) => `<div class="pm-target" data-i="${i}">
        <div><b>${esc(t.role)}${t.name ? ` "${esc(t.name)}"` : ''}</b> <span class="pm-dim">${t.cx != null ? `(${t.cx},${t.cy})` : ''} ${esc(t.score)}</span></div>
        <div class="pm-dim">${esc(t.why.join(' · '))}</div>
        <div class="pm-acts"><button data-act="show">Show</button><button data-act="ok" title="this was the right one — it learns">✓</button><button data-act="fail" title="this was wrong — it learns">✗</button></div></div>`).join('')
        : '<div class="pm-dim">nothing on this page matches</div>';
      say(`"${intent}" · ${r.targets.length} target(s)${r.verbs && r.verbs.length ? ` · wants ${r.verbs.join('/')}` : ''}`, r.targets.length ? 'ok' : '');
    } catch (e) { say(`find failed: ${e.message}`, 'bad'); }
  }

  async function onTarget(ev) {
    const b = ev.target.closest('button[data-act]'); const row = ev.target.closest('.pm-target');
    if (!b || !row || !lastFind) return;
    const t = lastFind.targets[+row.dataset.i];
    try {
      if (b.dataset.act === 'show') { await run('spotlight', t.selector ? { selector: t.selector, label: t.name || t.role } : { x: t.cx, y: t.cy, label: t.name || t.role }); say(`showing ${t.role} "${t.name || ''}"`, 'ok'); }
      else { const r = await run('pageOutcome', { intent: lastFind.intent, id: t.id, ok: b.dataset.act === 'ok' }); say(r.ok ? `learned: "${r.intent}" → ${t.name || t.id} (${r.score > 0 ? '+' : ''}${r.score})` : r.why, r.ok ? 'ok' : 'bad'); }
    } catch (e) { say(e.message, 'bad'); }
  }

  async function doChunks() {
    const query = $('pm-intent').value.trim();
    try {
      const r = await run('pageChunks', query ? { query } : {});
      $('pm-out').innerHTML = (r.chunks || []).map(c => `<details class="pm-chunk"><summary>${esc(c.title)} <span class="pm-dim">${c.blocks.length} block(s)</span></summary><pre>${esc(c.text)}</pre></details>`).join('') || '<div class="pm-dim">no chunks</div>';
      say(`${(r.chunks || []).length} chunk(s)${query ? ` for "${query}"` : ''}`, 'ok');
    } catch (e) { say(`chunks failed: ${e.message}`, 'bad'); }
  }

  async function doScrape() {
    try {
      const r = await run('pageScrape', { format: 'md' });
      try { await navigator.clipboard.writeText(r.markdown); say(`copied ${r.markdown.length} chars of markdown`, 'ok'); }
      catch (_) { say('the page as markdown is below (the clipboard was not available)', ''); }
      $('pm-out').innerHTML = `<pre class="pm-md">${esc(r.markdown)}</pre>`;
    } catch (e) { say(`scrape failed: ${e.message}`, 'bad'); }
  }

  $('pm-map').addEventListener('click', doMap);
  $('pm-find').addEventListener('click', doFind);
  $('pm-intent').addEventListener('keydown', (e) => { if (e.key === 'Enter') doFind(); });
  $('pm-chunks').addEventListener('click', doChunks);
  $('pm-scrape').addEventListener('click', doScrape);
  $('pm-out').addEventListener('click', onTarget);
  window.cgPageMapPanel = { show, doMap, doFind, doChunks, doScrape };
})();
