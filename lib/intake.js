'use strict';
/**
 * lib/intake.js — a file that arrived from outside becomes a STAGED DROP with
 * a contract. It never becomes a change to the tree by arriving.
 * comp_id: nexus.lib.intake
 * UUID: nexus-intake-v1-0000-2026-0818-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-18): "guardian to listen for the downloads from your
 * chat and move them to the compartment with the contract or repo/spec."
 *
 * The "or" in that sentence is resolved here as a PIPELINE, not a choice:
 * staging is never optional, promotion into repo/spec is a separate, gated
 * step. A download is a CLAIM — some model said these bytes belong at these
 * paths. Writing it straight into the tree would make arrival equal to
 * acceptance, which is the one thing §IP-5 says cannot happen: an agent
 * cannot accept its own work. So:
 *
 *     capture → stage(contract) → gate verdict → promote(by:'user')
 *
 * The manual version of this already exists and is visible in the tree:
 * `_archive/unintegrated/2026-08-14-uploaded-batch/`. That directory is the
 * spec for this module — it is what James does by hand today, including the
 * part where nothing in it is trusted until it is read.
 *
 * §1.1 — a claimed target path is only recorded as `mapped` when the file it
 * would replace is proven to exist. Anything else is `unplaced` and can never
 * be promoted automatically, because a path that does not exist yet is a new
 * file, and a new file in the wrong directory is invisible rather than wrong.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT       = path.resolve(__dirname, '..');
const INTAKE_DIR = process.env.NEXUS_INTAKE_DIR || path.join(ROOT, 'data', 'intake');
const TABLE      = 'intake_drops';
const VERSION    = '1.0.0';
const MODULE_ID  = 'nexus.lib.intake';

/** Every state a drop can be in. A drop is in exactly one. */
const STATE = Object.freeze({
  STAGED:   'STAGED',    // on disk, contract written, nothing touched
  VERIFIED: 'VERIFIED',  // a real gate returned a verdict — still not applied
  REFUSED:  'REFUSED',   // a real gate refused it
  PROMOTED: 'PROMOTED',  // written into the tree, by a user, with a backup
});

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

function _sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/**
 * _claimedPath(relPath) — strip the wrapper directory a drop arrives in.
 *
 * Files come down as `nexus-hat-identity/lib/hat-forge.js`. The wrapper is
 * packaging, not location. It is only stripped when doing so lands on a path
 * that REALLY EXISTS in the tree — otherwise the original is kept, because
 * guessing at a target is how a file ends up silently in the wrong place.
 */
function _claimedPath(relPath, root = ROOT) {
  const norm = relPath.split(/[\\/]+/).filter(Boolean);
  for (let strip = 0; strip < Math.min(norm.length, 3); strip++) {
    const candidate = norm.slice(strip).join('/');
    if (!candidate) continue;
    if (fs.existsSync(path.join(root, candidate))) return { target: candidate, mapped: true, stripped: strip };
  }
  return { target: norm.join('/'), mapped: false, stripped: 0 };
}

/**
 * _describe(absFile, relPath, root) — what this one file claims, and what
 * would actually happen to the tree if it were applied.
 *
 * `identical` matters more than it looks: re-downloading the same drop is
 * normal, and a drop that turns out to be a no-op should say so rather than
 * present itself as a pending change.
 */
function _describe(absFile, relPath, root) {
  const bytes  = fs.readFileSync(absFile);
  const hash   = _sha256(bytes);
  const claim  = _claimedPath(relPath, root);
  const abs    = path.join(root, claim.target);

  let effect = 'CREATE';
  if (claim.mapped && fs.existsSync(abs)) {
    effect = _sha256(fs.readFileSync(abs)) === hash ? 'IDENTICAL' : 'OVERWRITE';
  } else if (!claim.mapped) {
    effect = 'UNPLACED';
  }
  return { source: relPath.split(path.sep).join('/'), target: claim.target, mapped: claim.mapped, bytes: bytes.length, sha256: hash, effect };
}

function _walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) _walk(abs, base, out);
    else if (entry.isFile()) out.push(path.relative(base, abs));
  }
  return out;
}

function _copyInto(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const rel of _walk(srcDir)) {
    const dest = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(srcDir, rel), dest);
  }
}

/**
 * stage(opts) — take what arrived and make it inspectable without making it real.
 *
 * @param {object} opts
 * @param {string} opts.source      absolute path to the downloaded file or directory
 * @param {object} [opts.provenance] { provider, chatUrl, filename, downloadedAt }
 * @param {string} [opts.root]      tree to resolve claimed paths against (tests)
 * @returns {{ok:boolean, dropId?:string, contract?:object, errors?:string[]}}
 */
function stage(opts = {}) {
  const errors = [];
  if (!opts.source || typeof opts.source !== 'string') errors.push('source: required absolute path');
  else if (!fs.existsSync(opts.source)) errors.push(`source: "${opts.source}" does not exist`);
  if (errors.length) return { ok: false, errors };

  const root    = opts.root || ROOT;
  const dropId  = crypto.randomUUID();
  const dropDir = path.join(opts.intakeDir || INTAKE_DIR, dropId);
  const payload = path.join(dropDir, 'payload');
  const stat    = fs.statSync(opts.source);

  fs.mkdirSync(payload, { recursive: true });
  if (stat.isDirectory()) _copyInto(opts.source, payload);
  else fs.copyFileSync(opts.source, path.join(payload, path.basename(opts.source)));

  const files = _walk(payload).map(rel => _describe(path.join(payload, rel), rel, root));

  // §STATED LIMIT — node has no bundled archive reader, and adding a
  // dependency to open untrusted bytes is the wrong trade. An archive is
  // staged whole, recorded as unexpanded, and cannot be promoted. It is
  // visible and inert, which is the honest state, rather than half-handled.
  const archives = files.filter(f => /\.(zip|tar|tgz|gz|7z|rar)$/i.test(f.source));

  const contract = {
    id:        `intake-${dropId}`,
    dropId,
    version:   VERSION,
    module:    MODULE_ID,
    state:     STATE.STAGED,
    stagedAt:  Date.now(),
    provenance: {
      provider:     (opts.provenance && opts.provenance.provider)     || null,
      chatUrl:      (opts.provenance && opts.provenance.chatUrl)      || null,
      filename:     (opts.provenance && opts.provenance.filename)     || path.basename(opts.source),
      downloadedAt: (opts.provenance && opts.provenance.downloadedAt) || null,
      // §AGENT-MESH-ARTIFACTS 2026-09-02 — James: "hook it into agent
      // mesh... contract for building phases." Real, additive
      // correlation fields — guardian/server.js's /api/intake handler
      // resolves these (jobId: best-effort match against its own live
      // job state; raidQueueId: a real reverse lookup against RAID's
      // contract-intake queue when that job was RAID-dispatched) before
      // calling stage(). Both null is a real, honest, common case (a
      // download with no active job or no RAID contract behind it at
      // all) — not every drop needs to trace back that far.
      jobId:        (opts.provenance && opts.provenance.jobId)        || null,
      // §ADDED 2026-09-20 — provenance is a fixed whitelist, so a field a
      // caller passes that isn't named here is silently dropped. Found by
      // a test asserting blockIndex survived a real stage() round trip and
      // discovering it did not. These three are real, and without them a
      // multi-block capture's drops are indistinguishable from each other:
      // which fence in the reply this file came from, what language it
      // declared, and whether its NAME was stated by the agent or invented
      // by us (§1.2 — an invented name must never read as a stated one).
      blockIndex:   (opts.provenance && opts.provenance.blockIndex  != null) ? opts.provenance.blockIndex : null,
      syntax:       (opts.provenance && opts.provenance.syntax)       || null,
      derivedName:  (opts.provenance && opts.provenance.derivedName) === true,
      raidQueueId:  (opts.provenance && opts.provenance.raidQueueId)  || null,
      sourcePath:   opts.source,
    },
    // What the drop CLAIMS. Nothing here has been accepted by anything.
    claims: files,
    summary: {
      files:      files.length,
      create:     files.filter(f => f.effect === 'CREATE').length,
      overwrite:  files.filter(f => f.effect === 'OVERWRITE').length,
      identical:  files.filter(f => f.effect === 'IDENTICAL').length,
      unplaced:   files.filter(f => f.effect === 'UNPLACED').length,
      archives:   archives.length,
      unexpandedArchives: archives.map(a => a.source),
    },
    // §IP-5 — only a real gate writes this, and only a user promotes.
    verdict:  null,
    promoted: null,
  };

  fs.writeFileSync(path.join(dropDir, 'intake-contract.json'), JSON.stringify(contract, null, 2));

  const jaa = _jaa();
  if (jaa) { try { jaa.insert(TABLE, { id: dropId, ...contract }); } catch (_) {} }

  return { ok: true, dropId, dropDir, contract };
}

/** read(dropId) — the contract as it stands. */
function read(dropId, intakeDir) {
  const p = path.join(intakeDir || INTAKE_DIR, dropId, 'intake-contract.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function _write(dropId, contract, intakeDir) {
  const dir = path.join(intakeDir || INTAKE_DIR, dropId);
  fs.writeFileSync(path.join(dir, 'intake-contract.json'), JSON.stringify(contract, null, 2));
  const jaa = _jaa();
  if (jaa) { try { jaa.insert(TABLE, { id: dropId, ...contract }); } catch (_) {} }
  return contract;
}

/**
 * recordVerdict(dropId, verdict) — attach a REAL gate's answer.
 *
 * `verdict.by` must name the gate that produced it. An agent's own assessment
 * is not a verdict and is refused here rather than stored as one — the same
 * `claimed` / `verified` split agent-chat draws, applied to files instead of
 * to answers. If a self-assessment could set this field, the gate would be
 * decorative.
 */
const GATES = Object.freeze(['raid.verify', 'tests', 'component-ledger', 'lifeline-contracts', 'user']);

function recordVerdict(dropId, verdict = {}, intakeDir) {
  const contract = read(dropId, intakeDir);
  if (!contract) return { ok: false, reason: `no staged drop "${dropId}"` };
  if (contract.state === STATE.PROMOTED) return { ok: false, reason: 'already promoted — a verdict after the fact is not a verdict' };
  if (!GATES.includes(verdict.by)) {
    return { ok: false, reason: `verdict.by must be a real gate — one of: ${GATES.join(', ')}. An agent's own assessment is a claim, not a verdict.` };
  }
  if (typeof verdict.approved !== 'boolean') return { ok: false, reason: 'verdict.approved must be true or false — a missing answer is not an approval' };

  contract.verdict = { by: verdict.by, approved: verdict.approved, reason: verdict.reason || null, ts: Date.now() };
  contract.state   = verdict.approved ? STATE.VERIFIED : STATE.REFUSED;
  return { ok: true, contract: _write(dropId, contract, intakeDir) };
}

/**
 * markOfficiated(dropId, {queueId}, intakeDir) — a real, distinct, real
 * marker: "cortex/core/raid/officiator.js already used this drop to
 * synthesize a contract." §ADDED 2026-09-02, James: "did you finish the
 * synthesis for the contracts... needs to listen for the artifact."
 * Deliberately NOT recordVerdict() — GATES above is a real, fixed list
 * of PROMOTION-eligibility gates (raid.verify/tests/component-ledger/
 * lifeline-contracts/user); officiator doesn't verify a file for
 * promotion, it synthesizes a build contract FROM it, a genuinely
 * different real act. Calling this 'officiated' rather than shoehorning
 * it into VERIFIED/REFUSED keeps the drop's real state honest — a
 * human later reading intake-contract.json sees exactly what happened,
 * not a state that implies a promotion gate ran when none did. Does
 * NOT change contract.state — an officiated drop can still be
 * separately verified/promoted through the normal real gate path;
 * these are two independent facts about the same drop.
 */
function markOfficiated(dropId, { queueId } = {}, intakeDir) {
  const contract = read(dropId, intakeDir);
  if (!contract) return { ok: false, reason: `no staged drop "${dropId}"` };
  if (contract.officiated) return { ok: false, reason: `drop "${dropId}" was already officiated (contract ${contract.officiated.queueId})` };
  contract.officiated = { queueId: queueId || null, ts: Date.now() };
  return { ok: true, contract: _write(dropId, contract, intakeDir) };
}

/**
 * promote(dropId, opts) — write the drop into the tree. Refuses unless a real
 * gate approved it AND a user asked. Backs up every file it overwrites first,
 * so the rewind exists before the change does (§17.10).
 *
 * UNPLACED files are never written. A file whose target could not be proven
 * would land somewhere chosen by a guess, and a file in the wrong place is
 * worse than a file not written, because nothing reports it missing.
 */
function promote(dropId, opts = {}) {
  const intakeDir = opts.intakeDir;
  const contract  = read(dropId, intakeDir);
  if (!contract) return { ok: false, reason: `no staged drop "${dropId}"` };
  if (opts.by !== 'user') return { ok: false, reason: "promote requires by:'user' — §IP-5, an agent cannot accept its own work" };
  if (!contract.verdict || !contract.verdict.approved) {
    return { ok: false, reason: `no approving verdict — state is ${contract.state}. Run the gate first; arrival is not acceptance.` };
  }
  if (contract.state === STATE.PROMOTED) return { ok: false, reason: 'already promoted' };

  const root      = opts.root || ROOT;
  const dropDir   = path.join(intakeDir || INTAKE_DIR, dropId);
  const backupDir = path.join(dropDir, 'backup');
  const written = [], skipped = [], failed = [];

  for (const claim of contract.claims) {
    if (claim.effect === 'UNPLACED')  { skipped.push({ ...claim, why: 'target path could not be proven' }); continue; }
    if (claim.effect === 'IDENTICAL') { skipped.push({ ...claim, why: 'already identical — nothing to write' }); continue; }
    const src  = path.join(dropDir, 'payload', claim.source);
    const dest = path.join(root, claim.target);
    try {
      if (fs.existsSync(dest)) {
        const b = path.join(backupDir, claim.target);
        fs.mkdirSync(path.dirname(b), { recursive: true });
        fs.copyFileSync(dest, b);           // rewind exists before the change does
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      written.push(claim.target);
    } catch (e) { failed.push({ target: claim.target, error: e.message }); }
  }

  contract.state    = STATE.PROMOTED;
  contract.promoted = { by: opts.by, at: Date.now(), written, skipped: skipped.map(s => ({ target: s.target, why: s.why })), failed, backupDir };
  _write(dropId, contract, intakeDir);
  return { ok: failed.length === 0, written, skipped, failed, backupDir, contract };
}

/** rollback(dropId) — put back exactly what promote replaced. */
function rollback(dropId, opts = {}) {
  const contract = read(dropId, opts.intakeDir);
  if (!contract || !contract.promoted) return { ok: false, reason: 'nothing promoted to roll back' };
  const root = opts.root || ROOT;
  const backupDir = contract.promoted.backupDir;
  const restored = [];
  if (fs.existsSync(backupDir)) {
    for (const rel of _walk(backupDir)) {
      fs.copyFileSync(path.join(backupDir, rel), path.join(root, rel.split(path.sep).join('/')));
      restored.push(rel.split(path.sep).join('/'));
    }
  }
  // Files that did not exist before are removed — a rollback that leaves new
  // files behind is a partial state nobody declared.
  const created = [];
  for (const claim of contract.claims) {
    if (claim.effect !== 'CREATE') continue;
    const dest = path.join(root, claim.target);
    if (fs.existsSync(dest)) { try { fs.unlinkSync(dest); created.push(claim.target); } catch (_) {} }
  }
  contract.state = STATE.VERIFIED;
  contract.promoted = null;
  _write(contract.dropId, contract, opts.intakeDir);
  return { ok: true, restored, removed: created };
}

/**
 * expandArchive(dropId, opts) — turn an unexpanded archive claim (see
 * stage()'s §STATED LIMIT above) into real, describable, promotable
 * files, in place, inside the SAME drop. Still just staged — nothing
 * here promotes anything; it only makes an archive's contents
 * inspectable the same way any other staged file already is.
 *
 * §NO NEW DEPENDENCY — stage()'s own header already declined to add an
 * archive-reading npm package for untrusted bytes. This keeps that
 * decision: it shells to the system `unzip` binary (present in every
 * environment this has run in) via execFileSync with an argv array —
 * never a shell string — so a crafted filename has no injection surface.
 *
 * Only .zip is handled. tar/tgz/7z/rar stay unexpanded and reported as
 * such in the returned summary — honest partial coverage, not a silent
 * no-op on formats this can't open.
 *
 * The raw archive bytes are NOT added back into contract.claims after
 * expansion — promoting a project should write its real files, not a
 * copy of the zip that produced them. They're recorded once, under
 * contract.expanded, instead.
 */
function expandArchive(dropId, opts = {}) {
  const intakeDir = opts.intakeDir || INTAKE_DIR;
  const contract  = read(dropId, intakeDir);
  if (!contract) return { ok: false, reason: `no staged drop "${dropId}"` };
  if (contract.state !== STATE.STAGED) {
    return { ok: false, reason: `drop is ${contract.state}, not STAGED — expand before any gate/promote step, not after` };
  }
  if (contract.expanded) return { ok: false, reason: `drop "${dropId}" was already expanded` };

  const zipClaims = contract.claims.filter(f => /\.zip$/i.test(f.source));
  if (!zipClaims.length) {
    return { ok: false, reason: 'no .zip archive in this drop — other archive formats (tar/tgz/7z/rar) are not handled by this function' };
  }

  const dropDir  = path.join(intakeDir, dropId);
  const payload  = path.join(dropDir, 'payload');
  const expandedInto = [];

  for (const claim of zipClaims) {
    const archivePath = path.join(payload, claim.source);
    const destDir      = path.join(payload, `${claim.source}.expanded`);
    fs.mkdirSync(destDir, { recursive: true });
    try {
      execFileSync('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'pipe' });
      expandedInto.push({ archive: claim.source, into: path.relative(payload, destDir) });
    } catch (e) {
      return { ok: false, reason: `unzip failed for ${claim.source}: ${e.message}` };
    }
  }

  // Re-walk and re-describe the whole payload against the real target
  // root — same claim shape stage() already produces, so promote() needs
  // zero changes to handle an expanded drop. The original archive files
  // are excluded (see header) rather than re-described as claims.
  const root  = opts.root || ROOT;
  const files = _walk(payload)
    .filter(rel => !expandedInto.some(e => rel === e.archive))
    .map(rel => _describe(path.join(payload, rel), rel, root));
  const stillArchives = files.filter(f => /\.(zip|tar|tgz|gz|7z|rar)$/i.test(f.source));

  contract.claims  = files;
  contract.summary = {
    files:      files.length,
    create:     files.filter(f => f.effect === 'CREATE').length,
    overwrite:  files.filter(f => f.effect === 'OVERWRITE').length,
    identical:  files.filter(f => f.effect === 'IDENTICAL').length,
    unplaced:   files.filter(f => f.effect === 'UNPLACED').length,
    archives:   stillArchives.length,
    unexpandedArchives: stillArchives.map(a => a.source),
  };
  contract.expanded = { at: Date.now(), archives: expandedInto };

  return { ok: true, contract: _write(dropId, contract, intakeDir) };
}

/** list() — every staged drop, newest first. */
function list(intakeDir) {
  const dir = intakeDir || INTAKE_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(id => read(id, dir))
    .filter(Boolean)
    .sort((a, b) => (b.stagedAt || 0) - (a.stagedAt || 0));
}

module.exports = { stage, read, recordVerdict, markOfficiated, promote, rollback, list, expandArchive, STATE, GATES, INTAKE_DIR, TABLE, MODULE_ID, VERSION };
