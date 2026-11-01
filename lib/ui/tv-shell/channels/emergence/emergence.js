/* the EMERGENCE channel (TV3, 2026-11-01) — reads /api/emergence/{patterns,liminal,sessions} on the orchestrator, every 10 s while shown.
   A column whose system does not answer says which, in red; an empty answer is said as empty, never as zero. */
(function () {
  'use strict';
  // the orchestrator (:9000, TV_D1); ?orch=<origin> points it elsewhere (a test's stand-in)
  const ORCH = new URLSearchParams(location.search).get('orch') || (location.port === '9000' ? '' : 'http://127.0.0.1:9000');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = (id) => $(id).querySelector('[data-body]');
  const ago = (ts) => { if (!ts) return ''; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
  const KIND = { co_occurrence: 'together', failure_precursor: 'before failure', bottleneck: 'bottleneck', cross_system_causal: 'cause' };
  const get = async (p) => { try { const r = await fetch(ORCH + p); const d = await r.json(); return r.ok && d.ok !== false ? d : { ok: false, error: d.error || `${r.status}` }; } catch (e) { return { ok: false, error: `the orchestrator did not answer (${e.message})` }; } };
  let last = { patterns: null };

  function paintPatterns(d) {
    const el = body('em-crystals');
    if (!d || d.ok === false) { el.innerHTML = `<div class="em-bad">${esc(d && d.error)}</div>`; return; }
    const hide = $('em-hide-self').checked, all = d.patterns || [];
    const shown = all.filter(p => !(hide && p.self)).sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (b.count || 0) - (a.count || 0));
    $('em-self-n').textContent = `(${d.self || 0})`;
    if (!all.length) { el.innerHTML = '<div class="em-empty">nothing has crystallised yet</div>'; return; }
    if (!shown.length) { el.innerHTML = `<div class="em-empty">all ${all.length} are Intelligence watching itself — untick the switch to see them</div>`; return; }
    el.innerHTML = shown.slice(0, 120).map(p => `<div class="em-card${p.noiseTainted ? ' noise' : ''}">
      <span class="em-kind k-${esc(p.patternType)}">${esc(KIND[p.patternType] || p.patternType)}</span>${p.noiseTainted ? '<span class="em-kind" title="its emit was suppressed as noise">noise</span>' : ''}${p.self ? '<span class="em-kind" title="one side is Intelligence\'s own event">self</span>' : ''}
      <div class="em-said">${esc(p.said || p.signature || '')}</div>
      <div class="em-meta"><span>${esc(p.count || 0)}×</span><span class="em-bar"><i style="width:${Math.round((p.confidence || 0) * 100)}%"></i></span><span>${Math.round((p.confidence || 0) * 100)}%</span><span>${esc(ago(p.ts || p.crystallisedAt))}</span></div></div>`).join('');
  }
  function paintLiminal(d) {
    const el = body('em-liminal');
    if (!d || d.ok === false) { el.innerHTML = `<div class="em-bad">${esc(d && d.error)}</div>`; return; }
    const spaces = (d.status && d.status.spaces) || {};
    const keys = Object.keys(spaces);
    if (!keys.length) { el.innerHTML = '<div class="em-empty">no liminal spaces reported</div>'; return; }
    el.innerHTML = keys.map(fp => { const s = spaces[fp]; return `<div class="em-card em-space"><span class="em-fp">${esc(fp)}</span>
      <span class="em-name">${esc(s.name)}${s.runaway ? ' <span class="em-runaway">runaway</span>' : ''}</span>
      <span class="em-inv">${esc(s.invariant || '')}</span>
      <span class="em-meta"><span>${s.active} forming</span><span>${s.crystals} crystallised</span><span>${s.resolved} resolved</span><span>velocity ${s.velocity}</span></span></div>`; }).join('');
  }
  function paintRuns(d) {
    const el = body('em-runs');
    if (!d || d.ok === false) { el.innerHTML = `<div class="em-bad">${esc((d && (d.why || d.error)) || 'no answer')}</div>`; return; }
    if (!(d.sessions || []).length) { el.innerHTML = '<div class="em-empty">no emergence runs yet — set axioms and an end state (the emergence tool) and the system tries, then innovates the method</div>'; return; }
    el.innerHTML = d.sessions.map(r => `<div class="em-card em-run ${esc(r.outcome)}">
      <div><b>${esc(r.endState || '(no end state)')}</b></div>
      ${(r.axioms || []).slice(0, 4).map(a => `<div class="em-axiom">◇ ${esc(typeof a === 'string' ? a : JSON.stringify(a))}</div>`).join('')}
      <div class="em-meta"><span>${esc(r.outcome)}</span><span>${r.attempts} attempt${r.attempts === 1 ? '' : 's'}</span><span>${r.pivots} method pivot${r.pivots === 1 ? '' : 's'}</span><span>${esc(ago(r.ts))}</span></div></div>`).join('');
  }
  function counts(p, l, r) {
    const pill = (t) => `<span class="em-pill">${esc(t)}</span>`;
    $('em-counts').innerHTML = [p && p.ok !== false ? pill(`${(p.patterns || []).length} pattern${(p.patterns || []).length === 1 ? '' : 's'}`) : '', l && l.ok !== false ? pill(`${Object.values((l.status && l.status.spaces) || {}).reduce((n, s) => n + (s.active || 0), 0)} forming`) : '', r && r.ok !== false ? pill(`${(r.sessions || []).length} run${(r.sessions || []).length === 1 ? '' : 's'}`) : ''].join('');
  }
  async function load() {
    const [p, l, r] = await Promise.all([get('/api/emergence/patterns'), get('/api/emergence/liminal'), get('/api/emergence/sessions')]);
    last.patterns = p; paintPatterns(p); paintLiminal(l); paintRuns(r); counts(p, l, r);
  }
  $('em-hide-self').addEventListener('change', () => paintPatterns(last.patterns));
  let timer = null;
  const tick = () => { if (!document.hidden) load(); };
  load(); timer = setInterval(tick, 10000);
  window.EMERGENCE = { load };
})();
