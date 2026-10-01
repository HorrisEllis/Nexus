/**
 * idearium/lib/spec-library-import.js — James's spec library into Idearium: each unique document an idea, its text a
 * spec split into its own sections, the original bytes kept. Master phasemap IL1 (0.39.290).
 *
 * James, 2026-10-01: "my goal is to build these, eventually. im, the idea guy" · "lets fucking do it. need a way to
 * import these and convert them."
 *
 * importLibrary({ buf, name, dryRun, se, os }) -> report
 *   - lib/spec-library.js scans the zip (duplicates folded, zips inside opened, programs refused, families sorted)
 *   - the uploaded zip is kept whole, by its hash, under the idearium data root (spec-library/_uploads) — §0.3: the
 *     originals are never lost, whatever the conversion does
 *   - spec · docx · project → an idea (tags: spec-library, family, kind) with its spec (importSpec, sections by the
 *     document's own headings, byte fidelity checked); pdf · page · diagram · schema · code · image → kept in the
 *     library, no idea of their own
 *   - one row per document in the jaa table idearium_spec_library (the library's index) — importing again adds only
 *     what is new; a document already there gains the new paths, nothing else
 * Local only: nothing here talks to a network, and data/ is never committed.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { loadTable, appendRow, syncTable } from './db.js';

const _require = createRequire(import.meta.url);
const SL = _require('../../lib/spec-library.js');
const TABLE = 'idearium_spec_library';
const IDEA_KINDS = new Set(['spec', 'docx', 'project']);

function libraryDir() { return _require('./data-dir.cjs').resolveIdeariumPath('data/spec-library'); }
function safeName(s) { return String(s || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file'; }

export function listLibrary({ family = null, kind = null } = {}) {
  return loadTable(TABLE).filter(r => (!family || r.family === family) && (!kind || r.kind === kind));
}

export async function importLibrary({ buf, name = 'specs.zip', dryRun = false, se, os, yieldEvery = 10 } = {}) {
  const scan = SL.scan({ buf, name });
  if (!scan.ok) return { ok: false, error: scan.error };
  const known = new Map(loadTable(TABLE).map(r => [r.sha, r]));
  const report = { ok: true, dryRun, upload: null, stats: scan.stats, skipped: scan.skipped, added: [], merged: [], failed: [] };

  if (!dryRun) {
    const upSha = crypto.createHash('sha256').update(buf).digest('hex');
    const upDir = path.join(libraryDir(), '_uploads');
    fs.mkdirSync(upDir, { recursive: true });
    const up = path.join(upDir, `${upSha.slice(0, 16)}.zip`);
    if (!fs.existsSync(up)) fs.writeFileSync(up, buf);
    report.upload = { sha: upSha, path: up, bytes: buf.length, name };
  }

  let n = 0;
  for (const doc of scan.docs) {
    if (++n % yieldEvery === 0) await new Promise(r => setImmediate(r));
    const prev = known.get(doc.sha);
    if (prev) {
      const paths = [...new Set([...(prev.paths || []), ...doc.paths])];
      if (paths.length !== (prev.paths || []).length) {
        report.merged.push({ sha: doc.sha, title: prev.title, newPaths: paths.length - (prev.paths || []).length });
        if (!dryRun) syncTable(TABLE, [{ ...prev, paths, updatedAt: Date.now() }]);
      }
      continue;
    }
    const conv = SL.convert(doc);
    const row = {
      uuid: doc.sha, sha: doc.sha, title: doc.title, version: doc.version || null, summary: doc.summary || null,
      family: doc.family, kind: doc.kind, ext: doc.ext, bytes: doc.bytes, paths: doc.paths, files: doc.files || null,
      textFrom: doc.textFrom, dialect: conv.dialect, ideaUuid: null, specUuid: null, sections: 0, fidelity: null,
      original: null, upload: report.upload ? report.upload.sha : null, importedAt: Date.now(), source: 'spec-library',
    };
    if (dryRun) { report.added.push(row); continue; }
    try {
      if (doc.buffer) {
        const dir = path.join(libraryDir(), doc.sha.slice(0, 16));
        fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, safeName(doc.name));
        fs.writeFileSync(p, doc.buffer);
        row.original = p;
      }
      if (IDEA_KINDS.has(doc.kind)) {
        if (conv.specText && se && typeof se.importSpec === 'function') {
          const r = se.importSpec({ name: doc.title, specText: conv.specText, author: 'spec-library', bannerRe: conv.bannerRe,
            type: doc.family === 'product' ? 'system' : 'document', description: `from James's spec library: ${doc.paths[0]}` });
          row.specUuid = r.manifest.uuid; row.sections = r.sectionsFilled.length; row.fidelity = !!(r.byteFidelity && r.byteFidelity.verified);
        }
        if (os) {
          const text = `${doc.title}${doc.version ? ` v${doc.version}` : ''}${doc.summary ? ` — ${doc.summary}` : ''}`.slice(0, 400);
          os.emit('idearium.idea.create', { text, tags: ['spec-library', doc.family, doc.kind], source: 'spec-library' });
          const idea = os.db && os.db.ideas ? [...os.db.ideas].reverse().find(i => i.source === 'spec-library' && i.text === text.trim()) : null;
          if (idea) {
            row.ideaUuid = idea.uuid;
            if (row.specUuid) os.emit('idearium.idea.update', { uuid: idea.uuid, fields: { linkedSpec: row.specUuid } });
          }
        }
      }
      appendRow(TABLE, row);
      report.added.push(row);
    } catch (e) {
      report.failed.push({ sha: doc.sha, title: doc.title, path: doc.paths[0], error: e.message });
    }
  }
  report.summary = {
    added: report.added.length, merged: report.merged.length, failed: report.failed.length, skipped: report.skipped.length,
    ideas: report.added.filter(r => r.ideaUuid).length, specs: report.added.filter(r => r.specUuid).length,
    byFamily: report.added.reduce((m, r) => { m[r.family] = (m[r.family] || 0) + 1; return m; }, {}),
  };
  return report;
}

export default { importLibrary, listLibrary };
