'use strict';
/**
 * cos/manager/cli.js — COS's own command line, over the manager's own functions (SC3, 0.60.380).
 * Spec: cos/spec/cos-manager.spec MOD-MG-CLI · Map: docs/2026-11-02-cos-console-phasemap.spec SC3_system_command_line, SC_D5.
 *
 * James, 2026-11-02: "Need the system cli."
 *
 * One table, run in COS's manager, so COS's console works with every other system down (§5.9; Idearium's cos.* rows reach the same routes
 * from outside). The verbs are the cos.* rows' verbs, so a person and an agent say the same thing. An agent's line is refused for an act
 * (it proposes: POST /api/cos/proposals); reading is anyone's.
 *
 *   createCli({ sup, resources, config, notices, proposals, addSystem, usage, disks }) → { run(line, { by }) → Promise<{ ok, lines[] }>, TABLE }
 */

const TABLE = [
  ['help', 'help [verb]', 'this table'],
  ['ps', 'ps', 'every system: state, pid, port, restarts'],
  ['open', 'open <system>', 'its own UI, in its Clear Glass compartment'],
  ['start', 'start <system>', 'start it'], ['stop', 'stop <system>', 'stop it'], ['restart', 'restart <system> | restart cos', 'restart it (cos: COS itself; its systems are handed over, not stopped)'],
  ['boot', 'boot [all|core]', 'boot the declared systems phase by phase'],
  ['logs', 'logs <system> [n]', 'its recent output (default 30 lines)'],
  ['config', 'config <system> [key=value …] | config <system> clear <key …>', 'its configuration; set or clear a setting (memory.limit=25%, cpu.limit=2cores, network.port=3760, env.FOO=bar …)'],
  ['caps', 'caps <system>', 'its caps as the OS applied them'],
  ['usage', 'usage', 'memory and CPU per system, read from the OS'],
  ['notices', 'notices [all] | notices read', 'the bell: unread notices (all: read ones too); read marks them all read'],
  ['proposals', 'proposals [all]', 'held acts waiting for you'],
  ['take', 'take <proposal-id>', 'take a held act'], ['drop', 'drop <proposal-id> [why]', 'drop it'],
  ['add', 'add <name> <folder> [cmd=node] [args=server.js] [port=<n>] [health=/health]', 'add a system: a proposal, taken by you'],
  ['disk', 'disk <system> [make] [state] | disk verify <file>', 'a system\'s disks (its spec as metadata, its files in one compressed file); make one, with its data if you say state; verify one'],
  ['disks', 'disks', 'every disk COS holds'],
  // 0.60.517 — James, 2026-11-13: "also all pipelines in nexus need to be here." Every .pipeline file in Nexus imported into the engine, now
  // GR0 (2026-11-13) — his "find them.": every graph in Nexus, read from the tree
  ['census', 'census graph [--md]', 'every graph Nexus keeps: its store, what its edges rest on, the files that write and read it, its rows on this machine\'s data; --md prints the atlas page'],
  // CA7 slice a (2026-11-13), his "can be moved anbd changed in each systems individual settings"
  // PC13 (2026-11-13) — James: "need the pipeline building all of my requests."
  ['request', 'request <your words> | request answer <run> <gap-id> <your answer>', 'your request built by the pipeline: what it means and its gaps (asked of you), a phase written from your words, then built (Ollama first); the run shows in Automation'],
  // CH1 (0.60.532) — James, 2026-11-14: "the console in cos, is supposed to hook into each system, and agent. floating menu 3 way cli, nexus-cli, etc."
  ['ask', 'ask [@ollama|@copilot|@guardian[:agent]] <your words>   (or: @ollama <your words>)', 'ask an agent, by the floating menu\'s own route (copilot\'s three ways); copilot is woken if asleep; default @copilot'],
  ['raid', 'raid <your words>', 'hand your words to RAID: kept as a .input node, drafted into a contract, its gaps asked of you; any line COS\'s table does not know goes the same way'],
  ['location', 'location [system]', 'where each system lives on this machine, its size, and whether it can be moved (and what holds it if not)'],
  ['pipeline-sync', 'pipeline-sync', 'import every pipeline in Nexus into the Automation tab now: COS\'s own files and each system\'s, by its route; a system that does not answer is named'],
  // AE7 (2026-11-08) — James: "Then an api that eravos can use for the step. So needs full cli commands, events, nodes."
  ['automation', 'automation workflows | run <id> | step <type> [key=value …] | active | log [n] | catalogue | nodes | export <id> | import <file> | pipelines | pipeline <id> | pipeline-run <id> [open] | pipeline-resume <run> [redo,steps] [open] | pipeline-gate <pipeline> <task> debug|enforce|key=value|-key | pipeline-lean <pipeline> on|off | runs [pipeline-id] | stop <run-id> | pause <run-id> | continue <run-id> | pipeline-export <id> [file] | systems-pipelines <system> | import-from <system> <id>', 'the automation engine COS runs: its workflows, a run, one step on its own (what an ERAVOS box calls), live runs, the log, the step kinds, workflows as nodes'],
  ['vdisk', 'vdisk <system> [make|refresh|verify] | vdisk <system> snapshot|revert|drop <tag>', 'its virtual disk (qcow2): metadata, files and all its data in one file, its snapshots inside'],
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

// CH1 — COS reaches another system by its route, on the port its own supervisor holds for it (§5.15): never its files
function reachBy(sup) {
  return (system, method, p, body = null, { timeoutMs = 30000 } = {}) => new Promise((resolve) => {
    let port = null; try { const v = sup.list().find(x => x.name === system || x.system === system); port = v && v.port; } catch (_) {}
    if (!port) return resolve({ status: 0, error: `${system} is not a system COS holds a port for` });
    const data = body ? JSON.stringify(body) : null;
    const rq = require('http').request({ host: '127.0.0.1', port, path: p, method, timeout: timeoutMs, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let t = ''; res.on('data', c => { t += c; }); res.on('end', () => { let b = null; try { b = JSON.parse(t); } catch (_) { b = { text: t }; } resolve({ status: res.statusCode, body: b }); });
    });
    rq.on('error', (e) => resolve({ status: 0, error: e.code === 'ECONNREFUSED' ? `${system} is not answering on :${port}` : (e.code || e.message) }));
    rq.on('timeout', () => { rq.destroy(); resolve({ status: 0, error: `${system} did not answer in ${Math.round(timeoutMs / 1000)} s` }); });
    if (data) rq.write(data); rq.end();
  });
}

function createCli({ restartCos = null, sup, resources = null, config = null, notices = null, proposals = null, addSystem = null, usage = null, disks = null, vdisks = null, pipelineSync = null, graphCensus = null, locationOf = null, reach = reachBy(sup), wakeMs = 25000 } = {}) {
  async function run(line, { by = 'person' } = {}) {
    // 0.60.517 — "cos <verb>" typed in COS's own console is the verb (his 2026-11-13 `cos pipeline-sync` answered "no verb cos")
    let [verb, ...a] = split(line); if (verb === 'cos' && a.length) verb = a.shift(); const L = [];
    if (!verb) return { ok: true, lines: [] };
    const acts = ['start', 'stop', 'restart', 'boot', 'take', 'drop', 'add', 'request'];   // PC13: a request is his   // and `disk <system> make` (below)
    if (/^agent:/.test(String(by)) && (acts.includes(verb) || (verb === 'disk' && a[1] === 'make') || (verb === 'vdisk' && /^(make|refresh|snapshot|revert|drop)$/.test(a[1] || '')) || (verb === 'config' && a.length > 1) || (verb === 'notices' && a[0] === 'read')))
      return { ok: false, lines: [`an agent proposes; ${verb} is a person's act (POST /api/cos/proposals)`] };
    const need = (n, usage) => { if (a.length < n) throw Object.assign(new Error(`usage: ${usage}`), { code: 400 }); };
    if (verb.startsWith('@')) { a.unshift(verb); verb = 'ask'; }   // CH1: "@ollama what is …" is `ask @ollama what is …`
    const row = TABLE.find(r => r[0] === verb);
    // CH1 — an on-demand system is woken by the supervisor's own rule (touch) and waited for; RAID's answer to an input, in plain lines
    const awake = async (system) => {
      if ((await reach(system, 'GET', '/health', null, { timeoutMs: 1500 })).status === 200) return true;
      try { sup.touch(system); } catch (_) { return false; }
      for (const until = Date.now() + wakeMs; Date.now() < until;) { await new Promise(r => setTimeout(r, Math.min(500, wakeMs))); if ((await reach(system, 'GET', '/health', null, { timeoutMs: 1500 })).status === 200) return true; }
      return false;
    };
    const fileWithRaid = async (text) => {
      const r = await reach('cortex', 'POST', '/api/raid/input', { text, from: 'cos-console', by }, { timeoutMs: 60000 });
      if (r.status !== 200 || !r.body || r.body.ok === false) return { ok: false, why: (r.body && r.body.error) || r.error || `Cortex answered HTTP ${r.status}` };
      const b = r.body, d = b.decision || {}, c = b.contract || null;
      const lines = [`  RAID kept it as input ${b.id}${d.error ? `; not decided: ${d.error}` : `; routed to ${d.provider || d.target || d.agent || 'a decision it did not name'}${d.why ? ` (${d.why})` : ''}`}`];
      if (c) { lines.push(c.booked ? `  contract ${c.id}${(c.gaps || []).length ? `, with ${c.gaps.length} gap${c.gaps.length > 1 ? 's' : ''} asked of you:` : ', every field answered'}` : `  no contract booked${c.error ? `: ${c.error}` : (c.problems || []).length ? `: ${c.problems.join('; ')}` : ''}`); for (const g of c.gaps || []) lines.push(`    · ${g}`); }
      return { ok: true, lines, input: b.id || null, contract: (c && c.id) || null };
    };
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
        case 'open': {   // 0.60.589 — his "I need to be able to open idearium": a system's declared UI in its own Clear Glass compartment (the route's act)
          need(1, row[1]);
          const port = Number(process.env.COS_MANAGER_PORT) || 7799;
          const r = await new Promise((resolve) => { const data = Buffer.from(JSON.stringify({ by }));
            const q = require('http').request({ host: '127.0.0.1', port, path: `/api/cos/systems/${encodeURIComponent(a[0])}/open-ui`, method: 'POST', timeout: 8000, headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (rr) => { let t = ''; rr.on('data', (c) => { t += c; }); rr.on('end', () => { try { resolve(JSON.parse(t)); } catch (_) { resolve({ ok: false, error: `HTTP ${rr.statusCode}` }); } }); });
            q.on('timeout', () => q.destroy(new Error('no answer'))); q.on('error', (e) => resolve({ ok: false, error: e.message })); q.write(data); q.end(); });
          L.push(r.ok ? `opened ${a[0]} in its Clear Glass compartment: ${r.url}` : `not opened: ${r.error}`); break;
        }
        case 'start': case 'stop': case 'restart': {
          need(1, row[1]);
          // 2026-11-18 — James: "the console needs to be able to execute these commands". `restart cos` restarts COS itself from its Console, as his
          // act (an agent proposes restart-cos instead); the systems are handed over and adopted (MG15), not stopped.
          if (verb === 'restart' && a[0] === 'cos') {
            if (/^agent:/.test(String(by || ''))) throw new Error('an agent proposes restart-cos (proposals); restarting COS is a person\'s act');
            if (typeof restartCos !== 'function') throw new Error('this manager was not started to restart itself');
            const r = restartCos({ by }); L.push(r && r.ok ? `COS restarts: ${r.how || 'now'}` : `not restarted: ${(r && r.error) || 'no answer'}`); break;
          } const v = sup[verb](a[0], { by }); L.push(`${a[0]}: ${v.state}${v.pid ? ` (pid ${v.pid})` : ''}`); break;
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
        case 'vdisk': {
          if (!vdisks) throw new Error('no virtual disks in this manager'); need(1, row[1]); const t = vdisks.tools(); if (!t.ok) throw new Error(t.why);
          const [name, op, tag] = a; const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
          if (op === 'make' || op === 'refresh') { sup.note('vdisk', `${op} its virtual disk`, { by, system: name }); const r = await vdisks[op](name, { by }); L.push(`${name}.qcow2: ${r.files} files, ${mb(r.actualSize)} on disk of ${mb(r.virtualSize)}; ${r.snapshots.length} snapshot(s) inside`); break; }
          if (op === 'verify') { const v = vdisks.verify(name, { snapshot: tag || null }); L.push(v.ok ? `every one of ${v.files} files matches, read from inside${tag ? ` snapshot ${tag}` : ''}` : `${v.changed.length} changed, ${v.missing.length} missing: ${[...v.changed, ...v.missing].slice(0, 8).join(', ')}`); break; }
          if (op === 'snapshot' || op === 'revert' || op === 'drop') { need(3, row[1]); sup.note('vdisk', `${op} ${tag}`, { by, system: name }); const r = op === 'snapshot' ? vdisks.snapshot(name, tag, { by }) : op === 'revert' ? vdisks.revert(name, tag, { by }) : vdisks.dropSnapshot(name, tag, { by }); L.push(`${name}: ${op} ${tag} done${r.snapshots ? ` · snapshots: ${r.snapshots.map(s => s.tag).join(', ') || 'none'}` : ''}`); break; }
          const i = vdisks.info(name); L.push(`${i.file}: ${i.format}, ${mb(i.actualSize)} on disk of ${mb(i.virtualSize)} · ${i.metadata.fileCount} files · made ${i.metadata.created.slice(0, 16).replace('T', ' ')} by ${i.metadata.by}`);
          for (const s of i.snapshots) L.push(`  snapshot ${pad(s.tag, 20)}${s.at ? s.at.slice(0, 16).replace('T', ' ') : ''}${s.vmState ? ' · with its memory' : ''}`); break;
        }
        case 'automation': {
          // the same door as /api/cos/automation/*, so the command line and the routes never drift (cos/manager/automation-door.js)
          const door = require('./automation-door.js');
          const call = async (method, url, body) => { const r = await door.handle({ method, url: '/automation' + url, body: body || {} }); if (!r || r.status >= 400) throw new Error((r && r.body && r.body.error) || `${method} ${url}: ${r ? r.status : 'no answer'}`); return r.body; };
          const sub = a[0] || 'workflows';
          if (sub === 'workflows') { const r = await call('GET', '/workflows'); if (!r.workflows.length) L.push('no workflows yet'); for (const w of r.workflows) L.push(`${pad(w.status, 9)}${pad(w.id.slice(0, 8), 10)}${w.name}${w.nextRunAt ? ' · next ' + new Date(w.nextRunAt).toISOString().slice(0, 16).replace('T', ' ') : ''}`); }
          else if (sub === 'run') { need(2, row[1]); const r = await call('POST', `/workflows/${encodeURIComponent(a[1])}/run`, { by }); L.push(r.ok === false ? `refused: ${r.error}` : `ran ${a[1]}: ${r.status || 'started'}`); }
          else if (sub === 'step') { need(2, row[1]); const cfg = {}; for (const kv of a.slice(2)) { const i = kv.indexOf('='); if (i > 0) cfg[kv.slice(0, i)] = kv.slice(i + 1); } const r = await call('POST', '/step', { step: { type: a[1], config: cfg } }); L.push(JSON.stringify(r)); }
          else if (sub === 'active') { const r = await call('GET', '/active'); if (!r.runs.length) L.push('nothing running'); for (const x of r.runs) L.push(`${x.workflowName || x.workflowId} · step ${x.step || '?'}`); }
          else if (sub === 'log') { const r = await call('GET', `/log?limit=${Number(a[1]) || 20}`); for (const e of r.log) L.push(`${new Date(e.ts || e.at || Date.now()).toISOString().slice(11, 19)} ${e.msg || e.message || JSON.stringify(e)}`); if (!r.log.length) L.push('the log is empty'); }
          else if (sub === 'catalogue') { const r = await call('GET', '/catalogue'); for (const s of r.catalogue) L.push(`${pad(s.type, 18)}${s.label}`); }
          else if (sub === 'nodes') { const r = await call('GET', '/nodes'); L.push(`nodes in ${r.dir}`); for (const n of (r.nodes || r.files || [])) L.push(`  ${n.file || n.name || JSON.stringify(n)}`); }
          else if (sub === 'export') { need(2, row[1]); const r = await call('GET', `/workflows/${encodeURIComponent(a[1])}/export`); L.push(JSON.stringify(r)); }
          // AE5 (0.60.462) — James, 2026-11-08: "ui is only ever supposed to use the cli and api routes while floating on the interaction contract. like always
          // backend first, with commands, events, and updated maps." · "has to be real .pipeline files. it must be exportable and importable."
          else if (sub === 'import') { need(2, row[1]); const text = require('fs').readFileSync(a[1], 'utf8');
            const r = /\.(pipeline|workflow|macro)$/i.test(a[1]) ? await call('POST', '/import', { text, by }) : await call('POST', '/import', JSON.parse(text));
            L.push(r.ok === false ? `refused: ${r.error}` : `imported ${a[1]}${r.pipeline ? ' as pipeline ' + (r.pipeline.name || r.pipeline.id) : ''}`); }
          else if (sub === 'pipelines') { const r = await call('GET', '/pipelines'); if (!r.pipelines.length) L.push('no pipelines yet'); for (const p of r.pipelines) L.push(`${pad(p.id.slice(0, 8), 10)}${pad(String((p.tasks || []).length) + ' steps', 10)}${p.name}`); }
          else if (sub === 'pipeline') { need(2, row[1]); const r = await call('GET', `/pipelines/${encodeURIComponent(a[1])}`); const p = r.pipeline; L.push(`${p.name} · ${(p.tasks || []).length} steps`);
            const runs = (await call('GET', `/pipeline-runs?pipelineId=${encodeURIComponent(p.id)}&limit=1`)).runs || []; const last = runs[0] || null; if (last) L.push(`last run ${last.id.slice(0, 8)} · ${last.status}`);
            for (const t of p.tasks || []) L.push(`  ${pad(last && last.tasks[t.id] ? last.tasks[t.id].status : '', 9)}${t.label || t.id}${(t.depends_on || []).length ? ' (after ' + t.depends_on.join(', ') + ')' : ''}`); }
          else if (sub === 'pipeline-run') { need(2, row[1]); const r = await call('POST', `/pipelines/${encodeURIComponent(a[1])}/run`, { by, gates: a.slice(2).includes('open') ? 'open' : null }); L.push(r.ok === false ? `refused: ${r.error}` : `running ${a[1]}: run ${r.runId || (r.run && r.run.id) || '?'}`); }
          else if (sub === 'runs') { const r = await call('GET', `/pipeline-runs?limit=20${a[1] ? '&pipelineId=' + encodeURIComponent(a[1]) : ''}`); if (!r.runs.length) L.push('no runs yet');
            for (const x of r.runs) { const t = Object.values(x.tasks || {}); L.push(`${pad(x.status, 9)}${pad(x.id.slice(0, 8), 10)}${pad(t.filter(y => y.status === 'done').length + '/' + t.length, 7)}${x.pipelineName || x.pipelineId}`); } }
          // PC8 slice b (2026-11-11): pause and continue a live run; a run named by the first characters `runs` shows
          else if (sub === 'pause' || sub === 'continue') { need(2, row[1]); let id = a[1]; if (id.length < 36) { const live = ((await call('GET', '/pipeline-runs?limit=50')).runs || []).filter(x => x.id.startsWith(id)); if (live.length === 1) id = live[0].id; }
            const r = await call('POST', `/pipeline-runs/${encodeURIComponent(id)}/${sub}`, { by }); L.push(r.ok === false ? `refused: ${r.error}` : `${sub === 'pause' ? 'paused' : 'continued'} ${id.slice(0, 8)}: ${r.status}`); }
          else if (sub === 'pipeline-resume') { need(2, row[1]); let id = a[1]; if (id.length < 36) { const hit = ((await call('GET', '/pipeline-runs?limit=50')).runs || []).filter(x => x.id.startsWith(id)); if (hit.length === 1) id = hit[0].id; }
            const r = await call('POST', `/pipeline-runs/${encodeURIComponent(id)}/resume`, { by, redo: a[2] && a[2] !== 'open' ? a[2].split(',') : [], gates: a.slice(2).includes('open') ? 'open' : null }); L.push(r.ok === false ? `refused: ${r.error}` : `resumed ${id.slice(0, 8)} as run ${String(r.runId || '?').slice(0, 8)}: met ${(r.met || []).join(', ') || 'nothing'}`); }   // FX1a
          else if (sub === 'pipeline-lean') {   // 0.60.597 — his "Lean build mode": a build of this pipeline stops what it does not reach, unloads idle models
            need(2, row[1]); const on = a[2] !== 'off';
            const cur = await call('GET', `/pipelines/${encodeURIComponent(a[1])}`); const settings = { ...((cur.pipeline && cur.pipeline.settings) || {}), lean: on };
            const r = await call('PUT', `/pipelines/${encodeURIComponent(a[1])}`, { settings });
            L.push(r.ok === false ? `refused: ${r.error}` : `lean build ${on ? 'on' : 'off'} for ${a[1]}`); }
          else if (sub === 'pipeline-gate') {   // 0.60.590 — his "edit gates conditions. Not whole runs. Maybe even a debug gate type or setting?"
            need(3, row[1]); const set = {}, unset = [];
            for (const x of a.slice(3)) { if (x === 'debug') set.debug = true; else if (x === 'enforce') unset.push('debug'); else if (x.startsWith('-')) unset.push(x.slice(1)); else if (x.includes('=')) { const i = x.indexOf('='); const v = x.slice(i + 1); set[x.slice(0, i)] = v === 'true' ? true : v === 'false' ? false : (v !== '' && !isNaN(Number(v)) ? Number(v) : v); } }
            const r = await call('PATCH', `/pipelines/${encodeURIComponent(a[1])}/tasks/${encodeURIComponent(a[2])}/gate`, { set: Object.keys(set).length ? set : null, unset: unset.length ? unset : null });
            L.push(r.ok === false ? `refused: ${r.error}` : `${a[2]}'s gate: ${r.gate ? JSON.stringify(r.gate) : 'none'}`); }
          else if (sub === 'stop') { need(2, row[1]); const r = await call('POST', `/pipeline-runs/${encodeURIComponent(a[1])}/cancel`, { by }); L.push(r.ok === false ? `refused: ${r.error}` : `stopped ${a[1]}`); }
          // 0.60.463 — James, 2026-11-08: "hooking in idearium. The pipeline in idearium is meant to be shown on the canvas." A system's own .pipeline files,
          // read by that system's route (GET /api/pipelines, /api/pipelines/:id — Idearium's first), never its folder (§5.15); imported into the engine.
          else if (sub === 'systems-pipelines' || sub === 'import-from') { need(2, row[1]);
            const d = sup.declarations().find(x => x.name === a[1] || x.system === a[1]); let o; try { o = new URL(d && d.healthUrl).origin; } catch (_) { throw new Error(`${a[1]} declares no address COS can reach`); }
            const get = (p) => new Promise((ok, no) => { const q = require('http').get(o + p, { timeout: 10000 }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => { let j; try { j = JSON.parse(t || '{}'); } catch (e) { return no(e); } r.statusCode >= 400 || j.ok === false ? no(new Error(j.error || `${a[1]} answered ${r.statusCode}`)) : ok(j); }); }); q.on('timeout', () => q.destroy(new Error(`${a[1]} did not answer in 10 s`))); q.on('error', no); });
            if (sub === 'systems-pipelines') { const j = await get('/api/pipelines'); if (!(j.pipelines || []).length) L.push(`${a[1]} has no pipelines`); for (const p of j.pipelines || []) L.push(`${pad(p.id, 22)}${pad(String(p.steps) + ' steps', 10)}${p.name}${p.bad ? ' — unreadable: ' + p.bad : ''}`); }
            else { need(3, row[1]); const j = await get(`/api/pipelines/${encodeURIComponent(a[2])}`); const r = await call('POST', '/import', { text: j.pipeline.text, by, allowDuplicate: false });
              L.push(r.ok === false ? `refused: ${r.error}` : `imported ${a[1]}'s ${j.pipeline.name}${r.pipeline ? ' as pipeline ' + r.pipeline.id : ''}`); } }
          else if (sub === 'pipeline-export') { need(2, row[1]); const r = await call('GET', `/pipelines/${encodeURIComponent(a[1])}/node`);
            if (a[2]) { require('fs').writeFileSync(a[2], r.text); L.push(`wrote ${a[2]} (${r.filename})${(r.missing || []).length ? ' — not bundled: ' + r.missing.join(', ') : ''}`); } else L.push(r.text); }
          else throw new Error(`automation ${sub}: not a subcommand — ${row[1]}`);
          break;
        }
        case 'disks': { if (!disks) throw new Error('no disks in this manager'); const ds = disks.list(); if (!ds.length) L.push(`no disks yet (${disks.dir})`); for (const d of ds) L.push(`${pad(d.file, 52)}${pad(Math.round(d.bytes / 1024) + ' KB', 10)}${pad(d.files + ' files', 12)}${d.created.slice(0, 16).replace('T', ' ')} · ${d.by}`); break; }
        case 'disk': {
          if (!disks) throw new Error('no disks in this manager'); need(1, row[1]);
          if (a[0] === 'verify') { need(2, row[1]); const v = disks.verify(a[1]); L.push(v.ok ? `${a[1]}: every one of ${v.files} files matches its hash` : `${a[1]}: ${v.changed.length} changed, ${v.missing.length} missing, ${v.extra.length} extra — ${[...v.changed, ...v.missing, ...v.extra].slice(0, 8).join(', ')}`); break; }
          if (a[1] === 'make') { const r = await disks.pack(a[0], { withState: a[2] === 'state', by }); sup.note('disk', `${r.file}: ${r.files} files${r.withState ? ', with its data' : ''}`, { by, system: a[0] }); L.push(`${r.file}: ${r.files} files, ${Math.round(r.bytes / 1024)} KB${r.withState ? ', with its data' : ''} · metadata ${r.metadata.declaredBy || 'none'}, ${r.metadata.spec} spec file(s) · its spec names ${r.metadata.coverage.pct}% of its code`); break; }
          const ds = disks.list({ system: a[0] }), c = disks.coverage(a[0]);
          L.push(`${a[0]}: its spec names ${c.namedBySpec} of ${c.codeFiles} code files (${c.pct}%) — how much of its disk the metadata alone could rebuild`);
          if (!ds.length) L.push(`no disk yet: disk ${a[0]} make`); for (const d of ds) L.push(`  ${pad(d.file, 52)}${pad(Math.round(d.bytes / 1024) + ' KB', 10)}${d.files} files${d.withState ? ', with data' : ''}`); break;
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
        case 'request': {
          if (a[0] === 'answer') {   // request answer <run> <gap-id> <your answer>: the held run gets your answer and goes on
            if (a.length < 4) throw Object.assign(new Error('usage: request answer <run> <gap-id> <your answer>'), { code: 400 });
            const door = require('./automation-door.js'); const q = async (method, url, body) => { const r = await door.handle({ method, url: '/automation' + url, body: body || {} }); if (!r || r.status >= 400) throw new Error((r && r.body && r.body.error) || `${method} ${url}: ${r ? r.status : 'no answer'}`); return r.body; };
            const live = ((await q('GET', '/pipeline-runs?limit=50')).runs || []).filter(x => x.id.startsWith(a[1]) && x.status === 'paused');
            if (live.length !== 1) throw new Error(live.length ? `${live.length} held runs start with ${a[1]}: give more of its id` : `no held run starts with ${a[1]}`);
            const run = live[0]; const answers = JSON.stringify({ [a[2]]: a.slice(3).join(' ') });   // merged with earlier answers by the run itself
            const r = await q('POST', `/pipeline-runs/${encodeURIComponent(run.id)}/continue`, { by, vars: { answers } });
            L.push(`answered ${a[2]} on run ${run.id.slice(0, 8)}: ${r.status}`); break; }
          const words = a.join(' ').trim(); if (!words) throw Object.assign(new Error('usage: request <your words> · request answer <run> <gap-id> <your answer>'), { code: 400 });
          const door = require('./automation-door.js');
          const call = async (method, url, body) => { const r = await door.handle({ method, url: '/automation' + url, body: body || {} }); if (!r || r.status >= 400) throw new Error((r && r.body && r.body.error) || `${method} ${url}: ${r ? r.status : 'no answer'}`); return r.body; };
          const p = ((await call('GET', '/pipelines')).pipelines || []).find(x => x.name === 'His request');
          if (!p) throw new Error('the pipeline "His request" is not in COS yet: Idearium serves it (idearium/pipelines/his-request.pipeline); run `pipeline-sync` once Idearium is up');
          // CH1 (0.60.532) — James, 2026-11-14, of this pipeline: "that pipeline needs to be from the cli into raid or copilot." His words
          // reach RAID first (RD9: kept as a .input node, drafted into a contract); the run carries what they became. RAID not answering
          // does not stop his request (§5.15: one system down breaks no other): it is said, and the run goes without its contract.
          const filed = await fileWithRaid(words);
          if (filed.ok) L.push(...filed.lines); else L.push(`RAID did not take it (${filed.why}): the request runs without its contract`);
          const r = await call('POST', `/pipelines/${encodeURIComponent(p.id)}/run`, { vars: { words, ...(filed.ok && filed.input ? { input: filed.input } : {}), ...(filed.ok && filed.contract ? { contract: filed.contract } : {}) }, wait: false, by });
          L.push(`your request is running: run ${String(r.runId || '').slice(0, 8)} of "His request"`, '  its steps show in Automation › Pipelines › His request; a gap or the final yes waits for you there');
          break; }
        case 'location': {
          if (typeof locationOf !== 'function') throw new Error('COS cannot read locations here');
          const r = await locationOf(a[0] || null); if (!r.ok) throw new Error(r.error || 'no answer');
          const mb = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
          if (a[0]) { L.push(`${r.system}: ${r.folder}`, `  ${mb(r.disk.bytes)} in ${r.disk.files} files${r.disk.cut ? ' (counting stopped early)' : ''}`, `  ${r.movable ? 'can be moved' : 'cannot be moved yet:'}`); for (const w of r.why || []) L.push(`    ${w}`); break; }
          L.push(`Nexus at ${r.root}${r.cosRoot ? ` · COS at ${r.cosRoot}` : ''}`);
          for (const x of r.systems) L.push(`  ${x.system.padEnd(15)} ${x.movable ? 'can move' : `held: out ${x.out}, in ${x.in}${x.root_data ? ', data at the root' : ''}`}`);
          break; }
        case 'census': {
          if (a[0] !== 'graph') throw Object.assign(new Error('usage: census graph [--md]'), { code: 400 });
          if (typeof graphCensus !== 'function') throw new Error('the pipeline module is not up yet');
          const r = await graphCensus({ markdown: a.includes('--md') });
          if (!r.ok) throw new Error(r.error || 'the census did not answer');
          if (r.markdown) { L.push(...r.markdown.split('\n')); break; }
          L.push(`${r.graphs.length} graphs, ${r.files_read} source files read`);
          for (const g of r.graphs) L.push(`  ${g.id.padEnd(17)} ${String(g.writers.length).padStart(2)} write · ${String(g.readers.length).padStart(2)} read · ${g.rows == null ? 'rows: ' + g.rows_why : g.rows + ' rows (' + g.rows_why + ')'}`);
          if (r.unknown.length) { L.push(`named in the code, not declared (${r.unknown.length}):`); for (const x of r.unknown) L.push(`  ${x.name} in ${x.in.join(', ')}`); }
          break; }
        case 'pipeline-sync': {
          if (typeof pipelineSync !== 'function') throw new Error('the pipeline module is not up yet');
          const r = await pipelineSync({ why: 'asked in the console' });
          L.push(`imported ${r.imported}, updated ${r.updated}, ${(r.files || []).length - r.imported - r.updated - (r.failed || []).length} unchanged, ${(r.failed || []).length} refused`);
          for (const x of r.systems || []) { L.push(`  ${x.system}: ${x.ok ? x.files + ' of ' + x.listed + ' fetched' : 'did not answer (' + x.why + '): its last files kept'}`); for (const k of x.skipped || []) L.push(`    skipped ${k.id}: ${k.why}`); }
          for (const f of r.failed || []) L.push(`  refused ${f.file}: ${f.why}`);
          break; }
        // CH1 (0.60.532) — James, 2026-11-14: "the console in cos, is supposed to hook into each system, and agent. floating menu 3 way cli,
        // nexus-cli, etc." The agents, by the route the floating menu's own command line uses (copilot's /api/prompt, its three ways:
        // Ollama, the co-pilot, a Guardian agent). Copilot starts on demand: it is woken first, and one that does not start is said.
        case 'ask': {
          let provider = 'copilot';
          if (a[0] && a[0].startsWith('@')) { const t = a.shift().slice(1).toLowerCase(); provider = t === 'guardian' ? 'auto' : t.startsWith('guardian:') ? t.slice(9) : t; }
          const words = a.join(' ').trim(); if (!words) throw Object.assign(new Error(`usage: ${row[1]}`), { code: 400 });
          if (!(await awake('copilot'))) throw new Error('copilot did not start, so no agent could be asked (ps shows its state; logs copilot says why)');
          const r = await reach('copilot', 'POST', '/api/prompt', { prompt: words, provider, source: 'cos-console', channel: 'cos-console', channelName: 'COS Console' }, { timeoutMs: 120000 });
          if (r.status !== 200 || !r.body || r.body.ok === false) throw new Error(`${provider} did not answer: ${(r.body && (r.body.error || r.body.reason || (r.body.errors || []).join('; '))) || r.error || 'HTTP ' + r.status}`);
          const text = r.body.text ?? r.body.response; L.push(...String(typeof text === 'string' ? text : JSON.stringify(text ?? r.body)).split('\n'));
          L.push(`  — asked ${provider}${r.body.modelUsed ? `, answered by ${r.body.modelUsed}` : ''}`);
          break; }
        // RD9 slice c — James, 2026-11-12: "we can have the cli in nexus hooked into raid, inputs into raid, saved as a .input node, then raid
        // decides what to do with using the routing." `raid <words>` files them; so does any line COS's table does not know (below).
        case 'raid': {
          const words = a.join(' ').trim(); if (!words) throw Object.assign(new Error(`usage: ${row[1]}`), { code: 400 });
          const f = await fileWithRaid(words); if (!f.ok) throw new Error(`RAID did not take it: ${f.why}`);
          L.push(...f.lines); break; }
        default: {
          // RD9 slice c: what COS's table does not know goes to RAID as an input (kept as a .input node, drafted into a contract), said as such
          const f = await fileWithRaid(String(line).trim());
          if (f.ok) return { ok: true, lines: [`"${verb}" is not one of COS's verbs, so the line went to RAID as an input:`, ...f.lines, '  (help shows COS\'s own verbs)'] };
          return { ok: false, lines: [`no verb "${verb}", and RAID did not take it (${f.why}). The table:`, ...TABLE.map(r => `  ${r[1]}`)] };
        }
      }
      return { ok: true, lines: L };
    } catch (e) { return { ok: false, lines: [...L, e.message] }; }
  }
  return { run, TABLE };
}

module.exports = { createCli, TABLE, split, MODULE_ID: 'cos.manager.cli', VERSION: '1.0.0' };
