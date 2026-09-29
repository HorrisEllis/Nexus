'use strict';
/**
 * guardian/lib/response-sink.js — every real path a response can take to
 * the return point, and the ability to reconstruct one from whichever
 * survived.
 *
 * §BUILT 2026-09-15 — James: "we need to create another api route to
 * stream to a .response node in the data folder, clearglass download
 * manager, the ledger, and the sse, to use as fallback, or synthesize
 * them, make sure they reach the return point."
 *
 * §THE RETURN POINT, AND WHY IT LIED — the return point is
 * GET /response/:jobId in guardian/server.js. It reads, in order:
 * job.responseText, job.text, then an artifacts row's content. All three
 * can be absent for a job that genuinely completed:
 *   - jobs is an in-memory Map. Restart and it's gone. (The .job files
 *     jobs.js persists cover the job, not the response text — checked.)
 *   - the artifacts row is written inside ncp-handler's completion
 *     branch, AFTER several things that can throw before reaching it.
 *   - a SEAM-routed jobId is never in the jobs Map at all, by design.
 * In all of those, the route answered `{ok:true, status:..., response:''}`
 * — HTTP 200, ok:true, empty string. A caller cannot distinguish that
 * from a real empty answer. That is the silent lie this module ends.
 *
 * §FOUR SINKS, EACH INDEPENDENT — a response is written to all four; none
 * depends on another; each records its own real success or failure:
 *   1. NODE      — a real .response node under guardian/data/nodes/response/
 *                  (schema.response, type registered in KNOWN_TYPES). The
 *                  durable one. Survives restarts, which is what makes it
 *                  the primary fallback for the return point.
 *   2. LEDGER    — the real CFR ledger (intelligence/cfr/ledger) plus the
 *                  JAA artifacts row, i.e. the two records that already
 *                  existed, now written deliberately rather than
 *                  incidentally.
 *   3. DOWNLOADS — Clear Glass's real downloads manager. See §CLEAR GLASS
 *                  below; this one needed a real route built on the Clear
 *                  Glass side to be reachable at all.
 *   4. SSE       — the real bus events GET /stream/:jobId already listens
 *                  for (guardian.job.chunk / .complete / .error). Emitting
 *                  them here means a response delivered through the new
 *                  API route streams to a watching client exactly as an
 *                  NCP-delivered one does, with no second stream concept.
 *
 * §SYNTHESIZE MEANS RECONSTRUCT, NOT INVENT — synthesize() searches the
 * sinks in descending order of trustworthiness and returns the first real
 * record it finds, labelled with where it came from. It NEVER produces
 * text that no sink held. If every sink is empty the honest answer is
 * "no response was ever recorded for this job", and that is what it
 * returns — a 404-shaped result, not an empty string dressed as success.
 *
 * §CLEAR GLASS — the downloads manager (clear-glass/src/downloads/
 * store.js) was reachable only over Electron IPC (`downloads:list` et al
 * in src/ipc/bridge.js); there was no HTTP route to ADD an entry, so
 * Guardian could not push into it at all. A real route was added on the
 * Clear Glass side (POST /cli/downloads, beside the /cli/downloads/
 * listeners routes that already existed) rather than faking this sink or
 * routing it through the unrelated /api/intake staging path. If Clear
 * Glass is not running, this sink reports a real connection failure and
 * the other three are unaffected — which is the entire point of having
 * four.
 */

const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const crypto = require('crypto');

const nodeExport = require('../../lib/node-export.js');

const MODULE_ID = 'guardian/response-sink';
const VERSION   = '1.1.0';

// §0.39.246 — overridable so tests never write into live data (the
// passthrough test used to leave j1..j7.response in the real folder).
const NODES_DIR = process.env.GUARDIAN_RESPONSE_NODES_DIR || path.join(__dirname, '..', 'data', 'nodes', 'response');
// Download entries Clear Glass could not take (not running, timed out,
// refused). Replayed in order on the next successful post — a response
// is never missing from the downloads manager just because the browser
// was closed when it arrived.
// §0.39.282 N29 — beside an overridden NODES_DIR, not two levels up: in the test sandbox NODES_DIR is
// /tmp/<sandbox>/guardian-response-nodes, so two levels up was /tmp itself — ONE queue shared by every sandbox, and a
// suite replayed another suite's queued entries into its own downloads index (test-one-tab-e2e OT-04..06, full run only).
// Two levels up only for the <data>/nodes/response layout (production: guardian/data/); any other override keeps the
// queue beside its nodes dir, inside whatever owns it.
const DOWNLOADS_PENDING = path.basename(path.dirname(NODES_DIR)) === 'nodes'
  ? path.join(path.dirname(path.dirname(NODES_DIR)), 'downloads-pending.jsonl')
  : path.join(path.dirname(NODES_DIR), 'downloads-pending.jsonl');

const CG_IPC_PORT = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10);

function _sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

// ── sink 1: the .response node ───────────────────────────────────────────
/**
 * writeNode({ jobId, provider, status, text, source, ... }) -> { ok, detail }
 *
 * §OVERWRITE IS CORRECT — a job has one response, progressively known.
 * A 'partial' node replaced by the 'complete' one is the same answer
 * finishing, not two answers. The per-type ledger (lib/node-index.js's
 * nodes_response_ledger, via guardian's node-registry watching this
 * folder) keeps the transition history, so nothing is lost by rewriting.
 */
// §NAMING — bare jobId, not the projectname.filename.uuid8 convention
// idearium/lib/chunk-nodes.js uses. Deliberately different: a chunk has
// no real identity outside a project+file pair a human recognizes, so
// its filename carries that context. A response's real, stable lookup
// key is already jobId — every other system (GET /response/:jobId,
// jobs.get(), the artifacts row's own .jobId field) indexes by exactly
// that — so wrapping it in a longer name would only make it harder to
// find, not more meaningful.
function writeNode(rec, sinks = {}) {
  try {
    fs.mkdirSync(NODES_DIR, { recursive: true });
    const payload = {
      jobId: rec.jobId,
      provider: rec.provider || 'unknown',
      agentId: rec.agentId || null,
      status: rec.status,
      text: rec.text || '',
      chars: (rec.text || '').length,
      contentHash: _sha256(rec.text || ''),
      source: rec.source || 'api',
      // The honesty record: what every OTHER sink did for this response,
      // stored on the node itself so a failure can't vanish into a
      // console warning nobody reads. Written last, which is why the
      // caller passes the results in.
      sinks,
      ...(rec.synthesizedFrom ? { synthesizedFrom: rec.synthesizedFrom } : {}),
      ...(rec.prompt ? { prompt: String(rec.prompt).slice(0, 4000) } : {}),
      ...(rec.command ? { command: rec.command } : {}),
      ...(rec.chatUrl ? { chatUrl: rec.chatUrl } : {}),
      ts: rec.ts || Date.now(),
    };
    const filePath = nodeExport.exportToFile('response', rec.jobId, payload, {
      context: 'guardian agent response — durable return-point record',
      system: 'guardian',
      summary: `${payload.provider} ${payload.status} (${payload.chars} chars)`,
      tags: [`provider:${payload.provider}`, `status:${payload.status}`, `source:${payload.source}`, ...(payload.agentId ? [`agent:${payload.agentId}`] : [])],
    }, NODES_DIR);
    return { ok: true, detail: filePath };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

/** readNode(jobId) -> the real payload, or null. */
function readNode(jobId) {
  try {
    const p = path.join(NODES_DIR, `${jobId}.response`);
    if (!fs.existsSync(p)) return null;
    return nodeExport.importFromFile(p).payload;
  } catch (e) {
    console.warn(`[${MODULE_ID}] §1.2 .response node for ${jobId} unreadable: ${e.message}`);
    return null;
  }
}

// ── sink 2: the ledger ───────────────────────────────────────────────────
/**
 * Two real records, both of which already existed and neither of which
 * was reliably reached for a response delivered outside the NCP path:
 * the CFR ledger entry and the JAA artifacts row. The artifacts row is
 * what the CURRENT return point already falls back to, so writing it
 * here is what makes this module's deliveries visible to the old path
 * even before the route below is used.
 */
function writeLedger(rec, { evLedger, jaa }) {
  const detail = [];
  let ok = false;
  try {
    if (evLedger && typeof evLedger.record === 'function') {
      evLedger.record('guardian.response.delivered', {
        jobId: rec.jobId, provider: rec.provider, status: rec.status,
        chars: (rec.text || '').length, source: rec.source,
      }, { source: 'guardian.response-sink', causedBy: rec.jobId });
      detail.push('cfr'); ok = true;
    }
  } catch (e) { detail.push(`cfr failed: ${e.message}`); }

  try {
    if (jaa && typeof jaa.insert === 'function') {
      jaa.insert('artifacts', {
        uuid: crypto.randomUUID(), jobId: rec.jobId,
        provider: rec.provider || 'unknown',
        // Matches the existing artifacts-row convention (ncp-handler
        // writes .slice(0, 10000)) rather than inventing a second cap —
        // the .response node above is the uncapped record, which is what
        // it is for.
        content: (rec.text || '').slice(0, 10000),
        ts: Date.now(), source: rec.source || 'response-sink',
        gaps: rec.gaps !== undefined ? rec.gaps : undefined,
        gapDrift: rec.gapDrift !== undefined ? rec.gapDrift : undefined,
        // §BUILT 2026-09-22 — codeArtifact fields, when the caller found
        // one (ncp-handler's own code-artifact.js onJobComplete result) —
        // additive, so this one row carries what used to be a second,
        // now-removed manual insert into this same table.
        fileName:   rec.codeArtifact ? rec.codeArtifact.fileName   : undefined,
        syntax:     rec.codeArtifact ? rec.codeArtifact.syntax     : undefined,
        filePath:   rec.codeArtifact ? rec.codeArtifact.path       : undefined,
        fileSha256: rec.codeArtifact ? rec.codeArtifact.sha256     : undefined,
        dropId:     rec.codeArtifact ? rec.codeArtifact.dropId     : undefined,
      });
      detail.push('artifacts'); ok = true;
    }
  } catch (e) { detail.push(`artifacts failed: ${e.message}`); }

  return { ok, detail: detail.join('; ') || 'no ledger available' };
}

// ── sink 3: Clear Glass downloads manager ────────────────────────────────
/**
 * postToDownloads(rec) -> Promise<{ ok, detail }>
 *
 * Posts a real entry into Clear Glass's downloads store via the real
 * route added for this (POST /cli/downloads). Deliberately fire-and-
 * report: a response must never wait on a browser process, so the
 * timeout is short and a failure is recorded, not thrown.
 *
 * §WHY A RESPONSE BELONGS IN A DOWNLOADS LIST AT ALL — because that list
 * is where a user already looks for "things an agent produced that I can
 * open". A completed response saved to disk is exactly that, and routing
 * it there makes it recoverable by hand when every programmatic path has
 * failed — which is the fallback case this whole module exists for.
 */
function _downloadEntry(rec, savePath) {
  return {
    // §0.39.246 — the entry belongs to the agent that asked (a repo's
    // `repo-<uuid>`), not to the provider tab that answered. Provider is
    // kept as its own field. Routing by provider filed every repo's
    // replies together under "chatgpt".
    agentId: rec.agentId || rec.provider || 'guardian',
    provider: rec.provider || null,
    compartmentId: rec.compartmentId || null,
    kind: 'response',
    filename: `${rec.jobId}.response`,
    url: `guardian://response/${rec.jobId}`,
    savePath: savePath || path.join(NODES_DIR, `${rec.jobId}.response`),
    mimeType: 'application/x-nexus-response+yaml',
    bytes: Buffer.byteLength(rec.text || '', 'utf8'),
    state: rec.status === 'complete' ? 'completed' : rec.status === 'error' ? 'interrupted' : 'in_progress',
    source: 'guardian.response-sink',
    jobId: rec.jobId,
  };
}

function _post(entry, timeoutMs) {
  return new Promise((resolve) => {
    const body = JSON.stringify(entry);
    const req = http.request({
      hostname: '127.0.0.1', port: CG_IPC_PORT, path: '/cli/downloads',
      method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true, detail: `clear-glass ${res.statusCode}` });
        else resolve({ ok: false, detail: `clear-glass ${res.statusCode}: ${d.slice(0, 200)}` });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: `clear-glass timeout after ${timeoutMs}ms` }); });
    req.on('error', (e) => resolve({ ok: false, detail: `clear-glass unreachable: ${e.message}` }));
    req.write(body); req.end();
  });
}

function _readPending() {
  try { return fs.readFileSync(DOWNLOADS_PENDING, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); }
  catch (_) { return []; }
}
function _writePending(list) {
  fs.mkdirSync(path.dirname(DOWNLOADS_PENDING), { recursive: true });
  if (!list.length) { try { fs.unlinkSync(DOWNLOADS_PENDING); } catch (_) {} return; }
  fs.writeFileSync(DOWNLOADS_PENDING, list.map(e => JSON.stringify(e)).join('\n') + '\n');
}

/** flushPendingDownloads() — replay queued entries in order; stops at the first refusal. */
async function flushPendingDownloads({ timeoutMs = 2500 } = {}) {
  const list = _readPending();
  let sent = 0;
  while (sent < list.length) {
    const r = await _post(list[sent], timeoutMs);
    if (!r.ok) break;
    sent++;
  }
  _writePending(list.slice(sent));
  return { sent, remaining: list.length - sent };
}

/**
 * postToDownloads(rec, { savePath }) -> Promise<{ ok, detail, queued? }>
 * Posts the response into Clear Glass's downloads manager (POST
 * /cli/downloads). Never throws, never waits long. On failure the entry
 * is queued to downloads-pending.jsonl and `queued: true` is reported —
 * the entry is late, not lost. On success, anything queued is replayed.
 *
 * §WHY A RESPONSE BELONGS IN A DOWNLOADS LIST AT ALL — that list is where
 * a user already looks for "things an agent produced that I can open",
 * and it makes a response recoverable by hand when every programmatic
 * path has failed — the fallback case this whole module exists for.
 */
async function postToDownloads(rec, { savePath = null, timeoutMs = 2500 } = {}) {
  const entry = _downloadEntry(rec, savePath);
  const r = await _post(entry, timeoutMs);
  if (!r.ok) {
    try { _writePending([..._readPending(), entry]); return { ...r, queued: true }; }
    catch (e) { return { ...r, queued: false, detail: `${r.detail}; could not queue: ${e.message}` }; }
  }
  const flushed = await flushPendingDownloads({ timeoutMs });
  return flushed.sent ? { ...r, detail: `${r.detail}; replayed ${flushed.sent} queued` } : r;
}

// ── sink 4: SSE ──────────────────────────────────────────────────────────
/**
 * emitToStream(rec, { bus, done }) — emits the REAL events
 * GET /stream/:jobId already subscribes to, rather than inventing a
 * parallel stream. Confirmed against that route's own handlers before
 * writing this: it listens on ncp.stream.chunk, guardian.job.chunk,
 * guardian.job.complete and guardian.job.error, and reads `jobId` off
 * the payload plus `token`/`text` for content. Those exact names and
 * shapes are what's emitted here, so a client watching a job cannot tell
 * whether its answer arrived through NCP or through the new route —
 * which is the correct outcome.
 */
function emitToStream(rec, { bus, done = true } = {}) {
  if (!bus || typeof bus.emit !== 'function') return { ok: false, detail: 'no bus' };
  try {
    if (rec.status === 'error') {
      bus.emit('guardian.job.error', { jobId: rec.jobId, provider: rec.provider, error: rec.error || rec.text || 'job failed' });
    } else if (done) {
      if (rec.text) bus.emit('guardian.job.chunk', { jobId: rec.jobId, provider: rec.provider, text: rec.text });
      // §BUILT 2026-09-22 — James: "do it" (route ncp-handler's completion
      // through this module). gaps/gapDrift/command/meta are optional and
      // additive — gap-loop's closure verifier reads meta.gapUuid off this
      // exact event; every OTHER real caller of deliver() (the standalone
      // POST /response/:jobId route) simply never passes them, so this is
      // fully backward compatible, not a second event shape.
      bus.emit('guardian.job.complete', {
        jobId: rec.jobId, provider: rec.provider, chars: (rec.text || '').length,
        // §0.39.282 — the text itself (and the chat it came from). guardian/server.js's guardian.job.complete gate stores
        // jobs.response and logs "<n>ch" from data.text; without it every NCP job was recorded with an empty response and
        // "0ch · chat=(none reported)" (James's live log), though the .response node held the reply.
        text: rec.text || '', ...(rec.chatUrl ? { chatUrl: rec.chatUrl } : {}),
        source: rec.source || 'response-sink',
        ...(rec.gaps !== undefined ? { gaps: rec.gaps } : {}),
        ...(rec.gapDrift !== undefined ? { gapDrift: rec.gapDrift } : {}),
        ...(rec.command !== undefined ? { command: rec.command } : {}),
        ...(rec.meta !== undefined ? { meta: rec.meta } : {}),
      });
    } else {
      // A real streaming increment — not terminal, so no complete event.
      bus.emit('guardian.job.chunk', { jobId: rec.jobId, provider: rec.provider, text: rec.text });
    }
    return { ok: true, detail: done ? 'chunk+complete' : 'chunk' };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

// ── deliver ──────────────────────────────────────────────────────────────
/**
 * deliver(rec, deps) -> Promise<{ ok, jobId, sinks, node }>
 *
 * The fan-out. Every sink is attempted regardless of what the others
 * did, and the per-sink outcome is returned AND recorded on the node.
 *
 * `ok` is true when AT LEAST ONE durable sink (node or ledger) accepted
 * the response — that is the real condition for "this response can still
 * be found later", which is what the caller actually needs to know.
 * Reporting ok only on all-four-succeeded would fail every delivery made
 * while Clear Glass happens to be closed, which is not a failure.
 *
 * deps: { bus, jaa, evLedger, updateJob, jobs }
 */
async function deliver(rec, deps = {}) {
  const { bus, jaa, evLedger, updateJob } = deps;
  if (!rec || !rec.jobId) return { ok: false, error: 'jobId required' };

  const record = {
    jobId: rec.jobId,
    provider: rec.provider || 'unknown',
    agentId: rec.agentId || null,
    compartmentId: rec.compartmentId || null,
    status: rec.status || 'complete',
    text: rec.text || '',
    source: rec.source || 'api',
    prompt: rec.prompt || null,
    command: rec.command || null,
    chatUrl: rec.chatUrl || null,
    error: rec.error || null,
    synthesizedFrom: rec.synthesizedFrom || null,
    ts: Date.now(),
    // §BUILT 2026-09-22 — optional, additive; see emitToStream's own note.
    ...(rec.gaps !== undefined ? { gaps: rec.gaps } : {}),
    ...(rec.gapDrift !== undefined ? { gapDrift: rec.gapDrift } : {}),
    ...(rec.command !== undefined ? { command: rec.command } : {}),
    ...(rec.meta !== undefined ? { meta: rec.meta } : {}),
    ...(rec.codeArtifact !== undefined ? { codeArtifact: rec.codeArtifact } : {}),
  };

  const sinks = {};

  // SSE first — a client waiting on this job should see it at the
  // earliest honest moment, not after three disk and network writes.
  sinks.sse = emitToStream(record, { bus, done: rec.done !== false });

  sinks.ledger = writeLedger(record, { evLedger, jaa });

  // §0.39.246 — the node is written BEFORE the downloads post, so the
  // entry's savePath names a file that exists (it used to be posted first,
  // pointing at a file not yet written — or never, if the write failed).
  // It is then rewritten with the downloads result, so the honesty record
  // on the node still carries what every other sink really did.
  sinks.downloads = { ok: null, detail: 'pending' };
  const first = writeNode(record, sinks);
  sinks.downloads = first.ok
    ? await postToDownloads(record, { savePath: first.detail })
    : { ok: false, detail: `not posted: the .response file could not be written (${first.detail})` };
  const nodeResult = first.ok ? writeNode(record, sinks) : first;
  sinks.node = nodeResult;

  // Keep the live job in step, so the EXISTING return point (which reads
  // job.responseText first) sees this immediately without needing to
  // know this module exists.
  if (typeof updateJob === 'function') {
    try {
      updateJob(rec.jobId, {
        responseText: record.text, response: record.text,
        status: record.status === 'partial' ? 'dispatched' : record.status,
        completedAt: record.status === 'complete' ? Date.now() : undefined,
      });
    } catch (e) {
      console.warn(`[${MODULE_ID}] §1.2 updateJob failed for ${rec.jobId} (non-fatal — durable sinks already hold this response): ${e.message}`);
    }
  }

  const durable = sinks.node.ok || sinks.ledger.ok;
  if (!durable) {
    console.error(`[${MODULE_ID}] §1.2 NO DURABLE SINK accepted the response for job ${rec.jobId} — node: ${sinks.node.detail}; ledger: ${sinks.ledger.detail}. This response exists only in memory.`);
  }

  return { ok: durable, jobId: rec.jobId, status: record.status, chars: record.text.length, sinks };
}

// ── synthesize ───────────────────────────────────────────────────────────
/**
 * synthesize(jobId, deps) -> { ok, found, source, response, ... }
 *
 * Reconstructs a response from whichever sink still holds it, in
 * descending order of trustworthiness:
 *   1. the live job object      — freshest, but dies with the process
 *   2. the .response node       — durable, complete, uncapped
 *   3. the CFR ledger           — durable, but records the delivery, not
 *                                 necessarily the full text
 *   4. the JAA artifacts row    — durable, capped at 10k chars
 *   5. the staged intake drop   — a download that arrived for this job
 *
 * Returns found:false when nothing holds it. That is the honest answer
 * and the caller is expected to surface it as a real 404, never as an
 * empty successful response — which was the original bug.
 */
function synthesize(jobId, deps = {}) {
  const { jobs, jaa } = deps;

  // 1. live job
  try {
    const job = jobs && jobs.get ? jobs.get(jobId) : null;
    const text = job && (job.responseText || job.response || job.text);
    if (text) {
      return { ok: true, found: true, source: 'job', jobId, response: text,
        provider: job.provider || 'unknown', status: job.status || 'complete' };
    }
  } catch (_) {}

  // 2. the .response node — the durable primary
  const node = readNode(jobId);
  if (node && node.text) {
    return { ok: true, found: true, source: 'node', jobId, response: node.text,
      provider: node.provider, status: node.status, chars: node.chars, contentHash: node.contentHash };
  }

  // 3/4. JAA — artifacts row, then chat_log, both real tables already written
  try {
    if (jaa && typeof jaa.all === 'function') {
      const art = (jaa.all('artifacts') || []).filter(a => a.jobId === jobId)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      if (art && art.content) {
        return { ok: true, found: true, source: 'artifacts', jobId, response: art.content,
          provider: art.provider || 'unknown', status: 'complete',
          // Stated, not hidden: this copy is capped, so a caller
          // comparing lengths against a contentHash knows why.
          truncated: true };
      }
      const chat = (jaa.all('chat_log') || []).filter(c => c.jobId === jobId)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      if (chat && chat.response) {
        return { ok: true, found: true, source: 'chat_log', jobId, response: chat.response,
          provider: chat.provider || 'unknown', status: 'complete', truncated: true };
      }
    }
  } catch (_) {}

  // 5. a staged intake drop that carried this jobId
  try {
    const intake = require('../../lib/intake.js');
    const drop = intake.list().find(c => c.provenance && c.provenance.jobId === jobId);
    if (drop) {
      return { ok: true, found: true, source: 'intake', jobId,
        response: drop.summary || '', dropId: drop.dropId, status: 'complete',
        provider: (drop.provenance && drop.provenance.provider) || 'unknown',
        // An intake drop is a FILE that arrived for this job, not the
        // response text. Saying so plainly rather than passing a summary
        // off as the answer.
        note: 'reconstructed from a staged download, not from response text — see dropId for the real artifact' };
    }
  } catch (_) {}

  // 6. Clear Glass's downloads manager — a DIFFERENT real store than #2's
  // node (guardian/data/nodes/response/ vs clear-glass's own responses/
  // under its database-compartment root; both are real, independent
  // ".response" files, named the same because they hold the same shape
  // of thing, not because they're the same store). §BUILT 2026-09-22.
  try {
    // 0.39.239 — root from the index's own defaultRoot(), shared with its writer and readers.
    const { defaultRoot, findResponseByJobId } = require('../../clear-glass/src/downloads/artifact-chat-index.js');
    const found = findResponseByJobId(defaultRoot(), jobId);
    if (found && found.raw?.response) {
      return { ok: true, found: true, source: 'downloads', jobId,
        response: found.raw.response, provider: found.provider || 'unknown',
        status: 'complete', capturedAt: found.captured_at || null };
    }
  } catch (_) {}

  return { ok: false, found: false, jobId,
    error: `no response recorded for job ${jobId} in any sink (job, node, ledger, artifacts, chat_log, intake, downloads)` };
}

module.exports = {
  deliver, synthesize,
  writeNode, readNode, writeLedger, postToDownloads, emitToStream,
  NODES_DIR, DOWNLOADS_PENDING, MODULE_ID, VERSION, flushPendingDownloads,
};
