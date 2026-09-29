'use strict';
/**
 * renderer/settings/sections/eros.js — ErosmancerOS  (styles: eros.css)
 *
 * v0.39.227 — split out of sections/macros.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
 */
/**
 * renderer/settings/sections/macros.js — Macros (with step builder) + ErosmancerOS
 * §BUILT 2026-09-23. Macros: list/run plus the step builder the 2026-08-29
 * bridge note deferred ("a real step-builder UI is a separate, larger
 * piece... rather than half-built as a bare JSON textarea"). Every step is a
 * real browser_action action (enum fetched live via macros:schema, not
 * hardcoded) or an erosmancer step; create goes through macro.js's own
 * validation, so the UI can't define a macro the engine would refuse.
 * ErosmancerOS: clear-glass's /eros/* proxy onto erosmancer-os's real REST
 * API (health, connect, behavior profile, routing level, hostile state,
 * adaptive patterns).
 */
(function () {
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, select, agentOptions, section } = window.CGS;

  /*
   * §0.39.281 EC10 — the workbench (James: "a huge editor for the ErosmancerOS … only if it's additive"). The views the
   * page lacked, over the same /eros/* proxy: Tabs (open, attach, close), Nodes (search, inspect), Console (one
   * /api/execute against an attached tab, or its plan only), Replay (frames, replay one). Map:
   * docs/2026-09-29-provider-economy-phasemap.spec EC10. Nothing here tunes behaviour or detection (I6) — the
   * Behaviour pane above is unchanged and the console sends no profile of its own.
   */
  const WB = { view: 'tabs', attached: {}, nodeQuery: '', last: null };
  const VIEWS = [['tabs', 'Tabs'], ['nodes', 'Nodes'], ['console', 'Console'], ['replay', 'Replay']];
  const ACTIONS = ['click', 'type', 'hover', 'scroll', 'evaluate', 'navigate', 'screenshot'];
  const out = (v) => h('pre', { class: 'out', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) });
  const errBox = (e) => h('div', { class: 'err-box', text: e && e.message ? e.message : String(e) });
  const tabsOf = async () => { const r = await wire('/eros/tabs'); return (r && r.tabs) || []; };
  const tabLabel = (t) => `${t.title || '(untitled)'} — ${t.url || ''}`.slice(0, 120);

  async function viewTabs(redraw) {
    const tabs = await tabsOf();
    const url = h('input', { type: 'text', placeholder: 'https://… (blank: about:blank)', class: 'wb-url' });
    const open = btn('Open tab', (e) => busy(e.currentTarget, async () => {
      await wire('/eros/tabs', { method: 'POST', body: { url: url.value.trim() || 'about:blank' } }); toast('Tab opened'); redraw();
    }), 'primary');
    const list = tabs.length ? tabs.map(t => {
      const id = t.targetId || t.id;
      const at = WB.attached[id];
      const role = select([{ value: 'primary', label: 'primary' }, { value: 'shadow', label: 'shadow' }, { value: 'proxy', label: 'proxy' }], (at && at.role) || 'primary');
      return h('div', { class: 'row wb-tab', dataset: { tab: id } },
        h('div', { class: 'what' }, h('div', { class: 't', text: tabLabel(t) }), h('div', { class: 'd', text: at ? `attached · ${at.role} · session ${at.sessionId}` : `not attached · ${id}` })),
        h('div', { class: 'acts' }, role,
          btn(at ? 'Re-attach' : 'Attach', (e) => busy(e.currentTarget, async () => {
            const r = await wire(`/eros/tabs/${encodeURIComponent(id)}/attach`, { method: 'POST', body: { role: role.value } });
            WB.attached[id] = { sessionId: r.sessionId, role: r.role || role.value }; toast(`Attached (${WB.attached[id].role})`); redraw();
          })),
          btn('Close', (e) => busy(e.currentTarget, async () => {
            if (!(await confirmDo('Close this tab?', `In the connected browser: ${tabLabel(t)}`, 'Close tab'))) return;
            await wire(`/eros/tabs/${encodeURIComponent(id)}`, { method: 'DELETE' }); delete WB.attached[id]; toast('Tab closed'); redraw();
          }), 'danger')));
    }) : [empty('No tabs in the connected browser.')];
    return [h('div', { class: 'wb-bar' }, url, open), ...list];
  }

  async function viewNodes(redraw) {
    const r = await wire('/eros/nodes');
    const nodes = (r && r.nodes) || [];
    const q = h('input', { type: 'search', placeholder: 'tag, text, selector, uuid…', value: WB.nodeQuery, class: 'wb-q' });
    const box = h('div', { class: 'wb-nodes' });
    const detail = h('div', { class: 'wb-detail' });
    const draw = () => {
      const s = q.value.trim().toLowerCase(); WB.nodeQuery = q.value;
      const hit = nodes.filter(n => !s || JSON.stringify([n.uuid, n.tag, n.textContent, n.selector, n.attributes, n.tabId]).toLowerCase().includes(s));
      box.replaceChildren(h('div', { class: 'sub', text: `${hit.length} of ${nodes.length} node(s)${hit.length > 200 ? ' — first 200 shown' : ''}` }),
        ...hit.slice(0, 200).map(n => h('div', { class: 'row wb-node', dataset: { uuid: n.uuid } },
          h('div', { class: 'what' }, h('div', { class: 't', text: `<${n.tag || '?'}> ${(n.textContent || '').trim().slice(0, 80)}` }), h('div', { class: 'd', text: `${n.uuid} · ${n.tabId || ''}${n.state ? ` · ${n.state}` : ''}` })),
          h('div', { class: 'acts' },
            btn('Inspect', (e) => busy(e.currentTarget, async () => { const d = await wire(`/eros/nodes/${encodeURIComponent(n.uuid)}`); detail.replaceChildren(out(d.node || d)); })),
            btn('Use in console', () => { WB.consoleUuid = n.uuid; WB.consoleTab = n.tabId; WB.view = 'console'; redraw(); })))));
    };
    q.addEventListener('input', draw); draw();
    return [h('div', { class: 'wb-bar' }, q), box, detail];
  }

  async function viewConsole(redraw) {
    const tabs = await tabsOf();
    const attached = tabs.filter(t => WB.attached[t.targetId || t.id]);
    const tab = select(tabs.map(t => ({ value: t.targetId || t.id, label: `${WB.attached[t.targetId || t.id] ? '● ' : '○ '}${tabLabel(t)}` })), WB.consoleTab || (attached[0] && (attached[0].targetId || attached[0].id)) || '');
    const action = select(ACTIONS, WB.consoleAction || 'click');
    const uuid = h('input', { type: 'text', value: WB.consoleUuid || '', placeholder: 'node uuid (click / type)' });
    const payload = h('input', { type: 'text', value: WB.consolePayload || '', placeholder: 'text / URL / expression' });
    const plan = h('input', { type: 'checkbox' });
    const result = h('div', { class: 'wb-result' }, WB.last ? out(WB.last) : null);
    const run = btn('Run', (e) => busy(e.currentTarget, async () => {
      Object.assign(WB, { consoleTab: tab.value, consoleAction: action.value, consoleUuid: uuid.value.trim(), consolePayload: payload.value });
      const body = { action: action.value, tabId: tab.value, sandbox: plan.checked };
      if (uuid.value.trim()) body.uuid = uuid.value.trim();
      if (payload.value !== '') body.payload = payload.value;
      const r = await wire('/eros/execute', { method: 'POST', body, allowNotOk: true });
      WB.last = { sent: body, answer: r }; result.replaceChildren(out(WB.last));
      toast(r && r.ok ? (plan.checked ? 'Plan only — nothing sent' : `${action.value} done`) : `ErosmancerOS: ${(r && r.error) || 'failed'}`, r && r.ok ? undefined : 'bad');
    }), 'primary');
    const note = tabs.length && !attached.length ? h('p', { class: 'blurb', text: 'No tab is attached yet — attach one under Tabs first (ErosmancerOS refuses commands to a tab without a session, and says so).' }) : null;
    return [note, h('div', { class: 'grid' }, field('Tab', tab), field('Action', action), field('Node', uuid, 'from Nodes → Use in console'), field('Payload', payload)),
      h('label', { class: 'wb-check' }, plan, h('span', { text: ' Plan only (sandbox): show what would run, send nothing' })),
      h('div', { style: { marginTop: '10px' } }, run), result];
  }

  async function viewReplay(redraw) {
    const r = await wire('/eros/replay/frames');
    const frames = (r && r.frames) || [];
    const snap = (r && r.snapshot) || {};
    const delay = h('input', { type: 'number', value: 50, min: 0 });
    const result = h('div', { class: 'wb-result' });
    const head = h('div', { class: 'sub', text: `${snap.totalFrames != null ? snap.totalFrames : frames.length} frame(s) · ${snap.totalCommands || 0} command(s) recorded${snap.replaying ? ` · ${snap.replaying} replaying` : ''}` });
    if (!r.frames) return [head, h('p', { class: 'blurb', text: 'This ErosmancerOS lists counts only (older than 0.39.281) — frames cannot be picked here.' })];
    const list = frames.length ? frames.map(f => h('div', { class: 'row wb-frame', dataset: { frame: f.frameId } },
      h('div', { class: 'what' }, h('div', { class: 't', text: `${f.commands} command(s) · ${(f.checkpoint && f.checkpoint.url) || ''}` }), h('div', { class: 'd', text: `${f.frameId} · tab ${f.tabId} · ${ago ? ago(f.createdAt) : new Date(f.createdAt).toISOString()} · replayed ${f.replayCount}×${f.replaying ? ' · replaying now' : ''}` })),
      h('div', { class: 'acts' }, btn('Replay', (e) => busy(e.currentTarget, async () => {
        const x = await wire(`/eros/replay/${encodeURIComponent(f.frameId)}`, { method: 'POST', body: { delayMs: Math.max(0, parseInt(delay.value, 10) || 0) }, allowNotOk: true });
        result.replaceChildren(out(x)); toast(x && x.ok ? 'Replayed' : `Replay: ${(x && x.error) || 'failed'}`, x && x.ok ? undefined : 'bad');
      }))))) : [empty('No frames yet — a frame starts when a tab is attached, and records the commands sent to it.')];
    return [head, h('div', { class: 'grid' }, field('Delay between commands (ms)', delay)), ...list, result];
  }

  function workbench() {
    const body = h('div', { class: 'wb-body' });
    const bar = h('div', { class: 'wb-views', role: 'tablist' });
    const draw = async () => {
      bar.replaceChildren(...VIEWS.map(([k, label]) => h('button', { class: `wb-view${WB.view === k ? ' on' : ''}`, role: 'tab', 'aria-selected': String(WB.view === k), dataset: { view: k }, text: label, onclick: () => { WB.view = k; draw(); } })));
      body.replaceChildren(h('div', { class: 'loading', text: 'Loading…' }));
      try {
        const fn = { tabs: viewTabs, nodes: viewNodes, console: viewConsole, replay: viewReplay }[WB.view];
        body.replaceChildren(...(await fn(draw)).filter(Boolean));
      } catch (e) { body.replaceChildren(errBox(e)); }
    };
    draw();
    return pane({ title: 'Workbench', sub: 'Tabs, nodes, a command console and replay — ErosmancerOS itself, through Clear Glass\u2019s wire', cls: 'wb', anchor: 'workbench', body: [bar, body] });
  }

  section({
    id: 'eros', group: 'Agents', icon: '\u2767', label: 'ErosmancerOS',
    keywords: 'erosmancer cdp behavior profile hostile routing adaptive replay human-like',
    blurb: 'The CDP engine behind human-like macro steps and hostile-page handling. Reached through Clear Glass\u2019s own wire, so it has to be running on its port for anything here to work.',
    async render({ rerender }) {
      let health;
      try { health = await wire('/eros/health', { allowNotOk: true }); }
      catch (e) { health = { ok: false, error: e.message }; }
      const connected = health.ok && health.state && health.state !== 'disconnected';
      // §0.39.264 — Clear Glass starts ErosmancerOS and connects it to its own DevTools port
      let sup = null;
      try { sup = await wire('/eros-supervisor', { allowNotOk: true }); } catch (_) {}
      const port = h('input', { type: 'number', value: (sup && sup.cdpPort) || 9333, min: 1 });
      const supLine = sup ? (sup.external ? `running on :${sup.port} (started outside Clear Glass)`
        : sup.state === 'manual' ? 'not started by Clear Glass (EROS_AUTOSTART=0)'
        : `${sup.state} on :${sup.port}${sup.pid ? ` · pid ${sup.pid}` : ''}${sup.restarts ? ` · ${sup.restarts} restart(s)` : ''}${sup.lastError && sup.state !== 'running' ? ` · ${sup.lastError}` : ''}`) : null;
      const startBtn = btn(sup && sup.state === 'running' ? 'Reconnect to Clear Glass' : 'Start ErosmancerOS', (e) => busy(e.currentTarget, async () => {
        const r = await wire('/eros-supervisor/start', { method: 'POST', allowNotOk: true });
        toast(r.ok ? 'ErosmancerOS running and connected' : `ErosmancerOS: ${r.lastError || r.state}`, r.ok ? undefined : 'err'); rerender();
      }), 'primary');
      const conn = pane({ title: 'Connection', sub: connected ? `state: ${health.state}${supLine ? ` · ${supLine}` : ''}` : (health.error || 'not connected'),
        tools: chip(connected ? 'connected' : 'disconnected', connected ? 'ok' : 'warn'),
        body: connected
          ? [h('pre', { class: 'out', text: JSON.stringify(health.status, null, 2) }), h('div', { style: { marginTop: '10px' } }, btn('Disconnect', (e) => busy(e.currentTarget, async () => { await wire('/eros/connect', { method: 'DELETE' }); rerender(); }), 'danger'))]
          : [h('p', { class: 'blurb', text: `Clear Glass starts ErosmancerOS with itself and connects it to its own DevTools port.${supLine ? ` Now: ${supLine}.` : ''}` }),
             h('div', { style: { marginTop: '10px' } }, startBtn),
             h('p', { class: 'blurb', style: { marginTop: '14px' }, text: 'Or point Erosmancer at another Chrome DevTools port (a browser started with --remote-debugging-port).' }),
             h('div', { class: 'grid', style: { marginTop: '10px' } }, field('DevTools port', port)),
             h('div', { style: { marginTop: '10px' } }, btn('Connect', (e) => busy(e.currentTarget, async () => { await wire('/eros/connect', { method: 'POST', body: { target: { type: 'local', port: parseInt(port.value, 10) } } }); toast('Erosmancer connected'); rerender(); }), 'primary'))] });
      if (!connected) return conn;

      const [profiles, hostile, patterns] = await Promise.all([
        wire('/eros/behavior/profiles').catch(() => ({ profiles: ['precise', 'cautious', 'exploratory', 'turbo'] })),
        wire('/eros/hostile/state').catch(e => ({ error: e.message })),
        wire('/eros/adaptive/patterns').catch(e => ({ error: e.message })),
      ]);
      const prof = select(profiles.profiles, 'precise');
      const level = select([{ value: 'direct', label: 'Direct' }, { value: 'parallel', label: 'Parallel' }, { value: 'redundant', label: 'Redundant' }], (health.routing && health.routing.level) || 'direct');
      return [conn,
        pane({ title: 'Behaviour', body: [h('div', { class: 'grid' }, field('Default behaviour profile', prof, 'How clicks, typing and mouse paths are timed'), field('Routing level', level, 'How many targets a command is sent through')),
          h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } },
            btn('Apply profile', (e) => busy(e.currentTarget, async () => { await wire('/eros/behavior/profile', { method: 'POST', body: { sessionId: 'default', profile: prof.value } }); toast(`Profile set to ${prof.value}`); })),
            btn('Apply routing', (e) => busy(e.currentTarget, async () => { await wire('/eros/routing/level', { method: 'POST', body: { level: level.value, reason: 'settings' } }); toast(`Routing set to ${level.value}`); })))] }),
        pane({ title: 'Hostile pages', body: hostile.error ? h('div', { class: 'err-box', text: hostile.error }) : h('pre', { class: 'out', text: JSON.stringify(hostile.states, null, 2) }) }),
        pane({ title: 'What it has learned', body: patterns.error ? h('div', { class: 'err-box', text: patterns.error }) : h('pre', { class: 'out', text: JSON.stringify(patterns.patterns, null, 2) }) }),
        workbench(),
      ];
    },
  });
})();
