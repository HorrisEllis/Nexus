'use strict';
/**
 * lib/spec-container.js — nexus-system.spec container format: parse + verify
 * UUID: nexus-spec-container-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * One place that knows how to read a project-level .spec container (the
 * "spec IS the build" format: small meta header + buildSpec text +
 * base64-encoded archive, hash-verified). scripts/import-spec.js and
 * idearium/repo/watcher.js both need this exact logic — factored here so
 * neither duplicates it, per this session's own standing rule against
 * fragmentation.
 *
 * §1.2 — corrupt input fails loud, before anything gets written anywhere.
 * Verification happens before decode is trusted; nothing downstream of this
 * module should re-verify or assume verification already happened elsewhere.
 */

const fs     = require('fs');
const crypto = require('crypto');

const MODULE_ID = 'spec-container';
const VERSION   = '1.0.0';
const HEADER_BYTES = 8192; // header fields always come first — see spec-drift.js's own regex-only read

// ── Read just the header (name/version/hash/bytes) without touching the payload ─
function readHeader(specPath) {
  const fd = fs.openSync(specPath, 'r');
  const buf = Buffer.alloc(HEADER_BYTES);
  const bytesRead = fs.readSync(fd, buf, 0, HEADER_BYTES, 0);
  fs.closeSync(fd);
  const header = buf.slice(0, bytesRead).toString('utf8');

  const nameMatch    = header.match(/^\s+name:\s+['"]?([^\s'"#\n]+)['"]?/m);
  const versionMatch = header.match(/^\s+version:\s+['"]?([0-9]+\.[0-9]+\.[0-9][^\s'"#\n]*)['"]?/m);
  const hashMatch    = header.match(/^\s+archive_sha256:\s+['"]?([a-f0-9]{64})['"]?/m);
  const bytesMatch   = header.match(/^\s+archive_bytes:\s+(\d+)/m);
  const filesMatch   = header.match(/^\s+file_count:\s+(\d+)/m);

  if (!nameMatch || !versionMatch) {
    throw new Error('Could not parse name/version from header — is this a valid .spec file?');
  }
  return {
    name:           nameMatch[1],
    version:        versionMatch[1],
    archiveSha256:  hashMatch ? hashMatch[1] : null,
    archiveBytes:   bytesMatch ? parseInt(bytesMatch[1], 10) : null,
    fileCount:      filesMatch ? parseInt(filesMatch[1], 10) : null,
    isContainer:    !!hashMatch, // a module-level .spec (docs/*.spec) has no archive_sha256 at all
  };
}

// ── Extract a YAML block-scalar field's raw lines, given its marker ─────────────
// Used for both "archive: |" (base64) and "buildSpec: |" (plain text) —
// both are indented block literals in this format, same extraction shape.
function _extractBlock(content, markerLine) {
  const idx = content.indexOf(markerLine);
  if (idx === -1) return null;
  const after = content.slice(idx + markerLine.length);
  const lines = [];
  for (const line of after.split('\n')) {
    if (line.startsWith('    ')) { lines.push(line.slice(4)); continue; }
    if (line.trim() === '') { lines.push(''); continue; } // blank lines inside the block
    break; // dedent — block literal ended
  }
  // trailing blank lines the YAML block strips on its own — trim those back off
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// ── Full verify + decode — the one thing both consumers actually need ──────────
// Returns { name, version, buildSpec, archiveBuffer, hash, fileCount }.
// Throws on ANY integrity problem — never returns a partially-trusted result.
function verifyAndDecode(specPath) {
  const header = readHeader(specPath);
  if (!header.isContainer) {
    throw new Error(`No archive_sha256 in header — "${specPath}" has no verifiable archive, or is a module-level spec (no payload to import). Module specs (docs/*.spec) describe code, they don't contain it.`);
  }

  const content = fs.readFileSync(specPath, 'utf8');

  const archiveLines = _extractBlock(content, 'archive: |\n');
  if (!archiveLines) throw new Error('No "archive: |" block found — this .spec has no embedded payload.');
  const b64 = archiveLines.join('');
  const archiveBuffer = Buffer.from(b64, 'base64');

  if (header.archiveBytes && archiveBuffer.length !== header.archiveBytes) {
    throw new Error(`Decoded size mismatch: expected ${header.archiveBytes} bytes, got ${archiveBuffer.length}. Archive is corrupt or truncated — refusing to trust it.`);
  }

  const actualHash = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
  if (actualHash !== header.archiveSha256) {
    throw new Error(`SHA-256 MISMATCH.\n  expected: ${header.archiveSha256}\n  actual:   ${actualHash}\nArchive is corrupt — refusing to trust it (§1.2: corrupt input fails loud, not partially).`);
  }

  // buildSpec is optional — older containers or hand-built ones may omit it.
  const buildSpecLines = _extractBlock(content, 'buildSpec: |\n');
  const buildSpec = buildSpecLines ? buildSpecLines.join('\n') : null;

  return {
    name:          header.name,
    version:       header.version,
    fileCount:     header.fileCount,
    buildSpec,
    archiveBuffer,
    hash:          actualHash,
    verified:      true,
  };
}

module.exports = {
  readHeader, verifyAndDecode,
  MODULE_ID, VERSION,
};
