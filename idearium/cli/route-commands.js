/**
 * idearium/cli/route-commands.js — §0.39.374: every capability is a command.
 * James: "That was fantastic. Everything needs to be available as commands."
 *
 * The capabilities built 0.39.364–0.39.373 (and the repo agent, its proposals, its charter) live in the running Idearium
 * (its repo layer, its tasks, its desktops) and answer over its API. Each command here is ONE row of a table — its usage,
 * the request it makes, how it prints — run by ONE runner: resolve the repo (uuid, prefix, suffix or name), call, print;
 * an API refusal exits 1 with its reason; --json prints the answer as it came (for scripts and agents). A new capability
 * is a new row, never a new code path. The table is also what `idearium help` lists and what the test reads.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const ICON = { running: '◌', done: '✓', ok: '✓', failed: '✗', stale: '◌', proposed: '◇', applied: '◆', rejected: '⊘', reverted: '↶', staged: '◈', skipped: '↷', restored: '↶' };
const dur = (ms) => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`; };
const when = (ts) => new Date(ts || Date.now()).toLocaleString('en-GB', { hour12: false }).replace(',', '');
const qs = (flags, keys) => { const p = new URLSearchParams(); for (const k of keys) if (flags[k] != null && flags[k] !== true) p.set(k, String(flags[k])); else if (flags[k] === true) p.set(k, '1'); const s = p.toString(); return s ? `?${s}` : ''; };
const LOG_FLAGS = ['kind', 'actor', 'status', 'q', 'before', 'limit'];

/**
 * SPEC — the table. Each row: { key, usage, about, repo (needs <repo> first), req(a) → { method, path, body, timeoutMs }
 * | { system, method, path } (another Nexus system, through lib/nexus-client), print(d, a, h) }.
 * a = { repo, args (positional after the repo), flags }.
 */
export const SPEC = [
  // ── the agent wearing the repo's hat ──────────────────────────────────────────────────────────────────────────────
  { key: 'repo.ask', repo: true, usage: 'repo ask <repo> "<message>" [--provider claude-code|ollama|chatgpt|…] [--model m]', about: 'talk to the agent wearing the repo\'s hat (its code lands as proposals)',
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/agent/prompt`, timeoutMs: 20 * 60000, body: { message: a.args.join(' '), ...(a.flags.provider ? { provider: a.flags.provider } : {}), ...(a.flags.model ? { model: a.flags.model } : {}) } }),
    need: (a) => a.args.length ? null : 'a message',
    print: (d, a, h) => {
      console.log(`${h.c.dim(`${d.providerUsed || d.provider || ''}${d.elapsedMs ? ` · ${dur(d.elapsedMs)}` : ''}`)}\n${d.text || d.reply || ''}`);
      const inj = (d.injects && d.injects.injects) || [];
      if (inj.length) { console.log(''); for (const i of inj) console.log(`  ${ICON[i.status] || '·'} ${i.path} ${h.c.dim(i.status)}  ${h.c.dim(i.uuid || '')}`); console.log(h.c.dim(`\n  idearium repo changes ${h.shortRepo(a.repo.uuid)}`)); }
    } },
  { key: 'repo.agent', repo: true, usage: 'repo agent <repo> [--provider p] [--inject review|auto|off] [--scope s] [--model m]', about: 'who wears the hat, and how its code lands',
    req: (a) => { const f = a.flags; const set = ['provider', 'inject', 'scope', 'model'].some(k => f[k]); return set
      ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/agent/settings`, body: { ...(f.provider ? { provider: f.provider } : {}), ...(f.inject ? { injectMode: f.inject } : {}), ...(f.scope ? { toolScope: f.scope } : {}), ...(f.model ? { ollamaModel: f.model } : {}) } }
      : { method: 'GET', path: `/api/repos/${a.repo.uuid}/agent/settings` }; },
    print: (d, a, h) => { const s = d.settings || d; h.header(`${a.repo.name} — its agent`); for (const k of ['provider', 'backend', 'injectMode', 'toolScope', 'ollamaModel']) if (s[k] != null) console.log(`  ${k.padEnd(12)} ${h.c.bold(String(s[k]))}`); if (s.providers) console.log(h.c.dim(`  providers: ${s.providers.join(' · ')}`)); console.log(''); } },

  // ── what its agent proposed ───────────────────────────────────────────────────────────────────────────────────────
  { key: 'repo.changes', repo: true, usage: 'repo changes <repo> [--status proposed|applied|…] [--prove]', about: 'the agent\'s proposals; --prove checks them on a scratch copy against the charter',
    req: (a) => a.flags.prove ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/worksurface/prove`, body: {}, timeoutMs: 600000 } : { method: 'GET', path: `/api/repos/${a.repo.uuid}/injects${qs(a.flags, ['status'])}` },
    print: (d, a, h) => {
      if (a.flags.prove) { const r = d.run || d; console.log(`${r.ok || r.allMet ? h.c.mint('✓ proven') : h.c.coral('✗ not proven')} ${h.c.dim(`${r.met ?? '?'}/${r.total ?? '?'} conditions`)}`); for (const x of r.results || []) console.log(`  ${x.met ? h.c.mint('✓') : h.c.coral('✗')} ${x.says}${x.met ? '' : h.c.dim(` — ${String(x.evidence || '').slice(0, 160)}`)}`); return; }
      const list = d.injects || d.list || d.rows || [];
      if (!list.length) { console.log(h.c.gray('  no proposals')); return; }
      for (const i of list) console.log(`  ${ICON[i.status] || '·'} ${(i.op === 'delete' ? 'delete ' : '') + i.path}  ${h.c.dim(`${i.status} · ${i.hatName || i.source && i.source.kind || ''} · ${when(i.createdAt)}`)}  ${h.c.gray(i.uuid)}`);
    } },
  ...['apply', 'reject', 'revert'].map(op => ({ key: `repo.${op}`, repo: true, usage: `repo ${op} <repo> <proposal-id>${op === 'reject' ? ' [--reason "…"]' : ''}`, about: `${op} one of the agent's proposals`,
    need: (a) => a.args[0] ? null : 'a proposal id (idearium repo changes <repo>)',
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/injects/${encodeURIComponent(a.args[0])}/${op}`, body: { ...(a.flags.reason ? { reason: a.flags.reason } : {}), ...(op === 'apply' ? { approvedBy: 'cli' } : {}) } }),
    print: (d, a, h) => { const i = d.inject || d; console.log(`${h.c.mint('✓')} ${i.path || a.args[0]} — ${i.status || op}`); } })),

  // ── its charter: the compartment's intent ─────────────────────────────────────────────────────────────────────────
  { key: 'repo.charter', repo: true, usage: 'repo charter <repo> [show | set <file> | check]', about: 'axioms, conditions, end state — with what it inherits (a Nexus system: Nexus\'s)',
    req: (a) => { const v = a.args[0] || 'show';
      if (v === 'set') { const fs = require('fs'); if (!a.args[1] || !fs.existsSync(a.args[1])) return { error: `usage: idearium repo charter <repo> set <file>` }; return { method: 'PUT', path: `/api/repos/${a.repo.uuid}/charter`, body: { text: fs.readFileSync(a.args[1], 'utf8') } }; }
      if (v === 'check') return { method: 'POST', path: `/api/repos/${a.repo.uuid}/charter/check`, body: {}, timeoutMs: 600000 };
      return { method: 'GET', path: `/api/repos/${a.repo.uuid}/charter` }; },
    print: (d, a, h) => {
      if (a.args[0] === 'check') { const r = d.data || d; console.log(`${h.c.bold(`${r.met ?? 0}/${r.total ?? 0}`)} of its end state met${r.empty ? h.c.dim(` — ${r.note}`) : ''}`); for (const x of r.results || []) console.log(`  ${x.met ? h.c.mint('✓') : h.c.coral('✗')} ${x.says}`); return; }
      h.header(`${a.repo.name} — charter${d.exists === false ? ' (none yet)' : ''}`);
      for (const x of d.axioms || []) console.log(`  ${h.c.violet('axiom')}      ${x}`);
      for (const c of d.conditions || []) console.log(`  ${h.c.amber('condition')}  ${c.says}${c.inherited ? h.c.dim(` (from ${c.inherited})`) : ''}`);
      const es = Array.isArray(d.endState) ? d.endState : (d.endState && d.endState.results) || [];
      for (const e of es) console.log(`  ${h.c.sky('end state')}  ${e.says || e}`);
      if (d.compartment) console.log(h.c.dim(`\n  compartment ${d.compartment.id}: ${d.compartment.set ? 'intent set' : `not set — ${d.compartment.error}`}${(d.compartment.dropped || []).length ? ` · not checkable by COS: ${d.compartment.dropped.join('; ')}` : ''}`));
      if (!d.exists && d.template) console.log(h.c.dim(`\n  start from:\n${d.template}`));
      console.log('');
    } },

  // ── what is happening, and what happened ──────────────────────────────────────────────────────────────────────────
  { key: 'repo.tasks', repo: true, usage: 'repo tasks <repo> [--running] [--failed]', about: 'background tasks: every call of the agent wearing its hat, runs, setup',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/tasks?limit=120` }),
    print: (d, a, h) => {
      let list = d.tasks || [];
      const live = (t) => t.status === 'running' || (t.children || []).some(k => k.status === 'running');
      if (a.flags.running) list = list.filter(live);
      if (a.flags.failed) list = list.filter(t => t.status === 'failed' || t.status === 'stale');
      if (!list.length) { console.log(h.c.gray('  no tasks')); return; }
      const line = (t, pad) => console.log(`${pad}${t.status === 'failed' ? h.c.coral(ICON.failed) : t.status === 'running' ? h.c.sky(ICON.running) : h.c.mint(ICON[t.status] || '·')} ${h.c.dim(t.kind.padEnd(6))} ${t.title.slice(0, 90)}  ${h.c.dim(`${t.provider || ''} · ${dur(t.elapsedMs ?? t.ms)}`)}${t.checkpoint ? h.c.amber(` ⟲ ${t.checkpoint}`) : ''}`);
      for (const t of list) { line(t, '  '); for (const k of t.children || []) line(k, '      '); if (t.status === 'failed' && t.result && t.result.error) console.log(h.c.coral(`      ${t.result.error.slice(0, 160)}`)); }
      console.log(h.c.dim(`\n  ${d.running} running`));
    } },
  { key: 'repo.activity', repo: true, usage: 'repo activity <repo> [--kind task|phase|inject|fault|run|checkpoint|system] [--actor a] [--status failed] [--q words] [--limit n] [--before ts]', about: 'the repo\'s durable activity log, newest first',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/activity${qs(a.flags, LOG_FLAGS)}` }),
    print: (d, a, h) => printLog(d, h, null) },
  { key: 'activity', repo: false, usage: 'activity [--kind k] [--actor a] [--status failed] [--q words] [--limit n]', about: 'every compartment\'s activity log at once (what BrainOS shows)',
    req: (a) => ({ method: 'GET', path: `/api/activity${qs(a.flags, LOG_FLAGS)}` }),
    print: (d, a, h) => printLog(d, h, d.names || {}) },

  // ── its desktop, like VMware ──────────────────────────────────────────────────────────────────────────────────────
  { key: 'repo.desktop', repo: true, usage: 'repo desktop <repo> [status | start | stop | pause | resume | checkpoint [--label "…"] | checkpoints | rewind <tag>]', about: 'the repo\'s desktop VM: power, pause, live checkpoints, rewind',
    req: (a) => { const v = a.args[0] || 'status', base = `/api/repos/${a.repo.uuid}/desktop`;
      if (v === 'status') return { method: 'GET', path: base };
      if (v === 'start') return { method: 'POST', path: base, body: {}, timeoutMs: 120000 };
      if (v === 'stop') return { method: 'DELETE', path: base };
      if (v === 'checkpoints') return { method: 'GET', path: `${base}/checkpoints` };
      if (v === 'rewind' && !a.args[1]) return { error: 'usage: idearium repo desktop <repo> rewind <tag> (idearium repo desktop <repo> checkpoints)' };
      if (['pause', 'resume', 'checkpoint', 'rewind'].includes(v)) return { method: 'POST', path: `${base}/${v}`, body: { ...(a.args[1] ? { tag: a.args[1] } : {}), ...(a.flags.label ? { label: a.flags.label } : {}) }, timeoutMs: 120000 };
      return { error: `unknown desktop action: ${v}` }; },
    print: (d, a, h) => {
      const v = a.args[0] || 'status';
      if (v === 'checkpoints') { const l = d.checkpoints || []; if (!l.length) { console.log(h.c.gray('  no checkpoints')); return; } for (const c of l) console.log(`  ${h.c.amber('⟲')} ${c.tag}  ${c.label || ''}  ${h.c.dim(when(c.ts))}${c.present === false ? h.c.coral('  (gone from the VM)') : ''}`); return; }
      if (v === 'checkpoint') { console.log(`${h.c.mint('✓')} checkpoint ${h.c.bold(d.checkpoint.tag)}`); return; }
      if (v === 'rewind') { console.log(`${h.c.mint('✓')} the desktop is back at ${h.c.bold(d.checkpoint.tag)}${d.checkpoint.label ? h.c.dim(` — ${d.checkpoint.label}`) : ''}`); return; }
      console.log(`${h.c.bold(d.state || d.status || 'ok')}${d.ports && d.ports.wsPort ? h.c.dim(` · vnc :${d.ports.vncPort} · ws :${d.ports.wsPort}`) : ''}${d.viewer ? h.c.dim(` · ${d.viewer}`) : ''}${d.error ? h.c.coral(` — ${d.error}`) : ''}`);
    } },

  // ── a Nexus system: its processes, through its supervisor ─────────────────────────────────────────────────────────
  { key: 'repo.system', repo: true, usage: 'repo system <repo> [status | restart | stop | start] [--process name]', about: 'a Nexus system repo\'s processes, controlled through autopilot (never the system itself)',
    req: (a) => { const v = a.args[0] || 'status'; return v === 'status' ? { method: 'GET', path: `/api/repos/${a.repo.uuid}/system` }
      : ['restart', 'stop', 'start'].includes(v) ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/system/${v}`, body: a.flags.process ? { process: a.flags.process } : {} } : { error: `unknown system action: ${v}` }; },
    print: (d, a, h) => {
      if ((a.args[0] || 'status') !== 'status') { console.log(`${h.c.mint('✓')} ${d.op} ${d.process} — ${d.status || 'asked'}${d.note ? h.c.dim(` (${d.note})`) : ''}`); return; }
      h.header(`${d.system} — through ${d.supervisor || 'its supervisor'}`);
      if (d.error) console.log(h.c.coral(`  ${d.error}`));
      if (d.note) console.log(h.c.dim(`  ${d.note}`));
      for (const p of d.processes || []) console.log(`  ${h.c.bold(p.name.padEnd(22))} ${p.status.padEnd(12)} ${h.c.dim(`pid ${p.pid || '—'} · :${p.port || '—'} · ${p.restarts || 0} restart(s)${p.crashesInWindow ? ` · ${p.crashesInWindow} crash(es)` : ''}`)}`);
      console.log('');
    } },

  // ── the machine ───────────────────────────────────────────────────────────────────────────────────────────────────
  { key: 'perf', repo: false, usage: 'perf', about: 'memory, heap and CPU as the resource monitor sees them (orchestrator)',
    req: () => ({ system: 'orchestrator', method: 'GET', path: '/api/perf' }),
    print: (d, a, h) => {
      const r = d.report || d.monitor || d; const s = (r.current && r.current.system) || {};
      console.log(`${h.c.bold(r.level || '?')}${(r.reasons || []).length ? h.c.dim(` — ${r.reasons.join('; ')}`) : ''}`);
      if (s.totalMem) console.log(`  memory  ${(s.freeMem / 1073741824).toFixed(1)}GB free of ${(s.totalMem / 1073741824).toFixed(1)}GB (${(s.freeMemPct * 100).toFixed(1)}%)`);
      if (s.cpuPct != null) console.log(`  cpu     ${(s.cpuPct * 100).toFixed(0)}%`);
      const p = r.current && r.current.process; if (p && p.heapLimitPct != null) console.log(`  heap    ${(p.heapLimitPct * 100).toFixed(1)}% of its limit`);
      if (r.transitions != null) console.log(h.c.dim(`  ${r.transitions} level change(s) reported · ${r.samples} sample(s)`));
    } },
  { key: 'models', repo: false, usage: 'models', about: 'the Ollama models installed, their sizes, what is loaded — and which fit in memory now',
    req: () => ({ system: 'ollama', method: 'GET', path: '/api/models' }),
    print: (d, a, h) => {
      const RM = require('../../lib/resource-monitor.js');
      for (const m of d.models || []) {
        const size = d.sizes && d.sizes[m]; const fit = RM.fitsModel({ model: m, bytes: size, loaded: d.loaded || [] });
        const loaded = (d.loaded || []).some(x => x.name === m);
        console.log(`  ${fit.fits ? h.c.mint('✓') : h.c.coral('✗')} ${m.padEnd(48)} ${h.c.dim(size ? `${(size / 1073741824).toFixed(1)}GB` : '?')}${loaded ? h.c.sky(' loaded') : ''}${m === d.active ? h.c.amber(' default') : ''}${fit.fits ? '' : h.c.dim(`  ${fit.why}`)}`);
      }
    } },
];

function printLog(d, h, names) {
  const rows = d.rows || [];
  if (!rows.length) { console.log(h.c.gray('  nothing logged')); return; }
  let day = '';
  for (const r of rows) {
    const t = new Date(r.ts); const dk = t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    if (dk !== day) { console.log(h.c.dim(`\n  ${dk}`)); day = dk; }
    const icon = r.status === 'failed' ? h.c.coral('✗') : ICON[r.status] || '·';
    console.log(`  ${h.c.dim(t.toLocaleTimeString('en-GB', { hour12: false }))} ${icon} ${h.c.dim(String(r.kind).padEnd(18))}${names ? ` ${h.c.sky(String(names[r.compartment] || r.compartment.slice(0, 14)).padEnd(16))}` : ''} ${String(r.title || '').slice(0, 110)}  ${h.c.gray(r.actor || '')}`);
  }
  if (d.more) console.log(h.c.dim(`\n  older: --before ${rows[rows.length - 1].ts}`));
}

/** _system(name, method, path) — another Nexus system's API (lib/nexus-client resolves its port from the one config) */
async function _system(name, method, path, timeoutMs = 8000) {
  const NC = require('../../lib/nexus-client.js');
  return NC.call(name, method, path, undefined, { timeout: timeoutMs });
}

/**
 * makeRouteCommands(h) -> { [key]: handler } — h: { api(method, path, body, timeoutMs), findRepo, shortRepo, die,
 * header, port, c: { sky, mint, amber, coral, violet, bold, dim, gray } }. One runner for every row of SPEC.
 */
export function makeRouteCommands(h) {
  const out = {};
  for (const row of SPEC) {
    out[row.key] = async (os, { positional = [], flags = {} } = {}) => {
      const repo = row.repo ? (positional[0] ? h.findRepo(positional[0]) : h.die(`usage: idearium ${row.usage}`)) : null;
      const a = { repo, args: row.repo ? positional.slice(1) : positional, flags };
      const missing = row.need ? row.need(a) : null;
      if (missing) h.die(`${missing} is needed — usage: idearium ${row.usage}`);
      const rq = row.req(a);
      if (rq.error) h.die(rq.error);
      let d;
      try { d = rq.system ? await _system(rq.system, rq.method, rq.path) : await h.api(rq.method, rq.path, rq.body || null, rq.timeoutMs || 15000); }
      catch (e) { h.die(`${e.message}${/ECONNREFUSED|unreachable/.test(e.message) ? ` — is ${rq.system || `idearium (:${h.port})`} running?` : ''}`); }
      if (d && d.ok === false) h.die(d.error || 'refused');
      if (flags.json) { process.stdout.write(`${JSON.stringify(d, null, 2)}\n`); return; }
      row.print(d && d.data && !d.tasks && !d.rows ? { ...d, ...d.data } : d, a, h);
    };
  }
  return out;
}

/** helpLines() — one line per command group, for `idearium help` */
export function helpLines() { return SPEC.map(r => [r.usage, r.about]); }
