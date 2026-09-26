'use strict';
/**
 * cos/ci/index.js — CI/CD per compartment.
 * UUID: nexus-cos-ci-v1-0000-2026-0920-jamesbrooks-001
 * Version: 0.1.0
 *
 * §CI 2026-09-20 — James: "Need ci/cd per compartment with ssh support."
 *
 * §WHAT IS REAL HERE, AND WHAT IS NOT. Every stage below executes in a
 * real isolated child process with a real exit code, real captured
 * stdout/stderr, a real timeout and a real output cap. Nothing is
 * simulated and no stage ever "passes" without a process having actually
 * exited 0.
 *
 * §NO SECOND SANDBOX. Execution goes through cos/playground/sandbox.js's
 * SandboxRunner — the isolation model this codebase already has (separate
 * process, cwd = root, clean env + NEXUS_SANDBOX=1, watchdog on runtime
 * and output bytes, crash-loop guard). Writing a second spawner here
 * would be a second thing to keep correct.
 *
 * On the compartment object passed to SandboxRunner: with
 * branchId 'working-tree' that function reads exactly
 * `compartment.id`, `compartment.fs.root`, `compartment.runtimeId`,
 * `compartment.entryFile` and `compartment.entryArgs`, and does NOT touch
 * compartmentPaths() (that path is only taken for a named branch). Passing
 * a descriptor carrying those real fields is therefore using its public
 * API as documented, not impersonating a live COS compartment — and this
 * module never claims the returned run came from one. When a caller DOES
 * have a live compartment from CompartmentManager.get(), pass it straight
 * through; it works identically.
 *
 * §SSH — THE HONEST BOUNDARY. There is no key management subsystem in
 * this codebase, and this module does not invent one. Key MATERIAL is
 * never accepted, never stored, never logged. An ssh/deploy stage names
 * a key by PATH (keyRef), which must already exist on disk with owner-only
 * permissions; this module verifies that and refuses otherwise. That is
 * real ssh support with a real limit, not a vault pretending to be one.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { SandboxRunner } = require('../playground/sandbox.js');

const MODULE_ID = 'nexus-cos-ci-v1-0000-2026-0920-jamesbrooks-001';
const VERSION = '0.1.0';

const CONFIG_FILENAME = '.nexus-ci.json';
const RUNS_DIRNAME = '.nexus-ci-runs';
const MAX_RUNS_KEPT = 50;

// Stage kinds this module can actually execute. A config naming anything
// else is rejected at validate() time rather than silently skipped — a
// stage that does not run must never be reported as passing.
const STAGE_KINDS = Object.freeze(['command', 'ssh']);

const DEFAULTS = Object.freeze({
  timeoutMs: 120_000,
  maxOutputBytes: 1_048_576,
  runtimeId: 'shell',
});

// ── config ────────────────────────────────────────────────────────────

/**
 * A pipeline is plain data:
 * {
 *   version: 1,
 *   stages: [
 *     { name:'install', kind:'command', runtime:'shell', run:'npm ci' },
 *     { name:'test',    kind:'command', runtime:'shell', run:'npm test',
 *       continueOnError:false, timeoutMs:300000, env:{CI:'1'} },
 *     { name:'deploy',  kind:'ssh', host:'user@box', keyRef:'/home/x/.ssh/id_ed25519',
 *       run:'cd /srv/app && git pull' }
 *   ],
 *   triggers: { onChunkDone:false, onCommit:false }
 * }
 */
function defaultConfig() {
  return {
    version: 1,
    stages: [],
    triggers: { onChunkDone: false, onCommit: false },
  };
}

function configPath(rootDir) { return path.join(rootDir, CONFIG_FILENAME); }

function readConfig(rootDir) {
  const p = configPath(rootDir);
  if (!fs.existsSync(p)) return { ok: true, exists: false, config: defaultConfig() };
  try {
    const config = JSON.parse(fs.readFileSync(p, 'utf8'));
    const v = validate(config);
    if (!v.ok) return { ok: false, exists: true, error: `invalid ${CONFIG_FILENAME}: ${v.errors.join('; ')}` };
    return { ok: true, exists: true, config };
  } catch (e) {
    return { ok: false, exists: true, error: `could not parse ${CONFIG_FILENAME}: ${e.message}` };
  }
}

function writeConfig(rootDir, config) {
  const v = validate(config);
  if (!v.ok) return { ok: false, error: v.errors.join('; ') };
  try {
    fs.writeFileSync(configPath(rootDir), JSON.stringify(config, null, 2), 'utf8');
    return { ok: true, path: configPath(rootDir) };
  } catch (e) {
    return { ok: false, error: `write failed: ${e.message}` };
  }
}

/** Refuses anything this module cannot actually execute. */
function validate(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return { ok: false, errors: ['config must be an object'] };
  if (!Array.isArray(config.stages)) errors.push('stages must be an array');
  const seen = new Set();
  for (const [i, st] of (config.stages || []).entries()) {
    const at = `stage[${i}]${st && st.name ? ` "${st.name}"` : ''}`;
    if (!st || typeof st !== 'object') { errors.push(`${at}: must be an object`); continue; }
    if (!st.name || typeof st.name !== 'string') errors.push(`${at}: name is required`);
    else if (seen.has(st.name)) errors.push(`${at}: duplicate stage name`);
    else seen.add(st.name);

    const kind = st.kind || 'command';
    if (!STAGE_KINDS.includes(kind)) {
      errors.push(`${at}: unknown kind "${kind}" — this module can only execute ${STAGE_KINDS.join('/')}, and will not skip a stage it cannot run`);
    }
    if (!st.run || typeof st.run !== 'string') errors.push(`${at}: run (the command line) is required`);
    if (kind === 'ssh') {
      if (!st.host || typeof st.host !== 'string') errors.push(`${at}: ssh stage needs host (e.g. "deploy@box")`);
      // §KEYS 2026-09-20 — keyAlias is now the preferred form: it names a
      // key registered in the compartment's vault (cos/ci/keys.js) and is
      // resolved to a real path at run time. keyRef (a literal absolute
      // path) still works, but hardcodes where someone's keys live into a
      // file meant to be committed. Exactly one of the two.
      if (st.keyAlias && st.keyRef) errors.push(`${at}: give keyAlias OR keyRef, not both`);
      else if (st.keyAlias) {
        if (typeof st.keyAlias !== 'string' || !/^[a-z][a-z0-9_]{1,38}$/.test(st.keyAlias)) {
          errors.push(`${at}: keyAlias must be snake_case, 2-39 chars, starting with a letter`);
        }
      } else if (!st.keyRef || typeof st.keyRef !== 'string') {
        errors.push(`${at}: ssh stage needs keyAlias (a key registered in this compartment) or keyRef — an absolute PATH to a private key already on disk. Key material is never accepted or stored here.`);
      } else if (/BEGIN [A-Z ]*PRIVATE KEY/.test(st.keyRef)) {
        errors.push(`${at}: keyRef must be a path, not key material. This module never stores keys.`);
      }
    }
    if (st.timeoutMs != null && (!Number.isFinite(st.timeoutMs) || st.timeoutMs <= 0)) errors.push(`${at}: timeoutMs must be a positive number`);
    if (st.env != null && (typeof st.env !== 'object' || Array.isArray(st.env))) errors.push(`${at}: env must be an object`);
  }
  return { ok: errors.length === 0, errors };
}

// ── ssh key checks — real, before anything is spawned ─────────────────

/**
 * A private key readable by anyone else is a real security defect, and
 * ssh itself refuses such keys anyway. Checked here so the pipeline fails
 * with a clear reason instead of an opaque ssh error 200 lines into a log.
 */
function checkKeyRef(keyRef) {
  if (!path.isAbsolute(keyRef)) return { ok: false, error: `keyRef must be an absolute path: ${keyRef}` };
  if (!fs.existsSync(keyRef)) return { ok: false, error: `ssh key not found at ${keyRef} — this module does not create or store keys` };
  let st;
  try { st = fs.statSync(keyRef); } catch (e) { return { ok: false, error: `cannot stat key: ${e.message}` }; }
  if (!st.isFile()) return { ok: false, error: `keyRef is not a file: ${keyRef}` };
  if (process.platform !== 'win32') {
    const mode = st.mode & 0o777;
    if (mode & 0o077) {
      return { ok: false, error: `ssh key ${keyRef} is group/world accessible (mode ${mode.toString(8)}); ssh will reject it. chmod 600 it.` };
    }
  }
  return { ok: true };
}

/**
 * Build the argv for an ssh stage. BatchMode=yes so a missing/locked key
 * fails immediately instead of hanging forever on a passphrase prompt
 * that nothing can answer in CI. StrictHostKeyChecking is left at the
 * system default on purpose — silently disabling it would turn every
 * deploy into an un-authenticated one.
 */
function sshArgv(stage, resolvedKeyPath = null) {
  return [
    '-i', resolvedKeyPath || stage.keyRef,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    ...(stage.port ? ['-p', String(stage.port)] : []),
    ...(stage.sshOptions || []),
    stage.host,
    stage.run,
  ];
}

// ── run history ───────────────────────────────────────────────────────

function runsDir(rootDir) { return path.join(rootDir, RUNS_DIRNAME); }

function saveRun(rootDir, run) {
  try {
    const dir = runsDir(rootDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${run.runId}.json`), JSON.stringify(run, null, 2), 'utf8');
    // Keep the directory bounded — CI logs grow without limit otherwise.
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    if (files.length > MAX_RUNS_KEPT) {
      for (const f of files.slice(0, files.length - MAX_RUNS_KEPT)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* best effort */ }
      }
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function listRuns(rootDir, limit = 20) {
  const dir = runsDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort().reverse().slice(0, limit)
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function getRun(rootDir, runId) {
  const p = path.join(runsDir(rootDir), `${runId}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ── the runner ────────────────────────────────────────────────────────

/**
 * run({ compartmentId, rootDir, config?, only?, bus?, onEvent? })
 *
 * Executes each stage in declaration order. A non-zero exit stops the
 * pipeline unless that stage sets continueOnError. Returns a real record:
 * per-stage exit code, duration, truncated-or-not output, and an overall
 * status that is 'passed' only if every stage that ran actually exited 0.
 */
async function run({ compartmentId, rootDir, config = null, only = null, bus = null, onEvent = null, vaultHost = null, useVault = true }) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return { ok: false, error: `root directory does not exist: ${rootDir}` };
  }
  if (!compartmentId) {
    return { ok: false, error: 'compartmentId is required — CI here is per compartment, and a run with no compartment has nothing to be scoped to' };
  }

  let cfg = config;
  if (!cfg) {
    const r = readConfig(rootDir);
    if (!r.ok) return { ok: false, error: r.error };
    if (!r.exists) return { ok: false, error: `no ${CONFIG_FILENAME} in this compartment — nothing to run` };
    cfg = r.config;
  }
  const v = validate(cfg);
  if (!v.ok) return { ok: false, error: v.errors.join('; ') };

  let stages = cfg.stages;
  if (only && only.length) {
    stages = stages.filter(s => only.includes(s.name));
    if (!stages.length) return { ok: false, error: `no stage matched ${JSON.stringify(only)}` };
  }
  if (!stages.length) return { ok: false, error: 'pipeline has no stages' };

  // §KEYS 2026-09-20 — compartment secrets, resolved once per run. A
  // vault that is unreachable is NOT fatal: a pipeline with no secrets is
  // the common case, and failing every run because the vault could not be
  // opened would be worse than running without values that nothing asked
  // for. A stage that actually needed one fails on its own, visibly.
  let secretEnv = {};
  let secretValues = [];
  if (useVault) {
    try {
      const keys = require('./keys.js');
      const r = keys.secretsEnvFor({ host: vaultHost, compartment: { id: compartmentId } });
      if (r.ok) { secretEnv = r.env || {}; secretValues = Object.values(secretEnv); }
    } catch (e) {
      emit('ci:vault:unavailable', { compartmentId, error: e.message });
    }
  }
  const _redact = (text) => {
    if (!secretValues.length) return text;
    try { return require('./keys.js').redact(text, secretValues); } catch { return text; }
  };

  const runId = `ci-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const emit = (type, payload) => {
    if (onEvent) { try { onEvent(type, payload); } catch { /* non-fatal */ } }
    if (bus) { try { bus.emit(type, payload); } catch { /* non-fatal */ } }
  };

  const record = {
    runId, compartmentId, rootDir,
    startedAt: Date.now(), finishedAt: null,
    status: 'running', stages: [], module: MODULE_ID, version: VERSION,
  };
  emit('ci:run:started', { runId, compartmentId, stageCount: stages.length });

  for (const stage of stages) {
    const kind = stage.kind || 'command';
    const stStart = Date.now();
    emit('ci:stage:started', { runId, compartmentId, stage: stage.name, kind });

    // ssh preflight — refuse before spawning, with a real reason.
    // §KEYS 2026-09-20 — a keyAlias is resolved through the compartment's
    // vault here, and the resolved path is re-checked (registered months
    // ago is not the same as usable now).
    let resolvedKeyPath = null;
    if (kind === 'ssh') {
      let k;
      if (stage.keyAlias) {
        const keys = require('./keys.js');
        const r = keys.resolveSshKey({ host: vaultHost, compartmentName: compartmentId, alias: stage.keyAlias });
        k = r.ok ? { ok: true } : { ok: false, error: r.error };
        if (r.ok) resolvedKeyPath = r.keyPath;
      } else {
        k = checkKeyRef(stage.keyRef);
        if (k.ok) resolvedKeyPath = stage.keyRef;
      }
      if (!k.ok) {
        const failed = {
          name: stage.name, kind, status: 'failed', exitCode: null,
          startedAt: stStart, finishedAt: Date.now(), durationMs: Date.now() - stStart,
          error: k.error, stdout: '', stderr: '',
        };
        record.stages.push(failed);
        emit('ci:stage:failed', { runId, compartmentId, stage: stage.name, error: k.error });
        if (!stage.continueOnError) { record.status = 'failed'; break; }
        continue;
      }
    }

    // The descriptor SandboxRunner actually reads on the 'working-tree'
    // branch. Real id, real root, real runtime — see this file's header.
    const runtimeId = kind === 'ssh' ? 'ssh' : (stage.runtime || cfg.runtime || DEFAULTS.runtimeId);
    const descriptor = {
      id: compartmentId,
      fs: { root: rootDir },
      runtimeId,
      entryFile: kind === 'ssh' ? undefined : stage.run,
    };

    let result;
    try {
      result = await SandboxRunner.run(descriptor, 'working-tree', {
        // For a shell stage, SandboxRunner spawns `sh <entryFile> ...`;
        // the command line needs -c to be interpreted rather than treated
        // as a script path. For ssh, the binary is ssh and argv is built
        // above. Both are explicit rather than relying on a default.
        command: kind === 'ssh' ? undefined : '-c',
        args: kind === 'ssh' ? sshArgv(stage, resolvedKeyPath) : [stage.run],
        runtimeId,
        // §KEYS 2026-09-20 — vault secrets first, then the pipeline's own
        // plain env. A plain env entry therefore WINS over a secret of the
        // same name, which is the safe order: a committed .nexus-ci.json
        // can never silently shadow-read a vault value it did not set.
        env: { ...secretEnv, ...(cfg.env || {}), ...(stage.env || {}) },
        timeoutMs: stage.timeoutMs ?? cfg.timeoutMs ?? DEFAULTS.timeoutMs,
        maxOutputBytes: stage.maxOutputBytes ?? cfg.maxOutputBytes ?? DEFAULTS.maxOutputBytes,
        bus,
      });
    } catch (e) {
      result = { exitCode: null, stdout: '', stderr: String(e.message || e), error: String(e.message || e) };
    }

    // SandboxRunner's RunResult names these killedByTimeout /
    // killedByOutputLimit. An earlier version of this file read
    // result.killed / result.truncated — fields that do not exist — so a
    // stage killed by the watchdog recorded killed:false and was
    // indistinguishable from an ordinary non-zero exit. A timeout is a
    // different failure with a different fix, and now says so.
    const passed = result.exitCode === 0;
    const timedOut = !!result.killedByTimeout;
    const outputCapped = !!result.killedByOutputLimit;
    const entry = {
      name: stage.name, kind,
      status: passed ? 'passed' : (timedOut ? 'timeout' : 'failed'),
      exitCode: result.exitCode ?? null,
      signal: result.signal || null,
      startedAt: stStart, finishedAt: Date.now(), durationMs: Date.now() - stStart,
      // §KEYS 2026-09-20 — captured output is redacted before it is stored
      // or returned. Best-effort by nature (a value the command transforms
      // cannot be matched), and stated as such in keys.js's own redact().
      stdout: _redact(result.stdout || ''), stderr: _redact(result.stderr || ''),
      outputBytes: result.outputBytes ?? null,
      killedByTimeout: timedOut,
      killedByOutputLimit: outputCapped,
      error: result.error || (timedOut ? `stage exceeded its timeout and was killed` : null),
    };
    record.stages.push(entry);
    emit(passed ? 'ci:stage:passed' : 'ci:stage:failed', {
      runId, compartmentId, stage: stage.name, status: entry.status,
      exitCode: entry.exitCode, durationMs: entry.durationMs,
    });

    if (!passed && !stage.continueOnError) { record.status = timedOut ? 'timeout' : 'failed'; break; }
  }

  if (record.status === 'running') {
    // 'passed' only if every stage that ran exited 0. A pipeline where a
    // continueOnError stage failed is 'unstable', not 'passed' — calling
    // it passed would hide a real failure behind a flag.
    const anyFailed = record.stages.some(s => s.status !== 'passed');
    record.status = anyFailed ? 'unstable' : 'passed';
  }
  record.finishedAt = Date.now();
  record.durationMs = record.finishedAt - record.startedAt;
  saveRun(rootDir, record);
  emit('ci:run:finished', { runId, compartmentId, status: record.status, durationMs: record.durationMs });

  return { ok: true, run: record };
}

module.exports = {
  MODULE_ID, VERSION, CONFIG_FILENAME, STAGE_KINDS, DEFAULTS,
  defaultConfig, readConfig, writeConfig, validate,
  checkKeyRef, sshArgv,
  run, listRuns, getRun, runsDir, configPath,
};
