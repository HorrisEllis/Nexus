'use strict';
/**
 * cos/app/shell.js — the COS command line: runs `npm run start:all` and the Nexus commands without PowerShell or npm (CON-lite, 0.60.91)
 * comp_id: cos.app.shell
 * Map: docs/2026-10-16-cos-console-phasemap.spec (addendum c)
 *
 * James, 2026-10-16: "just need a cli to replace powershell, to run the npm run start:all command, and cli commands."
 *
 * What it understands, and nothing else (a line it does not understand is refused with the reason, never handed to a hidden shell):
 *   npm run <script> [-- args] | npm start | npm test    the script in the CURRENT version's package.json, when it is ONE `node <file> [args]` command (12 of 13 here are).
 *                                                         Chains (&&, |, ;), other programs (concurrently, cross-env) and `npm install` are refused and named: COS has no npm.
 *   nexus <args>                                          node cli/nexus.js <args> in the current version
 *   node <file> [args]                                    a file INSIDE the current version (no ../ out of it)
 *   switch | rollback | start | stop | running | logs | list | status | import | inbox | remove | settings     COS's own verbs (cos/app/cli.js)
 *   help | exit
 * It runs with COS's own runtime (ELECTRON_RUN_AS_NODE when under Electron), the bundled modules (NODE_PATH) and the project's one data folder (NEXUS_DATA_ROOT), in the version folder.
 * No shell is involved: arguments are passed as given, so quoting rules of cmd/PowerShell never apply. Ctrl+C ends the running command's whole process tree, not the console.
 * It will not start a second copy of what COS already runs: a script that boots the autopilot while the project is running (or its ports are taken) is refused with the reason.
 */
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const Store = require('./store.js'), RT = require('./runtime.js');
const COS_VERBS = new Set(['switch', 'rollback', 'start', 'stop', 'running', 'logs', 'list', 'status', 'import', 'inbox', 'remove', 'settings']);
const HELP = `COS command line. No PowerShell, no npm needed.
  npm run <script> [-- args]   run a script of the current version (one "node <file>" command), like  npm run start:all
  nexus <args>                 the Nexus command line (cli/nexus.js), like  nexus status
  node <file> [args]           a file inside the current version
  switch <project> <version> · rollback <project> · start|stop|running|logs <project> · list · status · import <zip> · inbox · remove <project> <version> · settings [key value]
  help · exit        Ctrl+C ends the running command, not this window.`;

/** tokenize(line) → string[] | { error } — spaces separate; "double" or 'single' quotes group; a backslash is just a backslash (Windows paths) */
function tokenize(line) {
  const out = []; let cur = '', q = null, has = false;
  for (const ch of String(line)) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ''; has = false; }
    else cur += ch;
  }
  if (q) return { error: `unclosed ${q} quote` };
  if (cur || has) out.push(cur); return out;
}
const META = /[&|;<>`$()]|\|\|/;
/** scriptCommand(text) → { file, args } | { error } — only a single `node <file> [args]` command */
function scriptCommand(name, text) {
  if (typeof text !== 'string') return { error: `no script "${name}" in package.json` };
  if (META.test(text)) return { error: `the script "${name}" is "${text}", which chains commands or uses a shell feature. COS runs scripts that are one "node <file>" command (it has no npm and no shell).` };
  const t = tokenize(text); if (t.error) return { error: `the script "${name}" has ${t.error}` };
  if (t[0] !== 'node' || !t[1]) return { error: `the script "${name}" is "${text}": COS runs only scripts that start with "node <file>" (it has no npm and no other programs).` };
  return { file: t[1], args: t.slice(2) };
}
const inside = (dir, rel) => { const p = path.resolve(dir, rel); return p === dir || p.startsWith(dir + path.sep) ? p : null; };

/** plan(root, project, line, opts) → { ok:true, kind:'run', display, cmd, args, cwd, env, boots } | { ok:true, kind:'cos'|'builtin', ... } | { ok:false, error } — decides, runs nothing */
function plan(root, project, line, opts = {}) {
  const t = tokenize(line); if (t.error) return { ok: false, error: t.error };
  if (!t.length) return { ok: true, kind: 'builtin', name: 'empty' };
  const w = t[0];
  if (w === 'help' || w === '?') return { ok: true, kind: 'builtin', name: 'help' };
  if (w === 'exit' || w === 'quit') return { ok: true, kind: 'builtin', name: 'exit' };
  if (COS_VERBS.has(w) || w === 'cos') { const a = w === 'cos' ? t.slice(1) : t; if (!a.length) return { ok: true, kind: 'builtin', name: 'help' }; return { ok: true, kind: 'cos', argv: a }; }
  if (!['npm', 'nexus', 'node'].includes(w)) return { ok: false, error: `"${w}" is not a COS command. COS runs: npm run <script>, nexus <args>, node <file>, and its own verbs. Type help.` };
  const st = (Store.list(root, project)[0]) || null;
  if (!st || !st.current) return { ok: false, error: `${project} has no current version: switch to one first (list shows what is installed)` };
  const cwd = path.join(root, 'projects', project, 'versions', st.current);
  if (!fs.existsSync(cwd)) return { ok: false, error: `the current version folder is missing: ${cwd}` };
  let file, args;
  if (w === 'nexus') { file = 'cli/nexus.js'; args = t.slice(1); }
  else if (w === 'node') {
    if (!t[1]) return { ok: false, error: 'node needs a file inside the current version (node cli/nexus.js status)' };
    if (!inside(cwd, t[1])) return { ok: false, error: `${t[1]} is outside the current version (${st.current}): COS runs only files inside it` };
    file = t[1]; args = t.slice(2);
  } else {
    let name, extra = [];
    if (t[1] === 'run' || t[1] === 'run-script') { name = t[2]; const d = t.indexOf('--'); extra = d >= 0 ? t.slice(d + 1) : []; }
    else if (t[1] === 'start' || t[1] === 'test') { name = t[1]; extra = t.slice(2).filter(a => a !== '--'); }
    else if (t[1] === 'install' || t[1] === 'i' || t[1] === 'ci') return { ok: false, error: `COS has no npm, so "npm ${t[1]}" cannot run. Nexus needs only js-yaml, which COS already provides.` };
    else return { ok: false, error: `npm ${t[1] || ''}: COS supports "npm run <script>", "npm start" and "npm test"` };
    if (!name) { let names = []; try { names = Object.keys(JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts || {}); } catch (_) {} return { ok: false, error: `npm run needs a script name. This version has: ${names.join(', ') || '(none)'}` }; }
    let scripts = {}; try { scripts = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts || {}; } catch (e) { return { ok: false, error: `package.json of ${st.current} is unreadable: ${e.message}` }; }
    const sc = scriptCommand(name, scripts[name]); if (sc.error) return { ok: false, error: sc.error };
    if (!inside(cwd, sc.file)) return { ok: false, error: `the script "${name}" runs ${sc.file}, outside the version folder` };
    file = sc.file; args = [...sc.args, ...extra];
  }
  if (!fs.existsSync(path.join(cwd, file))) return { ok: false, error: `${file} does not exist in ${project} ${st.current}` };
  const modules = opts.modulesDir === undefined ? RT.defaultModulesDir() : opts.modulesDir;
  const env = { ...process.env, ...(opts.env || {}), NEXUS_DATA_ROOT: path.join(root, 'projects', project, 'data'), ...(modules ? { NODE_PATH: [modules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter) } : {}), ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
  const boots = /(^|[\\/])nexus[\\/]autopilot\.js$/.test(file.replace(/\\/g, '/')) || file.replace(/\\/g, '/') === 'lib/nexus/autopilot.js';
  return { ok: true, kind: 'run', display: `${w === 'npm' ? line.trim() : `${w} ${t.slice(1).join(' ')}`.trim()}  →  node ${[file, ...args].join(' ')}  (${project} ${st.current})`, cmd: opts.node || process.execPath, args: [file, ...args], cwd, env, boots, version: st.current };
}

/** guard(root, project, p, opts) → null | { error } — a command that boots the autopilot must not start a second copy */
async function guard(root, project, p, opts = {}) {
  if (!p.boots) return null;
  const run = await RT.status(root, project);
  if (run.running) return { error: `${project} ${run.version} is already running under COS (pid ${run.pid}). Stop it first (stop ${project}), or use  running ${project}  and  logs ${project}.` };
  const ports = opts.ports || RT.DEFAULTS.ports; const busy = await RT.portsBusy(ports);
  if (busy.length) return { error: `port${busy.length > 1 ? 's' : ''} ${busy.join(', ')} already in use by another program: start:all cannot start until ${busy.length > 1 ? 'they are' : 'it is'} free.` };
  return null;
}

/** exec(plan, { stdio:'inherit'|'pipe', onData }) → { done: Promise<{code, signal}>, kill() } — kill ends the whole process tree */
function exec(p, { stdio = 'pipe', onData = () => {} } = {}) {
  let child; const detached = process.platform !== 'win32';
  try { child = spawn(p.cmd, p.args, { cwd: p.cwd, env: p.env, detached, windowsHide: true, stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return { done: Promise.resolve({ code: 127, error: e.message }), kill() {} }; }
  if (stdio === 'pipe') { child.stdout.on('data', d => onData(d.toString())); child.stderr.on('data', d => onData(d.toString())); }
  const done = new Promise(res => { child.once('error', e => res({ code: 127, error: e.message })); child.once('exit', (code, signal) => res({ code: code === null ? 130 : code, signal })); });
  let killed = false;
  return { pid: child.pid, done, kill() { if (killed) return; killed = true; RT.killTree(child.pid, false); setTimeout(() => { try { RT.killTree(child.pid, true); } catch (_) {} }, 4000).unref(); } };
}

/** Shell({ root, project, opts, out, stdio }) — one console. run(line) → exit code. cancel() is Ctrl+C. */
class Shell {
  constructor({ root = Store.defaultRoot(), project = 'nexus', opts = {}, out = (s) => process.stdout.write(s), stdio = 'inherit', cosRun = null } = {}) {
    this.root = root; this.project = project; this.opts = opts; this.out = out; this.stdio = stdio; this.cosRun = cosRun || require('./cli.js').run; this.current = null; this.history = [];
  }
  get running() { return !!this.current; }
  cancel() { if (this.current) { this.current.kill(); return true; } return false; }
  async run(line) {
    const p = plan(this.root, this.project, line, this.opts); const say = (s) => this.out(s.endsWith('\n') ? s : s + '\n');
    if (!p.ok) { say(`✗ ${p.error}`); return 2; }
    if (p.kind === 'builtin') { if (p.name === 'help') say(HELP); return p.name === 'exit' ? -1 : 0; }
    if (line.trim()) this.history.push(line.trim());
    if (p.kind === 'cos') { const argv = [...p.argv]; if (!argv.includes('--root')) argv.push('--root', this.root); return this.cosRun(argv, (s) => say(s)); }
    const g = await guard(this.root, this.project, p, this.opts); if (g) { say(`✗ ${g.error}`); return 2; }
    say(`▶ ${p.display}`);
    this.current = exec(p, { stdio: this.stdio, onData: (d) => this.out(d) }); const r = await this.current.done; this.current = null;
    if (r.error) { say(`✗ could not run: ${r.error}`); return r.code; }
    say(r.code === 0 ? '✓ finished (exit 0)' : `✗ exited with code ${r.code}${r.signal ? ` (${r.signal})` : ''}`); return r.code;
  }
}

/** repl({ root, project, input, output }) → exit code. Interactive line loop; Ctrl+C cancels the running command, and exits only when nothing runs. */
function repl({ root, project = 'nexus', input = process.stdin, output = process.stdout, opts = {} } = {}) {
  const readline = require('readline'); const sh = new Shell({ root, project, opts, out: (s) => output.write(s), stdio: output === process.stdout ? 'inherit' : 'pipe' });   // a real terminal lets the child own it (interactive tools work); any other stream gets the output through us
  const rl = readline.createInterface({ input, output, terminal: !!(input.isTTY) });
  const prompt = () => { const st = Store.list(sh.root, project)[0]; rl.setPrompt(`cos ${project}${st && st.current ? '@' + st.current : ''}> `); rl.prompt(); };
  output.write('COS command line. Type help.\n'); prompt();
  return new Promise((resolve) => {
    let chain = Promise.resolve();
    rl.on('line', (line) => { chain = chain.then(async () => { const c = await sh.run(line); if (c === -1) { rl.close(); return; } prompt(); }); });
    rl.on('SIGINT', () => { if (!sh.cancel()) { output.write('\n(Ctrl+C again does nothing here; type exit)\n'); prompt(); } });
    rl.on('close', () => { sh.cancel(); chain.then(() => resolve(0)); });
  });
}
module.exports = { COS_VERBS, HELP, tokenize, scriptCommand, plan, guard, exec, Shell, repl };
