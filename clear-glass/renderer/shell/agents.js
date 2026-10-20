'use strict';
/**
 * renderer/shell/agents.js — Guardian's agents in one place (BS9, 0.60.180). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-AGENTS.
 * comp_id: cg.renderer.shell.agents
 *
 * James, 2026-10-21: "access to all guardian agent stuff." One toolbar button, with the number running, opens the hub:
 *   - every NCP agent (the provider registry's name and colour) with its real state from cg.providers.list() — running, status, health —
 *     and Start / Show / Stop, the same calls the old NCP Providers panel made;
 *   - the window's Guardian tools: the agent mesh and its queue, Guardian's userscripts, the element picker that assigns a provider's
 *     selectors, the mesh HUD, and accounts / profile tabs / chat capture (Settings).
 * Each tool row presses the element browser.js already wires, so it has one behaviour.
 */
(function () {
  const cg = () => window.ClearGlass;
  const $ = (id) => document.getElementById(id);
  const UI = () => window.CGShellUI;
  const I = (n, size = 16) => (window.CGIcons ? window.CGIcons.svg(n, { size }) : '');
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const STATE = (p) => {
    if (!p.running) return p.status === 'crashed' ? ['Crashed', 'bad'] : p.status === 'failed' ? ['Failed to start', 'bad'] : ['Not running', 'idle'];
    if (p.status === 'loading' || p.status === 'reloading') return ['Starting…', 'warn'];
    return ['Running', 'ok'];
  };
  let last = [];

  async function list() { try { const r = await cg().providers.list(); last = Array.isArray(r) ? r : []; } catch (_) { last = null; } return last; }
  function badge() {
    const b = document.querySelector('#btn-agents .sh-badge'); if (!b) return;
    const n = (last || []).filter(p => p.running).length; b.textContent = String(n); b.hidden = !n;
  }

  const TOOLS = [
    { icon: 'mesh', label: 'Agent mesh', sub: 'Which agent answers co-pilot, and the queue', click: 'btn-mesh' },
    { icon: 'target', label: 'Pick an element', sub: 'Assign a provider\'s input, send or reply selector', click: 'picker-btn' },
    { icon: 'script', label: 'Guardian scripts', sub: 'The userscripts running in agent tabs', click: 'btn-userscripts' },
    { icon: 'radar', label: 'Mesh HUD', sub: 'Live node and agent pulse over the page', click: 'mesh-picker-btn' },
    { icon: 'user', label: 'Accounts and profiles', sub: 'Sign-ins, profile tabs, which account answers', settings: 'providers' },
    { icon: 'history', label: 'Chat capture', sub: 'Which conversations are kept', settings: 'chats' },
  ];

  async function open() {
    const pop = $('sh-agents-panel'); const btn = $('btn-agents');
    const providers = await list(); badge();
    let depth = null; try { const m = await cg().mesh.list(); depth = m && typeof m.queueDepth === 'number' ? m.queueDepth : null; } catch (_) {}
    const cards = providers === null ? `<div class="sh-empty">Guardian's provider host is not answering. Is Clear Glass's main process running?</div>`
      : providers.map(p => {
        const [label, kind] = STATE(p);
        return `<div class="ag-card" data-id="${esc(p.id)}" style="--brand:${esc(p.color || 'var(--cyan)')}">
          <span class="ag-avatar" aria-hidden="true">${esc((p.name || p.id).slice(0, 1))}</span>
          <div class="ag-main"><div class="ag-name">${esc(p.name || p.id)}</div>
            <div class="ag-state"><span class="ag-dot ${kind}"></span>${esc(label)}${p.running && typeof p.health === 'number' ? ` · health ${Math.round(p.health)}` : ''}</div></div>
          <div class="ag-acts">${p.running
            ? `<button class="sh-btn primary" data-act="show" title="Bring its tab forward">${I('eye', 14)}Open</button><button class="sh-btn" data-act="stop" title="Stop ${esc(p.name)}" aria-label="Stop ${esc(p.name)}">${I('stop', 14)}</button>`
            : `<button class="sh-btn primary" data-act="start">${I('play', 14)}Start</button>`}</div>
        </div>`; }).join('');
    const running = (providers || []).filter(p => p.running).length;
    pop.innerHTML = `
      <div class="sh-pop-head">${I('agents', 18)}<span>Guardian agents</span><span class="sh-grow"></span>
        <span class="ag-sum">${providers ? `${running} of ${providers.length} running` : ''}${depth !== null ? ` · queue ${depth}` : ''}</span></div>
      <div class="ag-cards">${cards}</div>
      ${providers && providers.some(p => !p.running) ? '<button class="sh-link ag-all" data-all>' + I('play', 14) + '&nbsp; Start every agent</button>' : ''}
      <div class="sh-group">Guardian tools</div>
      <div class="ag-tools">${TOOLS.filter(t => !t.click || $(t.click)).map((t, i) => `<button class="ag-tool" data-tool="${i}">${I(t.icon, 18)}<span><b>${esc(t.label)}</b><small>${esc(t.sub)}</small></span></button>`).join('')}</div>`;
    pop.querySelectorAll('.ag-card').forEach(card => card.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation(); const id = card.dataset.id; const act = b.dataset.act; b.disabled = true;
      try {
        const r = act === 'start' ? await cg().providers.start(id, { show: false }) : act === 'stop' ? await cg().providers.stop(id) : await cg().providers.show(id);
        if (r && r.ok === false) UI().toast(`${id}: ${r.error || 'failed'}`);
      } catch (err) { UI().toast(`${id}: ${err.message}`); }
      setTimeout(open, act === 'start' ? 900 : 200);
    })));
    const all = pop.querySelector('[data-all]');
    if (all) all.addEventListener('click', async (e) => { e.stopPropagation(); all.disabled = true; for (const p of providers.filter(x => !x.running)) { try { await cg().providers.start(p.id, { show: false }); } catch (_) {} } setTimeout(open, 1200); });
    const tools = TOOLS.filter(t => !t.click || $(t.click));
    pop.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { const t = tools[+b.dataset.tool]; UI().close(); if (t.click) $(t.click).click(); else cg().window.openSettings(t.settings); }));
    if (UI().current() !== pop) UI().show(pop, btn);
  }

  function mount() {
    const btn = $('btn-agents'); if (!btn) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (UI().current() === $('sh-agents-panel')) return UI().close(); open(); });
    const refresh = () => list().then(badge);
    refresh(); setInterval(refresh, 5000);
  }
  window.CGAgents = { open, mount, count: () => (last || []).filter(p => p.running).length, list };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
