/**
 * ui/lib/repo-ingest.js — shared client-side repo-ingest helpers
 *
 * §EXTRACTED 2026-09-03 — idearium/ui/js/app.js already has this exact
 * logic inline (wireRepoDropzone/ingestDroppedFiles, lines ~1239-1260),
 * scoped to "attach files to the currently open idea." Duplicating that
 * inline into a second page would violate the one thing James named
 * explicitly for this work ("nothing should be inline") and DECOMP.md's
 * own law ("never inline what belongs in a module"). This file is that
 * module — both app.js and ui/import-project/ can use it. app.js itself
 * is NOT modified here (existing production file, out of scope unless
 * asked) — only referenced as the pattern this generalizes.
 *
 * Two real ingest paths, matching two real, distinct backend routes:
 *   - flat files (no archive)  -> POST /api/repos          (repo.ingest)
 *   - a .zip archive           -> POST /api/repos/import    (repo.import-archive)
 * Never POST a zip's raw bytes to /api/repos — that route has no archive
 * handling and would ingest one opaque, unreadable "file."
 *
 * Depends on ui/lib/api.js's post() already being loaded first.
 */

const REPO_INGEST_MAX_FILES = 60; // mirrors lib/project-compartment.js's MAX_FILES — client-side pre-check only, server re-enforces its own bound regardless

/**
 * ingestFlatFiles(fileList, opts) — dropped/selected files with no archive.
 * fileList: a FileList or File[] (e.g. from a drop event's dataTransfer.files).
 * opts: { name?, ideaUuid? }
 * Returns: the parsed JSON response from POST /api/repos, or null on failure
 *          (matches api.js's post()'s own fail-soft contract).
 */
async function ingestFlatFiles(fileList, opts = {}) {
  const files = Array.from(fileList).slice(0, REPO_INGEST_MAX_FILES);
  if (!files.length) return { error: 'no files' };

  let payload;
  try {
    payload = await Promise.all(files.map(f => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve({ path: f.name, bytes: f.size, content: r.result });
      r.onerror = reject;
      r.readAsText(f);
    })));
  } catch (e) {
    return { error: `file read failed: ${e.message}` };
  }

  const name = opts.name || (files.length === 1
    ? files[0].name.replace(/\.[^/.]+$/, '')
    : `import-${Date.now()}`);

  return post('/api/repos', { name, files: payload, source: 'drop', ideaUuid: opts.ideaUuid || null });
}

/**
 * ingestZipFile(file, opts) — a single .zip archive.
 * file: a File object (dropped or picked). Must be .zip — this function
 *   does not attempt client-side extraction; the server does it once,
 *   the same way for every caller (see idearium/api/index.js's
 *   repo.import-archive handler for why: bounds enforced in one place).
 * opts: { name?, ideaUuid? }
 * Returns: the parsed JSON response from POST /api/repos/import, or an
 *          { error } object — never throws.
 */
async function ingestZipFile(file, opts = {}) {
  if (!/\.zip$/i.test(file.name)) return { error: `not a .zip: ${file.name}` };

  let contentBase64;
  try {
    contentBase64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result.split(',')[1] || ''); // strip "data:...;base64," prefix
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  } catch (e) {
    return { error: `file read failed: ${e.message}` };
  }
  if (!contentBase64) return { error: 'empty file' };

  const name = opts.name || file.name.replace(/\.zip$/i, '');
  return post('/api/repos/import', { name, filename: file.name, contentBase64, ideaUuid: opts.ideaUuid || null });
}

/**
 * ingestDrop(fileOrFiles, opts) — routes by extension so callers don't
 * have to branch themselves. Accepts a single File, a File[], or a
 * FileList (drag-drop of a mix of a zip and loose files is NOT
 * supported in one call — a drop is either one zip or a set of flat
 * files, matching the two real backend contracts; mixed drops resolve
 * to whichever the FIRST file implies and ignore the rest, reported in
 * the return value so the caller can tell the user, not fail silently).
 */
async function ingestDrop(fileOrFiles, opts = {}) {
  const arr = fileOrFiles instanceof FileList ? Array.from(fileOrFiles)
            : Array.isArray(fileOrFiles) ? fileOrFiles
            : [fileOrFiles];
  if (!arr.length) return { error: 'no files' };

  if (arr.length === 1 && /\.zip$/i.test(arr[0].name)) {
    return ingestZipFile(arr[0], opts);
  }
  const zips = arr.filter(f => /\.zip$/i.test(f.name));
  if (zips.length && arr.length > 1) {
    return { error: `mixed drop: ${zips.length} zip(s) + ${arr.length - zips.length} flat file(s) in one drop — drop a single .zip, or flat files with no archive, not both` };
  }
  return ingestFlatFiles(arr, opts);
}

/**
 * wireDropzone(el, onResult, opts) — attaches drag/drop handlers to el.
 * onResult(result) fires once per drop with ingestDrop()'s return value.
 * Does not touch el's contents or styling beyond a drag-over outline —
 * the caller's CSS owns the rest (see ui/import-project/import-project.css).
 */
function wireDropzone(el, onResult, opts = {}) {
  if (!el) return;
  ['dragover', 'dragenter'].forEach(ev => el.addEventListener(ev, e => {
    e.preventDefault(); el.classList.add('dz-active');
  }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, e => {
    e.preventDefault(); el.classList.remove('dz-active');
  }));
  el.addEventListener('drop', async e => {
    if (!e.dataTransfer?.files?.length) return;
    const result = await ingestDrop(e.dataTransfer.files, opts);
    onResult(result);
  });
}
