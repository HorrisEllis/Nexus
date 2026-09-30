'use strict';
/**
 * tests/modules/test-history-import-job.test.js — 0.39.283 N30 (docs/2026-09-29-nex-node-store-phasemap.spec)
 *
 * James: "give copilot a command … i want to import my archives of nexus. have it pull up a drop box ui and run the
 * command". The drop box calls idearium; idearium runs cli/import-history.js as a background CHILD process
 * (lib/history-import-job.js) and the page polls it.
 *   HJ-0x  the job, for real: fixture zips → a dry run (the order) → an import (rows, counts, the tip) in a scratch repo
 *   HJ-1x  a dropped zip streamed into the inbox; bad names and missing paths refused with the reason
 *   HJ-2x  idearium's real router: GET/POST /api/history/import (dry run only — it never writes the checkout)
 *   HJ-3x  the command: /import-archives and "import my archives" in idearium's CLI; the Clear Glass co-pilot pane
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '../..');
const Zip = require(path.join(ROOT, 'lib', 'zip.js'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const G = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(HJ, ms = 60000) { const t0 = Date.now(); let st; do { await sleep(150); st = HJ.status(); } while (st.state === 'running' && Date.now() - t0 < ms); return st; }

(async () => {
  console.log('\ntest-history-import-job\n');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hj-'));
  try {
    const HJ = require(path.join(ROOT, 'lib', 'history-import-job.js'));
    const ZIPS = path.join(TMP, 'zips'); fs.mkdirSync(ZIPS);
    const mk = (name, v, when, extra = 'x') => fs.writeFileSync(path.join(ZIPS, name), Zip.create([
      { path: 'nexus/lib/version.js', data: `module.exports = {\n  system: '${v}',\n};\n`, mtime: when }, { path: 'nexus/package.json', data: `{"version":"${v}"}\n`, mtime: when },
      { path: 'nexus/src/a.js', data: `export const a = '${extra}';\n`, mtime: when }]));
    mk('nexus-0.1.0.zip', '0.1.0', new Date(2026, 0, 5), 'one'); mk('nexus-0.2.0.zip', '0.2.0', new Date(2026, 1, 5), 'two'); mk('nexus-0.3.0.zip', '0.3.0', new Date(2026, 2, 5), 'three');
    const INTO = path.join(TMP, 'nexus'); fs.mkdirSync(INTO);
    G(INTO, 'init', '-q', '-b', 'main'); G(INTO, 'config', 'user.name', 'James'); G(INTO, 'config', 'user.email', 'j@example.com');
    fs.writeFileSync(path.join(INTO, 'README.md'), 'now\n'); G(INTO, 'add', '.'); G(INTO, 'commit', '-q', '-m', 'now');
    const paths = fs.readdirSync(ZIPS).map(f => path.join(ZIPS, f));

    // ── HJ-0x ──
    let st = HJ.start({ paths, dryRun: true, into: INTO });
    check('HJ-01 start returns at once with the job running (the import is a child process, never idearium\'s event loop)', st.state === 'running' && !!st.pid && st.inputs === 3, JSON.stringify({ state: st.state, pid: st.pid }));
    check('HJ-02 a second start while one runs returns the running one', HJ.start({ paths, into: INTO }).pid === st.pid);
    st = await until(HJ);
    check('HJ-03 the dry run: the order, version first, and nothing written', st.state === 'done' && st.dryRun && (st.order || []).map(o => o.version).join() === '0.1.0,0.2.0,0.3.0'
      && G(INTO, 'branch', '--list', 'history/snapshots') === '', JSON.stringify({ state: st.state, order: st.order, result: st.result }).slice(0, 300));
    st = HJ.start({ paths, into: INTO });
    st = await until(HJ);
    check('HJ-04 the import: one row per zip as it happens, the counts, the tip — and the commits are really there', st.state === 'done' && st.rows.length === 3 && st.rows.every(r => r.status === 'imported')
      && st.result.counts.imported === 3 && G(INTO, 'rev-parse', 'history/snapshots') === st.result.tip && G(INTO, 'rev-list', '--count', 'history/snapshots') === '3', JSON.stringify({ rows: st.rows, result: st.result }).slice(0, 400));
    check('HJ-05 James\'s branch is untouched; the report is named', G(INTO, 'log', '--format=%s', 'main') === 'now' && fs.existsSync(st.result.report));
    st = await until(HJ, 1); st = HJ.start({ paths, into: INTO }); st = await until(HJ);
    check('HJ-06 again: every zip skipped, nothing added', st.result.counts.skipped === 3 && G(INTO, 'rev-list', '--count', 'history/snapshots') === '3');

    // ── HJ-1x ──
    const up = await HJ.saveUpload('dropped (1).zip', Readable.from([fs.readFileSync(paths[0])]));
    check('HJ-10 a dropped zip streams into the data root\'s inbox (inside the sandbox), byte for byte', up.ok && up.path.startsWith(HJ.inboxDir()) && up.bytes === fs.statSync(paths[0]).size
      && Buffer.compare(fs.readFileSync(up.path), fs.readFileSync(paths[0])) === 0 && HJ.inboxDir().startsWith(process.env.NEXUS_DATA_ROOT || '/nowhere'), JSON.stringify(up));
    check('HJ-11 only .zip names, and no path tricks', (await HJ.saveUpload('evil.sh', Readable.from(['x']))).ok === false && HJ._safeName('../../etc/passwd.zip') === 'passwd.zip');
    const bad = HJ.start({ paths: [path.join(TMP, 'nope.zip')], into: INTO });
    check('HJ-12 a path that is not on this machine: refused with the reason, nothing started', bad.state === 'failed' && /not found on this machine/.test(bad.result.error));
    check('HJ-13 nothing given: said so', HJ.start({ into: INTO }).result.error === 'nothing to import — drop zips or give a folder');

    // ── HJ-2x idearium's real router ──
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const g = await api._route('GET', '/api/history/import');
    check('HJ-20 GET /api/history/import answers the job status', g.status === 200 && g.json.ok && 'state' in (g.json.data || g.json));
    const p = await api._route('POST', '/api/history/import', { paths: [paths[0]], dryRun: true });
    const pd = p.json.data || p.json;
    check('HJ-21 POST /api/history/import starts it (dry run: it only reads the checkout)', p.status === 200 && pd.state === 'running' && pd.dryRun === true, JSON.stringify(p.json).slice(0, 200));
    await until(HJ);
    const e = await api._route('POST', '/api/history/import', { paths: [path.join(TMP, 'missing.zip')] });
    check('HJ-22 a bad start is a 400 with the reason', e.status === 400 && /not found on this machine/.test(e.json.error));
    const pageRoute = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    check('HJ-23 idearium serves the page and streams uploads (the upload skips the JSON body reader)', /cleanUrl === '\/archive-import\.html'/.test(pageRoute) && /route\.action !== 'history\.import\.upload'/.test(pageRoute)
      && fs.existsSync(path.join(ROOT, 'idearium/ui/archive-import.html')));

    // ── HJ-3x the command ──
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    const re = new RegExp(app.match(/const ARCHIVE_IMPORT_INTENT = \/(.+)\/i;/)[1].replace(/\\\\/g, '\\'), 'i');
    check('HJ-30 idearium CLI: /import-archives (and /archives) open the drop box; /help lists it', /case 'import-archives': case 'archives': case 'archive':/.test(app) && /\/import-archives\s+drop your NEXUS release zips/.test(app));
    check('HJ-31 plain words open it too — and ordinary coding prompts do not', re.test('import my archives') && re.test('can you load the nexus zips') && !re.test('import the history module into x.js') && !re.test('explain this archive format'));
    const V = require(path.join(ROOT, 'clear-glass/src/copilot/verbs.js'));
    const ci = V.archiveImportIntent('import my archives', { IDEARIUM_PORT: '4811' });
    check('HJ-32 the Clear Glass co-pilot pane: "import my archives" or /import-archives opens the drop box (idearium\'s port)', ci && ci.url === 'http://127.0.0.1:4811/archive-import.html' && !!V.archiveImportIntent('/import-archives') && !V.archiveImportIntent('visit google.com'));
    check('HJ-33 the pane checks it before "visit"', /V\.archiveImportIntent\(message\) \|\| V\.browseIntent\(message\)/.test(fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'), 'utf8')));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  finally { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
