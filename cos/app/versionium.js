'use strict';
/**
 * cos/app/versionium.js — the COS app's record in Versionium: every install, remove, switch and rollback (COSA14, VE7, 0.60.279)
 *
 * James, 2026-10-29: "full changes, and versions have to be pushed to versionium? enforce it everywhere that you'd find it." · "yes, clear
 * glass macros and settings too." (§17.12). COSA14 asked for this in 2026-10-15 and was still open.
 *
 * Why its own small recorder, not lib/versionium-record.js: the exe ships only its own files (scripts/build-cos-app.js FILES). lib's
 * nexus-client and config are not in it, and it must run with no Nexus at all. So it uses the same contract, POST /api/versionium/commit on
 * Versionium's port (VERSIONIUM_PORT, default 3754), and keeps its own outbox in COS's store root. A record made while Versionium is down
 * waits there and is replayed on the next record and when the controller starts. It is never dropped, and never blocks the act (§5.15
 * rule 3, §0.3).
 *
 *   record(root, { op, project, version, from, to, outcome, reason, sha256, detail }) → Promise<{ ok, queued?, commitId? }>
 *   drain(root)   → Promise<{ sent, left }>
 *   pending(root) → { count, oldest }
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = () => parseInt(process.env.VERSIONIUM_PORT || '3754', 10);
const OUTBOX = (root) => path.join(root, 'versionium-outbox.ndjson');

function _post(body, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: PORT(), path: '/api/versionium/commit', method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) {} resolve(res.statusCode < 300 && j && j.ok !== false ? { ok: true, commitId: j.commit && j.commit.commitId } : { ok: false, refused: true, error: (j && j.error) || `HTTP ${res.statusCode}` }); });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message })); req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timed out' }); });
    req.write(data); req.end();
  });
}

function _body({ op, project, version = null, from = null, to = null, outcome = 'ok', reason = null, sha256 = null, detail = null }) {
  const what = { install: `installed ${project} ${version}`, remove: `removed ${project} ${version}`, switch: `switched ${project} ${from || 'none'} → ${to}`, rollback: `rolled ${project} back ${from || '?'} → ${to || '?'}` }[op] || `${op} ${project}`;
  return { message: `COS: ${what}${outcome !== 'ok' ? ` (${outcome})` : ''}`, branch: 'cos.app', system: 'cos.app', causedBy: `cos.app.${op}`,
    state: { kind: `cos.app.${op}`, at: Date.now(), project, version: version || to || null, change: { op, project, version, from, to, outcome, reason, sha256, detail } } };
}

async function drain(root) {
  let lines = []; try { lines = fs.readFileSync(OUTBOX(root), 'utf8').split('\n').filter(Boolean); } catch (_) { return { sent: 0, left: 0 }; }
  const left = []; let sent = 0;
  for (let i = 0; i < lines.length; i++) {
    let b; try { b = JSON.parse(lines[i]); } catch (_) { continue; }
    const r = await _post(b);
    if (r.ok || r.refused) { sent += r.ok ? 1 : 0; continue; }   // a refusal is Versionium's answer, not a lost write
    left.push(...lines.slice(i)); break;                          // still down: keep the rest, in order
  }
  try { if (left.length) fs.writeFileSync(OUTBOX(root), left.join('\n') + '\n'); else fs.rmSync(OUTBOX(root), { force: true }); } catch (_) {}
  return { sent, left: left.length };
}

async function record(root, entry) {
  // a test process never writes into a real Versionium: skipped and said, unless the test opts in (and points VERSIONIUM_PORT at its own)
  if ((process.env.NEXUS_TEST_SANDBOX || process.env.NEXUS_TEST_RUN_DEPTH) && process.env.NEXUS_VERSIONIUM_RECORD_IN_TESTS !== '1') return { ok: true, skipped: 'a test process: not sent to a real Versionium' };
  const body = _body(entry);
  try { const d = await drain(root); if (d.left) { fs.mkdirSync(root, { recursive: true }); fs.appendFileSync(OUTBOX(root), JSON.stringify(body) + '\n'); return { ok: true, queued: true }; } } catch (_) {}
  const r = await _post(body);
  if (r.ok) return { ok: true, commitId: r.commitId };
  if (r.refused) return { ok: false, error: r.error };
  try { fs.mkdirSync(root, { recursive: true }); fs.appendFileSync(OUTBOX(root), JSON.stringify(body) + '\n'); return { ok: true, queued: true, error: r.error }; }
  catch (e) { return { ok: false, error: `not recorded and not queued: ${e.message}` }; }
}

function pending(root) {
  let lines = []; try { lines = fs.readFileSync(OUTBOX(root), 'utf8').split('\n').filter(Boolean); } catch (_) {}
  let oldest = null; try { oldest = lines.length ? JSON.parse(lines[0]).state.at : null; } catch (_) {}
  return { count: lines.length, oldest };
}

module.exports = { record, drain, pending, MODULE_ID: 'cos.app.versionium' };
