'use strict';
/**
 * engines/ui/routes/files.js — the in-panel file manager.
 *
 * Every path is resolved against NEXUS_ROOT and refused if it escapes.
 * The monolith did this with a string prefix check, which ../ defeats.
 */

const fs   = require('fs');
const path = require('path');
const { jsonR } = require('../lib/http');

const ROOT = process.env.NEXUS_ROOT || path.join(__dirname, '..', '..', '..');
const MAX_EDIT_BYTES = 2 * 1024 * 1024;

/** @returns {string|null} absolute path, or null if it escapes ROOT */
function safe(rel) {
  const abs = path.resolve(ROOT, String(rel || '').replace(/^[/\\]+/, ''));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

module.exports = () => ({

  'GET /ui/files': async (req, res, { query }) => {
    const rel = query.get('path') || 'sites';
    const abs = safe(rel);
    if (!abs) return jsonR(res, 403, { error: 'path escapes the platform root' });
    try {
      const entries = fs.readdirSync(abs, { withFileTypes: true }).map(d => {
        const full = path.join(abs, d.name);
        let size = 0;
        try { size = d.isFile() ? fs.statSync(full).size : 0; } catch {}
        return { name: d.name, type: d.isDirectory() ? 'dir' : 'file', size };
      }).sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
      return jsonR(res, 200, { path: rel, entries });
    } catch (e) {
      if (e.code === 'ENOENT') return jsonR(res, 404, { error: `no such directory: ${rel}` });
      return jsonR(res, 500, { error: e.message });
    }
  },

  'GET /ui/files/read': async (req, res, { query }) => {
    const rel = query.get('path');
    const abs = safe(rel);
    if (!abs) return jsonR(res, 403, { error: 'path escapes the platform root' });
    try {
      const st = fs.statSync(abs);
      if (!st.isFile()) return jsonR(res, 400, { error: 'not a file' });
      if (st.size > MAX_EDIT_BYTES) {
        return jsonR(res, 413, { error: `file is ${st.size} bytes — too large to edit in the panel` });
      }
      return jsonR(res, 200, { path: rel, content: fs.readFileSync(abs, 'utf8') });
    } catch (e) {
      if (e.code === 'ENOENT') return jsonR(res, 404, { error: `no such file: ${rel}` });
      return jsonR(res, 500, { error: e.message });
    }
  },

  'POST /ui/files/write': async (req, res, { body }) => {
    const abs = safe(body.path);
    if (!abs) return jsonR(res, 403, { error: 'path escapes the platform root' });
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const tmp = abs + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, String(body.content ?? ''));
      fs.renameSync(tmp, abs);
      return jsonR(res, 200, { ok: true, path: body.path });
    } catch (e) {
      return jsonR(res, 500, { error: e.message });
    }
  },
});
