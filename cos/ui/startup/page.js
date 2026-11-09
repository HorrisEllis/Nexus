/**
 * cos/ui/startup/page.js — Settings › Startup and services (SC7, expanded 2026-11-08). Spec: cos/spec/cos-console.spec MOD-MG-UI-STARTUP.
 * James, 2026-11-08: "startup and services tab. none of cos ui should be hardcoded when it comes to compartments." · "I like the settings."
 * COS itself: the options its exe names (cos/app/window.js startupOptions, through the window's door cosStart.startup / setStartup), drawn as
 * a switch (bool) or a choice; the exe applies a change as its tray menu does (the logon task, the service). In a plain browser there is no
 * exe to ask, and that is said. Systems: every system COS declares (GET /api/cos/systems), each with its Start at boot (start.autostart, BT1);
 * a change is a PATCH with by = person, then read back. No option and no system is named here.
 */
(async function () {
  'use strict';
  const { h, esc } = COS; const $ = (id) => document.getElementById(id);
  try { await COS.page('startup'); } catch (e) { return e.down ? COS.down($('systems'), e.message) : COS.say($('systems'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }

  // ── COS itself: the exe's door, on the shell's window (the top frame) ──
  const door = (() => { try { return window.top.cosStart && window.top.cosStart.startup ? window.top.cosStart : null; } catch (_) { return null; } })();
  const sw = (on, attrs) => h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!on), ...attrs });
  function drawSelf(r) {
    if (!r || !Array.isArray(r.options)) { $('self').replaceChildren(h('p', { class: 'su-note' }, `COS's own app did not answer: ${(r && r.error) || 'no options came back'}`)); return; }
    $('self').replaceChildren(...r.options.map(o => {
      let ctl;
      if (o.kind === 'bool') ctl = sw(o.value, { 'data-k': o.key, title: o.label, onclick: () => setSelf(o, !o.value) });
      else ctl = h('select', { 'data-k': o.key, onchange: (e) => setSelf(o, e.target.value) }, ...(o.choices || []).map(c => h('option', { value: c.value, selected: c.value === o.value }, c.label)));
      return h('div', { class: 'su-row' }, h('span', {}, o.label), ctl, h('small', {}, o.about || ''));
    }));
  }
  async function setSelf(o, v) {
    const r = await door.setStartup(o.key, v);
    if (r && r.ok) COS.notice('ok', `${o.label}: ${typeof v === 'boolean' ? (v ? 'on' : 'off') : ((o.choices || []).find(c => c.value === v) || { label: v }).label}`);
    else COS.notice('err', `${o.label}: ${(r && r.error) || 'refused'}`);
    loadSelf();
  }
  async function loadSelf() {
    if (!door) { $('self-tag').textContent = 'the COS window only'; $('self').replaceChildren(h('p', { class: 'su-note' }, 'How COS itself starts is set by its own app (the exe). Open this page in the COS window to change it; a browser cannot reach the exe. The same switches are in its tray menu.')); return; }
    try { drawSelf(await door.startup()); } catch (e) { drawSelf({ error: e.message }); }
  }

  // ── the systems COS declares, each with its Start at boot ──
  async function bootOf(name) {
    try { const c = await COS.call('GET', `/api/cos/systems/${encodeURIComponent(name)}/config`); const st = c.settings && c.settings['start.autostart'], od = c.settings && c.settings['start.onDemand'];
      return { boot: !st || (st.value !== false && st.value !== 'false'), onDemand: !!od && (od.value === true || od.value === 'true') }; } catch (_) { return { boot: true, onDemand: false, unread: true }; }
  }
  async function loadSystems() {
    let list; try { list = (await COS.call('GET', '/api/cos/systems')).systems || []; } catch (e) { if (!e.refused) $('systems').replaceChildren(h('p', { class: 'su-note' }, esc(e.message))); return; }
    $('sys-tag').textContent = `from COS · ${list.length}`;
    if (!list.length) { $('systems').replaceChildren(h('p', { class: 'su-note' }, 'COS declares no systems yet: a system appears here when its compartment.json declares a process.')); return; }
    const rows = await Promise.all(list.map(async (s) => {
      const b = await bootOf(s.name), up = s.state === 'running' || s.state === 'up';
      const t = sw(b.boot, { 'data-sys': s.name, title: b.boot ? 'Starts at boot' : 'Skipped at boot', onclick: async () => {
        try { await COS.call('PATCH', `/api/cos/systems/${encodeURIComponent(s.name)}/config`, { patch: { 'start.autostart': !b.boot }, by: 'person' }); COS.notice('ok', `${s.name}: ${!b.boot ? 'starts' : 'skipped'} at the next boot`); }
        catch (e) { if (!e.refused) COS.notice('err', e.message); }
        loadSystems();
      } });
      const said = [b.boot ? 'starts at boot' : 'skipped at boot', h('span', { class: up ? 'up' : '' }, COS.stateLabel(s.state)), b.onDemand ? 'on demand' : null, b.unread ? 'its settings did not read' : null].filter(Boolean);
      return h('div', { class: 'su-row', 'data-row': s.name }, h('span', {}, s.name), t, h('small', {}, ...said.flatMap((x, i) => i ? [' · ', x] : [x])));
    }));
    $('systems').replaceChildren(...rows);
  }
  COS.on('cos.system.state', () => loadSystems());
  loadSelf(); loadSystems();
})();
