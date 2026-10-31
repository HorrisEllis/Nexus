/**
 * cos/ui/cockpit/page.js — one system's cockpit (MOD-MG-UI-COCKPIT, MG29). MG release 0.60.336.
 * James, 2026-10-30: "full control panel/cockpit for each system." · 2026-10-31: "okay. lets build cos ui. floating, above the event bus."
 * The hero says the system's state and holds its acts (each confirmed, by = person); each tab is a section folder (section.html, .css, .js)
 * in its own shadow root (MG_D7/MG_D12), mounted the first time it is opened. Writes go only through COS's routes or the door.
 */
(async function () {
  'use strict';
  const { h, icon, esc } = COS; const $ = (id) => document.getElementById(id);
  const name = COS.param('system'); let tab = COS.param('tab') || 'overview';
  const TABS = [['overview', 'Overview', 'grid'], ['logs', 'Logs', 'terminal'], ['events', 'Events', 'pulse'], ['api', 'API', 'api'], ['data', 'Data', 'db'], ['files', 'Files', 'folder'], ['tests', 'Tests', 'flask'], ['snapshot', 'Snapshot', 'camera']];
  const S = { sys: null, mounted: new Map(), subs: { state: new Set(), ledger: new Set() } };
  try { await COS.page('cockpit'); } catch (e) { return e.down ? COS.down($('sections'), e.message) : COS.say($('sections'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }

  async function load() { try { S.sys = (await COS.call('GET', `/api/cos/systems/${encodeURIComponent(name)}`)).system; hero(); } catch (e) { e.down ? COS.down($('sections'), e.message) : COS.say($('sections'), { glyph: 'layers', title: `No system "${esc(name)}"`, text: esc(e.message) }); } }
  const ACT = { start: ['Start', false], stop: ['Stop', true], restart: ['Restart', false], 'reset-circuit': ['Reset the circuit', false] };
  async function act(op) {
    const [t, danger] = ACT[op];
    if (!await COS.confirm({ title: `${t} ${name}?`, body: `Through COS's supervisor, now. Written to the ledger as your act.`, act: t, danger })) return;
    try { const r = await COS.call('POST', `/api/cos/systems/${encodeURIComponent(name)}/${op}`, { by: 'person' }); COS.notice('ok', `${t}: ${name} — ${r.system.said || COS.stateLabel(r.system.state)}`); load(); }
    catch (e) { if (!e.refused) COS.notice('err', `${t} was refused: ${e.message}`); }
  }
  function hero() {
    const s = S.sys; if (!s) return; document.title = `${s.name} · COS`;
    $('hero').dataset.s = s.state;
    $('hero').replaceChildren(
      h('div', {}, h('span', { class: 'eyebrow' }, s.system && s.system !== s.name ? `system · ${s.system}` : 'system'),
        h('div', { class: 'name', style: 'margin-top:12px' }, h('span', { class: 'dot', 'data-s': s.state }), h('h1', {}, s.name)),
        h('div', { class: 'sub' }, h('span', { html: `state <b>${esc(COS.stateLabel(s.state))}</b>` }), s.port ? h('span', { html: `port <b>:${s.port}</b>` }) : null,
          s.pid ? h('span', { html: `pid <b>${s.pid}</b>` }) : null, s.pid && s.startedAt ? h('span', { html: `up <b>${COS.dur(Date.now() - s.startedAt)}</b>` }) : null,
          h('span', { html: `restarts <b>${s.restarts.count}</b>` }), s.critical ? h('span', { class: 'tag ac' }, 'critical') : null, s.onDemand ? h('span', { class: 'tag' }, 'on demand') : null)),
      h('div', { class: 'acts' },
        s.pid ? h('button', { class: 'btn danger', onclick: () => act('stop'), html: `${icon('stop')}<span>Stop</span>` })
          : s.circuit.open ? h('button', { class: 'btn', onclick: () => act('reset-circuit'), html: `${icon('reset')}<span>Reset circuit</span>` })
          : h('button', { class: 'btn primary', onclick: () => act('start'), html: `${icon('play')}<span>Start</span>` }),
        s.pid ? h('button', { class: 'btn', onclick: () => act('restart'), html: `${icon('restart')}<span>Restart</span>` }) : null));
    for (const fn of S.subs.state) fn(s);
  }
  function tabs() {
    $('tabs').replaceChildren(...TABS.map(([id, t, ic]) => h('button', { role: 'tab', 'aria-selected': String(id === tab), onclick: () => { COS.navigate(`#/c/${encodeURIComponent(name)}/${id}`); show(id); }, html: `${icon(ic)}<span>${t}</span>` })));
  }
  async function show(id) {
    tab = TABS.some(t => t[0] === id) ? id : 'overview'; tabs();
    for (const [k, m] of S.mounted) m.el.classList.toggle('on', k === tab);
    if (S.mounted.has(tab)) { const m = S.mounted.get(tab); m.api.refresh && m.api.refresh(); return; }
    const el = h('div', { class: 'on' }); $('sections').append(el); for (const [, m] of S.mounted) m.el.classList.remove('on');
    const entry = { el, api: {} }; S.mounted.set(tab, entry);
    try { entry.api = await COS.mount(el, `sections/${tab}`, { name, get sys() { return S.sys; }, onState: (fn) => S.subs.state.add(fn), onLedger: (fn) => S.subs.ledger.add(fn), reload: load }); }
    catch (e) { COS.say(el, { glyph: 'x', title: `The ${tab} tab could not load`, text: esc(e.message) }); }
  }
  COS.on('cos.system.state', (d) => { if (d.name === name) load(); });
  COS.on('cos.ledger', ({ entry }) => { if (entry.system === name) { for (const fn of S.subs.ledger) fn(entry); } });
  COS.on('cos.ui.tab', ({ tab: t }) => { if (t !== tab) show(t); });
  await load(); show(tab);
})();
