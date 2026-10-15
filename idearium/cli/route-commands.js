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
  // 0.60.7 — Versionium managed per repo (lib/repo-history.js) and the import checks (lib/import-checks.js)
  // 0.60.8 — intent routing for reasoning (lib/reasoning-route.js)
  // 0.60.34 VR1 — James: "i also want versions in idearium, github, and each zip, needs to match."
  // 0.60.41 RN1 — Nexus's own releases, recorded in Versionium (lib/nexus-releases.js): James's words, the proof, the commit
  { key: 'system.releases', repo: false, usage: 'releases [--sync] [--limit n] [--version x.y.z]', about: 'every Nexus release, newest first, from Versionium: James\'s words, the git commit, the changelog; --sync records any missing',
    req: (a) => a.flags.sync ? { method: 'POST', path: '/api/releases/sync', timeoutMs: 120000, body: {} } : { method: 'GET', path: '/api/releases' },
    print: (d, a, h) => {
      if (a.flags.sync) { console.log(`  ${d.releases} releases: ${h.c.mint(`${d.recorded} recorded`)} · ${d.already} already · ${d.unpinned} without a git commit in this clone${d.refused && d.refused.length ? h.c.coral(` · ${d.refused.length} refused`) : ''}`); return; }
      let l = d.releases || [];
      if (a.flags.version) l = l.filter(r => r.version === String(a.flags.version).replace(/^v/, ''));
      if (!l.length) { console.log(h.c.gray('  no releases in Versionium yet — idearium releases --sync')); return; }
      for (const r of l.slice(0, parseInt(a.flags.limit || '15', 10) || 15)) {
        console.log(`  ${h.c.mint(r.tag.padEnd(10))} ${h.c.dim(r.gitCommit ? r.gitCommit.slice(0, 7) : 'no commit')}  ${r.changelog ? h.c.dim(r.changelog) : ''}${r.version === d.current ? h.c.amber('  ← running') : ''}`);
        if (r.quote) console.log(`    ${h.c.sky(String(r.quote).slice(0, 180))}`);
        if (a.flags.version && r.notes) console.log(h.c.dim(`    ${r.notes}`));
      }
    } },
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
  { key: 'repo.contract', repo: true, usage: 'repo contract <repo> <phase> [--map name] [--gate id]', about: 'a phase build\'s contract, audited: every brick (its agent, attempts, verification, the commit it passed at, a rewind), every dependency, checkpoint and gate; --gate compares one gate now against what passed',
    need: (a) => (a.args.length ? null : '<phase>'),
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/contract?phase=${encodeURIComponent(a.args[0])}${a.flags.map ? `&map=${encodeURIComponent(a.flags.map)}` : ''}${a.flags.gate ? `&gate=${encodeURIComponent(a.flags.gate)}` : ''}` }),
    print: (d, a, h) => { if (d.compare) { const c = d.compare; console.log(`  ${c.gate}: ${c.stale ? h.c.amber('STALE') : c.status}${c.commit ? h.c.dim(`  passed at ${c.commit}`) : h.c.dim('  no commit recorded')}`); for (const r of c.reasons || []) console.log(h.c.dim(`    · ${r}`)); for (const [f, dd] of Object.entries(c.diff || {})) { console.log(`  ${f}`); const pt = dd && dd.files && dd.files[0]; console.log(h.c.dim(pt && pt.patch ? String(pt.patch).split('\n').slice(0, 30).join('\n') : (dd && dd.error) || '    no change since it passed')); } return; } const au = d.audit; for (const b of au.bricks) console.log(`  ${(b.status === 'PASSED' ? h.c.mint : h.c.amber)(String(b.status).padEnd(7))} ${b.file || b.id}${b.agent ? h.c.dim(` · ${b.agent}`) : ''}${b.attempts ? h.c.dim(` · ${b.attempts} attempt(s)`) : ''}${b.tag ? h.c.dim(` · ${b.tag}`) : ''}${b.class && b.status !== 'PASSED' ? h.c.amber(` · ${b.class}`) : ''}${b.blocked ? h.c.amber(` · ${b.blocked}`) : ''}`); if (d.progress) console.log(h.c.dim(`  progress: ${d.progress.passed}/${d.progress.total} passed · ${d.progress.moves} moves${d.progress.last ? ` · last ${d.progress.last.gate} ${d.progress.last.status}` : ''}`)); console.log(h.c.dim(`  ${au.dependencies.length} dependencies · ${au.checkpoints.length} checkpoints · ${au.gates.length} gates · ${d.file}`)); console.log(`  ${au.complete ? h.c.mint('complete') : h.c.amber('not complete')}: ${(au.why || []).join('; ')}`); } },
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
  // 0.60.27 AG1a — "as little as possible", counted: agent calls (plan · code · review), local vs remote, tokens
  { key: 'repo.cost', repo: true, usage: 'repo cost <repo> [phase] [--map name]', about: 'what each phase cost in agent calls and tokens: plan, code and review calls, local vs remote, tokens in and out (estimated), per run',
    req: (a) => ({ method: 'GET', path: `/api/repos/${a.repo.uuid}/phases/cost${a.args[0] ? `?phase=${encodeURIComponent(a.args[0])}${a.flags.map ? `&map=${encodeURIComponent(a.flags.map)}` : ''}` : ''}` }),
    print: (d, a, h) => {
      if (d.cost) { console.log(`  ${d.phase}: ${d.line}`); for (const r of d.cost.runs) console.log(h.c.dim(`    ${r.runId} · ${r.calls} call(s) · ${Object.entries(r.byAgent).map(([k, v]) => `${k} ×${v}`).join(', ')} · ~${r.tokensIn} in / ~${r.tokensOut} out`)); if (d.cost.method) console.log(h.c.dim(`  tokens: ${d.cost.method}`)); return; }
      console.log(`  all phases: ${d.line}`); for (const p of d.phases) console.log(`  ${String(p.phase).padEnd(12)} ${h.c.dim(p.line)}`);
    } },
  // 0.60.20 — lean mode, the same switch as Idearium → Settings → Routing (every agent has it through nexus.command)
  { key: 'system.lean', repo: false, usage: 'system lean [on|off]', about: 'lean mode: stop the services a build does not use (now and at every start), or start them again',
    req: (a) => (a.args[0] ? { method: 'POST', path: '/api/system/lean', body: { on: a.args[0] === 'on', actor: 'command' } } : { method: 'GET', path: '/api/system/lean' }),
    print: (d, a, h) => { console.log(`  lean ${d.on ? h.c.mint('on') : h.c.amber('off')} · ${d.hold.join(', ')}`); for (const r of d.results || d.services || []) console.log(h.c.dim(`    ${r.name} ${r.running != null ? (r.running ? 'running' : 'stopped') : (r.ok ? r.status || 'ok' : `failed: ${r.error}`)}`)); if (d.note) console.log(h.c.dim(`  ${d.note}`)); } },
  // 0.60.25 — the account fallback chain per provider (same as Idearium → Settings → Routing → Accounts)
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
  { key: 'net', repo: false, usage: 'net <status|routes|resolve <url>|add <id> --via V [--provider p] [--url pattern] [--origin host] [--caller c] [--protocols https,wss] [--on-failure block]|rm <id>|default <via>|start|stop [--wipe]|detect|bridge <line>|paths --tor P --snowflake P|test>',
    about: 'network routes and the Snowflake transport: which way each request goes (direct, block, transport, socks5://h:p), per provider, url, site or caller; start/stop the transport; fail closed',
    need: (a) => { const v = a.args[0] || 'status'; if (v === 'resolve' && !a.args[1]) return '<url>'; if (v === 'add' && (!a.args[1] || !a.flags.via)) return '<id> --via direct|block|transport|socks5://host:port'; if (v === 'rm' && !a.args[1]) return '<id>'; if (v === 'default' && !a.args[1]) return '<via>'; if (v === 'bridge' && !a.args[1]) return '<snowflake bridge line>'; return null; },
    personOnly: (a) => (['add', 'rm', 'default', 'start', 'stop', 'bridge', 'paths'].includes(a.args[0]) ? 'changing routes or the transport is a person\'s act: an agent that could remove a rule could send his traffic direct. Ask him to run it.' : null),
    req: (a) => {
      const v = a.args[0] || 'status'; const f = a.flags; const cg = (method, path, body, timeoutMs) => ({ system: 'clear-glass', method, path, ...(body ? { body } : {}), ...(timeoutMs ? { timeoutMs } : {}) });
      if (v === 'status') return cg('GET', '/cli/net/status');
      if (v === 'routes') return cg('GET', '/cli/net/routes');
      if (v === 'resolve') return cg('POST', '/cli/net/resolve', { url: a.args[1], provider: f.provider, caller: f.caller });
      if (v === 'add') return cg('POST', '/cli/net/routes', { id: a.args[1], via: String(f.via), match: { ...(f.provider ? { provider: String(f.provider) } : {}), ...(f.url ? { urlPattern: String(f.url) } : {}), ...(f.origin ? { origin: String(f.origin) } : {}), ...(f.caller ? { caller: String(f.caller) } : {}) }, ...(f.protocols ? { protocols: String(f.protocols).split(',') } : {}), ...(f['on-failure'] ? { onFailure: String(f['on-failure']) } : {}), ...(f.incognito ? { incognito: true } : {}), ...(f.note ? { note: String(f.note) } : {}) });
      if (v === 'rm') return cg('POST', '/cli/net/routes/rm', { id: a.args[1] });
      if (v === 'default') return cg('POST', '/cli/net/default', { via: a.args[1] });
      if (v === 'start' || v === 'stop' || v === 'detect') return cg('POST', '/cli/net/transport', { action: v, wipe: !!f.wipe }, 30000);
      if (v === 'bridge') return cg('POST', '/cli/net/bridge', { line: a.args.slice(1).join(' ') });
      if (v === 'paths') return cg('POST', '/cli/net/paths', { ...(f.tor ? { torPath: String(f.tor) } : {}), ...(f.snowflake ? { snowflakePath: String(f.snowflake) } : {}) });
      if (v === 'test') return cg('POST', '/cli/net/test', {});
      return cg('GET', '/cli/net/status');
    },
    print: (d, a, h) => {
      if (d.ok === false) { console.log(`${h.c.amber('✗')} ${d.error || 'failed'}`); return; }
      const v = a.args[0] || 'status';
      if (v === 'status') { const t = d.transport || {}; console.log(`  default ${d.default} · ${d.rules} rule${d.rules === 1 ? '' : 's'} · transport ${t.state}${t.state === 'bootstrapping' ? ` ${t.progress}%` : ''}${t.socksPort ? ` (socks 127.0.0.1:${t.socksPort})` : ''}${t.error ? h.c.amber(`  ${t.error}`) : ''}`); const m = (d.detect || {}).missing || []; if (m.length) console.log(h.c.dim(`  to start the transport, still needed: ${m.join(', ')}`)); console.log(h.c.dim(`  ${d.verifiedWhy ? 'not verified: ' + d.verifiedWhy : ''}\n  ${d.note || ''}`)); return; }
      if (v === 'routes') { console.log(`  default → ${d.default}`); for (const r of d.rules || []) console.log(`  ${r.id.padEnd(18)} ${r.via.padEnd(22)} ${Object.entries(r.match).map(([k, x]) => `${k}=${x}`).join(' ')}${r.protocols ? ` [${r.protocols.join(',')}]` : ''}`); if (!(d.rules || []).length) console.log(h.c.dim('  no rules: nothing is routed, everything goes direct')); return; }
      if (v === 'resolve') { console.log(d.ok ? `  ${a.args[1]} → ${d.via}   ${h.c.dim(d.why)}` : `  ${h.c.amber('collision')}: ${d.why}`); return; }
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
