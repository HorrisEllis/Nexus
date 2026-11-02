/* cos/ui/network/page.js — the Network page (CA3, 0.60.367; cos/spec/network.spec MOD-NET-PAGE).
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
      ['outbound.tunnel.token', 'Tunnel token', 'secret', 'From your Cloudflare Tunnel or ngrok account. Never shown back.'],
      ['outbound.tunnel.systems', 'Systems through the tunnel', 'list', 'System names, comma separated (e.g. orchestrator, idearium).'],
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
    const v = get(cur, path), on = (x) => { dirty[path] = x; $('nw-save').disabled = !Object.keys(dirty).length; };
    if (kind === 'bool') { const i = el('input', { type: 'checkbox', 'data-path': path }); i.checked = !!v; i.onchange = () => on(i.checked); return i; }
    if (kind === 'fixed') { const i = el('input', { type: 'checkbox', disabled: 'disabled', 'data-path': path }); i.checked = !!v; return i; }
    if (kind === 'select') { const s = el('select', { 'data-path': path }, opts.map(o => el('option', { value: o, text: o }))); s.value = v; s.onchange = () => on(s.value); return s; }
    if (kind === 'number') { const i = el('input', { type: 'number', 'data-path': path, value: v }); i.onchange = () => on(Number(i.value)); return i; }
    if (kind === 'secret') { const i = el('input', { type: 'password', 'data-path': path, placeholder: v && v.set ? 'set — type to replace' : 'not set', autocomplete: 'off' }); i.onchange = () => on(i.value); return i; }
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
  }
  async function load() { try { const r = await fetch(API); const d = await r.json(); if (d.ok === false) throw new Error(d.error); draw(d); } catch (e) { say('bad', `COS's manager did not answer: ${e.message}`); } }
  $('nw-save').onclick = async () => {
    const opens = Object.entries(dirty).filter(([p, v]) => /enabled$/.test(p) && v === true).map(([p]) => p);
    if (opens.length && !window.confirm(`This opens: ${opens.join(', ')}.\n\nSave?`)) return;
    const patch = {}; for (const [p, v] of Object.entries(dirty)) { const ks = p.split('.'); let x = patch; ks.slice(0, -1).forEach(k => { x = x[k] = x[k] || {}; }); x[ks[ks.length - 1]] = v; }
    try { const r = await fetch(API, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch, by: 'person' }) }); const d = await r.json();
      if (!r.ok || d.ok === false) return say('bad', d.error || `refused (${r.status})`);
      draw(d); say('ok', `Saved: ${d.changed.map(c => c.path).join(', ')}`); } catch (e) { say('bad', e.message); }
  };
  load(); window.NETWORK = { load };
})();
