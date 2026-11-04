/* the TENSION channel (CI8, 2026-11-01) — reads /api/tension-field/tension on the orchestrator every 10 s while shown.
   James, 2026-11-01: "72% so make sure it is tv ui and i can access it,". The numbers are Intelligence's (intelligence/friction.js).
   A source that did not answer is said by name; an unknown part is said as unknown, never painted as 0. */
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const ORCH = Q.get('orch') || (location.port === '9000' ? '' : 'http://127.0.0.1:9000');
  const API = Q.get('api') || `${ORCH}/api/tension-field`;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d = 2) => v == null ? '<span class="tn-unknown">unknown</span>' : Number(v).toFixed(d);
  const get = async (p) => { try { const r = await fetch(API + p); const d = await r.json(); return r.ok && d.ok !== false ? d : { ok: false, error: d.error || `${r.status}`, sources: d.sources }; } catch (e) { return { ok: false, error: `${API} did not answer (${e.message})` }; } };

  function paintSources(srcs) {
    $('tn-sources').innerHTML = (srcs || []).map(s => `<span class="tn-src${s.ok ? '' : ' down'}" title="${esc(s.what)}${s.why ? ' — ' + esc(s.why) : ''}">${esc(s.source)} ${s.ok ? '✓' : '✗ ' + esc(s.why || 'down')}</span>`).join('');
  }
  function paint(d) {
    const el = $('tn-systems').querySelector('[data-body]');
    if (!d || d.ok === false) { el.innerHTML = `<div class="tn-bad">${esc(d && d.error)}</div>`; $('tn-overall').textContent = ''; paintSources(d && d.sources); return; }
    paintSources(d.sources);
    const rows = Object.entries(d.tension || {}).sort((a, b) => (b[1].tension || 0) - (a[1].tension || 0));
    $('tn-overall').innerHTML = `max ${num(d.max)} · <b class="r-${esc(d.regime)}"><span class="tn-regime">${esc(d.regime)}</span></b>${d.field && d.field.friction != null ? ` · field friction ${num(d.field.friction)}` : ''}${d.loopsKnown ? '' : ' · <span class="tn-unknown">open loops unknown (Cortex did not answer)</span>'}`;
    if (!rows.length) { el.innerHTML = '<div class="tn-empty">no system measured yet — Diagnostic has no monitors reporting</div>'; return; }
    const top = Math.max(d.max || 0, 0.001);
    el.innerHTML = rows.map(([name, t]) => `<div class="tn-sys r-${esc(t.regime)}" data-system="${esc(name)}">
      <div><div class="tn-name">${esc(name)}</div><div class="tn-regime">${esc(t.regime)}</div></div>
      <div class="tn-bar"><i style="width:${Math.round((t.tension || 0) / top * 100)}%"></i></div>
      <div class="tn-val">${num(t.tension)}</div>
      <div class="tn-parts"><span>monitor ${num(t.monitorTension)}</span><span>loops ${num(t.loopTension)}</span><span>friction ${num(t.friction)}</span><span>monitor gaps ${t.monitorGaps == null ? '—' : t.monitorGaps}</span><span>open loops ${t.openLoops == null ? '<span class="tn-unknown">unknown</span>' : t.openLoops}</span><span>slope ${num(t.slope, 3)}</span>${t.why ? `<span>${esc(t.why)}</span>` : ''}</div>
      ${(t.topLoops || []).length ? `<div class="tn-loops">worst open: ${t.topLoops.map(l => `${esc(l.type || l.uuid)} ${num(l.tension)}`).join(' · ')}</div>` : ''}
    </div>`).join('');
    $('tn-foot').textContent = `${d.formula || 'intelligence/friction.js'} · ${new Date(d.ts || Date.now()).toLocaleTimeString()}`;
  }
  async function load() { paint(await get('/tension')); }
  load(); setInterval(() => { if (!document.hidden) load(); }, 10000);
  window.TENSION = { load };
})();
