'use strict';
/**
 * tests/modules/test-repo-inject.js
 * §2026-09-21 — .inject nodes (lib/repo-inject.js), their wiring into the
 * compartment agent's dispatch, and the Agent tab's CLI + editor.
 *
 * Every write goes through the REAL idearium RepoLayer — the same object
 * getRepoLayer() hands production — and every claim is checked by reading
 * the file back through that layer, because "the write said ok" is not
 * "the file is there". Node files go to a temp NEXUS_INJECT_DIR.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}

async function run() {
  console.log('\ntest-repo-inject\n');
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  const RI = require(path.join(ROOT, 'lib', 'repo-inject.js'));
  const RA = require(path.join(ROOT, 'lib', 'repo-agent.js'));
  const RH = require(path.join(ROOT, 'lib', 'repo-hat.js'));
  const NX = require(path.join(ROOT, 'lib', 'node-export.js'));

  // getSpecEngine() loads the spec-engine by async import on first use (the
  // build-queue poller warms it in production). Retry the real ingest until
  // it is loaded rather than stubbing it — bounded, and loud if it never is.
  let repoRec = null;
  for (let i = 0; i < 20; i++) {
    repoRec = layer.ingest({ name: `inject-test-${Date.now()}`, source: 'test',
      files: [{ path: 'src/a.js', content: 'const a = 1;\n' }, { path: 'README.md', content: '# t\n' }] });
    if (!(repoRec && repoRec.error && /no spec-engine/.test(repoRec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const repo = repoRec && (repoRec.repo || repoRec);
  check('a real repo exists to write into', !!(repo && repo.uuid), JSON.stringify(repoRec).slice(0, 200));
  if (!repo || !repo.uuid) { process.exitCode = 1; return; }
  const U = repo.uuid;
  const read = p => { const r = layer.readFile(U, p); return r && !r.error ? r.content : null; };
  const SEED = read('src/a.js');   // whatever the import path stored — injects must restore exactly this
  check('the seeded file reads back', SEED !== null && SEED.trim() === 'const a = 1;');

  // ── type ──
  check('inject is a registered node type', NX.KNOWN_TYPES.includes('inject'));
  check('the existing prompt-injection types are untouched', NX.KNOWN_TYPES.includes('injection') && NX.KNOWN_TYPES.includes('inject_rule'));

  // ── propose / apply / revert on an existing file ──
  const p1 = RI.propose({ layer, repo, path: 'src/a.js', content: 'const a = 2;\n' });
  check('propose succeeds', p1.ok, JSON.stringify(p1.errors));
  check('propose writes NOTHING to the repo', read('src/a.js') === SEED);
  check('a real .inject node file exists', fs.existsSync(path.join(process.env.NEXUS_INJECT_DIR, `${p1.inject.uuid}.inject`)));
  check('the node file is a valid envelope of type inject', NX.importFromFile(path.join(process.env.NEXUS_INJECT_DIR, `${p1.inject.uuid}.inject`)).type === 'inject');
  check('baseSha pins the file exactly as the store holds it', p1.inject.baseSha256 === RI.sha(SEED));

  const e1 = RI.edit(p1.inject.uuid, 'const a = 3;\n');
  check('a proposed inject can be edited (the editor save)', e1.ok && e1.inject.contentSha256 === RI.sha('const a = 3;\n'));

  const a1 = RI.apply(p1.inject.uuid, { layer });
  check('apply succeeds', a1.ok, JSON.stringify(a1.errors));
  check('the EDITED content landed byte-for-byte, trailing newline included', read('src/a.js') === 'const a = 3;\n');
  check('apply captured the exact prior content as the undo', a1.inject.before === SEED);
  check('inject writes preserve whitespace — nothing normalised', a1.inject.normalized === false && a1.inject.appliedSha256 === RI.sha('const a = 3;\n'));
  check('an applied inject cannot be edited', RI.edit(p1.inject.uuid, 'x').ok === false);
  check('an applied inject cannot be applied twice', RI.apply(p1.inject.uuid, { layer }).ok === false);

  const r1 = RI.revert(p1.inject.uuid, { layer });
  check('revert succeeds', r1.ok, JSON.stringify(r1.errors));
  check('revert restores the prior content exactly', read('src/a.js') === SEED);
  check('history records the whole lifecycle', r1.inject.history.map(h => h.event).join('>') === 'proposed>edited>applied>reverted');

  // ── a new file: apply creates, revert deletes ──
  const p2 = RI.propose({ layer, repo, path: 'src/new.js', content: 'export const n = 1;\n' });
  check('an inject for a missing file is marked creates', p2.inject.creates === true && p2.inject.baseSha256 === null);
  RI.apply(p2.inject.uuid, { layer });
  check('apply creates the file', read('src/new.js') === 'export const n = 1;\n');
  const r2 = RI.revert(p2.inject.uuid, { layer });
  check('reverting a created file deletes it', r2.ok && read('src/new.js') === null, JSON.stringify(r2.errors));

  // ── conflicts ──
  const p3 = RI.propose({ layer, repo, path: 'README.md', content: '# agent\n' });
  layer.writeTextFile(U, 'README.md', '# someone else edited this\n');
  const a3 = RI.apply(p3.inject.uuid, { layer });
  check('apply REFUSES when the file changed since proposal', a3.ok === false && a3.conflict === true);
  check('the refusal leaves the newer edit intact', read('README.md').trim() === '# someone else edited this'); // that edit went through the default (trimming) path, as an ordinary caller's would
  const a3f = RI.apply(p3.inject.uuid, { layer, force: true });
  check('force applies anyway, and records that it was forced', a3f.ok && read('README.md') === '# agent\n' && a3f.inject.history.some(h => h.event === 'applied (forced)'));
  layer.writeTextFile(U, 'README.md', '# edited after the inject\n');
  const r3 = RI.revert(p3.inject.uuid, { layer });
  check('revert REFUSES when the file changed since apply', r3.ok === false && r3.conflict === true && read('README.md').trim() === '# edited after the inject');

  // ── reject, guards ──
  const p4 = RI.propose({ layer, repo, path: 'src/a.js', content: 'nope\n' });
  check('reject works on a proposal', RI.reject(p4.inject.uuid, { reason: 'no' }).ok && read('src/a.js') === SEED);
  check('a rejected inject cannot be applied', RI.apply(p4.inject.uuid, { layer }).ok === false);
  check('an escaping path is refused', RI.propose({ layer, repo, path: '../../etc/x.js', content: 'x' }).ok === false);
  check('an absolute path is refused', RI.propose({ layer, repo, path: '/etc/passwd', content: 'x' }).ok === false);
  check('list returns this repo\'s injects newest first', RI.list(U).length >= 4 && RI.list(U)[0].uuid === p4.inject.uuid);
  check('list filters by status', RI.list(U, { status: 'rejected' }).every(n => n.status === 'rejected'));

  // ── mode ──
  check('mode defaults to review', RI.getMode(U) === 'review');
  check('an unknown mode is refused', RI.setMode(U, 'yolo').ok === false);

  // ── understanding where code goes ──
  check('definedSymbols reads top-level definitions across languages',
    ['pollQueue', 'Queue', 'LIMIT', 'parse_row', 'Handle', 'Opts'].every(n => RI.definedSymbols(
      'export async function pollQueue() {}\nclass Queue {}\nconst LIMIT = 3;\ndef parse_row(x):\n  pass\nfunc (s *S) Handle() {}\ninterface Opts {}').includes(n)));
  const IDX = [
    { file: 'src/poller.js', symbols: [{ name: 'pollQueue' }, { name: 'flush' }] },
    { file: 'src/other.js', symbols: [{ name: 'render' }] },
    { file: 'src/a.js', symbols: [{ name: 'shared' }] }, { file: 'src/b.js', symbols: [{ name: 'shared' }] },
  ];
  check('a block defining a symbol owned by ONE file resolves to that file',
    RI.bySymbols('function pollQueue() { return 2; }', IDX).file === 'src/poller.js');
  check('a symbol owned by TWO files is not guessed — it goes to the agent with both as candidates',
    (r => r.file === null && r.candidates.length === 2)(RI.bySymbols('function shared() {}', IDX)));
  check('…unless exactly one of them was in the context the agent was shown',
    RI.bySymbols('function shared() {}', IDX, ['src/b.js']).file === 'src/b.js');

  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'inj-idx-'));
  fs.mkdirSync(path.join(DIR, 'chunks'));
  fs.writeFileSync(path.join(DIR, 'chunks', 'index.json'), JSON.stringify([{ file: 'src/a.js', symbols: [{ name: 'a' }] }]));
  const asked = [];
  const resolver = answer => async q => { asked.push(q); if (answer instanceof Error) throw answer; return answer; };
  const hatX = { uuid: 'hat-x', name: 'repo_x' };

  const reply = 'Here:\n```js src/b.js\nconst b = 2;\n```\n```js\nconst a = 5;\n```\n```bash\nnpm test\n```\n```js ../escape.js\nbad()\n```\n```js\nfunction brandNew() {}\n```';
  const fr = await RI.fromReply({ layer, repo, hat: hatX, text: reply, repoDir: DIR, resolve: resolver('src/brand-new.js') });
  const by = Object.fromEntries(fr.injects.map(i => [i.path, i.addressedBy]));
  check('a stated path is used — addressedBy fence', by['src/b.js'] === 'fence');
  check('a block with NO path that redefines an existing symbol lands in that file — addressedBy symbols', by['src/a.js'] === 'symbols');
  check('a genuinely new block is placed by the AGENT, not punted to the person — addressedBy agent', by['src/brand-new.js'] === 'agent');
  check('the agent was asked only for the block the evidence could not place', asked.length === 1 && asked[0].symbols.includes('brandNew'));
  check('the agent is given the repo\'s real files as candidates', asked[0].candidates.includes('src/a.js'));
  check('shell blocks are commands, not files — never written, never asked about', fr.commands === 1);
  check('a path escaping the tree is still refused', fr.refused.some(x => /unsafe/.test(x.reason)));
  check('review mode writes nothing', read('src/b.js') === null && read('src/brand-new.js') === null);
  check('every inject records how it was addressed', RI.get(fr.injects.find(i => i.path === 'src/a.js').uuid).source.addressedBy === 'symbols');
  check('the inject is attributed to the hat (agent id)', RI.get(fr.injects[0].uuid).agentId === 'hat-x');

  check('the agent saying NONE leaves the block unwritten, with its reason',
    (await RI.fromReply({ layer, repo, hat: hatX, text: '```js\nconsole.log(1)\n```', repoDir: DIR, resolve: resolver('NONE') })).unresolved[0].reason.includes('not meant to be written'));
  check('an agent answer that escapes the tree is not used',
    (await RI.fromReply({ layer, repo, hat: hatX, text: '```js\nfunction z() {}\n```', repoDir: DIR, resolve: resolver('../../etc/z.js') })).injects.length === 0);
  check('an agent that cannot be reached is reported, not hidden',
    /could not be asked/.test((await RI.fromReply({ layer, repo, hat: hatX, text: '```js\nfunction y() {}\n```', repoDir: DIR, resolve: resolver(new Error('down')) })).unresolved[0].reason));
  check('"NEW path" answers are accepted as new files',
    (await RI.fromReply({ layer, repo, hat: hatX, text: '```js\nfunction w() {}\n```', repoDir: DIR, resolve: resolver('NEW src/w.js') })).injects[0].path === 'src/w.js');

  RI.setMode(U, 'auto');
  const fa = await RI.fromReply({ layer, repo, hat: hatX, text: '```js src/c.js\nconst c = 3;\n```', repoDir: DIR });
  check('auto mode: the block is written at once, exact bytes', fa.injects[0].status === 'applied' && read('src/c.js') === 'const c = 3;\n');
  check('auto-written code is still revertable', RI.revert(fa.injects[0].uuid, { layer }).ok && read('src/c.js') === null);
  check('an unclosed fence injects nothing', (await RI.fromReply({ layer, repo, hat: null, text: '```js src/d.js\nconst d' })).injects.length === 0 && read('src/d.js') === null);
  RI.setMode(U, 'review');
  fs.rmSync(DIR, { recursive: true, force: true });

  // ── dispatch end to end ──
  const prompts = []; let reply2 = '';
  const srv = await new Promise((res, rej) => {
    const s = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => {
      let body = {}; try { body = JSON.parse(d); } catch (_) {}
      if (q.url === '/api/prompt') prompts.push(body);
      const isResolve = /Which repo-relative file does it belong in\?/.test(body.prompt || '');
      r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ text: isResolve ? 'src/placed-by-agent.js' : reply2, model_used: 'stub' })); }); });
    s.on('error', rej); s.listen(3750, '127.0.0.1', () => res(s));
  }).catch(e => { console.log(`  ! cannot bind :3750 — ${e.message}`); return null; });
  if (srv) {
    try {
      const repoWithComp = { ...repo, compartmentId: repo.compartmentId || 'cos.test.inject' };
      // §0.39.282 — ollama is the default provider now, and economy staging (0.39.281 EC5) stages an ollama reply on the
      // repo's staging branch instead of applying it. This section proves the direct review/auto paths, so it names a
      // guardian agent (the staging path has its own suite, test-economy).
      RA.setProvider(repo.uuid, 'chatgpt');
      reply2 = 'Done.\n```js src/agent.js\nexport default 42;\n```';
      const d1 = await RA.dispatch({ repo: repoWithComp, repoDir: null, message: 'write agent.js', layer });
      check('the agent is told its code is written into the project', (prompts[0].prompt || '').includes('Code you write for this project is written into it'));
      check('dispatch reports the inject it made', d1.ok && d1.injects && d1.injects.injects.length === 1);
      check('review mode through dispatch proposes, does not write', read('src/agent.js') === null);

      reply2 = 'Here it is:\n```js\nexport function placedByAgent() { return 1; }\n```';
      const dN = await RA.dispatch({ repo: repoWithComp, repoDir: null, message: 'add a helper', layer });
      const placed = dN.injects.injects[0];
      check('an unlabelled block is placed by the agent through dispatch', placed && placed.path === 'src/placed-by-agent.js' && placed.addressedBy === 'agent');
      const rp = prompts.find(p => /Which repo-relative file/.test(p.prompt || ''));
      check('the placement question goes on a side session, not the conversation', rp && /-resolve$/.test(rp.sessionId) && rp.channel === 'idearium-repo-agent-resolve');
      check('the placement question carries the original request', rp && rp.prompt.includes('add a helper'));

      RI.setMode(U, 'auto');
      reply2 = '```js src/agent2.js\nexport default 43;\n```';
      const d2 = await RA.dispatch({ repo: repoWithComp, repoDir: null, message: 'write agent2.js', layer });
      check('AUTO: the agent\'s output goes directly into the compartment', d2.injects.injects[0].status === 'applied' && read('src/agent2.js') === 'export default 43;\n');
      const hatNow = RH.getRepoHat(U);
      check('the auto inject carries the agent\'s hat id', RI.get(d2.injects.injects[0].uuid).agentId === (hatNow.uuid || hatNow.id));

      const d3 = await RA.dispatch({ repo: repoWithComp, repoDir: null, message: 'no layer', layer: null });
      check('with no layer, code is NOT silently dropped — the reply says why', /no repo layer/.test(d3.injects.refused[0].reason));
      reply2 = 'plain prose, no code';
      check('a reply with no code reports injects:null', (await RA.dispatch({ repo: repoWithComp, repoDir: null, message: 'q', layer })).injects === null);
      check('the exchange log records the injects', RA.history(U, 20).some(h => Array.isArray(h.injects) && h.injects.length === 1));
    } finally {
      RI.setMode(U, 'review');
      try { RH.revokeRepoHat(U); } catch (_) {}
      RA.clearHistory(U);
      srv.close();
    }
  }

  // ── UI ──
  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  const HTML = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'index.html'), 'utf8');
  for (const id of ['inject-editor-modal', 'inj-ed-content', 'inj-ed-current', 'inj-ed-save', 'inj-ed-apply', 'inj-ed-reject', 'inj-ed-revert'])
    check(`editor element #${id} exists`, HTML.includes(`id="${id}"`));
  const cmdSrc = extractFn(APP, 'agentCommand');
  const cases = [...cmdSrc.matchAll(/case '([a-z?]+)'/g)].map(m => m[1]).filter(c => c !== '?');
  const help = APP.slice(APP.indexOf('const AGENT_CLI_HELP'), APP.indexOf('].join', APP.indexOf('const AGENT_CLI_HELP')));
  const undocumented = cases.filter(c => !help.includes(`/${c}`));
  check('every CLI command handled is documented in /help', undocumented.length === 0, undocumented.join(','));
  check('the CLI covers hat, model, memory, injects and settings',
    ['hat', 'status', 'memory', 'learn', 'forget', 'mode', 'injects', 'inject', 'open', 'apply', 'reject', 'revert', 'context', 'export', 'import'].every(c => cases.includes(c)));
  check('slash input is routed to the CLI, not sent to the model', /message\.startsWith\('\/'\)\) \{[^}]*agentCommand\(message\)/.test(extractFn(APP, 'agentSend')));

  const esc = extractFn(APP, 'escapeHtml');
  const det = new Function(`${esc}; ${extractFn(APP, '_agentDetail')}; return _agentDetail;`)();
  const html = det({ injects: { mode: 'auto', injects: [{ uuid: 'u1', path: 'src/x.js', status: 'applied', creates: true, addressedBy: 'agent' }], refused: [{ reason: 'unsafe path' }], unresolved: [{ reason: 'nope' }], commands: 2 } });
  check('each reply shows what it wrote into the compartment', html.includes('✎ wrote') && html.includes('src/x.js') && html.includes('(auto)'));
  check('each write says how it was placed', html.includes('agent placed it'));
  check('refusals, unresolved blocks and commands are shown, not hidden', html.includes('refused: unsafe path') && html.includes('not written: nope') && html.includes('2 shell blocks'));

  fs.rmSync(process.env.NEXUS_INJECT_DIR, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 300);
}
setTimeout(() => run().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); }), 2500);
