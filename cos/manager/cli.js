'use strict';
/**
 * cos/manager/cli.js — COS's own command line, over the manager's own functions (SC3, 0.60.379).
 * Spec: cos/spec/cos-manager.spec MOD-MG-CLI · Map: docs/2026-11-02-cos-console-phasemap.spec SC3_system_command_line, SC_D5.
 *
 * James, 2026-11-02: "Need the system cli."
 *
 * One table, run in COS's manager, so COS's console works with every other system down (§5.9; Idearium's cos.* rows reach the same routes
 * from outside). The verbs are the cos.* rows' verbs, so a person and an agent say the same thing. An agent's line is refused for an act
 * (it proposes: POST /api/cos/proposals); reading is anyone's.
 *
 *   createCli({ sup, resources, config, notices, proposals, addSystem, usage }) → { run(line, { by }) → Promise<{ ok, lines[] }>, TABLE }
 */

const TABLE = [
  ['help', 'help [verb]', 'this table'],
  ['ps', 'ps', 'every system: state, pid, port, restarts'],
  ['start', 'start <system>', 'start it'], ['stop', 'stop <system>', 'stop it'], ['restart', 'restart <system>', 'restart it'],
  ['boot', 'boot [all|core]', 'boot the declared systems phase by phase'],
  ['logs', 'logs <system> [n]', 'its recent output (default 30 lines)'],
  ['config', 'config <system> [key=value …] | config <system> clear <key …>', 'its configuration; set or clear a setting (memory.limit=25%, cpu.limit=2cores, network.port=3760, env.FOO=bar …)'],
  ['caps', 'caps <system>', 'its caps as the OS applied them'],
  ['usage', 'usage', 'memory and CPU per system, read from the OS'],
  ['notices', 'notices [all] | notices read', 'the bell: unread notices (all: read ones too); read marks them all read'],
  ['proposals', 'proposals [all]', 'held acts waiting for you'],
  ['take', 'take <proposal-id>', 'take a held act'], ['drop', 'drop <proposal-id> [why]', 'drop it'],
  ['add', 'add <name> <folder> [cmd=node] [args=server.js] [port=<n>] [health=/health]', 'add a system: a proposal, taken by you'],
];

function split(line) {
  const out = []; let cur = '', q = null;
  for (const ch of String(line || '').trim()) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur); return out;
}
const pad = (s, n) => String(s ?? '—').padEnd(n);

function createCli({ sup, resources = null, config = null, notices = null, proposals = null, addSystem = null, usage = null } = {}) {
  async function run(line, { by = 'person' } = {}) {
    const [verb, ...a] = split(line); const L = [];
    if (!verb) return { ok: true, lines: [] };
    const acts = ['start', 'stop', 'restart', 'boot', 'take', 'drop', 'add'];
    if (/^agent:/.test(String(by)) && (acts.includes(verb) || (verb === 'config' && a.length > 1) || (verb === 'notices' && a[0] === 'read')))
      return { ok: false, lines: [`an agent proposes; ${verb} is a person's act (POST /api/cos/proposals)`] };
    const need = (n, usage) => { if (a.length < n) throw Object.assign(new Error(`usage: ${usage}`), { code: 400 }); };
    const row = TABLE.find(r => r[0] === verb);
    try {
      switch (verb) {
        case 'help': {
          const rows = a[0] ? TABLE.filter(r => r[0] === a[0]) : TABLE;
          for (const r of rows) L.push(`${pad(r[1], 58)} ${r[2]}`); break;
        }
        case 'ps': {
          L.push(`${pad('SYSTEM', 22)}${pad('STATE', 16)}${pad('PID', 8)}${pad('PORT', 7)}RESTARTS`);
          for (const v of sup.list()) L.push(`${pad(v.name, 22)}${pad(v.state, 16)}${pad(v.pid, 8)}${pad(v.port, 7)}${v.restarts && typeof v.restarts === 'object' ? v.restarts.count : v.restarts ?? 0}`); break;
        }
        case 'start': case 'stop': case 'restart': {
          need(1, row[1]); const v = sup[verb](a[0], { by }); L.push(`${a[0]}: ${v.state}${v.pid ? ` (pid ${v.pid})` : ''}`); break;
        }
        case 'boot': { const r = await sup.boot({ set: a[0] || undefined, by }); L.push(`started ${r.started.join(', ') || 'none'}`); for (const s of r.skipped) L.push(`skipped ${s.name}: ${s.why}`); break; }
        case 'logs': { need(1, row[1]); for (const l of sup.logs(a[0], { limit: Number(a[1]) || 30 })) L.push(`${l.stream === 'err' ? '!' : ' '} ${l.line}`); if (!L.length) L.push(`${a[0]} has said nothing yet`); break; }
        case 'config': {
          if (!config) throw new Error('no configuration in this manager');
          need(1, row[1]); const name = a[0];
          let r;
          if (a[1] === 'clear') r = config.clear(name, a.slice(2), { by });
          else if (a.length > 1) { const patch = {}; for (const kv of a.slice(1)) { const i = kv.indexOf('='); if (i < 1) throw Object.assign(new Error(`"${kv}" is not key=value`), { code: 400 }); const v = kv.slice(i + 1); patch[kv.slice(0, i)] = v === 'none' || v === '' ? null : v; } r = config.set(name, patch, { by }); }
          else r = config.get(name);
          for (const [g, gl] of Object.entries(r.groups)) {
            const rows = Object.entries(r.settings).filter(([, s]) => s.group === g);
            if (g === 'environment') { const e = Object.entries(r.env); if (!e.length) continue; L.push(`— ${gl}`); for (const [k, x] of e) L.push(`  env.${pad(k, 22)}${pad(x.removed ? '(removed)' : x.value, 24)}${x.from}`); continue; }
            if (!rows.length) continue; L.push(`— ${gl}`);
            for (const [k, s] of rows) L.push(`  ${pad(k, 20)}${pad(s.value === null ? '—' : s.unit === 'size' && typeof s.value === 'number' ? `${s.value} MB` : s.unit === 'cpu' && s.value != null ? `${s.value}%` : typeof s.value === 'object' ? JSON.stringify(s.value) : s.value, 18)}${pad(s.from, 11)}${s.how.state || ''}${s.how.when ? ` · ${s.how.when}` : ''}`);
          }
          break;
        }
        case 'caps': { if (!resources) throw new Error('no resources in this manager'); need(1, row[1]); const c = resources.caps(a[0]); for (const k of ['heapMB', 'rssLimitMB', 'onOver', 'priority']) L.push(`${pad(k, 12)}${pad(c[k], 10)}${pad(c.layers[k], 10)}`); for (const [k, x] of Object.entries(c.applied)) L.push(`${pad(k, 12)}${pad(x.state, 14)}${x.why || ''}`); break; }
        case 'usage': { if (!usage) throw new Error('no usage reader'); const u = await usage.readAsync(sup.list(), sup.policy()); L.push(`host: ${u.host ? `${u.host.freePct != null ? u.host.freePct + '% memory free' : ''}` : ''}`); for (const [n, x] of Object.entries(u.systems || {})) L.push(`${pad(n, 22)}${pad(x.rssMB != null ? x.rssMB + ' MB' : '—', 12)}${x.cpuPct != null ? x.cpuPct + '% cpu' : ''}`); break; }
        case 'notices': {
          if (!notices) throw new Error('no bell in this manager');
          if (a[0] === 'read') { const r = notices.read({ all: true }); L.push(`${r.read} marked read`); break; }
          const ns = notices.list({ unread: a[0] !== 'all', limit: 40 }); if (!ns.length) L.push('nothing unread');
          for (const n of ns) L.push(`${n.read ? ' ' : '•'} ${pad(n.level, 6)}${pad(n.kind, 8)}${new Date(n.at).toISOString().slice(5, 16).replace('T', ' ')}  ${n.title}${n.body ? ` — ${n.body.slice(0, 120)}` : ''}`); break;
        }
        case 'proposals': { if (!proposals) throw new Error('no proposals'); const ps = proposals.list({ open: a[0] !== 'all' }); if (!ps.length) L.push('nothing held'); for (const p of ps) L.push(`${pad(p.id, 18)}${pad(p.status, 9)}${p.by} · ${p.verb} ${p.target} — ${p.why}`); break; }
        case 'take': { need(1, row[1]); const r = proposals.take(a[0], { by }); L.push(`${a[0]}: ${r.proposal.status}${r.proposal.error ? ` — ${r.proposal.error}` : ''}`); break; }
        case 'drop': { need(1, row[1]); const r = proposals.drop(a[0], { by, why: a.slice(1).join(' ') }); L.push(`${a[0]}: ${r.proposal.status}`); break; }
        case 'add': {
          if (!addSystem) throw new Error('adding systems is not in this manager'); need(2, row[1]);
          const o = { name: a[0], dir: a[1], by }; for (const kv of a.slice(2)) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); }
          if (o.args) o.args = o.args.split(','); if (o.port) o.port = Number(o.port);
          const r = addSystem.propose(o); L.push(`proposal ${r.proposal.id}: add ${o.name} from ${o.dir}${r.taken ? ` — taken: ${r.taken.status}` : ' — held: take it to add'}`); break;
        }
        default: return { ok: false, lines: [`no verb "${verb}". The table:`, ...TABLE.map(r => `  ${r[1]}`)] };
      }
      return { ok: true, lines: L };
    } catch (e) { return { ok: false, lines: [...L, e.message] }; }
  }
  return { run, TABLE };
}

module.exports = { createCli, TABLE, split, MODULE_ID: 'cos.manager.cli', VERSION: '1.0.0' };
