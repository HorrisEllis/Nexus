'use strict';
/**
 * cos/manager/network-settings.js — COS's network settings, and the gate in front of every engine that reaches outside (CA3, 0.60.367).
 * Spec: cos/spec/network.spec MOD-NET-SETTINGS · Map: docs/2026-11-02-cos-the-application-phasemap.spec CA3_network_settings, CA_D2.
 *
 * James, 2026-11-02: "both but extensive settings for all of this." · "Gate behind settings to open. Make a full detailed settings for network."
 *
 * Everything off by default (NET-001). A token is never read back (NET-002): view() shows { set: true|false }. Only a person or a rule
 * changes it; an agent is refused (NET-003). SSH keys-only and TLS-required-inbound are fixed (§4.3). Stored in COS's own data.
 *
 *   load() · view() · patch(patch, { by }) → { ok, settings } | { ok:false, code, error } · gate(engine) → { ok, why }
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  outbound: { enabled: false,
    tunnel: { enabled: false, provider: 'cloudflare', token: '', systems: ['orchestrator'] },
    rendezvous: { enabled: false, url: '', deviceName: '', allowedDevices: [] } },
  inbound: { enabled: false,
    mapping: { enabled: false, protocols: ['upnp', 'pcp', 'natpmp'], ports: [], leaseSeconds: 3600 },
    ddns: { enabled: false, provider: 'duckdns', domain: '', token: '', intervalSeconds: 300 },
    ssh: { enabled: false, port: 22, keysOnly: true, allowedKeys: [] } },
  tls: { requiredInbound: true, certPath: '', keyPath: '' },
  compartments: {},
});
const SECRETS = ['outbound.tunnel.token', 'inbound.ddns.token'];
const FIXED = { 'inbound.ssh.keysOnly': true, 'tls.requiredInbound': true };
// which switches open which engine (the anonymous service's names); both the master and its own must be on
const REACH = Object.freeze({ tunnel: ['outbound.enabled', 'outbound.tunnel.enabled'], relay: ['outbound.enabled', 'outbound.rendezvous.enabled'],
  upnp: ['inbound.enabled', 'inbound.mapping.enabled'], ddns: ['inbound.enabled', 'inbound.ddns.enabled'], ssh: ['inbound.enabled', 'inbound.ssh.enabled'] });

const clone = (o) => JSON.parse(JSON.stringify(o));
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const set = (o, p, v) => { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = x[k] = x[k] && typeof x[k] === 'object' ? x[k] : {}; x[ks[ks.length - 1]] = v; };
const file = () => path.join(process.env.COS_MANAGER_DATA || path.join(__dirname, '..', 'data', 'manager'), 'network.json');
const SYS = /^[a-z][a-z0-9-]{0,40}$/;

// every leaf path and its rule: what a patch may set
const RULES = {
  'outbound.enabled': 'bool', 'outbound.tunnel.enabled': 'bool', 'outbound.tunnel.provider': ['cloudflare', 'ngrok'], 'outbound.tunnel.token': 'secret', 'outbound.tunnel.systems': 'systems',
  'outbound.rendezvous.enabled': 'bool', 'outbound.rendezvous.url': 'url', 'outbound.rendezvous.deviceName': 'name', 'outbound.rendezvous.allowedDevices': 'names',
  'inbound.enabled': 'bool', 'inbound.mapping.enabled': 'bool', 'inbound.mapping.protocols': 'protocols', 'inbound.mapping.ports': 'ports', 'inbound.mapping.leaseSeconds': [60, 86400],
  'inbound.ddns.enabled': 'bool', 'inbound.ddns.provider': ['duckdns', 'cloudflare'], 'inbound.ddns.domain': 'domain', 'inbound.ddns.token': 'secret', 'inbound.ddns.intervalSeconds': [60, 86400],
  'inbound.ssh.enabled': 'bool', 'inbound.ssh.port': [1, 65535], 'inbound.ssh.keysOnly': 'fixed', 'inbound.ssh.allowedKeys': 'keys',
  'tls.requiredInbound': 'fixed', 'tls.certPath': 'path', 'tls.keyPath': 'path',
};
function check(p, v) {
  const r = RULES[p];
  if (p.startsWith('compartments.')) {
    const [, sys, k] = p.split('.'); if (!SYS.test(sys || '')) return `compartments: "${sys}" is not a system name`;
    if (k === 'network') return ['on', 'off', 'throttled'].includes(v) ? null : 'network is on, off or throttled';
    if (k === 'bytesPerSec') return v === null || (Number.isInteger(v) && v >= 1024 && v <= 1e10) ? null : 'bytesPerSec is null or 1024–10000000000';
    return `compartments.<system> has network and bytesPerSec, not ${k}`;
  }
  if (!r) return `no setting "${p}"`;
  if (r === 'fixed') return v === FIXED[p] ? null : `${p} is fixed at ${FIXED[p]} (§4.3)`;
  if (r === 'bool') return typeof v === 'boolean' ? null : 'true or false';
  if (Array.isArray(r) && typeof r[0] === 'string') return r.includes(v) ? null : `one of ${r.join(', ')}`;
  if (Array.isArray(r)) return Number.isInteger(v) && v >= r[0] && v <= r[1] ? null : `a whole number ${r[0]}–${r[1]}`;
  if (r === 'secret') return typeof v === 'string' && v.length <= 4096 ? null : 'a token (text)';
  if (r === 'url') return v === '' || /^(https|wss):\/\/[^\s]{3,500}$/.test(v) ? null : 'an https:// or wss:// address, or empty';
  if (r === 'name') return v === '' || /^[\w .-]{1,64}$/.test(v) ? null : 'letters, digits, space, . _ -';
  if (r === 'domain') return v === '' || /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(v) ? null : 'a domain name, e.g. mynexus.duckdns.org';
  if (r === 'path') return typeof v === 'string' && v.length <= 1024 ? null : 'a file path';
  if (r === 'systems') return Array.isArray(v) && v.every(x => SYS.test(x)) ? null : 'a list of system names';
  if (r === 'names') return Array.isArray(v) && v.every(x => /^[\w .-]{1,64}$/.test(x)) ? null : 'a list of device names';
  if (r === 'protocols') return Array.isArray(v) && v.length && v.every(x => ['upnp', 'pcp', 'natpmp'].includes(x)) ? null : 'some of upnp, pcp, natpmp';
  if (r === 'keys') return Array.isArray(v) && v.every(x => /^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp\d+) [A-Za-z0-9+/=]{40,}( .{0,100})?$/.test(x)) ? null : 'public keys (ssh-ed25519 …, ssh-rsa …)';
  if (r === 'ports') return Array.isArray(v) && v.every(x => x && Number.isInteger(x.external) && x.external > 0 && x.external < 65536 && Number.isInteger(x.internal) && x.internal > 0 && x.internal < 65536 && SYS.test(x.system || '')) ? null : 'a list of { external, internal, system }';
  return 'not settable';
}
const leaves = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => {
  const p = pre ? `${pre}.${k}` : k;
  return v && typeof v === 'object' && !Array.isArray(v) && !(RULES[p]) && !/^compartments\.[^.]+\.[^.]+$/.test(p) ? leaves(v, p) : [[p, v]];
});

function load() {
  const base = clone(DEFAULTS);
  let saved = {}; try { saved = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (_) { return base; }
  for (const [p, v] of leaves(saved)) if (!check(p, v)) set(base, p, v);   // a value that no longer validates falls back to its default
  return base;
}
function view() {
  const s = load();
  for (const p of SECRETS) set(s, p, { set: !!get(s, p) });
  return s;
}
function gate(engine) {
  const need = REACH[engine]; if (!need) return { ok: true, why: `${engine} does not reach outside` };
  let s; try { s = load(); } catch (e) { return { ok: false, why: `the network settings could not be read: ${e.message}` }; }
  const off = need.filter(p => get(s, p) !== true);
  return off.length ? { ok: false, why: `closed: switch on ${off.join(' and ')} in Network settings` } : { ok: true, why: 'opened in Network settings' };
}
function patch(p, { by = null } = {}) {
  if (!by || !/^(person|rule:[\w.-]+|agent:[\w.-]+)$/.test(by)) return { ok: false, code: 400, error: 'say who acts: { "by": "person" | "rule:<id>" }' };
  if (/^agent:/.test(by)) return { ok: false, code: 403, error: 'opening the network is a person\'s act; an agent proposes (NET-003)' };
  const ls = leaves(p || {}); if (!ls.length) return { ok: false, code: 400, error: 'nothing to change' };
  const bad = ls.map(([k, v]) => [k, check(k, v)]).filter(([, e]) => e);
  if (bad.length) return { ok: false, code: 400, error: bad.map(([k, e]) => `${k}: ${e}`).join('; ') };
  const s = load(); for (const [k, v] of ls) set(s, k, v);
  fs.mkdirSync(path.dirname(file()), { recursive: true }); const tmp = `${file()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file());
  const changed = ls.map(([k, v]) => ({ path: k, value: SECRETS.includes(k) ? (v ? '(set)' : '(cleared)') : v }));
  try { require('../../lib/versionium-record.js').record({ kind: 'cos.network', message: `COS network settings: ${changed.map(c => c.path).join(', ')} (by ${by})`, change: { changed }, causedBy: 'cos.network', by }).catch(() => {}); } catch (_) {}
  return { ok: true, settings: view(), changed };
}

module.exports = { load, view, patch, gate, DEFAULTS, REACH, RULES, MODULE_ID: 'cos.manager.network-settings', VERSION: '1.0.0' };
