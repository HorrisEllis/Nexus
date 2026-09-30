'use strict';
/**
 * tests/probe/archive-import-chromium.js — 0.39.283 N30 in a real page (Clear Glass's engine), end to end.
 * The REAL idearium/ui/archive-import.html, served with an API backed by the REAL lib/history-import-job.js, which runs
 * the REAL cli/import-history.js as a child process into a scratch git repo. The zips are given the way a plain browser
 * gives them (File objects, no disk path), so the upload path is exercised: queue → upload → dry run → import → rows.
 * Screenshot to ARCHIVE_SHOT (optional).
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
const { start } = require('./_glass-probe.js');
const P = start();
const ROOT = P.ROOT;
const Zip = require(path.join(ROOT, 'lib', 'zip.js'));
const HJ = require(path.join(ROOT, 'lib', 'history-import-job.js'));
const G = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-probe-'));
const INTO = path.join(TMP, 'nexus'); fs.mkdirSync(INTO);
G(INTO, 'init', '-q', '-b', 'main'); G(INTO, 'config', 'user.name', 'James'); G(INTO, 'config', 'user.email', 'j@example.com');
fs.writeFileSync(path.join(INTO, 'README.md'), 'now\n'); G(INTO, 'add', '.'); G(INTO, 'commit', '-q', '-m', 'now');
const zips = {};
for (const [v, m] of [['0.39.100', 3], ['0.39.200', 6], ['0.39.150', 4]]) {
  const when = new Date(2026, m, 1);
  zips[`nexus-${v}.zip`] = Zip.create([{ path: 'nexus/lib/version.js', data: `module.exports = {\n  system: '${v}',\n};\n`, mtime: when }, { path: 'nexus/src/a.js', data: `export const v = '${v}';\n`, mtime: when }]);
}

const srv = http.createServer((q, r) => {
  const j = (o, s = 200) => { r.writeHead(s, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
  const u = q.url;
  if (u === '/' || u === '/archive-import.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(fs.readFileSync(path.join(ROOT, 'idearium/ui/archive-import.html'))); }
  if (u.startsWith('/js/')) { r.writeHead(200, { 'Content-Type': 'application/javascript' }); return r.end(fs.readFileSync(path.join(ROOT, 'idearium/ui', u))); }
  if (u.startsWith('/fixture/')) { r.writeHead(200, { 'Content-Type': 'application/zip' }); return r.end(zips[decodeURIComponent(u.slice(9))]); }
  if (u.startsWith('/api/history/import/upload') && q.method === 'PUT') { const name = new URL(u, 'http://x').searchParams.get('name'); return HJ.saveUpload(name, q).then(x => j(x.ok ? { ok: true, data: x } : { ok: false, error: x.error }, x.ok ? 200 : 400)); }
  if (u === '/api/history/import' && q.method === 'GET') return j({ ok: true, data: HJ.status() });
  if (u === '/api/history/import' && q.method === 'POST') { let b = ''; q.on('data', c => b += c); q.on('end', () => { const body = JSON.parse(b || '{}'); const st = HJ.start({ ...body, into: INTO }); j(st.state === 'failed' ? { ok: false, error: st.result.error } : { ok: true, data: st }, st.state === 'failed' ? 400 : 200); }); return; }
  j({ ok: false, error: 'no route ' + u }, 404);
});
srv.listen(0, '127.0.0.1', async () => {
  const b = await P.glass.chromium.launch(); const pg = await b.newPage({ viewport: { width: 1180, height: 1000 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/archive-import.html`);
  await pg.waitForTimeout(300);
  const init = await pg.evaluate(() => ({ check: document.getElementById('check').disabled, go: document.getElementById('go').disabled, hint: document.getElementById('hint').textContent }));
  P.case('N30: empty, the buttons wait and the page says what to do', init.check && init.go && /drop zips/.test(init.hint), init);
  // what a plain browser hands over on a drop: File objects with no disk path
  const added = await pg.evaluate(async (names) => { const files = []; for (const n of names) { const blob = await (await fetch('/fixture/' + encodeURIComponent(n))).blob(); files.push(new File([blob], n, { type: 'application/zip' })); }
    files.push(new File(['not a zip'], 'notes.txt')); return window.archiveImport.add(files); }, Object.keys(zips));
  const q = await pg.evaluate(() => ({ n: document.getElementById('queue-n').textContent, rows: [...document.querySelectorAll('#queue tr')].map(t => t.textContent) }));
  P.case('N30: dropped zips are queued (a .txt is not), each saying it will be uploaded when started', added === 3 && q.rows.length === 3 && /3 zips/.test(q.n) && q.rows.every(t => /uploaded when you start/.test(t)), q);
  await pg.evaluate(() => document.getElementById('check').click());
  for (let i = 0; i < 80; i++) { await pg.waitForTimeout(250); if (await pg.evaluate(() => /The order/.test(document.getElementById('run-title').textContent))) break; }
  const dry = await pg.evaluate(() => ({ title: document.getElementById('run-title').textContent, rows: [...document.querySelectorAll('#rows tr')].map(t => t.children[2].textContent), up: [...document.querySelectorAll('#queue tr')].map(t => t.textContent) }));
  P.case('N30: "Check the order" uploads the zips and shows them in version order — nothing imported yet', /The order/.test(dry.title) && dry.rows.join() === '0.39.100,0.39.150,0.39.200' && dry.up.every(t => /uploaded/.test(t))
    && G(INTO, 'branch', '--list', 'history/snapshots') === '', dry);
  await pg.evaluate(() => document.getElementById('go').click());
  for (let i = 0; i < 120; i++) { await pg.waitForTimeout(250); if (await pg.evaluate(() => /Imported|Stopped/.test(document.getElementById('run-title').textContent))) break; }
  const done = await pg.evaluate(() => ({ title: document.getElementById('run-title').textContent, rows: [...document.querySelectorAll('#rows tr')].map(t => [t.children[2].textContent, t.children[4].textContent.trim()]),
    counts: [...document.querySelectorAll('.count')].map(c => `${c.querySelector('b').textContent} ${c.querySelector('span').textContent}`), merge: document.getElementById('merge').textContent, bar: document.getElementById('bar').style.width }));
  P.case('N30: Import runs it and follows it — a row per zip, the counts, a full bar', /Imported/.test(done.title) && done.rows.length === 3 && done.rows.every(r => /^imported/.test(r[1])) && done.counts[0] === '3 imported' && done.bar === '100%', done);
  P.case('N30: the commits are really in the repo, in version order, and James\'s branch is untouched', G(INTO, 'log', '--reverse', '--format=%s', 'history/snapshots').split('\n').map(s => s.split(' ')[1]).join() === '0.39.100,0.39.150,0.39.200'
    && G(INTO, 'log', '--format=%s', 'main') === 'now');
  P.case('N30: the page gives the one merge that joins it under your branch', /git merge --allow-unrelated-histories -s ours history\/snapshots/.test(done.merge), done.merge);
  if (process.env.ARCHIVE_SHOT) await pg.screenshot({ path: process.env.ARCHIVE_SHOT, fullPage: true });
  P.case('no page errors', errs.length === 0, { errs });
  await b.close(); srv.close(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} P.done();
});
