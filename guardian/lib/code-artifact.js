'use strict';
/**
 * guardian/lib/code-artifact.js — a job says which FILE it wants back;
 * the completion listener writes the returned code to that name.
 * comp_id: nexus.guardian.lib.code-artifact
 * UUID: nexus-guardian-code-artifact-v1-0000-2026-0919-001
 *
 * §BUILT 2026-09-19 — James: "Each job needs to list file name. Then the
 * listener listens for the code and uses the file name for the artifact.
 * And coding syntax."
 *
 * §THE REAL GAP THIS CLOSES — guardian already had TWO artifact paths and
 * neither could name a file from the job:
 *   1. ncp-handler.js's completion (~line 331) inserts a jaa 'artifacts'
 *      row holding `content: finalText.slice(0,10000)` — the whole
 *      response as prose, truncated, with no filename field at all. Code
 *      that came back in a fence was never separated from the chatter
 *      around it and never landed on disk as a file.
 *   2. /api/intake (server.js) stages real DOWNLOADED files, correlated
 *      back to a job after the fact by _findActiveJobForProvider() —
 *      which that function's own comment admits is "best-effort... not a
 *      guaranteed one". It only fires when the human clicks download in
 *      the tab; a pasted-in-chat code block produced nothing.
 * So the file name was never declared up front by the side that actually
 * knows it (the requester), and the listener had nothing to name an
 * artifact after. This module is the missing half: `job.fileName` +
 * `job.syntax` in (guardian/lib/jobs.js createJob), one named file out.
 *
 * §IT STAGES, IT NEVER APPLIES — capture() writes the file under
 * data/guardian/code-artifacts/<jobId>/ and hands it to lib/intake.js's
 * existing gated stage() pipeline. Same rule the intake route already
 * enforces (§IP-5, "arrival is not acceptance"): nothing this module
 * produces is written into the tree. Promotion stays the separate,
 * gated step it already was. This is not a second intake — it is a new
 * SOURCE for the one that exists.
 *
 * §NO GUESSED NAMES, NO GUESSED CODE — every refusal is explicit and
 * reported, never silently swallowed:
 *   - no fileName on the job       -> { ok:false, reason:'no-filename' }
 *   - no fenced block in the reply -> { ok:false, reason:'no-code-block' }
 *   - declared syntax matches none -> { ok:false, reason:'syntax-mismatch' }
 *     (it does NOT fall back to "some other block" — writing Python into
 *     a declared .js file would be the exact kind of thing that pretends
 *     to work)
 *   - unsafe fileName (absolute, or escaping its dir) -> 'unsafe-filename'
 * A refusal never fails the job: the response is still recorded by the
 * caller exactly as before. Same non-fatal discipline as jobs.js's
 * _persistJob() and lib/gap-field.js's report().
 *
 * §FENCE PARSING — deliberately the same shape already proven in this
 * tree at clear-glass/src/ipc/bridge.js:1232
 * (/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/), made global and with the info
 * string captured so a fence's declared language is real evidence rather
 * than a guess. An UNTAGGED fence (```) is treated as a candidate for
 * any declared syntax — it is unlabelled, not contradictory — and is
 * recorded as `matchedBy:'untagged'` so the picked block is auditable.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'guardian.lib.code-artifact';
const ROOT = path.resolve(__dirname, '..', '..');
// §SANDBOX 0.39.241 — found running tests/modules/test-code-artifact.js: it left
// data/guardian/code-artifacts/w1, w2, w4 in the REAL tree. This path ignored the
// test sandbox (lib/test-sandbox.js) and NEXUS_DATA_ROOT, which every other store
// honours since 0.39.236. ensure() is a no-op outside a test process.
require('../../lib/test-sandbox.js').ensure();
const ARTIFACT_DIR = process.env.NEXUS_CODE_ARTIFACT_DIR
  || path.join(process.env.NEXUS_DATA_ROOT || path.join(ROOT, 'data'), 'guardian', 'code-artifacts');

// ── syntax <-> extension ────────────────────────────────────────────────
// §DERIVED 2026-09-20 — these were two hand-maintained tables here (33
// extensions, 46 aliases). They are now built from lib/languages.js, the
// one language table, after a measured drift: this file knew 14
// extensions lib/extract-code.js did not, so the same reply resolved
// differently depending on which path saw it. Same names, same exported
// shape — SYNTAX_BY_EXT is still ext->syntax and SYNTAX_ALIASES still
// tag->syntax, so nothing that reads them changes.
const _languages = require('../../lib/languages.js');
const SYNTAX_BY_EXT = _languages.EXT_TO_LANGUAGE;
const SYNTAX_ALIASES = _languages.ALIAS_TO_LANGUAGE;

/** normalizeSyntax(s) — a fence tag or declared syntax to its canonical
 *  name. Unknown values are kept, lowercased, rather than discarded:
 *  an unrecognised language is still a real, comparable claim. */
function normalizeSyntax(s) {
  if (!s || typeof s !== 'string') return null;
  const k = s.trim().toLowerCase();
  if (!k) return null;
  return SYNTAX_ALIASES[k] || k;
}

/** syntaxForFileName(name) — canonical syntax implied by the extension,
 *  or null when the extension says nothing. */
function syntaxForFileName(name) {
  if (!name || typeof name !== 'string') return null;
  const ext = path.extname(name).toLowerCase();
  return SYNTAX_BY_EXT[ext] || null;
}

/**
 * extractCodeBlocks(text) — every fenced block, in order.
 *
 * §MERGED 2026-09-20 — this used to carry its OWN fence regex. A
 * parallel line built lib/extract-code.js the same day for idearium's
 * chunk-dispatch path, and two implementations of "find the fenced code
 * in an agent's reply" is the competing-truth-layers failure §10.3
 * names: the first time one is fixed they answer the same question
 * differently. They are now one extractor, living in the shared lib the
 * other path already imports, carrying the union of what each had
 * proven — this file's indentation tolerance and info-string attribute
 * handling, and that file's unclosed-fence guard, which this one
 * lacked entirely and which is a real failure mode (an unclosed fence
 * silently pairing with the next unrelated one).
 *
 * The block shape this file's own callers expect (tag/syntax) is
 * derived here from that extractor's output rather than re-parsed —
 * one parse, two vocabularies, no second regex.
 *
 * Returns [] for empty/non-string input rather than throwing: a job can
 * legitimately complete with no code. An unclosed fence also returns []
 * and is reported separately by capture() — see UNCLOSED below.
 */
function extractCodeBlocks(text) {
  if (!text || typeof text !== 'string') return [];
  const { extractCode } = require('../../lib/extract-code.js');
  let r = extractCode(text, { allowMultiple: true, allowEmpty: true });
  if (!r.ok) return [];
  // §0.39.282 — every block empty with the file between the fences (James's live run: "code blocks 2/2 written … code
  // artifact NOT captured: no-code-block"): the shared extractor's split-fence recovery, when it applies.
  if (r.blocks.every(b => !b.code.trim())) { const r2 = extractCode(text, { allowMultiple: true }); if (r2.ok && r2.recovered) r = r2; }
  return r.blocks.map(b => ({
    index: b.index,
    info: b.info,
    tag: b.lang || null,
    syntax: normalizeSyntax(b.lang),
    code: b.code,
  }));
}

/** unclosedFence(text) — the one failure the shared extractor detects
 *  that a bare block list cannot express. Kept as its own question so
 *  capture() can report it as a distinct refusal rather than as the
 *  indistinguishable "no-code-block". */
function unclosedFence(text) {
  if (!text || typeof text !== 'string') return false;
  const { extractCode } = require('../../lib/extract-code.js');
  return extractCode(text, { allowMultiple: true, allowEmpty: true }).reason === 'unclosed_fence';
}

/**
 * pickBlock(blocks, { syntax, fileName }) — which block belongs in the
 * declared file.
 *
 * Order, strictest first, so the choice is always explainable:
 *   1. exact declared-syntax match (fence tag == wanted syntax)
 *   2. untagged fence, when a syntax was wanted — unlabelled, not wrong
 *   3. no syntax wanted at all -> the largest block
 * Ties inside a tier go to the largest block (the substantive one, not a
 * one-line usage example). Returns { block, matchedBy } or a reason.
 */
function pickBlock(blocks, opts = {}) {
  const list = Array.isArray(blocks) ? blocks.filter(b => b && b.code && b.code.trim()) : [];
  if (!list.length) return { block: null, matchedBy: null, reason: 'no-code-block' };

  const wanted = normalizeSyntax(opts.syntax) || syntaxForFileName(opts.fileName);
  const biggest = arr => arr.slice().sort((a, b) => b.code.length - a.code.length)[0];

  if (!wanted) return { block: biggest(list), matchedBy: 'largest', wanted: null };

  const exact = list.filter(b => b.syntax === wanted);
  if (exact.length) return { block: biggest(exact), matchedBy: 'syntax', wanted };

  const untagged = list.filter(b => !b.syntax);
  if (untagged.length) return { block: biggest(untagged), matchedBy: 'untagged', wanted };

  return {
    block: null, matchedBy: null, wanted, reason: 'syntax-mismatch',
    found: [...new Set(list.map(b => b.syntax))],
  };
}

/** _safeRelative(fileName) — a job may name a path inside its own
 *  artifact dir (src/x.js) but never an absolute one and never one that
 *  climbs out of it. Returns null when unsafe. */
function _safeRelative(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  const raw = fileName.trim();
  if (!raw || path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) return null;
  const rel = path.normalize(raw).split(path.sep).join('/');
  if (rel.startsWith('../') || rel === '..' || rel.includes('/../')) return null;
  return rel;
}

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

/**
 * capture({ job, text, dir, stage }) — the listener's one call.
 *
 * Writes the picked code to <dir>/<job.fileName> and (unless
 * stage === false) hands that real path to lib/intake.js's stage().
 * Never throws: every failure comes back as { ok:false, reason }.
 *
 * @param {object} job   needs .id and .fileName; .syntax and .provider optional
 * @param {string} text  the agent's full response
 * @returns {{ok:boolean, reason?:string, fileName?:string, syntax?:string,
 *            path?:string, bytes?:number, sha256?:string, matchedBy?:string,
 *            blockIndex?:number, blockCount?:number, dropId?:string|null}}
 */
function capture({ job, text, dir, stage = true } = {}) {
  if (!job || typeof job !== 'object') return { ok: false, reason: 'no-job' };
  if (!job.fileName) return { ok: false, reason: 'no-filename' };

  const rel = _safeRelative(job.fileName);
  if (!rel) return { ok: false, reason: 'unsafe-filename', fileName: job.fileName };

  const blocks = extractCodeBlocks(text);
  if (!blocks.length && unclosedFence(text)) {
    // A real, distinct failure: the agent opened a fence and never
    // closed it. Reporting this as 'no-code-block' would send someone
    // looking for a missing reply when the reply is there and truncated.
    return { ok: false, reason: 'unclosed-fence', fileName: rel, blockCount: 0 };
  }
  const picked = pickBlock(blocks, { syntax: job.syntax, fileName: rel });
  if (!picked.block) {
    return {
      ok: false, reason: picked.reason, fileName: rel,
      syntax: normalizeSyntax(job.syntax) || syntaxForFileName(rel) || null,
      blockCount: blocks.length, found: picked.found,
    };
  }

  const baseDir = dir || path.join(ARTIFACT_DIR, String(job.id || 'no-job-id'));
  const target = path.join(baseDir, rel);
  let bytes;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, picked.block.code, 'utf8');
    bytes = Buffer.byteLength(picked.block.code, 'utf8');
  } catch (e) {
    return { ok: false, reason: `write-failed: ${e.message}`, fileName: rel };
  }

  const result = {
    ok: true,
    fileName: rel,
    // The file's name is the authority on what it IS; the fence tag is
    // the agent's claim about it. Both are reported — they can disagree,
    // and a disagreement is real information, not something to flatten.
    syntax: syntaxForFileName(rel) || picked.block.syntax || null,
    fenceSyntax: picked.block.syntax,
    matchedBy: picked.matchedBy,
    blockIndex: picked.block.index,
    blockCount: blocks.length,
    path: target,
    bytes,
    sha256: sha256(picked.block.code),
    dropId: null,
  };

  if (stage) {
    try {
      const intake = require('../../lib/intake.js');
      const r = intake.stage({
        source: target,
        provenance: {
          provider: job.provider || null,
          filename: rel,
          jobId: job.id || null,
          agentId: job.agentId || null,
          downloadedAt: Date.now(),
        },
      });
      if (r && r.ok) result.dropId = r.dropId;
      else result.stageError = (r && r.error) || 'intake.stage refused';
    } catch (e) {
      // The file on disk is real whether or not staging worked. Report
      // the failure, keep the artifact — do not pretend it staged.
      result.stageError = e.message;
    }
  }

  return result;
}

/**
 * onJobComplete({ job, text, bus }) — THE listener, in one place.
 *
 * §WIRED 2026-09-20 — capture() shipped wired into exactly one of
 * guardian's real completion points (ncp-handler.js), which meant a job
 * that declared a fileName and came back through any OTHER path simply
 * produced no artifact, silently. That was named as an open gap when
 * the feature shipped rather than discovered later; this closes it.
 *
 * Real completion points carrying an agent's reply, all now routed here
 * (§10.3 — one implementation, several callers, never a second copy):
 *   guardian/lib/ncp-handler.js     — the NCP/userscript tab path
 *   guardian/lib/provider-routing.js x2 — the ollama/mistral bridge polls
 *   guardian/server.js /wake-job-ack — a completed wake exchange
 *
 * Deliberately NOT routed here: guardian/lib/dispatcher.js's browser-
 * command completion. Checked directly rather than wired for symmetry —
 * its `response` is JSON.stringify(result.result) from
 * dispatchBrowserCommand, a structured browser action result, not an
 * agent's chat reply. There is no fenced code in it to find, and
 * pointing a code extractor at it would only ever produce a refusal.
 *
 * Returns the capture record, or null when the job declared no fileName
 * (the overwhelmingly common case — this must stay free for every job
 * that never asked for a file). Never throws: a failed capture costs one
 * artifact, never a completion.
 */
/**
 * recordAgentResponse({ job, text, blocks }) — every agent response
 * becomes a real .response node in the downloads index.
 *
 * §BUILT 2026-09-20 — James: "Needs to capture the agent responses in
 * the download manager, .response node." The machinery already existed
 * and was already right: clear-glass/src/downloads/artifact-chat-index.js
 * runs in a real COS compartment and writes responses/<id>.response
 * (fsync'd source of truth) plus a disposable SQLite index over them.
 * What did not exist was anything calling it automatically — its only
 * caller was `guardian sync`, a manual CLI command. Every response that
 * came back through a real job completion was recorded nowhere.
 *
 * §THE CODE BLOCKS ARE CAPTURED WITH IT, which is the other half of the
 * ask ("automatically capture coding blocks, coding syntax"). Each
 * block's language, resolved extension, size and sha256 go into the
 * record — deliberately WITH the code itself, since the .response file
 * is the source of truth and a record of "there were 2 blocks" that
 * doesn't contain them would need the original reply to be useful.
 *
 * §NON-FATAL, ALWAYS — a capture failure costs one index entry, never a
 * job completion. Guarded at every level: no compartment, no sqlite, no
 * disk, all reported and swallowed here.
 */
function recordAgentResponse({ job, text, blocks } = {}) {
  if (!job || typeof text !== 'string' || !text.trim()) return null;
  try {
    // 0.39.239 — root from the index's own defaultRoot(), shared with Clear Glass's readers.
    const { defaultRoot, recordResponse } = require('../../clear-glass/src/downloads/artifact-chat-index.js');
    const root = defaultRoot();

    const codeBlocks = (blocks || []).map(b => ({
      index: b.index,
      syntax: b.syntax || null,
      ext: b.syntax ? _languages.extFor(b.syntax) : null,
      bytes: Buffer.byteLength(b.code, 'utf8'),
      sha256: sha256(b.code),
      code: b.code,
    }));

    const stored = recordResponse(root, {
      kind: 'chat',
      provider: job.provider || null,
      chatId: job.chatId || job.chat_id || null,
      raw: {
        jobId: job.id || null,
        provider: job.provider || null,
        command: job.command || null,
        agentId: job.agentId || null,
        prompt: job.prompt || null,
        response: text,
        // The declared target, when the job named one — so a .response
        // and the file it produced can be correlated later without
        // re-parsing the reply.
        declaredFileName: job.fileName || null,
        declaredSyntax: job.syntax || null,
        codeBlockCount: codeBlocks.length,
        codeBlocks,
        capturedBy: MODULE_ID,
      },
    });
    if (stored && stored.indexed === false) {
      console.warn(`[guardian] .response written (${stored.responsePath}) but not indexed: ${stored.indexError}`);
    }
    return stored;
  } catch (e) {
    console.warn(`[guardian] .response capture failed for job ${job.id} (non-fatal): ${e.message}`);
    return null;
  }
}

/**
 * captureAll({ job, text, dir, stage }) — EVERY fenced block in a reply
 * becomes a real file, each with its own syntax.
 *
 * §BUILT 2026-09-20 — James: "Just need to capture all code blocks and
 * coding syntax. That's the biggest gap with guardian."
 *
 * capture() above answers a narrow question: "the job declared ONE file,
 * which block belongs in it." That was the right shape for a declared
 * target and it is unchanged. But it means every OTHER block an agent
 * returned was parsed, counted, and then thrown away — an agent that
 * answers with three files produced one artifact and two discarded
 * fences. The .response node records them, but a record inside a JSON
 * blob is not a file anyone can use.
 *
 * §NAMING IS THE WHOLE PROBLEM, and it is answered honestly rather than
 * guessed:
 *   - The block that matches the job's declared fileName (by the same
 *     pickBlock rules as capture()) gets THAT name. One block can hold
 *     the declared name; the rest cannot.
 *   - A fence whose info string carries a path — ```js src/x.js — has a
 *     real name the AGENT stated. That is used, after the same path
 *     safety check every other name gets. This was listed as an open
 *     question when the feature shipped; the answer is that an agent
 *     naming its own file is evidence, and the job's declared name still
 *     outranks it for the one block that matches.
 *   - Everything else gets `block-<index><ext>`, where ext comes from
 *     the block's own fence language via lib/languages.js. These are
 *     marked derivedName:true so nothing downstream mistakes an invented
 *     name for one anybody actually stated (§1.2).
 *   - A block whose language is unknown gets no extension rather than a
 *     guessed one.
 *
 * Returns { ok, blocks: [...], captured, refused }. Never throws.
 */
function captureAll({ job, text, dir, stage = true } = {}) {
  if (!job) return { ok: false, reason: 'no-job', blocks: [] };
  const all = extractCodeBlocks(text);
  if (!all.length) {
    return {
      ok: false,
      reason: unclosedFence(text) ? 'unclosed-fence' : 'no-code-block',
      blocks: [], captured: 0, refused: 0,
    };
  }

  const baseDir = dir || path.join(ARTIFACT_DIR, String(job.id || 'no-job-id'));

  // Which block, if any, claims the job's declared name.
  let declaredIndex = -1;
  const declaredRel = job.fileName ? _safeRelative(job.fileName) : null;
  if (declaredRel) {
    const picked = pickBlock(all, { syntax: job.syntax, fileName: declaredRel });
    if (picked.block) declaredIndex = picked.block.index;
  }

  const out = [];
  for (const b of all) {
    let name = null;
    let derivedName = false;
    let source = null;

    if (b.index === declaredIndex) {
      name = declaredRel; source = 'job-declared';
    } else {
      // A path stated inside the fence's own info string, e.g.
      // ```js src/x.js  or  ```js title="src/x.js"
      const stated = fenceDeclaredPath(b);
      if (stated) { name = stated; source = 'fence-declared'; }
      else {
        const ext = b.syntax ? _languages.extFor(b.syntax) : null;
        name = `block-${b.index}${ext || ''}`;
        derivedName = true; source = 'derived';
      }
    }

    const rec = {
      index: b.index, syntax: b.syntax || null,
      ext: b.syntax ? _languages.extFor(b.syntax) : null,
      fileName: name, nameSource: source, derivedName,
      bytes: Buffer.byteLength(b.code, 'utf8'), sha256: sha256(b.code),
    };

    const target = path.join(baseDir, name);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, b.code, 'utf8');
      rec.ok = true; rec.path = target;
    } catch (e) {
      rec.ok = false; rec.error = e.message;
      out.push(rec);
      continue;
    }

    if (stage) {
      try {
        const intake = require('../../lib/intake.js');
        const r = intake.stage({
          source: target,
          provenance: {
            provider: job.provider || null, filename: name,
            jobId: job.id || null, agentId: job.agentId || null,
            blockIndex: b.index, syntax: b.syntax || null,
            derivedName, downloadedAt: Date.now(),
          },
        });
        if (r && r.ok) rec.dropId = r.dropId;
        else rec.stageError = (r && r.error) || 'intake.stage refused';
      } catch (e) { rec.stageError = e.message; }
    }
    out.push(rec);
  }

  const captured = out.filter(b => b.ok).length;
  return { ok: captured > 0, blocks: out, captured, refused: out.length - captured, blockCount: all.length };
}

function onJobComplete({ job, text, bus } = {}) {
  if (!job) return null;

  // §EVERY RESPONSE IS CAPTURED, not only the ones that named a file.
  // The .response node is the durable record of the exchange itself;
  // the named-file artifact below is a separate, opt-in thing built on
  // top of it. Conflating them would mean an agent reply only survived
  // if someone happened to ask for a file from it.
  const blocks = extractCodeBlocks(text);
  const recorded = recordAgentResponse({ job, text, blocks });
  if (recorded && bus && typeof bus.emit === 'function') {
    try {
      bus.emit('guardian.response.captured', {
        jobId: job.id, provider: job.provider || null,
        responseId: recorded.id, responsePath: recorded.responsePath,
        indexed: recorded.indexed, codeBlocks: blocks.length, ts: Date.now(),
      });
    } catch (_) { /* an emit failure never costs the capture */ }
  }

  // §ALL BLOCKS, not just the declared one. Runs for every reply that
  // contains code, whether or not the job named a file — an agent
  // returning three files now produces three real files instead of one
  // artifact and two discarded fences.
  let allBlocks = null;
  if (blocks.length) {
    try {
      allBlocks = captureAll({ job, text });
      if (allBlocks.ok) {
        console.log(`[guardian] code blocks: ${allBlocks.captured}/${allBlocks.blockCount} written (${allBlocks.blocks.map(b => `${b.fileName}${b.derivedName ? '*' : ''}`).join(', ')})`);
      }
      if (bus && typeof bus.emit === 'function') {
        bus.emit('guardian.blocks.captured', {
          jobId: job.id, provider: job.provider || null,
          captured: allBlocks.captured, blockCount: allBlocks.blockCount,
          blocks: allBlocks.blocks.map(({ index, fileName, syntax, bytes, derivedName, dropId }) =>
            ({ index, fileName, syntax, bytes, derivedName, dropId: dropId || null })),
          ts: Date.now(),
        });
      }
    } catch (e) {
      console.warn(`[guardian] captureAll failed for job ${job.id} (non-fatal): ${e.message}`);
    }
  }

  if (!job.fileName) return null;
  let result;
  try {
    result = capture({ job, text });
  } catch (e) {
    console.warn(`[guardian] code-artifact capture threw for job ${job.id} (non-fatal): ${e.message}`);
    return null;
  }
  if (result.ok) {
    console.log(`[guardian] code artifact: ${result.fileName} (${result.bytes}b, ${result.syntax || 'unknown syntax'}, block ${result.blockIndex + 1}/${result.blockCount} by ${result.matchedBy})${result.dropId ? ` → drop ${result.dropId}` : ''}${result.stageError ? ` [stage failed: ${result.stageError}]` : ''}`);
  } else {
    console.warn(`[guardian] code artifact NOT captured for job ${job.id} (${job.fileName}): ${result.reason}${result.found ? ` — fences found: ${result.found.join(', ')}` : ''}`);
  }
  try {
    if (bus && typeof bus.emit === 'function') {
      bus.emit(result.ok ? 'guardian.artifact.captured' : 'guardian.artifact.refused',
        { jobId: job.id, provider: job.provider || null, ...result, ts: Date.now() });
    }
  } catch (_) { /* an emit failure never costs the artifact */ }
  return result;
}

/**
 * fenceDeclaredPath(block) -> safe repo-relative path | null
 * §2026-09-21 — extracted verbatim from captureAll()'s inline match so
 * lib/repo-inject.js addresses compartment writes with the SAME rule rather
 * than a second regex that drifts (§10.3). A path the agent states in the
 * fence info string (```js src/x.js  or  ```js title="src/x.js") is the
 * agent's own claim about where the code goes; it still passes through
 * _safeRelative, so ../escape.js yields null, never a write outside the tree.
 */
function fenceDeclaredPath(b) {
  const m = ((b && b.info) || '').match(/(?:^|\s)(?:title=)?["']?([\w./-]+\.[A-Za-z0-9]+)["']?\s*$/);
  return m && m[1] && m[1] !== b.tag ? _safeRelative(m[1]) : null;
}

// §REMOVED 2026-09-22 — a verifyJobCompletion() lived here briefly, built
// before finding guardian/lib/response-sink.js's own synthesize(jobId),
// which already does this — more completely (5 sources, not 1) and
// already real. Kept out rather than left as a second, inferior
// implementation. See response-sink.js's synthesize() for the real one,
// and findResponseByJobId() in clear-glass/src/downloads/artifact-chat-
// index.js remains (synthesize() doesn't use it, but it's a real,
// independently useful primitive — direct .response lookup by jobId —
// not redundant with synthesize's own node-reading path, which reads a
// different real store, guardian/data/nodes/response/).

module.exports = {
  MODULE_ID,
  fenceDeclaredPath,
  captureAll,
  onJobComplete,
  recordAgentResponse,
  capture,
  extractCodeBlocks,
  unclosedFence,
  pickBlock,
  normalizeSyntax,
  syntaxForFileName,
  SYNTAX_BY_EXT,
  SYNTAX_ALIASES,
  ARTIFACT_DIR,
  _safeRelative,
};
