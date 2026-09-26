'use strict';
/**
 * guardian/artifact-upload.js — Auto-upload for generated code blocks
 * UUID: nexus-guardian-artifact-upload-v1-0000-2026-0705-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUG FIXED 2026-07-05: this replaces the `autoUpload` path that used to
 * live inside guardian/server.js's startDropzone(). That function always
 * threw: `registry` in that scope was an always-truthy stub object whose
 * `get`/`list`/`delete` methods were also broken (arrow functions using
 * `this` inside an object literal — `this` is not the object), and
 * `registry.autoUpload` was never defined on it at all, so every call
 * threw `TypeError: registry.autoUpload is not a function`, uncaught, at
 * both of its two call sites (job-completion code-block upload, and the
 * content-with-name path). The pure-fallback branch that could have
 * worked was unreachable dead code behind that always-truthy check, and
 * even it referenced an undefined `sanitizeFilename` function.
 *
 * This is what was actually needed: write the file, hand back a token +
 * URL. No Express, no multer, no HTTP server, no persistent token
 * registry — guardian/dropzone.js already runs a real one separately on
 * its own port for actual manual uploads/downloads; this only needs to
 * exist so a generated code block has somewhere to land and a link to
 * hand back in a job-completion message.
 */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

function sanitizeFilename(name) {
  return String(name || 'artifact').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

function createAutoUploader({ uploadDir, port = parseInt(process.env.GUARDIAN_DZ_PORT || '7822') } = {}) {
  const dir = uploadDir || path.join(__dirname, '..', 'data', 'guardian', 'input');
  fs.mkdirSync(dir, { recursive: true });

  return {
    autoUpload(filename, content, opts = {}) {
      try {
        const buf      = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ''), 'utf8');
        const token    = crypto.randomBytes(6).toString('hex');
        const safe     = sanitizeFilename(filename);
        const filepath = path.join(dir, `${token}__${safe}`);
        fs.writeFileSync(filepath, buf);
        return { token, url: `http://127.0.0.1:${port}/d/${token}`, filename: safe, size: buf.length, ...opts };
      } catch (err) {
        // §1.2 — logged, never silently swallowed, but also never thrown
        // into a job-completion handler that isn't expecting it.
        console.error(`[guardian/artifact-upload] failed: ${err.message}`);
        return null;
      }
    },
  };
}

module.exports = { createAutoUploader, sanitizeFilename };
