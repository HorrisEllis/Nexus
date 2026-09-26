'use strict';
/**
 * ui/brainos-float/brainos-float-cg.js — BrainOS Float: Clear Glass tabs
 * component_id: nexus.ui.brainos-float.cg-tabs
 *
 * §BUILT 2026-09-26 — James: "expand the autofill section, agent mesh and
 * brainos." Five tabs added through BrainOS Float's own hotswap point
 * (BrainOSFloat.registerTab — brainos-float-contract.json), not by editing
 * the shell. Each is a thin client over a route Clear Glass already serves;
 * nothing here is a second implementation:
 *   NODES     GET  :7704/agent-mesh/view                (pulse registry + agent tabs, health)
 *   MESH JOBS GET  :7704/agent-mesh/intake, /job        (guardian jobs through the mesh)
 *             POST :7704/agent-mesh/diagnose            (DOM selectors per provider)
 *   MACROS    GET  :7702/cli/macros, POST /cli/macros/:name/run
 *   AUTOFILL  GET  :7702/cli/autofill/profiles, POST /cli/autofill/detect, /fill
 *   SITES     GET  :7702/cli/site-settings/origins, /cli/site-settings, DELETE /cli/site-settings(/key)
 * The tab target for macros/autofill is any open Clear Glass tab id
 * (agent tabs from /agent-mesh/view, background tabs from /cli/bgtab).
 */
(function () {
  const F = window.BrainOSFloat;
  if (!F) { console.warn('[brainos-float-cg] load after brainos-float.js'); return; }

  function el(tag, attrs = {}, kids = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(kids)) if (c) e.appendChild(c);
    return e;
  }
  const j = (url, opts = {}) => fetch(url, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined })
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok && !d.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; });
  const post = (url, body) => j(url, { method: 'POST', body: JSON.stringify(body || {}) });
  const ago = (ts) => { if (!ts) return 'never'; const s = (Date.now() - ts) / 1000; return s < 60 ? 'now' : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
  const section = (t) => el('div', { class: 'bf-section-label', text: t });
  const row = (label, ...right) => el('div', { class: 'bf-row' }, [el('span', { class: 'bf-row-label', text: label }), ...right]);
  const button = (text, onclick, cls = '') => el('button', { class: `bf-btn ${cls}`.trim(), text, onclick });
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

  // A tab picker filled from every tab Clear Glass can drive.
  function tabPicker(ctx) {
    const sel = el('select', { class: 'bf-input' }, [el('option', { value: 'default', text: 'focused tab' })]);
    Promise.all([
      j(ctx.clearGlassUrl + '/agent-mesh/view').catch(() => ({ nodes: [] })),
      j(ctx.cliUrl + '/cli/bgtab').catch(() => ({ tabs: [] })),
    ]).then(([v, bg]) => {
      for (const n of (v.nodes || []).filter(n => n.kind === 'agent')) sel.appendChild(el('option', { value: n.id, text: `${n.label} · ${n.id}` }));
      for (const t of (bg.tabs || [])) sel.appendChild(el('option', { value: t.agentId, text: `bg · ${t.agentId}${t.url ? ' · ' + t.url : ''}` }));
    });
    return sel;
  }

  // NODES — agent tabs + network nodes with health bars, auto-refresh
  F.registerTab({
    id: 'nodes', label: 'NODES',
    mount(container, ctx) {
      const list = el('div', { class: 'bf-list' });
      container.appendChild(el('div', {}, [section('MESH NODES · live'), list]));
      const draw = () => j(ctx.clearGlassUrl + '/agent-mesh/view').then(d => {
        clear(list);
        const nodes = d.nodes || [];
        if (!nodes.length) list.appendChild(row('nothing pulsing yet'));
        for (const n of nodes) {
          const bar = el('span', { class: 'bf-health' }, [el('span', { style: `width:${Math.max(0, Math.min(100, n.health || 0))}%` })]);
          const r = row(`${n.kind === 'agent' ? '◆' : '○'} ${n.label || n.id}`, bar, el('span', { class: `bf-dot bf-dot-${n.status === 'alive' || n.status === 'idle' ? 'online' : 'idle'}` }));
          r.title = `${n.id} · ${n.status}${n.meta && n.meta.taskCount != null ? ` · ${n.meta.taskCount} tasks` : ''}`;
          list.appendChild(r);
        }
      }).catch(e => { clear(list); list.appendChild(row(`clear glass wire unreachable: ${e.message}`)); });
      draw();
      this._t = setInterval(draw, 5000);
    },
    unmount() { clearInterval(this._t); },
  });

  // MESH JOBS — guardian jobs sent through the mesh + DOM check per provider
  F.registerTab({
    id: 'meshjobs', label: 'MESH JOBS',
    mount(container, ctx) {
      const list = el('div', { class: 'bf-list' });
      const out = el('pre', { class: 'bf-out' });
      const prov = el('input', { class: 'bf-input', placeholder: 'provider to check (claude, chatgpt…)' });
      container.appendChild(el('div', {}, [
        section('JOBS THROUGH THE MESH'), list,
        section('DOM CHECK'), el('div', { class: 'bf-form-row' }, [prov, button('CHECK', () => {
          if (!prov.value.trim()) return ctx.toast('provider required', 'o');
          out.textContent = 'checking…';
          post(ctx.clearGlassUrl + '/agent-mesh/diagnose', { provider: prov.value.trim() })
            .then(r => { out.textContent = JSON.stringify(r, null, 2); ctx.toast(r.ok === false ? 'problem found' : r.repaired ? 'repaired' : 'page ok', r.ok === false ? 'r' : 'g'); })
            .catch(e => { out.textContent = e.message; });
        }, 'bf-btn-g')]), out,
      ]));
      j(ctx.clearGlassUrl + '/agent-mesh/intake').then(d => {
        const jobs = (d.jobs || []).slice(0, 30);
        if (!jobs.length) list.appendChild(row('no jobs yet'));
        for (const x of jobs) {
          list.appendChild(row(`${x.provider || x.agentKey || 'job'} · ${String(x.jobId || '').slice(0, 10)} · ${ago(x.acceptedAt)}`,
            el('span', { class: `bf-st bf-st-${x.status}`, text: x.status || '?' }),
            button('?', () => j(ctx.clearGlassUrl + '/agent-mesh/job?jobId=' + encodeURIComponent(x.jobId)).then(s => { out.textContent = JSON.stringify(s, null, 2); }))));
        }
      }).catch(e => list.appendChild(row(`intake: ${e.message}`)));
    },
    unmount() {},
  });

  // MACROS — list + run in a chosen tab, with parameters
  F.registerTab({
    id: 'macros', label: 'MACROS',
    mount(container, ctx) {
      const list = el('div', { class: 'bf-list' });
      const target = tabPicker(ctx);
      container.appendChild(el('div', {}, [section('RUN IN'), target, section('CLEAR GLASS MACROS'), list]));
      j(ctx.cliUrl + '/cli/macros').then(d => {
        const ms = d.macros || [];
        if (!ms.length) list.appendChild(row('no macros — build one in Clear Glass → Settings → Macros'));
        for (const m of ms) {
          list.appendChild(row(`${m.name} · ${m.steps} step${m.steps === 1 ? '' : 's'} · ${m.runCount || 0} runs`, button('▶', () => {
            const params = {};
            for (const p of (m.params || [])) { const v = window.prompt(`${m.name}: ${p}`); if (v === null) return; params[p] = v; }
            post(`${ctx.cliUrl}/cli/macros/${encodeURIComponent(m.name)}/run`, { agentId: target.value, params })
              .then(r => ctx.toast(r.error ? r.error : `${m.name}: ${(r.results || []).length} steps`, r.error ? 'r' : 'g'))
              .catch(e => ctx.toast(e.message, 'r'));
          }, 'bf-btn-g')));
        }
      }).catch(e => list.appendChild(row(`macros: ${e.message}`)));
    },
    unmount() {},
  });

  // AUTOFILL — preview matches, then fill (never submits)
  F.registerTab({
    id: 'autofill', label: 'AUTOFILL',
    mount(container, ctx) {
      const list = el('div', { class: 'bf-list' });
      const target = tabPicker(ctx);
      const conf = el('select', { class: 'bf-input' }, ['high', 'medium', 'low'].map(c => el('option', { value: c, text: `fill ≥ ${c}`, selected: c === 'medium' ? 'selected' : null })));
      const out = el('pre', { class: 'bf-out' });
      container.appendChild(el('div', {}, [section('TARGET'), el('div', { class: 'bf-form-row' }, [target, conf]), section('PROFILES'), list, out]));
      j(ctx.cliUrl + '/cli/autofill/profiles').then(d => {
        const ps = d.profiles || [];
        if (!ps.length) list.appendChild(row('no profiles — Clear Glass → Settings → Autofill'));
        for (const p of ps) {
          list.appendChild(row(`${p.label} · ${Object.keys(p.fields || {}).length} fields`,
            button('PREVIEW', () => post(ctx.cliUrl + '/cli/autofill/detect', { agentId: target.value, profileId: p.id })
              .then(r => { out.textContent = (r.matches || []).length ? r.matches.map(m => `${m.fieldType.padEnd(20)} ${m.confidence.padEnd(7)} ${m.source}`).join('\n') : `no matches (${r.totalFields || 0} fields on page)`; })
              .catch(e => { out.textContent = e.message; })),
            button('FILL', () => post(ctx.cliUrl + '/cli/autofill/fill', { agentId: target.value, profileId: p.id, minConfidence: conf.value })
              .then(r => { out.textContent = `filled ${(r.filled || []).length} · skipped ${(r.skipped || []).length}${(r.failed || []).map(f => `\n✗ ${f.fieldType}: ${f.error}`).join('')}`; ctx.toast('filled — not submitted', 'g'); })
              .catch(e => { out.textContent = e.message; }), 'bf-btn-g')));
        }
      }).catch(e => list.appendChild(row(`autofill: ${e.message}`)));
    },
    unmount() {},
  });

  // SITES — per-site settings at a glance, reset per key or per site
  F.registerTab({
    id: 'sites', label: 'SITES',
    mount(container, ctx) {
      const list = el('div', { class: 'bf-list' });
      container.appendChild(el('div', {}, [section('PER-SITE SETTINGS'), list]));
      const draw = () => j(ctx.cliUrl + '/cli/site-settings/origins').then(async d => {
        clear(list);
        const os = d.origins || [];
        if (!os.length) list.appendChild(row('no site has its own settings'));
        for (const o of os) {
          const s = (await j(`${ctx.cliUrl}/cli/site-settings?url=${encodeURIComponent(o)}`).catch(() => ({}))).settings || {};
          list.appendChild(row(o, button('RESET', () => j(`${ctx.cliUrl}/cli/site-settings?url=${encodeURIComponent(o)}`, { method: 'DELETE' }).then(draw), 'bf-btn-danger')));
          for (const [k, v] of Object.entries(s)) {
            list.appendChild(row(`   ${k} = ${typeof v === 'string' ? v : JSON.stringify(v)}`,
              button('✕', () => j(`${ctx.cliUrl}/cli/site-settings/key?url=${encodeURIComponent(o)}&key=${encodeURIComponent(k)}`, { method: 'DELETE' }).then(draw), 'bf-btn-danger')));
          }
        }
      }).catch(e => { clear(list); list.appendChild(row(`site settings: ${e.message}`)); });
      draw();
    },
    unmount() {},
  });
})();
