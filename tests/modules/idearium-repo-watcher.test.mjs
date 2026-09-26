// tests/modules/idearium-repo-watcher.test.mjs
// UUID: test-idearium-repo-watcher-v1-0000-4000-0000-000000000001
//
// Real end-to-end test of RepoWatcher's .spec-container handling: builds a
// small, real, hash-correct container (using adm-zip + spec-container.js's
// own format — not a hand-faked buffer) and a deliberately corrupted one,
// drops both into a temp watch dir, and confirms the watcher's actual fs.watch
// + debounce + ingest pipeline does the right thing for each. .mjs because
// idearium/ is "type":"module" — this runs as its own process via
// tests/modules/run-all.js's spawn('node', [file]), which works for any
// extension Node recognizes, ESM included. Registered in run-all.js's
// SUITES.

import { RepoWatcher } from '../../idearium/repo/watcher.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

let passed = 0, failed = 0;
function ok(id, desc, cond) {
  if (cond) { console.log(`  ✓ ${id} ${desc}`); passed++; }
  else { console.error(`  ✗ ${id} ${desc}`); failed++; }
}

const TMP_DROP = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-watcher-drop-'));

// Build a real zip (via adm-zip) so the archive payload is a genuine,
// listable zip — not a fake buffer. Then wrap it in the real container
// format spec-container.js parses.
function buildRealContainer({ name, corrupt = false }) {
  const zip = new AdmZip();
  zip.addFile('README.md', Buffer.from('# fixture repo\n'));
  zip.addFile('src/index.js', Buffer.from('console.log("hi");\n'));
  const archiveBuffer = zip.toBuffer();
  const realHash = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
  const hash = corrupt ? realHash.replace(/^./, realHash[0] === 'a' ? 'b' : 'a') : realHash;
  const b64 = archiveBuffer.toString('base64');
  const b64Lines = [];
  for (let i = 0; i < b64.length; i += 60) b64Lines.push('    ' + b64.slice(i, i + 60));

  const content = `spec:\n\n  meta:\n    name:        ${name}\n    version:     1.0.0\n    archive_sha256: ${hash}\n    archive_bytes:  ${archiveBuffer.length}\n    file_count:     2\n\n  buildSpec: |\n    # ${name}\n    Fixture build spec.\n\n  archive: |\n${b64Lines.join('\n')}\n`;
  return content;
}

async function waitFor(fn, timeoutMs = 3000, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, stepMs));
  }
  return false;
}

async function run() {
  // ── Test 1: valid .spec drop gets ingested with correct shape ─────────────
  {
    const calls = [];
    const events = [];
    const fakeRepoLayer = { ingest: (args) => { calls.push(args); return { repo: { uuid: 'u1' }, ideaUuid: 'i1', specUuid: 's1' }; } };
    const watcher = new RepoWatcher({ repoLayer: fakeRepoLayer, dropDir: TMP_DROP, onEvent: e => events.push(e) });
    watcher.init();

    fs.writeFileSync(path.join(TMP_DROP, 'valid-fixture.spec'), buildRealContainer({ name: 'valid-fixture' }));
    await waitFor(() => calls.length > 0);
    watcher.stop();

    ok('IRW-01', 'valid .spec drop triggers ingest() exactly once', calls.length === 1);
    ok('IRW-02', 'ingest() called with source: spec-import', calls[0]?.source === 'spec-import');
    ok('IRW-03', 'ingest() received both files from the real zip (README.md, src/index.js)',
      calls[0]?.files?.length === 2 && calls[0].files.some(f => f.path === 'src/index.js'));
    ok('IRW-04', 'ingest() received the container\'s buildSpec as specText, not a random in-tree .spec',
      calls[0]?.specText?.includes('Fixture build spec.'));
    ok('IRW-05', 'repo.ingested event emitted with the right name', events.some(e => e.type === 'repo.ingested' && e.name === 'valid-fixture'));
  }

  // ── Test 2: corrupted hash drop is REFUSED, never reaches ingest() ────────
  {
    const calls = [];
    const events = [];
    const fakeRepoLayer = { ingest: (args) => { calls.push(args); return { repo: { uuid: 'u2' } }; } };
    const watcher = new RepoWatcher({ repoLayer: fakeRepoLayer, dropDir: TMP_DROP, onEvent: e => events.push(e) });
    watcher.init();

    fs.writeFileSync(path.join(TMP_DROP, 'corrupt-fixture.spec'), buildRealContainer({ name: 'corrupt-fixture', corrupt: true }));
    await waitFor(() => events.some(e => e.type === 'repo.ingest.failed'));
    watcher.stop();

    ok('IRW-06', 'corrupted .spec NEVER calls ingest() — verify failure stops it before that point', calls.length === 0);
    ok('IRW-07', 'repo.ingest.failed event emitted with a hash-mismatch error', events.some(e => e.type === 'repo.ingest.failed' && /MISMATCH/.test(e.error)));
  }

  // ── Test 3: plain .zip drops still work exactly as before (no regression) ─
  {
    const calls = [];
    const fakeRepoLayer = { ingest: (args) => { calls.push(args); return { repo: { uuid: 'u3' } }; } };
    const watcher = new RepoWatcher({ repoLayer: fakeRepoLayer, dropDir: TMP_DROP, onEvent: () => {} });
    watcher.init();

    const zip = new AdmZip();
    zip.addFile('a.txt', Buffer.from('hello'));
    zip.writeZip(path.join(TMP_DROP, 'plain-drop.zip'));
    await waitFor(() => calls.length > 0);
    watcher.stop();

    ok('IRW-08', '.zip drop still ingests via the original path (source: drop), no regression', calls[0]?.source === 'drop');
  }

  // ── Test 4: a module-level .spec (no archive) is ignored cleanly, not crashed on ─
  {
    const calls = [];
    const events = [];
    const fakeRepoLayer = { ingest: (args) => { calls.push(args); return { repo: {} }; } };
    const watcher = new RepoWatcher({ repoLayer: fakeRepoLayer, dropDir: TMP_DROP, onEvent: e => events.push(e) });
    watcher.init();

    fs.writeFileSync(path.join(TMP_DROP, 'module-level.spec'), `spec:\n\n  meta:\n    name:        not-a-container\n    version:     1.0.0\n`);
    await waitFor(() => events.some(e => e.type === 'repo.ingest.failed'));
    watcher.stop();

    ok('IRW-09', 'a module-level .spec (no payload) fails loud, not silently, and never calls ingest()', calls.length === 0 && events.some(e => e.type === 'repo.ingest.failed'));
  }

  console.log(`\n  idearium-repo-watcher: ${passed} passed, ${failed} failed\n`);
  fs.rmSync(TMP_DROP, { recursive: true, force: true });
  if (failed > 0) process.exit(1);
}

run();
