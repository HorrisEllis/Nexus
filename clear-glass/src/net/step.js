'use strict';
/**
 * src/net/step.js — Snowflake as a step in macros and workflows (SN1, 0.60.281)
 *
 * James, 2026-10-29: "also snowflake plugin support to macros and automation."
 *
 * netStep(deps, { do, site, via, timeoutMs }) — the one place a macro step or a workflow's "Network (Snowflake)" action changes the network:
 *   route    this site (or `site`) always goes through `via` (default transport, i.e. Snowflake) — a rule in core's table (src/net/service.js)
 *   unroute  the rule this step made for that site is removed (a rule someone else made is left, and said)
 *   start    the transport is started (its bridge set up first), not waited for
 *   stop     the transport is stopped
 *   wait     waits until the transport is ready (starts it when it is off), up to timeoutMs (default 90 s)
 *   check    asks check.torproject.org through the transport whether this is Tor
 *   status   what the transport and the table are now
 * James, 2026-10-29, after 0.60.281 refused when the plugin was off: "can 't you have it turn on the snowflake?" So a step turns on what it
 * needs, and says so: the Snowflake plugin when it is off (turnOnPlugin; turnOn: false refuses instead), and the transport when a site is
 * routed (a site routed through a transport that is off is blocked, never sent direct; start: false leaves it off). Nothing here decides a
 * route on its own; the rules and the transport are core's.
 *
 * deps: { service, host, ensureBridge(), fetchVia(url, port), pluginOn(), turnOnPlugin(), urlOf(), sleep(ms) }
 */

const DOS = ['route', 'unroute', 'start', 'stop', 'wait', 'check', 'status'];
const ruleId = (origin) => `macro.${origin}`.replace(/[^\w.-]/g, '-').slice(0, 60);

function originOf(site) {
  const s = String(site || '').trim();
  if (!s) return null;
  try { return new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`).host.toLowerCase() || null; } catch (_) { return null; }
}

async function netStep(deps = {}, { do: what = 'status', site = null, via = 'transport', timeoutMs = 90000, turnOn = true, start: startOnRoute = true } = {}) {
  const { service, host, ensureBridge, fetchVia, pluginOn = () => true, turnOnPlugin = null, urlOf = () => null, sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = deps;
  if (!DOS.includes(what)) throw new Error(`net: do is one of ${DOS.join(', ')} (got "${what}")`);
  let pluginTurnedOn = false;
  if (!pluginOn()) {
    if (!turnOn || typeof turnOnPlugin !== 'function') throw new Error('net: the Snowflake plugin is off — turn it on in the 🧩 panel to use Snowflake in macros and workflows');
    const t = await turnOnPlugin();
    if (!t || t.ok === false || !pluginOn()) throw new Error(`net: the Snowflake plugin is off and could not be turned on${t && t.error ? ` (${t.error})` : ''}`);
    pluginTurnedOn = true;
  }
  const said = (r) => (pluginTurnedOn ? { ...r, pluginTurnedOn: true } : r);
  if (!service) throw new Error('net: the network service is not wired into this Clear Glass');
  const state = () => (host ? host.status() : { state: 'stopped' });
  const start = async () => {
    if (['ready', 'starting', 'bootstrapping'].includes(state().state)) return false;
    if (ensureBridge) { const eb = await ensureBridge(); if (eb && eb.ok === false) throw new Error(`net: no Snowflake bridge (${eb.error}). Set it up under Settings → Network.`); }
    const r = await host.start(); if (r && r.ok === false) throw new Error(`net: the transport cannot start: ${r.error}. Set it up under Settings → Network.`);
    return true;
  };

  if (what === 'route' || what === 'unroute') {
    const target = site || urlOf();
    const origin = originOf(target);
    if (!origin) throw new Error(`net: ${what} needs a site (none given, and the tab's page has no web address${target ? `: "${target}"` : ''})`);
    const id = ruleId(origin);
    if (what === 'route') {
      const held = (service.policy().rules || []).find(r => r.match && r.match.origin === origin && !r.match.urlPattern && !r.match.provider && !r.match.caller);
      // a site through a transport that is off is blocked (fail closed): start it, unless the step says start: false
      const startedTransport = via === 'transport' && startOnRoute && host ? await start() : false;
      if (held) return said({ do: what, origin, via: held.via, rule: held.id, changed: false, startedTransport, transport: state().state, why: held.via === via ? 'already routed this way' : `already routed ${held.via} by rule "${held.id}"; left as it is` });
      const r = service.addRoute({ id, via, match: { origin }, note: 'macro step (SN1)' });
      if (!r.ok) throw new Error(`net: ${r.error}`);
      return said({ do: what, origin, via, rule: id, changed: true, startedTransport, transport: state().state });
    }
    const mine = (service.policy().rules || []).find(r => r.id === id);
    if (!mine) {
      const other = (service.policy().rules || []).find(r => r.match && r.match.origin === origin);
      return said({ do: what, origin, changed: false, why: other ? `routed by rule "${other.id}", which a step did not make; left as it is` : 'not routed by a step' });
    }
    const r = service.removeRoute(id);
    if (!r.ok) throw new Error(`net: ${r.error}`);
    return said({ do: what, origin, rule: id, changed: true });
  }
  if (!host) throw new Error('net: the transport is not available in this Clear Glass');
  if (what === 'status') { const s = service.status(); return said({ do: what, transport: s.transport, default: s.default, rules: s.rules, lastCheck: s.lastCheck }); }
  if (what === 'stop') { const r = await host.stop({}); if (r && r.ok === false) throw new Error(`net: ${r.error}`); return said({ do: what, transport: state().state }); }
  if (what === 'start') { await start(); return said({ do: what, transport: state().state }); }
  if (what === 'wait' || what === 'check') {
    await start();
    const t0 = Date.now();
    while (state().state !== 'ready') {
      if (['failed', 'stopped'].includes(state().state)) throw new Error(`net: the transport did not come up (${state().error || state().state})`);
      if (Date.now() - t0 > timeoutMs) throw new Error(`net: the transport is still ${state().state} after ${Math.round(timeoutMs / 1000)} s`);
      await sleep(400);
    }
    if (what === 'wait') return said({ do: what, transport: 'ready', waitedMs: Date.now() - t0 });
    const c = await service.checkCircuit({ fetchVia });
    if (!c.ok) throw new Error(`net: the circuit check failed: ${c.error}`);
    if (c.isTor !== true) throw new Error(`net: check.torproject.org says this is not Tor (ip ${c.ip || '?'})`);
    return said({ do: what, isTor: true, ip: c.ip });
  }
}

module.exports = { netStep, originOf, ruleId, DOS };
