#!/usr/bin/env node
'use strict';
/**
 * cos/app/cli.js — `cos app ...`: manage a project's versions from the command line (COSA1, 0.60.66). CLI first; the Windows app (COSA6) is a screen over this.
 *   node cos/app/cli.js import <zip> [--sha256 hex] [--sums file] [--require-checksum] [--project p]
 *   node cos/app/cli.js inbox                     import every zip dropped in the inbox
 *   node cos/app/cli.js list [project]            versions, newest first
 *   node cos/app/cli.js status                    root, projects, inbox
 *   node cos/app/cli.js remove <project> <version>  moves it to trash/ (never deletes)
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
if (require.main === module) process.exit(main());
module.exports = { main, parse };
