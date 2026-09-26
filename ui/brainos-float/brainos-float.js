'use strict';
/**
 * ui/brainos-float/brainos-float.js — the floating control panel James
 * asked for: "floating above, not hardcoded or inline, interaction
 * contracts to make it hotswappable." See brainos-float-contract.json
 * for the real routes every tab below calls and the hotswap mechanism.
 *
 * §NO_OVERLAPPING_CAPABILITY — every tab is a thin client against an
 * already-real endpoint (agent-mesh v0.39.85-89, guardian, clear-glass
 * userscripts). Nothing here re-implements spawn/route/retry/pipeline/
 * job-dispatch logic a second time.
 */
(function (global) {

  const _tabs = new Map(); // id -> {id, label, mount, unmount}
  let _state = { mounted: false, activeTab: null, panelEl: null, contentEl: null, opts: null };

  // ── DOM helper ────────────────────────────────────────────────────────
  function _el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.appendChild(c);
    return e;
  }

  function _toast(msg, type) {
    if (!_state.panelEl) return;
    const t = _el('div', { class: `bf-toast bf-toast-${type || ''}`, text: msg });
    _state.panelEl.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function _ctx() {
    return {
      clearGlassUrl: _state.opts.clearGlassUrl,
      guardianUrl: _state.opts.guardianUrl,
      toast: _toast,
    };
  }

  // ── Public: hotswap registry ─────────────────────────────────────────
  function registerTab(tab) {
    if (!tab || !tab.id || typeof tab.mount !== 'function') {
      console.warn('[brainos-float] registerTab requires {id, label, mount(container, ctx)}');
      return;
    }
    _tabs.set(tab.id, tab);
    if (_state.mounted) _renderTabBar();
  }

  // ── Tab switching ─────────────────────────────────────────────────────
  function _setActiveTab(id) {
    const prev = _state.activeTab ? _tabs.get(_state.activeTab) : null;
    if (prev && typeof prev.unmount === 'function') { try { prev.unmount(); } catch (e) { console.warn('[brainos-float] tab unmount error', e); } }
    _state.activeTab = id;
    _state.contentEl.innerHTML = '';
    const tab = _tabs.get(id);
    if (tab) { try { tab.mount(_state.contentEl, _ctx()); } catch (e) { _state.contentEl.textContent = `tab error: ${e.message}`; } }
    _renderTabBar();
  }

  function _renderTabBar() {
    if (!_state.tabBarEl) return;
    _state.tabBarEl.innerHTML = '';
    for (const tab of _tabs.values()) {
      _state.tabBarEl.appendChild(_el('div', {
        class: `bf-tab${tab.id === _state.activeTab ? ' bf-tab-act' : ''}`,
        text: tab.label || tab.id,
        onclick: () => _setActiveTab(tab.id),
      }));
    }
  }

  // ── Drag ──────────────────────────────────────────────────────────────
  function _makeDraggable(panel, handle) {
    let drag = null;
    handle.addEventListener('mousedown', (e) => {
      drag = { sx: e.clientX, sy: e.clientY, ol: panel.offsetLeft, ot: panel.offsetTop };
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      panel.style.left = (drag.ol + (e.clientX - drag.sx)) + 'px';
      panel.style.top = (drag.ot + (e.clientY - drag.sy)) + 'px';
    });
    document.addEventListener('mouseup', () => { drag = null; });
  }

  // ── Mount / unmount ───────────────────────────────────────────────────
  function mount(opts = {}) {
    if (_state.mounted) return _state.panelEl;
    _state.opts = {
      clearGlassUrl: opts.clearGlassUrl || 'http://127.0.0.1:7704',
      guardianUrl: opts.guardianUrl || 'http://127.0.0.1:7820',
    };

    if (!_tabs.size) _registerBuiltInTabs();

    const titleBar = _el('div', { class: 'bf-titlebar' }, [
      _el('span', { class: 'bf-title', text: '⬢ BRAINOS · CONTROL' }),
      _el('span', { class: 'bf-close', text: '✕', onclick: () => unmount() }),
    ]);
    const tabBar = _el('div', { class: 'bf-tabbar' });
    const content = _el('div', { class: 'bf-content' });
    const panel = _el('div', { class: 'bf-panel' }, [titleBar, tabBar, content]);
    panel.style.left = '80px';
    panel.style.top = '80px';
    document.body.appendChild(panel);

    _state.mounted = true;
    _state.panelEl = panel;
    _state.tabBarEl = tabBar;
    _state.contentEl = content;

    _makeDraggable(panel, titleBar);
    _setActiveTab(opts.startTab && _tabs.has(opts.startTab) ? opts.startTab : [..._tabs.keys()][0]);

    return panel;
  }

  function unmount() {
    if (!_state.mounted) return;
    const tab = _state.activeTab ? _tabs.get(_state.activeTab) : null;
    if (tab && typeof tab.unmount === 'function') { try { tab.unmount(); } catch (_) {} }
    _state.panelEl.remove();
    _state = { mounted: false, activeTab: null, panelEl: null, contentEl: null, opts: null };
  }

  function getState() { return { mounted: _state.mounted, activeTab: _state.activeTab }; }

  // ── Built-in tabs — each a thin real client, no capability duplicated ──
  function _registerBuiltInTabs() {

    // AGENTS — real agent-mesh view/spawn/dispatch (same endpoints the
    // canvas context menu uses, v0.39.87)
    registerTab({
      id: 'agents', label: 'AGENTS',
      mount(container, ctx) {
        const list = _el('div', { class: 'bf-list' });
        container.appendChild(_el('div', {}, [
          _el('div', { class: 'bf-section-label', text: 'AGENT MESH' }),
          list,
        ]));
        fetch(ctx.clearGlassUrl + '/agent-mesh/view').then(r => r.json()).then(d => {
          if (!d.ok) return;
          list.innerHTML = '';
          for (const n of d.nodes) {
            const row = _el('div', { class: 'bf-row' }, [
              _el('span', { class: 'bf-row-label', text: `${n.kind}:${n.label || n.id}` }),
              _el('span', { class: `bf-dot bf-dot-${n.status || 'idle'}` }),
            ]);
            if (n.kind === 'agent') {
              row.appendChild(_el('button', {
                class: 'bf-btn', text: 'SPAWN',
                onclick: () => fetch(ctx.clearGlassUrl + '/agent-mesh/spawn', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ agentKey: n.meta?.key || n.label }),
                }).then(r => r.json()).then(rd => ctx.toast(rd.ok ? `spawned ${n.label}` : rd.error, rd.ok ? 'g' : 'r')),
              }));
              row.appendChild(_el('button', {
                class: 'bf-btn', text: 'ASK',
                onclick: () => {
                  const prompt = window.prompt(`Prompt for ${n.label}:`);
                  if (!prompt) return;
                  fetch(ctx.clearGlassUrl + '/agent-mesh/route', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, preferAgent: n.meta?.key || n.label }),
                  }).then(r => r.json()).then(rd => ctx.toast(rd.ok ? 'dispatched' : rd.error, rd.ok ? 'g' : 'r'));
                },
              }));
            }
            list.appendChild(row);
          }
        }).catch(e => ctx.toast('agent-mesh view failed: ' + e.message, 'r'));
      },
      unmount() {},
    });

    // PIPELINE — real route-graph CRUD (same endpoints canvas drag-to-
    // connect uses, v0.39.88/89)
    registerTab({
      id: 'pipeline', label: 'PIPELINE',
      mount(container, ctx) {
        const list = _el('div', { class: 'bf-list' });
        const fromIn = _el('input', { class: 'bf-input', placeholder: 'from agentKey' });
        const toIn = _el('input', { class: 'bf-input', placeholder: 'to agentKey' });
        const promptIn = _el('input', { class: 'bf-input', placeholder: 'systemPrompt (optional)' });
        function refresh() {
          fetch(ctx.clearGlassUrl + '/agent-mesh/routes').then(r => r.json()).then(d => {
            if (!d.ok) return;
            list.innerHTML = '';
            for (const route of d.routes) {
              list.appendChild(_el('div', { class: 'bf-row' }, [
                _el('span', { class: 'bf-row-label', text: `${route.from} → ${route.to} (${route.kind})` }),
                _el('button', { class: 'bf-btn bf-btn-danger', text: '✕', onclick: () => fetch(ctx.clearGlassUrl + '/agent-mesh/routes/' + route.id, { method: 'DELETE' }).then(refresh) }),
              ]));
            }
          }).catch(e => ctx.toast('routes fetch failed: ' + e.message, 'r'));
        }
        container.appendChild(_el('div', {}, [
          _el('div', { class: 'bf-section-label', text: 'PIPELINE EDGES' }),
          _el('div', { class: 'bf-form-row' }, [fromIn, toIn]),
          promptIn,
          _el('button', {
            class: 'bf-btn bf-btn-g', text: '+ ADD EDGE',
            onclick: () => {
              if (!fromIn.value || !toIn.value) return ctx.toast('from and to required', 'o');
              fetch(ctx.clearGlassUrl + '/agent-mesh/routes', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: fromIn.value, to: toIn.value, systemPrompt: promptIn.value || undefined }),
              }).then(r => r.json()).then(d => { ctx.toast(d.ok ? 'edge added' : d.error, d.ok ? 'g' : 'r'); refresh(); });
            },
          }),
          list,
        ]));
        refresh();
      },
      unmount() {},
    });

    // JOBS — real, read-only guardian providers + jobs
    registerTab({
      id: 'jobs', label: 'JOBS',
      mount(container, ctx) {
        const list = _el('div', { class: 'bf-list' });
        container.appendChild(_el('div', {}, [_el('div', { class: 'bf-section-label', text: 'GUARDIAN PROVIDERS + JOBS' }), list]));
        Promise.all([
          fetch(ctx.guardianUrl + '/providers').then(r => r.json()).catch(() => null),
          fetch(ctx.guardianUrl + '/jobs').then(r => r.json()).catch(() => null),
        ]).then(([prov, jobs]) => {
          list.innerHTML = '';
          if (prov?.providers) {
            for (const [id, status] of Object.entries(prov.providers)) {
              list.appendChild(_el('div', { class: 'bf-row' }, [_el('span', { class: 'bf-row-label', text: `provider:${id}` }), _el('span', { text: status })]));
            }
          }
          const jobList = Array.isArray(jobs) ? jobs : jobs?.jobs;
          if (Array.isArray(jobList)) {
            for (const j of jobList.slice(0, 20)) {
              list.appendChild(_el('div', { class: 'bf-row' }, [_el('span', { class: 'bf-row-label', text: `${j.provider}/${j.command || '?'}` }), _el('span', { text: j.status })]));
            }
          }
        }).catch(e => ctx.toast('guardian unreachable: ' + e.message, 'r'));
      },
      unmount() {},
    });

    // USERSCRIPTS — real UserscriptManager list/toggle
    registerTab({
      id: 'userscripts', label: 'USERSCRIPTS',
      mount(container, ctx) {
        const list = _el('div', { class: 'bf-list' });
        container.appendChild(_el('div', {}, [_el('div', { class: 'bf-section-label', text: 'GUARDIAN USERSCRIPTS' }), list]));
        function refresh() {
          fetch(ctx.clearGlassUrl + '/userscripts/list').then(r => r.json()).then(d => {
            const scripts = d.scripts || d.userscripts || d;
            list.innerHTML = '';
            for (const s of (Array.isArray(scripts) ? scripts : [])) {
              list.appendChild(_el('div', { class: 'bf-row' }, [
                _el('span', { class: 'bf-row-label', text: s.name || s.id }),
                _el('button', {
                  class: 'bf-btn', text: s.enabled ? 'DISABLE' : 'ENABLE',
                  onclick: () => fetch(ctx.clearGlassUrl + '/userscripts/toggle', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: s.id || s.name, enabled: !s.enabled }),
                  }).then(refresh),
                }),
              ]));
            }
          }).catch(e => ctx.toast('userscripts list failed: ' + e.message, 'r'));
        }
        refresh();
      },
      unmount() {},
    });

    // AUTOMATION — real workflow + per-step CRUD, Tasker-style editor
    // (automation-engine.js: trigger/agent/delay/condition/command)
    registerTab({
      id: 'automation', label: 'AUTOMATION',
      mount(container, ctx) {
        let selectedId = null;
        const wfList = _el('div', { class: 'bf-list' });
        const nameIn = _el('input', { class: 'bf-input', placeholder: 'workflow name' });
        const stepsHost = _el('div', { class: 'bf-list', style: 'margin-top:8px' });
        const editorHost = _el('div', {});

        const STEP_FIELDS = {
          trigger:   [['intervalMs', 'interval ms (blank = manual only)']],
          agent:     [['agentKey', 'agent key'], ['prompt', 'prompt']],
          delay:     [['ms', 'delay ms']],
          condition: [['var', 'var (e.g. deepseek.status)'], ['op', 'op (== != > < >= <=)'], ['value', 'value'], ['onTrue', 'onTrue step id'], ['onFalse', 'onFalse step id']],
          command:   [['system', 'system (guardian/ollama/copilot/clearglass)'], ['method', 'method (GET/POST)'], ['endpoint', 'endpoint (/health)'], ['body', 'body (JSON, optional)']],
        };

        function refreshWorkflows() {
          fetch(ctx.clearGlassUrl + '/automation/workflows').then(r => r.json()).then(d => {
            if (!d.ok) return;
            wfList.innerHTML = '';
            for (const wf of d.workflows) {
              const row = _el('div', { class: `bf-row${wf.id === selectedId ? ' bf-tab-act' : ''}` }, [
                _el('span', { class: 'bf-row-label', text: `${wf.name} (${wf.status}) · ${wf.steps.length} steps · ${wf.runCount || 0} runs`, onclick: () => { selectedId = wf.id; refreshSteps(); } }),
                _el('button', { class: 'bf-btn bf-btn-g', text: '▶', onclick: () => fetch(ctx.clearGlassUrl + `/automation/workflows/${wf.id}/run`, { method: 'POST' }).then(r => r.json()).then(rd => ctx.toast(rd.ok ? 'ran' : rd.error, rd.ok ? 'g' : 'r')) }),
                _el('button', { class: 'bf-btn bf-btn-danger', text: '✕', onclick: () => fetch(ctx.clearGlassUrl + `/automation/workflows/${wf.id}`, { method: 'DELETE' }).then(() => { if (selectedId === wf.id) selectedId = null; refreshWorkflows(); refreshSteps(); }) }),
              ]);
              wfList.appendChild(row);
            }
          }).catch(e => ctx.toast('workflows fetch failed: ' + e.message, 'r'));
        }

        function refreshSteps() {
          stepsHost.innerHTML = '';
          editorHost.innerHTML = '';
          if (!selectedId) return;
          fetch(ctx.clearGlassUrl + '/automation/workflows').then(r => r.json()).then(d => {
            const wf = d.workflows.find(w => w.id === selectedId);
            if (!wf) return;
            wf.steps.forEach((step, i) => {
              stepsHost.appendChild(_el('div', { class: 'bf-row' }, [
                _el('span', { class: 'bf-row-label', text: `${i + 1}. ${step.type.toUpperCase()}` }),
                _el('button', { class: 'bf-btn', text: '↑', onclick: () => fetch(ctx.clearGlassUrl + `/automation/workflows/${wf.id}/steps/${step.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: 'up' }) }).then(refreshSteps) }),
                _el('button', { class: 'bf-btn', text: '↓', onclick: () => fetch(ctx.clearGlassUrl + `/automation/workflows/${wf.id}/steps/${step.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: 'down' }) }).then(refreshSteps) }),
                _el('button', { class: 'bf-btn', text: 'EDIT', onclick: () => _openStepEditor(wf.id, step) }),
                _el('button', { class: 'bf-btn bf-btn-danger', text: '✕', onclick: () => fetch(ctx.clearGlassUrl + `/automation/workflows/${wf.id}/steps/${step.id}`, { method: 'DELETE' }).then(refreshSteps) }),
              ]));
            });
          }).catch(e => ctx.toast('steps fetch failed: ' + e.message, 'r'));
        }

        function _openStepEditor(wfId, step) {
          editorHost.innerHTML = '';
          const typeSel = _el('select', { class: 'bf-input' },
            Object.keys(STEP_FIELDS).map(t => _el('option', { value: t, text: t, ...(t === step.type ? { selected: 'selected' } : {}) })));
          const fieldsHost = _el('div', {});
          const inputs = {};
          function renderFields(type) {
            fieldsHost.innerHTML = '';
            inputs[type] = inputs[type] || {};
            for (const [key, placeholder] of (STEP_FIELDS[type] || [])) {
              const input = _el('input', { class: 'bf-input', placeholder, value: step.config?.[key] ?? '' });
              inputs[type][key] = input;
              fieldsHost.appendChild(input);
            }
          }
          typeSel.addEventListener('change', () => renderFields(typeSel.value));
          renderFields(step.type);
          editorHost.appendChild(_el('div', { class: 'bf-section-label', text: `EDIT STEP (${step.type})` }));
          editorHost.appendChild(typeSel);
          editorHost.appendChild(fieldsHost);
          editorHost.appendChild(_el('button', {
            class: 'bf-btn bf-btn-g', text: 'SAVE',
            onclick: () => {
              const type = typeSel.value;
              const config = {};
              for (const [key] of (STEP_FIELDS[type] || [])) config[key] = inputs[type][key].value;
              fetch(ctx.clearGlassUrl + `/automation/workflows/${wfId}/steps/${step.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, config }),
              }).then(r => r.json()).then(rd => { ctx.toast(rd.ok ? 'step saved' : rd.error, rd.ok ? 'g' : 'r'); editorHost.innerHTML = ''; refreshSteps(); });
            },
          }));
        }

        container.appendChild(_el('div', {}, [
          _el('div', { class: 'bf-section-label', text: 'WORKFLOWS' }),
          nameIn,
          _el('button', {
            class: 'bf-btn bf-btn-g', text: '+ NEW (draft)',
            onclick: () => fetch(ctx.clearGlassUrl + '/automation/workflows', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: nameIn.value || 'Untitled', status: 'draft', steps: [] }),
            }).then(refreshWorkflows),
          }),
          wfList,
          _el('div', { class: 'bf-section-label', text: 'STEPS (select a workflow above)', style: 'margin-top:8px' }),
          _el('div', { class: 'bf-form-row' }, Object.keys(STEP_FIELDS).map(t => _el('button', {
            class: 'bf-btn', text: '+ ' + t.toUpperCase(),
            onclick: () => { if (!selectedId) return ctx.toast('select a workflow first', 'o'); fetch(ctx.clearGlassUrl + `/automation/workflows/${selectedId}/steps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: t, config: {} }) }).then(refreshSteps); },
          }))),
          stepsHost,
          editorHost,
        ]));
        refreshWorkflows();
      },
      unmount() {},
    });
  }

  global.BrainOSFloat = { mount, unmount, registerTab, getState };

})(window);
