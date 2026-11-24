'use strict';
/**
 * cos/manager/tunnel.js — COS's cloudflared tunnel: started from Network settings, its address read back for the QR popup
 * (cos/spec/network.spec MOD-NET-TUNNEL, 2026-11-03).
 *
 * James, 2026-11-03: "can you get cloudflared working in cos. the settings in the network settings. i want to have it connect to a
 * cloudflared url and popup on the screen with a qr code and the link under it" · "cos ui"
 *
 * What was wrong, read in the source: the anonymous service's tunnel engine tried the Cloudflare strategies only after "direct" and
 * "upnp"; with a token it ran `cloudflared tunnel run` and then waited for a *.trycloudflare.com address that a named tunnel never
 * prints, so it always timed out; it exposed its own proxy port, not the systems named in Network settings; and nothing carried the
 * address to the UI. This module is the act the settings were missing: Start in the Network page → this.
 *
 *   quick tunnel (no token): one `cloudflared tunnel --url http://127.0.0.1:<port>` per system in outbound.tunnel.systems, the port read
 *       from COS's own supervisor (never guessed); the *.trycloudflare.com address is read from cloudflared's output.
 *   named tunnel (a token): one `cloudflared tunnel run`, the token in the child's environment (never on its command line, where any
 *       process list would show it); Cloudflare decides what it serves, so the address is the hostname he set (outbound.tunnel.hostname).
 *
 * The gate is the settings' (NET-001): outbound.enabled and outbound.tunnel.enabled, else Start is refused, said. Only a person (or a
 * rule) starts or stops it (NET-003). A tunnel that dies is restarted (at most 10 an hour, backoff 1/3/8 s — remote-desktop.spec's own
 * numbers) and its new address is shown; after that it says it gave up. Addresses are never written to the ledger: whoever has the
 * link reaches the system, so the ledger says that a tunnel is up, not where.
 *
 *   createTunnel({ sup, settings, cfd, spawn, log, note, now, timers }) → { status(), start({by}), stop({by}), dispose(), installer }
 */
const cp = require('child_process');

// api.trycloudflare.com is Cloudflare's own endpoint, named in cloudflared's error when it cannot reach it ("Post https://api.trycloudflare.com/tunnel: no such host"): never a tunnel's address
const URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;
const NAMED_UP = /Registered tunnel connection/i;
const BACKOFF = [1000, 3000, 8000];
const POLICY = { startTimeoutMs: 30000, maxRestartsPerHour: 10 };

/** readUrl(buffer) → the first quick-tunnel address in cloudflared's output, or null. cloudflared prints it inside a box on stderr. */
const readUrl = (text) => { const m = URL_RE.exec(String(text || '')); return m ? m[0].toLowerCase() : null; };

function createTunnel({ sup = null, settings, cfd, spawn = cp.spawn, log = () => {}, note = () => {}, now = Date.now, policy = {} } = {}) {
  const P = { ...POLICY, ...policy };
  const entries = new Map();   // key → { key, system, origin, state, url, pid, error, since, restarts:[], proc, timer, wanted, tail }
  let installer = null;
  const setInstaller = (i) => { installer = i; };

  const publicView = (e) => ({ key: e.key, system: e.system, origin: e.origin, state: e.state, url: e.url, pid: e.pid || null, error: e.error || null, since: e.since, restarts: e.restarts.length });
  const kill = (e) => { if (e.timer) { clearTimeout(e.timer); e.timer = null; } if (e.proc) { const p = e.proc; e.proc = null; try { p.removeAllListeners('exit'); p.kill(); } catch (_) { /* already gone */ } } };

  function aggregate() {
    const es = [...entries.values()]; if (!es.length) return 'off';
    if (es.some(e => e.state === 'up') && es.every(e => e.state === 'up' || e.state === 'failed')) return es.every(e => e.state === 'up') ? 'up' : 'partial';
    if (es.some(e => e.state === 'starting' || e.state === 'restarting')) return 'starting';
    return es.every(e => e.state === 'failed') ? 'failed' : 'off';
  }

  function status() {
    const s = settings.load(); const t = s.outbound.tunnel;
    return {
      ok: true, state: aggregate(), gate: settings.gate('tunnel'), provider: t.provider, mode: t.token ? 'named' : 'quick', systems: t.systems,
      binary: cfd.find(), install: installer ? installer.status() : { running: false, phase: 'idle', pct: 0, message: '' },
      tunnels: [...entries.values()].map(publicView),
    };
  }

  function launch(e, argv, env, isNamed) {
    kill(e); e.state = e.restarts.length && e.wanted ? 'restarting' : 'starting'; e.url = null; e.error = null; e.tail = []; e.since = now();
    let buf = ''; let settled = false; const bin = e.bin;
    const [cmd, pre] = require('./cloudflared.js').runnable(bin);   // a script stand-in runs under Node (tests on Windows)
    const proc = spawn(cmd, [...pre, ...argv], { stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true });
    e.proc = proc; e.pid = proc.pid;
    const fail = (why) => { if (settled) return; settled = true; kill(e); e.state = 'failed'; e.error = why; log(`tunnel ${e.key}: ${why}`); };
    const up = (url) => { if (settled) return; settled = true; if (e.timer) { clearTimeout(e.timer); e.timer = null; } e.state = 'up'; e.url = url; e.error = url ? null : 'connected, but no hostname is set (Network settings → Tunnel hostname), so there is no address to show'; e.since = now(); note(`tunnel up for ${e.system || 'the named tunnel'}`); };
    const onData = (d) => {
      const text = d.toString(); buf = (buf + text).slice(-64 * 1024);
      for (const line of text.split(/\r?\n/)) { const l = line.trim(); if (l) { e.tail.push(l); if (e.tail.length > 12) e.tail.shift(); } }
      if (settled) return;
      if (isNamed) { if (NAMED_UP.test(buf)) up(e.hostname ? `https://${e.hostname}` : null); }
      else { const u = readUrl(buf); if (u) up(u); }
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    proc.on('error', (err) => fail(err.code === 'ENOENT' ? `cloudflared was not found at ${bin}` : `could not start cloudflared: ${err.message}`));
    e.timer = setTimeout(() => { e.timer = null; if (!settled) fail(`no address after ${P.startTimeoutMs / 1000}s. cloudflared said: ${e.tail.slice(-3).join(' | ') || 'nothing'}`); }, P.startTimeoutMs);
    if (e.timer.unref) e.timer.unref();
    proc.on('exit', (code, sig) => {
      if (e.proc !== proc) return; e.proc = null; e.pid = null;
      if (!e.wanted) { e.state = 'stopped'; return; }
      const wasUp = e.state === 'up'; const last = e.tail.slice(-2).join(' | ');
      if (!settled) { settled = true; if (e.timer) { clearTimeout(e.timer); e.timer = null; } e.state = 'failed'; e.error = `cloudflared exited (${code ?? sig}) before giving an address. It said: ${last || 'nothing'}`; log(`tunnel ${e.key}: ${e.error}`); return; }
      // it had been up (or was coming up) and died: restart, within the hour's allowance
      const cutoff = now() - 3600000; e.restarts = e.restarts.filter(t => t > cutoff);
      if (e.restarts.length >= P.maxRestartsPerHour) { e.state = 'failed'; e.error = `cloudflared stopped ${e.restarts.length} times in an hour; COS gave up. Last: ${last || 'nothing'}`; log(`tunnel ${e.key}: ${e.error}`); return; }
      const wait = BACKOFF[Math.min(e.restarts.length, BACKOFF.length - 1)]; e.restarts.push(now()); e.state = 'restarting'; e.url = null;
      log(`tunnel ${e.key}: cloudflared exited (${code ?? sig})${wasUp ? ' after being up' : ''}; restarting in ${wait / 1000}s`);
      e.timer = setTimeout(() => { e.timer = null; if (e.wanted) launch(e, argv, env, isNamed); }, wait); if (e.timer.unref) e.timer.unref();
    });
  }

  /** start({ by }) → { ok:true, status } | { ok:false, code, error, needs? } — says why it did not, never guesses. */
  function start({ by = null } = {}) {
    if (!by || !/^(person|rule:[\w.-]+|agent:[\w.-]+)$/.test(by)) return { ok: false, code: 400, error: 'say who acts: { "by": "person" | "rule:<id>" }' };
    if (/^agent:/.test(by)) return { ok: false, code: 403, error: 'opening a tunnel is a person\'s act; an agent proposes (NET-003)' };
    const g = settings.gate('tunnel'); if (!g.ok) return { ok: false, code: 409, error: g.why, needs: 'settings' };
    const s = settings.load(); const t = s.outbound.tunnel;
    if (t.provider !== 'cloudflare') return { ok: false, code: 400, error: `the tunnel provider is ${t.provider}; this starts cloudflared. Choose cloudflare, or start ${t.provider} from the anonymous service` };
    const bin = cfd.find(); if (!bin.found) return { ok: false, code: 409, error: `cloudflared was not found (looked in ${bin.searched.length} places). Download it with the button on this page.`, needs: 'cloudflared', searched: bin.searched };
    const named = !!t.token;
    if (named && !t.hostname) log('tunnel: a token is set but no hostname; the tunnel will connect and the page will say it has no address to show');
    for (const e of entries.values()) { e.wanted = false; kill(e); } entries.clear();
    const plan = [];
    if (named) plan.push({ key: 'named', system: null, hostname: t.hostname || '' });
    else {
      if (!t.systems.length) return { ok: false, code: 400, error: 'no systems are listed under "Systems through the tunnel"; name at least one' };
      const known = sup && typeof sup.list === 'function' ? sup.list() : [];
      for (const name of [...new Set(t.systems)]) { const v = known.find(x => x.name === name); plan.push({ key: name, system: name, v }); }
    }
    for (const p of plan) {
      const e = { key: p.key, system: p.system, origin: null, state: 'starting', url: null, pid: null, error: null, since: now(), restarts: [], proc: null, timer: null, wanted: true, tail: [], bin: bin.path, hostname: p.hostname };
      entries.set(e.key, e);
      if (named) { e.origin = 'whatever Cloudflare routes to this tunnel'; launch(e, ['tunnel', '--no-autoupdate', 'run'], { ...process.env, TUNNEL_TOKEN: t.token }, true); continue; }
      if (!p.v) { e.state = 'failed'; e.error = `"${p.system}" is not a system COS has declared`; continue; }
      if (!p.v.port) { e.state = 'failed'; e.error = `"${p.system}" has no health address, so COS does not know its port; give it one (config ${p.system} network.port=…)`; continue; }
      e.origin = `http://127.0.0.1:${p.v.port}`;
      const env = { ...process.env }; delete env.TUNNEL_TOKEN;
      launch(e, ['tunnel', '--no-autoupdate', '--url', e.origin], env, false);
    }
    note(`tunnel starting (${named ? 'named' : 'quick'}, ${plan.length} ${plan.length === 1 ? 'tunnel' : 'tunnels'}) by ${by}`);
    return { ok: true, status: status() };
  }

  function stop({ by = null } = {}) {
    if (!by || !/^(person|rule:[\w.-]+|agent:[\w.-]+)$/.test(by)) return { ok: false, code: 400, error: 'say who acts: { "by": "person" | "rule:<id>" }' };
    if (/^agent:/.test(by)) return { ok: false, code: 403, error: 'stopping a tunnel is a person\'s act; an agent proposes (NET-003)' };
    const n = entries.size; for (const e of entries.values()) { e.wanted = false; kill(e); e.state = 'stopped'; e.url = null; e.pid = null; }
    if (n) note(`tunnel stopped by ${by}`);
    return { ok: true, status: status() };
  }
  const dispose = () => { for (const e of entries.values()) { e.wanted = false; kill(e); } };

  return { status, start, stop, dispose, setInstaller, installer: () => installer, readUrl };
}

module.exports = { createTunnel, readUrl, URL_RE, POLICY, MODULE_ID: 'cos.manager.tunnel', VERSION: '1.0.0' };
