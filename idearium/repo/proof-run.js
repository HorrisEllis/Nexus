/**
 * idearium/repo/proof-run.js — the delivery checker: are the END-STATE CONDITIONS met? In plain words, with evidence.
 * UUID: nexus-idearium-repo-proof-run-v1-0000-2026-1002-jamesbrooks-001
 * Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (PR1)
 *
 * James (2026-10-02): "Yes, then I can use idearium to build anything needed." · "what about shadow space reasoning
 * for the debugging?" He does not read code, so every delivery — and later every lab attempt (LB1) — has to prove
 * itself in words he can check.
 *
 * A CONDITION is one acceptance line in plain words plus a check a machine can run:
 *   { id, says: "The contact page loads", check: { kind, ... } }
 *     file     { path, contains? }                  the file exists (and holds this text)
 *     command  { run, contains?, timeoutMs? }       the command exits 0 (and prints this text)
 *     tests    { run? }                             the repo's tests pass (package.json "test", or `run`)
 *     page     { path | url, status?, contains? }   with the app started (opts.start), the page answers so
 *
 * SHADOW SPACE FIRST (lib/shadow.js). Before anything runs, the whole end state is DECLARED: every condition id as
 * an expected field, every file a condition names as an expected file. After the checks, the shadow is settled with
 * what was actually met; whatever is absent is the bug — a gap in the gap field and a liminal item, with the
 * condition's own words and the failure's cause attached — not a guess about what went wrong.
 *
 * Every failure gets a MODE (file_missing, content_missing, command_failed, command_timeout, tests_failed, no_tests,
 * app_did_not_start, page_unreachable, page_status, page_content_missing, invalid) and a plain-language likely cause,
 * so FM1 can mine them and the report can say what to do.
 *
 * Writes into the repo: proof/PROOF-REPORT.md (for the client) and .nexus/proof-runs/<time>.json (the history).
 * Runs the repo's own code exactly as runtime-proof.js / L6 do: cwd = the repo, bounded time, output capped. A started
 * app is always stopped, its whole process group, even when a check throws.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const MODULE_ID = 'nexus-idearium-repo-proof-run-v1-0000-2026-1002-jamesbrooks-001';
export const KINDS = Object.freeze(['file', 'command', 'tests', 'page']);
export const REPORT_FILE = 'proof/PROOF-REPORT.md';
export const RUNS_DIR = '.nexus/proof-runs';
export const LIMITS = Object.freeze({ conditions: 60, says: 300, output: 4000, commandMs: 120000, startMs: 60000 });

const CAUSE = {
  file_missing: 'The file the condition names is not in the project.',
  content_missing: 'The file is there, but the text the condition expects is not in it.',
  command_failed: 'The command ran and reported an error (see its output below).',
  command_timeout: 'The command did not finish in time — it may be waiting for input, or stuck.',
  tests_failed: 'At least one test failed (see the output below).',
  no_tests: 'The project has no test script, so nothing could be tested.',
  app_did_not_start: 'The app did not start, or never answered at its address, so its pages could not be checked.',
  page_unreachable: 'The page could not be reached at all.',
  page_status: 'The page answered, but with an error status instead of the expected one.',
  page_content_missing: 'The page loaded, but the text the condition expects is not on it.',
  invalid: 'The condition itself is incomplete, so it could not be checked.',
};

function _inside(repoDir, rel) {
  const abs = path.resolve(repoDir, String(rel || ''));
  return abs === repoDir || abs.startsWith(repoDir + path.sep) ? abs : null;
}
function _cap(s) { const t = String(s || ''); return t.length > LIMITS.output ? `${t.slice(0, LIMITS.output)}\n… (${t.length - LIMITS.output} more characters)` : t; }
function _slug(s, i) { return (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)) || `condition-${i + 1}`; }

/**
 * normalizeConditions(list) → { ok, conditions, errors } — each condition made whole or named as invalid.
 * Invalid ones are kept (they are reported as unmet with mode 'invalid'), never silently dropped.
 */
export function normalizeConditions(list) {
  if (!Array.isArray(list) || !list.length) return { ok: false, error: 'give at least one condition: { says, check: { kind, … } }' };
  if (list.length > LIMITS.conditions) return { ok: false, error: `at most ${LIMITS.conditions} conditions in one run (got ${list.length})` };
  const seen = new Set(), errors = [];
  const conditions = list.map((c, i) => {
    const says = String((c && c.says) || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.says);
    const check = (c && c.check) || {};
    let id = _slug(c && c.id || says, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    let problem = null;
    if (!says) problem = 'it has no plain-words line (says)';
    else if (!KINDS.includes(check.kind)) problem = `its check kind "${check.kind}" is not one of ${KINDS.join(', ')}`;
    else if (check.kind === 'file' && !check.path) problem = 'a file check needs a path';
    else if (check.kind === 'command' && !check.run) problem = 'a command check needs the command to run';
    else if (check.kind === 'page' && !check.path && !check.url) problem = 'a page check needs a path (or a full url)';
    if (problem) errors.push(`condition ${i + 1}: ${problem}`);
    return { id, says: says || `(condition ${i + 1})`, check: { ...check }, problem };
  });
  return { ok: true, conditions, errors };
}

/** run a shell command in the repo; resolves { code, out, timedOut, ms } — never rejects */
function _sh(cmd, { cwd, timeoutMs = LIMITS.commandMs, env } = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    let out = '', done = false, timedOut = false;
    const child = spawn(cmd, { cwd, shell: true, detached: process.platform !== 'win32', env: { ...process.env, CI: '1', ...(env || {}) } });
    const finish = (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, out: _cap(out), timedOut, ms: Date.now() - t0 }); };
    const timer = setTimeout(() => { timedOut = true; _kill(child); finish(null); }, timeoutMs);
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    child.on('error', e => { out += `\n${e.message}`; finish(127); });
    child.on('close', code => finish(code));
  });
}
function _kill(child) {
  if (!child || child.exitCode !== null) return;
  try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch (_) { try { child.kill('SIGTERM'); } catch (_) {} }
  setTimeout(() => { try { if (child.exitCode === null) { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } } catch (_) {} }, 1500).unref();
}

async function _get(url, timeoutMs = 10000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try { const r = await fetch(url, { signal: ac.signal, redirect: 'follow' }); const body = await r.text(); return { ok: true, status: r.status, body }; }
  catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'timed out' : e.message }; }
  finally { clearTimeout(t); }
}

/** start the app: spawn, then poll its base url until it answers or the wait runs out */
async function _startApp(repoDir, start) {
  const child = spawn(start.command, { cwd: repoDir, shell: true, detached: process.platform !== 'win32', env: { ...process.env, ...(start.env || {}) } });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('error', e => { out += `\n${e.message}`; });
  const until = Date.now() + Math.min(Number(start.readyMs) || 30000, LIMITS.startMs);
  while (Date.now() < until) {
    if (child.exitCode !== null) return { up: false, child, out: _cap(out), why: `it exited with code ${child.exitCode}` };
    const r = await _get(start.url, 2000);
    if (r.ok) return { up: true, child, out: _cap(out) };
    await new Promise(r => setTimeout(r, 400));
  }
  return { up: false, child, out: _cap(out), why: `nothing answered at ${start.url} within ${Math.round((Math.min(Number(start.readyMs) || 30000, LIMITS.startMs)) / 1000)}s` };
}

async function _check(repoDir, c, app) {
  const k = c.check, t0 = Date.now();
  const met = (evidence) => ({ id: c.id, says: c.says, kind: k.kind, met: true, evidence, ms: Date.now() - t0 });
  const unmet = (mode, evidence, extra = {}) => ({ id: c.id, says: c.says, kind: k.kind, met: false, mode, cause: CAUSE[mode], evidence, ms: Date.now() - t0, ...extra });
  if (c.problem) return unmet('invalid', `This condition could not be checked: ${c.problem}.`);
  if (k.kind === 'file') {
    const abs = _inside(repoDir, k.path);
    if (!abs) return unmet('invalid', `The path "${k.path}" points outside the project.`);
    if (!fs.existsSync(abs)) return unmet('file_missing', `${k.path} does not exist.`, { file: k.path });
    if (k.contains) {
      let text = ''; try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { return unmet('content_missing', `${k.path} could not be read: ${e.message}`, { file: k.path }); }
      if (!text.includes(k.contains)) return unmet('content_missing', `${k.path} exists but does not contain "${k.contains}".`, { file: k.path });
      return met(`${k.path} exists and contains "${k.contains}".`);
    }
    return met(`${k.path} exists.`);
  }
  if (k.kind === 'command' || k.kind === 'tests') {
    let cmd = k.run;
    if (k.kind === 'tests' && !cmd) {
      let pkg = null; try { pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8')); } catch (_) {}
      const script = pkg && pkg.scripts && pkg.scripts.test;
      if (!script || /no test specified/.test(script)) return unmet('no_tests', 'package.json has no test script.');
      cmd = 'npm test --silent';
    }
    const r = await _sh(cmd, { cwd: repoDir, timeoutMs: Math.min(Number(k.timeoutMs) || LIMITS.commandMs, LIMITS.commandMs) });
    const shown = `\`${cmd}\` → ${r.timedOut ? 'timed out' : `exit ${r.code}`} in ${(r.ms / 1000).toFixed(1)}s`;
    if (r.timedOut) return unmet('command_timeout', shown, { output: r.out });
    if (r.code !== 0) return unmet(k.kind === 'tests' ? 'tests_failed' : 'command_failed', shown, { output: r.out });
    if (k.contains && !r.out.includes(k.contains)) return unmet('content_missing', `${shown}, but its output does not contain "${k.contains}".`, { output: r.out });
    return met(`${shown}${k.contains ? ` and printed "${k.contains}"` : ''}.`);
  }
  if (k.kind === 'page') {
    if (!k.url && app && !app.up) return unmet('app_did_not_start', `The app was not running, so ${k.path} could not be opened (${app.why}).`, app.out ? { output: app.out } : {});
    const url = k.url || (app && app.base ? new URL(String(k.path), app.base).toString() : null);
    if (!url) return unmet('invalid', 'A page check needs the app to be started (a start command and url) or a full url.');
    const r = await _get(url);
    if (!r.ok) return unmet('page_unreachable', `${url} could not be reached: ${r.error}.`);
    const want = Number(k.status) || 200;
    if (r.status !== want) return unmet('page_status', `${url} answered ${r.status}, expected ${want}.`);
    if (k.contains && !r.body.includes(k.contains)) return unmet('page_content_missing', `${url} answered ${r.status} but does not show "${k.contains}".`);
    return met(`${url} answered ${r.status}${k.contains ? ` and shows "${k.contains}"` : ''}.`);
  }
  return unmet('invalid', 'Unknown check.');
}

/**
 * runProof({ repoDir, conditions, start?, subject?, write? }) → { ok, run } | { ok:false, error }
 * start: { command, url, readyMs?, env? } — starts the app once for every page condition, and always stops it.
 */
export const LATEST_FILE = '.nexus/proof-runs/latest.json';

function _diskWriter(repoDir) {
  return (rel, text) => { const abs = path.join(repoDir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text, 'utf8'); };
}

/**
 * runProof({ repoDir, conditions, start?, subject?, write?, writer? })
 * writer(relPath, text): where the report and the run are kept — the disk by default; idearium passes its repo layer's
 * writeFile, because a repo's working folder is re-materialised from its store and a file written beside it is lost.
 */
export async function runProof({ repoDir, conditions, start = null, subject = null, write = true, writer = null } = {}) {
  if (!repoDir || !fs.existsSync(repoDir)) return { ok: false, error: 'the project folder does not exist' };
  repoDir = path.resolve(repoDir);
  const n = normalizeConditions(conditions);
  if (!n.ok) return n;
  const startedAt = Date.now();

  // the shadow: the whole end state, declared before anything runs
  let shadow = null; const SH = (() => { try { return require('../../lib/shadow.js'); } catch (_) { return null; } })();
  const expectedFiles = n.conditions.filter(c => c.check.kind === 'file' && c.check.path && !c.problem).map(c => String(c.check.path).replace(/^\.\//, ''));
  try { if (SH) shadow = SH.declare({ step: 'proof-run', expects: { fields: n.conditions.map(c => c.id), files: expectedFiles }, subject: subject || path.basename(repoDir) }); } catch (_) { shadow = null; }

  let app = null;
  const needsApp = n.conditions.some(c => c.check.kind === 'page' && !c.check.url && !c.problem);
  const results = [];
  try {
    if (needsApp) {
      if (!start || !start.command || !start.url) app = { up: false, why: 'no start command and url were given for the page checks' };
      else { const s = await _startApp(repoDir, start); app = { ...s, base: start.url }; }
    }
    for (const c of n.conditions) {
      try { results.push(await _check(repoDir, c, app)); }
      catch (e) { results.push({ id: c.id, says: c.says, kind: c.check.kind, met: false, mode: 'invalid', cause: CAUSE.invalid, evidence: `The check itself failed: ${e.message}`, ms: 0 }); }
    }
  } finally {
    if (app && app.child) _kill(app.child);
  }

  // settle the shadow with what was actually met: whatever is absent is the bug, recorded as a gap with its cause
  let settled = null;
  try {
    if (SH && shadow) {
      const presentFiles = expectedFiles.filter(f => fs.existsSync(path.join(repoDir, f)));
      settled = SH.settle(shadow, { fields: results.filter(r => r.met).map(r => r.id), files: presentFiles });
    }
  } catch (_) { settled = null; }

  const metCount = results.filter(r => r.met).length;
  const run = {
    module: MODULE_ID, subject: subject || path.basename(repoDir), startedAt, finishedAt: Date.now(),
    verdict: metCount === results.length ? 'ready' : 'not-ready', met: metCount, total: results.length,
    conditionErrors: n.errors, app: app ? { started: !!app.up, why: app.why || null, url: start && start.url } : null,
    results,
    shadow: settled ? { id: settled.shadowId, absent: settled.absent, gaps: (settled.gaps || []).map(g => g.gapId).filter(Boolean) } : null,
    modes: results.filter(r => !r.met).reduce((m, r) => { m[r.mode] = (m[r.mode] || 0) + 1; return m; }, {}),
  };
  if (write) {
    const put = writer || _diskWriter(repoDir);
    const file = `${RUNS_DIR}/${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}.json`;
    run.files = { report: REPORT_FILE, run: file };
    try {
      for (const [rel, text] of [[REPORT_FILE, reportText(run)], [file, JSON.stringify(run, null, 2)], [LATEST_FILE, JSON.stringify(run, null, 2)]]) {
        const w = await put(rel, text);
        if (w && w.error) throw new Error(`${rel}: ${w.error}`);
      }
    } catch (e) { run.writeError = e.message; delete run.files; }
  }
  return { ok: true, run };
}

/** reportText(run) → the proof report in plain words, for James and for the client */
export function reportText(run) {
  const when = new Date(run.finishedAt || Date.now()).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const lines = [
    `# Proof report — ${run.subject}`,
    '',
    `Checked ${when}.`,
    '',
    run.verdict === 'ready'
      ? `**READY.** All ${run.total} condition${run.total === 1 ? '' : 's'} met.`
      : `**NOT READY.** ${run.met} of ${run.total} condition${run.total === 1 ? '' : 's'} met.`,
    '',
    '| | What was promised | Result |',
    '|---|---|---|',
    ...run.results.map(r => `| ${r.met ? '✅' : '❌'} | ${r.says.replace(/\|/g, '\\|')} | ${String(r.met ? r.evidence : r.cause).replace(/\|/g, '\\|')} |`),
  ];
  const unmet = run.results.filter(r => !r.met);
  if (unmet.length) {
    lines.push('', '## What is missing, and why', '');
    for (const r of unmet) {
      lines.push(`### ❌ ${r.says}`, '', `- **What happened:** ${r.evidence}`, `- **Likely cause:** ${r.cause}`);
      if (r.output) lines.push('', '```', r.output.trim().slice(-1500), '```');
      lines.push('');
    }
  }
  if (run.app && !run.app.started) lines.push('', `> The app was not running for the page checks: ${run.app.why}.`);
  lines.push('', '## Evidence', '', ...run.results.map(r => `- ${r.met ? '✅' : '❌'} **${r.says}** — ${r.evidence}`));
  if (run.conditionErrors && run.conditionErrors.length) lines.push('', '## Conditions that could not be checked', '', ...run.conditionErrors.map(e => `- ${e}`));
  lines.push('', '---', '_Every line above was checked by running it, not by reading it._', '');
  return lines.join('\n');
}

/**
 * proposeConditionsPrompt(brief) — for the agent, which only PROPOSES conditions (James accepts them): one JSON array
 * of { says, check } from an acceptance brief, using only the four kinds.
 */
export function proposeConditionsPrompt(brief, { files = [] } = {}) {
  return [
    'Turn the acceptance brief below into END-STATE CONDITIONS a machine can check. Output ONLY a JSON array.',
    'Each item: {"says": "<the promise, in plain words a client understands>", "check": {"kind": "file"|"command"|"tests"|"page", ...}}',
    'file: {"path": "relative/path", "contains"?: "text"} · command: {"run": "shell command", "contains"?: "text"} · tests: {} · page: {"path": "/route", "status"?: 200, "contains"?: "text on the page"}',
    'One condition per promise. Only promises that can really be checked this way; skip taste ("looks nice"). Never invent features the brief does not ask for.',
    files.length ? `Files in the project:\n${files.slice(0, 200).join('\n')}` : null,
    `Acceptance brief:\n---\n${String(brief || '').slice(0, 6000)}\n---`,
  ].filter(Boolean).join('\n\n');
}

/** parseProposedConditions(text) → { ok, conditions } — the agent's reply, normalised; nothing is run */
export function parseProposedConditions(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b <= a) return { ok: false, error: 'the reply had no list of conditions — try again' };
  let arr; try { arr = JSON.parse(t.slice(a, b + 1)); } catch (e) { return { ok: false, error: `the reply was not valid JSON: ${e.message}` }; }
  const n = normalizeConditions(arr);
  return n.ok ? { ok: true, conditions: n.conditions.map(({ id, says, check }) => ({ id, says, check })), errors: n.errors } : n;
}

/** readLastProof(repoDir, { reader? }) → the newest run, or null. reader(relPath) → text | null (idearium: its repo layer). */
export async function readLastProof(repoDir, { reader = null } = {}) {
  try {
    const text = reader ? await reader(LATEST_FILE) : fs.readFileSync(path.join(repoDir, LATEST_FILE), 'utf8');
    return text ? JSON.parse(text) : null;
  } catch (_) { return null; }
}

/**
 * conditionsFromPhase(mapText, phaseKey) → { conditions, source } — PH1: a phase states its own end state in its map as
 * `conditions:` (the same { says, check } shape). A map that does not parse as YAML, or a phase without conditions,
 * gives none — and the caller says so; nothing is invented from the phase's prose.
 */
export function conditionsFromPhase(mapText, phaseKey) {
  let doc = null;
  try { doc = require('js-yaml').load(String(mapText || '').split(/\n## ADDENDUM/)[0]); } catch (e) { return { conditions: [], source: `the map does not parse as YAML (${e.message.split('\n')[0]})` }; }
  const phases = doc && doc.spec && doc.spec.phases || doc && doc.phases || {};
  const p = phases[phaseKey] || Object.entries(phases).find(([k]) => k.split('_')[0] === String(phaseKey).split('_')[0])?.[1];
  if (!p) return { conditions: [], source: `phase ${phaseKey} not found in the map` };
  if (!Array.isArray(p.conditions) || !p.conditions.length) return { conditions: [], source: `phase ${phaseKey} declares no conditions` };
  return { conditions: p.conditions, source: `phase ${phaseKey}'s conditions` };
}

/** feedbackMessage(run) → the next attempt's feedback: every unmet promise with what happened and its likely cause */
export function feedbackMessage(run) {
  const unmet = (run && run.results || []).filter(r => !r.met);
  if (!unmet.length) return '';
  return [
    `THE PROOF RUN CHECKED YOUR LAST ATTEMPT: ${run.met} of ${run.total} conditions met. These are NOT met yet — fix exactly these, change nothing that already passes:`,
    ...unmet.map(r => `- ${r.says}\n  what happened: ${r.evidence}\n  likely cause: ${r.cause}${r.output ? `\n  output (end): ${String(r.output).trim().slice(-600)}` : ''}`),
  ].join('\n');
}

/**
 * derivedConditionsFromPhase(mapText, phaseKey) → { conditions, source } — when a phase declares no `conditions:`, its
 * declared `files:` still give a machine-checkable end state: each file exists, and each JavaScript file is real,
 * parseable JS (`node --check`). Derived from what the phase itself states — never from its prose.
 */
export function derivedConditionsFromPhase(mapText, phaseKey) {
  let doc = null;
  try { doc = require('js-yaml').load(String(mapText || '').split(/\n## ADDENDUM/)[0]); } catch (_) { return { conditions: [], source: 'the map does not parse as YAML' }; }
  const phases = doc && doc.spec && doc.spec.phases || doc && doc.phases || {};
  const p = phases[phaseKey] || Object.entries(phases).find(([k]) => k.split('_')[0] === String(phaseKey).split('_')[0])?.[1];
  const files = [...new Set((p && Array.isArray(p.files) ? p.files : []).map(f => String(f).split(/[\s(]/)[0]).filter(f => /[\w-]\.[\w]+$/.test(f) && !f.endsWith('/')))];
  if (!files.length) return { conditions: [], source: `phase ${phaseKey} declares no conditions and no files` };
  const conditions = [];
  for (const f of files) {
    conditions.push({ says: `${f} exists`, check: { kind: 'file', path: f } });
    if (/\.(c|m)?js$/.test(f)) conditions.push({ says: `${f} is valid JavaScript`, check: { kind: 'command', run: `node --check "${f.replace(/"/g, '')}"`, timeoutMs: 30000 } });
  }
  return { conditions, source: `derived from phase ${phaseKey}'s files (it declares no conditions)` };
}
