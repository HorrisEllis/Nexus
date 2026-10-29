// idearium/ui/js/repo-spine.js — 0.60.286 FA7. The repo's Finish tab: what stands between the project and done, and the tools that move it.
// James, 2026-10-29: "take this, and import it into idearium, then create all the capability to finish this or any other project in the
// repo. convert mds, hardcoded phasemaps, refactor tool for the architecture to use the component registry as the spine, decomposition tool
// for breaking up each component into it's own file and wire it into the spine."
// Reads GET /api/repos/:uuid/finish (the checklist), /spine, /split-candidates, /convert. Every button shows the plan first; a second press
// (Apply) writes it through Idearium's versioned writer. Spec: docs/project-spine.spec MOD-SCREEN.
(function () {
  'use strict';
  const S = { repo: null, el: null, fin: null, spine: null, plan: null };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const LONG = 180000;

  async function renderSpine(el, repo) {
    if (!el || !repo) return;
    Object.assign(S, { repo, el, plan: null });
    el.innerHTML = '<div class="ds"><div class="ds-label">finish</div><div class="ds-mono">reading the project — its components, wires, docs and plans…</div></div>';
    try { S.fin = await api(`/api/repos/${repo.uuid}/finish`, {}, LONG); }
    catch (e) { el.innerHTML = `<div class="ds"><div class="ds-label">finish</div><div class="ds-mono">${esc(e.message)}</div></div>`; return; }
    if (S.repo !== repo) return;
    draw();
  }

  function draw() {
    const f = S.fin || {}; const st = f.stats || {};
    const items = (f.items || []).map(i => `<li class="fa-item ${i.done ? 'fa-done' : 'fa-open'}"><span class="fa-mark">${i.done ? '✓' : '·'}</span> <b>${esc(i.id)}</b> ${esc(i.say)}${!i.done && i.cmd ? ` <code class="fa-cmd">${esc(i.cmd)}</code>` : ''}</li>`).join('');
    const cands = (f.candidates || []).map(c => `<tr><td><code>${esc(c.path)}</code></td><td>${c.lines}</td><td>${c.units}</td><td>${c.sections.length}</td>
      <td><button class="btn btn-sm" onclick="spineSplit('${esc(c.path)}', false)">Preview</button></td></tr>`).join('');
    const cv = f.convert || { mds: [], specPlans: [] };
    const conv = [...(cv.specPlans || []).map(x => `<li>${x.exists ? '✓' : '·'} <code>${esc(x.path)}</code> → <code>${esc(x.target)}</code> <span class="dim">${x.modules} modules with a build plan</span></li>`),
      ...(cv.mds || []).map(m => `<li>${m.exists ? '✓' : '·'} <code>${esc(m.path)}</code> → <code>${esc(m.target)}</code></li>`)].join('');
    S.el.innerHTML = `
      <div class="ds fa-panel">
        <div class="ds-label">finish ${esc(f.name || '')} — ${f.open ? `${f.open} open` : 'nothing open'} · ${st.components || 0} components · ${st.wires || 0} wires</div>
        <ul class="fa-list">${items}</ul>
        <div class="fa-actions">
          <button class="btn" data-fa="write" onclick="spineWrite()" title="write nexus.spine.json: every component and wire with its evidence">Write spine</button>
          <button class="btn" data-fa="show" onclick="spineShow()">Components &amp; wires</button>
          <button class="btn" data-fa="convert" onclick="spineConvert(false)">Convert docs &amp; plans…</button>
          <button class="btn" data-fa="refactor" onclick="spineRefactorForm()">Refactor (move / rename)…</button>
          <button class="btn btn-ghost" onclick="renderSpine(document.getElementById('repo-subtab-finish'), CURRENT_API_REPO)">Refresh</button>
        </div>
      </div>
      <div class="ds"><div class="ds-label">split — files holding several components (one component, one file; the old path stays as the door)</div>
        ${cands ? `<table class="fa-table"><tr><th>file</th><th>lines</th><th>units</th><th>sections</th><th></th></tr>${cands}</table>` : '<div class="ds-mono">every file holds one component</div>'}</div>
      <div class="ds"><div class="ds-label">convert — markdown to specs, hard-coded build plans to phasemaps (sources kept)</div><ul class="fa-list">${conv || '<li class="dim">nothing to convert</li>'}</ul></div>
      <div class="ds" id="fa-plan"></div>`;
    // 0.60.286 FA10 — the Do box first: type what you want (js/repo-intent.js)
    const box = document.createElement('div'); box.className = 'ds'; box.id = 'fa-intent'; S.el.prepend(box);
    if (typeof renderIntent === 'function') renderIntent(box, S.repo);
  }

  function showPlan(html) { const p = document.getElementById('fa-plan'); if (p) { p.innerHTML = html; p.scrollIntoView({ block: 'nearest' }); } }
  const failHtml = (e) => `<div class="ds-label">refused</div><div class="ds-mono">${esc(e.message)}</div>${e.data && e.data.plan && (e.data.plan.kept || []).length ? `<ul class="fa-list">${e.data.plan.kept.map(k => `<li class="dim">line ${k.line} ${esc((k.names || []).join(', '))} — ${esc(k.why)}</li>`).join('')}</ul>` : ''}`;

  async function spineWrite() {
    try { const r = await api(`/api/repos/${S.repo.uuid}/spine`, { method: 'POST', body: '{}' }, LONG); say(`spine written: ${r.stats.components} components, ${r.stats.wires} wires, ${r.unknown} unknown`, 'ok'); renderSpine(S.el, S.repo); }
    catch (e) { say(e.message, 'err'); }
  }

  async function spineShow() {
    showPlan('<div class="ds-mono">reading the spine…</div>');
    try {
      const d = await api(`/api/repos/${S.repo.uuid}/spine?limit=400`, {}, LONG); S.spine = d;
      const drift = d.drift ? (d.drift.ok ? 'matches the code' : `drift: ${d.drift.added.length} added, ${d.drift.gone.length} gone, ${d.drift.wiresAdded.length} wires new, ${d.drift.wiresGone.length} gone`) : 'not written yet';
      const rows = d.components.map(c => { const out = d.wires.filter(w => w.fromPath === c.path); return `<tr><td><code>${esc(c.path)}</code></td><td>${esc(c.adapter)}</td><td>${(c.exports || []).length}</td><td>${out.map(w => `<span class="fa-wire ${w.evidence === 'unknown' ? 'fa-unknown' : ''}" title="${esc(w.evidence)}">${esc(w.toPath || w.spec)}</span>`).join(' ')}</td></tr>`; }).join('');
      showPlan(`<div class="ds-label">spine — ${d.stats.components} components · ${d.stats.wires} wires · ${d.unknown} unknown · ${esc(drift)}</div>
        <table class="fa-table"><tr><th>component</th><th>adapter</th><th>exports</th><th>wires (hover: evidence)</th></tr>${rows}</table>${d.truncated ? '<div class="dim">first 400 shown — repo spine in the CLI for all</div>' : ''}`);
    } catch (e) { showPlan(failHtml(e)); }
  }

  async function spineSplit(p, apply) {
    showPlan(`<div class="ds-mono">${apply ? 'splitting' : 'planning and verifying'} ${esc(p)} — the old and new file are loaded apart and compared…</div>`);
    try {
      const d = await api(`/api/repos/${S.repo.uuid}/split`, { method: 'POST', body: JSON.stringify({ path: p, apply }) }, 600000);
      const pl = d.plan;
      showPlan(`<div class="ds-label">${d.applied ? '✓ split' : 'plan'} ${esc(pl.file)} → ${pl.pieces.length} files by ${esc(pl.by)} ${d.verify ? (d.verify.ok ? '· same exports' : '· NOT the same') : ''}</div>
        <ul class="fa-list">${pl.pieces.map(x => `<li>+ <code>${esc(x.path)}</code> <span class="dim">${esc(x.names.join(', '))}</span></li>`).join('')}</ul>
        ${(pl.kept || []).length ? `<details><summary>${pl.kept.length} unit(s) kept in the door, and why</summary><ul class="fa-list">${pl.kept.map(k => `<li class="dim">line ${k.line} ${esc((k.names || []).join(', '))} — ${esc(k.why)}</li>`).join('')}</ul></details>` : ''}
        ${d.applied ? '' : `<button class="btn" onclick="spineSplit('${esc(p)}', true)">Apply the split</button>`}`);
      if (d.applied) { say(`split ${p} into ${pl.pieces.length} files`, 'ok'); renderSpine(S.el, S.repo); }
    } catch (e) { showPlan(failHtml(e)); }
  }

  async function spineConvert(apply) {
    showPlan('<div class="ds-mono">converting…</div>');
    try {
      const d = await api(`/api/repos/${S.repo.uuid}/convert`, { method: 'POST', body: JSON.stringify({ apply }) }, LONG);
      showPlan(`<div class="ds-label">${d.applied ? '✓ converted' : 'would write'} ${d.writes.length} file(s)</div>
        <ul class="fa-list">${d.writes.map(w => `<li>${d.applied ? '✓' : '+'} <code>${esc(w.path)}</code> <span class="dim">from ${esc(w.from)}${w.kind === 'phasemap' ? ` · ${w.phases} phases · next: ${esc((w.next || []).slice(0, 4).join(', '))}` : ` · ${w.modules} module(s)`}</span></li>`).join('')}</ul>
        ${(d.said || []).map(s => `<div class="dim">${esc(s)}</div>`).join('')}
        ${d.applied || !d.writes.length ? '' : '<button class="btn" onclick="spineConvert(true)">Apply</button>'}`);
      if (d.applied) renderSpine(S.el, S.repo);
    } catch (e) { showPlan(failHtml(e)); }
  }

  function spineRefactorForm() {
    showPlan(`<div class="ds-label">refactor through the registry — who reaches the component is read from the spine's wires</div>
      <div class="fa-form"><select id="fa-op"><option value="move">move</option><option value="rename">rename</option></select>
      <input id="fa-id" placeholder="component id or path (lib/x.js)" size="40"> <input id="fa-to" placeholder="to: new/path.js, a folder/, or a new name" size="36">
      <button class="btn" onclick="spineRefactor(false)">Preview</button></div><div id="fa-rf"></div>`);
  }
  async function spineRefactor(apply) {
    const op = document.getElementById('fa-op').value, id = document.getElementById('fa-id').value.trim(), to = document.getElementById('fa-to').value.trim();
    const out = document.getElementById('fa-rf');
    try {
      const d = await api(`/api/repos/${S.repo.uuid}/refactor`, { method: 'POST', body: JSON.stringify({ op, id, to: op === 'move' ? to : undefined, name: op === 'rename' ? to : undefined, apply }) }, LONG);
      const p = d.plan;
      out.innerHTML = `<div>${d.applied ? '✓ applied' : 'plan'}: ${esc(p.from)} → ${esc(p.to)}</div><ul class="fa-list">${p.writes.map(w => `<li>${w.created ? '+' : '~'} <code>${esc(w.path)}</code></li>`).join('')}</ul>
        ${(p.said || []).map(s => `<div class="dim">${esc(s)}</div>`).join('')}${d.applied ? '' : '<button class="btn" onclick="spineRefactor(true)">Apply</button>'}`;
      if (d.applied) say(`moved ${p.from} → ${p.to}`, 'ok');
    } catch (e) { out.innerHTML = failHtml(e); }
  }

  Object.assign(window, { renderSpine, spineWrite, spineShow, spineSplit, spineConvert, spineRefactorForm, spineRefactor });
})();
