'use strict';
/**
 * tests/modules/test-work-surface.test.js — 0.39.284 W3 (docs/2026-09-30-idearium-coding-flow-phasemap.spec)
 *
 * James: "i want below the plan, in idearium, the worksurface … identicle to yours" · "the tools arent exposed".
 *   WS-0x  workSurface() over .inject nodes and run rows: newest state per file, the diff against the right "before",
 *          +/− counts, the run that made it, the actions a card offers, the tools given and used
 *   WS-1x  GET /api/repos/:uuid/worksurface through idearium's real router, over real .inject nodes; Apply from a card
 *   WS-2x  the page: the Plan panel paints the work surface below the plan; tool calls are kept on runs
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

(async () => {
  console.log('\ntest-work-surface\n');
  try {
    const WS = await import(path.join(ROOT, 'idearium/repo/work-surface.js'));
    const { unifiedDiff } = require(path.join(ROOT, 'lib/code-edit.js'));
    const t0 = Date.parse('2026-09-30T10:00:00Z');
    const injects = [
      { uuid: 'i1', path: 'src/state.js', op: 'write', status: 'applied', before: 'const a = 1;\nconst b = 2;\n', content: 'const a = 1;\nconst b = 3;\nconst c = 4;\n', createdAt: t0 + 1000, appliedAt: t0 + 2000, hatName: 'kernel-agent' },
      { uuid: 'i0', path: 'src/state.js', op: 'write', status: 'reverted', before: '', content: 'x', createdAt: t0 - 99999 },
      { uuid: 'i2', path: 'src/new.js', op: 'write', status: 'proposed', before: null, content: 'export const n = 1;\n', createdAt: t0 + 3000, source: { kind: 'agent' } },
      { uuid: 'i3', path: 'src/old.js', op: 'delete', status: 'proposed', before: null, content: null, createdAt: t0 + 4000 },
      { uuid: 'i4', path: 'src/staged.js', op: 'write', status: 'staged', before: null, content: 'a\nb\n', createdAt: t0 + 5000, source: { staged: true } },
    ];
    const runs = [
      { runId: 'phase-1', phase: 'KE0_primitives', map: 'spec/k-phasemap.spec', state: 'building', ts: t0 },
      { runId: 'phase-1', phase: 'KE0_primitives', map: 'spec/k-phasemap.spec', state: 'replied', ts: t0 + 4500, injects: { injected: ['src/state.js', 'src/new.js'] }, provider: 'ollama',
        tools: [{ name: 'idearium.code_read.tool', ok: true, args: '{"path":"src/state.js"}' }, { name: 'idearium.code_write.tool', ok: false, error: 'outside the repo' }] },
    ];
    const current = { 'src/new.js': null, 'src/old.js': 'gone soon\n', 'src/staged.js': null };
    const w = WS.workSurface({ injects, runs, readCurrent: (p) => (p in current ? current[p] : null), unifiedDiff, listed: ['idearium.code_read.tool', 'idearium.code_write.tool', 'loom.find.tool'], scope: 'harness' });
    const f = Object.fromEntries(w.files.map(x => [x.path, x]));
    check('WS-01 one card per file, newest first, the newest node is its state (the reverted older one is history)', w.files.length === 4 && w.files[0].path === 'src/staged.js'
      && f['src/state.js'].status === 'applied' && f['src/state.js'].history === 1, JSON.stringify(w.files.map(x => [x.path, x.status])));
    check('WS-02 an applied change is measured against the file as it was BEFORE it was applied: +2 −1', f['src/state.js'].added === 2 && f['src/state.js'].removed === 1
      && /^-const b = 2;$/m.test(f['src/state.js'].diff) && /^\+const c = 4;$/m.test(f['src/state.js'].diff), f['src/state.js'].diff);
    check('WS-03 a proposed new file is all additions and says new; a proposed delete is all removals of the file as it is now', f['src/new.js'].creates && f['src/new.js'].added >= 1 && f['src/new.js'].removed === 0
      && f['src/old.js'].op === 'delete' && f['src/old.js'].removed >= 1 && f['src/old.js'].added === 0);
    check('WS-04 each card offers what its state allows: proposed → apply/reject, applied → revert, staged → promote/reject', f['src/new.js'].actions.join() === 'apply,reject'
      && f['src/state.js'].actions.join() === 'revert' && f['src/staged.js'].actions.join() === 'promote,reject' && f['src/staged.js'].staged);
    check('WS-05 the run that made a file is named (its phase and state); a file no run brought has none', f['src/state.js'].run && f['src/state.js'].run.phase === 'KE0_primitives'
      && f['src/state.js'].run.state === 'replied' && f['src/old.js'].run === null);
    check('WS-06 totals: files, +, −, and how many wait on a person', w.totals.files === 4 && w.totals.pending === 3 && w.totals.added === w.files.reduce((n, x) => n + x.added, 0));
    check('WS-07 tools: the scope, what the agent is given, every call it made (✓/✗ with the error), and which it used', w.tools.scope === 'harness' && w.tools.listed.length === 3
      && w.tools.calls.length === 2 && w.tools.calls[1].ok === false && /outside/.test(w.tools.calls[1].error) && w.tools.used.join() === 'idearium.code_read.tool,idearium.code_write.tool');
    check('WS-08 the run list: one row per run with its files and tool count', w.runs.length === 1 && w.runs[0].files === 2 && w.runs[0].tools === 2 && w.runs[0].provider === 'ollama');
    check('WS-09 toolsBrief keeps a reply\'s calls small (name, ok, error, args ≤ 200)', JSON.stringify(WS.toolsBrief({ toolCalls: [{ name: 'x', ok: true, arguments: { q: 'y'.repeat(500) } }] })[0].args).length <= 210
      && WS.toolsBrief({}) === null);

    // ── WS-1x the real router ──
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = L.ingest({ name: `ws-${Date.now()}`, source: 'test', files: [{ path: 'src/lock.js', content: 'module.exports = 1;\n' }] });
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    const u = made.repo.uuid;
    const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
    const p1 = RI.propose({ layer: L, repo: made.repo, path: 'src/lock.js', content: 'module.exports = 2;\n// ttl\n' });
    const g = await api._route('GET', `/api/repos/${u}/worksurface`);
    const card = g.json && g.json.files && g.json.files.find(x => x.path === 'src/lock.js');
    check('WS-11 GET …/worksurface: the proposed change of a real file, diffed against the file on disk, with its actions and the agent\'s tools',
      g.status === 200 && card && card.status === 'proposed' && card.added === 2 && card.removed === 1 && card.actions.includes('apply') && Array.isArray(g.json.tools.listed) && g.json.tools.listed.length > 3,
      JSON.stringify(g.json).slice(0, 400));
    const a = await api._route('POST', `/api/repos/${u}/injects/${p1.inject.uuid}/apply`, {});
    const g2 = await api._route('GET', `/api/repos/${u}/worksurface`);
    const c2 = g2.json.files.find(x => x.path === 'src/lock.js');
    check('WS-12 Apply (the card\'s button) writes it; the card then reads applied, same diff, offering revert', a.status === 200 && c2.status === 'applied' && c2.added === 2 && c2.removed === 1
      && c2.actions.join() === 'revert' && /module\.exports = 2/.test(L.readTextFile(u, 'src/lock.js').content), JSON.stringify(a.json).slice(0, 200));
    const ed = await api._route('POST', `/api/repos/${u}/manage`, { path: 'src/lock.js', action: 'edit', from: 1, to: 1, note: 'rename to value' });
    check('WS-14 a card\'s ✎ edit is a Manage "edit" of the picked lines — accepted (here refused only for want of a Versionium snapshot, never for the action)',
      !/action must be one of/.test(JSON.stringify(ed.json)) && (ed.status === 200 || /snapshot/i.test(JSON.stringify(ed.json))), JSON.stringify(ed.json).slice(0, 200));
    const wsjs = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/work-surface.js'), 'utf8');
    check('WS-15 the card asks the agent: picked lines + one instruction → POST …/manage action edit', /action: 'edit', from: from \|\| undefined/.test(wsjs) && /function wsPickLine/.test(wsjs));
    check('WS-13 an unknown repo is a 404', (await api._route('GET', '/api/repos/nexus-id-repo-nope/worksurface')).status === 404);

    // §0.39.361 — BL15: a -648 +1 proposal read -400 because the counts came from the diff shown, cut at 400 lines
    const big = Array.from({ length: 648 }, (_, i) => `const v${i} = ${i};`).join('\n') + '\n';
    const wb = WS.workSurface({ injects: [{ uuid: 'b1', path: 'lib/big.js', op: 'write', status: 'proposed', content: 'lib/big.js\n', createdAt: t0 }], runs: [], readCurrent: () => big, unifiedDiff });
    check('WS-23 +added -removed count the whole change, not the diff lines shown', wb.files[0].removed === 648 && wb.files[0].added === 1, `${wb.files[0].added} ${wb.files[0].removed}`);

    // §0.39.361 — James: "i dont use git." A reverted change says whether the file is back; it is not counted in +/−
    const wr = WS.workSurface({ injects: [{ uuid: 'r1', path: 'lib/big.js', op: 'write', status: 'reverted', before: big, content: 'lib/big.js\n', createdAt: t0, appliedAt: t0 + 1 }],
      runs: [{ runId: 'phase-9', phase: 'BL15', map: 'm', state: 'replied', ts: t0 + 2, provider: 'chatgpt', injects: { injected: ['lib/big.js'] } }], readCurrent: () => big, unifiedDiff });
    check('WS-16 a reverted change whose file is back as it was says so (restored, its line count)', wr.files[0].undone && wr.files[0].now.restored === true && wr.files[0].now.lines === 648, JSON.stringify(wr.files[0].now));
    check('WS-17 an undone change is not in the totals — counted as undone', wr.totals.files === 0 && wr.totals.removed === 0 && wr.totals.undone === 1, JSON.stringify(wr.totals));
    check('WS-18 a card names the agent of the run that wrote it', wr.files[0].run && wr.files[0].run.provider === 'chatgpt');
    const wx = WS.workSurface({ injects: [{ uuid: 'r2', path: 'lib/big.js', op: 'write', status: 'reverted', before: big, content: 'x\n', createdAt: t0 }], runs: [], readCurrent: () => 'lib/big.js\n', unifiedDiff });
    check('WS-19 a reverted change whose file is NOT back is flagged, with the counts', wx.files[0].now.restored === false && wx.files[0].now.lines === 1 && wx.files[0].now.wasLines === 648);
    const wsui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/work-surface.js'), 'utf8');
    check('WS-20 the card paints what the file is now, undone cards start closed', /function _wsNow\(f\)/.test(wsui) && /\$\{_wsNow\(f\)\}/.test(wsui) && /!f\.undone && i < 2/.test(wsui));

    // §0.39.362 WS2 — "the work surface could also stream the dom mutator": each file being written is a card as it streams
    {
      const vm = require('vm');
      const els = {};
      const sb = { console, escapeHtml: (x) => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]), AGENT_FEED: new Map(),
        document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [] }, CURRENT_API_REPO: null };
      vm.createContext(sb);
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/work-surface.js'), 'utf8') + '\nthis.WSURF = WSURF; this.wsFormingBlocks = wsFormingBlocks; this.wsLivePaint = wsLivePaint;', sb);
      const half = 'Here.\n\n```js lib/notes.js\nconst a = 1;\nconst b = 2;\n';
      let b = sb.wsFormingBlocks(half);
      check('WS-30 a reply mid-stream: the open fence is a file being written, its path and lines so far', b.length === 1 && b[0].path === 'lib/notes.js' && b[0].open && b[0].lines === 2, JSON.stringify(b));
      const full = half + 'module.exports = { a, b };\n```\n\n```js tests/notes.test.js\nrequire(\'../lib/notes.js\');\n';
      b = sb.wsFormingBlocks(full);
      check('WS-31 a closed fence is written; the next one opens; prose and unaddressed blocks are not files', b.length === 2 && !b[0].open && b[0].lines === 3 && b[1].open && b[1].path === 'tests/notes.test.js'
        && sb.wsFormingBlocks('```js\nx()\n```\n```bash\nnpm test\n```').length === 0);
      sb.WSURF.uuid = 'R1'; sb.WSURF.data = { files: [] };
      els['ws-forming'] = { innerHTML: '' };
      sb.AGENT_FEED.set('R1', { jobId: 'j1', text: full, generating: true, provider: 'chatgpt', mutations: 41, anchor: { path: 'div.markdown' }, updated: Date.now() });
      sb.wsLivePaint('R1');
      const h = els['ws-forming'].innerHTML;
      check('WS-32 each frame paints the forming cards: who is writing, the mutations, the anchor, each file writing / written', /chatgpt is writing/.test(h) && /41 mutations/.test(h) && /div\.markdown/.test(h)
        && /written — landing/.test(h) && />writing</.test(h) && /notes\.test\.js/.test(h), h.slice(0, 300));
      sb.WSURF.data = { files: [{ path: 'lib/notes.js', at: Date.now() }] };
      sb.wsLivePaint('R1');
      check('WS-33 once its real card lands, the forming card for that file goes', !/>notes\.js</.test(els['ws-forming'].innerHTML) && /notes\.test\.js/.test(els['ws-forming'].innerHTML));
      check('WS-34 wired: every feed frame repaints the forming cards', /wsLivePaint\(p\.repoUuid\)/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8')));
    }

    // ── WS-2x wiring ──
    const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    check('WS-21 a phase run keeps its tool calls (tools on the row) — and a plan run too', /try \{ const tb = _toolsBrief\(r\); if \(tb\) row\.tools = tb; \} catch/.test(idx)
      && /toolsBrief\(res\)/.test(fs.readFileSync(path.join(ROOT, 'idearium/api/build-surface.js'), 'utf8')));
    const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
    check('WS-22 the Plan panel paints the work surface below the plan; the page loads its script and CSS', /<div id="pp-ws" class="pp-ws"><\/div>/.test(pp) && /wsLoad\(w\)/.test(pp)
      && /js\/work-surface\.js/.test(html) && /css\/work-surface\.css/.test(html));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
