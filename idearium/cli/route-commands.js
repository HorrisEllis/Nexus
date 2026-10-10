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
 * a = { repo, args (positional after the repo), flags }. personOnly(a) → a reason: an agent calling the row through the
 * nexus.command tool (lib/agent-tools/tools/nexus/command.js) is refused with it; a person at the CLI is not.
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
    // §0.39.376 — approving is the person's: an agent (a repo's, or copilot) never applies a proposal through the tool
    ...(op === 'apply' ? { personOnly: () => 'approving a proposal is the person\'s — ask them to apply it (Apply on the work surface, or: idearium repo apply <repo> <id>)' } : {}),
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

  // ── its phases and its versions (0.45.0 CM3) — James: "next make sure these are all commands first, api routes if applicaple.
  //    also where is the background tasks? it hasnt built any phase yet." ─────────────────────────────────────────────
  { key: 'repo.phasemap', repo: true, usage: 'repo phasemap <repo> [--ready] [--map name]', about: 'every phase of the repo\'s phasemaps: done, ready to build, blocked — and its last run',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases`, timeoutMs: 30000 }),
    print: (d, a, h) => {
      let ph = d.phases || [];
      if (a.flags.map) ph = ph.filter(p => String(p.map).includes(a.flags.map));
      if (a.flags.ready) ph = ph.filter(p => p.ready && p.status !== 'complete');
      const s = d.summary || {};
      console.log(h.c.dim(`  ${s.complete ?? '?'} of ${s.total ?? ph.length} complete · ${(d.maps || []).length} phasemap(s) · ${s.runs || 0} run(s)`));
      let map = '';
      for (const p of ph) {
        if (p.map !== map) { map = p.map; console.log(`\n  ${h.c.bold(String(map).split('/').pop())}`); }
        const icon = p.status === 'complete' ? h.c.mint('✓') : p.ready ? h.c.sky('▸') : (p.blocked_by || []).length ? h.c.coral('⊘') : h.c.gray('·');
        console.log(`  ${icon} ${String(p.phase_key).padEnd(10)} ${String(p.title || p.name || '').slice(0, 80)}${p.ready && p.status !== 'complete' ? h.c.sky('  ready') : ''}${(p.blocked_by || []).length && p.status !== 'complete' ? h.c.dim(`  after ${p.blocked_by.join(', ')}`) : ''}${p.lastRun ? h.c.dim(`  · last ${p.lastRun.state || ''}`) : ''}`);
      }
      console.log(h.c.dim('\n  build one: idearium repo phase <repo> <phase> build'));
    } },
  { key: 'repo.phase', repo: true, usage: 'repo phase <repo> <phase> [build [--map name] [--provider ollama|claude-code|claude|…] [--note "…"]]', about: 'one phase: its runs (and why one stopped), or build it now as a background task',
    need: (a) => (a.args[0] ? null : '<phase>'),
    req: (a) => (a.args[1] === 'build'
      ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/phases/build`, body: { phase: a.args[0], ...(a.flags.map ? { map: a.flags.map } : {}), ...(a.flags.provider ? { provider: a.flags.provider } : {}), ...(a.flags.note ? { note: a.flags.note } : {}) }, timeoutMs: 120000 }
      : { method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/runs?phase=${encodeURIComponent(a.args[0])}` }),
    print: (d, a, h) => {
      if (a.args[1] === 'build') {
        console.log(`${h.c.mint('▸')} building ${h.c.bold(a.args[0])} in ${d.targetName || a.repo.name} — run ${String(d.runId || '').slice(0, 12)} · snapshot ${String(d.snapshot || '—').slice(0, 10)}${d.ladder ? h.c.dim(` · ladder ${d.ladder.rungs.join(' → ')}`) : ''}`);
        if (d.statusNote) console.log(h.c.dim(`  ${d.statusNote}`));
        console.log(h.c.dim(`  watch it: idearium repo tasks ${a.repo.name} --running · idearium repo phase ${a.repo.name} ${a.args[0]}`));
        return;
      }
      const runs = (d.runs || []).slice().sort((x, y) => (x.ts || 0) - (y.ts || 0));
      if (!runs.length) { console.log(h.c.gray(`  ${a.args[0]} has never run — idearium repo phase ${a.repo.name} ${a.args[0]} build`)); return; }
      for (const r of runs) console.log(`  ${h.c.dim(when(r.ts))} ${r.state === 'failed' || r.state === 'blocked' ? h.c.coral(r.state) : r.state === 'complete' || r.state === 'proved' ? h.c.mint(r.state) : h.c.sky(r.state || '?')}  ${h.c.dim(r.provider || '')}${r.error ? `  ${String(r.error).slice(0, 140)}` : ''}`);
    } },
  { key: 'repo.versions', repo: true, usage: 'repo versions <repo> [--limit n]', about: 'its versionium history: every change a commit (VR1) — message, who, files, tests',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/snapshots`, timeoutMs: 30000 }),
    print: (d, a, h) => {
      const l = (d.snapshots || []).slice(0, parseInt(a.flags.limit || '25', 10) || 25);
      if (!l.length) { console.log(h.c.gray('  no commits yet')); return; }
      for (const c of l) console.log(`  ${h.c.amber(String(c.commitId).slice(0, 10))} ${h.c.dim(when(c.ts))}  ${String(c.message || '').slice(0, 100)}${c.files ? h.c.dim(`  · ${c.files.count} files`) : ''}${c.tests ? h.c.dim(`  · tests ${c.tests}`) : ''}`);
      console.log(h.c.dim(`\n  ${(d.snapshots || []).length} commit(s)`));
    } },

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
    personOnly: (a) => ((a.args[0] || 'status') === 'status' ? null : 'stopping, starting or restarting a Nexus system is the person\'s — ask them (the Control view, or: idearium repo system <repo> restart)'),
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
  { key: 'repo.blanks', repo: true, usage: 'repo blanks <repo> [complete [--section id]] [--path spec/x.spec]', about: 'the spec\'s blank sections and empty files — complete drafts each one as a workshop proposal you accept',
    req: (a) => (a.args[0] === 'complete'
      ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/spec/complete`, body: { ...(a.flags.section ? { section: a.flags.section } : {}), ...(a.flags.path ? { path: a.flags.path } : {}) }, timeoutMs: 600000 }
      : { method: 'GET', path: `/api/repos/${a.repo.uuid}/spec/blanks${a.flags.path ? `?path=${encodeURIComponent(a.flags.path)}` : ''}` }),
    print: (d, a, h) => {
      if (a.args[0] === 'complete') {
        if (!(d.results || []).length) { console.log(h.c.gray(`  ${d.note || 'nothing to complete'}`)); return; }
        for (const r of d.results) console.log(`  ${r.ok ? h.c.mint('✓') : h.c.coral('✗')} ${r.section}  ${r.ok ? `${r.proposals} proposal(s)` : r.error}`);
        console.log(h.c.dim(`\n  review and accept them in the workshop ${d.workshopId} (idearium workshop show ${d.workshopId}), then save`));
        return;
      }
      console.log(h.c.dim(`  ${d.specPath} · ${d.sections} section(s)`));
      if (!(d.blank || []).length && !(d.emptyFiles || []).length) { console.log(h.c.mint('  nothing is blank')); return; }
      for (const b of d.blank || []) console.log(`  ${h.c.amber('○')} ${b.id}  ${h.c.dim(b.title || '')}`);
      for (const f of d.emptyFiles || []) console.log(`  ${h.c.amber('○')} ${f}  ${h.c.dim('0 bytes')}`);
      console.log(h.c.dim(`\n  draft them: idearium repo blanks ${a.repo.name} complete`));
    } },
  { key: 'repo.history', repo: true, usage: 'repo history <repo> <path>', about: 'the commits that touched one file — when, who, why (VR1), newest first',
    need: (a) => (a.args[0] ? null : '<path>'),
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/history?path=${encodeURIComponent(a.args[0])}`, timeoutMs: 30000 }),
    print: (d, a, h) => {
      const l = d.commits || [];
      if (!l.length) { console.log(h.c.gray(`  no commit names ${d.path}${d.untracked ? ` (${d.untracked} older commit(s) do not say what they touched)` : ''}`)); return; }
      for (const c of l) console.log(`  ${h.c.amber(String(c.commitId).slice(0, 10))} ${h.c.dim(when(c.ts))} ${c.op === 'delete' ? h.c.coral('deleted') : 'changed'}  ${String(c.message || '').slice(0, 90)}${(c.provenance.refs || []).length ? h.c.dim(`  · ${c.provenance.refs.join(', ')}`) : ''}`);
    } },
  // §OP3 0.57.0 — James: "i prefer options over hard coded … anything high leverage, or that removes the need to understand code".
  // A system's options through Idearium's proxy (GET/POST /api/systems/:system/options → the system's own /api/options).
  { key: 'options', repo: false, usage: 'options <system> [<group.key> <value> | <group.key> --reset] [--actor copilot]', about: 'a system\'s options — every value its code reads, with its default, range and source; set or reset one',
    need: (a) => a.args[0] ? null : 'a system (guardian, …)',
    req: (a) => {
      const [sys, id, value] = a.args, base = `/api/systems/${encodeURIComponent(sys)}/options`;
      if (id && (value !== undefined || a.flags.reset)) return { method: 'POST', path: base, body: { id, ...(a.flags.reset ? { reset: true } : { value }), actor: a.flags.actor === 'copilot' ? 'copilot' : 'user' } };
      return { method: 'GET', path: base };
    },
    print: (d, a, h) => {
      if (d.id || d.value !== undefined && !d.options) { console.log(`${h.c.mint('✓')} ${a.args[1]} = ${h.c.bold(String(d.value))}${d.old !== undefined ? h.c.dim(`  (was ${d.old})`) : ''}${d.note ? `\n  ${h.c.amber(d.note)}` : ''}`); return; }
      if (!d.declared) { console.log(h.c.dim(`  ${d.note || 'no options declared yet'}`)); return; }
      const want = a.args[1];
      let group = null;
      for (const o of (d.options || []).filter(o => !want || o.id === want || o.group === want)) {
        if (o.group !== group) { group = o.group; console.log(`\n  ${h.c.sky(group)}`); }
        const src = o.source === 'env' ? h.c.amber(`env ${o.overriddenBy}`) : o.source === 'file' ? h.c.mint('set') : h.c.dim('default');
        console.log(`    ${o.key.padEnd(24)} ${h.c.bold(String(o.value)).padEnd(12)} ${src}${o.unit ? h.c.dim(` ${o.unit}`) : ''}${h.c.dim(`  default ${o.default}${o.min != null ? ` · ${o.min}–${o.max}` : ''}`)}`);
        if (want) console.log(h.c.dim(`      ${o.description}`));
      }
      console.log('');
    } },
  // §IA2 0.58.0 — James: "what about a app password style login in idearium from clearglass panel, then we could accounts
  // per hat/repo?" Who this caller is; app passwords, each scoped to repos, capabilities and a hat. Making and revoking is
  // the person's — an agent asks.
  { key: 'access', repo: false, usage: 'access', about: 'who Idearium sees you as, and its access mode (open · origin · password)',
    req: () => ({ method: 'GET', path: '/api/access/me' }),
    print: (d, a, h) => console.log(`  mode ${h.c.bold(d.mode)} · ${d.signedIn ? `signed in as ${h.c.mint(d.who.label)}${d.who.hat ? ` (hat ${d.who.hat})` : ''} · ${d.who.caps.join(', ')} · repos ${Array.isArray(d.who.repos) ? d.who.repos.join(', ') : d.who.repos}` : h.c.dim('not signed in — this machine, full access')}`) },
  { key: 'access.keys', repo: false, usage: 'access keys', about: 'the app passwords: label, hat, repos, capabilities, last used (never the password)',
    req: () => ({ method: 'GET', path: '/api/access/keys' }),
    print: (d, a, h) => {
      if (!(d.keys || []).length) { console.log(h.c.dim('  no app passwords yet — idearium access new <label> [--hat h] [--repos a,b] [--caps read_ideas,write_ideas]')); return; }
      for (const k of d.keys) console.log(`  ${k.revokedAt ? h.c.coral('revoked') : h.c.mint('live   ')} ${h.c.amber(k.id)} ${k.label}${k.hat ? h.c.sky(`  hat ${k.hat}`) : ''}${h.c.dim(`  ${k.caps.join(',')} · repos ${Array.isArray(k.repos) ? k.repos.join(',') : k.repos}${k.lastUsedAt ? ` · used ${when(k.lastUsedAt)}` : ''}`)}`);
    } },
  { key: 'access.new', repo: false, usage: 'access new <label> [--hat h] [--repos a,b] [--caps read_ideas,write_ideas,admin]', about: 'make an app password — shown once; save it in Clear Glass to be signed in everywhere',
    need: (a) => (a.args.length ? null : '<label>'),
    personOnly: () => 'making an app password is the person\'s — ask them (Settings → Access, or: idearium access new <label>)',
    req: (a) => ({ method: 'POST', path: '/api/access/keys', body: { label: a.args.join(' '), ...(a.flags.hat ? { hat: a.flags.hat } : {}), ...(a.flags.repos ? { repos: a.flags.repos } : {}), ...(a.flags.caps ? { caps: a.flags.caps } : {}) } }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.key.label} (${d.key.id})\n\n  ${h.c.bold(d.password)}\n\n  ${h.c.amber('shown once')} — ${d.note}`) },
  { key: 'access.revoke', repo: false, usage: 'access revoke <id>', about: 'revoke an app password — its sign-ins end at once',
    need: (a) => (a.args[0] ? null : '<id>'),
    personOnly: () => 'revoking an app password is the person\'s — ask them (Settings → Access, or: idearium access revoke <id>)',
    req: (a) => ({ method: 'POST', path: `/api/access/keys/${encodeURIComponent(a.args[0])}/revoke`, body: {} }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} revoked ${d.key.label} (${d.key.id})${d.note ? h.c.dim(` — ${d.note}`) : ''}`) },
  // §FN1 0.59.0 — James: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?"
  // The field (clear-glass/src/page/field.js) through Clear Glass's own driver door (:7702 /cli/driver): number the page,
  // ask what is under a point, show a target, act on one. --on <window> picks the window (default: the main one).
  { key: 'field', repo: false, usage: 'field [--on <window>] [--overlay] [--all] [--limit n]', about: 'the interaction field: every clickable thing in a Clear Glass window, numbered, with x, y and z (0 = on top) — --overlay draws the numbers on the page',
    req: (a) => _fieldReq(a, { action: 'field', overlay: !!a.flags.overlay, all: !!a.flags.all, ...(a.flags.limit ? { limit: +a.flags.limit } : {}) }),
    print: (d, a, h) => { const f = d.result || {}; console.log(h.c.dim(`  ${d.agentId} · ${f.url || ''} · ${Array.isArray(f.targets) ? f.targets.length : f.targets} target(s)${f.overlay ? ' · drawn on the page' : ''}`)); console.log(f.text || h.c.dim('  (no targets)')); console.log(h.c.dim(`\n  next: idearium field show <n> · idearium field point <n> click${f.overlay ? ' · idearium field off' : ''}`)); } },
  { key: 'field.off', repo: false, usage: 'field off [--on <window>]', about: 'take the field\'s numbers (and any spotlight) off the page',
    req: (a) => _fieldReq(a, { action: 'fieldOff' }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} the field is off in ${d.agentId}`) },
  { key: 'field.at', repo: false, usage: 'field at <x> <y> [--on <window>]', about: 'what is under one point, top first — what a click there would hit',
    need: (a) => (a.args.length >= 2 && a.args.slice(0, 2).every(v => Number.isFinite(+v)) ? null : '<x> <y> (viewport pixels)'),
    req: (a) => _fieldReq(a, { action: 'at', x: +a.args[0], y: +a.args[1] }),
    print: (d, a, h) => { const st = (d.result && d.result.stack) || []; (Array.isArray(st) ? st : [st]).forEach((e, i) => console.log(`  ${i === 0 ? h.c.mint('z0') : h.c.dim(`z${i}`)} ${e.tag || ''}${e.name ? ` "${e.name}"` : ''}${e.id ? h.c.dim(`  #${e.id}`) : ''}${h.c.dim(`  (${e.x},${e.y}) ${e.w}×${e.h}`)}`)); } },
  { key: 'field.show', repo: false, usage: 'field show <n|selector> [label…] [--on <window>] [--off]', about: 'spotlight a target — a ring on it and the page dimmed around it, with a label',
    need: (a) => (a.flags.off || a.args[0] ? null : '<n> (a number from `idearium field`) or a CSS selector'),
    req: (a) => _fieldReq(a, a.flags.off ? { action: 'spotlight', off: true } : { action: 'spotlight', ...(/^\d+$/.test(a.args[0]) ? { n: +a.args[0] } : { selector: a.args[0] }), ...(a.args.length > 1 ? { label: a.args.slice(1).join(' ') } : {}) }),
    print: (d, a, h) => console.log(d.result && d.result.ok === false ? h.c.coral(`  ${d.result.error || 'not shown'}`) : `${h.c.mint('✓')} ${a.flags.off ? 'spotlight off' : `showing ${a.args[0]}`} in ${d.agentId}`) },
  { key: 'field.point', repo: false, usage: 'field point <n> [click|double|right|move|scroll|type] [--text t] [--via native|eros] [--on <window>]', about: 'act on a numbered target, the way a person\'s pointer would — a covered target is said, never clicked through',
    need: (a) => (/^\d+$/.test(a.args[0] || '') ? (!a.args[1] || ['click', 'double', 'right', 'move', 'scroll', 'type'].includes(a.args[1]) ? null : 'what to do: click, double, right, move, scroll or type') : '<n> (a number from `idearium field`)'),
    req: (a) => _fieldReq(a, { action: 'pointer', n: +a.args[0], do: a.args[1] || 'click', ...(a.flags.text ? { text: String(a.flags.text) } : {}), ...(a.flags.via ? { via: a.flags.via } : {}) }),
    print: (d, a, h) => { const r = d.result || {}; console.log(`${h.c.mint('✓')} ${a.args[1] || 'click'} #${a.args[0]} in ${d.agentId}${r.under && r.under[0] ? h.c.dim(`  (hit ${r.under[0].tag || ''}${r.under[0].name ? ` "${r.under[0].name}"` : ''})`) : ''}${r.note ? `\n  ${h.c.amber(r.note)}` : ''}`); } },
  { key: 'field.windows', repo: false, usage: 'field windows', about: 'what the field is doing in each Clear Glass window: its last map, spotlight and pointer, and how lately the page changed',
    req: () => ({ system: 'clear-glass', method: 'GET', path: '/cli/attention' }),
    print: (d, a, h) => _printWindows(d.windows || [], h) },
  // §FN2 0.59.0 — Nexus Nerve, the attention layer (lib/nerve, served by cortex): the field's regime, which systems are
  // present, and each Clear Glass window's focus. Read-only — Nerve shows, it never acts.
  { key: 'nerve', repo: false, usage: 'nerve', about: 'Nexus Nerve: the field\'s regime, which systems are present, and where each window\'s attention is',
    req: () => ({ system: 'cortex', method: 'GET', path: '/nerve/snapshot' }),
    print: (d, a, h) => {
      const f = ((d.nodes || [])[0] || {}).health || {};
      console.log(`  ${h.c.bold(f.regime || 'stable')} · coherence ${(+f.coherence || 0).toFixed(2)} · friction ${(+f.friction || 0).toFixed(2)} · entropy ${(+f.entropy || 0).toFixed(2)}${(d.stresses || []).length ? h.c.amber(` · ${d.stresses.length} stress`) : ''}`);
      const pres = (d.nodes || []).map(n => `${(n.presence && n.presence.status) === 'live' ? h.c.mint('●') : h.c.dim('○')} ${n.id}`);
      if (pres.length) console.log(`  ${pres.join('  ')}`);
      _printWindows(d.windows || [], h);
    } },
  // §0.59.1 — James: "all of the over 1000 specs, map onto whats done, and what isn't or make a tool to check."
  { key: 'census', repo: false, usage: 'census [--verdict claimed|verified|contradicted|built?|open] [--specs built|partial|unbuilt|doc|unregistered|all] [--limit n] [--report]',
    about: 'every phase and spec checked against the tree: done and proven, done and only claimed, done but its files are gone, open but looks built; specs built / partial / unbuilt',
    req: (a) => ({ method: 'GET', timeoutMs: 60000, path: `/api/census${qs(a.flags, ['verdict', 'specs', 'limit', 'report'])}` }),
    print: (d, a, h) => {
      if (a.flags.report) { process.stdout.write(d.report || ''); return; }
      console.log(`  ${d.text}`);
      const ph = d.phases || {}, sp = d.specs || {};
      const show = (title, rows, fmt) => { if (!rows || !rows.length) return; console.log(`\n  ${h.c.bold(title)} (${rows.length})`); for (const r of rows) console.log(`    ${fmt(r)}`); };
      show('done, but files it names are gone', ph.contradicted, p => `${h.c.coral(p.id)} ${h.c.dim(p.map)} — ${p.evidence.missing.slice(0, 3).join(', ')}`);
      show('open, but looks built (check, then mark)', ph.builtMaybe, p => `${h.c.amber(p.id)} ${h.c.dim(p.map)} — ${p.evidence.testsFound.join(', ')}`);
      show(`phases: ${a.flags.verdict}`, ph.rows, p => `${p.id} ${h.c.dim(p.map)}`);
      show(`specs: ${a.flags.specs}`, sp.rows, s => `${s.path} ${h.c.dim(`${s.system} · ${s.verdict}${s.registered ? '' : ' · not registered'}`)}`);
      console.log(h.c.dim('\n  full report: idearium census --report > docs/census/spec-census.md'));
    } },
  { key: 'store', repo: false, usage: 'store', about: 'the shared memory store by its files: each table\'s size, append segments, cap and archive (cortex)',
    req: () => ({ system: 'cortex', method: 'GET', path: '/api/store' }),
    print: (d, a, h) => {
      const mb = (b) => `${(b / 1048576).toFixed(1)}MB`;
      for (const t of (d.tables || []).slice(0, parseInt(a.flags.limit || '25', 10) || 25)) console.log(`  ${String(t.table).padEnd(34)} ${mb(t.baseBytes + t.segmentBytes).padStart(8)}${t.segments ? h.c.dim(`  ${t.segments} segment(s)`) : ''}${t.cap ? h.c.sky(`  cap ${t.cap}`) : ''}${t.archiveDays ? h.c.dim(`  archive ${t.archiveDays} day(s) ${mb(t.archiveBytes)}`) : ''}`);
      if (d.totals) console.log(h.c.dim(`\n  ${mb(d.totals.bytes)} live · ${mb(d.totals.archiveBytes)} archived · ${d.dir}`));
    } },
  { key: 'ollama.tape', repo: false, usage: 'ollama tape [<run>] [--chars n]', about: 'every Ollama call recorded: the runs, or one run\'s macro — each call asked and answered, in order',
    req: (a) => ({ system: 'ollama', method: 'GET', path: a.args[0] ? `/api/tape/${encodeURIComponent(a.args[0])}${a.flags.chars ? `?chars=${a.flags.chars}` : ''}` : '/api/tape' }),
    print: (d, a, h) => {
      if (!a.args[0]) {
        if (d.replaying) console.log(h.c.amber(`  replaying from the tape: ${d.replaying}`));
        if (!(d.runs || []).length) { console.log(h.c.gray('  nothing recorded yet')); return; }
        for (const r of d.runs) console.log(`  ${h.c.amber(String(r.run).slice(0, 14).padEnd(14))} ${h.c.dim(when(r.last))}  ${String(r.calls).padStart(3)} call(s)${r.failed ? h.c.coral(` ${r.failed} failed`) : ''}  ${h.c.dim(`${(r.ms / 1000).toFixed(1)}s · ${r.models.join(', ')} · ${r.hat || r.callers.join(', ')}`)}`);
        console.log(h.c.dim(`\n  one run: idearium ollama tape <run> · replay it without Ollama: NEXUS_OLLAMA_REPLAY=<run>`));
        return;
      }
      (d.steps || []).forEach((s, i) => {
        console.log(`\n  ${h.c.bold(`${i + 1}.`)} ${h.c.dim(when(s.at))} ${s.op} ${h.c.sky(s.model)} ${h.c.dim(`seed ${s.seed} · ${s.caller}`)}${s.timings && s.timings.tokensPerSec ? h.c.dim(` · ${s.timings.tokensPerSec} tok/s`) : ''}${s.ok ? '' : h.c.coral(` ✗ ${s.error}`)}`);
        if (s.prompt) console.log(`     ${h.c.dim('asked')}  ${String(s.prompt).replace(/\s+/g, ' ').slice(0, 300)}`);
        if (s.answer) console.log(`     ${h.c.dim('answer')} ${String(s.answer).replace(/\s+/g, ' ').slice(0, 300)}`);
        if (s.toolCalls) console.log(`     ${h.c.dim('tools')}  ${s.toolCalls.map(t => t.name).join(', ')}`);
      });
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

/** §FN1 — one request shape for every field row: Clear Glass's driver, the window from --on */
function _fieldReq(a, payload) {
  return { system: 'clear-glass', method: 'POST', path: '/cli/driver', timeoutMs: 30000, body: { agentId: a.flags.on && a.flags.on !== true ? String(a.flags.on) : 'default', ...payload } };
}
function _ago(ts) { if (!ts) return 'never'; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; }
function _printWindows(ws, h) {
  if (!ws.length) { console.log(h.c.dim('  no window has used the field or changed lately')); return; }
  for (const w of ws) {
    const f = w.focus || {};
    const bits = [f.field ? `field ${f.field.targets} target(s) ${_ago(f.field.at)}` : null, f.spotlight ? `showing "${f.spotlight.label || '?'}" ${_ago(f.spotlight.at)}` : null,
      f.pointer ? `${f.pointer.do} ${f.pointer.n != null ? `#${f.pointer.n}` : `(${f.pointer.x},${f.pointer.y})`} ${_ago(f.pointer.at)}` : null].filter(Boolean);
    console.log(`  ${w.idle ? h.c.dim('○') : h.c.mint('●')} ${h.c.sky(w.agentId)}${f.url ? h.c.dim(`  ${String(f.url).slice(0, 60)}`) : ''}${bits.length ? `  ${bits.join(' · ')}` : ''}${w.mutationCount ? h.c.dim(`  · ${w.mutationCount} page change(s), last ${_ago(w.lastMutation)}`) : ''}`);
  }
}

/** _system(name, method, path) — another Nexus system's API (lib/nexus-client resolves its port from the one config) */
async function _system(name, method, path, timeoutMs = 8000, body = undefined) {
  // §FN1 0.59.0 — Clear Glass is not in the ports block (it is the browser, not an orchestrated service); its IPC port is
  // the one the agent tools already use (CLEARGL_IPC_PORT, 7702). A POST's body is now sent (it was dropped).
  if (name === 'clear-glass') return _clearGlass(method, path, body, timeoutMs);
  const NC = require('../../lib/nexus-client.js');
  return NC.call(name, method, path, body, { timeout: timeoutMs });
}
function _clearGlass(method, path, body, timeoutMs) {
  const http = require('http'), port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10);
  const data = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path, method, timeout: timeoutMs, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (rs) => {
      let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) { return reject(new Error(`Clear Glass ${method} ${path} → ${rs.statusCode}, not JSON`)); } resolve(j); });
    });
    r.on('timeout', () => { r.destroy(); reject(new Error(`Clear Glass ${method} ${path} timed out after ${timeoutMs} ms`)); });
    r.on('error', (e) => reject(new Error(`Clear Glass unreachable at :${port} — ${e.message} (is Clear Glass open?)`)));
    if (data) r.write(data); r.end();
  });
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
      try { d = rq.system ? await _system(rq.system, rq.method, rq.path, rq.timeoutMs || 8000, rq.body) : await h.api(rq.method, rq.path, rq.body || null, rq.timeoutMs || 15000); }
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
