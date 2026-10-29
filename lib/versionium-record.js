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
 *   pending() → nexus-client's pending({ systemId: 'versionium' })
 */
const CAP = 256 * 1024;

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

function pending() { return require('./nexus-client.js').pending({ systemId: 'versionium' }); }

module.exports = { record, fullChange, pending, CAP, MODULE_ID: 'nexus.lib.versionium-record' };
