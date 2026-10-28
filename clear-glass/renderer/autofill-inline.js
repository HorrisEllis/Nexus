/**
 * clear-glass/renderer/autofill-inline.js — the autofill chip under each input (AF3, 0.60.267).  (styles: autofill-inline.css)
 * Map: docs/2026-10-26-inline-autofill-ui-phasemap.spec AF3.
 *
 * James, 2026-10-26: "need to have a autofill ui for relevant pages. like firefox has, like a autofill button where it shows under the input" ·
 * 2026-10-28: "needs to autofill any field it can. also needs to have the autopill under each input fieled."
 *
 * Drawn in Clear Glass's own window, over the page — like Firefox's, never inside the page, so a site's scripts cannot read his profile
 * before he chooses. The page reports only where its fields are (src/autofill/suggest.js reporterScript, through the webview bridge);
 * the values come from main (cg.autofill.suggest: the active profile and the written gig) and go into the page only when a chip is clicked
 * (cg.autofill.fillOne). A field that already holds the value has no chip. Several options: the chip's ▾ lists them.
 * Refreshes on load, on in-page navigation and when the page's set of fields changes (Fiverr's editor steps).
 */
(function () {
  'use strict';
  const cg = window.cg;
  const wv = document.getElementById('wv');
  if (!cg || !cg.autofill || !wv) return;
  const agentId = new URLSearchParams(location.search).get('agentId') || 'default';
  const layer = document.createElement('div'); layer.id = 'af-chips'; layer.setAttribute('aria-live', 'polite'); document.body.appendChild(layer);
  let sugg = new Map(), rects = [], timer = 0, gen = 0, open = null, done = new Map();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function refresh() {
    const my = ++gen;
    let r; try { r = await cg.autofill.suggest(agentId); } catch (_) { r = null; }
    if (my !== gen) return;
    sugg = new Map(((r && r.suggestions) || []).map(s => [s.cgId, s]));
    window.__cgAutofillChips = { count: sugg.size, why: r && r.why };
    if (!sugg.size || !r.script) { rects = []; draw(); return; }
    try { await wv.executeJavaScript(r.script, true); } catch (_) {}
  }
  const soon = (ms = 500) => { clearTimeout(timer); timer = setTimeout(refresh, ms); };

  function zoom() { try { const z = wv.getZoomFactor(); return Number.isFinite(z) && z > 0 ? z : 1; } catch (_) { return 1; } }
  function draw() {
    const box = wv.getBoundingClientRect(), z = zoom();
    const visible = box.width > 0 && box.height > 0 && getComputedStyle(wv).visibility !== 'hidden';
    const html = [];
    for (const f of visible ? rects : []) {
      const s = sugg.get(f.cgId); if (!s || !s.options.length) continue;
      if (s.options.some(o => o.value === f.v)) continue;            // already holds it
      const x = box.left + f.x * z, y = box.top + f.y * z + 2;
      if (y < box.top || y > box.bottom - 18 || x > box.right - 40) continue;
      const o = s.options[0], st = done.get(f.cgId);
      html.push(`<div class="af-chip${f.focus ? ' focus' : ''}${st ? ' ' + st : ''}" style="left:${Math.round(Math.max(box.left, x))}px;top:${Math.round(y)}px;max-width:${Math.round(Math.max(140, Math.min(420, f.w * z)))}px" data-cg="${esc(f.cgId)}">`
        + `<button class="af-fill" data-v="0" title="${esc(o.label)} — click to fill">⚡ ${esc(o.preview)}</button>`
        + (s.options.length > 1 ? `<button class="af-more" title="${s.options.length} options">▾</button>` : '')
        + (open === f.cgId ? `<div class="af-list">${s.options.map((p, i) => `<button class="af-opt" data-v="${i}" title="${esc(p.label)}"><span>${esc(p.preview)}</span><em>${esc(p.label)}</em></button>`).join('')}</div>` : '')
        + `</div>`);
    }
    layer.innerHTML = html.join('');
  }

  layer.addEventListener('mousedown', (e) => e.preventDefault());   // the page's field keeps its focus
  layer.addEventListener('click', async (e) => {
    const chip = e.target.closest('.af-chip'); if (!chip) return;
    const cgId = chip.dataset.cg, s = sugg.get(cgId); if (!s) return;
    if (e.target.closest('.af-more')) { open = open === cgId ? null : cgId; draw(); return; }
    const b = e.target.closest('[data-v]'); if (!b) return;
    const o = s.options[Number(b.dataset.v) || 0]; open = null;
    done.set(cgId, 'busy'); draw();
    let r; try { r = await cg.autofill.fillOne(agentId, cgId, o.value); } catch (err) { r = { ok: false, error: err.message }; }
    done.set(cgId, r && r.ok ? 'ok' : 'bad'); draw();
    if (r && !r.ok && typeof window.toast === 'function') window.toast(`Not filled: ${r.error}`, 'error');
    setTimeout(() => { done.delete(cgId); draw(); }, 1500);
  });

  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'autofill:rects') { rects = Array.isArray(e.args && e.args[0]) ? e.args[0] : []; draw(); }
    else if (e.channel === 'autofill:stale') soon(600);
  });
  wv.addEventListener('dom-ready', () => soon(400));
  wv.addEventListener('did-navigate-in-page', () => soon(600));
  wv.addEventListener('did-start-navigation', () => { rects = []; sugg = new Map(); draw(); });
  window.addEventListener('resize', draw);
  window.addEventListener('cg:gig-changed', () => soon(100));
  window.CGAutofillChips = { refresh, draw, _state: () => ({ sugg, rects }) };
})();
