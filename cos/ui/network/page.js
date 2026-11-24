/* cos/ui/network/page.js — the Network page (CA3, 0.60.379; cos/spec/network.spec MOD-NET-PAGE).
   James, 2026-11-02: "Gate behind settings to open. Make a full detailed settings for network." Every setting from one list (FIELDS); Save sends
   only what changed, asks first when it opens something, and shows each engine's gate after. A token is typed to replace it, never shown. */
(function () {
  'use strict';
  const API = '/api/cos/network';
  const $ = (id) => document.getElementById(id);
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else if (v !== null && v !== undefined) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c) e.appendChild(c); return e; };
  const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  // [path, label, kind, help, options]
  const FIELDS = [
    ['Outbound — Nexus reaches out (nothing on your router is opened)', [
      ['outbound.enabled', 'Outbound reach', 'bool', 'The master switch for everything in this section.'],
      ['outbound.tunnel.enabled', 'Tunnel', 'bool', 'An encrypted tunnel out to Cloudflare or ngrok; your devices reach Nexus through it.'],
      ['outbound.tunnel.provider', 'Tunnel provider', 'select', null, ['cloudflare', 'ngrok']],
      ['outbound.tunnel.token', 'Tunnel token', 'secret', 'Optional. From a Cloudflare Tunnel you made in your account; with it the tunnel is a named one. Leave it empty for a quick tunnel: no account, a random address. Never shown back.'],
      ['outbound.tunnel.hostname', 'Tunnel hostname', 'text', 'Named tunnel only: the public hostname you set in Cloudflare (e.g. nexus.example.com). It is the address shown under the QR code.'],
      ['outbound.tunnel.systems', 'Systems through the tunnel', 'list', 'Quick tunnel: one address per system, to the port COS knows for it. A named tunnel ignores this: Cloudflare decides what it serves.'],
      ['outbound.rendezvous.enabled', 'Rendezvous (device to device)', 'bool', 'Each of your devices keeps an outbound connection; the rendezvous introduces them for a direct, encrypted link.'],
      ['outbound.rendezvous.url', 'Rendezvous address', 'text', 'https:// or wss:// of the rendezvous you run.'],
      ['outbound.rendezvous.deviceName', 'This device\'s name', 'text', null],
      ['outbound.rendezvous.allowedDevices', 'Devices allowed to connect', 'list', 'Device names, comma separated.']]],
    ['Inbound — the internet reaches Nexus (opens a port on your router)', [
      ['inbound.enabled', 'Inbound reach', 'bool', 'The master switch for everything in this section. Every open port faces the internet.'],
      ['inbound.mapping.enabled', 'Router port mapping', 'bool', 'Ask the router to forward ports (UPnP, PCP or NAT-PMP, whichever it answers).'],
      ['inbound.mapping.protocols', 'Mapping protocols', 'list', 'Some of upnp, pcp, natpmp.'],
      ['inbound.mapping.ports', 'Ports to forward', 'ports', 'One per line: external:internal:system (e.g. 8443:9000:orchestrator).'],
      ['inbound.mapping.leaseSeconds', 'Mapping lease (seconds)', 'number', 'Renewed before it runs out; 60–86400.'],
      ['inbound.ddns.enabled', 'Dynamic DNS', 'bool', 'Keeps a name pointing at your changing home address.'],
      ['inbound.ddns.provider', 'DDNS provider', 'select', null, ['duckdns', 'cloudflare']],
      ['inbound.ddns.domain', 'Domain', 'text', 'e.g. mynexus.duckdns.org'],
      ['inbound.ddns.token', 'DDNS token', 'secret', 'Never shown back.'],
      ['inbound.ddns.intervalSeconds', 'Check every (seconds)', 'number', '60–86400.'],
      ['inbound.ssh.enabled', 'SSH', 'bool', 'Windows\' own OpenSSH, keys only.'],
      ['inbound.ssh.port', 'SSH port', 'number', '1–65535.'],
      ['inbound.ssh.keysOnly', 'Keys only', 'fixed', 'Always on: passwords are never accepted (§4.3).'],
      ['inbound.ssh.allowedKeys', 'Allowed public keys', 'keys', 'One per line (ssh-ed25519 …).']]],
    ['TLS', [
      ['tls.requiredInbound', 'Required for anything inbound', 'fixed', 'Always on (§4.3).'],
      ['tls.certPath', 'Certificate file', 'text', null], ['tls.keyPath', 'Key file', 'text', null]]],
  ];
  let cur = null, dirty = {};
  const say = (cls, t) => { const m = $('nw-msg'); m.className = 'nw-msg ' + cls; m.textContent = t; };
  function input(path, kind, opts) {
    const v = get(cur, path), on = (x) => { dirty[path] = x; $('nw-save').disabled = !Object.keys(dirty).length; if (st) paintTunnel(); };
    if (kind === 'bool') { const i = el('input', { type: 'checkbox', 'data-path': path }); i.checked = !!v; i.onchange = () => on(i.checked); return i; }
    if (kind === 'fixed') { const i = el('input', { type: 'checkbox', disabled: 'disabled', 'data-path': path }); i.checked = !!v; return i; }
    if (kind === 'select') { const s = el('select', { 'data-path': path }, opts.map(o => el('option', { value: o, text: o }))); s.value = v; s.onchange = () => on(s.value); return s; }
    if (kind === 'number') { const i = el('input', { type: 'number', 'data-path': path, value: v }); i.onchange = () => on(Number(i.value)); return i; }
    if (kind === 'secret') {
      const i = el('input', { type: 'password', 'data-path': path, placeholder: v && v.set ? 'set — type to replace' : 'not set', autocomplete: 'off' }); i.onchange = () => on(i.value);
      if (!(v && v.set)) return i;
      const b = el('button', { type: 'button', class: 'nw-clear', text: 'Clear' }); b.onclick = () => { i.value = ''; i.placeholder = 'will be cleared when you save'; on(''); };
      return el('div', { class: 'nw-secret' }, [i, b]);
    }
    if (kind === 'list') { const i = el('input', { type: 'text', 'data-path': path, value: (v || []).join(', ') }); i.onchange = () => on(i.value.split(',').map(x => x.trim()).filter(Boolean)); return i; }
    if (kind === 'keys') { const t = el('textarea', { 'data-path': path }); t.value = (v || []).join('\n'); t.onchange = () => on(t.value.split('\n').map(x => x.trim()).filter(Boolean)); return t; }
    if (kind === 'ports') { const t = el('textarea', { 'data-path': path }); t.value = (v || []).map(p => `${p.external}:${p.internal}:${p.system}`).join('\n');
      t.onchange = () => on(t.value.split('\n').map(x => x.trim()).filter(Boolean).map(l => { const [e, i, s] = l.split(':'); return { external: Number(e), internal: Number(i), system: (s || '').trim() }; })); return t; }
    const i = el('input', { type: 'text', 'data-path': path, value: v || '' }); i.onchange = () => on(i.value); return i;
  }
  function draw(d) {
    cur = d.settings; dirty = {}; $('nw-save').disabled = true;
    $('nw-gates').replaceChildren(...Object.entries(d.gates || {}).map(([e, g]) => el('span', { class: 'nw-gate ' + (g.ok ? 'open' : 'closed'), title: g.why, 'data-gate': e, text: `${e} · ${g.ok ? 'open' : 'closed'}` })));
    $('nw-sections').replaceChildren(...FIELDS.map(([title, rows]) => el('section', { class: 'panel nw-sec' }, [el('h2', { text: title }),
      ...rows.map(([p, label, kind, help, opts]) => el('div', { class: 'nw-row' + (kind === 'fixed' ? ' fixed' : '') }, [el('label', { text: label }), input(p, kind, opts), help ? el('div', { class: 'nw-help', text: help }) : null]))])));
    drawComps(); refreshTunnel();   // what the tunnel and the compartments show depends on what was just saved
  }
  async function load() {
    try { const r = await fetch(API); const d = await r.json(); if (d.ok === false) throw new Error(d.error); draw(d); }
    catch (e) { say('bad', `COS's manager did not answer: ${e.message}`); }
  }
  $('nw-save').onclick = async () => {
    const opens = Object.entries(dirty).filter(([p, v]) => /enabled$/.test(p) && v === true).map(([p]) => p);
    if (opens.length && !window.confirm(`This opens: ${opens.join(', ')}.\n\nSave?`)) return;
    const patch = {}; for (const [p, v] of Object.entries(dirty)) { const ks = p.split('.'); let x = patch; ks.slice(0, -1).forEach(k => { x = x[k] = x[k] || {}; }); x[ks[ks.length - 1]] = v; }
    try { const r = await fetch(API, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch, by: 'person' }) }); const d = await r.json();
      if (!r.ok || d.ok === false) return say('bad', d.error || `refused (${r.status})`);
      draw(d); say('ok', `Saved: ${d.changed.map(c => c.path).join(', ')}`); } catch (e) { say('bad', e.message); }
  };

  // ── compartments: each system's own network switch and limit (compartments.<system>.network | bytesPerSec) ─────────────────────────────
  let systems = [];
  async function drawComps() {
    const box = $('nw-comps');
    try { const r = await fetch('/api/cos/systems'); const d = await r.json(); systems = (d.systems || []).map(x => x.name).filter(n => /^[a-z][a-z0-9-]{0,40}$/.test(n)).sort(); }
    catch (_) { box.textContent = 'COS\'s manager did not list its systems.'; return; }
    if (!systems.length) { box.textContent = 'No systems declared.'; return; }
    const note = el('div', { class: 'nw-help', text: 'Saved as COS\'s setting for each system. Nothing in COS enforces it yet: it is the setting the walls and the proxy will read, so a limit set here is a record, not a brake.' });
    const head = el('div', { class: 'nw-crow nw-chead' }, [el('span', { text: 'System' }), el('span', { text: 'Network' }), el('span', { text: 'Limit (KB/s, empty = none)' })]);
    const rows = systems.map((n) => {
      const c = (cur.compartments && cur.compartments[n]) || {};
      const sel = el('select', { 'data-path': `compartments.${n}.network` }, ['on', 'off', 'throttled'].map(o => el('option', { value: o, text: o }))); sel.value = c.network || 'on';
      const num = el('input', { type: 'number', min: '1', 'data-path': `compartments.${n}.bytesPerSec`, value: c.bytesPerSec ? Math.round(c.bytesPerSec / 1024) : '' });
      sel.onchange = () => mark(`compartments.${n}.network`, sel.value);
      num.onchange = () => mark(`compartments.${n}.bytesPerSec`, num.value === '' ? null : Math.max(1, Math.round(Number(num.value))) * 1024);
      return el('div', { class: 'nw-crow' }, [el('span', { class: 'nw-cname', text: n }), sel, num]);
    });
    box.replaceChildren(note, head, ...rows);
  }
  const mark = (path, v) => { dirty[path] = v; $('nw-save').disabled = false; if (st) paintTunnel(); };

  // ── the Cloudflare tunnel: state, Start / Stop, the address, and the QR popup (MOD-NET-TUNNEL, MOD-NET-QR) ───────────────────────────────
  const TUN = '/api/cos/network/tunnel';
  const LABEL = { off: 'Off', starting: 'Starting…', up: 'Up', partial: 'Partly up', failed: 'Failed' };
  let T = null, st = null, tick = null, busy = false, actionMsg = ''; const seen = new Set();
  const mb = (n) => (n / 1048576).toFixed(1);
  function buildTunnel() {
    const body = $('nw-tunnel-body');
    T = { state: el('span', { class: 'nw-tstate', 'data-tunnel-state': '', text: 'Off' }), mode: el('div', { class: 'nw-tline' }), gate: el('div', { class: 'nw-tline', 'data-tunnel-gate': '' }), bin: el('div', { class: 'nw-tline' }),
      prog: el('progress', { max: '100', value: '0', hidden: 'hidden' }), msg: el('div', { class: 'nw-tmsg', role: 'status' }), list: el('div', { class: 'nw-tlist' }),
      start: el('button', { id: 'nw-tunnel-start', class: 'primary', type: 'button', text: 'Start tunnel', disabled: 'disabled' }), stop: el('button', { id: 'nw-tunnel-stop', type: 'button', text: 'Stop', disabled: 'disabled' }),
      inst: el('button', { id: 'nw-tunnel-install', type: 'button', text: 'Download cloudflared', hidden: 'hidden' }), qr: el('button', { type: 'button', 'data-qr': '', text: 'Show QR code', hidden: 'hidden' }), why: el('span', { class: 'nw-twhy' }) };
    T.start.onclick = tunnelStart; T.stop.onclick = () => tunnelAct('stop'); T.inst.onclick = tunnelInstall; T.qr.onclick = () => showQR();
    body.replaceChildren(el('div', { class: 'nw-thead' }, [el('span', { text: 'Status' }), T.state]), T.mode, T.gate, T.bin, T.prog,
      el('div', { class: 'nw-tbtns' }, [T.start, T.stop, T.inst, T.qr, T.why]), T.msg, T.list);
  }
  const post = async (path, b) => { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...b, by: 'person' }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  function paintTunnel() {
    if (!T) buildTunnel();
    const s = st, active = ['starting', 'up', 'partial'].includes(s.state), dirtyNow = Object.keys(dirty).length;
    T.state.textContent = LABEL[s.state] || s.state; T.state.className = 'nw-tstate ' + s.state;
    T.mode.textContent = s.provider !== 'cloudflare' ? `The tunnel provider is ${s.provider}. This starts cloudflared: choose cloudflare above, or start ${s.provider} from the anonymous service.`
      : s.mode === 'named' ? 'Named tunnel (a token is set): Cloudflare decides what it serves; the address is the hostname you set.' : `Quick tunnel (no token): a random *.trycloudflare.com address for each of ${s.systems.length ? s.systems.join(', ') : 'no systems yet'}. No account needed.`;
    T.gate.textContent = s.gate.ok ? 'Gate open: the outbound switches are on.' : s.gate.why;
    T.gate.className = 'nw-tline ' + (s.gate.ok ? 'ok' : 'closed');
    const i = s.install || {};
    T.bin.textContent = s.binary.found ? `cloudflared: ${s.binary.path}${s.binary.from ? ` (${s.binary.from})` : ''}` : `cloudflared was not found (looked in ${s.binary.searched.length} places).`;
    T.inst.hidden = !!s.binary.found && !i.running; T.inst.disabled = !s.gate.ok || !!i.running;
    T.inst.title = s.gate.ok ? 'Downloads from github.com/cloudflare/cloudflared, checks its SHA-256 against the one Cloudflare publishes, and runs it once.' : 'Opening the outbound switches comes first: this reaches github.com.';
    T.prog.hidden = !i.running; T.prog.value = i.pct || 0;
    T.msg.textContent = actionMsg || (i.running || i.phase === 'failed' ? i.message : '');
    const why = !s.gate.ok ? 'open the gate first' : s.provider !== 'cloudflare' ? 'choose cloudflare' : !s.binary.found ? 'download cloudflared first' : dirtyNow ? 'save your changes first' : active ? 'already running' : '';
    T.start.disabled = busy || !!why; T.stop.disabled = busy || !(s.tunnels || []).length || s.state === 'off'; T.why.textContent = T.start.disabled && why ? why : '';
    T.list.replaceChildren(...(s.tunnels || []).map(t => el('div', { class: 'nw-trow ' + t.state }, [
      el('span', { class: 'nw-tname', text: t.system || 'named tunnel' }), el('span', { class: 'nw-tst', text: t.state }),
      t.url ? el('a', { href: t.url, target: '_blank', rel: 'noopener noreferrer', text: t.url }) : el('span', { class: 'nw-terr', text: t.error || (t.state === 'starting' ? 'waiting for cloudflared to say its address…' : '') }),
      t.url && t.error ? el('span', { class: 'nw-terr', text: t.error }) : null, t.restarts ? el('span', { class: 'nw-tst', text: `restarted ${t.restarts}×` }) : null])));
    const urls = (s.tunnels || []).filter(t => t.url && t.state === 'up'); T.qr.hidden = !urls.length;
    // a new address pops its code up once; Escape closes it and it stays closed until the address changes (a restart gives a new one)
    const fresh = urls.filter(t => !seen.has(t.url)); if (fresh.length) showQR();
    if (!urls.length && $('nw-qr')) closeQR();
  }
  async function refreshTunnel() {
    clearTimeout(tick);
    try { const r = await fetch(TUN); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.error || `refused (${r.status})`); st = d; paintTunnel(); }
    catch (e) { if (!T) buildTunnel(); actionMsg = `COS's manager did not answer the tunnel route: ${e.message}`; T.msg.textContent = actionMsg; return; }
    if (actionMsg.startsWith("COS's manager did not answer")) actionMsg = '';
    tick = setTimeout(refreshTunnel, st.state === 'starting' || (st.install && st.install.running) ? 800 : 4000);
  }
  async function tunnelAct(action) {
    busy = true; T.start.disabled = T.stop.disabled = true; actionMsg = action === 'start' ? 'Starting cloudflared…' : 'Stopping…'; T.msg.textContent = actionMsg;
    try { const r = await post(TUN, { action }); if (r.status !== 200 || r.body.ok === false) actionMsg = r.body.error || `refused (${r.status})`; else { actionMsg = ''; st = r.body.status; if (action === 'stop') closeQR(); } }
    catch (e) { actionMsg = e.message; }
    busy = false; if (st) paintTunnel(); refreshTunnel();
  }
  function tunnelStart() {
    const named = st && st.mode === 'named';
    const what = named ? 'whatever your Cloudflare tunnel routes to this machine' : (st.systems || []).join(', ');
    if (!window.confirm(`This makes ${what} reachable from the internet by anyone who has the address.\n\nStart the tunnel?`)) return;
    tunnelAct('start');
  }
  async function tunnelInstall() {
    actionMsg = ''; const r = await post(TUN + '/install', {});
    if (r.status !== 202) { actionMsg = r.body.error || `refused (${r.status})`; if (st) paintTunnel(); return; }
    refreshTunnel();
  }

  // the popup: each address as its code, the link under it, for a phone to scan
  let opener = null;
  function closeQR() { const q = $('nw-qr'); if (!q) return; for (const t of ((st && st.tunnels) || [])) if (t.url) seen.add(t.url); q.remove(); document.removeEventListener('keydown', onKey, true); if (opener && opener.focus) { try { opener.focus(); } catch (_) {} } opener = null; }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeQR(); return; }
    if (e.key !== 'Tab') return; const f = [...$('nw-qr').querySelectorAll('button, a')]; if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function showQR() {
    const urls = ((st && st.tunnels) || []).filter(t => t.url && t.state === 'up'); if (!urls.length) return;
    if ($('nw-qr')) $('nw-qr').remove(); else opener = document.activeElement;
    const cards = urls.map((t) => {
      let code; try { code = window.COSQR.svg(t.url, { label: `QR code for ${t.url}` }); } catch (_) { code = null; }
      const holder = el('div', { class: 'nw-qr-code' }); if (code) holder.innerHTML = code;
      const copy = el('button', { type: 'button', class: 'nw-qr-copy', text: 'Copy link' });
      copy.onclick = async () => { try { await navigator.clipboard.writeText(t.url); copy.textContent = 'Copied'; } catch (_) { copy.textContent = 'Select the link and copy it'; } setTimeout(() => { copy.textContent = 'Copy link'; }, 1800); };
      return el('div', { class: 'nw-qr-card' }, [t.system ? el('div', { class: 'nw-qr-sys', text: t.system }) : null, code ? holder : el('div', { class: 'nw-terr', text: 'This address is too long to draw as a code; use the link.' }),
        el('a', { class: 'nw-qr-link', href: t.url, target: '_blank', rel: 'noopener noreferrer', text: t.url }), copy]);
    });
    const x = el('button', { type: 'button', class: 'nw-qr-x', 'aria-label': 'Close', text: '×' }); x.onclick = closeQR;
    const panel = el('div', { class: 'nw-qr-panel' }, [x, el('h2', { text: urls.length > 1 ? 'Scan to open' : 'Scan to open on your phone' }), el('div', { class: 'nw-qr-cards' }, cards),
      el('p', { class: 'nw-qr-warn', text: 'Anyone who has this link can reach the system behind it, until you press Stop.' })]);
    const o = el('div', { id: 'nw-qr', class: 'nw-qr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tunnel address' }, [panel]);
    o.addEventListener('mousedown', (e) => { if (e.target === o) closeQR(); });
    document.body.appendChild(o); document.addEventListener('keydown', onKey, true); x.focus();
    for (const t of urls) seen.add(t.url);
  }
  load(); window.NETWORK = { load };
})();
