/**
 * idearium/repo/watcher.js — Drop-directory listener for repo intake
 * UUID: idearium-repo-watch-v001-000000000001
 *
 * Watches data/drop/ for .zip files. When one lands:
 *   1. extract to a temp tree
 *   2. read the file list (+ the canonical .spec if present)
 *   3. RepoLayer.ingest() -> becomes a tracked idea + spec + repo record
 *   4. emit repo.ingested so the UI / cortex sees it
 *
 * This is the "drag and drop new zips" half. Pairs with lib/file-push.js
 * (single files) — this handles whole-project zips as forkable repos.
 *
 * Flexible: uses adm-zip if present (already a dependency seen in the tree),
 * falls back to the system `unzip` binary, falls back to recording the zip as
 * an opaque repo if neither is available. Never throws on a bad drop (§1.2).
 *
 * §M1 init(cfg) + stop(). Debounced so editor/copy multi-writes fire once.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export class RepoWatcher {
  constructor({ repoLayer, dropDir, onEvent } = {}) {
    this.repoLayer = repoLayer;
    this.dropDir   = dropDir || path.join(__dirname, '..', 'data', 'drop');
    this.onEvent   = onEvent || (() => {});
    this._watcher  = null;
    this._debounce = new Map();
  }

  init() {
    fs.mkdirSync(this.dropDir, { recursive: true });
    this._watcher = fs.watch(this.dropDir, (evt, filename) => {
      if (!filename || !filename.toLowerCase().endsWith('.zip')) return;
      const full = path.join(this.dropDir, filename);
      clearTimeout(this._debounce.get(full));
      this._debounce.set(full, setTimeout(() => {
        this._debounce.delete(full);
        if (fs.existsSync(full)) this._handleZip(full);
      }, 600));   // debounce: wait for the copy to finish
    });
    console.log(`[idearium/repo] watching ${this.dropDir} for dropped zips`);
    return this;
  }

  _handleZip(zipPath) {
    const name = path.basename(zipPath, '.zip');
    try {
      const files = this._extractFileList(zipPath);
      const result = this.repoLayer.ingest({ name, files, source: 'drop' });
      if (result.error) throw new Error(result.error);
      this.onEvent({ type: 'repo.ingested', name, repoUuid: result.repo.uuid,
        fileCount: files.length, specUuid: result.specUuid });
      console.log(`[idearium/repo] ingested '${name}' → ${result.repo.uuid} (${files.length} files)`);
    } catch (e) {
      // §1.2 — loud, never silent, never throws up the stack
      this.onEvent({ type: 'repo.ingest.failed', name, error: e.message });
      console.error(`[idearium/repo] §1.2 ingest failed for '${name}': ${e.message}`);
    }
  }

  // returns [{ path, bytes, content? }] — content only for the .spec (kept small)
  _extractFileList(zipPath) {
    // try adm-zip
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipPath);
      return zip.getEntries().filter(e => !e.isDirectory).map(e => {
        const isSpec = /\.spec(\.md)?$/i.test(e.entryName);
        return { path: e.entryName, bytes: e.header.size,
                 content: isSpec ? zip.readAsText(e) : undefined };
      });
    } catch (_) { /* fall through */ }
    // fallback: system unzip -l for the list (no content)
    try {
      const out = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
      return out.split('\n').filter(Boolean).filter(p => !p.endsWith('/'))
        .map(p => ({ path: p, bytes: 0 }));
    } catch (_) { /* fall through */ }
    // last resort: opaque single-entry repo (never lose the drop, §7.4)
    return [{ path: path.basename(zipPath), bytes: fs.statSync(zipPath).size }];
  }

  stop() {
    if (this._watcher) { this._watcher.close(); this._watcher = null; }
    for (const t of this._debounce.values()) clearTimeout(t);
    this._debounce.clear();
  }
}


