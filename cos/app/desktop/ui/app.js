'use strict';
/* cos/app/desktop/ui/app.js — the COS window. Draws what the controller says (window.cos); decides nothing itself. (COSA6, 0.60.68)
 * James, 2026-10-16: "cos app for windows". Every button is one call; an error is shown in full, never as a vague "failed". */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const api = () => window.cos;
  let state = null, openLogs = null;

  function banner(kind, text, actions) {
    const b = el('div', 'banner ' + kind); b.appendChild(el('div', 'msg', text));
    for (const a of actions || []) { const btn = el('button', a.primary ? 'primary' : '', a.label); btn.addEventListener('click', async () => { b.remove(); if (a.run) await a.run(); }); b.appendChild(btn); }
    const x = el('button', '', 'Dismiss'); x.addEventListener('click', () => b.remove()); b.appendChild(x); $('#banners').prepend(b); return b;
  }
  const errText = (r) => `${r.error || 'failed'}${r.rolledBack ? `\nRolled back${r.restoredData ? ' and your data was restored' : ''}${r.backOn ? `; ${r.backOn} is running again` : ''}.` : ''}${r.backError ? `\n${r.backError}` : ''}`;
  async function act(fn, okText) { const r = await fn(); if (r && r.ok === false) banner('err', errText(r)); else if (okText) banner('ok', typeof okText === 'function' ? okText(r) : okText); await refresh(); return r; }

  function pill(p) { const r = p.run || {}; if (p.busy) return ['warn', p.busy + '…']; if (!r.running) return ['', 'stopped']; return r.healthy ? ['ok', `running ${r.version}`] : ['bad', `${r.version} running but NOT answering`]; }

  function project(p) {
    const card = el('section', 'project'); card.dataset.project = p.project; const top = el('div', 'top'); top.appendChild(el('h2', '', p.project));
    const [k, t] = pill(p); top.appendChild(el('span', 'pill ' + k, t)); top.appendChild(el('span', 'grow'));
    const running = p.run && p.run.running, busy = !!p.busy;
    const startStop = el('button', '', running ? 'Stop' : 'Start'); startStop.dataset.act = running ? 'stop' : 'start'; startStop.disabled = busy || (!running && !p.current);
    startStop.title = !running && !p.current ? 'Switch to a version first' : ''; startStop.addEventListener('click', () => act(() => running ? api().stop(p.project) : api().start(p.project), running ? 'Stopped.' : null)); top.appendChild(startStop);
    const rb = el('button', '', 'Roll back'); rb.dataset.act = 'rollback'; rb.disabled = busy || !p.previous; rb.title = p.previous ? `Go back to ${p.previous} (your data is left as it is)` : 'There is no previous version';
    rb.addEventListener('click', () => { if (window.confirm(`Go back to ${p.previous}? Your data is left as it is.`)) act(() => api().rollback(p.project, {}), (r) => `Back on ${r.to}.`); }); top.appendChild(rb);
    const lg = el('button', '', 'Log'); lg.dataset.act = 'logs'; lg.addEventListener('click', () => showLogs(p.project)); top.appendChild(lg); card.appendChild(top);
    if (p.busy) card.appendChild(el('div', 'busy', p.busy + '… (the buttons are off until it finishes)'));
    const tb = el('table'); const head = el('tr'); for (const h of ['Version', '', '']) head.appendChild(el('th', '', h)); tb.appendChild(head);
    for (const v of p.versions) {
      const tr = el('tr'); tr.dataset.version = v.version; tr.appendChild(el('td', 'v', v.version)); const tags = el('td');
      if (v.current) tags.appendChild(el('span', 'tag cur', 'current')); if (v.previous) tags.appendChild(el('span', 'tag prev', 'previous'));
      tags.appendChild(el('span', 'tag' + (v.verified ? '' : ' bad'), v.verified ? 'verified' : 'unverified')); if (!v.dataLinked) tags.appendChild(el('span', 'tag bad', 'data not linked')); if (!v.present) tags.appendChild(el('span', 'tag bad', 'folder missing'));
      tr.appendChild(tags); const acts = el('td', 'act');
      const sw = el('button', v.current ? '' : 'primary', v.current ? 'Current' : 'Switch to this'); sw.dataset.act = 'switch'; sw.disabled = busy || v.current || !v.present;
      sw.addEventListener('click', () => act(() => api().switchTo(p.project, v.version), (r) => r.already ? r.note : `${p.project} is now ${r.to}.`)); acts.appendChild(sw);
      const rm = el('button', 'danger', 'Remove'); rm.dataset.act = 'remove'; rm.disabled = busy || v.current; rm.title = v.current ? 'Switch to another version first' : 'Moved to the trash folder, not deleted';
      rm.addEventListener('click', () => { if (window.confirm(`Remove ${p.project} ${v.version}? It is moved to the trash folder, not deleted.`)) act(() => api().remove(p.project, v.version), `${v.version} moved to the trash folder.`); }); acts.appendChild(rm);
      tr.appendChild(acts); tb.appendChild(tr);
    }
    card.appendChild(tb); return card;
  }

  function draw() {
    $('#root').textContent = state.root; const box = $('#projects'); box.textContent = '';
    for (const p of state.projects) box.appendChild(project(p));
    const pol = $('#policy'); if (pol && state.settings) pol.value = state.settings.update.policy;
    const run = state.projects.filter(p => p.run && p.run.running); $('#strip').textContent = state.projects.length ? state.projects.map(p => `${p.project} ${p.run && p.run.running ? (p.run.version + (p.run.healthy ? ' running' : ' NOT answering')) : (p.current || 'no version') + ' stopped'}${state.waiting && state.waiting[p.project] ? ' · ' + state.waiting[p.project] + ' waiting' : ''}`).join('  |  ') : 'no projects yet';
    $('#empty').hidden = state.projects.length > 0; $('#inbox-path').textContent = state.inbox.path;
  }
  async function refresh() { const s = await api().state(); if (s && s.ok !== false) { state = s; draw(); if (openLogs) showLogs(openLogs, true); } return s; }
  async function showLogs(name, quiet) { openLogs = name; const r = await api().logs(name); $('#logs-title').textContent = `${name}: ${r.file || 'no log yet'}`; $('#logs').textContent = r.text || ''; $('#logs-panel').hidden = false; if (!quiet) $('#logs').scrollTop = 1e9; }

  /** policyBanner(arrival, outcome) — what the update policy did with a release that arrived. Said plainly, with the way back. */
  function policyBanner(r, o) {
    const what = `${r.project} ${r.version}`; const sw = [{ label: 'Switch to it now', primary: true, run: () => act(() => api().switchTo(r.project, r.version), `${r.project} is now ${r.version}.`) }, { label: 'Later' }];
    const note = r.verified ? ' and verified' : ', but NOT verified (no checksum was found beside the zip)';
    if (o.action === 'switched') banner(o.ok ? 'ok' : 'err', o.ok ? `${what} arrived and COS switched to it (update policy: auto). Roll back is one click if it is wrong.` : `${what} arrived; switching to it failed and was rolled back${o.result && o.result.error ? ': ' + o.result.error : ''}.`);
    else if (o.action === 'waiting') banner('info', `${what} is installed${note}. Not switched yet: ${o.reason}.`, sw);
    else if (o.action === 'none' && o.policy === 'off') banner('info', `${what} is installed${note}. Update policy is off: nothing switches by itself.`, sw);
    else banner('info', `${what} is installed${note}. It has not been started.${o.reason ? ' (' + o.reason + ')' : ''}`, sw);
  }

  async function importPath(path) {
    const r = await api().importPath(path); if (!r.ok) { banner('err', r.error); return r; }
    if (r.already) { banner('info', r.note); return r; }
    policyBanner(r, r.policy || { action: 'offer' });
    await refresh(); return r;
  }

  function wire() {
    const pol = $('#policy'); if (pol) pol.addEventListener('change', async () => { const r = await api().setSetting('update.policy', pol.value); if (r && r.ok === false) banner('err', r.error); else banner('ok', `Update policy: ${pol.value}.`); await refresh(); });
    $('#btn-import').addEventListener('click', async () => { const r = await api().pickZip(); if (r && r.path) await importPath(r.path); });
    $('#btn-logs-close').addEventListener('click', () => { openLogs = null; $('#logs-panel').hidden = true; });
    let depth = 0; const show = (on) => { $('#drop').hidden = !on; };
    document.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; show(true); }); document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) show(false); });
    document.addEventListener('drop', async (e) => { e.preventDefault(); depth = 0; show(false); for (const f of Array.from((e.dataTransfer && e.dataTransfer.files) || [])) { const p = api().pathFor(f); if (/\.zip$/i.test(p || f.name || '')) await importPath(p); else banner('err', `${f.name} is not a .zip`); } });
    if (api().onEvent) api().onEvent((ev) => { if (ev.type === 'policy' && ev.action !== 'none') { policyBanner({ project: ev.project, version: ev.version, verified: true }, ev); refresh(); } else if (ev.type === 'settings') refresh(); });
    setInterval(refresh, 4000);
  }
  window.COSUI = { refresh, importPath, banner, showLogs, get state() { return state; } };
  wire(); refresh();
})();
