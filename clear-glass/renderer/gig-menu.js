/**
 * clear-glass/renderer/gig-menu.js — the gig's fill menu, in the Fiverr panel (0.60.286 GM3).
 * James, 2026-10-29: "okay the autofill still isn't working, do everything you can, invent, expand, anything to get fiverr operational as a
 * source of income. need to do better than a button, make a full menu with check boxes, adn drop downs if applicable."
 *
 * Every part of the gig is a row (src/autofill/gig-menu.js): a checkbox to fill it, its value editable in place (a dropdown for a choice — the
 * category, delivery time, revisions —, a box for text, a tick for a package row), grouped by the Fiverr page it goes on. All / None / This
 * page; the options (replay my recorded choices, how sure a match must be, bring the picker up when a part is not found); Fill selected sends
 * only the ticked keys with his edits, and each row then shows its own result. Save and Publish stay his. Spec: clear-glass/spec/gated-flows.spec
 * MOD-GM3. The markup is #gig-menu in browser.html; this file is behaviour.
 */
(function () {
  'use strict';
  const cg = window.cg;
  const $ = (id) => document.getElementById(id);
  const box = $('gig-menu');
  if (!box || !cg || !cg.autofill || !cg.autofill.gigMenu) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.CgGigPanel || {};
  const M = { rows: [], page: null, pageName: null };
  const opt = { replay: true, confidence: 'low', point: true };
  try { Object.assign(opt, JSON.parse(localStorage.getItem('cg.gigmenu.opt') || '{}')); } catch (_) {}
  const keepOpt = () => { try { localStorage.setItem('cg.gigmenu.opt', JSON.stringify(opt)); } catch (_) {} };

  async function open() {
    const gig = P().gig && P().gig();
    if (!gig) { box.hidden = false; box.innerHTML = '<div class="gm-say bad">Write a gig or load a .gig file first.</div>'; return; }
    box.hidden = false; box.innerHTML = '<div class="gm-say">Reading the page in this tab…</div>';
    let r; try { r = await cg.autofill.gigMenu(P().agentId || 'default', gig); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || r.ok === false) { box.innerHTML = `<div class="gm-say bad">No menu: ${esc((r && r.error) || 'no answer')}</div>`; return; }
    Object.assign(M, { rows: r.rows || [], page: r.page, pageName: r.pageName, humanCheck: r.humanCheck, pageWhy: r.pageWhy });
    draw();
  }

  function editor(r, i) {
    if (r.kind === 'check') return `<input type="checkbox" class="gm-val" data-i="${i}" ${r.value ? 'checked' : ''} title="yes / no on Fiverr's package row">`;
    if (r.kind === 'choice') {
      const list = r.options || [];
      if (r.free) return `<input class="gm-val" data-i="${i}" list="gm-dl-${i}" value="${esc(r.value)}"><datalist id="gm-dl-${i}">${list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
      return `<select class="gm-val" data-i="${i}">${list.map(o => `<option ${String(o) === String(r.value) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    if (r.kind === 'textarea') return `<textarea class="gm-val" data-i="${i}" rows="2">${esc(r.value)}</textarea>`;
    return `<input class="gm-val" data-i="${i}" ${r.kind === 'number' ? 'inputmode="decimal"' : ''} value="${esc(r.value)}">`;
  }

  function draw() {
    const groups = [];
    M.rows.forEach((r, i) => { let g = groups.find(x => x.name === r.group); if (!g) groups.push(g = { name: r.group, rows: [] }); g.rows.push(i); });
    box.innerHTML = `
      <div class="gm-head"><b>Fill menu</b> <span class="gm-page">${M.pageName ? `this tab: ${esc(M.pageName)}` : `this tab: ${esc(M.pageWhy || 'not a gig editor page')}`}</span>
        <button data-gm="all">All</button><button data-gm="none">None</button><button data-gm="page" ${M.page ? '' : 'disabled'}>This page</button><button data-gm="close" title="Close">✕</button></div>
      ${M.humanCheck ? `<div class="gm-say bad">${esc(M.humanCheck)} — press it yourself, then reopen the menu.</div>` : ''}
      <div class="gm-opts">
        <label><input type="checkbox" data-opt="replay" ${opt.replay ? 'checked' : ''}> replay my recorded choices</label>
        <label>match <select data-opt="confidence">${['high', 'medium', 'low'].map(c => `<option ${opt.confidence === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label><input type="checkbox" data-opt="point" ${opt.point ? 'checked' : ''}> point when not found</label>
      </div>
      ${groups.map(g => `<fieldset class="gm-group"><legend><input type="checkbox" class="gm-gtick" data-g="${esc(g.name)}"> ${esc(g.name)}</legend>
        ${g.rows.map(i => { const r = M.rows[i]; return `<div class="gm-row ${r.page === M.page ? 'gm-here' : ''}" data-key="${esc(r.key)}">
          <input type="checkbox" class="gm-tick" data-i="${i}" ${r.checked ? 'checked' : ''}>
          <span class="gm-label" title="${esc(r.key)} · goes on ${esc(r.page)}">${esc(r.label)}${r.max ? ` <span class="gm-max" data-max="${i}"></span>` : ''}</span>
          <span class="gm-edit">${editor(r, i)}</span><span class="gm-res" data-res="${esc(r.key)}"></span></div>`; }).join('')}</fieldset>`).join('')}
      <div class="gm-foot"><button class="gig-main" data-gm="fill">Fill selected</button><span class="gm-count"></span><span class="gm-say" id="gm-status"></span></div>`;
    counts();
  }

  function counts() {
    const n = M.rows.filter(r => r.checked).length;
    const c = box.querySelector('.gm-count'); if (c) c.textContent = `${n} of ${M.rows.length} ticked`;
    for (const el of box.querySelectorAll('[data-max]')) { const r = M.rows[+el.dataset.max]; const len = String(r.value || '').length; el.textContent = `${len}/${r.max}`; el.className = `gm-max ${len > r.max ? 'bad' : ''}`; }
    for (const g of box.querySelectorAll('.gm-gtick')) { const rs = M.rows.filter(r => r.group === g.dataset.g); g.checked = rs.every(r => r.checked); g.indeterminate = !g.checked && rs.some(r => r.checked); }
  }

  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList.contains('gm-tick')) { M.rows[+t.dataset.i].checked = t.checked; return counts(); }
    if (t.classList.contains('gm-gtick')) { for (const r of M.rows) if (r.group === t.dataset.g) r.checked = t.checked; for (const x of box.querySelectorAll('.gm-tick')) x.checked = M.rows[+x.dataset.i].checked; return counts(); }
    if (t.dataset.opt) { opt[t.dataset.opt] = t.type === 'checkbox' ? t.checked : t.value; return keepOpt(); }
    if (t.classList.contains('gm-val')) edited(t);
  });
  box.addEventListener('input', (e) => { if (e.target.classList.contains('gm-val') && e.target.type !== 'checkbox') edited(e.target); });
  function edited(t) {
    const r = M.rows[+t.dataset.i]; r.value = t.type === 'checkbox' ? t.checked : t.value; r.edited = true;
    if (!r.checked && r.value !== '') { r.checked = true; const tick = box.querySelector(`.gm-tick[data-i="${t.dataset.i}"]`); if (tick) tick.checked = true; }
    counts();
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gm]'); if (!b) return;
    const a = b.dataset.gm;
    if (a === 'close') { box.hidden = true; return; }
    if (a === 'all' || a === 'none' || a === 'page') { for (const r of M.rows) r.checked = a === 'all' ? r.value !== '' : a === 'page' ? r.page === M.page && r.value !== '' : false; for (const x of box.querySelectorAll('.gm-tick')) x.checked = M.rows[+x.dataset.i].checked; return counts(); }
    if (a === 'fill') fill();
  });

  async function fill() {
    const only = M.rows.filter(r => r.checked).map(r => r.key);
    const status = $('gm-status');
    if (!only.length) { status.textContent = 'Tick at least one row.'; status.className = 'gm-say bad'; return; }
    const edits = {}; for (const r of M.rows) if (r.edited) edits[r.key] = r.value;
    const gig = P().gig();
    status.textContent = `Filling ${only.length} part(s)…`; status.className = 'gm-say';
    for (const el of box.querySelectorAll('[data-res]')) { el.textContent = ''; el.className = 'gm-res'; }
    let r; try { r = await cg.autofill.gigFill(gig, P().agentId || 'default', opt.confidence, { only, replay: !!opt.replay, edits }); } catch (err) { r = { ok: false, error: err.message }; }
    if (Object.keys(edits).length && P().setGig) { try { P().setGig(applyEdits(gig, edits)); } catch (_) {} }
    if (!r || r.ok === false || r.error) { status.textContent = `Not filled: ${(r && r.error) || 'no answer'}`; status.className = 'gm-say bad'; return; }
    const mark = (key, text, kind) => { const el = box.querySelector(`[data-res="${CSS.escape(key)}"]`); if (el) { el.textContent = text; el.className = `gm-res ${kind}`; } };
    for (const f of r.filled || []) mark(f.key, '✓ typed', 'ok');
    for (const d of r.dropdowns || []) mark(d.key, d.ok ? `✓ ${d.option || 'chosen'}` : '✗', d.ok ? 'ok' : 'bad');
    for (const l of r.learned || []) mark(l.key, '✓ where you pointed', 'ok');
    for (const f of r.failed || []) mark(f.key, `✗ ${f.error || 'failed'}`, 'bad');
    if (r.tags) mark('tags', `✓ ${r.tags.done.length} tag(s)${r.tags.missed.length ? `, ✗ ${r.tags.missed.join(', ')}` : ''}`, r.tags.missed.length ? 'bad' : 'ok');
    if (r.features) { for (const f of r.features.filled) mark(`${f.tier}.feature.${f.row}`, '✓', 'ok'); for (const f of r.features.failed) mark(`${f.tier}.feature.${f.row}`, `✗ ${f.why}`, 'bad'); }
    for (const m of r.notFound || []) {
      const el = box.querySelector(`[data-res="${CSS.escape(m.key)}"]`);
      if (el) { el.className = 'gm-res bad'; el.innerHTML = `✗ ${esc(m.why)} <button data-point="${esc(m.key)}">Point at it</button>`; }
    }
    for (const b of box.querySelectorAll('[data-point]')) b.addEventListener('click', () => P().point && P().point(r.page, b.dataset.point));
    const elsewhere = only.filter(k => { const row = M.rows.find(x => x.key === k); return row && r.page && row.page !== r.page; });
    status.textContent = `${r.page ? `${M.pageName || r.page}` : 'this page'}: ${(r.filled || []).length} typed, ${(r.dropdowns || []).filter(d => d.ok).length} chosen${(r.notFound || []).length ? `, ${(r.notFound || []).length} not found` : ''}${elsewhere.length ? ` · ${elsewhere.length} ticked part(s) go on another page — open it and fill again` : ''}. Save / Publish stay yours.`;
    status.className = (r.notFound || []).length ? 'gm-say' : 'gm-say ok';
    if (opt.point && (r.notFound || []).length && P().point) setTimeout(() => P().point(r.page, r.notFound[0].key), 400);
  }

  // the same reading of an edit as src/autofill/gig-menu.js apply(), so the panel keeps what he changed (the main process applies it to the fill)
  function applyEdits(gig, edits) {
    const g = JSON.parse(JSON.stringify(gig));
    for (const [k, v] of Object.entries(edits)) {
      if (['title', 'category', 'subcategory', 'description'].includes(k)) g[k] = String(v);
      else if (k === 'tags') g.tags = String(v).split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
      else { let m = /^faq\.(\d+)\.(question|answer)$/.exec(k); if (m) { g.faq = g.faq || []; g.faq[+m[1]] = { ...(g.faq[+m[1]] || {}), [m[2]]: String(v) }; continue; }
        m = /^requirement\.(\d+)$/.exec(k); if (m) { g.requirements = g.requirements || []; g.requirements[+m[1]] = String(v); continue; }
        m = /^(basic|standard|premium)\.(name|description|delivery|revisions|price|feature)(?:\.(.+))?$/.exec(k); if (!m) continue;
        g.packages = g.packages || {}; const p = g.packages[m[1]] = g.packages[m[1]] || {};
        if (m[2] === 'name' || m[2] === 'description') p[m[2]] = String(v);
        else if (m[2] === 'delivery') { const n = parseInt(v, 10); if (Number.isFinite(n)) p.deliveryDays = n; }
        else if (m[2] === 'revisions') p.revisions = /unlimited/i.test(String(v)) ? 'unlimited' : parseInt(v, 10);
        else if (m[2] === 'price') { const n = Number(String(v).replace(/[$,\s]/g, '')); if (Number.isFinite(n)) p.price = n; }
        else if (m[2] === 'feature' && m[3]) { p.features = p.features || {}; p.features[m[3]] = v; } }
    }
    return g;
  }

  const btn = $('gig-menu-open'); if (btn) btn.addEventListener('click', () => (box.hidden ? open() : (box.hidden = true)));
  window.CgGigMenu = { open, fill, rows: () => M.rows };
})();
