'use strict';
/**
 * cos/manager/system-config.js — every system's configuration in COS, by layer, applied by its supervisor (SC2, 0.60.379).
 * Spec: cos/spec/cos-manager.spec MOD-MG-SYSTEM-CONFIG · Map: docs/2026-11-02-cos-console-phasemap.spec SC2, SC_D1–SC_D3.
 *
 * James, 2026-11-02: "Need configuration for each system. Hooks into the config for each miniworld, set ram, cpu and network limits. Percent or
 * gbs. Ports and network settings. All the settings like idearium has for the repos. All relevant configuration settings"
 *
 * Layers (SC_D2): the system's declaration (its compartment.json / <name>.cos) → his overrides in COS's own store (systems.json beside the
 * ledger; COS never writes into a system's folder to configure it). Every reading says, per setting: its value, where it came from (declared,
 * his, default), when it applies (now, next start) and how (enforced, watched, not enforced — with why). Nothing is shown as applied that the
 * OS does not do (SC_D1, §1.2): memory and priority go through resources.js's caps (CP6a, read back); a CPU limit is watched over the usage
 * samples; a bandwidth limit and outbound rule are recorded and NOT enforced (Node cannot cap a process's network; that needs job objects or a
 * firewall rule, CE5).
 *
 *   createSystemConfig(sup, { resources, file, totalMB, cores, readFile, notify }) →
 *     { get(name), set(name, patch, { by }), clear(name, keys, { by }), adjust(decl), watchCpu(), FIELDS, parse }
 *   parse.size('25%'|'2GB'|'1536MB'|'1536', totalMB) → MB · parse.cpu('50%'|'2 cores', cores) → % of host · parse.bandwidth('100Mbps'|'10MB/s'|'20%') → { mbps } | { pct }
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const err = (msg, code = 400) => Object.assign(new Error(msg), { code });

// ── units (SC_D1: "Percent or gbs") ──────────────────────────────────────────────────────────────────────────────────────────────
function size(v, totalMB = Math.round(os.totalmem() / 1048576)) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(%|gb|g|gib|mb|m|mib)?\s*$/i.exec(String(v));
  if (!m) throw err(`a size is a percent of the host's memory or an amount: "25%", "2GB", "1536MB" — not "${v}"`);
  const n = Number(m[1]), u = (m[2] || 'mb').toLowerCase();
  const mb = u === '%' ? (n > 100 ? NaN : totalMB * n / 100) : /^g/.test(u) ? n * 1024 : n;
  if (!Number.isFinite(mb) || mb < 64) throw err(`"${v}" is ${Number.isFinite(mb) ? Math.round(mb) + ' MB' : 'more than the host'}: at least 64 MB`);
  return Math.round(mb);
}
function cpu(v, cores = os.cpus().length || 1) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(%|cores?|cpus?)?\s*$/i.exec(String(v));
  if (!m) throw err(`a CPU limit is a percent of the host or a number of cores: "50%", "2 cores" — not "${v}"`);
  const n = Number(m[1]), pct = !m[2] || m[2] === '%' ? n : n / cores * 100;
  if (!(pct > 0 && pct <= 100)) throw err(`"${v}" is ${Math.round(pct)}% of this host's ${cores} cores: between 1% and 100%`);
  return Math.round(pct * 10) / 10;
}
function bandwidth(v) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(%|gbps|mbps|kbps|gb\/s|mb\/s|kb\/s)\s*$/i.exec(String(v));
  if (!m) throw err(`a network limit is a rate or a percent of the link: "100Mbps", "10MB/s", "20%" — not "${v}"`);
  const n = Number(m[1]), u = m[2].toLowerCase();
  if (u === '%') { if (!(n > 0 && n <= 100)) throw err(`"${v}": a percent is 1–100`); return { pct: n }; }
  const mbps = { gbps: n * 1000, mbps: n, kbps: n / 1000, 'gb/s': n * 8000, 'mb/s': n * 8, 'kb/s': n * 8 / 1000 }[u];
  if (!(mbps > 0)) throw err(`"${v}" is no rate`);
  return { mbps: Math.round(mbps * 1000) / 1000 };
}
const parse = { size, cpu, bandwidth };

// ── the fields: group, how a value is read, and how it applies ─────────────────────────────────────────────────────────────────────
const oneOf = (list) => (v) => { if (!list.includes(v)) throw err(`one of ${list.join(', ')} — not "${v}"`); return v; };
const bool = (v) => { if (v === true || v === 'true' || v === 'on' || v === 'yes') return true; if (v === false || v === 'false' || v === 'off' || v === 'no') return false; throw err(`true or false — not "${v}"`); };
const int = (lo, hi) => (v) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw err(`a whole number ${lo}–${hi} — not "${v}"`); return n; };
const text = (max) => (v) => String(v).slice(0, max);
const PRIORITIES = ['low', 'below-normal', 'normal', 'above-normal', 'high'];

const FIELDS = {
  'general.label':      { group: 'general', label: 'Name shown', read: text(60), how: { state: 'enforced', when: 'now', why: 'COS\'s own screens' } },
  'general.notes':      { group: 'general', label: 'Notes', read: text(2000), how: { state: 'enforced', when: 'now', why: 'kept with the system in COS' } },
  'memory.heap':        { group: 'resources', label: 'Memory: heap', unit: 'size', read: (v, c) => size(v, c.totalMB), caps: 'heapMB', how: { when: 'next start', why: 'V8\'s --max-old-space-size on its command line (Node systems)' } },
  'memory.limit':       { group: 'resources', label: 'Memory: limit', unit: 'size', nullable: true, read: (v, c) => size(v, c.totalMB), caps: 'rssLimitMB', how: { state: 'watched', when: 'now', why: 'COS reads its resident memory each sample; over it, memory.onOver' } },
  'memory.onOver':      { group: 'resources', label: 'Over the memory limit', read: oneOf(['warn', 'restart']), caps: 'onOver', how: { state: 'enforced', when: 'now', why: 'warn says so; restart restarts it by rule (RAID approves)' } },
  'cpu.priority':       { group: 'resources', label: 'CPU: priority', read: oneOf(PRIORITIES), caps: 'priority', how: { when: 'now', why: 'the OS process priority, set and read back' } },
  'cpu.limit':          { group: 'resources', label: 'CPU: limit', unit: 'cpu', nullable: true, read: (v, c) => cpu(v, c.cores), how: { state: 'watched', when: 'now', why: 'COS reads its CPU each sample; over it, cpu.onOver. The OS has no CPU-share cap without a job object (Windows) or cgroups' } },
  'cpu.onOver':         { group: 'resources', label: 'Over the CPU limit', read: oneOf(['warn', 'restart']), how: { state: 'enforced', when: 'now', why: 'warn says so; restart restarts it by rule' } },
  'network.port':       { group: 'network', label: 'Port', read: int(1, 65535), how: { when: 'next start', why: 'through the env var the system reads its port from; its health URL follows' } },
  'network.portEnv':    { group: 'network', label: 'Port env var', read: (v) => { if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(String(v))) throw err(`an env var name, upper case: "LOOM_PORT" — not "${v}"`); return String(v); }, how: { state: 'enforced', when: 'next start', why: 'the name COS sets the port in' } },
  'network.bind':       { group: 'network', label: 'Listen on', read: oneOf(['127.0.0.1', '0.0.0.0', '::1', '::']), how: { state: 'unknown', when: 'next start', why: 'passed as HOST and COS_BIND; applied only if the system reads one of them (not checked)' } },
  'network.limit':      { group: 'network', label: 'Bandwidth limit', unit: 'bandwidth', nullable: true, read: (v) => bandwidth(v), how: { state: 'not-enforced', when: 'never yet', why: 'Node cannot cap a process\'s network; needs the Windows service\'s job objects or a firewall rule (CE5). Recorded only' } },
  'network.outbound':   { group: 'network', label: 'Outbound', read: oneOf(['allow', 'deny']), how: { state: 'not-enforced', when: 'never yet', why: 'needs a firewall rule per program (CE5). Recorded only' } },
  'start.autostart':    { group: 'start', label: 'Start at boot', read: bool, how: { state: 'enforced', when: 'next boot', why: 'COS\'s boot skips it when off, said' } },
  'start.onDemand':     { group: 'start', label: 'Start on demand, stop when idle', read: bool, how: { state: 'enforced', when: 'next boot', why: 'started when touched; stopped after the policy\'s idle time' } },
  'start.phase':        { group: 'start', label: 'Boot phase', read: int(0, 9), how: { state: 'enforced', when: 'next boot', why: 'phases boot in order, each waiting for its systems\' health' } },
  'start.restart':      { group: 'start', label: 'On a crash', read: oneOf(['crash', 'never']), how: { state: 'enforced', when: 'now', why: 'crash: restarted after a backoff (circuit after 6 in 5 min); never: left down, said' } },
  'wall.mode':          { group: 'wall', label: 'Wall', read: oneOf(['audit', 'enforce']), how: { state: 'enforced', when: 'next start', why: 'audit says what the wall would refuse; enforce refuses it (cos/compartment/boundary.js)' } },
};
const GROUPS = { general: 'General', resources: 'Resources', network: 'Network', start: 'Start', environment: 'Environment', wall: 'Wall' };

function createSystemConfig(sup, { resources = null, file = null, totalMB = Math.round(os.totalmem() / 1048576), cores = os.cpus().length || 1,
  readFile = (f) => fs.readFileSync(f, 'utf8'), notify = null } = {}) {
  const FILE = file || path.join(path.dirname(sup.ledgerFile), 'systems.json');
  let his = {}; try { his = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) {}
  const ctx = { totalMB, cores };
  const declOf = (name) => { const d = sup.declarations().find(x => x.name === name); if (!d) throw err(`no system "${name}" is declared`, 404); return d; };
  const portOf = (d) => { try { return Number(new URL(d.healthUrl).port) || null; } catch (_) { return null; } };

  // SC_D3 — the env var a system reads its port from: declared (portEnv), else discovered in its config.js (by name), else unknown
  function portEnvOf(d) {
    if (d.portEnv) return { name: d.portEnv, from: 'declared' };
    const dir = path.join(sup.root || process.cwd(), String(d.system || d.name));
    for (const f of ['config.js', 'server.js']) {
      let src = ''; try { src = readFile(path.join(dir, f)); } catch (_) { continue; }
      const hits = [...src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*PORT)\b/g)].map(m => m[1]);
      if (hits.length) return { name: hits[0], from: `discovered in ${String(d.system || d.name)}/${f}`, others: [...new Set(hits.slice(1))] };
    }
    return { name: null, from: 'unknown' };
  }

  function declaredValue(d, key) {
    switch (key) {
      case 'general.label': return d.label || null;
      case 'memory.heap': return d.maxOldSpaceMB || (d.resources && d.resources.heapMB) || null;
      case 'memory.limit': return d.resources && d.resources.rssLimitMB != null ? d.resources.rssLimitMB : undefined;
      case 'memory.onOver': return d.resources && d.resources.onOver;
      case 'cpu.priority': return d.resources && d.resources.priority;
      case 'network.port': return portOf(d);
      case 'network.portEnv': return d.portEnv || undefined;
      case 'start.autostart': return true;
      case 'start.onDemand': return !!d.onDemand;
      case 'start.phase': return d.phase ?? null;
      case 'start.restart': return 'crash';
      case 'wall.mode': return d.boundary ? (d.boundary.mode || 'enforce') : undefined;
      default: return undefined;
    }
  }

  function get(name) {
    const d = declOf(name), mine = his[name] || {}, caps = resources ? resources.caps(name) : null, v = sup.get(name), pe = portEnvOf(d);
    const settings = {};
    for (const [key, f] of Object.entries(FIELDS)) {
      const dv = declaredValue(d, key), has = Object.prototype.hasOwnProperty.call(mine, key);
      let value = has ? mine[key] : dv, from = has ? 'his' : dv !== undefined && dv !== null ? 'declared' : 'default';
      if (f.caps && caps && !has) { value = caps[f.caps]; from = caps.layers[f.caps]; }
      const how = { ...f.how };
      if (f.caps && caps) { const a = caps.applied[{ heapMB: 'heap', rssLimitMB: 'rss', priority: 'priority' }[f.caps]]; if (a) Object.assign(how, { state: a.state, why: a.why || how.why, ...(a.readBack != null ? { readBack: a.readBack } : {}) }); }
      if (key === 'network.port') { if (!pe.name) Object.assign(how, { state: 'not-applied', why: `no env var found for its port (no portEnv declared; none in its config.js): set Port env var first` }); else Object.assign(how, { state: v.pid && has && portOf(sup.effective ? sup.effective(name) : d) !== v.port ? 'pending' : 'enforced', env: pe.name, envFrom: pe.from, why: `${pe.name} (${pe.from}); systems that hard-code its old port are not changed` }); }
      if (key === 'network.portEnv' && !has && pe.name) { value = pe.name; from = pe.from.startsWith('discovered') ? 'discovered' : from; }
      settings[key] = { group: f.group, label: f.label, value: value === undefined ? null : value, from, ...(f.unit ? { unit: f.unit } : {}), how };
    }
    const env = {}; for (const [k, val] of Object.entries(d.env || {})) env[k] = { value: val, from: 'declared' };
    for (const [k, val] of Object.entries(mine)) if (k.startsWith('env.')) env[k.slice(4)] = val === null ? { value: null, from: 'his', removed: true } : { value: val, from: 'his' };
    return { ok: true, name, groups: GROUPS, settings, env, host: { totalMB, cores }, running: { pid: v.pid, state: v.state, port: v.port }, file: FILE };
  }

  function save() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); const tmp = `${FILE}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(his, null, 2)); fs.renameSync(tmp, FILE); }

  function set(name, patch, { by } = {}) {
    if (!by) throw err('say who acts: { "by": "person" | "rule:<id>" }');
    if (/^agent:/.test(String(by))) throw err('an agent proposes; a system\'s configuration is set by a person or a rule', 403);
    declOf(name);
    const ok = {}, capsPatch = {};
    for (const [key, raw] of Object.entries(patch || {})) {
      if (key.startsWith('env.')) {
        const k = key.slice(4); if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) throw err(`"${k}" is no env var name`);
        if (/^(COS_BOUNDARY|NODE_OPTIONS)$/.test(k)) throw err(`${k} is COS's own (the wall); not settable`);
        ok[key] = raw === null ? null : String(raw).slice(0, 4000); continue;
      }
      const f = FIELDS[key]; if (!f) throw err(`no setting "${key}": ${Object.keys(FIELDS).join(', ')}, env.<NAME>`);
      const val = raw === null || raw === 'none' ? (f.nullable ? null : undefined) : f.read(raw, ctx);
      if (val === undefined) throw err(`${key} cannot be none; clear it to return to the declared value`);
      ok[key] = val; if (f.caps) capsPatch[f.caps] = val;
    }
    if (!Object.keys(ok).length) throw err('nothing to set');
    const before = get(name).settings;
    if (!sup.note('config', Object.entries(ok).map(([k, v]) => `${k} ${before[k] ? JSON.stringify(before[k].value) : '—'} → ${JSON.stringify(v)}`).join(', '), { by, system: name })) throw new Error('the ledger cannot be written: nothing changed');
    if (resources && Object.keys(capsPatch).length) resources.setCaps(name, capsPatch, { by });   // memory and priority: CP6a's caps, read back
    his[name] = { ...(his[name] || {}), ...ok }; save();
    try { require('../../lib/versionium-record.js').record({ kind: 'cos.config', system: name, by, message: `COS: ${name}'s configuration — ${Object.keys(ok).join(', ')}`, change: { before: Object.fromEntries(Object.keys(ok).map(k => [k, before[k] ? before[k].value : null])), after: ok } }).catch(() => {}); } catch (_) {}
    return get(name);
  }

  function clear(name, keys, { by } = {}) {
    if (!by) throw err('say who acts: { "by": "person" }');
    declOf(name); const mine = his[name] || {}, gone = [], capsNull = {};
    for (const k of keys || []) if (k in mine) { gone.push(k); delete mine[k]; const f = FIELDS[k]; if (f && f.caps) capsNull[f.caps] = null; }
    if (!gone.length) return get(name);
    sup.note('config', `cleared ${gone.join(', ')}: the declared value again`, { by, system: name });
    if (resources && Object.keys(capsNull).length) { try { resources.setCaps(name, capsNull, { by }); } catch (_) { /* heapMB/priority null: resources drops his layer */ } }
    his[name] = mine; save(); return get(name);
  }

  // the supervisor's hook: the declaration as it runs, his configuration over it (SC2). Pure over his store; never throws on a bad value.
  function adjust(d) {
    const mine = his[d.name]; if (!mine) return d;
    const out = { ...d, env: { ...(d.env || {}) } };
    for (const [k, v] of Object.entries(mine)) if (k.startsWith('env.')) { if (v === null) delete out.env[k.slice(4)]; else out.env[k.slice(4)] = v; }
    if (mine['network.port']) {
      const env = mine['network.portEnv'] || portEnvOf(d).name;
      if (env) { out.env[env] = String(mine['network.port']); if (d.healthUrl) { try { const u = new URL(d.healthUrl); u.port = String(mine['network.port']); out.healthUrl = u.toString().replace(/\/$/, d.healthUrl.endsWith('/') ? '/' : ''); } catch (_) {} } }
    }
    if (mine['network.bind']) { out.env.HOST = mine['network.bind']; out.env.COS_BIND = mine['network.bind']; }
    if ('start.autostart' in mine) out.autostart = mine['start.autostart'];
    if ('start.onDemand' in mine) out.onDemand = mine['start.onDemand'];
    if ('start.phase' in mine) out.phase = mine['start.phase'];
    if ('start.restart' in mine) out.restart = mine['start.restart'];
    if (mine['wall.mode'] && d.boundary) out.boundary = { ...d.boundary, mode: mine['wall.mode'] };
    if (mine['general.label']) out.label = mine['general.label'];
    return out;
  }

  // a CPU limit is watched over resources.js's samples (the OS has no CPU-share cap here, SC_D1)
  const overCpu = new Map();
  async function watchCpu() {
    if (!resources) return [];
    const said = [];
    for (const v of sup.list()) {
      const lim = (his[v.name] || {})['cpu.limit']; if (lim == null || !v.pid) { overCpu.delete(v.name); continue; }
      const h = resources.history(v.name) || [], last = h[h.length - 1]; if (!last || last.pid !== v.pid || last.cpuPct == null) continue;
      const hostPct = last.cpuPct / cores;   // cpuPct is of one core; the limit is of the host
      if (hostPct > lim && !overCpu.get(v.name)) {
        overCpu.set(v.name, true); const restart = (his[v.name] || {})['cpu.onOver'] === 'restart';
        sup.note('over-limit', `CPU ${hostPct.toFixed(1)}% of the host over its limit ${lim}%${restart ? ' — restarted by rule' : ' — said; cpu.onOver is warn'}`, { by: 'rule:config', system: v.name });
        if (restart) { try { sup.restart(v.name, { by: 'rule:config' }); } catch (_) {} }
        said.push(v.name);
      } else if (hostPct <= lim) overCpu.delete(v.name);
    }
    return said;
  }

  return { get, set, clear, adjust, watchCpu, portEnvOf, FIELDS, GROUPS, parse, file: FILE };
}

module.exports = { createSystemConfig, parse, FIELDS, GROUPS, MODULE_ID: 'cos.manager.system-config', VERSION: '1.0.0' };
