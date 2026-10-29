'use strict';
/**
 * lib/versionium-record.js — every change and every version, recorded in Versionium in full (§17.12, VE1, 0.60.278)
 * component_id: nexus.lib.versionium-record
 *
 * James, 2026-10-29: "can you add that to claude. full changes, and versions have to be pushed to versionium? enforce it everywhere that
 * you'd find it. maybe the axioms"
 * Map: docs/2026-10-29-versionium-everywhere-phasemap.spec (VE1).
 *
 * The one way a place that makes a change or a version records it. It reaches Versionium only through its contract,
 * POST /api/versionium/commit (§5.15). The transport is lib/nexus-client.js postDurable: when Versionium is down the record waits in
 * nexus-client's disk buffer and drainBuffer() delivers it later. It is never dropped and never blocks the change (§5.15 rule 3, §0.3).
 *
 *   record({ kind, system, message, change, causedBy, by, version }) → Promise<{ ok, buffered, commitId?, error? }>
 *       kind      'nexus-self.apply' | 'nexus-self.rollback' | 'nexus-self.apply.failed' | 'nexus.update' | …
 *       branch    nexus.<kind's first word> (nexus.nexus-self, nexus.update)  · system  'nexus' or 'nexus.<system>'
 *       state     { kind, by, at, version, change }   — the whole change (fullChange below)
 *   fullChange(items, { readBlob, cap }) → [{ path, op, before, after, beforeText?, afterText?, note? }]
 *       each path before → after; the text of both when both are UTF-8 text within cap (256 KB); else the sha256s and where the bytes
 *       are, said in note (VE_D2)
 *   objectChange(before, after) → [{ key, before, after, note? }]   which keys changed; any secret (password, token, key, cookie …) redacted
 *   settingsRecorder({ kind, system, label }) → (before, after) => void   one record per burst of saves (Clear Glass settings, 0.60.279)
 *   pending() → nexus-client's pending({ systemId: 'versionium' })
 */
const CAP = 256 * 1024;

function _isTest() { try { return require('./test-sandbox.js').isTestProcess(); } catch (_) { return !!(process.env.NEXUS_TEST_SANDBOX || process.env.NEXUS_TEST_RUN_DEPTH); } }
function _version() { try { delete require.cache[require.resolve('./version.js')]; return require('./version.js').system || null; } catch (_) { return null; } }

function _text(buf, cap) {
  if (buf == null) return { text: null };
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf));
  if (b.length > cap) return { why: `${b.length} bytes, over the ${cap}-byte cap` };
  if (b.includes(0)) return { why: 'binary' };
  const t = b.toString('utf8');
  if (Buffer.from(t, 'utf8').length !== b.length) return { why: 'not UTF-8 text' };
  return { text: t };
}

function fullChange(items = [], { readBlob = null, cap = CAP, where = 'the nexus-self blob store' } = {}) {
  return items.map((it) => {
    const out = { path: it.path, op: it.op || (it.after ? (it.before ? 'modify' : 'add') : 'delete'), before: it.before || null, after: it.after || null };
    if (!readBlob) return { ...out, note: `content by sha256 in ${where}` };
    let b = null, a = null;
    try { b = it.before ? _text(readBlob(it.before), cap) : { text: null }; } catch (e) { b = { why: `before unreadable (${e.message})` }; }
    try { a = it.after ? _text(readBlob(it.after), cap) : { text: null }; } catch (e) { a = { why: `after unreadable (${e.message})` }; }
    if (b.why || a.why) return { ...out, note: `content by sha256 in ${where}: ${[b.why && `before ${b.why}`, a.why && `after ${a.why}`].filter(Boolean).join('; ')}` };
    return { ...out, beforeText: b.text, afterText: a.text };
  });
}

async function record({ kind, system = null, message, change = null, causedBy = null, by = null, version = undefined } = {}) {
  if (!kind || !message) return { ok: false, error: 'record needs kind and message' };
  // 0.60.279 — a test process never writes into a real Versionium (the sandbox remaps data folders, not ports): skipped and said, unless the
  // test points at its own Versionium and opts in (NEXUS_VERSIONIUM_RECORD_IN_TESTS=1). Found the release after VE1 shipped without it.
  if (_isTest() && process.env.NEXUS_VERSIONIUM_RECORD_IN_TESTS !== '1') return { ok: true, skipped: 'a test process: not sent to a real Versionium' };
  const body = {
    message: String(message).slice(0, 500),
    branch: `nexus.${String(kind).split('.')[0]}`,
    system: system ? `nexus.${system}` : 'nexus',
    causedBy: causedBy || kind,
    state: { kind, by, at: Date.now(), version: version === undefined ? _version() : version, change },
  };
  try {
    const r = await require('./nexus-client.js').postDurable('versionium', '/api/versionium/commit', body, { timeout: 15000 });
    if (r.buffered) return { ok: true, buffered: true, error: r.error };
    const c = r.result && r.result.commit;
    return { ok: !!(r.ok && (!r.result || r.result.ok !== false)), buffered: false, commitId: c ? c.commitId : null, ...(r.result && r.result.ok === false ? { error: r.result.error } : {}) };
  } catch (e) { return { ok: false, buffered: false, error: e.message }; }   // a real refusal from Versionium: said to the caller
}

// 0.60.279 VE6 — settings changes: which keys changed, before → after, any secret redacted (a password never goes into a version history)
const SECRET = /(pass(word)?|secret|token|api[_-]?key|apikey|cookie|credential|private[_-]?key|auth|session[_-]?id|bearer)/i;
function _redact(v, key = '') {
  if (SECRET.test(key)) return v == null ? v : '[redacted]';
  if (Array.isArray(v)) return v.map(x => _redact(x));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = _redact(x, k); return o; }
  return v;
}
/** objectChange(before, after) → [{ key, before, after }] for each top-level key whose value changed; secrets redacted, said */
function objectChange(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out = [];
  for (const k of keys) {
    const b = before ? before[k] : undefined, a = after ? after[k] : undefined;
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const secret = SECRET.test(k) || JSON.stringify(_redact(b, '')) !== JSON.stringify(b) || JSON.stringify(_redact(a, '')) !== JSON.stringify(a);
    out.push({ key: k, before: b === undefined ? null : _redact(b, k), after: a === undefined ? null : _redact(a, k), ...(secret ? { note: 'secrets redacted' } : {}) });
  }
  return out;
}

/** settingsRecorder({ kind, system, label, wait }) → (before, after) => void — one record per burst of saves (wait ms, default 2 s) */
function settingsRecorder({ kind, system, label, wait = 2000 } = {}) {
  let first = null, last = null, timer = null;
  return (before, after) => {
    if (first === null) first = JSON.parse(JSON.stringify(before || {}));
    last = JSON.parse(JSON.stringify(after || {}));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const change = objectChange(first, last); first = null;
      if (!change.length) return;
      record({ kind, system, message: `${label}: ${change.map(c => c.key).slice(0, 8).join(', ')}${change.length > 8 ? ` (+${change.length - 8})` : ''} changed`, change: { keys: change } }).catch(() => {});
    }, wait);
    if (timer.unref) timer.unref();
  };
}

function pending() { return require('./nexus-client.js').pending({ systemId: 'versionium' }); }

module.exports = { record, fullChange, objectChange, settingsRecorder, pending, CAP, MODULE_ID: 'nexus.lib.versionium-record' };
