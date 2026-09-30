'use strict';
/**
 * tests/probe/manage-workbench-chromium.js — 0.39.282 N25 in a real page (Clear Glass's engine). James: "the manage
 * button. Can you make it beautiful like the rest of idearium. Like enterprise grade, fully built." The REAL
 * file-manage.js with the REAL idearium CSS and css/file-manage.css, over a stub API whose answers have the shapes
 * idearium returns (agent/settings, phases/runs, code/search, manage). Writes a screenshot to the scratch dir given as
 * MANAGE_SHOT (optional).
 */
const fs = require('fs'), path = require('path'), http = require('http');
const { start } = require('./_glass-probe.js');
const P = start();
const ROOT = P.ROOT;
const U = 'r1';
const posts = [];
const css = P.read('idearium/ui/css/nexus-theme.css') + '\n' + ((P.read('idearium/ui/index.html').match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '') + '\n' + P.read('idearium/ui/css/file-manage.css');
const code = Array.from({ length: 40 }, (_, i) => i === 11 ? 'export function acquire(key, ttlMs) {' : i === 12 ? '  return store.set(key, Date.now() + ttlMs);' : i === 13 ? '}' : `// line ${i + 1} of the lock service`).join('\n') + '\n';
const page = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="background:var(--bg);margin:0;height:100vh">
<textarea id="ide-editor" style="position:absolute;left:-9999px;top:0;width:10px;height:10px"></textarea>
<script>
let CURRENT_API_REPO = { uuid: '${U}', name: 'lock-service', files: [{ path: 'src/lock.js', bytes: 900 }] };
let ACTIVE_API_FILE = 'src/lock.js', _codeState = { uuid: '${U}', q: 'lock ttl', hits: [{ file: 'src/store.js', line: 8, name: 'set', summary: 'writes a key with an expiry' }, { file: 'src/lock.js', line: 12, name: 'acquire' }] };
window.__toasts = [];
function toast(m, t) { window.__toasts.push([m, t]); }
async function api(p, o = {}) { const r = await fetch(p, { headers: { 'Content-Type': 'application/json' }, ...o }); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.error || 'failed'); return d; }
${P.read('idearium/ui/js/app.js').match(/function escapeHtml\(s\)\{[^\n]*\}/)[0]}
function renderApiRepoPanel() {}
window.__plan = null; function openPlanPanel(o) { window.__plan = o; }
</script>
<script src="/js/file-manage.js"></script>
</body></html>`;
const runs = [
  { runId: 'manage-3', map: 'file:src/lock.js', phase: 'REBUILD', state: 'incomplete', ts: Date.parse('2026-09-29T20:10:00Z'), provider: 'ollama', absent: ['src/lock.js'], error: 'the reply did not bring back src/lock.js' },
  { runId: 'manage-3-review', draftRunId: 'manage-3', map: 'file:src/lock.js', phase: 'REBUILD', state: 'reviewed', ts: Date.parse('2026-09-29T20:14:00Z'), reviewer: 'chatgpt', provider: 'chatgpt' },
  { runId: 'manage-2', map: 'file:src/lock.js', phase: 'DEBUG', state: 'blocked', ts: Date.parse('2026-09-29T18:00:00Z'), provider: 'chatgpt', error: 'blocked: refusal — the reply says "i can\'t safely" and carries no code' },
  { runId: 'manage-1', map: 'file:src/other.js', phase: 'EXPAND', state: 'replied', ts: Date.parse('2026-09-29T17:00:00Z') },
];
const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  const j = (o, s = 200) => { r.writeHead(s, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
  const u = q.url;
  if (u === '/') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(page); }
  if (u.startsWith('/js/')) { r.writeHead(200, { 'Content-Type': 'application/javascript' }); return r.end(fs.readFileSync(path.join(ROOT, 'idearium/ui', u))); }
  if (q.method === 'POST') posts.push([u, b ? JSON.parse(b) : {}]);
  if (u === `/api/repos/${U}/files/state`) return j({ ok: true, states: { 'src/lock.js': { state: 'modified', pending: ['i1'] } }, counts: { modified: 1 } });
  if (u === `/api/repos/${U}/agent/settings`) return j({ ok: true, provider: 'ollama', providers: ['auto', 'ollama', 'chatgpt', 'gemini'] });
  if (u === `/api/repos/${U}/phases/runs`) return j({ ok: true, runs });
  if (u.startsWith(`/api/repos/${U}/code/search`)) return j({ ok: true, hits: [{ file: 'src/ttl.js', line: 2, name: 'expiry', summary: 'computes the expiry' }] });
  if (u === `/api/repos/${U}/manage`) return j({ ok: true, runId: 'manage-9', snapshot: 'vtm-m9', state: 'building' });
  j({ ok: false, error: 'no route ' + u }, 404);
}); });
srv.listen(0, '127.0.0.1', async () => {
  const b = await P.glass.chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
  await pg.evaluate((c) => { const ta = document.getElementById('ide-editor'); ta.value = c; ta.setSelectionRange(c.indexOf('export function'), c.indexOf('}\n') + 1); return loadFileStates(CURRENT_API_REPO, { force: true }); }, code);
  await pg.evaluate(() => openManagePanel());
  await pg.waitForTimeout(500);
  const v = await pg.evaluate(() => ({
    groups: [...document.querySelectorAll('.mg-group-title')].map(e => e.textContent),
    acts: document.querySelectorAll('.manage-act').length,
    writes: [...document.querySelectorAll('.mg-act .mg-wr')].map(e => e.textContent),
    scope: document.getElementById('mg-sc-lines').classList.contains('on'), from: document.getElementById('mg-from').value, to: document.getElementById('mg-to').value,
    preview: [...document.querySelectorAll('#mg-preview .mg-ln.mg-in .mg-c')].map(e => e.textContent),
    chips: [...document.querySelectorAll('.mg-chip')].map(e => e.textContent.trim()),
    providers: [...document.querySelectorAll('#mg-provider option')].map(o => o.value),
    hist: [...document.querySelectorAll('#mg-history .mg-run')].map(e => e.className.replace('mg-run ', '') + ' ' + e.querySelector('.mg-t').textContent),
    histText: document.getElementById('mg-history').textContent,
    pipe: [...document.querySelectorAll('#mg-pipe .mg-step')].map(e => (e.classList.contains('off') ? '-' : '+') + e.textContent),
    bg: getComputedStyle(document.querySelector('.mg-shell')).backgroundImage,
  }));
  P.case('N25: three groups, every action, each saying whether it writes', v.groups.join('|') === 'Change it|Fix & prove|Understand' && v.acts === 10 && v.writes.filter(x => x === 'READS').length === 2 && v.writes.filter(x => x === 'WRITES').length === 8, v);
  P.case('N25: the editor selection sets the scope to lines and previews exactly those lines', v.scope && v.from === '12' && v.to === '14' && v.preview.length === 3 && /export function acquire/.test(v.preview[0]), { from: v.from, to: v.to, preview: v.preview });
  P.case('N25: the header shows state, size and the waiting proposal', v.chips.includes('modified') && v.chips.some(c => /^40 lines$/.test(c)) && v.chips.some(c => /1 proposal waiting/.test(c)), v.chips);
  P.case('N25: who does it lists the repo\'s providers (auto left out), default first', v.providers.join() === ',ollama,chatgpt,gemini', v.providers);
  P.case('N25: the history rail holds this file\'s runs only — newest first, the review linked, states and reasons shown', v.hist.length === 3 && /s-incomplete/.test(v.hist[0]) && /s-reviewed/.test(v.hist[1]) && /s-blocked/.test(v.hist[2])
    && /absent: src\/lock\.js/.test(v.histText) && /reviewed by chatgpt/.test(v.histText) && /refusal/.test(v.histText) && !/other\.js/.test(v.histText), v.hist);
  P.case('N25: the pipeline is stated before sending — with ollama (the repo default) a writing action gets snapshot, gate, shadow and a review', v.pipe.length === 5 && v.pipe.every(s => s.startsWith('+')) && /ollama/.test(v.pipe[1]), v.pipe);
  await pg.evaluate(() => manageSetAction('explain'));
  const ro = await pg.evaluate(() => ({ pipe: [...document.querySelectorAll('#mg-pipe .mg-step')].map(e => (e.classList.contains('off') ? '-' : '+')).join(''), btn: document.getElementById('mg-send').textContent }));
  P.case('N25: a reading action drops snapshot, shadow and review, and says "Ask"', ro.pipe === '-++--' && /^Ask the agent/.test(ro.btn), ro);
  await pg.evaluate(() => { manageSetAction('rebuild'); document.getElementById('mg-provider').value = 'chatgpt'; document.getElementById('mg-provider').dispatchEvent(new Event('change')); });
  const cg = await pg.evaluate(() => [...document.querySelectorAll('#mg-pipe .mg-step')].map(e => (e.classList.contains('off') ? '-' : '+')).join(''));
  P.case('N25: a guardian agent chosen: no review step (it is already the reviewer)', cg === '++++-', cg);
  await pg.evaluate(() => manageSetScope('file'));
  const fsc = await pg.evaluate(() => ({ dis: document.getElementById('mg-from').disabled, inRows: document.querySelectorAll('#mg-preview .mg-ln.mg-in').length, more: /more lines/.test(document.getElementById('mg-preview').textContent) }));
  P.case('N25: whole-file scope disables the line inputs and previews the top of the file', fsc.dis && fsc.inRows === 0 && fsc.more, fsc);
  if (process.env.MANAGE_SHOT) { await pg.evaluate(() => { manageSetScope('lines'); document.getElementById('mg-from').value = 12; document.getElementById('mg-to').value = 14; managePreview(); document.getElementById('mg-note').value = 'keep the TTL semantics; add a release()'; }); await pg.screenshot({ path: process.env.MANAGE_SHOT });
    await pg.evaluate(() => { const m = document.querySelector('.mg-main'); m.scrollTop = m.scrollHeight; }); await pg.screenshot({ path: process.env.MANAGE_SHOT.replace(/\.png$/, '-lower.png') }); }
  await pg.evaluate(() => { document.getElementById('mg-note').value = 'keep the TTL semantics'; manageSetScope('lines'); document.getElementById('mg-from').value = 12; document.getElementById('mg-to').value = 14; });
  // the probe engine's keyboard.press does not do chords (Control+Enter arrives as an empty key), so the shortcut is a
  // real KeyboardEvent dispatched on whatever has focus — the path a person's Ctrl+Enter takes through the document
  await pg.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })));
  await pg.waitForTimeout(300);
  const mp = posts.find(x => x[0].endsWith('/manage'));
  P.case('N25: Ctrl+Enter sends one job: file, action, lines, note, the chosen provider, the related code picked', mp && mp[1].path === 'src/lock.js' && mp[1].action === 'rebuild' && mp[1].from === '12' && mp[1].to === '14'
    && mp[1].note === 'keep the TTL semantics' && mp[1].provider === 'chatgpt' && mp[1].refs.length === 1 && mp[1].refs[0].file === 'src/store.js', mp && mp[1]);
  const after = await pg.evaluate(() => ({ open: document.getElementById('manage-modal').classList.contains('open'), plan: window.__plan }));
  P.case('N25: after sending the workbench closes and the plan panel follows the run', !after.open && after.plan && after.plan.focus === 'manage-9', after);
  await pg.evaluate(() => openManagePanel()); await pg.waitForTimeout(200);
  await pg.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));   // focus outside the workbench too
  P.case('N25: Esc closes it', await pg.evaluate(() => !document.getElementById('manage-modal').classList.contains('open')));
  P.case('no page errors', errs.length === 0, { errs });
  await b.close(); srv.close(); P.done();
});
