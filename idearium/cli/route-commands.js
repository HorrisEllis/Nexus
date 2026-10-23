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
 * | { system, method, path } (another Nexus system, through lib/nexus-client), print(d, a, h) }. Or local(a) → d instead of
 * req: run in the calling process, read-only (0.59.12: log, file, grep). maxChars: how much of its text an answer may carry.
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
  // §0.60.118 DK1 — James: "maybe buttons for agent tools, for the repo, to execute. replayable proceedures?" The same as the
  // Code tab's tools panel: one tool through the agent's door (this repo's scope), and .procedure files replayed in order.
  { key: 'repo.tool', repo: true, usage: 'repo tool <repo> <tool-name> [--args \'{"path":"README.md"}\']', about: 'run one agent tool for this repo, as a person (the agent\'s door, the repo\'s scope)',
    need: (a) => (a.args[0] ? null : '<tool-name>'),
    req: (a) => { let args = {}; try { args = a.flags.args ? JSON.parse(String(a.flags.args)) : {}; } catch (_) { args = { __bad: String(a.flags.args) }; } return { method: 'POST', path: `/api/repos/${a.repo.uuid}/agent/tools/run`, body: { name: a.args[0], args }, timeoutMs: 60000 }; },
    print: (d, a, h) => { const r = d.result || {}; console.log(`${r.ok === false || r.error ? h.c.coral('✗') : h.c.mint('✓')} ${d.name} ${h.c.dim(`${d.ms} ms`)}`); console.log(String(JSON.stringify(r.result !== undefined ? r.result : r, null, 2)).slice(0, 4000)); } },
  { key: 'repo.procedures', repo: true, usage: 'repo procedures <repo>', about: 'the repo\'s replayable procedures (tool calls kept as .procedure files)',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/procedures` }),
    print: (d, a, h) => { const l = d.procedures || []; if (!l.length) { console.log(h.c.gray('  no procedures — `repo procedure <repo> from-run <runId>` keeps a run\'s tool calls')); return; } for (const p of l) { const last = (p.runs || []).slice(-1)[0]; console.log(`  ${p.id}  ${p.name}  ${h.c.dim(`${p.steps.length} steps · ${p.runCount || 0} runs${last ? ` · last ${last.ok ? 'ok' : `stopped at ${last.stoppedAt}`}` : ''}`)}`); } } },
  { key: 'repo.procedure', repo: true, usage: 'repo procedure <repo> replay <id> | from-run <runId> [--name "…"] | remove <id>', about: 'replay a procedure in order (the first failure stops it), keep a run\'s tool calls as one, or archive one',
    need: (a) => (['replay', 'from-run', 'remove'].includes(a.args[0]) && a.args[1] ? null : 'replay <id> | from-run <runId> | remove <id>'),
    req: (a) => a.args[0] === 'replay' ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/procedures/${encodeURIComponent(a.args[1])}/replay`, body: {}, timeoutMs: 600000 }
      : a.args[0] === 'remove' ? { method: 'DELETE', path: `/api/repos/${a.repo.uuid}/procedures/${encodeURIComponent(a.args[1])}` }
      : { method: 'POST', path: `/api/repos/${a.repo.uuid}/procedures/from-run`, body: { runId: a.args[1], ...(a.flags.name ? { name: String(a.flags.name) } : {}) } },
    print: (d, a, h) => {
      if (d.run) { console.log(`${d.ok ? h.c.mint('✓ replayed') : h.c.coral(`✗ stopped at step ${d.run.stoppedAt} of ${d.run.of}`)} ${d.procedure.name}`); for (const r of d.run.results) console.log(`  ${r.ok ? h.c.mint('✓') : h.c.coral('✗')} ${r.tool}${r.error ? h.c.coral(` — ${r.error}`) : ''}`); return; }
      if (d.procedure) { console.log(`${h.c.mint('✓ saved')} ${d.procedure.id} ${d.procedure.name} ${h.c.dim(`${d.procedure.steps.length} steps`)}`); if ((d.cut || []).length) console.log(h.c.amber(`  left out (their arguments were cut when the run kept them): ${d.cut.map(c => `#${c.n} ${c.tool}`).join(', ')}`)); return; }
      console.log(d.archived ? `archived: ${d.archived}` : JSON.stringify(d)); } },
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
  // §0.60.143 TL1b — James: "We need persistent data look at the last commit." The agent's replies as they streamed, from disk
  { key: 'repo.feed', repo: true, usage: 'repo feed <repo> [<job id>] [--gate <map>::<phase>[::<gate>]] [--gates] [--contract <map>::<phase>] [--limit n]', about: 'the agent\'s replies and thinking as they streamed, kept on disk: newest jobs, one job with its timeline, or per contract gate every attempt',
    req: (a) => ({ method: 'GET', path: a.flags.contract ? `/api/repos/${a.repo.uuid}/agent/feed?contract=${encodeURIComponent(a.flags.contract)}` : a.flags.gate ? `/api/repos/${a.repo.uuid}/agent/feed?gate=${encodeURIComponent(a.flags.gate)}` : a.flags.gates ? `/api/repos/${a.repo.uuid}/agent/feed?gates=1` : a.args[0] ? `/api/repos/${a.repo.uuid}/agent/feed?job=${encodeURIComponent(a.args[0])}` : `/api/repos/${a.repo.uuid}/agent/feed?limit=${Number(a.flags.limit) || 20}` }),
    print: (d, a, h) => {
      if (d.ledger) {   // §0.60.146 — one contract's ledger
        console.log(`  ${h.c.sky(d.ledger.contract)}  ${h.c.dim(`${d.ledger.jobs.length} job(s) · ${d.ledger.lines} line(s) · ${d.ledger.file}`)}`);
        for (const j of d.ledger.jobs) console.log(h.c.dim(`    ${String(j.brick || '').split('::').pop().padEnd(22)} ${j.status.padEnd(10)} ${String(j.jobId).slice(0, 18)} ${j.provider || ''} · reply ${j.textLen}ch (${j.textFrom})${j.handled ? ` · handled ${j.handled.state || ''}` : ''}`));
        return;
      }
      if (d.gates) {   // §0.60.144 TL1c — per gate
        if (!d.gates.length) { console.log(h.c.gray(`  no reply kept under a gate${d.ungated ? ` (${d.ungated} without one)` : ''}`)); return; }
        for (const g of d.gates) {
          console.log(`  ${h.c.sky(g.brick)}  ${h.c.dim(`${g.attempts.length} attempt(s) · last ${g.last.status} · ${g.last.provider || ''}`)}`);
          for (const t of g.attempts) console.log(h.c.dim(`      ${t.attempt}. ${t.status.padEnd(10)} ${String(t.jobId).slice(0, 18)} ${t.provider || ''} · reply ${t.textLen}ch · thinking ${t.thinkingLen}ch`));
        }
        if (d.ungated) console.log(h.c.dim(`\n  ${d.ungated} job(s) with no gate known (a chat, or a reply from before 0.60.144)`));
        // §0.60.145 TL2a — one gate: what its next attempt is told, and what it would reuse
        if (d.note) console.log(h.c.dim(`\n  what its next attempt is told:\n  ${d.note.replace(/\n/g, '\n  ')}`));
        if (d.reusable) console.log(h.c.amber(`\n  ↺ its next attempt reuses job ${d.reusable.jobId} (${d.reusable.inflight ? 'still being written — waited for' : 'finished'}) instead of asking again`));
        return;
      }
      const head = (j) => `${j.status === 'error' || j.status === 'timeout' || j.status === 'stale' ? h.c.coral(j.status) : j.status === 'complete' ? h.c.mint(j.status) : h.c.sky(j.status)} ${h.c.dim(String(j.jobId).slice(0, 24))} ${j.provider || ''} ${h.c.dim(`reply ${j.textLen}ch · thinking ${j.thinkingLen}ch · ${new Date(j.updatedAt).toISOString().slice(0, 19)}`)}`;
      if (d.job) {
        const j = d.job; console.log(`  ${head(j)}`);
        if (j.thinking) console.log(h.c.dim(`\n  thinking (tail)\n  ${j.thinking.slice(-600).replace(/\n/g, '\n  ')}`));
        if (j.text) console.log(`\n  reply (tail)\n  ${j.text.slice(-1500).replace(/\n/g, '\n  ')}`);
        for (const e of (j.timeline || []).filter(e => e.event !== 'chunk').slice(-20)) console.log(h.c.dim(`  ${new Date(e.ts).toISOString().slice(11, 19)} ${e.event}${e.stage ? `:${e.stage}` : ''}${e.label ? ` ${e.label}` : ''}${e.state ? ` · ${e.state}` : ''}${e.error ? ` — ${e.error}` : ''}`));
        return;
      }
      if (!(d.jobs || []).length) { console.log(h.c.gray('  no journaled replies')); return; }
      for (const j of d.jobs) console.log(`  ${head(j)}`);
    } },
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
  // 0.60.7 — Versionium managed per repo (lib/repo-history.js) and the import checks (lib/import-checks.js)
  // 0.60.8 — intent routing for reasoning (lib/reasoning-route.js)
  // 0.60.34 VR1 — James: "i also want versions in idearium, github, and each zip, needs to match."
  // 0.60.41 RN1 — Nexus's own releases, recorded in Versionium (lib/nexus-releases.js): James's words, the proof, the commit
  { key: 'system.releases', repo: false, usage: 'system releases [--sync [--all]] [--limit n] [--version x.y.z]', about: 'every Nexus release, newest first, from Versionium: James\'s words, the git commit, the changelog, its commits; --sync records any missing (with the newest 30 releases\' commits; --all: every release\'s)',
    req: (a) => a.flags.sync ? { method: 'POST', path: '/api/releases/sync', timeoutMs: 120000, body: a.flags.all ? { all: true } : {} } : { method: 'GET', path: '/api/releases' },
    print: (d, a, h) => {
      if (a.flags.sync) { console.log(`  ${d.releases} releases: ${h.c.mint(`${d.recorded} recorded`)} · ${d.already} already · ${d.unpinned} without a git commit in this clone${d.withCommits != null ? ` · ${d.withCommits} with their commits` : ''}${d.refused && d.refused.length ? h.c.coral(` · ${d.refused.length} refused`) : ''}`); return; }
      let l = d.releases || [];
      if (a.flags.version) l = l.filter(r => r.version === String(a.flags.version).replace(/^v/, ''));
      if (!l.length) { console.log(h.c.gray('  no releases in Versionium yet — idearium releases --sync')); return; }
      for (const r of l.slice(0, parseInt(a.flags.limit || '15', 10) || 15)) {
        console.log(`  ${h.c.mint(r.tag.padEnd(10))} ${h.c.dim(r.gitCommit ? r.gitCommit.slice(0, 7) : 'no commit')}  ${r.changelog ? h.c.dim(r.changelog) : ''}${r.version === d.current ? h.c.amber('  ← running') : ''}`);
        if (r.quote) console.log(`    ${h.c.sky(String(r.quote).slice(0, 180))}`);
        if (a.flags.version && r.notes) console.log(h.c.dim(`    ${r.notes}`));
        if (a.flags.version && Array.isArray(r.commits)) for (const c of r.commits) console.log(`    ${h.c.dim(c.sha.slice(0, 8))} ${c.subject}  ${h.c.dim(`${c.files} file(s) +${c.added} −${c.removed}`)}`);
      }
    } },
  // §0.60.72 RN2 — James: "tell me all the recent changes. i want a changelog for each change or diff." Written from git.
  { key: 'system.changes', repo: false, usage: 'system changes [--since x.y.z] [--write]', about: 'every change since a release: each commit under the first release that contains it, with its files (written from git, not by hand); --write saves CHANGES.md',
    req: (a) => ({ method: 'GET', path: `/api/releases/changes?${new URLSearchParams({ ...(a.flags.since ? { since: String(a.flags.since) } : {}), ...(a.flags.write ? { write: '1' } : {}) })}`, timeoutMs: 120000 }),
    print: (d, a, h) => { if (d.out) { console.log(`  ${h.c.mint(d.out)} written (${d.bytes} bytes)`); return; } console.log(d.markdown); } },
  { key: 'system.version', repo: false, usage: 'version', about: 'the Nexus release (lib/version.js): its GitHub tag and zip name, whether every place that states it agrees (CK-253), and the module versions, labelled',
    req: () => ({ method: 'GET', path: '/api/version' }),
    print: (d, a, h) => { console.log(`  ${h.c.mint(`Nexus ${d.version}`)}${d.commit ? h.c.dim(`  ${d.commit}`) : ''}  ·  GitHub ${d.tag}  ·  zip ${d.zipName}`);
      for (const p of (d.agreement && d.agreement.places) || []) console.log(`    ${p.ok ? h.c.mint('✓') : h.c.amber('✗')} ${p.place}${p.ok ? '' : h.c.amber(`  ${p.why}`)}`);
      if (d.modules) console.log(h.c.dim(`  modules (not the release): IdeaOS ${d.modules.ideaos || '?'} · Clear Glass ${d.modules.clearGlass || '?'}`)); } },
  // 0.60.33 QA1 — the check catalogue: what each check is and whether Nexus runs it; run one over Nexus or a repo
  { key: 'checks.list', repo: false, usage: 'checks list [--family=shadow] [--runnable]', about: 'the check catalogue (cos/spec/check-catalogue.spec): every check, its family and stage, and which ones Nexus can run now',
    req: (a) => ({ method: 'GET', path: `/api/checks?${a.flags.family ? `family=${encodeURIComponent(a.flags.family)}&` : ''}${a.flags.runnable ? 'runnable=1' : ''}` }),
    print: (d, a, h) => { const s = d.summary || {}; console.log(`  ${s.total} checks · ${s.runnable} runnable now (${(s.runners || []).concat(s.importChecks || []).join(', ')})`);
      for (const c of d.checks || []) console.log(`  ${c.runnable ? h.c.mint(c.id) : h.c.dim(c.id)}  ${c.name}  ${h.c.dim(`${c.family} · ${c.how}`)}`); } },
  { key: 'checks.run', repo: false, usage: 'checks run <CK-nnn> [--repo=<uuid>] [--path=dir] [--step=<step>]', about: 'run one check now: CK-233 (nothing forbidden is back), CK-248 (every file passes its language\'s own parser), CK-230 (a step\'s shadow settled)',
    need: (a) => (a.args.length ? null : '<CK-nnn>'),
    req: (a) => ({ method: 'POST', path: `/api/checks/${encodeURIComponent(a.args[0])}/run`, timeoutMs: 10 * 60000, body: { ...(a.flags.repo ? { repo: a.flags.repo } : {}), ...(a.flags.path ? { path: a.flags.path } : {}), ...(a.flags.step ? { step: a.flags.step } : {}) } }),
    print: (d, a, h) => { console.log(`  ${d.ok ? h.c.mint(`${d.id} passed`) : d.verifiable === false ? h.c.amber(`${d.id} could not be checked`) : h.c.amber(`${d.id} failed`)}${d.ms != null ? h.c.dim(`  ${d.ms} ms`) : ''}`);
      if (d.reason) console.log(h.c.dim(`  ${d.reason}`));
      for (const i of (d.items || []).slice(0, 30)) console.log(`    ${i.skipped ? h.c.amber(`skipped ${i.lang}: ${i.skipped}`) : i.error ? `${i.file} (${i.lang}): ${i.error}` : i.file ? `${i.file}:${i.line} ${h.c.dim(`[${i.id}] ${i.text}`)}` : JSON.stringify(i)}`); } },
  // 0.60.31 RT1 — and the door's route: who is eligible (tools, window, readiness), who was rejected and why, the record
  { key: 'route.assess', usage: 'route assess <request words> [--kind=agent:browser] [--tools=browser,files] [--tokens=N]', about: 'how hard a request is and where it would be routed: complex → a reasoning agent (agent:reason), simple → the usual route; then the door\'s route — eligible agents in order, the rejected ones with why, confidence, fallback',
    need: (a) => (a.args.length ? null : '<request words>'),
    req: (a) => ({ method: 'POST', path: '/api/route/assess', body: { message: a.args.join(' '), ...(a.flags.kind ? { kind: a.flags.kind } : {}), ...(a.flags.tools || a.flags.tokens ? { needs: { ...(a.flags.tools ? { tools: String(a.flags.tools) } : {}), ...(a.flags.tokens ? { tokens: Number(a.flags.tokens) } : {}) } } : {}) } }),
    print: (d, a, h) => { const s = d.assessment || {}; console.log(`  ${s.level === 'complex' ? h.c.amber(s.level) : s.level}  score ${s.score} → ${d.kind}${d.preferAgent ? ` (${d.preferAgent})` : ''}`); for (const x of s.signals || []) console.log(h.c.dim(`    · ${x}`)); console.log(h.c.dim(`  ${d.why}`));
      const r = d.door || {}; const rec = r.record || {};
      if (!r.ok && !rec.rejected) { console.log(h.c.amber(`  door: ${r.error || 'no route'}`)); return; }
      console.log(`  route: ${(r.route || []).map(x => x.provider).join(' → ') || h.c.amber('none eligible')}${rec.confidence ? h.c.dim(`  (confidence ${rec.confidence.value == null ? 'untried' : rec.confidence.value} — ${rec.confidence.basis})`) : ''}`);
      if (rec.needs && ((rec.needs.tools || []).length || rec.needs.tokens)) console.log(h.c.dim(`  needs: ${[...(rec.needs.tools || []), rec.needs.tokens ? `~${rec.needs.tokens} tokens` : null].filter(Boolean).join(', ')}`));
      for (const x of rec.rejected || []) console.log(h.c.amber(`    ✗ ${x.provider} (${x.requirement}): ${x.why}`)); } },
  // 0.60.14 — tiny amounts of code: a line range, and a copy of it to the work surface / a new file
  { key: 'repo.lines', repo: true, usage: 'repo lines <repo> <path> <from> [to]', about: 'lines from..to of a repo file, numbered (80 lines when to is left out)',
    need: (a) => (a.args.length >= 2 ? null : '<path> <from> [to]'),
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/lines?path=${encodeURIComponent(a.args[0])}&from=${a.args[1]}${a.args[2] ? `&to=${a.args[2]}` : ''}` }),
    print: (d, a, h) => { console.log(h.c.dim(`  ${d.path} ${d.from}–${d.to} of ${d.total}`)); console.log(d.text); } },
  { key: 'repo.lines.copy', repo: true, usage: 'repo lines copy <repo> <path> <from> <to> [--to newPath]', about: 'copy those lines to the work surface as a new file to edit (a proposal: apply writes it)',
    need: (a) => (a.args.length >= 3 ? null : '<path> <from> <to>'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/lines/copy`, body: { path: a.args[0], from: a.args[1], to: a.args[2], ...(a.flags.to ? { toPath: a.flags.to } : {}) } }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.lines} lines → ${d.path} (on the work surface; apply to write it)`) },
  // §CE8 — James: "so the cli can read the current worksurface in the code tab." One surface for the Code tab, the CLI and
  // the agents (idearium/lib/surface-state.cjs): what is open, the picked lines and chunk, what waits, the run. Setting it
  // from here moves the tab (idearium.surface.changed).
  { key: 'code.surface', repo: true, usage: 'code surface <repo>', about: 'what the Code tab has open: the file, the picked lines (with their text), the chunk, the proposals waiting, the latest run',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/surface` }),
    print: (d, a, h) => _printSurface(d, a, h) },
  { key: 'code.open', repo: true, usage: 'code open <repo> <path> [--lines a-b]', about: 'open a file on the Code tab\'s surface (the tab follows), optionally with lines picked',
    need: (a) => (a.args[0] ? null : '<path>'),
    req: (a) => { const sel = _lines(a.flags.lines); if (sel && sel.error) return { error: sel.error }; return { method: 'PUT', path: `/api/repos/${a.repo.uuid}/surface`, body: { open: a.args[0], ...(sel ? { sel } : {}), by: 'cli' } }; },
    print: (d, a, h) => _printSurface(d, a, h) },
  { key: 'code.select', repo: true, usage: 'code select <repo> <from> [to] | --chunk <id> | --clear', about: 'pick lines (or a chunk) of the open file on the Code tab\'s surface; --clear unpicks',
    need: (a) => (a.flags.clear || a.flags.chunk || a.args[0] ? null : '<from> [to], --chunk <id> or --clear'),
    req: (a) => { const body = { by: 'cli' };
      if (a.flags.clear) Object.assign(body, { sel: null, chunk: null });
      else { if (a.flags.chunk && a.flags.chunk !== true) body.chunk = String(a.flags.chunk); if (a.args[0]) { const sel = _lines(`${a.args[0]}-${a.args[1] || a.args[0]}`); if (sel.error) return { error: sel.error }; body.sel = sel; } }
      return { method: 'PUT', path: `/api/repos/${a.repo.uuid}/surface`, body }; },
    print: (d, a, h) => _printSurface(d, a, h) },
  // §CE7 0.60.81 — James: "ai assisted coding using the chunking and line count tool for the ai to change lines at a time or a
  // section." A checked edit (expect must match the file now) and the agent on a picked range; both land as one proposal.
  { key: 'code.edit', repo: true, usage: 'code edit <repo> <path> <from> <to> --with "<new text>" [--expect "<old text>"]', about: 'replace lines from..to with new text — checked against the file as it is now; lands as a proposal (apply writes it)',
    need: (a) => (a.args.length >= 3 && typeof a.flags.with === 'string' ? null : '<path> <from> <to> --with "<text>"'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/code/edit`, body: { path: a.args[0], by: 'cli', edits: [{ from: a.args[1], to: a.args[2], replacement: a.flags.with, ...(typeof a.flags.expect === 'string' ? { expect: a.flags.expect } : {}) }] } }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.path} lines ${d.ranges.map(r => r.join('–')).join(', ')} → proposal ${h.c.gray((d.inject && d.inject.uuid) || '')} ${h.c.dim(`(${d.checksumBefore} → ${d.checksumAfter})`)}`) },
  { key: 'code.assist', repo: true, usage: 'code assist <repo> <path> <from> <to> <change|expand|refactor|fix|document|explain> ["instructions"] [--provider p] [--model m]', about: 'hand lines from..to to the repo\'s agent with an action; its replacement for exactly those lines lands as a proposal (explain answers only)',
    need: (a) => (a.args.length >= 4 ? null : '<path> <from> <to> <action>'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/code/assist`, timeoutMs: 20 * 60000, body: { path: a.args[0], from: a.args[1], to: a.args[2], action: a.args[3], ...(a.args[4] ? { note: a.args.slice(4).join(' ') } : {}), ...(a.flags.provider ? { provider: a.flags.provider } : {}), ...(a.flags.model ? { model: a.flags.model } : {}) } }),
    print: (d, a, h) => { if (!d.ok) { console.log(h.c.amber(`  ${d.error}`)); if (d.reply) console.log(h.c.dim(d.reply)); return; }
      if (d.action === 'explain') { console.log(h.c.dim(`  ${d.provider || ''}`)); console.log(d.reply); return; }
      console.log(`${h.c.mint('✓')} ${d.path} ${d.from}–${d.to} ${d.action} by ${d.provider || 'the agent'} → proposal ${h.c.gray((d.inject && d.inject.uuid) || '')}`); console.log(h.c.dim(`  idearium repo changes ${h.shortRepo(a.repo.uuid)}`)); } },
  // §CV3 0.60.81 — James: "rewind engine for each file." The runs Nexus kept (CE1), and undoing one: every file it changed
  // back as it was before it started (a file it created is named, not deleted).
  { key: 'repo.runs', repo: true, usage: 'repo runs <repo> [--status running|done|failed]', about: 'the runs Nexus kept for this repo: goal, attempt, agents tried, steps, files read and changed',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/runs${qs(a.flags, ['status', 'limit'])}` }),
    print: (d, a, h) => { const l = d.runs || []; if (!l.length) { console.log(h.c.gray('  no runs')); return; }
      for (const r of l) console.log(`  ${ICON[r.status] || '·'} ${h.c.gray(r.runId)} ${h.c.dim(`${r.status} · attempt ${r.attempt} · ${r.stepCount} steps · ${r.filesChanged.length} changed · ${when(r.updatedAt)}`)}\n     ${String(r.goal).split('\n')[0].slice(0, 110)}`); } },
  // §0.60.105 RL4 — James: "when i reject a propasal, the agent needs to understand the failure mode ad try again, after learning"
  { key: 'repo.lessons', repo: true, usage: 'repo lessons <repo> [--phase P] [--limit N]', about: 'what the agents were taught: each rejection read for its failure mode (gutted, exports-lost, regressed …), with the agent\'s own diagnosis, and every build fault',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/lessons${qs(a.flags, ['phase', 'limit'])}` }),
    print: (d, a, h) => { const l = d.faults || []; if (!l.length) { console.log(h.c.gray('  nothing learned yet')); return; }
      for (const f of l) console.log(`  ${h.c.gray(when(f.ts))} ${f.mode} ${h.c.dim(`${f.agent || ''} ${f.phase || ''} ${f.meta.path || ''}`)}${f.meta.why ? `\n     ${String(f.meta.why).slice(0, 140)}` : ''}${f.meta.diagnosis ? `\n     it said: ${String(f.meta.diagnosis).slice(0, 140)}` : ''}`);
      if (d.precedent) console.log(h.c.dim(`\n${d.precedent}`)); } },
  { key: 'repo.rewind-run', repo: true, usage: 'repo rewind-run <repo> <runId> [--dry]', about: 'put every file a run changed back as it was before the run (each restore is a version; --dry says what it would do)',
    need: (a) => (a.args[0] ? null : '<runId> (idearium repo runs <repo>)'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/runs/${encodeURIComponent(a.args[0])}/rewind`, body: { by: 'cli', ...(a.flags.dry ? { dryRun: true } : {}) }, timeoutMs: 120000 }),
    print: (d, a, h) => { console.log(h.c.dim(`  to ${String(d.to.commitId).slice(0, 12)} · ${when(d.to.ts)} · ${d.to.message || ''}${d.dryRun ? ' (dry run)' : ''}`));
      for (const r of d.results || []) console.log(`  ${r.done ? h.c.mint('↶') : r.dryRun ? '·' : h.c.amber('○')} ${r.path}${r.why ? h.c.dim(`  — ${r.why}`) : ''}`); } },
  // §0.60.104 CN3 — James: "what about using cos for the canvas, then each tool a nested compartment?" His ERAVOS canvas as a
  // COS compartment, each tool a nested one (lib/canvas-compartments.js).
  { key: 'canvas.list', repo: false, usage: 'canvas list', about: 'every canvas compartment, with how many tools it holds',
    req: () => ({ method: 'GET', path: '/api/canvas' }),
    print: (d, a, h) => { const l = d.canvases || []; if (!l.length) { console.log(h.c.gray('  no canvas yet — idearium canvas new "<name>"')); return; } for (const c of l) console.log(`  ${c.title}  ${h.c.dim(`${c.tools} tool${c.tools === 1 ? '' : 's'} · ${c.name}`)}  ${h.c.gray(c.id)}`); } },
  { key: 'canvas.new', repo: false, usage: 'canvas new "<name>" [--description "…"]', about: 'a canvas: a COS compartment laid out from his ERAVOS canvas (tools are added as nested compartments)',
    need: (a) => (a.args.length ? null : '"<name>"'),
    req: (a) => ({ method: 'POST', path: '/api/canvas', body: { name: a.args.join(' '), ...(typeof a.flags.description === 'string' ? { description: a.flags.description } : {}) }, timeoutMs: 120000 }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.canvas.name}  ${h.c.dim(d.canvas.root)}\n  ${h.c.dim(`add a tool: idearium canvas add-tool ${d.canvas.name} <domain> <category> <tool-id> "<Label>"`)}`) },
  { key: 'canvas.show', repo: false, usage: 'canvas show <canvas>', about: 'a canvas, its nested tool compartments, and whether each is linked in',
    need: (a) => (a.args[0] ? null : '<canvas>'),
    req: (a) => ({ method: 'GET', path: `/api/canvas/${encodeURIComponent(a.args[0])}` }),
    print: (d, a, h) => { h.header(`${d.canvas.title} — ${d.canvas.name}`); console.log(h.c.dim(`  ${d.canvas.root}`));
      for (const t of d.tools || []) console.log(`  ${t.linked ? h.c.mint('●') : h.c.coral('○')} ${t.id}  ${h.c.dim(`${t.linkedAt} · compartment ${t.compartment}${t.linked ? '' : ' · NOT linked'}`)}`);
      if (!(d.tools || []).length) console.log(h.c.gray('  no tools yet')); console.log(''); } },
  { key: 'canvas.add-tool', repo: false, usage: 'canvas add-tool <canvas> <domain> <category> <tool-id> "<Label>" [--sound]', about: 'a tool on a canvas: its own nested COS compartment, from his tool template, linked into the canvas',
    need: (a) => (a.args.length >= 4 ? null : '<canvas> <domain> <category> <tool-id> ["<Label>"]'),
    req: (a) => ({ method: 'POST', path: `/api/canvas/${encodeURIComponent(a.args[0])}/tools`, body: { domain: a.args[1], category: a.args[2], slug: a.args[3], label: a.args.slice(4).join(' ') || a.args[3], sound: !!a.flags.sound }, timeoutMs: 120000 }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.tool.id}  ${h.c.dim(`compartment ${d.tool.compartment} → ${d.tool.linkedAt}`)}${d.tool.acceptance.length ? h.c.dim(`\n  acceptance: ${d.tool.acceptance.join(' · ')}`) : ''}`) },
  // 0.60.15 — .contract v2 (cortex/core/raid/contract-gates.js): executable contracts, gated step by step. Local: they read
  // and write the .contract file itself; completion is the evaluator's, never declared.
  { key: 'contract.new', repo: false, usage: 'contract new <id> <file.contract> [--what text] [--why text]', about: 'a new v2 contract (context → build → verify gates) to edit',
    need: (a) => (a.args.length >= 2 ? null : '<id> <file.contract>'),
    local: (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const fs = require('fs'); if (fs.existsSync(a.args[1])) throw new Error(`${a.args[1]} exists`); fs.writeFileSync(a.args[1], require('../../lib/node-export.js').toYaml(C.scaffold({ id: a.args[0], what: a.flags.what || '', why: a.flags.why || '' }))); return { file: a.args[1] }; },
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.file}`) },
  { key: 'contract.gates', repo: false, usage: 'contract gates <file.contract>', about: 'every gate and its state (BLOCKED · READY · PASSED · FAILED · STALE), and whether the contract is complete — and why not',
    need: (a) => (a.args.length ? null : '<file.contract>'),
    local: (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const L = C.load(a.args[0]); const r = C.evaluate(L.payload); if (!r.legacy) C.save(a.args[0], L); return r; },
    print: (d, a, h) => { if (d.legacy) { console.log(h.c.dim(`  ${d.why}`)); return; } for (const p of d.problems || []) console.log(h.c.amber(`  ! ${p}`)); for (const g of d.gates) console.log(`  ${(g.status === 'PASSED' ? h.c.mint : g.status === 'READY' ? (x) => x : h.c.amber)(g.status.padEnd(8))} ${g.id.padEnd(16)} ${h.c.dim(g.type)}${g.reasons.length ? h.c.dim(`  — ${g.reasons.join('; ')}`) : ''}`); console.log(`  ${d.complete ? h.c.mint('complete') : h.c.amber('not complete')}: ${d.why.join('; ')}`); } },
  // §0.60.157 GM4 — the node lattice (intelligence): every data node of every system, edges typed
  { key: 'lattice.neighbours', repo: false, usage: 'lattice neighbours <node-id | words> [--kinds=causal,reference,temporal] [--window=ms] [--limit=n]', about: 'the nodes joined to a node (or to what the words find), each edge typed — causal, wire, reference, or temporal (when they happened, never a cause)',
    need: (a) => (a.args.length ? null : '<node-id | words>'),
    req: (a) => { const q = a.args.join(' '); return { system: 'intelligence', method: 'POST', path: '/api/intelligence/lattice/neighbours', timeoutMs: 60000,
      body: { ...(/\s/.test(q) ? { text: q } : { node: q, text: q }), ...(a.flags.kinds ? { kinds: String(a.flags.kinds).split(',').map(x => x.trim()) } : {}), ...(a.flags.window ? { window: parseInt(a.flags.window, 10) } : {}), ...(a.flags.limit ? { limit: parseInt(a.flags.limit, 10) } : {}) } }; },
    print: (d, a, h) => {
      console.log(`  ${h.c.mint(`${d.neighbours.length} neighbour(s)`)} of ${d.seeds.length} seed(s)${h.c.dim(`  · lattice ${d.stats.nodes} nodes, ${d.stats.edges.reference} reference / ${d.stats.edges.causal} causal / ${d.stats.edges.wire} wire edges`)}`);
      for (const n of d.neighbours) console.log(`  ${h.c.dim(`[${n.kind} ${n.score}]`)} ${n.key}  ${h.c.dim(String(n.text).slice(0, 100))}`);
      for (const f of d.stats.systems.failed) console.log(h.c.amber(`  ✗ ${f.system}: ${f.why}`));
    } },
  { key: 'lattice.nodes', repo: false, usage: 'lattice nodes', about: 'the node lattice: how many nodes and edges of each kind, which systems were read and which could not be',
    req: () => ({ system: 'intelligence', method: 'GET', path: '/api/intelligence/lattice/nodes' }),
    print: (d, a, h) => { console.log(`  ${d.nodes} nodes · edges ${JSON.stringify(d.edges)} · ${d.timed} with their own time · ${d.dangling} causes naming no node`); console.log(h.c.dim(`  read: ${d.systems.read.join(', ')}`)); for (const f of d.systems.failed) console.log(h.c.amber(`  ✗ ${f.system}: ${f.why}`)); } },
  // §0.60.156 GM5 — the context stream: every source in lib/context-sources.js asked at once; what none covered is named
  { key: 'context.find', repo: false, usage: 'context find <text> [--need=a|b|c] [--repo=<uuid>] [--gate=<map::phase::brick>] [--sources=atlas,vector]', about: 'what Nexus already holds for a request — every context source asked at once (non-linear), each piece with its source and kind; the need nothing covered is named, and is all a build would be asked',
    need: (a) => (a.args.length || a.flags.need ? null : '<text>'),
    req: (a) => ({ method: 'POST', path: a.flags.repo ? `/api/repos/${encodeURIComponent(a.flags.repo)}/context/find` : '/api/context/find', timeoutMs: 60000,
      body: { text: a.args.join(' '), ...(a.flags.need ? { need: String(a.flags.need).split('|').map(x => x.trim()).filter(Boolean) } : {}), ...(a.flags.gate ? { gate: String(a.flags.gate) } : {}), ...(a.flags.sources ? { sources: String(a.flags.sources).split(',').map(x => x.trim()).filter(Boolean) } : {}) } }),
    print: (d, a, h) => {
      console.log(`  ${h.c.mint(`${d.pieces.length} piece(s)`)} · covered ${d.covered.length}/${d.request.need.length}${d.residue.need.length ? h.c.amber(` · not found: ${d.residue.need.join(' · ')}`) : ''}`);
      for (const p of d.pieces.slice(0, 15)) console.log(`  ${h.c.dim(`[${p.from} ${p.kind} ${p.score.toFixed(2)}]`)} ${p.id}  ${h.c.dim(p.text.replace(/\s+/g, ' ').slice(0, 140))}`);
      for (const f of d.residue.failed) console.log(h.c.amber(`  ✗ ${f.source}: ${f.why}${f.phase ? ` (built by ${f.phase})` : ''}`));
      if (d.residue.absent.length) console.log(h.c.dim(`  asked, nobody home: ${d.residue.absent.join(', ')}`));
    } },
  { key: 'context.sources', repo: false, usage: 'context sources', about: 'the context stream\'s sources: each row\'s signature, system, cost (free | model | build) and kinds — joining is a row, never a line in the finder',
    req: () => ({ method: 'GET', path: '/api/context/sources' }),
    print: (d, a, h) => { for (const r of d.sources) console.log(`  ${r.signature.padEnd(12)} ${r.system.padEnd(13)} ${r.cost.padEnd(6)} ${h.c.dim((r.kinds || []).join(','))}${r.phase ? h.c.amber(`  (built by ${r.phase})`) : ''}  ${h.c.dim(r.about || '')}`); } },
  { key: 'contract.packet', repo: false, usage: 'contract packet <file.contract> <gate>', about: 'the smallest context one gate needs (its refs resolved, upstream evidence, its gaps) — what an agent is handed',
    need: (a) => (a.args.length >= 2 ? null : '<file.contract> <gate>'),
    local: (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); return C.packet(C.load(a.args[0]).payload, a.args[1]); },
    print: (d) => console.log(require('../../lib/node-export.js').toYaml ? JSON.stringify(d, null, 1) : d) },
  { key: 'contract.check', repo: false, usage: 'contract check <file.contract> <gate>', about: 'verify one gate now against real evidence and record the result (missing proof is never a pass)',
    need: (a) => (a.args.length >= 2 ? null : '<file.contract> <gate>'),
    local: async (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const L = C.load(a.args[0]); const r = await C.check(L.payload, a.args[1]); C.save(a.args[0], L); return r; },
    print: (d, a, h) => { console.log(`  ${d.status === 'PASSED' ? h.c.mint('PASSED') : h.c.amber(d.status)}`); for (const e of d.evidence || []) console.log(h.c.dim(`    ✓ ${JSON.stringify(e)}`)); for (const r of d.reasons || []) console.log(h.c.amber(`    ✗ ${r}`)); } },
  { key: 'contract.evidence', repo: false, usage: 'contract evidence <file.contract> <key> <value…>', about: 'record evidence a gate condition reads ({ evidence: key }) — who and when are kept',
    need: (a) => (a.args.length >= 3 ? null : '<file.contract> <key> <value>'),
    local: (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const L = C.load(a.args[0]); const r = C.record(L.payload, a.args[1], a.args.slice(2).join(' '), { by: a.flags.by || 'cli' }); C.save(a.args[0], L); return r; },
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.key} = ${d.value}`) },
  // 0.60.16 CT1 — dynamic chunking: a piece too big for its agent, or failing, splits; Nexus learns each agent's size
  { key: 'contract.split', repo: false, usage: 'contract split <file.contract> <gate> [--by requires|actions] [--agent name] [--budget tokens] [--force]', about: 'split a gate into child gates — when it is too big for the agent (its learned budget) or has failed twice; --force splits anyway',
    need: (a) => (a.args.length >= 2 ? null : '<file.contract> <gate>'),
    local: (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const L = C.load(a.args[0]); const s = C.shouldSplit(L.payload, a.args[1], { agent: a.flags.agent || null, budget: a.flags.budget ? Number(a.flags.budget) : null }); if (!s.split && !a.flags.force) return { split: false, why: s.why }; const into = C.split(L.payload, a.args[1], { by: a.flags.by || null }); C.save(a.args[0], L); return { split: true, why: s.split ? s.why : 'forced', into }; },
    print: (d, a, h) => console.log(d.split ? `${h.c.mint('✓')} split into ${d.into.join(', ')} — ${d.why}` : h.c.dim(`  not split: ${d.why}`)) },
  { key: 'contract.budget', repo: false, usage: 'contract budget <agent> [kind]', about: 'how big a piece this agent passes reliably, learned from every contract check (null while untried)',
    need: (a) => (a.args.length ? null : '<agent>'),
    local: (a) => ({ agent: a.args[0], kind: a.args[1] || null, budget: require('../../cortex/core/raid/contract-gates.js').Boundaries.budget(a.args[0], a.args[1] || null) }),
    print: (d, a, h) => console.log(d.budget ? `  ${d.agent}${d.kind ? ` · ${d.kind}` : ''}: ~${d.budget} tokens per piece` : h.c.dim(`  ${d.agent}: not enough checks yet to learn a size`)) },
  // 0.60.17 SC0 — the scheduler: every READY brick (independent ones at once) through the agent tools registry
  { key: 'contract.run', repo: false, usage: 'contract run <file.contract> [--concurrency n]', about: 'run every READY brick — independent ones at the same time — through the agent tools (copilot, Clear Glass automation and macros, pipelines, nexus.command); check each; repeat until nothing is ready',
    need: (a) => (a.args.length ? null : '<file.contract>'),
    local: async (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const L = C.load(a.args[0]); const r = await C.schedule(L.payload, { concurrency: Number(a.flags.concurrency) || 4 }); C.save(a.args[0], L); return r; },
    print: (d, a, h) => { for (const l of d.log || []) console.log(`  r${l.round} ${(l.status === 'PASSED' ? h.c.mint : h.c.amber)(String(l.status).padEnd(7))} ${l.gate}${(l.reasons || []).length ? h.c.dim(`  — ${l.reasons.join('; ')}`) : ''}`); for (const w of d.waiting || []) console.log(h.c.dim(`  waiting ${w.id}: ${w.why}`)); for (const w of d.blocked || []) console.log(h.c.amber(`  blocked ${w.id}: ${w.why}`)); console.log(`  ${d.complete ? h.c.mint('complete') : h.c.amber('not complete')}: ${(d.why || []).join('; ')}`); } },
  { key: 'contract.status', repo: false, usage: 'contract status <file.contract>', about: 'complete or not, and exactly why — derived from the gates, gaps and invariants',
    need: (a) => (a.args.length ? null : '<file.contract>'),
    local: (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const L = C.load(a.args[0]); const r = C.evaluate(L.payload); return { legacy: r.legacy, complete: r.complete, why: r.why, problems: r.problems, passed: r.gates.filter(g => g.status === 'PASSED').length, total: r.gates.length }; },
    print: (d, a, h) => { if (d.legacy) { console.log(h.c.dim('  v1 contract — RAID runs it as before')); return; } console.log(`  ${d.complete ? h.c.mint('complete') : h.c.amber('not complete')} · ${d.passed}/${d.total} gates passed`); for (const w of d.why) console.log(h.c.dim(`    ${w}`)); } },
  // 0.60.18 EX0 — the record of a build: every brick (who ran it, attempts), every dependency, checkpoint and gate
  { key: 'contract.audit', repo: false, usage: 'contract audit <file.contract>', about: 'every brick (its agent, attempts, verification), every dependency edge, every checkpoint and every gate — the auditable record of a contract run',
    need: (a) => (a.args.length ? null : '<file.contract>'),
    local: (a) => { const C = require('../../cortex/core/raid/contract-gates.js'); const L = C.load(a.args[0]); return require('../../cortex/core/raid/contract-adapters.js').audit(L.payload); },
    print: (d, a, h) => { for (const b of d.bricks) console.log(`  ${(b.status === 'PASSED' ? h.c.mint : h.c.amber)(String(b.status).padEnd(7))} ${b.id}${b.file ? h.c.dim(` ${b.file}`) : ''}${b.agent ? h.c.dim(` · ${b.agent}`) : ''}${b.attempts ? h.c.dim(` · ${b.attempts} attempt(s)`) : ''}${b.blocked ? h.c.amber(` · ${b.blocked}`) : ''}`); console.log(h.c.dim(`  ${d.dependencies.length} dependencies · ${d.checkpoints.length} checkpoints · ${d.gates.length} gates`)); console.log(`  ${d.complete ? h.c.mint('complete') : h.c.amber('not complete')}: ${(d.why || []).join('; ')}`); } },
  // 0.60.39 GS1 — --gate <id>: that gate now against what passed (the evaluator's reasons, the commit it passed at, the diff since)
  { key: 'repo.contract', repo: true, usage: 'repo contract <repo> <phase> [--map name] [--gate id] [--trace]', about: 'a phase build\'s contract, audited: every brick (its agent, attempts, verification, the commit it passed at, a rewind), every dependency, checkpoint and gate; --gate compares one gate now against what passed',
    need: (a) => (a.args.length ? null : '<phase>'),
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/contract?phase=${encodeURIComponent(a.args[0])}${a.flags.map ? `&map=${encodeURIComponent(a.flags.map)}` : ''}${a.flags.gate ? `&gate=${encodeURIComponent(a.flags.gate)}` : ''}${a.flags.trace ? '&trace=1' : ''}` }),
    // 0.60.75 GW3 --trace: the contract end to end, oldest first, then each brick and every hole in the record
    print: (d, a, h) => { if (d.trace) { for (const l of d.lines || []) console.log(`  ${l}`); console.log(''); for (const b of d.trace.bricks) console.log(`  ${(b.status === 'PASSED' ? h.c.mint : h.c.amber)(String(b.status).padEnd(7))} ${b.id}${b.files.length ? h.c.dim(` ${b.files.join(', ')}`) : ''}${b.agents.length ? h.c.dim(` · ${b.agents.join(', ')}`) : ''}${b.commits.length ? h.c.dim(` · @${b.commits.map(c => String(c).slice(0, 12)).join(' @')}`) : ''}`); for (const x of d.trace.holes) console.log(`  ${h.c.amber('hole')} ${x.gate}: ${x.what}`); if (!d.trace.holes.length) console.log(h.c.dim('  no holes in the record')); return; }
      if (d.compare) { const c = d.compare; console.log(`  ${c.gate}: ${c.stale ? h.c.amber('STALE') : c.status}${c.commit ? h.c.dim(`  passed at ${c.commit}`) : h.c.dim('  no commit recorded')}`); for (const r of c.reasons || []) console.log(h.c.dim(`    · ${r}`)); for (const [f, dd] of Object.entries(c.diff || {})) { console.log(`  ${f}`); const pt = dd && dd.files && dd.files[0]; console.log(h.c.dim(pt && pt.patch ? String(pt.patch).split('\n').slice(0, 30).join('\n') : (dd && dd.error) || '    no change since it passed')); } return; } const au = d.audit; for (const b of au.bricks) console.log(`  ${(b.status === 'PASSED' ? h.c.mint : h.c.amber)(String(b.status).padEnd(7))} ${b.file || b.id}${b.agent ? h.c.dim(` · ${b.agent}`) : ''}${b.attempts ? h.c.dim(` · ${b.attempts} attempt(s)`) : ''}${b.tag ? h.c.dim(` · ${b.tag}`) : ''}${b.class && b.status !== 'PASSED' ? h.c.amber(` · ${b.class}`) : ''}${b.blocked ? h.c.amber(` · ${b.blocked}`) : ''}`); if (d.progress) console.log(h.c.dim(`  progress: ${d.progress.passed}/${d.progress.total} passed · ${d.progress.moves} moves${d.progress.last ? ` · last ${d.progress.last.gate} ${d.progress.last.status}` : ''}`)); console.log(h.c.dim(`  ${au.dependencies.length} dependencies · ${au.checkpoints.length} checkpoints · ${au.gates.length} gates · ${d.file}`)); console.log(`  ${au.complete ? h.c.mint('complete') : h.c.amber('not complete')}: ${(au.why || []).join('; ')}`); } },
  // 0.60.172 DG3 — James: "every phasemap phase needs extensive dag, that needs to start being standard."
  { key: 'repo.phases.dag', repo: true, usage: 'repo dag <repo> [phase] [--map path] [--cross]', about: "the whole dependency DAG of the repo's phasemaps (cycles, dangling depends_on, phases with no depends_on line, layers, ready, critical path, file conflicts) — or one phase's place in it",
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/dag?${a.args[0] ? `phase=${encodeURIComponent(a.args[0])}&` : ''}${a.flags.map ? `map=${encodeURIComponent(a.flags.map)}&` : ''}${a.flags.cross ? 'cross=1' : ''}` }) },
  // 0.60.190 APV3/APV4 — James: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log when approved. what about an api route or the pulse emission system"
  { key: 'repo.changelog', repo: true, usage: 'repo changelog <repo> [--limit n] [--all]', about: "the repo's change log: each Versionium commit with the change-log entries it carries — the phase, why, files ±, who proposed, who approved, the run and who started it (--all: commits with no approval too)",
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/changelog?limit=${encodeURIComponent(a.flags.limit || 20)}${a.flags.all ? '&all=1' : ''}` }),
    print: (d, a, h) => { if (!d.rows.length) { console.log(h.c.gray('  no approved change committed yet')); return; } for (const r of d.rows) { console.log(`  ${h.c.amber(String(r.commitId).slice(0, 12))} ${h.c.dim(new Date(r.ts).toISOString().slice(0, 16).replace('T', ' '))}  ${r.entries.length ? '' : r.message}`); for (const e of r.entries) console.log(`    ${e.status === 'reverted' ? h.c.coral('↺') : h.c.mint('✓')} ${e.title}${e.run ? h.c.dim(`  · run ${String(e.run).slice(0, 14)}${e.startedBy ? ` by ${e.startedBy.who}` : ''}`) : ''}`); } } },
  { key: 'ledger.out', usage: 'ledger out', about: "what Idearium sent to the orchestrator's ledger (the pulse/event spine): sent, buffered while it was down, drained since, failed, the last error",
    req: () => ({ method: 'GET', path: '/api/ledger/out' }),
    print: (d, a, h) => { console.log(`  sent ${d.sent} · buffered ${d.buffered} · drained ${d.drained} · failed ${d.failed}${d.lastType ? h.c.dim(` · last ${d.lastType}`) : ''}`); if (d.lastError) console.log(h.c.amber(`  last error: ${d.lastError}`)); } },
  // 0.60.188 CNS1 — James: "It built 5 phases in a row. I think I see what you mean but there are way more idearium phases than that." · "go ahead with the census"
  // SL0 0.60.222 — James: "we need this to work so it can start building itself." What can be built now, and why the rest cannot
  { key: 'phases.next', usage: 'phases next [--limit n] [--group decision|deps-open|cycle|dangling|no-files|done-by-evidence|held|conflict]', about: "Nexus's phases that can be built now, in order (DAG layer, then how many wait on each), and every other open phase in one group with why and what would unblock it",
    req: (a) => ({ method: 'GET', path: `/api/phases/next?limit=${parseInt(a.flags.limit, 10) || 20}${a.flags.group ? `&group=${encodeURIComponent(String(a.flags.group))}` : ''}` }),
    print: (d, a, h) => { if (a.flags.group) { for (const b of d.blocked || []) console.log(`  ${b.id}  ${h.c.dim(b.map.split('/').pop())}\n    ${b.why} → ${b.unblock}`); return; } for (const l of d.lines || []) console.log(/^blocked|^said/.test(l) ? h.c.dim(l) : l); } },
  { key: 'repo.next', repo: true, usage: 'repo next <repo> [--limit n] [--group …]', about: "a repo's phases that can be built now, in order, and why the rest cannot",
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/next?limit=${parseInt(a.flags.limit, 10) || 20}${a.flags.group ? `&group=${encodeURIComponent(String(a.flags.group))}` : ''}` }),
    print: (d, a, h) => { if (a.flags.group) { for (const b of d.blocked || []) console.log(`  ${b.id}\n    ${b.why} → ${b.unblock}`); return; } for (const l of d.lines || []) console.log(/^blocked|^said/.test(l) ? h.c.dim(l) : l); } },
  { key: 'repo.closes', repo: true, usage: 'repo closes <repo>', about: 'the phases its proven, landed runs closed by themselves (SL1), each with the run and version; reopened ones say which change was undone',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/closes` }),
    print: (d) => { console.log(`${d.open} closed · ${d.reopened} reopened`); for (const c of d.closes || []) console.log(`  ${c.reopenedAt ? '↺' : '✓'} ${c.phase}  ${c.reopenedAt ? c.reopenNote : c.note}`); } },
  { key: 'repo.close', repo: true, usage: 'repo close <repo> <runId>', about: "check one run again: its phase closes if the run is proven and every change of it is applied; else says what it waits on",
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/phases/close`, body: { runId: a.args[0] } }),
    print: (d) => { console.log(d.closed ? `closed: ${d.record.phase} — ${d.record.note}` : `not closed: ${d.why}`); for (const w of d.waiting || []) console.log(`  waits on ${w}`); } },
  { key: 'repo.evidence', repo: true, usage: 'repo evidence <repo> [--apply] [--limit n] [--map <path>]', about: "the open phases whose every file exists, judged by their own tests (or tests specific to their files): a dry run lists what would close; --apply closes them (SL2)",
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/phases/evidence`, body: { apply: !!a.flags.apply, limit: parseInt(a.flags.limit, 10) || 10, ...(a.flags.map ? { map: String(a.flags.map) } : {}) } }),
    print: (d) => { console.log(`${d.dryRun ? 'dry run — ' : ''}${d.checked} checked · ${(d.dryRun ? d.wouldClose : d.closed).length} ${d.dryRun ? 'would close' : 'closed'} · ${d.ran.length} test(s) ran`); for (const c of d.dryRun ? d.wouldClose : d.closed) console.log(`  ✓ ${c.phase}  ${c.note}`); for (const o of (d.open || []).filter(x => x.failed)) console.log(`  ✗ ${o.id}  ${o.why}`); } },
  { key: 'phases.census', usage: 'phases census [--system idearium] [--open]', about: "every phase of Nexus's phasemaps judged against its evidence (commits that name it and touched its code, release lines, its files, its proof's tests and ids): done, partly, mentioned, not-built, no-files, deferred, superseded — and the open ones bottom-up. Deterministic, no model",
    req: (a) => ({ method: 'GET', path: `/api/phases/census?system=${encodeURIComponent(a.flags.system || 'idearium')}` }),
    print: (d, a, h) => { console.log(`  ${d.total} phases · ${Object.entries(d.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}${d.shallow ? h.c.amber(' · SHALLOW history') : ''}`); if (a.flags.open) d.order.forEach((k, i) => console.log(h.c.dim(`  ${String(i + 1).padStart(3)}. ${k.replace(/^docs\//, '')}`))); else console.log(h.c.dim(`  ${d.order.length} open, bottom-up: --open lists them · docs/idearium-phase-census.md is the full table`)); } },
  // §0.60.173 UP3 — James: "upload zip with an intent, have it map to nexus using a tool, then ask me with the option to edit the location"
  { key: 'repo.upload', repo: true, usage: 'repo upload <repo> <zip> --intent "what these files are for"', about: 'upload a zip into a repo with an intent: every file is placed against the repo (its folders, its systems, who requires what, his earlier answers) and the upload WAITS for his answer — nothing is written yet',
    need: (a) => (!a.args.length ? '<zip>' : !a.flags.intent ? '--intent "what these files are for"' : null),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/uploads`, body: { name: require('path').basename(a.args[0]), intent: String(a.flags.intent), contentBase64: require('fs').readFileSync(a.args[0]).toString('base64') } }),
    print: (d, a, h) => _printUpload(d, h) },
  { key: 'repo.uploads', repo: true, usage: 'repo uploads <repo> [upload-id]', about: 'the uploads waiting for his answer (and the answered ones), or one upload with every file\'s proposed place, why, its system and registry neighbours',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/uploads${a.args[0] ? `/${encodeURIComponent(a.args[0])}` : ''}` }),
    print: (d, a, h) => { if (d.plan) return _printUpload(d, h); for (const u of d.uploads || []) console.log(`  ${u.state === 'needs-you' ? h.c.amber('⚑ needs you') : h.c.dim('answered  ')}  ${u.uuid}  ${u.name}  ${h.c.dim(`${(u.stats && u.stats.files) || 0} file(s) · "${u.intent}"`)}`); if (!(d.uploads || []).length) console.log(h.c.dim('  (no uploads)')); if ((d.rules || []).length) console.log(h.c.dim(`  learned from his answers: ${d.rules.length} rule(s)`)); } },
  { key: 'repo.upload-answer', repo: true, usage: 'repo upload-answer <repo> <upload-id> [--to "from=path,from=path"] [--skip "from,from"] [--no-apply]', about: 'his answer to an upload: keep the proposed places, move files (--to), skip some (--skip); only then is anything written (text through the proposal door, binaries through the source layer). His moves are learned',
    need: (a) => (a.args.length ? null : '<upload-id>'),
    req: (a) => { const rows = []; for (const kv of String(a.flags.to || '').split(',').map(s => s.trim()).filter(Boolean)) { const i = kv.indexOf('='); if (i > 0) rows.push({ from: kv.slice(0, i), to: kv.slice(i + 1) }); }
      for (const f of String(a.flags.skip || '').split(',').map(s => s.trim()).filter(Boolean)) rows.push({ from: f, skip: true });
      return { method: 'POST', path: `/api/repos/${a.repo.uuid}/uploads/${encodeURIComponent(a.args[0])}/answer`, body: { rows, apply: !a.flags['no-apply'] } }; },
    print: (d, a, h) => { console.log(`  ${h.c.mint(`${d.written} written`)} · ${(d.skipped || []).length} skipped${(d.errors || []).length ? ` · ${h.c.coral(`${d.errors.length} failed`)}` : ''}`); for (const r of d.results || []) console.log(`  ${r.ok ? '✓' : h.c.coral('✗')} ${r.from} → ${r.to}${r.edited ? h.c.dim(' (his path)') : ''}${r.error ? h.c.coral(`  ${r.error}`) : r.note ? h.c.dim(`  ${r.note}`) : ''}`); for (const s of d.skipped || []) console.log(h.c.dim(`  – ${s.from}: ${s.why}`)); } },
  // 0.60.29 PM — James: "All the phases need to be mapped to files and dependencies. With nexus and all projects."
  { key: 'repo.map-phases', repo: true, usage: 'repo map-phases <repo> [status] [--limit n] [--no-apply] [--done] [--untrusted]', about: 'map every phase that names no files to its files (an agent, scored first on phases whose files are known) and every phase to its dependencies (from the files); written into the phasemaps where missing',
    req: (a) => (a.args[0] === 'status' ? { method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/map` }
      : { method: 'POST', path: `/api/repos/${a.repo.uuid}/phases/map`, body: { limit: Number(a.flags.limit) || 0, apply: !a.flags['no-apply'], includeDone: !!a.flags.done, applyUntrusted: !!a.flags.untrusted } }),
    print: (d, a, h) => {
      if (a.args[0] === 'status') { console.log(d.running ? h.c.amber(`  running — ${d.progress ? `${d.progress.step} ${d.progress.done}/${d.progress.of}` : 'starting'}`) : '  not running'); if (d.report) console.log(`  ${d.report.line}`); if (d.report && (d.report.skipped || []).length) console.log(h.c.dim(`  skipped: ${d.report.skipped.slice(0, 5).join(' · ')}`)); return; }
      console.log(h.c.mint(`  started on ${d.maps} map(s) — repo map-phases <repo> status shows its progress`));
    } },
  // 0.60.67 SF4 — James: "need the agents to use the spec compiler? like the yaml."
  { key: 'repo.compile-spec', repo: true, usage: 'repo compile-spec <repo> <path.spec> [--into folder] [--template genesis|compiler|<id>]', about: 'lay out a .spec in the compiler\'s format from its template — genesis by default (the nexus-system skeleton, the spec\'s modules slotted in as components), or the compiler\'s TypeScript scaffold; every file is a proposed .inject, nothing existing is overwritten, component files are listed to build',
    need: (a) => (a.args.length ? null : '<path.spec>'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/specs/compile`, body: { path: a.args[0], ...(a.flags.into != null ? { into: String(a.flags.into) } : {}), ...(a.flags.template ? { template: String(a.flags.template) } : {}) } }),
    print: (d, a, h) => {
      console.log(h.c.mint(`  ${d.template || 'genesis'}: ${d.proposed.length} file(s) proposed`)); for (const p of d.proposed) console.log(`    + ${p.path}  ${h.c.dim(p.uuid)}`);
      if ((d.toBuild || []).length) { console.log(`  ${d.toBuild.length} to build`); for (const x of d.toBuild) console.log(`    · ${x.path}  ${h.c.dim(String(x.purpose || '').slice(0, 140))}`); }
      if (d.skipped.length) { console.log(h.c.amber(`  ${d.skipped.length} skipped`)); for (const x of d.skipped) console.log(`    - ${x.path}  ${h.c.dim(x.why)}`); }
    } },
  // §0.60.123 PP1/PP2 — the plan as the Plan panel shows it: each phase's pieces (its progress), or one phase's runs and their logs
  { key: 'repo.plan', repo: true, usage: 'repo plan <repo> [phase] [--map name]', about: 'the build plan: each phase with its pieces (one per planned file: pending, running, written, failed, proven) — or one phase with every run and its log',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/plan${a.flags.map ? `?map=${encodeURIComponent(a.flags.map)}` : ''}` }),
    print: (d, a, h) => {
      const glyph = { pending: '·', running: '◌', written: '◆', failed: '✗', proven: '✓', done: '✓' };
      const steps = (d.steps || []).filter(s => !a.args[0] || s.key === a.args[0] || String(s.key).startsWith(`${a.args[0]}_`));
      for (const s of steps) {
        const pcs = s.pieces || [];
        console.log(`  ${String(s.key).padEnd(28)} ${pcs.map(p => glyph[p.state] || '?').join('')}  ${h.c.dim(`${pcs.filter(p => ['proven', 'done'].includes(p.state)).length}/${pcs.length} pieces · ${s.status}`)}`);
        if (!a.args[0]) continue;
        for (const p of pcs) console.log(h.c.dim(`    ${(glyph[p.state] || '?')} ${p.path} · ${p.state}${p.attempts ? ` · ${p.attempts} attempt(s)` : ''}${p.agent ? ` · ${p.agent}` : ''}${p.uses.length ? ` · uses ${p.uses.join(', ')}` : ''}${p.why ? ` · ${p.why}` : ''}`));
        for (const r of (s.history && s.history.runs) || []) {
          console.log(`    run ${r.runId} · ${new Date(r.startedAt).toLocaleString()} · ${r.end} · ${r.agents.join(', ') || 'no agent'}`);
          for (const l of r.log) console.log(h.c.dim(`      ${new Date(l.ts).toLocaleTimeString()} ${l.part ? `${l.part} ` : ''}${l.state}${l.file ? ` ${l.file}` : ''}${l.provider ? ` · ${l.provider}` : ''}${l.note ? ` — ${l.note}` : ''}`));
        }
      }
    } },
  // 0.60.27 AG1a — "as little as possible", counted: agent calls (plan · code · review), local vs remote, tokens
  { key: 'repo.cost', repo: true, usage: 'repo cost <repo> [phase] [--map name]', about: 'what each phase cost in agent calls and tokens: plan, code and review calls, local vs remote, tokens in and out (estimated), per run',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/cost${a.args[0] ? `?phase=${encodeURIComponent(a.args[0])}${a.flags.map ? `&map=${encodeURIComponent(a.flags.map)}` : ''}` : ''}` }),
    print: (d, a, h) => {
      if (d.cost) { console.log(`  ${d.phase}: ${d.line}`); for (const r of d.cost.runs) console.log(h.c.dim(`    ${r.runId} · ${r.calls} call(s) · ${Object.entries(r.byAgent).map(([k, v]) => `${k} ×${v}`).join(', ')} · ~${r.tokensIn} in / ~${r.tokensOut} out`)); if (d.cost.method) console.log(h.c.dim(`  tokens: ${d.cost.method}`)); return; }
      console.log(`  all phases: ${d.line}`); for (const p of d.phases) console.log(`  ${String(p.phase).padEnd(12)} ${h.c.dim(p.line)}`);
    } },
  // 0.60.141 TF2 — the routing policy and its switches (Settings → Routing): agents read and set what a person does, e.g.
  // `system routing test_first prefer` (James: "needs to build a test first then use that to shape expectation and conditions.")
  { key: 'system.routing', repo: false, usage: 'system routing [<key> <value>]', about: 'the build routing policy (planner, contract_build, test_first, ladder…), or set one switch: routing.<key> = <value>',
    req: (a) => (a.args[0] ? { method: 'POST', path: '/api/config', body: { key: `routing.${String(a.args[0]).replace(/^routing\./, '')}`, value: a.args.slice(1).join(' '), actor: 'command' } } : { method: 'GET', path: '/api/routing' }),
    print: (d, a, h) => {
      if (a.args[0]) { console.log(`  routing.${String(a.args[0]).replace(/^routing\./, '')} = ${a.args.slice(1).join(' ')} ${h.c.dim('saved')}`); return; }
      const p = (d && (d.policy || (d.data && d.data.policy))) || {};
      for (const [k, v] of Object.entries(p)) if (v == null || typeof v !== 'object') console.log(`  ${String(k).padEnd(22)} ${v}`);
    } },
  // 0.60.20 — lean mode, the same switch as Idearium → Settings → Routing (every agent has it through nexus.command)
  // 0.60.126 DB1 — the crossings between systems: what the drawbridge must become the only way for (docs/2026-10-17-system-drawbridge-phasemap.spec)
  // 0.60.134 — the template for each system's COS compartment, held by loom (reached through loom's own routes)
  { key: 'system.compartment', repo: false, usage: 'system compartment [<system>] [--apply]', about: 'each system\'s COS compartment from loom\'s template (nexus-self-<system>): its intent (end state: sovereign; conditions; the genesis axioms), runtime, mounts (its folder, the kernel read-only), drawbridge, store, and its seal — ready only when it is sovereign; --apply writes the intents onto the compartments COS holds',
    req: (a) => (a.flags && a.flags.apply ? { system: 'loom', method: 'POST', path: '/api/compartments/apply', body: a.args[0] ? { system: a.args[0] } : {} } : { system: 'loom', method: 'GET', path: a.args[0] ? `/api/compartments/${encodeURIComponent(a.args[0])}` : '/api/compartments' }),
    print: (d, a, h) => {
      if (d.results) { for (const r of d.results) console.log(`  ${(r.ok ? h.c.mint('applied') : h.c.amber('not yet'))} ${String(r.system).padEnd(16)} ${h.c.dim(r.compartment || '')} ${h.c.dim(r.said || r.error || (r.seal ? 'seal ready' : 'seal open'))}`); return; }
      const one = (m) => console.log(`  ${(m.seal.ready ? h.c.mint('ready ') : h.c.amber('open  '))} ${m.system.padEnd(16)} ${h.c.dim(m.cos.name)}  ${h.c.dim(m.seal.why)}${m.live ? h.c.dim(m.live.exists ? ' · in COS' : ' · ' + m.live.said) : ''}`);
      if (d.compartments) { d.compartments.forEach(one); console.log(h.c.dim(`  ready to move in: ${(d.ready || []).join(', ') || '—'}`)); return; }
      one(d); for (const c of [...d.cos.intent.endState, ...d.cos.intent.conditions]) console.log(h.c.dim(`    ${c.says}`)); for (const m of d.mounts) console.log(h.c.dim(`    mount ${m.mode} ${m.path} — ${m.why}`));
    } },
  // 0.60.138 — "the diagnostic needs to be a real system matching genasis": does each system match genesis, role by role
  { key: 'system.shape', repo: false, usage: 'system shape [<system>]', about: 'does each system match genesis (the skeleton cos/archetype/nexus-system): every role — entry, cli, config, compartment, registry, contract, events, schemas, spec, node taxonomy, handshake, tests, its nodes — filled by its own file or by the kernel (store, node index, listener, heartbeat, boundary), or missing',
    req: (a) => ({ method: 'GET', path: `/api/system/shape${a.args[0] ? `?system=${encodeURIComponent(a.args[0])}` : ''}` }),
    print: (d, a, h) => {
      if (d.roles) { console.log(`  ${d.system} · ${d.matches ? h.c.mint('matches genesis') : h.c.amber(`missing ${d.missing.length}`)} · ${d.own} own · ${d.kernel} from the kernel`); for (const r of d.roles) console.log(`  ${(r.status === 'missing' ? h.c.amber : r.status === 'own' ? h.c.mint : h.c.dim)(r.status.padEnd(8))} ${r.role.padEnd(14)} ${h.c.dim(r.file || r.want || '')}`); return; }
      for (const s of d.systems || []) console.log(`  ${(s.matches ? h.c.mint('matches  ') : h.c.amber('missing ' + s.missing.length))} ${s.system.padEnd(16)} ${h.c.dim(s.missing.join(' '))}`);
      console.log(h.c.dim(`  matching genesis: ${(d.matches || []).join(', ') || '—'}`));
    } },
  // 0.60.133 IM1 — "need to get the systems soveriegn again": which systems are, and what stands in each one's way
  { key: 'system.sovereign', repo: false, usage: 'system sovereign [<system>]', about: 'which systems are sovereign (nothing they require is in another system\'s folder; lib/ is the kernel) and, for each that is not, what is in the way: its data kept in cortex\'s store, a shared primitive in another system, or another system\'s capability required as a file',
    req: (a) => ({ method: 'GET', path: `/api/system/sovereign${a.args[0] ? `?system=${encodeURIComponent(a.args[0])}` : ''}` }),
    print: (d, a, h) => {
      for (const r of d.systems || []) {
        console.log(`  ${(r.sovereign ? h.c.mint('sovereign') : h.c.amber('not yet  '))} ${r.system.padEnd(16)} ${h.c.dim(`out ${r.out} · in ${r.in} · kernel ${r.kernel}`)}${r.sovereign ? '' : h.c.dim(`  — data ${r.blockers.data} · primitive ${r.blockers.primitive} · capability ${r.blockers.capability}`)}`);
        if (r.list) for (const [k, xs] of Object.entries(r.list)) for (const x of xs) console.log(h.c.dim(`      ${k.padEnd(10)} ${x.from} → ${x.to}`));
      }
      console.log(h.c.dim(`  ${(d.sovereign || []).length} sovereign: ${(d.sovereign || []).join(', ') || '—'}`));
    } },
  // 0.60.130 P33a — a system's own node database: each index with all its history
  // 0.60.207 DL2 — James: "start the data migration … make each system responsible for it's own data." Where each system's data
  // lives, what still waits in the root data/ (code still naming the path, or his call), and bringing it home (rollback-able).
  { key: 'data.home', repo: false, usage: 'data home [<system>] [--apply]', about: 'each system\'s own data: where it lives and what of it still waits in the root data/ (and why); with a system, each file\'s plan; --apply brings it home now (manifest, hashes, rollback-able)',
    req: (a) => (!a.args[0] ? { method: 'GET', path: '/api/data/home', timeoutMs: 120000 }
      : a.flags.apply ? { method: 'POST', path: `/api/data/home/${encodeURIComponent(a.args[0])}`, timeoutMs: 300000, body: {} }
      : { method: 'GET', path: `/api/data/home/${encodeURIComponent(a.args[0])}`, timeoutMs: 120000 }),
    print: (d, a, h) => {
      if (d.systems) {
        console.log(`  root data/: ${d.present ? `${d.files} file(s), ${d.unowned} with no owner or his call` : h.c.mint('gone')}`);
        for (const s of d.systems) { const p = s.pending || {}; const n = (k) => p[k] || 0;
          console.log(`  ${String(s.system).padEnd(14)} ${String(s.dir || '').padEnd(24)} ${n('planned') ? h.c.amber(`${n('planned')} ready`) : ''} ${n('skipped-refs') ? `${n('skipped-refs')} wait for rewiring` : ''} ${n('ask') ? `${n('ask')} his call` : ''}${s.last ? h.c.dim(` · last ${new Date(s.last.at).toLocaleString()}: moved ${s.last.moved}`) : ''}`); }
        const refs = Object.entries(d.refs || {}); if (refs.length) { console.log(h.c.dim('  code still naming root data/ paths:')); for (const [k, v] of refs) console.log(h.c.dim(`    data/${k} — ${v.length}: ${v.slice(0, 4).join(', ')}${v.length > 4 ? ' …' : ''}`)); }
        return;
      }
      if (d.moves) { console.log(`  ${d.system} → ${d.dir}${d.last ? h.c.dim(` · last: ${d.last.said}`) : ''}`); for (const m of d.moves) console.log(`  ${m.status.padEnd(12)} ${m.from}${m.to ? ` → ${m.to}` : ''}${m.status !== 'planned' ? h.c.dim(`  (${m.why})`) : ''}`); if (!d.moves.length) console.log(h.c.mint('  nothing of it in the root data/')); return; }
      console.log(`  ${d.said}`); if (d.manifest) console.log(h.c.dim(`  manifest ${d.manifest} — undo: data rollback ${d.manifest}`));
      for (const c of d.conflicts || []) console.log(h.c.amber(`  conflict ${c.from} → ${c.to}: ${c.why}`)); for (const f of d.failed || []) console.log(h.c.coral(`  failed ${f.from}: ${f.why}`));
    } },
  { key: 'data.rollback', repo: false, usage: 'data rollback <manifest>', about: 'put a bring-home\'s files back where they were, from the manifest it printed',
    req: (a) => ({ method: 'POST', path: '/api/data/rollback', body: { manifest: a.args[0] || '' } }),
    print: (d, a, h) => { console.log(`  ${d.restored} file(s) back from ${d.manifest}`); for (const f of d.failed || []) console.log(h.c.coral(`  ${f.from || f.to}: ${f.why}`)); } },
  { key: 'system.nodes', repo: false, usage: 'system nodes <system> [<type> [<id>]]', about: 'a system\'s own node database (<system>/data/node-index): each node type with its files, its index and its history; with a type, its nodes; with an id, that node and every change it went through',
    req: (a) => ({ method: 'GET', path: `/api/system/nodes/${encodeURIComponent(a.args[0] || '')}${a.args[1] ? `?type=${encodeURIComponent(a.args[1])}${a.args[2] ? `&id=${encodeURIComponent(a.args[2])}` : ''}` : ''}` }),
    print: (d, a, h) => {
      if (d.history) { console.log(`  ${d.system} · ${d.type}/${d.id} ${d.node ? '' : h.c.amber('(not in the index)')}`); for (const x of d.history) console.log(`  ${new Date(x.ts).toLocaleString()}  ${x.action}`); return; }
      if (d.nodes) { for (const n of d.nodes) console.log(`  ${n.id}  ${h.c.dim(n.summary || '')}`); console.log(h.c.dim(`  ${d.nodes.length} ${d.type} node(s) in ${d.system}'s index`)); return; }
      console.log(`  ${d.system} · nodes ${d.nodesDir} · database ${d.store || h.c.amber('none yet')}`); if (d.said) console.log(h.c.amber(`  ${d.said}`));
      for (const [t, v] of Object.entries(d.types || {})) console.log(`  ${t.padEnd(18)} ${String(v.files).padStart(5)} files · ${String(v.indexed).padStart(5)} indexed · ${String(v.history).padStart(6)} history ${v.files !== v.indexed ? h.c.amber('· not all indexed') : ''}`);
    } },
  // 0.60.129 DB17 — "all system relevant files should stay with the system": which files in lib/, hooks/, service/ … belong to one system
  // §FMR2/FMR3 0.60.146 — James: "failure mode report thats also a macro to import into a cos test env." · "do it."
  { key: 'failure.list', repo: false, usage: 'failure list [--open] [--class <fault class>] [--limit n]', about: 'every failure mode Nexus recorded (cortex): what failed, where, how often, whether it has a cause chain and a macro yet',
    req: (a) => ({ system: 'cortex', method: 'GET', path: `/api/failure-modes?limit=${parseInt(a.flags.limit, 10) || 30}${a.flags.open ? '&status=open' : ''}${a.flags.class ? `&class=${encodeURIComponent(String(a.flags.class))}` : ''}` }),
    print: (d, a, h) => { const l = d.failureModes || []; if (!l.length) { console.log(h.c.gray('  no failure modes recorded')); return; }
      for (const f of l) console.log(`  ${h.c.gray(String(f.uuid).slice(0, 8))} ${String(f.faultClass).padEnd(18)} ${f.where || ''} ${h.c.dim(`${f.occurrences}× · ${f.via}${f.hasChain ? ' · chain' : ''}${f.hasMacro ? ' · macro' : ''}`)}${f.occurrences >= 2 ? h.c.amber('  recurring') : ''}`); } },
  { key: 'failure.show', repo: false, usage: 'failure show <id>', about: 'one failure mode as its report: what failed, the conditions that led to it and the holes in that chain, ripple/wave/tidal, sigma, the CFR field, how often and fixes on record, candidate causes with the experiment that separates them, what was on screen (a view, never evidence), the environment, its macro',
    need: (a) => (a.args[0] ? null : '<id>'),
    req: (a) => ({ system: 'cortex', method: 'GET', path: `/api/failure-modes/${encodeURIComponent(a.args[0])}/report` }),
    print: (d, a, h) => { for (const l of d.lines || []) console.log(/: — /.test(l) ? `  ${h.c.dim(l)}` : `  ${l}`); } },
  // §FMR0 0.60.146 — how much of each system's ledger can be walked for a cause (diagnostic/lib/causality.js)
  { key: 'system.causality', repo: false, usage: 'system causality [<system>]', about: 'the share of each system\'s ledger rows that name their cause (causedBy) and how many of those resolve to a row that exists: what a failure report can trace. A share only rises; a fall is named',
    req: (a) => ({ system: 'diagnostic', method: 'GET', path: `/causality${a.args[0] ? `?system=${encodeURIComponent(a.args[0])}` : ''}` }),
    print: (d, a, h) => { for (const l of d.lines || []) console.log(/^FELL/.test(l) ? `  ${h.c.amber(l)}` : `  ${l}`); } },
  { key: 'system.homes', repo: false, usage: 'system homes [<system>]', about: 'files in the shared folders (lib/, hooks/, service/, contracts/ …) that belong to one system: used only by it, or named for it in hooks/ and service/. A census: nothing moves',
    req: (a) => ({ method: 'GET', path: `/api/system/homes${a.args[0] ? `?system=${encodeURIComponent(a.args[0])}` : ''}` }),
    print: (d, a, h) => { console.log(`  ${d.moves} of ${d.files} files in shared folders belong to one system · ${d.unused.length} are required by nothing (by a static path)`); if (!a.args[0]) console.log(h.c.dim(`  ${Object.entries(d.byHome).sort((x, y) => y[1].length - x[1].length).map(([k, v]) => `${k} ${v.length}`).join(' · ')}`)); for (const m of (a.args[0] ? d.list : d.list.slice(0, 25))) console.log(`  ${m.file.padEnd(48)} → ${h.c.mint(m.home)} ${h.c.dim(m.why)}`); } },
  // 0.60.128 DB13 + DB14 — his lib/system-registry.js as the tunnel: through it the CLI, the routes, the toasts, and the heartbeat over routes
  { key: 'system.tunnel', repo: false, usage: 'system tunnel [<system>]', about: 'the tunnel into each system (lib/system-registry.js): where it runs, the routes it declares, the commands that reach them, its toasts and compartment, and what is missing; with a system, its heartbeat asked over its own health route',
    req: (a) => ({ method: 'GET', path: a.args[0] ? `/api/system/tunnel/${encodeURIComponent(a.args[0])}` : '/api/system/tunnel' }),
    print: (d, a, h) => {
      if (d.systems) { for (const t of d.systems) console.log(`  ${t.name.padEnd(22)} ${h.c.dim(t.runtime && t.runtime.port ? `:${t.runtime.port}` : 'no port').padEnd(8)} ${String(t.routes.length).padStart(4)} routes · ${String(t.commands.length).padStart(3)} commands ${t.said.length ? h.c.amber('· ' + t.said.length + ' missing') : ''}`); console.log(h.c.dim(`  ${d.commands.through_a_declared_route} of ${d.commands.total} commands reach a declared route; ${d.commands.undeclared.length} reach routes no registry declares`)); return; }
      const hb = d.heartbeat || {};
      console.log(`  ${d.name} · ${(hb.status === 'up' ? h.c.mint : h.c.amber)(hb.status || '?')} ${h.c.dim(hb.why || '')}${hb.ms != null ? h.c.dim(` (${hb.ms} ms)`) : ''}`);
      if (d.runtime) console.log(h.c.dim(`  port ${d.runtime.port || '—'} · ${d.runtime.healthUrl || 'no health route'} · v${d.runtime.version || '?'} · data ${d.runtime.dataDir || '—'}`));
      console.log(`  ${d.routes.length} routes declared${d.registry ? ` in ${d.registry.file}` : ''} · ${d.commands.length} commands reach them`);
      for (const c of d.commands.slice(0, 12)) console.log(h.c.dim(`    ${c.command}  →  ${c.route}`));
      for (const x of d.said) console.log(h.c.amber(`  ${x}`));
    } },
  { key: 'system.heartbeat', repo: false, usage: 'system heartbeat', about: 'every system asked over its own health route, now: up, degraded (answered badly or slowly), down, with why',
    req: () => ({ method: 'GET', path: '/api/system/heartbeat' }),
    print: (d, a, h) => { for (const b of d.systems || []) console.log(`  ${(b.status === 'up' ? h.c.mint : h.c.amber)(b.status.padEnd(8))} ${b.name.padEnd(22)} ${h.c.dim(`${b.ms != null ? b.ms + ' ms · ' : ''}${b.why}`)}`); console.log(h.c.dim(`  ${d.up} of ${(d.systems || []).length} up`)); } },
  // 0.60.127 DB9 + DB10 — a system's registry generated as its dependency graph, and its negative space (what is declared and not there, what is there and not declared)
  { key: 'system.registry', repo: false, usage: 'system registry [<system>] [--settle]', about: 'with no system: every system and what it depends on (the dependency graph). With one: its registry generated from the source — what it declares (routes, served), what it depends on and who consumes it, and the negative space: declared routes the source does not serve, and files other systems reach into directly. --settle records each absence as a gap',
    req: (a) => (!a.args[0] ? { method: 'GET', path: '/api/system/registry' } : a.flags && a.flags.settle ? { method: 'POST', path: `/api/system/registry/${encodeURIComponent(a.args[0])}/settle`, body: {} } : { method: 'GET', path: `/api/system/registry/${encodeURIComponent(a.args[0])}` }),
    print: (d, a, h) => {
      if (d.systems) { for (const s of d.systems.filter(s => s.depends_on.length || s.consumed_by.length)) console.log(`  ${s.id.padEnd(16)} ${h.c.dim(s.declared.registry ? `${s.declared.served}/${s.declared.routes} routes served` : 'no registry')} → ${s.depends_on.join(', ') || '—'}`); console.log(h.c.dim(`  ${d.systems.length} systems · ${d.edges.length} dependency edges`)); return; }
      const o = d.observed, n = d.negative;
      console.log(`  ${d.system} · ${d.declared.file ? `${d.declared.served}/${d.declared.routes} declared routes served` : h.c.amber('no registry-components.js')}`);
      console.log(`  depends on   ${o.depends_on.map(x => `${x.system} ${x.edges}`).join(' · ') || '—'}`);
      console.log(`  consumed by  ${o.consumed_by.map(x => `${x.system} ${x.edges}`).join(' · ') || '—'}`);
      for (const x of n.absent.routes) console.log(h.c.amber(`  absent  ${x.route}  ${h.c.dim(x.id)}`));
      for (const x of n.absent.wires) console.log(h.c.amber(`  absent  wire ${x.from} → ${x.target}  ${h.c.dim(x.why)}`));
      for (const x of n.extra.reached_directly.slice(0, 15)) console.log(`  ${h.c.amber('past')}    ${x.file} ${h.c.dim(`${x.consumers} file(s) in ${x.from.join(', ')}`)}`);
      if (n.extra.reached_directly.length > 15) console.log(h.c.dim(`  … ${n.extra.reached_directly.length - 15} more reached directly`));
      if (d.settled) console.log(h.c.dim(`  settled: ${d.settled.absent} absent, ${d.settled.gaps} gap(s) recorded`));
    } },
  { key: 'system.drawbridge', repo: false, usage: 'system drawbridge [--new]', about: 'every require() that crosses from one system into another, by pair and kind (system, upward from lib/, kernel), and the ratchet: crossings new since the baseline fail; --new shows only those',
    req: (a) => ({ method: 'GET', path: `/api/system/drawbridge${a.flags && a.flags.new ? '?new=1' : ''}` }),
    print: (d, a, h) => { const ck = d.check || {}; if (d.census) { const c = d.census; console.log(`  ${c.total} crossings in ${c.files} files · system ${c.byKind.system} · upward ${c.byKind.upward} · kernel ${c.byKind.kernel}`); for (const p of c.pairs.filter(p => p.kind !== 'kernel').slice(0, 20)) console.log(`  ${String(p.count).padStart(4)} ${p.pair.padEnd(32)} ${h.c.dim(p.kind)}`); } if (ck.why) console.log(h.c.amber(`  ${ck.why}`)); else console.log((ck.ok ? h.c.mint : h.c.amber)(`  ratchet: ${ck.counts.now} held of ${ck.counts.baseline} at the baseline · ${ck.counts.added} new · ${ck.counts.closed} closed`)); for (const x of ck.added || []) console.log(h.c.amber(`  new  ${x.edge}`)); } },
  { key: 'system.lean', repo: false, usage: 'system lean [on|off]', about: 'lean mode: stop the services a build does not use (now and at every start), or start them again',
    req: (a) => (a.args[0] ? { method: 'POST', path: '/api/system/lean', body: { on: a.args[0] === 'on', actor: 'command' } } : { method: 'GET', path: '/api/system/lean' }),
    print: (d, a, h) => { console.log(`  lean ${d.on ? h.c.mint('on') : h.c.amber('off')} · ${d.hold.join(', ')}`); for (const r of d.results || d.services || []) console.log(h.c.dim(`    ${r.name} ${r.running != null ? (r.running ? 'running' : 'stopped') : (r.ok ? r.status || 'ok' : `failed: ${r.error}`)}`)); if (d.note) console.log(h.c.dim(`  ${d.note}`)); } },
  // 0.60.25 — the account fallback chain per provider (same as Idearium → Settings → Routing → Accounts)
  // 0.60.123 MP — James: "failure modes are to prevent problems". What is being prevented now, and why
  { key: 'system.prevention', repo: false, usage: 'system prevention [clear <fault class>]', about: 'the failure modes preventing now (a memory crisis makes heavy work wait for headroom for a day), and whether heavy work may run; clear ends one early',
    req: (a) => (a.args[0] === 'clear' ? { method: 'POST', path: '/api/system/prevention/clear', body: { cls: a.args[1] || 'memory_pressure' } } : { method: 'GET', path: '/api/system/lean' }),
    print: (d, a, h) => { if (d.cleared) { console.log(h.c.mint(`  cleared ${d.cleared}`)); return; } for (const p of d.prevention || []) console.log(`  ${h.c.amber(p.cls)} since ${new Date(p.since).toLocaleString()} · ${p.count}× · until ${new Date(p.until).toLocaleString()} ${h.c.dim(p.why || '')}`); if (!(d.prevention || []).length) console.log(h.c.mint('  nothing is being prevented')); if (d.heavy) console.log(h.c.dim(`  heavy work: ${d.heavy.ok ? 'may run' : 'waits'} — ${d.heavy.why}`)); } },
  // 0.60.28 PF1 — ready before run: what a phase build reads before its first agent call
  { key: 'providers.ready', repo: false, usage: 'providers ready', about: 'can each browser agent take a job now, and if not why: a sign-in wall, every account resting, a usage limit, a reply waiting on your ◎ pick',
    req: () => ({ method: 'GET', path: '/api/providers/ready' }),
    print: (d, a, h) => { for (const [id, r] of Object.entries(d.providers || {})) console.log(`  ${(r.ready ? (r.order === 'last' ? h.c.amber : h.c.mint) : h.c.amber)((r.ready ? (r.order === 'last' ? 'last ' : 'ready') : 'not  ').padEnd(5))} ${id.padEnd(11)} ${h.c.dim(r.why)}`); } },
  { key: 'accounts.chain', repo: false, usage: 'accounts chain <provider> [account1,account2,…]', about: 'a provider\'s account fallback chain: show it (and which accounts rest at their limit), or set it in order',
    need: (a) => (a.args.length ? null : '<provider>'),
    req: (a) => (a.args[1] ? { method: 'POST', path: '/api/accounts/chain', body: { provider: a.args[0], accounts: a.args[1].split(',').map(x => x.trim()).filter(Boolean) } } : { method: 'GET', path: `/api/accounts/chain?provider=${encodeURIComponent(a.args[0])}` }),
    print: (d, a, h) => { console.log(`  ${d.provider}: ${(d.chain || []).join(' → ') || h.c.dim('no chain')}`); for (const x of d.exhausted || []) console.log(h.c.amber(`    resting: ${x.account} until ${new Date(x.until).toLocaleString()} — ${x.why}`)); } },
  // 0.60.32 PF1 — James: "each tab can be a different profile". Every account tab: the provider's own (the account it runs) and
  // each profile tab (another account, its own session), with its lane — accounts run at once, one job each
  { key: 'accounts.profiles', repo: false, usage: 'accounts profiles', about: 'every account tab: each provider\'s own tab (and the account it runs) and its profile tabs (other accounts, in their own sessions), busy or idle — jobs for different accounts run at once',
    req: () => ({ method: 'GET', path: '/api/accounts/profiles' }),
    print: (d, a, h) => { if (!d.enabled) console.log(h.c.amber('  profile tabs are off (GUARDIAN_PROFILE_TABS=0)')); if (!(d.providers || []).length) { console.log(h.c.dim('  no account tab connected')); return; }
      for (const p of d.providers) { console.log(`  ${p.provider}: own tab runs ${p.account || h.c.dim('no known account')}${(p.chain || []).length ? h.c.dim(`  (chain ${p.chain.join(' → ')})`) : ''}`);
        for (const t of p.tabs || []) console.log(`    ${t.profile ? `profile ${t.profile}` : 'own tab'}  ${t.busy ? h.c.amber('busy') : h.c.dim('idle')}${t.limited ? h.c.amber('  at its limit') : ''}${h.c.dim(`  ${t.tabId}`)}`); } } },
  { key: 'repo.diff', repo: true, usage: 'repo diff <repo> <a> [b|working] [--path file]', about: 'what changed between two versions (b defaults to the files on disk now)',
    need: (a) => (a.args.length ? null : '<a> (a version id from repo versions)'),
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/versions/diff?a=${encodeURIComponent(a.args[0])}&b=${encodeURIComponent(a.args[1] || 'working')}${a.flags.path ? `&path=${encodeURIComponent(a.flags.path)}` : ''}` }),
    print: (d, a, h) => { console.log(h.c.dim(`  ${d.counts.added} added · ${d.counts.removed} removed · ${d.counts.changed} changed`)); for (const f of d.files || []) { console.log(`  ${f.status.padEnd(8)} ${f.path}`); if (f.patch && (a.flags.path || (d.files || []).length <= 5)) console.log(f.patch); } } },
  { key: 'repo.restore-file', repo: true, usage: 'repo restore-file <repo> <version> <path>', about: 'put one file back as it was at a version (the change is itself versioned)',
    need: (a) => (a.args.length >= 2 ? null : '<version> <path>'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/versions/restore-file`, body: { commitId: a.args[0], path: a.args[1] } }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.path} restored from ${d.commitId} (${d.bytes} bytes)`) },
  { key: 'repo.history-import', repo: true, usage: 'repo history-import <repo> <zip> [zip…] [--dry] [--allow-secrets]', about: 'import the project\'s past as real versions: a zip with its .git gives every commit; several zips of one project become one version each, in order',
    need: (a) => (a.args.length ? null : '<zip> (a project zip with its .git, or several versions)'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/history/import`, body: { dryRun: !!a.flags.dry, allowSecrets: !!a.flags['allow-secrets'], zips: a.args.map(p => ({ name: require('path').basename(p), contentBase64: require('fs').readFileSync(p).toString('base64') })) } }),
    print: (d, a, h) => { for (const x of d.versions || []) console.log(`  ${x.skipped ? h.c.dim('skip') : h.c.mint(d.dryRun ? 'would' : '  ✓ ')} ${String(x.date || '').slice(0, 10)} ${x.source.padEnd(3)} ${x.message.slice(0, 70)} ${h.c.dim(`${x.files} files`)}`); if ((d.secrets || []).length) console.log(h.c.amber(`  ${d.secrets.length} possible credential(s): ${d.secrets.slice(0, 5).map(s => `${s.path}:${s.line} ${s.kind}`).join('; ')}`)); console.log(h.c.dim(d.dryRun ? `  dry run: ${d.wouldImport} would be imported` : `  ${d.imported} imported, ${d.skipped} skipped → ${d.branch}`)); } },
  { key: 'repo.integrity', repo: true, usage: 'repo integrity <repo> [--notes]', about: 'the import checks: parses, requires resolve, npm declared, duplicate files, secrets, files arrived (--notes writes them as the repo\'s notes)',
    req: (a) => ({ method: a.flags.notes ? 'POST' : 'GET', path: `/api/repos/${a.repo.uuid}/integrity`, ...(a.flags.notes ? { body: {} } : {}) }),
    print: (d, a, h) => { for (const c of d.checks || []) console.log(`  ${c.ok ? h.c.mint('✓') : (c.severity === 'error' ? h.c.amber('✗') : h.c.dim('?'))} ${c.id.padEnd(7)} ${c.name.padEnd(22)} ${c.ok ? '' : c.count}${c.error ? h.c.dim(` ${c.error}`) : ''}`); if (d.notes) console.log(h.c.dim(`  notes: ${d.notes.added} added, ${d.notes.updated} updated, ${d.notes.done} closed`)); } },
  // 0.60.6 — notes (lib/repo-notes.js): he and every agent log ideas, decisions, todos and questions in one place
  { key: 'repo.notes', repo: true, usage: 'repo notes <repo> [--q words] [--kind idea|decision|todo|question|quote|note]', about: 'the repo\'s notes, pinned first then newest',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/notes${a.flags.q || a.flags.kind ? `?${[a.flags.q ? `q=${encodeURIComponent(a.flags.q)}` : '', a.flags.kind ? `kind=${encodeURIComponent(a.flags.kind)}` : ''].filter(Boolean).join('&')}` : ''}` }),
    print: (d, a, h) => { for (const n of d.notes || []) console.log(`  ${n.pinned ? h.c.amber('★') : ' '} ${h.c.dim(n.kind.padEnd(8))} ${n.status === 'done' ? h.c.dim(n.title) : n.title}  ${h.c.dim(n.id)}`); if (!(d.notes || []).length) console.log(h.c.gray('  no notes')); } },
  { key: 'repo.note', repo: true, usage: 'repo note <repo> <text> [--kind idea|decision|todo|question|quote|note] [--tags a,b]', about: 'add a note to the repo (who wrote it is recorded)',
    need: (a) => (a.args.length ? null : '<text>'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/notes`, body: { body: a.args.join(' '), ...(a.flags.kind ? { kind: a.flags.kind } : {}), ...(a.flags.tags ? { tags: a.flags.tags } : {}), ...(a.flags.source ? { source: a.flags.source } : {}) } }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.note.kind}: ${d.note.title}  ${h.c.dim(d.note.id)}`) },
  { key: 'notes', repo: false, usage: 'notes [--q words] [--kind k] [--loose]', about: 'every note, on every repo (--loose: only those on no repo)',
    req: (a) => ({ method: 'GET', path: `/api/notes?scope=${a.flags.loose ? 'loose' : 'all'}${a.flags.q ? `&q=${encodeURIComponent(a.flags.q)}` : ''}${a.flags.kind ? `&kind=${encodeURIComponent(a.flags.kind)}` : ''}` }),
    print: (d, a, h) => { for (const n of d.notes || []) console.log(`  ${h.c.dim(n.kind.padEnd(8))} ${n.title}  ${h.c.dim(n.repoUuid ? (d.names || {})[n.repoUuid] || n.repoUuid.slice(0, 8) : 'no repo')} ${h.c.dim(n.id)}`); if (!(d.notes || []).length) console.log(h.c.gray('  no notes')); } },
  { key: 'note', repo: false, usage: 'note <text> [--kind k] [--tags a,b]', about: 'a note on no repo in particular',
    need: (a) => (a.args.length ? null : '<text>'),
    req: (a) => ({ method: 'POST', path: '/api/notes', body: { body: a.args.join(' '), ...(a.flags.kind ? { kind: a.flags.kind } : {}), ...(a.flags.tags ? { tags: a.flags.tags } : {}), ...(a.flags.source ? { source: a.flags.source } : {}) } }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.note.kind}: ${d.note.title}  ${h.c.dim(d.note.id)}`) },
  { key: 'note.done', repo: false, usage: 'note done <id>', about: 'tick a todo or answer a question',
    need: (a) => (a.args[0] ? null : '<id>'),
    req: (a) => ({ method: 'PATCH', path: `/api/notes/${encodeURIComponent(a.args[0])}`, body: { status: 'done' } }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} done: ${d.note.title}`) },
  // FN0 — James: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk." (lib/work-funnel.js)
  { key: 'repo.funnel', repo: true, usage: 'repo funnel <repo> <request…> [--intent change|build|debug|spec]', about: 'the four answers for a request, in order — its dependencies, its spec, its phase, its chunks — or where it stops and why (no model)',
    need: (a) => (a.args.length ? null : '<request…>'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/funnel`, body: { request: a.args.join(' '), ...(a.flags.intent ? { intent: String(a.flags.intent) } : {}) } }),
    print: (d, a, h) => { for (const l of d.lines || []) console.log(/^stopped/.test(l) ? `  ${h.c.amber(l)}` : `  ${l}`); } },
  // FR1 0.60.114 — the flight recorder's first piece: one record per change an agent makes (lib/change-record.js). Not
  // 'repo.changes': that row (the agent's proposals, --prove) already exists, and a second key is silently shadowed
  { key: 'repo.record', repo: true, usage: 'repo record <repo> [<change id>] [--status applied|proposed|reverted|rejected] [--limit n]', about: 'each change an agent made: what (lines), who, why (its task and run), what was checked, the version it landed in, whether it can be undone, and any missing link named',
    req: (a) => (a.args[0]
      ? { method: 'GET', path: `/api/repos/${a.repo.uuid}/changes/${encodeURIComponent(a.args[0])}` }
      : { method: 'GET', path: `/api/repos/${a.repo.uuid}/changes?limit=${parseInt(a.flags.limit, 10) || 30}${a.flags.status ? `&status=${encodeURIComponent(String(a.flags.status))}` : ''}` }),
    print: (d, a, h) => {
      if (d.change) { for (const l of d.lines || []) console.log(/^missing/.test(l) ? `  ${h.c.amber(l)}` : `  ${l}`); return; }
      if (!(d.changes || []).length) { console.log('  no changes yet'); return; }
      for (const c of d.changes) console.log(`  ${c.id.slice(0, 8)}  ${String(c.status).padEnd(9)} ${c.path}${c.lines ? ` +${c.lines.added} −${c.lines.removed}` : ''}  ${c.agent || ''}${c.goal ? ` — ${String(c.goal).slice(0, 60)}` : ''}${c.landed.length ? `  @${c.landed[0]}` : ''}${c.holes.length ? h.c.amber(`  missing: ${c.holes.join(', ')}`) : ''}`);
    } },
  // §FR6 0.60.144 — James: "we need to continue building the flight recorder. look at rfr2, and cfr for friction and tension."
  { key: 'repo.flight', repo: true, usage: 'repo flight <repo> [<run id>] [--limit n]', about: 'each agent run read whole: landed or stuck and why, the ladder of agents it climbed, what it cost, what was spent on attempts that never landed, friction and tension. With no run: every run, and the share of calls wasted',
    req: (a) => (a.args[0]
      ? { method: 'GET', path: `/api/repos/${a.repo.uuid}/flight/${encodeURIComponent(a.args[0])}` }
      : { method: 'GET', path: `/api/repos/${a.repo.uuid}/flight?limit=${parseInt(a.flags.limit, 10) || 30}` }),
    print: (d, a, h) => {
      if (d.flight) { for (const l of d.lines || []) console.log(/^STUCK|^CRASHED|^TURBULENT/.test(l) ? `  ${h.c.amber(l)}` : `  ${l}`); return; }
      for (const l of d.lines || []) console.log(`  ${l}`);
      for (const f of d.flights || []) console.log(`  ${String(f.verdict).padEnd(9)} ${h.c.gray(f.runId)} ${f.phase || ''} ${h.c.dim(`${f.calls} call(s) · ${f.wasted.calls} wasted · ${(f.ladder || []).join(' → ')}`)}${f.why && f.verdict !== 'landed' ? `\n     ${String(f.why).slice(0, 140)}` : ''}`);
    } },
  // FR3 0.60.117 — undo any change an agent made, keeping later edits (versionium/lib/merge3.js); a clash is refused, named
  { key: 'repo.undo', repo: true, usage: 'repo undo <repo> <change id> [--no-merge] [--force]', about: 'undo one change: what was there before is put back and every later edit is kept; if a later change touched the same lines, nothing changes and the lines are named. --no-merge refuses whenever the file moved on; --force discards later edits',
    need: (a) => (a.args[0] ? null : '<change id>'),
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/injects/${encodeURIComponent(a.args[0])}/revert`, body: { ...(a.flags['no-merge'] ? { merge: false } : {}), ...(a.flags.force ? { force: true } : {}) } }),
    print: (d, a, h) => { const n = d.inject || {}; console.log(`  ${h.c.green('undone')} ${n.path || ''}${d.merged ? ' — merged: the later edits were kept' : ''}`); } },
  // CV1 0.60.112 — James: "can you branch it into a idearium repo?" (lib/repo-carve.js): a part of Nexus as its own repo, Nexus its parent
  { key: 'repo.carve', repo: false, usage: 'repo carve <name> <path…> | repo carve --preset flight_recorder [--name n] [--cut optional|optional,lazy|none] [--verify] [--dry-run]', about: 'copy a part of Nexus (files or folders) into a new Idearium repo with everything it requires; says what pulled each file in, the npm it needs, and requires that resolve to nothing. Nothing in Nexus moves',
    need: (a) => (a.flags.preset || a.args.length >= 2 ? null : '<name> <path…> (or --preset flight_recorder)'),
    req: (a) => {
      const extra = { ...(a.flags.cut != null ? { cut: String(a.flags.cut) === 'none' ? [] : String(a.flags.cut).split(/[,+]/).filter(Boolean) } : {}), ...(a.flags.verify ? { verify: true } : {}) };
      return { method: 'POST', path: '/api/repos/carve', body: a.flags.preset
        ? { preset: String(a.flags.preset), ...(a.flags.name ? { name: String(a.flags.name) } : {}), dryRun: !!(a.flags['dry-run'] || a.flags.dryRun), ...extra }
        : { name: a.args[0], seeds: a.args.slice(1), dryRun: !!(a.flags['dry-run'] || a.flags.dryRun), ...extra } };
    },
    print: (d, a, h) => {
      console.log(`  ${d.dryRun ? 'would carve' : `carved ${h.c.green(d.repo && d.repo.uuid ? d.repo.uuid.slice(0, 8) : '')}`} ${d.name}: ${d.files} files (${d.seeded} named, ${d.pulledIn} pulled in), ${d.lines} lines${d.parent ? ` · parent ${d.parent.name}` : ''}`);
      console.log(`  by system: ${Object.entries(d.bySystem || {}).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
      console.log(`  npm: ${Object.keys(d.npm || {}).join(', ') || 'none'}${(d.npmNamedOnly || []).length ? ` · named only: ${d.npmNamedOnly.join(', ')}` : ''}`);
      if ((d.missing || []).length) console.log(`  ${h.c.amber(`${d.missing.length} require(s) resolve to nothing`)}: ${d.missing.slice(0, 4).map(m => `${m.from} → ${m.spec}`).join('; ')}`);
      if ((d.cut || []).length) console.log(`  left out (${d.cut.join(', ')}): ${(d.leftOut || []).length} link(s)`);
      for (const t of (d.tangle || []).slice(0, 6)) console.log(`  tangle: ${String(t.files).padStart(3)} file(s) via ${t.from} → ${t.to} (${t.kind})`);
      if (d.verified) console.log(`  ${d.verified.ok ? h.c.green('loads alone') : h.c.amber('does NOT load alone')}: ${d.verified.loaded}/${d.verified.of}${(d.verified.failed || []).map(f => `\n    ✗ ${f.path}: ${f.error}`).join('')}`);
    } },
  // 0.60.78 RT1 — what RAID's officiator holds back (the agents' wait, each staged drop's tries and why) and clearing it
  { key: 'raid.parked', repo: false, usage: 'raid parked', about: 'what the officiator holds back: the agents\' wait (no agent answered) and each staged drop\'s tries, why, and when it is tried next',
    req: () => ({ system: 'cortex', method: 'GET', path: '/api/raid/officiator' }),
    print: (d, a, h) => {
      if (d.agents) console.log(`  ${h.c.amber('agents waiting')} until ${new Date(d.agents.until).toLocaleTimeString()} — ${d.agents.reason || ''}${(d.agents.tried || []).length ? h.c.dim(` (tried ${d.agents.tried.join(', ')})`) : ''}`);
      for (const x of d.drops || []) console.log(`  ${x.parked ? h.c.amber('parked ') : h.c.dim('waiting')} ${x.id.slice(0, 12)}  ${x.n}/${d.maxAttempts} · next ${new Date(x.nextTry).toLocaleString()}${(x.tried || []).length ? h.c.dim(` · ${x.tried.join(', ')}`) : ''}\n          ${h.c.dim(String(x.reason || '').slice(0, 140))}`);
      if (!d.agents && !(d.drops || []).length) console.log(h.c.gray('  nothing held back'));
    } },
  { key: 'raid.unpark', repo: false, usage: 'raid unpark [<drop id or prefix>]', about: 'clear what the officiator holds back: one drop (by id or its first characters), or everything (the agents\' wait included) — tried on the next tick',
    req: (a) => ({ system: 'cortex', method: 'POST', path: '/api/raid/officiator/unpark', body: a.args[0] ? { id: a.args[0] } : {} }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} cleared ${(d.cleared || []).length}: ${(d.cleared || []).map(x => x.slice(0, 12)).join(', ') || 'nothing was held back'}`) },
  // 0.60.74 COSA10 — James: "i figure cos could be helpfui for managing my projects so im not so overwhelmed." Every project,
  // newest activity first: questions and todos waiting, phases done/total, what is in progress or next (idearium/lib/projects.cjs)
  { key: 'projects', repo: false, usage: 'projects', about: 'every project of yours on one list: what is waiting on you, what is next, what moved last',
    req: () => ({ method: 'GET', path: '/api/my-projects' }),
    print: (d, a, h) => {
      const c = d.counts || {};
      console.log(h.c.dim(`  ${c.projects || 0} projects · ${c.questions || 0} questions · ${c.todos || 0} todos · ${c.inProgress || 0} in progress`));
      for (const p of d.projects || []) {
        const when = p.lastActivity && p.lastActivity.ts ? new Date(p.lastActivity.ts).toISOString().slice(0, 10) : '—';
        const ph = p.phases ? `${p.phases.complete}/${p.phases.total} phases` : 'no phasemap';
        console.log(`  ${h.c.mint(p.name)}  ${h.c.dim(`${when} · ${ph}`)}`);
        for (const x of p.attention || []) console.log(`      ${x}`);
        for (const e of p.errors || []) console.log(`      ${h.c.amber('!')} ${e}`);
      }
      if (!(d.projects || []).length) console.log(h.c.gray('  no projects yet'));
    } },
  // 0.60.5 — the component store from the command line and for every agent (lib/project-decompose.js)
  { key: 'components', repo: false, usage: 'components [--q words] [--limit n]', about: 'the component store: every stored component, or those matching words',
    req: (a) => ({ method: 'GET', path: `/api/components${a.flags.q ? `?q=${encodeURIComponent(a.flags.q)}&limit=${parseInt(a.flags.limit, 10) || 25}` : ''}` }),
    print: (d, a, h) => { for (const c of (d.components || []).slice(0, 200)) console.log(`  ${c.id}${c.latest ? h.c.dim(` @${c.latest}`) : ''}  ${h.c.dim(c.path || '')}`); console.log(h.c.dim(`\n  ${d.stats ? d.stats.components : (d.components || []).length} component(s)`)); } },
  { key: 'components.decompose', repo: false, usage: 'components decompose <folder> [--project name]', about: 'decompose a project folder into the component store: every code file a component, its requires resolved, its npm packages named',
    need: (a) => (a.args[0] ? null : '<folder>'),
    req: (a) => ({ method: 'POST', path: '/api/components/decompose', timeoutMs: 10 * 60000, body: { dir: a.args.join(' '), ...(a.flags.project ? { project: a.flags.project } : {}) } }),
    print: (d, a, h) => { const s = d.stats || {}; console.log(`${h.c.mint('✓')} ${d.project}: ${s.components} component(s), ${s.created} new, ${s.unresolved} unresolved require(s), ${s.skipped} skipped`); if ((d.npm || []).length) console.log(h.c.dim(`  npm: ${d.npm.join(', ')}`)); } },
  { key: 'components.bundle', repo: false, usage: 'components bundle <id>', about: 'one component and everything it requires as one organized zip (component.json, package.json, README, files at their project paths)',
    need: (a) => (a.args[0] ? null : '<id> (idearium components --q words)'),
    req: (a) => ({ method: 'GET', path: `/api/components/${encodeURIComponent(a.args[0])}/bundle?save=1` }),
    print: (d, a, h) => console.log(`${h.c.mint('✓')} ${d.file}\n${h.c.dim(`  ${d.closure.length} component(s): ${d.closure.join(', ')}`)}`) },
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
  // §0.60.147 DG2 — James, 2026-10-18: "each phase, has to have a dependany graph before executing."
  // 0.60.199 SD17 — James: "so i can import a project and have it continue?" A project's own roadmap, imported as a Nexus phasemap
  { key: 'repo.roadmaps', repo: true, usage: 'repo roadmaps <repo>', about: 'the roadmaps a project brought with it (phases.json, roadmap.json, PHASEMAP.md, ROADMAP.md), and whether each is imported as a phasemap yet',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/roadmaps` }),
    print: (d, a, h) => { h.header(`${a.repo.name} — its own roadmaps`); if (!(d.roadmaps || []).length) console.log(h.c.dim('  none (phases.json, roadmap.json, PHASEMAP.md or ROADMAP.md)')); for (const r of d.roadmaps || []) console.log(`  ${r.imported ? h.c.mint('✓ imported') : h.c.amber('· not yet ')}  ${[r.json, r.md].filter(Boolean).join(' + ')}  ${h.c.dim(`→ ${r.target}`)}`); console.log(''); } },
  { key: 'repo.lift-root', repo: true, usage: 'repo lift-root <repo> [--apply]', about: 'a project imported inside its own folder (before 0.60.200) lifted to the repo\'s root, so a phase\'s paths (lib/title.js) are where the build looks; without --apply it only says what would move; a root copy at a taken path is archived first, nothing deleted',
    req: (a) => ({ method: a.flags.apply ? 'POST' : 'GET', path: `/api/repos/${a.repo.uuid}/lift-root` }),
    print: (j, a, h) => console.log('  ' + (j.wrapper ? `${j.applied ? 'lifted' : 'would lift'} ${j.wrapper}/ to the root — ${j.applied ? `${j.moved} moved, ${(j.archived || []).length} root copies archived${(j.failed || []).length ? `, ${j.failed.length} failed: ${j.failed.map(f => `${f.path} (${f.error})`).join('; ')}` : ''}` : `${j.moves} file(s); ${(j.collisions || []).length} root copies would be archived (${(j.collisions || []).map(c => c.path).join(', ') || 'none'}) — run with --apply`}` : `nothing to lift — ${j.why}`)) },
  { key: 'repo.roadmap-import', repo: true, usage: 'repo roadmap-import <repo> [<dir>] [--replace]', about: 'import a project\'s own roadmap as a Nexus phasemap beside it: its ids, states, percent, what blocks what (each edge says which file it came from), exit criteria as proof — so the project continues from where it is',
    req: (a) => ({ method: 'POST', path: `/api/repos/${a.repo.uuid}/roadmaps/import`, body: { ...(a.args[0] != null ? { dir: a.args[0] === '.' ? '' : a.args[0] } : {}), ...(a.flags.replace ? { replace: true } : {}) } }),
    print: (d, a, h) => { console.log(`${h.c.mint('✓')} ${d.map}: ${d.phases} phases (${d.done} done) from ${(d.from || []).join(' + ')}`); for (const n of d.next || []) console.log(`  next  ${n.id}${n.waiting ? h.c.dim(`  · ${n.waiting} wait on it`) : ''}`); for (const w of d.said || []) console.log(h.c.dim(`  said: ${w}`)); console.log(''); } },
  { key: 'repo.phase-graph', repo: true, usage: 'repo phase-graph <repo> <phase> [--map name]', about: 'a phase\'s dependency graph, the one a build is refused without: the files it changes, what they use, who uses them (what a change can break), the systems, any crossing between systems, what it waits on, its specs',
    need: (a) => (a.args[0] ? null : '<phase>'),
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/graph?phase=${encodeURIComponent(a.args[0])}${a.flags.map ? `&map=${encodeURIComponent(String(a.flags.map))}` : ''}` }),
    print: (d, a, h) => { for (const l of d.lines || []) console.log(/^(NEW CROSSING|  missing)|NO DEPENDENCY GRAPH/.test(l) ? `  ${h.c.amber(l)}` : `  ${l}`); } },
  { key: 'repo.phase', repo: true, usage: 'repo phase <repo> <phase> [build [--map name] [--provider ollama|claude-code|claude|…] [--note "…"] [--replan] [--anyway]]', about: 'one phase: its runs (and why one stopped), or build it now as a background task (a build started again keeps its saved plan and resumes; --replan plans it again)',
    need: (a) => (a.args[0] ? null : '<phase>'),
    req: (a) => (a.args[1] === 'build'
      ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/phases/build`, body: { startedBy: 'person:cli', phase: a.args[0], ...(a.flags.map ? { map: a.flags.map } : {}), ...(a.flags.provider ? { provider: a.flags.provider } : {}), ...(a.flags.note ? { note: a.flags.note } : {}), ...(a.flags.replan ? { replan: true } : {}), ...(a.flags.anyway ? { anyway: true } : {}) }, timeoutMs: 120000 }
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
      for (const r of runs) console.log(`  ${h.c.dim(when(r.ts))} ${r.state === 'failed' || r.state === 'blocked' ? h.c.coral(r.state) : r.state === 'complete' || r.state === 'proved' ? h.c.mint(r.state) : h.c.sky(r.state || '?')}  ${h.c.dim(r.provider || '')}${r.startedBy ? h.c.dim(` · by ${r.startedBy.who}${r.startedBy.whence === 'declared' ? '' : ` (${r.startedBy.whence})`}`) : ''}${r.error ? `  ${String(r.error).slice(0, 140)}` : ''}`);
    } },
  // 0.60.7 — the same command, now the whole index (lib/repo-history.js): VR1's commits are its snapshots; backups,
  // staging, imported history and the work surface's revisions beside them. --kind snapshot is the old list.
  { key: 'repo.versions', repo: true, usage: 'repo versions <repo> [--limit n] [--kind snapshot|backup|staging|history|revision]', about: 'every version of the repo, newest first: snapshots (VR1: every change a commit), backups, staging, imported history, work-surface revisions',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/versions`, timeoutMs: 30000 }),
    print: (d, a, h) => {
      const l = (d.entries || []).filter(e => !a.flags.kind || e.kind === a.flags.kind).slice(0, parseInt(a.flags.limit || '25', 10) || 25);
      if (!l.length) { console.log(h.c.gray('  no versions yet')); return; }
      for (const e of l) console.log(`  ${h.c.amber(String(e.id).slice(0, 12).padEnd(12))} ${h.c.dim(when(e.at))} ${e.kind.padEnd(8)} ${String(e.message || '').slice(0, 90)}${e.fileCount != null ? h.c.dim(`  · ${e.fileCount} files`) : ''}`);
      const c = d.counts || {};
      console.log(h.c.dim(`\n  ${Object.keys(c).map(k => `${c[k]} ${k}`).join(' · ')}`));
    } },

  // 0.60.41 RN1 — James: "i want idearium to have releases and a changelog for each version." A release is a Versionium
  // tag on the repo's head with the commits since the last one (lib/repo-releases.js).
  { key: 'repo.releases', repo: true, usage: 'repo releases <repo> [--cut] [--version x.y.z] [--quote "…"] [--notes "…"]', about: 'the repo\'s releases, newest first (Versionium tags with the commits since each last one); --cut releases the head now',
    req: (a) => a.flags.cut ? { method: 'POST', path: `/api/repos/${a.repo.uuid}/releases`, timeoutMs: 60000, body: { ...(a.flags.version ? { version: String(a.flags.version) } : {}), ...(a.flags.quote ? { quote: String(a.flags.quote) } : {}), ...(a.flags.notes ? { notes: String(a.flags.notes) } : {}) } }
      : { method: 'GET', path: `/api/repos/${a.repo.uuid}/releases` },
    print: (d, a, h) => {
      const l = d.release ? [d.release] : (d.releases || []);
      if (!l.length) { console.log(h.c.gray(`  no releases yet — idearium repo releases ${a.repo.name} --cut`)); return; }
      for (const r of l) {
        console.log(`  ${h.c.mint(r.tag.padEnd(10))} ${h.c.dim(when(r.at))} ${h.c.amber(String(r.commitId || '').slice(0, 12))}  ${(r.commits || []).length} commit(s)${r.already ? h.c.dim('  (already released)') : ''}`);
        if (r.quote) console.log(`    ${h.c.sky(String(r.quote).slice(0, 160))}`);
        if (d.release && r.notes) console.log(h.c.dim(String(r.notes).split('\n').slice(0, 12).map(x => `    ${x}`).join('\n')));
      }
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
  { key: 'repo.history', repo: true, usage: 'repo history <repo> <path> [--tag kind:edit|run:id|by:who|inject:id]', about: 'the commits that touched one file — when, who, why (VR1), newest first; --tag filters by their labels (CV4)',
    need: (a) => (a.args[0] ? null : '<path>'),
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/history?path=${encodeURIComponent(a.args[0])}${a.flags.tag && a.flags.tag !== true ? `&tag=${encodeURIComponent(a.flags.tag)}` : ''}`, timeoutMs: 30000 }),
    print: (d, a, h) => {
      const l = d.commits || [];
      if (!l.length) { console.log(h.c.gray(`  no commit names ${d.path}${d.untracked ? ` (${d.untracked} older commit(s) do not say what they touched)` : ''}`)); return; }
      for (const c of l) console.log(`  ${h.c.amber(String(c.commitId).slice(0, 10))} ${h.c.dim(when(c.ts))} ${c.op === 'delete' ? h.c.coral('deleted') : 'changed'}  ${String(c.message || '').slice(0, 90)}${(c.provenance.refs || []).length ? h.c.dim(`  · ${c.provenance.refs.join(', ')}`) : ''}${(c.labels || []).length ? h.c.dim(`  [${c.labels.map(l => [l.kind, l.action, l.by].filter(Boolean).join(' ')).join('; ')}]`) : ''}`);
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
  // §0.59.2 — James: "can you make it so i can use guardian element picker for claude code". The elements he sent with
  // → CLAUDE CODE in the Guardian picker: selector, page, text, a slice of the HTML — what Claude Code needs to act on it.
  { key: 'picks', repo: false, usage: 'picks [--last] [--html]', about: 'the elements James handed to the agents with the Guardian picker (→ CLAUDE CODE): selector, page, text — newest first',
    req: () => ({ system: 'clear-glass', method: 'GET', path: '/cli/picks' }),
    print: (d, a, h) => {
      const ps = (d.picks || []).slice(0, a.flags.last ? 1 : 25);
      if (!ps.length) { console.log(h.c.dim('  nothing picked yet — in Clear Glass: the picker, an element, → CLAUDE CODE')); return; }
      for (const p of ps) {
        console.log(`  ${h.c.amber(`#${p.n}`)} ${h.c.dim(new Date(p.at).toLocaleTimeString('en-GB', { hour12: false }))} ${p.label ? h.c.bold(p.label) + ' ' : ''}${h.c.sky(p.selector)}`);
        console.log(h.c.dim(`      ${p.tag || ''}${p.rect ? ` (${p.rect.x},${p.rect.y}) ${p.rect.w}×${p.rect.h}` : ''} · ${p.title || ''} · ${p.url || ''}`));
        if (p.text) console.log(`      "${p.text.slice(0, 160)}"`);
        if (a.flags.html && p.html) console.log(h.c.dim(`      ${p.html.slice(0, 600)}`));
      }
    } },
  // §0.60.12 — James: "the logins for the agent providers needs to be all the same. the accounts and sign in, isn't wired into
  // the provider tabs in clearglass." A provider tab runs as the provider's default account (Accounts & sign-in). This brings
  // one tab, or every provider's, to it, and says what it did to each. Agents get what the Provider tabs page's button gives a person.
  { key: 'glass.signin', repo: false, usage: 'glass signin [provider]', about: 'bring a provider tab (or every one) to its default account\'s saved sign-in in Clear Glass; says what it did per provider',
    req: (a) => ({ system: 'clear-glass', method: 'POST', path: a.args[0] ? `/providers/${encodeURIComponent(a.args[0])}/account/sync` : '/providers/account/sync', body: {} }),
    print: (d, a, h) => {
      const rows = d.results || [d];
      for (const r of rows) console.log(`  ${r.ok === false ? h.c.coral('✗') : h.c.mint('✓')} ${(r.provider || a.args[0] || '').padEnd(11)} ${r.action || ''}${r.accountId ? h.c.dim(`  as ${r.accountId}`) : ''}${r.why || r.error ? h.c.dim(`  ${r.why || r.error}`) : ''}`);
    } },
  // §0.60.175 PM5 — James: "parse the dom, index each element as blocks … synthesize a fucking map in relation to the weboage to use as a
  // map or reference point for inputs from the cli or the intent. learns over time." Same route as `field` (POST /cli/driver).
  { key: 'page', repo: false, usage: 'page [--on <window>] [--max n]', about: 'the page map of a Clear Glass window: regions, forms (fields, required, submit), actions and headings as short lines, and what changed since the last visit to this kind of page (it learns per site)',
    req: (a) => _fieldReq(a, { action: 'pageMap', ...(a.flags.max ? { maxBlocks: +a.flags.max } : {}) }),
    print: (d, a, h) => { const m = d.result || {}; console.log(h.c.dim(`  ${d.agentId} · ${m.site || m.url || ''} · ${(m.stats && m.stats.blocks) || 0} blocks · visit ${m.visits || 1} · ${m.feel || ''}`)); for (const l of m.lines || []) console.log(`  ${l}`); if (m.note) console.log(h.c.amber(`  ${m.note}`)); console.log(h.c.dim('\n  next: idearium page find <intent…> · idearium page chunks [query] · idearium page scrape')); } },
  { key: 'page.find', repo: false, usage: 'page find <intent…> [--on <window>] [--fresh]', about: 'intent → the blocks on the page to act on, ranked, each with its selector, address, centre (x,y) and why (words, kind, covered, stable here, worked before)',
    need: (a) => (a.args.length ? null : '<intent> (e.g. "type my email", "click apply")'),
    req: (a) => _fieldReq(a, { action: 'pageFind', intent: a.args.join(' '), fresh: !!a.flags.fresh }),
    print: (d, a, h) => { const r = d.result || {}; console.log(h.c.dim(`  ${r.site || ''} · "${r.intent}"${(r.verbs || []).length ? ` · wants ${r.verbs.join('/')}` : ''}`)); (r.targets || []).forEach((t, i) => console.log(`  ${i === 0 ? h.c.mint('→') : ' '} ${h.c.bold(`${t.role}${t.name ? ` "${t.name}"` : ''}`)}  ${h.c.dim(`${t.cx != null ? `(${t.cx},${t.cy}) ` : ''}${t.selector || ''}  ${t.score}`)}\n      ${h.c.dim(`${t.id} · ${t.why.join(' · ')}`)}`)); if (!(r.targets || []).length) console.log(h.c.dim('  (nothing matches)')); console.log(h.c.dim(`\n  after acting: idearium page outcome "${r.intent}" <id> ok|fail`)); } },
  { key: 'page.outcome', repo: false, usage: 'page outcome <intent> <block-id> ok|fail [--on <window>]', about: 'tell the page map what happened when a found block was acted on — it learns for this intent on this kind of page',
    need: (a) => (a.args.length >= 3 ? null : '<intent> <block-id> ok|fail'),
    req: (a) => _fieldReq(a, { action: 'pageOutcome', intent: a.args.slice(0, -2).join(' '), id: a.args[a.args.length - 2], ok: !/^(fail|failed|no|false|0)$/i.test(a.args[a.args.length - 1]) }),
    print: (d, a, h) => { const r = d.result || {}; console.log(r.ok ? h.c.mint(`  learned: "${r.intent}" → ${r.blockId} (${r.score > 0 ? '+' : ''}${r.score})`) : h.c.amber(`  ${r.why}`)); } },
  { key: 'page.chunks', repo: false, usage: 'page chunks [query…] [--on <window>] [--max-chars n]', about: 'the page as chunks of text by section — or only the chunks a query hits (reading, analysing, reverse engineering)',
    req: (a) => _fieldReq(a, { action: 'pageChunks', ...(a.args.length ? { query: a.args.join(' ') } : {}), ...(a.flags['max-chars'] ? { maxChars: +a.flags['max-chars'] } : {}) }),
    print: (d, a, h) => { const r = d.result || {}; for (const c of r.chunks || []) { console.log(h.c.bold(`  ${c.id} ${c.title}`) + h.c.dim(`  ${c.blocks.length} block(s)`)); console.log(String(c.text || '').split('\n').slice(0, 8).map(l => `    ${l}`).join('\n')); } if (!(r.chunks || []).length) console.log(h.c.dim('  (no chunks)')); } },
  { key: 'page.scrape', repo: false, usage: 'page scrape [--json] [--on <window>] [--out file]', about: 'the whole page as markdown by section (or --json: blocks + chunks + map) — the web scraper; --out writes it to a file',
    req: (a) => _fieldReq(a, { action: 'pageScrape', format: a.flags.json ? 'json' : 'md' }),
    print: (d, a, h) => { const r = d.result || {}; const text = r.markdown != null ? r.markdown : JSON.stringify(r, null, 2); if (a.flags.out && a.flags.out !== true) { require('fs').writeFileSync(String(a.flags.out), text); console.log(h.c.mint(`  written: ${a.flags.out} (${text.length} chars)`)); } else console.log(text); } },
  { key: 'field.windows', repo: false, usage: 'field windows', about: 'what the field is doing in each Clear Glass window: its last map, spotlight and pointer, and how lately the page changed',
    req: () => ({ system: 'clear-glass', method: 'GET', path: '/cli/attention' }),
    print: (d, a, h) => _printWindows(d.windows || [], h) },
  // §0.60.219 SP1/SP5 — James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake,
  // resume state. Cleardriver, agentmesh and guardian setting. Also need a processes screen for background tabs and activity."
  { key: 'site', repo: false, usage: 'site <url> [set <key> <value> | clear <key> | keys]', about: 'one site\'s settings for every Clear Glass feature (autofill, macros, workflows, passwords, network, resume, ClearDriver, Co-pilot, Guardian): each value and where it comes from',
    need: (a) => (!a.args[0] ? '<url> (or keys)' : a.args[1] === 'set' && a.args.length < 4 ? '<url> set <key> <value>' : a.args[1] === 'clear' && !a.args[2] ? '<url> clear <key>' : null),
    personOnly: (a) => (['set', 'clear'].includes(a.args[1]) && ['driver.allowed', 'mesh.enabled', 'guardian.listen', 'guardian.capture', 'network.via'].includes(a.args[2]) ? `${a.args[2]} limits what agents may do on a site: he changes it in Clear Glass (Site settings).` : null),
    req: (a) => {
      const cg = (method, path, body) => ({ system: 'clear-glass', method, path, ...(body ? { body } : {}) });
      if (a.args[0] === 'keys') return cg('GET', '/cli/site-profile');
      const url = /^[a-z]+:\/\//i.test(a.args[0]) ? a.args[0] : `https://${a.args[0]}/`;
      if (a.args[1] === 'set') { const raw = a.args.slice(3).join(' '); let value = raw; try { value = JSON.parse(raw); } catch (_) {} return cg('PUT', '/cli/site-profile', { url, key: a.args[2], value }); }
      if (a.args[1] === 'clear') return cg('DELETE', `/cli/site-profile?url=${encodeURIComponent(url)}&key=${encodeURIComponent(a.args[2])}`);
      return cg('GET', `/cli/site-profile?url=${encodeURIComponent(url)}`);
    },
    print: (d, a, h) => {
      if (d.ok === false) return console.log(h.c.amber(`  ${d.why || d.error}`));
      if (d.keys && !d.origin) { for (const k of d.keys) console.log(`  ${h.c.bold(k.key.padEnd(22))} ${k.type}${k.values ? ` (${k.values.join('|')})` : ''}  ${h.c.dim(k.does)}`); return; }
      if (d.key) return console.log(h.c.mint(`  ${d.origin || d.host}: ${d.key} = ${JSON.stringify(d.value === undefined ? null : d.value)}`));
      if (d.via) return console.log(h.c.mint(`  ${d.host}: network ${d.via}`));
      if (!d.origin) return console.log(h.c.dim('  not a website: no site settings'));
      console.log(h.c.bold(`  ${d.origin}`));
      for (const f of ['autofill', 'macros', 'workflows', 'passwords', 'resume', 'driver', 'mesh', 'guardian']) for (const [k, v] of Object.entries(d[f] || {})) { const from = (d.from || {})[`${f}.${k}`]; console.log(`  ${`${f}.${k}`.padEnd(22)} ${JSON.stringify(v)}  ${from === 'site' ? h.c.mint('this site') : h.c.dim(from)}`); }
      console.log(`  ${'network.via'.padEnd(22)} ${(d.network || {}).via}  ${(d.network || {}).rule ? h.c.mint('this site') : h.c.dim('default')}`);
    } },
  { key: 'glass.processes', repo: false, usage: 'glass processes', about: 'what is running in Clear Glass: each process with its tabs and background tabs, memory and CPU (ending one is his, in the Processes window)',
    req: () => ({ system: 'clear-glass', method: 'GET', path: '/cli/processes' }),
    print: (d, a, h) => {
      const t = d.totals || {}; console.log(h.c.bold(`  ${t.processes || 0} processes · ${t.memoryMB || 0} MB · ${t.cpu || 0}% CPU · ${t.backgroundTabs || 0} background tabs`)); if (d.why) console.log(h.c.amber(`  ${d.why}`));
      for (const r of d.rows || []) { console.log(`  ${String(r.pid).padStart(6)} ${r.kind.padEnd(15)} ${String(r.memoryMB == null ? '?' : r.memoryMB).padStart(7)} MB ${String(r.cpu == null ? '?' : r.cpu).padStart(5)}%  ${h.c.dim(r.title || r.url || '')}`); for (const tb of (r.tabs || []).slice(1)) console.log(h.c.dim(`         └ ${tb.kind} ${tb.title || tb.url || ''} (page ${tb.webContentsId})`)); }
    } },
  { key: 'glass.activity', repo: false, usage: 'glass activity [--kind nav|bgtab|driver|macro|workflow|download|error|process] [--origin https://site] [--limit n]', about: 'what just happened in Clear Glass, newest first: pages loaded, background tabs, the driver, macros, workflows, downloads, errors',
    req: (a) => ({ system: 'clear-glass', method: 'GET', path: `/cli/activity?limit=${+a.flags.limit || 50}${a.flags.kind ? `&kind=${encodeURIComponent(a.flags.kind)}` : ''}${a.flags.origin ? `&origin=${encodeURIComponent(a.flags.origin)}` : ''}` }),
    print: (d, a, h) => { for (const e of d.events || []) console.log(`  ${new Date(e.ts).toLocaleTimeString()} ${(e.level === 'error' ? h.c.amber : (x) => x)(e.kind.padEnd(13))} ${e.what}  ${h.c.dim(e.by)}`); if (!(d.events || []).length) console.log(h.c.dim('  (nothing yet)')); } },
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
  // §0.59.3 — James: "maybe even like a raw idea dump. like where i can type it all or send it from a cli or copilot". Into the
  // Void through the running Idearium, his words verbatim (the Void never rewrites an idea). Several ideas at once: one per
  // line with --lines. Copilot reaches it through nexus.command ("dump …").
  { key: 'dump', repo: false, usage: 'dump <text…> [--lines]', about: 'drop an idea (or many, one per line with --lines) into the Void — verbatim, sorted later',
    need: (a) => (a.args.join(' ').trim() ? null : '<text>'),
    req: (a) => {
      const text = a.args.join(' ').trim();
      const many = a.flags.lines ? text.split(/\s*(?:\n|\\n|;;)\s*/).map(t => t.trim()).filter(Boolean) : [text];
      if (many.length === 1) return { method: 'POST', path: '/api/void/idea', body: { text: many[0] } };
      return { method: 'POST', path: '/api/void/ideas', body: { texts: many } };
    },
    print: (d, a, h) => { const n = d.ideas ? d.ideas.length : 1; console.log(`${h.c.mint('✓')} ${n} idea${n === 1 ? '' : 's'} in the Void${d.idea ? h.c.dim(`  ${d.idea.uuid}`) : ''}`); } },
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
      console.log(h.c.dim('\n  full report: idearium census --report'));
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
  // ── 0.59.12 — James: "the nexus> is for you. not me. give yourself the tools using nexus>. dude...." What the agent in a
  //    chat Clear Glass watches needs to work on his machine: show him a page, and read (never write) logs, files and the
  //    tree. `local` rows run in the process that hears the line (lib/nexus-read.js); secrets refused, keys redacted. ──
  { key: 'glass.open', repo: false, usage: 'glass open <url>', about: 'show James a page in Clear Glass: the window already on that site comes to the front, else the main window goes there, else a new one',
    need: (a) => (a.args[0] ? null : '<url>'),
    req: (a) => ({ system: 'clear-glass', method: 'POST', path: '/cli/open', body: { url: /^[a-z][\w+.-]*:\/\//i.test(a.args[0]) ? a.args[0] : `${/^(?:localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(a.args[0]) ? 'http' : 'https'}://${a.args[0]}` } }),   // a local system is plain http
    print: (d) => console.log(`  ${d.reused ? 'brought to the front' : d.navigated ? 'the main window went to' : 'opened'} ${d.url}${d.agentId ? `  (window ${d.agentId})` : ''}`) },
  { key: 'log', repo: false, usage: 'log [autopilot|errors|<path>.log] [--lines n] [--grep pattern]', about: 'the end of a Nexus log (autopilot by default; errors = data/error.log), keys redacted',
    maxChars: 8000,
    local: (a) => require('../../lib/nexus-read.js').tailLog(a.args[0] || 'autopilot', { lines: a.flags.lines, grep: a.flags.grep }),
    print: (d) => console.log(d.text) },
  { key: 'file', repo: false, usage: 'file <path> [--from n] [--lines n]', about: 'read a file (or list a folder) of the Nexus tree, numbered — never a secret, under data/ only logs',
    need: (a) => (a.args[0] ? null : '<path>'), maxChars: 8000,
    local: (a) => require('../../lib/nexus-read.js').readFile(a.args[0], { from: a.flags.from, lines: a.flags.lines }),
    print: (d) => console.log(d.text) },
  { key: 'grep', repo: false, usage: 'grep <pattern> [--path dir] [--limit n]', about: 'search the Nexus code for a pattern: file:line: text (no node_modules, data or archive)',
    need: (a) => (a.args[0] ? null : '<pattern>'), maxChars: 8000,
    local: (a) => require('../../lib/nexus-read.js').grep(a.args.join(' '), { path: a.flags.path, limit: a.flags.limit }),
    print: (d) => console.log(d.text) },
  // §0.60.60 NP9 — James, 2026-10-15: "add support for snowflake, using cli, then you can add the commands to the agents, or make agent tools."
  // Routes and the Snowflake/Tor transport (clear-glass/src/net). Reading is open to agents; CHANGING a route or the transport is a person's act
  // (an agent that could remove a rule could quietly send his traffic direct), so personOnly refuses it for the nexus.command tool.
  // §0.60.85 PI5b — James, 2026-10-16: "build it." The chat crawler (clear-glass/src/chats/): CLI first, then Settings. Starting it is a person's act.
  { key: 'chat-crawl', repo: false, usage: 'chat-crawl <status|start|stop> [<provider:accountId>]', about: 'the personal-chat crawler: reads an account\'s chat list, then each chat once, then only new or changed ones; off until the account\'s switch is on in Settings > Chat capture',
    need: (a) => { const v = a.args[0] || 'status'; if ((v === 'start' || v === 'stop') && !a.args[1]) return '<provider:accountId> (like chatgpt:a1)'; return null; },
    personOnly: (a) => (['start', 'stop'].includes(a.args[0]) ? 'starting the crawler visits his own account\'s chats at volume: it is his call, per account. Ask him to run it or switch the account on in Settings > Chat capture.' : null),
    req: (a) => { const v = a.args[0] || 'status'; const cg = (method, path, body) => ({ system: 'clear-glass', method, path, ...(body ? { body } : {}) });
      if (v === 'start') return cg('POST', '/cli/chats/crawl/start', { account: a.args[1], ...(a.flags.partition ? { partition: String(a.flags.partition) } : {}) });
      if (v === 'stop') return cg('POST', '/cli/chats/crawl/stop', { account: a.args[1] });
      return cg('GET', '/cli/chats/crawl/status' + (a.args[1] ? `?account=${encodeURIComponent(a.args[1])}` : '')); },
    print: (d, a, h) => {
      if (d.ok === false) { console.log(`${h.c.amber('✗')} ${d.error || 'failed'}`); return; }
      const one = (x) => { const au = x.audit || {}; console.log(`  ${(x.account || '').padEnd(16)} ${x.running ? 'running' : 'idle   '} ${String(x.phase || '').padEnd(10)} ${x.status || ''}${x.pausedReason ? ` (${x.pausedReason})` : ''} · listed ${au.listed || 0} · logged ${au.logged || 0} · failed ${(au.failed || []).length} · pending ${(au.pending || []).length}${au.nothingMissed ? ' · nothing missed' : ''}`); };
      if (d.started) console.log(`  started ${d.started}`); else if (d.stopping) console.log(`  stopping ${d.stopping}`); else if (d.accounts) { if (!d.accounts.length) console.log('  no crawler has been started in this session'); d.accounts.forEach(one); } else one(d); } },
  { key: 'nexus-release', repo: false, usage: 'nexus-release <status|fetch>', about: 'the latest Nexus release and COS: status says what is out, what COS has and what a fetch would do (downloads nothing); fetch puts the zip in COS\'s inbox, checked against the published SHA256SUMS. COS\'s update policy decides what happens next',
    need: () => null,
    personOnly: (a) => (a.args[0] === 'fetch' ? 'fetching a release puts new code on his machine (COS then installs it, and switches by itself under update.policy auto). It is his call: ask him to run it.' : null),
    req: (a) => { const v = a.args[0] || 'status'; if (v === 'fetch') return { system: 'clear-glass', method: 'POST', path: '/cli/releases/fetch', body: {}, timeoutMs: 600000 }; return { system: 'clear-glass', method: 'GET', path: '/cli/releases/status', timeoutMs: 30000 }; },
    print: (d, a, h) => {
      if (d.ok === false) { console.log(`${h.c.amber('✗')} ${d.error || 'failed'}`); return; }
      if (d.action) { console.log(d.action === 'delivered' ? `  delivered ${d.version} (${(d.bytes / 1048576).toFixed(1)} MB) · ${d.reason}` : `  nothing to do: ${d.reason}`); return; }
      console.log(`  latest ${d.latest}${d.publishesChecksum ? '' : ' (publishes no SHA256SUMS)'} · COS has ${d.installed.length ? d.installed.join(', ') : 'nothing'}${d.current ? ` (current ${d.current})` : ''} · inbox ${d.inboxPending} waiting\n  a fetch would: ${d.would}`); } },
  // AB4 (0.60.183) — James, 2026-10-21: "can you make a full adblocker". The blocker's lists, sites and switch; `rules` (his own filters) is his.
  { key: 'adblock', repo: false, usage: 'adblock <status|on|off|lists|list <id> on|off|update [id|all]|import <file|folder|url> [--title T]|remove <id>|allow <site>|disallow <site>|check <url> [page]|rules "<filters>">',
    about: 'Clear Glass content blocker: status and rule counts, turn it on/off, choose filter lists (easylist, easyprivacy, peter-lowe, ublock, annoyances, cookies, builtin), update them, allow a site, test a URL. Rules are person-only.',
    personOnly: (a) => (a.args[0] === 'rules' ? 'his own filters are his to write: ask him (idearium adblock rules …, or the Ad Blocker page in the 🧩 panel)' : null),
    build: (a) => {
      const v = String(a.args[0] || 'status');
      if (v === 'on' || v === 'off') return { system: 'clear-glass', method: 'POST', path: '/cli/adblock/enabled', body: { on: v === 'on' } };
      if (v === 'list') return { system: 'clear-glass', method: 'POST', path: '/cli/adblock/list', body: { id: String(a.args[1] || ''), on: String(a.args[2] || 'on') !== 'off' }, timeoutMs: 120000 };
      if (v === 'update') return { system: 'clear-glass', method: 'POST', path: '/cli/adblock/update', body: { id: String(a.args[1] || 'all') }, timeoutMs: 180000 };
      if (v === 'allow' || v === 'disallow') return { system: 'clear-glass', method: 'POST', path: '/cli/adblock/allow', body: { site: String(a.args[1] || ''), on: v === 'allow' } };
      // AB5 (0.60.184) — his own lists: a file, a folder, or a list's URL; `remove <id>` drops one
      if (v === 'import') { const src = a.args.slice(1).join(' '); return /^https?:\/\//i.test(src) ? { system: 'clear-glass', method: 'POST', path: '/cli/adblock/import', body: { url: src, title: a.flags.title ? String(a.flags.title) : undefined }, timeoutMs: 120000 } : { system: 'clear-glass', method: 'POST', path: '/cli/adblock/import', body: { paths: [require('path').resolve(src)] }, timeoutMs: 120000 }; }
      if (v === 'remove') return { system: 'clear-glass', method: 'POST', path: '/cli/adblock/remove', body: { id: String(a.args[1] || '') } };
      if (v === 'check') return { system: 'clear-glass', method: 'GET', path: `/cli/adblock/check?url=${encodeURIComponent(String(a.args[1] || ''))}&page=${encodeURIComponent(String(a.args[2] || ''))}` };
      if (v === 'rules') return { system: 'clear-glass', method: 'POST', path: '/cli/adblock/rules', body: { text: a.args.slice(1).join(' ').replace(/\\n/g, '\n'), person: true } };
      return { system: 'clear-glass', method: 'GET', path: '/cli/adblock/status' };
    } },
  // BS7 (0.60.179) — James: "can you build a import for firefox profiles and cookies for clearglass.?" Listing is open; importing is his (cookies are sign-ins).
  { key: 'firefox', repo: false, usage: 'firefox <profiles|import [profile name or folder] [--no-cookies] [--bookmarks] [--persona] [--into default|ncp-<provider>]>',
    about: 'Firefox profiles on this machine, and a real import into Clear Glass: cookies (into the everyday session or a provider tab), bookmarks, and the profile\'s user agent',
    personOnly: (a) => (a.args[0] === 'import' ? 'importing Firefox cookies brings in his sign-ins: a person\'s act. Ask him to run it.' : null),
    req: (a) => {
      const v = a.args[0] || 'profiles'; const f = a.flags;
      if (v === 'import') return { system: 'clear-glass', method: 'POST', path: '/cli/firefox/import', body: { profile: a.args.slice(1).join(' '), cookies: !f['no-cookies'], bookmarks: !!f.bookmarks, persona: !!f.persona, into: f.into ? String(f.into) : 'default' }, timeoutMs: 120000 };
      return { system: 'clear-glass', method: 'GET', path: '/cli/firefox/profiles' };
    },
    print: (d, a, h) => {
      if (d.ok === false && !d.cookies) { console.log(`${h.c.amber('✗')} ${d.error || (d.errors || []).join('; ') || 'failed'}`); return; }
      if ((a.args[0] || 'profiles') === 'profiles') {
        for (const p of d.profiles || []) console.log(`  ${p.isDefault ? h.c.mint('●') : ' '} ${p.name.padEnd(24)} ${['cookies', 'places', 'prefs'].filter(k => p.has && p.has[k]).join(' ')}\n      ${h.c.dim(p.path)}`);
        if (!(d.profiles || []).length) console.log(h.c.dim(`  no Firefox profile found; looked in:\n    ${(d.looked || []).join('\n    ')}`));
        return;
      }
      const c = d.cookies, b = d.bookmarks;
      console.log(`${h.c.mint('✓')} ${d.profile} → ${d.into}`);
      if (c) console.log(`  cookies   ${c.imported} of ${c.read} imported · skipped: ${Object.entries(c.skipped).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`);
      if (b) console.log(`  bookmarks ${b.added} added, ${b.existing} already there`);
      if (d.persona) console.log(`  persona   ${d.persona.userAgent ? 'user agent applied' : 'no user agent override'}${d.persona.languages ? ` · languages ${d.persona.languages}` : ''}`);
      for (const e of d.errors || []) console.log(h.c.amber(`  ${e}`));
    } },
  { key: 'net', repo: false, usage: 'net <status|routes|lists|import <file|folder> [--via transport|direct|block] [--list name]|unlist <name>|resolve <url>|add <id> --via V [--provider p] [--url pattern] [--origin host] [--caller c] [--protocols https,wss] [--on-failure block]|rm <id>|default <via>|start|stop [--wipe]|detect|bridge <line>|bridges|builtin|use <n>|https-only on|off|check|quarantine|release <id>|discard <id>|handoff <id>|on-disconnect block|kill_tabs|kill_compartment|qbit [check] [--url U] [--user U] [--pass P]|paths --tor P --snowflake P|test>',
    about: 'network routes and the Snowflake transport: which way each request goes (direct, block, transport, socks5://h:p), per provider, url, site or caller; start/stop the transport; fail closed',
    need: (a) => { const v = a.args[0] || 'status'; if (v === 'resolve' && !a.args[1]) return '<url>'; if (v === 'add' && (!a.args[1] || !a.flags.via)) return '<id> --via direct|block|transport|socks5://host:port'; if (v === 'rm' && !a.args[1]) return '<id>'; if (v === 'default' && !a.args[1]) return '<via>'; if (v === 'bridge' && !a.args[1]) return '<snowflake bridge line>'; if (v === 'use' && !a.args[1]) return '<n> (a number from net bridges)'; if (v === 'https-only' && !['on', 'off'].includes(a.args[1])) return 'on|off'; if (['release', 'discard', 'handoff'].includes(v) && !a.args[1]) return '<id> (from net quarantine)'; if (v === 'on-disconnect' && !['block', 'kill_tabs', 'kill_compartment'].includes(a.args[1])) return 'block|kill_tabs|kill_compartment'; return null; },
    personOnly: (a) => (['add', 'rm', 'import', 'unlist', 'default', 'start', 'stop', 'bridge', 'paths', 'use', 'https-only', 'builtin', 'release', 'discard', 'handoff', 'on-disconnect', 'qbit'].includes(a.args[0]) ? 'changing routes or the transport (or asking the Tor Project for bridges, which contacts it directly) is a person\'s act: an agent that could remove a rule could send his traffic direct. Ask him to run it.' : null),
    req: (a) => {
      const v = a.args[0] || 'status'; const f = a.flags; const cg = (method, path, body, timeoutMs) => ({ system: 'clear-glass', method, path, ...(body ? { body } : {}), ...(timeoutMs ? { timeoutMs } : {}) });
      if (v === 'status') return cg('GET', '/cli/net/status');
      if (v === 'routes') return cg('GET', '/cli/net/routes');
      if (v === 'resolve') return cg('POST', '/cli/net/resolve', { url: a.args[1], provider: f.provider, caller: f.caller });
      if (v === 'add') return cg('POST', '/cli/net/routes', { id: a.args[1], via: String(f.via), match: { ...(f.provider ? { provider: String(f.provider) } : {}), ...(f.url ? { urlPattern: String(f.url) } : {}), ...(f.origin ? { origin: String(f.origin) } : {}), ...(f.caller ? { caller: String(f.caller) } : {}) }, ...(f.protocols ? { protocols: String(f.protocols).split(',') } : {}), ...(f['on-failure'] ? { onFailure: String(f['on-failure']) } : {}), ...(f.incognito ? { incognito: true } : {}), ...(f.note ? { note: String(f.note) } : {}) });
      if (v === 'rm') return cg('POST', '/cli/net/routes/rm', { id: a.args[1] });
      // SF8 (0.60.184) — a host list (file or folder) as sites routed one way, transport unless --via says; `lists`, `unlist <name>`
      if (v === 'import') return { ...cg('POST', '/cli/net/routes/import', { paths: [require('path').resolve(a.args.slice(1).join(' '))], via: f.via ? String(f.via) : 'transport', ...(f.list ? { list: String(f.list) } : {}) }), timeoutMs: 120000 };
      if (v === 'lists') return cg('GET', '/cli/net/routes/lists');
      if (v === 'unlist') return cg('POST', '/cli/net/routes/lists/rm', { list: a.args.slice(1).join(' ') });
      if (v === 'default') return cg('POST', '/cli/net/default', { via: a.args[1] });
      if (v === 'start' || v === 'stop' || v === 'detect') return cg('POST', '/cli/net/transport', { action: v, wipe: !!f.wipe }, 30000);
      if (v === 'bridge') return cg('POST', '/cli/net/bridge', { line: a.args.slice(1).join(' ') });
      if (v === 'paths') return cg('POST', '/cli/net/paths', { ...(f.tor ? { torPath: String(f.tor) } : {}), ...(f.snowflake ? { snowflakePath: String(f.snowflake) } : {}) });
      if (v === 'bridges') return cg('GET', '/cli/net/bridge/find');   // SF2 (0.60.178): real lines found on this machine, numbered
      if (v === 'builtin') return cg('POST', '/cli/net/bridge/builtin', {}, 30000);
      if (v === 'use') return cg('POST', '/cli/net/bridge/use', { n: Number(a.args[1]) });
      if (v === 'https-only') return cg('POST', '/cli/net/https-only', { on: a.args[1] === 'on' });
      if (v === 'check') return cg('POST', '/cli/net/check', {}, 60000);   // SF5: does the circuit exit through Tor (check.torproject.org)
      if (v === 'quarantine') return cg('GET', '/cli/net/quarantine');   // CD5 (0.60.179): what routed windows downloaded, and the magnets they met
      if (v === 'release') return cg('POST', '/cli/net/quarantine/release', { id: a.args[1] });
      if (v === 'discard') return cg('POST', '/cli/net/quarantine/discard', { id: a.args[1] });
      if (v === 'handoff') return cg('POST', '/cli/net/magnet/handoff', { id: a.args[1] }, 30000);
      if (v === 'on-disconnect') return cg('POST', '/cli/net/on-disconnect', { rung: a.args[1] });
      if (v === 'qbit') return a.args[1] === 'check' ? cg('POST', '/cli/net/qbit/check', {}, 30000) : cg('POST', '/cli/net/qbit', { ...(f.url ? { url: String(f.url) } : {}), ...(f.user !== undefined ? { user: String(f.user) } : {}), ...(f.pass !== undefined ? { pass: String(f.pass) } : {}) });
      if (v === 'test') return cg('POST', '/cli/net/test', {});
      return cg('GET', '/cli/net/status');
    },
    print: (d, a, h) => {
      if (d.ok === false) { console.log(`${h.c.amber('✗')} ${d.error || 'failed'}`); return; }
      const v = a.args[0] || 'status';
      if (v === 'status') { const t = d.transport || {}; console.log(`  default ${d.default} · ${d.rules} rule${d.rules === 1 ? '' : 's'} · transport ${t.state}${t.state === 'bootstrapping' ? ` ${t.progress}%` : ''}${t.socksPort ? ` (socks 127.0.0.1:${t.socksPort})` : ''}${t.error ? h.c.amber(`  ${t.error}`) : ''}`); const m = (d.detect || {}).missing || []; if (m.length) console.log(h.c.dim(`  to start the transport, still needed: ${m.join(', ')}`)); console.log(h.c.dim(`  ${d.verifiedWhy ? 'not verified: ' + d.verifiedWhy : ''}\n  ${d.note || ''}`)); return; }
      if (v === 'routes') { console.log(`  default → ${d.default}`); for (const r of d.rules || []) console.log(`  ${r.id.padEnd(18)} ${r.via.padEnd(22)} ${Object.entries(r.match).map(([k, x]) => `${k}=${x}`).join(' ')}${r.protocols ? ` [${r.protocols.join(',')}]` : ''}`); if (!(d.rules || []).length) console.log(h.c.dim('  no rules: nothing is routed, everything goes direct')); return; }
      if (v === 'resolve') { console.log(d.ok ? `  ${a.args[1]} → ${d.via}   ${h.c.dim(d.why)}` : `  ${h.c.amber('collision')}: ${d.why}`); return; }
      if (v === 'bridges' || v === 'builtin') { for (const c of d.lines || []) console.log(`  ${String(c.n).padStart(2)}  ${c.source.padEnd(20)} ${c.line.slice(0, 70)}${c.line.length > 70 ? '…' : ''}\n      ${h.c.dim(c.path || '')}`); if (!(d.lines || []).length) console.log(h.c.dim('  no Snowflake bridge line on this machine: install Tor Browser, run net setup, or ask the Tor Project with net builtin')); else console.log(h.c.dim('  net use <n> sets one')); if (d.torBrowser) console.log(h.c.dim(`  Tor Browser at ${d.torBrowser.dir}`)); return; }
      if (v === 'quarantine') { for (const q of d.items || []) console.log(`  ${q.id.padEnd(18)} ${q.kind.padEnd(7)} ${String(q.state).padEnd(12)} ${q.filename}${q.via ? h.c.dim(`  via ${q.via}`) : ''}`); if (!(d.items || []).length) console.log(h.c.dim('  nothing quarantined')); console.log(h.c.dim(`  on disconnect: ${d.onDisconnect}${(d.kills || []).length ? ` · last kill ${new Date(d.kills[0].at).toLocaleString()} (${d.kills[0].rung})` : ''}`)); return; }
      if (v === 'check') { console.log(d.ok ? (d.isTor ? `${h.c.mint('✓')} exits through Tor (${d.ip})` : `${h.c.amber('✗')} NOT through Tor: check.torproject.org saw ${d.ip}`) : `${h.c.amber('✗')} ${d.error}`); return; }
      console.log(`${h.c.mint('✓')} ${JSON.stringify(d).slice(0, 300)}`);
    } },
];

/**
 * ASK — the plain words that mean a row (0.59.11 TN2). James: "make it useful like; hooked into copilot so you can talk to
 * nexus". copilot/lib/nexus-ask.js matches a message against these, in this order, and runs the row: no model, so it
 * answers with Ollama down. Each entry: re (tested against the whole message), flags(m, text)/args(m, text) → what the
 * words imply. Only rows named here are reachable by plain words; the one that writes (dump) needs his "idea:" first.
 * Attached to the rows as row.ask, so the table stays the one place a command is described.
 */
export const ASK = {
  'dump': { re: /^\s*(?:new\s+)?idea\s*[:\-–]\s*([\s\S]+)$|^\s*(?:dump|save (?:this )?idea|remember (?:this )?idea)\s*[:\-–]\s*([\s\S]+)$/i,
    args: (m) => [(m[1] || m[2]).trim()] },
  'census': { re: /\bcensus\b|\b(?:what(?:'s| is| are)|which|show(?: me)?|list|how many)\b[^?.!\n]{0,30}\b(?:specs?|phases?)\b|\b(?:specs?|phases?)\b[^?.!\n]{0,20}\b(?:built|unbuilt|done|open|contradicted|claimed|verified|partial|status)\b|\bwhat(?:'s| is) (?:un)?built\b|\bunbuilt\b|\bwhat(?:'s| is) left(?: to (?:build|do))?\b/i,
    flags: (m, t) => {
      const f = { limit: 10 };
      if (/\bunbuilt|not built|isn'?t built\b/i.test(t)) f.specs = 'unbuilt';
      else if (/\bpartial|half/i.test(t)) f.specs = 'partial';
      else if (/\bunregistered|not (?:in )?(?:the )?registry\b/i.test(t)) f.specs = 'unregistered';
      else if (/\bcontradict|gone|missing files?\b/i.test(t)) f.verdict = 'contradicted';
      else if (/\bopen (?:phases?|work)\b|\bphases?\b[^?.!\n]{0,12}\bopen\b|\bwhat(?:'s| is) left\b/i.test(t)) f.verdict = 'open';
      else if (/\bclaimed|unproven|not proven\b/i.test(t)) f.verdict = 'claimed';
      return f;
    } },
  'models': { re: /\b(?:what|which|list|show(?: me)?)\b[^?.!\n]{0,20}\b(?:(?:ollama|llm|local) models?|models)\b|\b(?:ollama )?models?\b[^?.!\n]{0,12}\b(?:installed|loaded|fit|available)\b/i },
  'perf': { re: /\b(?:how(?:'s| is| much)|what(?:'s| is))\b[^?.!\n]{0,20}\b(?:memory|ram|cpu|heap|load)\b|\b(?:memory|ram|cpu|heap)\b[^?.!\n]{0,12}\b(?:usage|free|left|use)\b|\bperf(?:ormance)?\b|\bhow(?:'s| is) (?:the |my )?(?:machine|computer|pc|box)\b/i },
  'activity': { re: /\bwhat(?:'s| has)? (?:been )?happen(?:ing|ed)\b|\brecent activity\b|\bactivity log\b|\bwhat (?:did|have) (?:the )?agents? (?:do|done|been doing)\b|\bwhat failed\b/i,
    flags: (m, t) => ({ limit: 15, ...(/\bfail/i.test(t) ? { status: 'failed' } : {}) }) },
  'nerve': { re: /\bnerve\b|\bwhich systems (?:are )?(?:up|live|present|running|online)\b|\bwhat(?:'s| is) (?:up|running|online)\b|\bis (?:everything|nexus) (?:up|running|online)\b/i },
  'store': { re: /\b(?:memory |shared )?store\b[^?.!\n]{0,12}\b(?:size|big|tables?)\b|\bhow big is (?:the )?(?:store|memory)\b|\btable sizes?\b/i },
  'picks': { re: /\bwhat (?:did|have) i (?:pick|picked|hand(?:ed)?)\b|\b(?:my|the) picks\b|\bpicked elements?\b/i },
  'access': { re: /\bwho am i\b|\baccess mode\b|\bam i signed in\b/i },
  'ollama.tape': { re: /\bollama (?:tape|calls|runs|history)\b|\bwhat (?:did|has) ollama (?:do|done|say|said)\b/i },
  'field.windows': { re: /\bwhat(?:'s| is) (?:each|every) window (?:doing|showing|on)\b|\bfield windows\b|\bwhere(?:'s| is) (?:the )?attention\b/i },
};
for (const [k, ask] of Object.entries(ASK)) { const row = SPEC.find(r => r.key === k); if (row) row.ask = ask; }

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
// §0.60.173 UP3 — one upload as he answers it: where each file would go, why, how sure, its system, and what it touches
function _printUpload(d, h) {
  const p = d.plan || {}; const st = p.stats || {};
  console.log(`  ${d.state === 'needs-you' ? h.c.amber('⚑ needs you') : h.c.dim(d.state || '')}  ${d.uuid}  ${d.name || ''}  ${h.c.dim(`"${d.intent || ''}"`)}`);
  console.log(h.c.dim(`  ${st.files || 0} file(s): ${st.create || 0} new · ${st.replace || 0} replace · ${st.identical || 0} identical · ${st.learned || 0} by his earlier answers${st.conflicts ? ` · ${st.conflicts} conflict(s)` : ''}${p.strip && p.strip.wrapper ? ` · wrapper "${p.strip.wrapper}/" stripped` : ''}${(p.intentSystems || []).length ? ` · the intent names ${p.intentSystems.join(', ')}` : ''}`));
  for (const r of p.rows || []) {
    const sure = r.confidence >= 0.8 ? h.c.mint : r.confidence >= 0.5 ? h.c.amber : h.c.coral;
    console.log(`  ${sure(r.action.padEnd(9))} ${r.from} → ${h.c.bold(r.to)}  ${h.c.dim(`[${r.system}${r.systemExists ? '' : ' (new system)'}] ${r.why} ${Math.round(r.confidence * 100)}%`)}${r.conflict ? h.c.coral(`  same path as ${r.conflict}`) : ''}`);
    if (r.risk) console.log(h.c.amber(`      ${r.risk}`));
    for (const w of r.warnings || []) console.log(h.c.amber(`      ${w}`));
    if ((r.requiredBy || []).length) console.log(h.c.dim(`      required by ${r.requiredBy.slice(0, 4).join(', ')}${r.requiredBy.length > 4 ? ` +${r.requiredBy.length - 4}` : ''}`));
    if ((r.alternatives || []).length) console.log(h.c.dim(`      or: ${r.alternatives.slice(0, 3).map(x => `${x.to} (${x.why})`).join(' · ')}`));
  }
  for (const s of p.skipped || []) console.log(h.c.dim(`  – ${s.from}: ${s.why}`));
  if (d.state === 'needs-you') console.log(h.c.dim(`\n  next: idearium repo upload-answer <repo> ${d.uuid}  [--to "from=path"] [--skip "from"]`));
}

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
/** _lines('12-40') → { from, to } · '12' → { from: 12, to: 12 } · nothing → null · anything else → { error } */
function _lines(v) {
  if (v == null || v === true) return null;
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(v).trim());
  if (!m) return { error: `lines as a-b (e.g. 12-40), not ${v}` };
  const from = +m[1], to = +(m[2] || m[1]);
  return from >= 1 ? { from: Math.min(from, to), to: Math.max(from, to) } : { error: 'lines start at 1' };
}
function _printSurface(d, a, h) {
  if (!d.open) console.log(h.c.gray('  no file open'));
  else console.log(`  ${h.c.bold(d.open)}${d.sel ? h.c.dim(`  lines ${d.sel.from}–${d.sel.to}`) : ''}${d.chunk ? h.c.dim(`  chunk ${d.chunk}`) : ''}`);
  if (d.lines) console.log(d.lines.text.split('\n').map((l, i) => `${h.c.dim(String(d.lines.from + i).padStart(5))}  ${l}`).join('\n'));
  if ((d.pending || []).length) { console.log(h.c.dim(`  ${d.pending.length} proposal${d.pending.length === 1 ? '' : 's'} waiting:`)); for (const p of d.pending.slice(0, 20)) console.log(`    ${ICON.proposed} ${p.op === 'delete' ? 'delete ' : ''}${p.path}  ${h.c.gray(p.uuid)}`); }
  if (d.run) console.log(h.c.dim(`  run ${d.run.status} · attempt ${d.run.attempt} · ${d.run.steps} steps — ${d.run.goal}${d.run.next ? ` · next: ${d.run.next}` : ''}`));
  console.log(h.c.dim(`  set by ${d.by || 'nobody yet'}${d.updatedAt ? ` · ${when(d.updatedAt)}` : ''} · rev ${d.rev || 0}`));
}

export function makeRouteCommands(h) {
  const out = {};
  for (const row of SPEC) {
    out[row.key] = async (os, { positional = [], flags = {} } = {}) => {
      const repo = row.repo ? (positional[0] ? h.findRepo(positional[0]) : h.die(`usage: idearium ${row.usage}`)) : null;
      const a = { repo, args: row.repo ? positional.slice(1) : positional, flags };
      const missing = row.need ? row.need(a) : null;
      if (missing) h.die(`${missing} is needed — usage: idearium ${row.usage}`);
      if (row.local) { const d = await row.local(a); if (d && d.error) h.die(d.error); if (flags.json) { process.stdout.write(`${JSON.stringify(d, null, 2)}\n`); return; } row.print(d, a, h); return; }   // 0.59.12
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

/**
 * renderText(row, d, a) → the row's own print(), as plain text (0.59.11 TN1). Outside the terminal a command's answer was
 * raw JSON; the pane, a watched chat and an agent now read what the terminal shows, without colour. print() is
 * synchronous: console.log and stdout are captured for its call only. A printer that throws gives null (the caller keeps
 * the JSON).
 */
const _plain = new Proxy({}, { get: () => (s) => String(s) });
export function renderText(row, d, a = { repo: null, args: [], flags: {} }) {
  const out = [];
  const h = { c: _plain, header: (t) => out.push(String(t)), shortRepo: (u) => String(u || '').split('-repo-')[1] || String(u || '').slice(0, 8),
    die: (m) => { throw new Error(m); }, port: process.env.IDEARIUM_PORT || 4800, api: () => { throw new Error('not here'); }, findRepo: () => null };
  const log = console.log, write = process.stdout.write;
  console.log = (...x) => out.push(x.join(' '));
  process.stdout.write = (chunk) => { out.push(String(chunk).replace(/\n$/, '')); return true; };
  try { row.print(d && d.data && !d.tasks && !d.rows ? { ...d, ...d.data } : d, { repo: null, args: [], flags: {}, ...a }, h); }
  catch (_) { return null; }
  finally { console.log = log; process.stdout.write = write; }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();
}

/** helpLines() — one line per command group, for `idearium help` */
export function helpLines() { return SPEC.map(r => [r.usage, r.about]); }
