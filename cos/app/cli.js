#!/usr/bin/env node
'use strict';
/**
 * cos/app/cli.js — `cos app ...`: manage a project's versions from the command line (COSA1, 0.60.66). CLI first; the Windows app (COSA6) is a screen over this.
 *   node cos/app/cli.js import <zip> [--sha256 hex] [--sums file] [--require-checksum] [--project p]
 *   node cos/app/cli.js inbox                     import every zip dropped in the inbox
 *   node cos/app/cli.js list [project]            versions, newest first
 *   node cos/app/cli.js status                    root, projects, inbox
 *   node cos/app/cli.js remove <project> <version>  moves it to trash/ (never deletes)
 *   node cos/app/cli.js switch <project> <version>   stop, snapshot data, start it, health-check; roll back on failure (COSA4)
 *   node cos/app/cli.js rollback <project> [--restore-data]   back to the previous version (data untouched unless asked)
 *   node cos/app/cli.js start <project> [version] | stop <project> | running <project> | logs <project> [--lines n]
 * --root <dir> or COS_APP_ROOT picks the store; --json prints JSON. Exit 1 on a refusal, with the reason.
 */
const S = require('./store.js');
function parse(argv) { const flags = {}, pos = []; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--json' || a === '--require-checksum') flags[a.slice(2)] = true; else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i]; else pos.push(a); } return { flags, pos }; }
function main(argv = process.argv.slice(2), out = (s) => console.log(s)) {
  const { flags, pos } = parse(argv); const root = flags.root || S.defaultRoot(); const cmd = pos[0] || 'status'; const J = !!flags.json; let code = 0;
  const say = (obj, text) => out(J ? JSON.stringify(obj) : text);
  const fail = (r) => { code = 1; say(r, `✗ ${r.error}`); };
  const opts = { sha256: flags.sha256, sums: flags.sums, requireChecksum: !!flags['require-checksum'], project: flags.project };
  if (cmd === 'import') {
    if (!pos[1]) fail({ ok: false, error: 'import needs a zip path' }); else { const r = S.importZip(root, pos[1], opts); if (!r.ok) fail(r); else say(r, `✓ ${r.project} ${r.version} ${r.already ? 'already installed' : 'installed'}${r.verified ? ' (verified)' : ''}${r.dataMoved ? ` · ${r.dataMoved} data file(s) moved to the persistent data folder` : ''}\n  ${r.note}`); }
  } else if (cmd === 'inbox') {
    const rs = S.scanInbox(root, opts); if (!rs.length) say({ ok: true, results: [] }, 'inbox is empty'); else { say({ ok: true, results: rs }, rs.map(r => r.ok ? `✓ ${r.file} → ${r.project} ${r.version}${r.already ? ' (already installed)' : ''}` : `✗ ${r.file}: ${r.error}`).join('\n')); if (rs.some(r => !r.ok)) code = 1; }
  } else if (cmd === 'list') {
    const ps = S.list(root, pos[1] || null); say({ ok: true, projects: ps }, ps.length ? ps.map(p => `${p.project}  (current ${p.current || 'none'})  data ${p.data}\n` + p.versions.map(v => `  ${v.version.padEnd(10)} ${v.current ? 'current ' : v.previous ? 'previous' : '        '} ${v.verified ? 'verified  ' : 'unverified'} ${v.dataLinked ? 'data linked' : 'DATA NOT LINKED'}${v.present ? '' : '  (folder missing)'}`).join('\n')).join('\n') : 'no projects yet: drop a release zip in the inbox, or `import <zip>`');
  } else if (cmd === 'remove') {
    if (!pos[1] || !pos[2]) fail({ ok: false, error: 'remove needs <project> <version>' }); else { const r = S.remove(root, pos[1], pos[2]); if (!r.ok) fail(r); else say(r, `✓ moved to ${r.moved}`); }
  } else if (cmd === 'status') { const s = S.status(root); say({ ok: true, ...s }, `root ${s.root}\n${s.projects.length} project(s) · inbox ${s.inbox.pending} waiting (${s.inbox.path})`); }
  else fail({ ok: false, error: `unknown command "${cmd}" (import, inbox, list, status, remove)` });
  return code;
}
const RUNTIME = new Set(['switch', 'rollback', 'start', 'stop', 'running', 'logs']);
/** run(argv, out) → exit code. Store commands are main(); the ones that start or stop processes are async. */
async function run(argv = process.argv.slice(2), out = (s) => console.log(s)) {
  const { flags, pos } = parse(argv); const cmd = pos[0];
  if (!RUNTIME.has(cmd)) return main(argv, out);
  const root = flags.root || S.defaultRoot(); const J = !!flags.json; const project = pos[1]; let code = 0;
  const say = (o, t) => out(J ? JSON.stringify(o) : t); const fail = (r) => { code = 1; say(r, `✗ ${r.error}${r.rolledBack ? `\n  rolled back${r.restoredData ? ', data restored' : ''}${r.backOn ? `; ${r.backOn} is running again` : ''}${r.backError ? `\n  ${r.backError}` : ''}` : ''}`); };
  if (!project) { fail({ ok: false, error: `${cmd} needs a <project> (like nexus)` }); return code; }
  const RT = require('./runtime.js'), SW = require('./switch.js'); const o = { ...(flags['status-port'] ? { statusPort: +flags['status-port'] } : {}), ...(flags.timeout ? { healthTimeoutMs: +flags.timeout * 1000 } : {}) };
  if (cmd === 'switch') { if (!pos[2]) fail({ ok: false, error: 'switch needs <project> <version>' }); else { const r = await SW.switchTo(root, project, pos[2], o); if (!r.ok) fail(r); else say(r, r.already ? `✓ ${r.note}` : `✓ ${project} ${r.from ? r.from + ' → ' : ''}${r.to} healthy after ${(r.healthyAfterMs / 1000).toFixed(1)} s\n  data snapshot: ${r.snapshot} (${r.snapshotFiles} item(s))`); } }
  else if (cmd === 'rollback') { const r = await SW.rollback(root, project, { ...o, restoreData: !!flags['restore-data'] }); if (!r.ok) fail(r); else say(r, `✓ back on ${r.to}${r.restoredData ? ' (data restored from the snapshot)' : ' (data left as it is)'}`); }
  else if (cmd === 'start') { const st = S.list(root, project)[0]; const v = pos[2] || (st && st.current); if (!v) fail({ ok: false, error: `no version given and ${project} has no current version: use switch <project> <version>` }); else { const r = await RT.start(root, project, v, o); if (!r.ok) fail(r); else say(r, `✓ ${project} ${v} running (pid ${r.pid}), healthy after ${(r.healthyAfterMs / 1000).toFixed(1)} s`); } }
  else if (cmd === 'stop') { const r = await RT.stop(root, project); if (!r.ok) fail(r); else say(r, r.stopped ? `✓ stopped ${project} ${r.version || ''}` : `✓ ${r.note}`); }
  else if (cmd === 'running') { const r = await RT.status(root, project); say({ ok: true, ...r }, r.running ? `${project} ${r.version} running (pid ${r.pid}) · ${r.healthy ? 'healthy' : 'NOT answering'} · since ${r.startedAt}` : `${project} is not running${r.note ? ' (' + r.note + ')' : ''}`); }
  else if (cmd === 'logs') { const r = RT.logs(root, project, { lines: +flags.lines || 50 }); say({ ok: true, ...r }, r.file ? `${r.file}\n${r.text}` : 'no logs yet'); }
  return code;
}
if (require.main === module) run().then(c => process.exit(c));
module.exports = { main, run, parse };
