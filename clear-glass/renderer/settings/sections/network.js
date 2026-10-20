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
  const { h, section, pane, row, btn, chip, field, select, toggle, toast, fail } = window.CGS;
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
  const FROM = { set: 'saved path', path: 'on PATH', 'tor-browser': 'from Tor Browser' };
  const SOURCE = { 'tor-browser': 'Tor Browser', bundle: 'installed bundle', 'system-example': 'snowflake-client package', 'tor-project-builtin': 'Tor Project (asked)' };

  section({
    id: 'network', group: 'System', icon: '❄', label: 'Network',
    keywords: 'tor snowflake transport bridge proxy socks anonymity privacy egress route via block direct censorship pluggable',
    blurb: 'How browsing sessions reach the outside. The Tor-with-Snowflake transport is off and configured by you; without a bridge line it does not start.',
    async render({ rerender }) {
      let s, routes, qr;
      try { [s, routes, qr] = await Promise.all([api('/cli/net/status'), api('/cli/net/routes'), api('/cli/net/quarantine').catch(() => ({ items: [] }))]); }
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
              if (!s.bridgeLine && !det.bridgeLine) return toast('set a Snowflake bridge line first — Find bridge line, below');
              return api('/cli/net/transport', { method: 'POST', body: { action: 'start' } }).then(rerender).catch(fail);
            }, 'primary'));

      // ── automatic setup (0.60.168) ───────────────────────────────────────────
      // One button: download the Tor Expert Bundle, check it, unpack it, point the transport at it, restart. Runs in the background
      // (/cli/net/setup); this pane polls /cli/net/setup/status while it runs, so it survives a re-render.
      const setupPane = (() => {
        const bar = h('div', { class: 'net-bar' }, h('i'));
        const msg = h('p', { class: 'blurb net-setup-msg', text: '' });
        const fill = bar.firstChild;
        const go = btn(haveBins ? 'Reinstall / update' : 'Set up automatically', null, 'primary');
        let timer = null;
        const paint = (st) => {
          const live = st.running;
          bar.style.display = live || st.phase === 'done' || st.phase === 'failed' ? '' : 'none';
          fill.style.width = `${Math.max(0, Math.min(100, st.pct || 0))}%`;
          bar.dataset.state = st.phase === 'failed' ? 'err' : st.phase === 'done' ? 'ok' : '';
          msg.textContent = st.message || '';
          msg.className = 'blurb net-setup-msg' + (st.phase === 'failed' ? ' err' : '');
          go.disabled = !!live;
        };
        const poll = async () => {
          let st; try { st = await api('/cli/net/setup/status'); } catch (e) { clearTimeout(timer); return paint({ phase: 'failed', pct: 0, message: e.message }); }
          paint(st);
          if (st.running) timer = setTimeout(poll, 700);
          else if (st.phase === 'done') { toast('Tor and Snowflake are installed'); rerender(); }
          else if (st.phase === 'failed') toast('Setup failed — see the message below');
        };
        go.onclick = () => api('/cli/net/setup', { method: 'POST', body: { force: !!haveBins } }).then(st => { paint(st); poll(); }).catch(fail);
        // pick up a job already running (the page was reopened, or another window started it)
        api('/cli/net/setup/status').then(st => { paint(st); if (st.running) poll(); }).catch(() => paint({ phase: 'idle', pct: 0, message: '' }));
        return pane({ title: 'Automatic setup', sub: 'Downloads the Tor Expert Bundle (tor + the Snowflake client) from the Tor Project, checks it against their published SHA-256, unpacks it into Clear Glass’s own folder, points the transport at it and restarts it.', body: [
          row('Tor · Snowflake programs', haveBins ? 'Found. Reinstalling fetches the newest stable release.' : 'Not found yet — one press does it all.', chip(haveBins ? 'installed' : 'not installed', haveBins ? 'ok' : 'warn'), go),
          bar, msg,
          h('p', { class: 'blurb', text: 'The checksum proves the download is intact; it does not prove the Tor Project’s server is trustworthy (their GPG signature is not checked). A download with no checksum is refused.' }),
        ] });
      })();

      // ── what it needs: the two programs, and a bridge line ───────────────────
      const binChip = (ok, name) => chip(ok ? `${name} found` : `${name} missing`, ok ? 'ok' : 'warn');
      const needs = pane({ title: 'What it needs', sub: 'Clear Glass ships none of these — they are the Tor Project’s. Use Automatic setup above, or detect them / point at your own', body: [
        // SF1 (0.60.178) — the backend sends detect.tor / detect.snowflake and where each came from; this used to read torPath/snowflakePath,
        // which nothing sends, so found programs showed "Not detected on PATH" (his screenshot, 2026-10-21)
        row('Programs', det.tor || det.snowflake ? `tor: ${det.tor ? `${det.tor} (${FROM[det.torFrom] || det.torFrom})` : 'not found'} · Snowflake: ${det.snowflake ? `${det.snowflake} (${FROM[det.snowflakeFrom] || det.snowflakeFrom})` : 'not found'}` : 'Not found on PATH or in a Tor Browser install',
          binChip(det.tor, 'tor'), binChip(det.snowflake, 'snowflake'),
          btn('Detect', () => api('/cli/net/transport', { method: 'POST', body: { action: 'detect' } }).then(rerender).catch(fail))),
        (() => {
          const tor = h('input', { type: 'text', placeholder: det.tor || '/usr/bin/tor', value: det.torFrom === 'set' ? det.tor : '' });
          const sno = h('input', { type: 'text', placeholder: det.snowflake || '/usr/bin/snowflake-client', value: det.snowflakeFrom === 'set' ? det.snowflake : '' });
          return h('div', { class: 'net-paths' },
            field('tor path', tor), field('snowflake path', sno),
            btn('Save paths', () => api('/cli/net/paths', { method: 'POST', body: { torPath: tor.value.trim() || null, snowflakePath: sno.value.trim() || null } }).then(() => { toast('Saved'); rerender(); }).catch(fail)));
        })(),
        (() => {
          const line = h('input', { type: 'text', placeholder: 'snowflake <fingerprint> url=… fronts=… ice=…', value: '' });
          return h('div', { class: 'net-bridge' },
            field('Snowflake bridge line', line, s.bridgeLine || det.bridgeLine ? 'A bridge line is set (hidden). Paste a new one, or use a found one, to replace it.' : 'Find one below, or paste the current line from Tor Browser. Starts with "snowflake" or "Bridge snowflake".'),
            btn('Set bridge', () => { if (!line.value.trim()) return toast('paste a bridge line'); return api('/cli/net/bridge', { method: 'POST', body: { line: line.value.trim() } }).then(() => { line.value = ''; toast('Bridge set'); rerender(); }).catch(fail); }));
        })(),
        // SF2 (0.60.178) — real lines on this machine, each with where it was read; nothing is invented. Asking the Tor Project is a separate,
        // said button: it contacts bridges.torproject.org directly, which a network watching for Tor can see.
        (() => {
          const list = h('div', { class: 'net-found' });
          const show = (r) => {
            list.replaceChildren(...((r.lines || []).length ? r.lines.map(c => row(`${c.n}. ${SOURCE[c.source] || c.source}`, `${c.line.slice(0, 64)}${c.line.length > 64 ? '…' : ''} — ${c.path || ''}`,
              btn('Use', () => api('/cli/net/bridge/use', { method: 'POST', body: { n: c.n } }).then(() => { toast(`Bridge set from ${SOURCE[c.source] || c.source}`); rerender(); }).catch(fail), 'sm')))
              : [h('p', { class: 'blurb', text: 'No Snowflake bridge line on this machine. Install Tor Browser or use Automatic setup above, or ask the Tor Project.' })]));
          };
          return h('div', { class: 'net-finder' },
            row('Find a bridge line', 'Looks in Tor Browser, the installed bundle and the snowflake-client package. Reads files only.',
              btn('Find bridge line', () => api('/cli/net/bridge/find').then(show).catch(fail)),
              btn('Ask the Tor Project', () => api('/cli/net/bridge/builtin', { method: 'POST', body: {} }).then(show).catch(fail))),
            h('p', { class: 'blurb', text: 'Ask the Tor Project contacts bridges.torproject.org directly, not through Tor. Where Tor is blocked that request can be seen or refused; a line from Tor Browser avoids it.' }),
            list);
        })(),
      ] });

      // ── the routed window (SF3–SF5, 0.60.178) ─────────────────────────────────
      const check = s.lastCheck;
      const checkText = !check ? 'Not checked yet. Asks check.torproject.org through the transport; needs it running.'
        : check.ok ? (check.isTor ? `Exits through Tor at ${check.ip} (${new Date(check.at).toLocaleTimeString()})` : `NOT through Tor: the check saw ${check.ip}`)
        : `Check failed: ${check.error}`;
      const windowPane = pane({ title: 'Snowflake windows', sub: 'What "Open link with Snowflake" opens: its page and its shell share one in-memory session routed through the transport, fail closed. Nothing of it is written to disk, and it is cleared when the window closes. It identifies as the ordinary Chromium it is (no persona), and WebRTC cannot send UDP around the proxy.', body: [
        row('HTTPS only', 'Plain http pages are opened over https, and plain http parts of a page are not fetched, so nothing leaves the Tor exit unencrypted. A site with no https will not open while this is on.',
          toggle(s.httpsOnly !== false, (on) => api('/cli/net/https-only', { method: 'POST', body: { on } }).then(() => toast(on ? 'HTTPS only: on' : 'HTTPS only: off'))),
          chip(s.httpsOnly !== false ? 'on' : 'off', s.httpsOnly !== false ? 'ok' : 'warn')),
        row('Circuit', checkText, chip(!check ? 'unchecked' : check.ok && check.isTor ? 'through Tor' : 'not confirmed', !check ? '' : check.ok && check.isTor ? 'ok' : 'err'),
          btn('Check the circuit', () => api('/cli/net/check', { method: 'POST', body: {} }).then(rerender).catch(fail))),
        h('p', { class: 'blurb', text: 'The circuit check shows where traffic exits; it is not the leak test (NP5), so nothing here is marked Verified.' }),
      ] });

      // ── CD4/CD5 (0.60.179): on disconnect, downloads in quarantine, magnets and the torrent hand-off ─────────────
      const RUNG_TEXT = { block: 'Block — the window stays open and loads nothing until the transport is back', kill_tabs: 'Close the windows — every Snowflake window closes, its downloads are cancelled and its torrents stopped', kill_compartment: 'Close and wipe — as above, then the transport is stopped with its data wiped, and the quarantine is wiped' };
      const rungSel = select(['kill_tabs', 'block', 'kill_compartment'], s.onDisconnect || 'kill_tabs');
      rungSel.addEventListener('change', () => api('/cli/net/on-disconnect', { method: 'POST', body: { rung: rungSel.value } }).then(() => { toast(`On disconnect: ${rungSel.value}`); rerender(); }).catch(fail));
      const lastKill = (s.kills || [])[0];
      const items = ((qr && qr.items) || []).filter(q => q.state !== 'released' && q.state !== 'discarded');
      const qRows = items.length ? items.map(q => row(`${q.kind === 'magnet' ? '🧲' : '📄'} ${q.filename}`,
        `${q.state}${q.bytes ? ` · ${(q.bytes / 1048576).toFixed(1)} MB` : ''}${q.via ? ` · via ${q.via}` : ''}${q.sha256 ? ` · sha256 ${q.sha256.slice(0, 12)}…` : ''}`,
        q.kind === 'file' && q.state === 'quarantined' ? btn('Release', () => api('/cli/net/quarantine/release', { method: 'POST', body: { id: q.id } }).then(r => { toast(`Released to ${r.path}`); rerender(); }).catch(fail), 'sm') : null,
        q.kind === 'magnet' && q.state === 'quarantined' ? btn('Send to qBittorrent', () => api('/cli/net/magnet/handoff', { method: 'POST', body: { id: q.id } }).then(r => { toast(`Added (${r.path})`); rerender(); }).catch(fail), 'sm') : null,
        q.kind === 'magnet' ? btn('Copy', () => navigator.clipboard.writeText(q.url).then(() => toast('Magnet copied')), 'sm') : null,
        btn('Discard', () => api('/cli/net/quarantine/discard', { method: 'POST', body: { id: q.id } }).then(rerender).catch(fail), 'sm')))
        : [h('p', { class: 'blurb', text: 'Nothing in quarantine. What a Snowflake window downloads lands here, not in Downloads, until you release it; magnet links it meets are listed here and never opened.' })];
      const qb = s.qbit || {};
      const qbUrl = h('input', { type: 'text', placeholder: 'http://127.0.0.1:8080', value: qb.url || '' });
      const qbUser = h('input', { type: 'text', placeholder: 'user (empty with localhost bypass)', value: qb.user || '' });
      const qbPass = h('input', { type: 'password', placeholder: qb.password ? 'held in memory' : 'password (kept in memory only)', value: '' });
      const qbOut = h('p', { class: 'blurb net-qbit-out', text: '' });
      const compPane = pane({ title: 'Snowflake downloads', sub: 'Downloads and magnet links from Snowflake windows, and what happens when the connection drops.', body: [
        row('On disconnect', RUNG_TEXT[s.onDisconnect || 'kill_tabs'] + (lastKill ? ` · last: ${new Date(lastKill.at).toLocaleString()} (${lastKill.rung}, ${lastKill.closed.length} window(s))` : ''), rungSel),
        h('div', { class: 'net-quarantine' }, qRows),
        h('div', { class: 'net-qbit' },
          row('Torrents (qBittorrent)', 'A magnet is sent only after qBittorrent\'s own settings show its peer traffic going through a SOCKS5/HTTP proxy that is not Tor, or bound to your VPN interface. Tor is refused: it carries TCP only, and the Tor Project asks that BitTorrent not use it.'),
          field('Web UI address', qbUrl), field('User', qbUser), field('Password', qbPass, 'Not saved to disk: kept until Clear Glass closes. With "Bypass authentication for clients on localhost" on in qBittorrent, leave it empty.'),
          h('div', { class: 'acts' },
            btn('Save', () => api('/cli/net/qbit', { method: 'POST', body: { url: qbUrl.value.trim() || null, user: qbUser.value, ...(qbPass.value ? { pass: qbPass.value } : {}) } }).then(() => { toast('Saved'); rerender(); }).catch(fail)),
            btn('Check qBittorrent', () => api('/cli/net/qbit/check', { method: 'POST', body: {} }).then(r => { qbOut.textContent = `✓ ${r.path}`; qbOut.className = 'blurb net-qbit-out ok'; }).catch(e => { qbOut.textContent = `✗ ${e.message}`; qbOut.className = 'blurb net-qbit-out err'; }))),
          qbOut),
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
        setupPane,
        needs,
        windowPane,
        compPane,
        routing,
      ];
    },
  });
})();
