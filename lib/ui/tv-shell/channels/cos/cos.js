/* the COS channel (MG34, 2026-11-01) — James: "not tension, thats noise. cos ui needs a channel."
   Asks the orchestrator whether COS's cockpit and manager answer (GET /api/cos-ui/status); frames the cockpit when it does; when it does not,
   says which is down and why and offers Start COS (POST /api/cos-ui/start). Never a blank frame. */
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const ORCH = Q.get('orch') || (location.port === '9000' ? '' : 'http://127.0.0.1:9000');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const call = async (method, p) => { try { const r = await fetch(ORCH + p, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) }); return await r.json(); } catch (e) { return { ok: false, error: `the orchestrator (:9000) did not answer: ${e.message}` }; } };
  let shown = null;
  function paint(st) {
    if (st && st.ok !== false && st.cockpit && st.cockpit.up) {
      const f = $('frame'); if (shown !== st.cockpit.url) { f.src = st.cockpit.url; shown = st.cockpit.url; }
      f.style.display = 'block'; $('down').style.display = 'none'; return;
    }
    shown = null; $('frame').style.display = 'none'; $('frame').removeAttribute('src'); $('down').style.display = 'block';
    if (!st || st.ok === false && !st.cockpit) { $('s-ui').innerHTML = `<span class="dn">${esc(st && st.error)}</span>`; $('s-mgr').textContent = ''; return; }
    $('s-ui').innerHTML = `<span class="dn">down</span> — ${esc(st.cockpit.why)}`;
    $('s-mgr').innerHTML = st.manager.up ? `<span class="up">up</span> — pid ${esc(st.manager.pid)}, ${esc(st.manager.systems)} systems` : `<span class="dn">down</span> — ${esc(st.manager.why)}`;
  }
  async function load() { paint(await call('GET', '/api/cos-ui/status')); }
  $('start').addEventListener('click', async () => {
    const b = $('start'), m = $('msg'); b.disabled = true; b.textContent = 'Starting…'; m.className = ''; m.textContent = '';
    const r = await call('POST', '/api/cos-ui/start');
    b.disabled = false; b.textContent = 'Start COS';
    if (r && r.ok) { m.textContent = r.started ? `started COS's ${r.started} (pid ${r.pid})` : r.why; paint(r); }
    else { m.className = 'bad'; m.textContent = `${(r && r.error) || 'no answer'}${r && r.log ? `\nlog: ${r.log}` : ''}`; if (r && r.cockpit) paint(r); }
  });
  load(); setInterval(() => { if (!document.hidden && !shown) load(); }, 8000);
  window.COSCH = { load };
})();
