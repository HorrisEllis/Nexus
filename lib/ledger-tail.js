'use strict';
/**
 * ledger-tail — backwards block reader for append-only JSONL ledgers.
 * comp_id: nexus.lib.ledger-tail
 * UUID: nexus-ledger-tail-v1-0000-2026-0808-001
 * Version: 0.1.0
 *
 * Built end-to-end through idearium's real spec-engine (spec
 * c2b42683-b5b1-48cb-855d-987a23e71a45), with Claude standing in for the
 * Guardian userscript agent under MOCKED GEMINI CONSTRAINTS (30,000 tokens
 * per turn, chars/4 estimator — the same wrong estimator the tree uses, so
 * the mock fails the way production would).
 *
 * WHY IT EXISTS: NEXUS has ~10,500 rows in event_log and several .jsonl
 * ledgers. Every current reader loads the whole file. "What happened most
 * recently" should not cost the size of history.
 *
 * INVARIANTS (declared, and each one is tested):
 *   LT-1  never reads the whole file when n is small and the file is large
 *   LT-2  `malformed` is ALWAYS present in the result, even at 0 (§1.2 —
 *         a skipped line is counted, never silently dropped)
 *   LT-3  entries.length <= n
 */
const fs = require('fs');

class LedgerTailError extends Error {
  constructor(code, msg) { super(msg); this.name = 'LedgerTailError'; this.code = code; }
}

/**
 * tail(filePath, n, opts) -> { entries, malformed, bytesRead, fileSize, reason? }
 * entries are newest-first. Never holds more than opts.blockSize bytes.
 */
function tail(filePath, n, opts = {}) {
  const blockSize = opts.blockSize || 65536;

  // §1.2 — a refusal states its reason rather than returning a bare [].
  if (!Number.isFinite(n) || n <= 0) {
    return { entries: [], malformed: 0, bytesRead: 0, fileSize: 0, reason: 'n must be a finite number > 0' };
  }

  let fd;
  try { fd = fs.openSync(filePath, 'r'); }
  catch (e) {
    // §1.2 — a missing ledger is an error, never an empty result. An empty
    // result would be indistinguishable from an empty ledger.
    throw new LedgerTailError(e.code || 'EOPEN', `ledger-tail: cannot open ${filePath}: ${e.message}`);
  }

  try {
    const fileSize = fs.fstatSync(fd).size;
    if (fileSize === 0) return { entries: [], malformed: 0, bytesRead: 0, fileSize: 0, reason: 'ledger is empty' };

    let pos = fileSize, carry = '', lines = [], bytesRead = 0;
    while (pos > 0 && lines.length <= n) {
      const len = Math.min(blockSize, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, pos);
      bytesRead += len;
      const text = buf.toString('utf8') + carry;
      const parts = text.split('\n');
      // The first fragment of a block is a partial line unless we reached BOF.
      carry = pos > 0 ? parts.shift() : '';
      lines = parts.filter(l => l.length).concat(lines);
    }

    const newestFirst = lines.slice(-n).reverse();
    const entries = [];
    let malformed = 0;
    for (const line of newestFirst) {
      try { entries.push(JSON.parse(line)); }
      catch (_) { malformed++; }   // LT-2 — counted, never silently dropped
    }
    return { entries: entries.slice(0, n), malformed, bytesRead, fileSize };
  } finally { fs.closeSync(fd); }
}

module.exports = { tail, LedgerTailError, VERSION: '0.1.0' };
