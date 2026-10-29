// idearium/ui/js/repo-intent.js — 0.60.286 FA10. The Do box on the Finish tab: type what you want; Idearium finds the context it needs, builds the
// DAG, finds the lines, asks the gaps, then writes the contract.
// James, 2026-10-29: "yes, and can you do what you can to get idearium to work dynamically? like type in the cli, determine context needed,
// build dag. search the project for context, ask user about any gaps, then contract, etc"
// POST /api/repos/:uuid/intent { text, answers, write } (lib/intent-flow.js). Each gap is a dropdown of its options plus your own words; the
// Contract button sends the answers with write:true. Spec: docs/project-spine.spec MOD-INTENT-SCREEN.
(function () {
  'use strict';
  const S = { repo: null, el: null, last: null, answers: {} };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderIntent(el, repo) {
    if (!el || !repo) return;
    if (S.repo !== repo.uuid) { S.answers = {}; S.last = null; }
    Object.assign(S, { el, repo: repo.uuid });
    el.innerHTML = `<div class="ds-label">do — say what you want; the project is searched first, you are asked last</div>
      <div class="fa-form"><input id="fi-text" size="70" placeholder="e.g. add a currency choice to the gig fill menu" value="${esc(S.text || '')}">
      <button class="btn" data-fi="go">Go</button></div><div id="fi-out"></div>`;
    el.querySelector('[data-fi="go"]').addEventListener('click', () => go(false));
    el.querySelector('#fi-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(false); });
    if (S.last) draw(S.last);
  }

  async function go(write) {
    const text = S.el.querySelector('#fi-text').value.trim(); if (!text) return;
    if (text !== S.text) { S.answers = {}; S.text = text; }
    for (const s of S.el.querySelectorAll('[data-gap]')) { const v = s.value === '__own' ? (S.el.querySelector(`[data-own="${s.dataset.gap}"]`) || {}).value : s.value; if (v) S.answers[s.dataset.gap] = v; }
    const out = S.el.querySelector('#fi-out'); out.innerHTML = '<div class="ds-mono">reading the project…</div>';
    try { S.last = await api(`/api/repos/${S.repo}/intent`, { method: 'POST', body: JSON.stringify({ text, answers: S.answers, write }) }, 120000); draw(S.last); }
    catch (e) { out.innerHTML = `<div class="ds-mono">${esc(e.message)}</div>`; }
  }

  function draw(d) {
    const out = S.el.querySelector('#fi-out'); if (!out) return;
    const stages = (d.stages || []).map(s => `<li><b>${esc(s.id)}</b> ${esc(s.say)}</li>`).join('');
    const dag = ((d.dag && d.dag.nodes) || []).map((n, i) => { const f = (d.found || []).find(x => x.path === n.path) || { lines: [] };
      return `<li><span class="dim">${esc(n.role)}</span> <code>${esc(n.path)}</code>${f.lines.length ? `<div class="dim">${f.lines.slice(0, 3).map(l => `${l.line}: ${esc(l.text.slice(0, 90))}`).join('<br>')}</div>` : ''}</li>`; }).join('');
    const gaps = (d.gaps || []).map(g => `<li class="${g.blocking && g.answer == null ? 'fa-open' : 'fa-done'}"><div>${g.blocking && g.answer == null ? '?' : '·'} ${esc(g.question)}</div>
      ${g.answer != null ? `<div class="dim">→ ${esc(g.answer)}</div>` : `<select data-gap="${esc(g.id)}"><option value="">— choose —</option>${(g.options || []).map(o => `<option>${esc(o)}</option>`).join('')}<option value="__own">your own words…</option></select>
      <input data-own="${esc(g.id)}" placeholder="your answer" size="40">`}</li>`).join('');
    const c = d.contract;
    out.innerHTML = `<ul class="fa-list">${stages}</ul>
      ${dag ? `<div class="ds-label">the DAG, in build order</div><ol class="fa-list">${dag}</ol>` : ''}
      ${gaps ? `<div class="ds-label">gaps — the project could not answer these</div><ul class="fa-list fi-gaps">${gaps}</ul>` : ''}
      <div class="fa-actions">${(d.gaps || []).some(g => g.answer == null) ? '<button class="btn" data-fi="answer">Answer and run again</button>' : ''}
      ${c ? `<button class="btn" data-fi="write">Write the contract (${c.gates.length} gates)</button>` : ''}
      ${d.written ? `<span>✓ wrote <code>${esc(d.written)}</code></span>` : ''}${(d.problems || []).length ? `<span class="dim">RAID: ${esc(d.problems.join('; '))}</span>` : ''}</div>`;
    const a = out.querySelector('[data-fi="answer"]'); if (a) a.addEventListener('click', () => go(false));
    const w = out.querySelector('[data-fi="write"]'); if (w) w.addEventListener('click', () => go(true));
  }

  Object.assign(window, { renderIntent });
})();
