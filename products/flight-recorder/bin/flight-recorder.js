#!/usr/bin/env node
'use strict';
/**
 * products/flight-recorder/bin/flight-recorder.js — FR4a: the flight recorder as one command, over any project folder.
 * Product: flight-recorder   (part of products/flight-recorder; the branch tool carries every file tagged so)
 *
 * James, 2026-10-17: "Okay. Keep going." Nothing else is needed: no Idearium, no Versionium server, no Nexus checkout.
 *
 *   flight-recorder init                                 start recording this folder (state in .flight-recorder/)
 *   flight-recorder propose <path> [--from <file>] [--agent <name>] [--why <goal>]   a change, written nowhere yet (from --from or stdin)
 *   flight-recorder list                                 every change: status, path, lines, who
 *   flight-recorder show <id>                            its record: what, who, why, checked, landed, undo, what is missing
 *   flight-recorder test <id>                            its linked tests, before and after, in this project
 *   flight-recorder apply <id>                           write it (refused if it broke a test it was tested against); a version
 *   flight-recorder undo <id> [--no-merge]               put back what was there, keeping later edits; a version
 *   flight-recorder versions                             the project's versions, newest first
 * --dir <folder> (default: here) · --json. An id may be its first characters.
 */
const fs = require('fs');
const path = require('path');

function args(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; out.flags[k] = v; }
    else out._.push(a);
  }
  return out;
}
const say = (json, data, text) => { process.stdout.write(json ? JSON.stringify(data, null, 2) + '\n' : `${text}\n`); };
const fail = (msg, code = 1) => { try { require('../lib/project.js').flush(); } catch (_) {} process.stderr.write(`flight-recorder: ${msg}\n`); process.exit(code); };

// stdout carries only this command's answer (so --json can be piped); the libraries' own lines ("[jaa] Store ready …") go to stderr
console.log = (...x) => process.stderr.write(x.map(String).join(' ') + '\n');
console.info = console.log;

async function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0], json = !!a.flags.json, dir = path.resolve(a.flags.dir || process.cwd());
  if (!cmd || cmd === 'help' || a.flags.help) { const head = fs.readFileSync(__filename, 'utf8').split('\n').filter(l => /^ \*   flight-recorder|^ \* --dir/.test(l)).map(l => l.slice(3)); return say(false, null, head.join('\n')); }
  const P = require('../lib/project.js');
  let pr; try { pr = P.open(dir, { create: cmd === 'init' }); } catch (e) { return fail(e.message); }
  const { RI, CR, RV, layer, repo } = pr;
  const resolve = (pre) => {
    if (!pre) fail('which change? give its id');
    const all = RI.list(repo.uuid, { limit: 100000 });
    const hit = all.filter(n => n.uuid.startsWith(String(pre)));
    if (!hit.length) fail(`no change ${pre}`); if (hit.length > 1) fail(`${pre} matches ${hit.length} changes — give more of the id`);
    return hit[0];
  };
  const recordOf = (n) => {
    let activity = [], runs = [];
    try { activity = require('../../../lib/activity-log/compartment.js').list(repo.uuid, { limit: 500 }).rows || []; } catch (_) {}
    try { runs = require('../../../lib/run-state.js').list({ repoUuid: repo.uuid }); } catch (_) {}
    let base; if (n.status === 'proposed' || n.status === 'staged') { const r = layer.readTextFile(repo.uuid, n.path); base = r.error ? null : r.content; }
    return CR.record(n, { activity, runs, base });
  };
  const settle = async () => { try { return await RV.flush(repo.uuid); } catch (e) { return { ok: false, error: e.message }; } };

  switch (cmd) {
    case 'init': return say(json, pr.info, `recording ${dir} (${pr.info.id}) — state in ${P.HOME}/`);
    case 'propose': {
      const rel = a._[1]; if (!rel) fail('propose <path> [--from <file>]');
      const content = a.flags.from ? fs.readFileSync(path.resolve(String(a.flags.from)), 'utf8') : fs.readFileSync(0, 'utf8');
      const agent = a.flags.agent ? String(a.flags.agent) : null;
      const doPropose = () => RI.propose({ layer, repo, hat: agent ? { name: agent, uuid: agent } : null, path: rel, content, source: { kind: agent ? 'agent' : 'person', via: 'flight-recorder' } });
      // --why "<goal>": the change is made inside a run and a task, the way an agent dispatch makes one, so its record can say
      // who asked and why (lib/run-state.js, lib/repo-activity.js); without it, the record names those links as missing
      let r;
      if (a.flags.why) {
        const RS = require('../../../lib/run-state.js'), RA = require('../../../lib/repo-activity.js');
        const session = String(a.flags.session || `cli-${agent || 'person'}`);
        const run = RS.begin({ repoUuid: repo.uuid, session, goal: String(a.flags.why), provider: agent || 'person' });
        r = await RA.run({ repoUuid: repo.uuid, hat: agent, session, message: String(a.flags.why), provider: agent || 'person', kind: 'run' }, async () => doPropose());
        RS.step(run.runId, { name: 'write_file', arguments: { path: rel }, ok: !!(r && r.ok) });
      } else r = doPropose();
      if (!r.ok) fail((r.errors || ['refused']).join('; '));
      return say(json, r.inject, `proposed ${r.inject.uuid.slice(0, 8)} ${r.inject.op} ${r.inject.path} — nothing written yet (test it, then apply)`);
    }
    case 'list': {
      const rows = RI.list(repo.uuid, { limit: Number(a.flags.limit) || 100 }).map(n => recordOf(RI.get(n.uuid) || n));
      return say(json, rows, rows.length ? rows.map(r => `${r.id.slice(0, 8)}  ${r.status.padEnd(9)} ${r.path}${r.what.lines ? `  +${r.what.lines.added} −${r.what.lines.removed}` : ''}  ${r.who.agent || r.who.kind || ''}${r.landed.length ? `  @${r.landed[0].commitId}` : ''}`).join('\n') : 'no changes yet');
    }
    case 'show': { const r = recordOf(resolve(a._[1])); return say(json, r, CR.lines(r).join('\n')); }
    case 'test': {
      const n = resolve(a._[1]);
      process.env.NEXUS_EVIDENCE = 'on';
      const ev = await RI.attachEvidence(n.uuid, { layer });
      if (!ev) fail(`${n.uuid.slice(0, 8)} is ${n.status}: only a change waiting to be applied is tested`);
      return say(json, ev, ev.summary);
    }
    case 'apply': {
      const n = resolve(a._[1]);
      const r = RI.apply(n.uuid, { layer, approvedBy: a.flags.by ? String(a.flags.by) : 'person', force: !!a.flags.force });
      if (!r.ok) fail((r.errors || ['refused']).join('; '));
      const v = await settle();
      return say(json, { inject: r.inject, version: v }, `applied ${n.path}${v && v.commitId ? ` — version ${v.commitId}` : ''}`);
    }
    case 'undo': {
      const n = resolve(a._[1]);
      const r = n.status === 'proposed' || n.status === 'staged' ? RI.reject(n.uuid, { reason: a.flags.reason || 'undone before it was applied' })
        : RI.revert(n.uuid, { layer, merge: !a.flags['no-merge'], force: !!a.flags.force });
      if (!r.ok) fail((r.errors || ['refused']).join('; '));
      const v = await settle();
      return say(json, { inject: r.inject, merged: !!r.merged, version: v }, `undone ${n.path}${r.merged ? ' — the later edits were kept' : ''}${v && v.commitId ? ` — version ${v.commitId}` : ''}`);
    }
    case 'versions': {
      const rows = require('../lib/versions.js').list(repo);
      return say(json, rows, rows.length ? rows.map(v => `${v.commitId}  ${new Date(v.at).toISOString().replace('T', ' ').slice(0, 19)}  ${v.files} file(s)  ${v.message}`).join('\n') : 'no versions yet');
    }
    default: return fail(`unknown command ${cmd} — try: flight-recorder help`, 2);
  }
}

// every store this process wrote is flushed before it exits (process.exit skips the stores' own signal flush)
const _flush = () => { try { require('../lib/project.js').flush(); } catch (_) {} };
const _fail = fail;
main().then(() => { _flush(); process.exit(0); }, (e) => { _flush(); _fail(e.stack || e.message); });
