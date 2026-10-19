'use strict';
/**
 * renderer/settings/sections/network.js — Network  (styles: network.css)
 *
 * 0.60.160 — James, 2026-10-18: "can you add snowflake to the ui. it doesn't show up as a plugin." The Tor-with-Snowflake
 * transport (src/net/transport-host.js, NP1, 0.60.60) had a full backend, routes and CLI (/cli/net/*, the `net` command) but
 * no UI — the last step of his order of delivery (backend → route → command → UI) was never done, so nothing in the app showed
 * it. It is not a webextension, so it is not a plugin; its home is here, in the System group beside Connections (his call,
 * 2026-10-18: "New Network section").
 *
 * Reads only src/net/service.js, through the same bridge the Library uses (http://127.0.0.1:7702/cli/net/*). No route is
 * decided here; the UI floats on top (DB7). It shows: the transport's live state, whether tor and a snowflake client are
 * found, the bridge line (set, never shown back in full), start/stop, the default posture, and the route rules.
 */
(function () {
  const { h, section, pane, row, btn, chip, field, select, toast, fail } = window.CGS;
  const BRIDGE = 'http://127.0.0.1:7702';

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(BRIDGE + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    } catch (e) { throw new Error(`Clear Glass bridge :7702 unreachable (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); }
    let j = null; try { j = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok || (j && (j.error || j.ok === false))) throw new Error((j && j.error) || `HTTP ${res.status} on ${path}`);
    return j || {};
  }

  const STATE_KIND = { ready: 'ok', bootstrapping: 'warn', starting: 'warn', stopping: 'warn', failed: 'err', stopped: '' };

  section({
    id: 'network', group: 'System', icon: '❄', label: 'Network',
    keywords: 'tor snowflake transport bridge proxy socks anonymity privacy egress route via block direct censorship pluggable',
    blurb: 'How browsing sessions reach the outside. The Tor-with-Snowflake transport is off and configured by you; without a bridge line it does not start.',
    async render({ rerender }) {
      let s, routes;
      try { [s, routes] = await Promise.all([api('/cli/net/status'), api('/cli/net/routes')]); }
      catch (e) { return [pane({ title: 'Network', body: h('div', { class: 'err-box', text: e.message }) })]; }

      const t = s.transport || { state: 'stopped' };
      const det = s.detect || {};
      const running = t.state === 'ready' || t.state === 'bootstrapping' || t.state === 'starting';
      const haveBins = det.tor && det.snowflake;

      // ── the transport ──────────────────────────────────────────────────────
      const stateRow = row('Transport',
        t.state === 'ready' ? `Connected through Tor (Snowflake bridge) on 127.0.0.1:${t.socksPort || '?'}`
          : t.state === 'bootstrapping' ? `Connecting… ${t.progress || 0}%`
          : t.state === 'failed' ? `Failed${t.error ? ': ' + t.error : ''}`
          : 'Off — sessions go direct unless a rule says otherwise',
        chip(t.state, STATE_KIND[t.state] || ''),
        running
          ? btn('Stop', () => api('/cli/net/transport', { method: 'POST', body: { action: 'stop' } }).then(rerender), 'danger')
          : btn('Start', async () => {
              if (!haveBins) return toast('tor and a Snowflake client must be found first');
              if (!s.bridgeLine && !t.bridgeLine) return toast('set a Snowflake bridge line first');
              return api('/cli/net/transport', { method: 'POST', body: { action: 'start' } }).then(rerender).catch(fail);
            }, 'primary'));

      // ── what it needs: the two programs, and a bridge line ───────────────────
      const binChip = (ok, name) => chip(ok ? `${name} found` : `${name} missing`, ok ? 'ok' : 'warn');
      const needs = pane({ title: 'What it needs', sub: 'Clear Glass ships none of these — they are the Tor Project’s, detected or pointed at by you', body: [
        row('Programs', det.torPath || det.snowflakePath ? `${det.torPath || 'tor: not set'} · ${det.snowflakePath || 'snowflake: not set'}` : 'Not detected on PATH',
          binChip(det.tor, 'tor'), binChip(det.snowflake, 'snowflake'),
          btn('Detect', () => api('/cli/net/transport', { method: 'POST', body: { action: 'detect' } }).then(rerender).catch(fail))),
        (() => {
          const tor = h('input', { type: 'text', placeholder: '/usr/bin/tor', value: det.torPath || '' });
          const sno = h('input', { type: 'text', placeholder: '/usr/bin/snowflake-client', value: det.snowflakePath || '' });
          return h('div', { class: 'net-paths' },
            field('tor path', tor), field('snowflake path', sno),
            btn('Save paths', () => api('/cli/net/paths', { method: 'POST', body: { torPath: tor.value.trim() || null, snowflakePath: sno.value.trim() || null } }).then(() => { toast('Saved'); rerender(); }).catch(fail)));
        })(),
        (() => {
          const line = h('input', { type: 'text', placeholder: 'snowflake <fingerprint> url=… fronts=… ice=…', value: '' });
          return h('div', { class: 'net-bridge' },
            field('Snowflake bridge line', line, s.bridgeLine || t.bridgeLine ? 'A bridge line is set (hidden). Paste a new one to replace it.' : 'Get the current line from Tor Browser. Starts with "snowflake" or "Bridge snowflake".'),
            btn('Set bridge', () => { if (!line.value.trim()) return toast('paste a bridge line'); return api('/cli/net/bridge', { method: 'POST', body: { line: line.value.trim() } }).then(() => { line.value = ''; toast('Bridge set'); rerender(); }).catch(fail); }));
        })(),
      ] });

      // ── routing: the default posture and the rules ───────────────────────────
      const VIAS = ['direct', 'block', 'transport'];
      const def = s.default || (routes && routes.default) || 'direct';
      const defSel = select(VIAS, def);
      defSel.addEventListener('change', () => api('/cli/net/default', { method: 'POST', body: { via: defSel.value } }).then(() => { toast(`Default: ${defSel.value}`); rerender(); }).catch(e => { defSel.value = def; fail(e); }));

      const rules = (routes && routes.rules) || [];
      const ruleRows = rules.length ? rules.map(r => row(
        `${r.match && (r.match.urlPattern || r.match.origin || r.match.provider || r.match.caller) || 'any'}`,
        `via ${r.via}${r.match && r.match.provider ? ` · provider ${r.match.provider}` : ''}`,
        chip(r.via, r.via === 'block' ? 'err' : r.via === 'transport' ? 'warn' : ''),
        btn('Remove', () => api('/cli/net/routes/rm', { method: 'POST', body: { id: r.id } }).then(rerender).catch(fail), 'sm')))
        : [h('p', { class: 'blurb', text: 'No rules. With none, nothing is routed and no session is touched.' })];

      const routing = pane({ title: 'Routing', sub: s.statusNote || 'Applied to registered agent windows only.', body: [
        row('Default', 'What a session does when no rule matches it', defSel),
        h('div', { class: 'net-rules' }, ruleRows),
        s.collisions ? h('p', { class: 'warn-box', text: `${s.collisions} rule(s) overlap — the most specific wins.` }) : null,
      ] });

      return [
        pane({ title: 'Tor · Snowflake', sub: 'A bridge that reaches Tor where Tor is blocked, by looking like an ordinary WebRTC call. Adds no cryptography of its own; it gives a session anonymity and censorship-resistance. Isolated: its own wiped-on-stop data dir, ports on 127.0.0.1 only, no Nexus secrets in its environment.', body: stateRow }),
        needs,
        routing,
      ];
    },
  });
})();
