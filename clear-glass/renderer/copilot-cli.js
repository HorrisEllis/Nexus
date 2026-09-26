'use strict';
/**
 * renderer/copilot-cli.js — the Co-pilot pane's CLI, wearing the Clear Glass hat
 * component_id: cg.renderer.copilot-cli
 *
 * §BUILT 2026-09-26 — James: "make a clearglass hat for the copilot cli,
 * match the idearium agent cli or the floating menu cli in the tv ui."
 *
 * Matches both, on purpose:
 *   - ui/tv-shell/menu.js: a backend toggle (ollama | copilot | guardian)
 *     and an NCP agent dropdown, where clicking and typing /backend or
 *     /agent are the same event-driven path.
 *   - idearium's repo agent CLI (idearium/ui/js/app.js AGENT_CLI_*): slash
 *     commands against the hat (/hat /forge /persona /status /help), input
 *     history on ↑/↓, Tab completion, aliases.
 * The route is per window and per call (sent with each message); the
 * default comes from Settings → Co-pilot. Nothing here switches copilot's
 * global agent — see src/copilot/hat.js.
 *
 * Loaded before browser.js; browser.js calls CGCopilotCLI.create({...})
 * with its own cg / agentId / webview / message printer.
 */
(function () {
  const BACKENDS = ['ollama', 'copilot', 'guardian'];
  const AGENTS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek'];   // same real NCP set as ui/tv-shell/menu.js

  const HELP = [
    'CO-PILOT CLI — wearing the Clear Glass hat',
    '  /help                           this list',
    '  /status                         route, hat, context, this tab',
    '  /backend ollama|copilot|guardian  who answers (same as the toggle)',
    '  /agent claude|chatgpt|gemini|perplexity  NCP agent when backend is guardian',
    '  /hat [on|off]                   show the hat, or wear/remove it for this window',
    '  /forge                          create the clear_glass hat if it has none',
    '  /persona <text>                 replace the hat\'s persona (hat forge update)',
    '  /ctx dom|picks|cookies [on|off] what each message carries',
    '  /run <n> | /run all             run a proposed command (when auto-run is off)',
    '  /go <url>  /back  /forward  /reload',
    '  /site [key [value|--delete]]    this site\'s settings',
    '  /macro list | /macro run <name> [key=value …]',
    '  /cookies                        cookie count for this page',
    '  /build <description>  /diagnose [topic]',
    '  /history  /clear  /settings',
    'anything else is a message to co-pilot',
  ];
  const ALIASES = { '?': 'help', h: 'help', st: 'status', b: 'backend', a: 'agent', be: 'backend', p: 'persona', hist: 'history', cls: 'clear', s: 'site', m: 'macro', diag: 'diagnose' };
  const COMMANDS = ['help', 'status', 'backend', 'agent', 'hat', 'forge', 'persona', 'ctx', 'run', 'go', 'back', 'forward', 'reload', 'site', 'macro', 'cookies', 'build', 'diagnose', 'history', 'clear', 'settings'];

  function create({ cg, agentId, wv, print, getCtx, setCtx, sendMessage, clearMessages, normalizeUrl, navigate }) {
    const state = { backend: 'copilot', agent: 'claude', hat: true, pending: [], history: [], pos: -1, historyMax: 200, hatName: 'clear_glass', autoRun: true, showRoute: true };
    const HIST_KEY = `cg.copilot.history.${agentId}`;
    try { state.history = JSON.parse(sessionStorage.getItem(HIST_KEY) || '[]'); } catch (_) {}

    // ── route bar (the TV menu's toggle + dropdown, and the hat chip) ────
    const bar = document.getElementById('copilot-route');
    let btns = {}, agentSel = null, hatChip = null;
    if (bar) {
      bar.replaceChildren();
      for (const b of BACKENDS) {
        const el = document.createElement('button');
        el.className = 'cr-toggle'; el.textContent = b; el.title = b === 'copilot' ? 'copilot decides (ollama first, then guardian)' : b === 'ollama' ? 'local models only' : 'a specific NCP agent';
        el.addEventListener('click', () => setBackend(b, true));
        bar.append(el); btns[b] = el;
      }
      agentSel = document.createElement('select');
      agentSel.className = 'cr-agent'; agentSel.title = 'NCP agent (guardian)';
      for (const a of AGENTS) { const o = document.createElement('option'); o.value = a; o.textContent = a; agentSel.append(o); }
      agentSel.addEventListener('change', () => setAgent(agentSel.value, true));
      hatChip = document.createElement('button');
      hatChip.className = 'cr-hat'; hatChip.title = 'the Clear Glass hat — click to wear/remove for this window';
      hatChip.addEventListener('click', () => setHat(!state.hat, true));
      bar.append(agentSel, hatChip);
    }
    function paint() {
      for (const b of BACKENDS) btns[b] && btns[b].classList.toggle('on', state.backend === b);
      if (agentSel) { agentSel.value = state.agent; agentSel.style.display = state.backend === 'guardian' ? '' : 'none'; }
      if (hatChip) { hatChip.textContent = `🎩 ${state.hatName}`; hatChip.classList.toggle('on', state.hat); }
      const m = document.getElementById('copilot-model');
      if (m) m.textContent = state.backend === 'guardian' ? `guardian · ${state.agent}` : state.backend;
    }
    function setBackend(b, say) {
      if (!BACKENDS.includes(b)) { print('cli', `backend must be one of: ${BACKENDS.join(', ')}`); return; }
      state.backend = b; paint(); if (say) print('cli', `→ backend: ${b}${b === 'guardian' ? ` (${state.agent})` : ''}`);
    }
    function setAgent(a, say) {
      if (!AGENTS.includes(a)) { print('cli', `agent must be one of: ${AGENTS.join(', ')}`); return; }
      state.agent = a; if (state.backend !== 'guardian') state.backend = 'guardian'; paint(); if (say) print('cli', `→ guardian · ${a}`);
    }
    function setHat(on, say) { state.hat = !!on; paint(); if (say) print('cli', on ? `🎩 wearing ${state.hatName}` : 'hat off — plain co-pilot'); }

    // defaults from Settings → Co-pilot, and the hat's real name
    (async () => {
      try {
        const s = await cg.api.get();
        if (s) {
          if (BACKENDS.includes(s.copilotBackend)) state.backend = s.copilotBackend;
          if (AGENTS.includes(s.copilotAgent)) state.agent = s.copilotAgent;
          state.hat = s.copilotWearHat !== false;
          state.autoRun = s.copilotAutoRunCommands !== false;
          state.historyMax = Number(s.copilotHistoryMax) || 200;
          state.showRoute = s.copilotShowRoute !== false;
        }
      } catch (_) {}
      try { const h = await cg.copilot.hat(); if (h && h.name) state.hatName = h.name; } catch (_) {}
      paint();
    })();
    paint();

    // ── input history + completion ───────────────────────────────────────
    function remember(text) {
      if (state.history[state.history.length - 1] !== text) state.history.push(text);
      if (state.history.length > state.historyMax) state.history.splice(0, state.history.length - state.historyMax);
      state.pos = -1;
      try { sessionStorage.setItem(HIST_KEY, JSON.stringify(state.history)); } catch (_) {}
    }
    function onKey(e, input) {
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const single = !input.value.includes('\n');
      if (e.key === 'ArrowUp' && (single || atStart) && state.history.length) {
        e.preventDefault();
        state.pos = state.pos < 0 ? state.history.length - 1 : Math.max(0, state.pos - 1);
        input.value = state.history[state.pos]; return true;
      }
      if (e.key === 'ArrowDown' && state.pos >= 0 && single) {
        e.preventDefault();
        state.pos = state.pos + 1 >= state.history.length ? -1 : state.pos + 1;
        input.value = state.pos < 0 ? '' : state.history[state.pos]; return true;
      }
      if (e.key === 'Tab' && input.value.startsWith('/') && !input.value.includes(' ')) {
        e.preventDefault();
        const stem = input.value.slice(1).toLowerCase();
        const hits = COMMANDS.filter(c => c.startsWith(stem));
        if (hits.length === 1) input.value = `/${hits[0]} `;
        else if (hits.length > 1) print('cli', hits.map(c => '/' + c).join('  '));
        return true;
      }
      return false;
    }

    // ── proposed commands (auto-run off) ─────────────────────────────────
    function propose(commands) {
      state.pending = commands.slice();
      if (!commands.length) return;
      print('cli', ['proposed — not run (auto-run is off in Settings → Co-pilot):',
        ...commands.map((c, i) => `  ${i + 1}. ${c.action}${c.selector ? ' ' + c.selector : ''}${c.url ? ' ' + c.url : ''}${c.text ? ` "${String(c.text).slice(0, 40)}"` : ''}`),
        '/run <n> or /run all'].join('\n'));
    }
    async function runPending(which) {
      if (!state.pending.length) { print('cli', 'nothing proposed'); return; }
      const idx = which === 'all' ? state.pending.map((_, i) => i) : [Number(which) - 1];
      for (const i of idx) {
        const c = state.pending[i];
        if (!c) { print('cli', `no command ${i + 1}`); continue; }
        const r = await cg.copilot.exec(c, agentId).catch(e => ({ ok: false, error: e.message }));
        print('cli', r && r.ok ? `✓ ${i + 1}. ${c.action}` : `✗ ${i + 1}. ${c.action}: ${(r && r.error) || 'failed'}`);
      }
      if (which === 'all') state.pending = [];
    }

    // ── commands ─────────────────────────────────────────────────────────
    async function handle(raw) {
      const text = raw.trim();
      if (!text) return true;
      remember(text);
      if (!text.startsWith('/')) return false;
      const [head, ...rest] = text.slice(1).split(/\s+/);
      const cmd = ALIASES[head.toLowerCase()] || head.toLowerCase();
      const arg = text.slice(1 + head.length).trim();
      if (cmd === 'build' || cmd === 'diagnose') return { passthrough: `/${cmd} ${arg}`.trim() };
      print('user', text);
      try {
        switch (cmd) {
          case 'help': print('cli', HELP.join('\n')); break;
          case 'status': {
            const ctx = getCtx();
            let h = null; try { h = await cg.copilot.hat(); } catch (_) {}
            print('cli', [
              `route      ${state.backend}${state.backend === 'guardian' ? ' · ' + state.agent : ''}`,
              `hat        ${state.hat ? '🎩 ' + state.hatName : 'off'}${h && !h.exists ? ' (built-in persona — /forge to make it a real hat)' : ''}`,
              `context    dom ${ctx.dom ? 'on' : 'off'} · picks ${ctx.picks ? 'on' : 'off'} · cookies ${ctx.cookies ? 'on' : 'off'}`,
              `auto-run   ${state.autoRun ? 'on' : 'off'}${state.pending.length ? ` · ${state.pending.length} proposed` : ''}`,
              `tab        ${agentId} · ${wv.getURL ? wv.getURL() : ''}`,
            ].join('\n'));
            break;
          }
          case 'backend': arg ? setBackend(arg.toLowerCase(), true) : print('cli', `backend: ${state.backend} — /backend ${BACKENDS.join('|')}`); break;
          case 'agent': arg ? setAgent(arg.toLowerCase(), true) : print('cli', `agent: ${state.agent} — /agent ${AGENTS.join('|')}`); break;
          case 'hat': {
            if (/^(on|off)$/i.test(arg)) { setHat(arg.toLowerCase() === 'on', true); break; }
            const h = await cg.copilot.hat();
            print('cli', `${h.exists ? '🎩 ' + h.name + (h.baseAgent ? ` · base ${h.baseAgent}` : '') : '🎩 ' + (h.name || 'clear_glass') + ' (built-in — /forge to make it real)'}${state.hat ? '' : ' · not worn in this window'}\n\n${h.personaPrompt || '(empty persona)'}`);
            break;
          }
          case 'forge': {
            const r = await cg.copilot.hatEnsure();
            if (r && r.ok === false) print('cli', `forge refused: ${r.error}`);
            else { state.hatName = r.name || state.hatName; paint(); print('cli', r.created ? `forged ${r.name}` : `already exists: ${r.name}`); }
            break;
          }
          case 'persona': {
            if (!arg) { print('cli', 'usage: /persona <the whole new persona text>'); break; }
            const r = await cg.copilot.hatUpdate({ personaPrompt: arg });
            print('cli', r && r.ok === false ? `persona NOT updated: ${r.error}` : 'persona updated');
            break;
          }
          case 'ctx': {
            const [what, onoff] = rest;
            if (!['dom', 'picks', 'cookies'].includes(what)) { print('cli', 'usage: /ctx dom|picks|cookies [on|off]'); break; }
            const cur = getCtx()[what];
            const next = onoff ? onoff === 'on' : !cur;
            setCtx(what, next); print('cli', `context ${what}: ${next ? 'on' : 'off'}`);
            break;
          }
          case 'run': await runPending(arg || '1'); break;
          case 'go': {
            const u = normalizeUrl(arg);
            if (!u) { print('cli', 'usage: /go <url or search>'); break; }
            navigate(u); print('cli', `→ ${u}`); break;
          }
          case 'back': wv.canGoBack && wv.canGoBack() ? wv.goBack() : print('cli', 'no history back'); break;
          case 'forward': wv.canGoForward && wv.canGoForward() ? wv.goForward() : print('cli', 'no history forward'); break;
          case 'reload': wv.reload(); break;
          case 'site': {
            const url = wv.getURL();
            const [key, ...vals] = rest;
            if (!key) {
              const all = await cg.siteSettings.getAll(url);
              const keys = Object.keys(all || {});
              print('cli', keys.length ? keys.map(k => `${k} = ${JSON.stringify(all[k])}`).join('\n') : 'no settings for this site');
            } else if (vals[0] === '--delete') {
              await cg.siteSettings.deleteKey(url, key); print('cli', `removed ${key}`);
            } else if (!vals.length) {
              print('cli', `${key} = ${JSON.stringify(await cg.siteSettings.get(url, key))}`);
            } else {
              let v = vals.join(' '); try { v = JSON.parse(v); } catch (_) {}
              await cg.siteSettings.set(url, key, v); print('cli', `${key} = ${JSON.stringify(v)}`);
            }
            break;
          }
          case 'macro': {
            const [sub, name, ...kv] = rest;
            if (!sub || sub === 'list') {
              const r = await cg.macros.list();
              const ms = (r && r.macros) || [];
              print('cli', ms.length ? ms.map(m => `${m.name}  ${m.steps} step${m.steps === 1 ? '' : 's'}${(m.params || []).length ? `  needs ${m.params.join(', ')}` : ''}`).join('\n') : 'no macros — Settings → Macros');
            } else if (sub === 'run' && name) {
              const params = Object.fromEntries(kv.map(p => p.split('=')).filter(p => p.length === 2));
              print('cli', `running ${name}…`);
              const r = await cg.macros.run(name, { agentId, params });
              print('cli', r && r.ok !== false ? `✓ ${name} — ${(r.results || []).length} steps` : `✗ ${name}: ${(r && r.error) || 'failed'}`);
            } else print('cli', 'usage: /macro list | /macro run <name> [key=value …]');
            break;
          }
          case 'cookies': {
            const r = await cg.cookies.count({ url: wv.getURL(), agentId });
            print('cli', r && r.ok ? `${r.count} cookie${r.count === 1 ? '' : 's'} for this page` : `cookies: ${(r && r.error) || 'unavailable'}`);
            break;
          }
          case 'history': print('cli', state.history.slice(-30).map((h, i, a) => `${String(state.history.length - a.length + i + 1).padStart(4)}  ${h}`).join('\n') || 'empty'); break;
          case 'clear': clearMessages(); break;
          case 'settings': cg.window.openSettings(); break;
          default: print('cli', `unknown command /${head} — /help`);
        }
      } catch (e) { print('cli', `✗ /${cmd}: ${e.message}`); }
      return true;
    }

    return {
      handle, onKey, propose,
      route: () => ({ backend: state.backend, agent: state.backend === 'guardian' ? state.agent : undefined, hat: state.hat }),
      state,
    };
  }

  window.CGCopilotCLI = { create, HELP, COMMANDS };
})();
