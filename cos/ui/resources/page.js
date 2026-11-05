/**
 * cos/ui/resources/page.js — every system's resources in one list (CP6a expanded, 0.60.411). Map: docs/2026-11-01-the-compartment-phasemap.spec CP6a (expanded 2026-11-05).
 * James, 2026-11-05: "need that resource manager" · to the first step the coder proposed (priority, memory limit, start at boot, applied right
 * away; RAID balancing after): "yes". It stands on CP6a (cos/manager/resources.js: caps by layer, read back from the OS) and BT1's Start at
 * boot (each system's start.autostart, SC2). Nothing is kept here: every change is a PATCH with by = person, then read back.
 */
(async function () {
  'use strict';
  const { h, esc } = COS; const $ = (id) => document.getElementById(id);
  const PRI = ['low', 'below-normal', 'normal'];   // his three; a system set higher elsewhere shows its own value too
  const STATE = { enforced: 'applied', pending: 'waits', failed: 'refused', watched: 'watched', none: '', 'not-enforced': '' };
  try { await COS.page('resources'); } catch (e) { return e.down ? COS.down($('rows'), e.message) : COS.say($('rows'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }

  const capsUrl = (n) => `/api/cos/systems/${encodeURIComponent(n)}/caps`;
  async function setCap(name, patch, what) {
    try { await COS.call('PATCH', capsUrl(name), { patch, by: 'person' }); COS.notice('ok', `${name}: ${what}`); }
    catch (e) { if (!e.refused) COS.notice('err', `${name}: ${e.message}`); }
    load();
  }
  const note = (a) => (a && STATE[a.state] ? h('small', { class: a.state, title: a.why || '' }, `${STATE[a.state]}${a.readBack != null ? ` · ${a.readBack}` : ''}`) : null);

  async function bootOf(name) {
    try { const c = await COS.call('GET', `/api/cos/systems/${encodeURIComponent(name)}/config`); const st = c.settings && c.settings['start.autostart']; return !st || (st.value !== false && st.value !== 'false'); } catch (_) { return true; }
  }
  function row(s, boot) {
    const c = s.caps, now = s.now || {}, rss = now.rssMB, lim = c.rssLimitMB || c.heapMB;
    const pct = rss != null && lim ? Math.min(100, Math.round(rss / lim * 100)) : 0;
    const pri = h('select', { class: 'input', 'data-k': 'priority', 'data-sys': s.name, onchange: (e) => setCap(s.name, { priority: e.target.value }, `priority ${e.target.value}`) },
      ...[...new Set([...PRI, c.priority])].map(p => h('option', { value: p, selected: p === c.priority }, p)));
    const heap = h('input', { class: 'input mono', type: 'number', min: 64, max: 16384, step: 64, value: c.heapMB ?? '', 'data-k': 'heapMB', 'data-sys': s.name, title: 'MB of memory a Node system may hold (applies at its next start)',
      onchange: (e) => setCap(s.name, { heapMB: e.target.value === '' ? null : Number(e.target.value) }, `memory limit ${e.target.value || 'back to its default'} MB (applies at its next start)`) });
    const rssIn = h('input', { class: 'input mono', type: 'number', min: 64, max: 65536, step: 64, placeholder: 'none', value: c.rssLimitMB ?? '', 'data-k': 'rssLimitMB', 'data-sys': s.name, title: 'Above this much memory COS restarts it',
      onchange: (e) => setCap(s.name, e.target.value === '' ? { rssLimitMB: null } : { rssLimitMB: Number(e.target.value), onOver: 'restart' }, e.target.value ? `restarted above ${e.target.value} MB` : 'no restart limit') });
    const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(boot), 'data-sys': s.name, title: boot ? 'Starts at boot' : 'Skipped at boot' });
    sw.onclick = async () => {
      const to = sw.getAttribute('aria-checked') !== 'true';
      try { await COS.call('PATCH', `/api/cos/systems/${encodeURIComponent(s.name)}/config`, { patch: { 'start.autostart': to }, by: 'person' }); COS.notice('ok', `${s.name}: ${to ? 'starts' : 'skipped'} at the next boot`); }
      catch (e) { if (!e.refused) COS.notice('err', e.message); }
      load();
    };
    return h('div', { class: 'res-row', 'data-sys': s.name },
      h('div', { class: 'name' }, s.name, h('small', {}, `${s.state}${s.pid ? ` · pid ${s.pid}` : ''}${s.critical ? ' · critical' : ''}`)),
      h('div', { class: 'now' }, rss != null ? `${Math.round(rss)} MB${now.cpuPct != null ? ` · ${now.cpuPct}% CPU` : ''}` : (s.pid ? 'not read yet' : 'not running'),
        h('div', { class: `bar${c.rssLimitMB && rss > c.rssLimitMB ? ' over' : ''}` }, h('i', { style: `width:${pct}%` }))),
      h('div', { class: 'cell' }, pri, note(c.applied.priority)),
      h('div', { class: 'cell' }, heap, note(c.applied.heap)),
      h('div', { class: 'cell' }, rssIn, note(c.applied.rss)),
      h('div', { class: 'cell' }, sw));
  }
  async function load(fresh) {
    let r; try { r = (await COS.call('GET', `/api/cos/resources${fresh ? '?fresh=1' : ''}`)).resources; } catch (e) { return e.down ? COS.down($('rows'), e.message) : COS.notice('err', e.message); }
    const boots = await Promise.all(r.systems.map(s => bootOf(s.name)));
    $('rows').replaceChildren(...r.systems.map((s, i) => row(s, boots[i])));
    $('at').textContent = r.at ? `read ${COS.clock(r.at)}${r.reader ? ` · ${r.reader}` : ''}` : 'not read yet';
    $('host').hidden = !(r.host && r.host.freeMemPct != null);
    $('host').textContent = r.host && r.host.freeMemPct != null ? `${r.host.freeMemPct}% memory free of ${Math.round((r.host.totalMB || 0) / 1024)} GB` : '';
    balancing(r.balance);
  }
  // CP6f (0.60.413) — balance the machine, his reading: "Balance the machine". What it does, said; what it has lowered, with why.
  function balancing(b) {
    if (!b) { $('bal-state').textContent = 'not read'; return; }
    $('bal-state').textContent = b.on ? 'on' : 'off';
    $('bal-toggle').textContent = b.on ? 'Turn off' : 'Turn on';
    $('bal-toggle').onclick = async () => {
      try { await COS.call('PATCH', '/api/cos/policy', { patch: { balance: !b.on }, by: 'person' }); COS.notice('ok', `Balancing ${b.on ? 'off' : 'on'}`); }
      catch (e) { if (!e.refused) COS.notice('err', e.message); }
      load();
    };
    $('bal-rule').textContent = `When free memory is under ${Math.round(b.balanceMemPct * 100)}% or the systems use over ${Math.round(b.balanceCpuPct * 100)}% of the cores, ` +
      'the busiest system at normal priority goes to below-normal, one at a time, each approved by RAID. It goes back when the pressure is gone. ' +
      'Critical systems and any priority you set above normal are never touched. A lower priority frees no memory.';
    $('bal-rows').replaceChildren(...(b.active.length ? b.active.map(a => h('div', { class: 'row' },
      h('strong', {}, a.name), h('span', { class: 'mono' }, ` ${a.from} → ${a.to}`), h('small', { class: 'muted' }, ` ${a.kind} · ${a.why}`)))
      : [h('div', { class: 'muted' }, b.on ? 'Nothing is lowered now.' : 'Balancing is off.')]));
  }
  $('refresh').onclick = () => load(true);
  COS.on('cos.ledger', ({ entry }) => { if (/caps|config|spawn|exit|start|stop|balanc|policy/.test(entry.kind || '')) load(); });
  load(true);   // read once on opening, so "using now" is filled at once (one hidden read for every system)
})();
