'use strict';
// Real regression test for the 2026-09-06 js-yaml default-import bug.
// James's own real boot log on his actual machine showed this crashing
// constantly: "spec-engine load failed: The requested module 'js-yaml'
// does not provide an export named 'default'" — repeated dozens of
// times, idearium's spec-engine never loaded at all, every idea stuck
// at 'building' forever with no queue behind it to recover.
//
// Root cause, confirmed by pulling the real published js-yaml@5.2.1
// tarball and reading its actual dist/js-yaml.mjs: named exports only
// (load, dump, etc.), genuinely no default export — a real breaking
// change from 4.x. spec-engine/index.js used `import yaml from
// 'js-yaml'` (a default import), which is why it broke.
//
// §FIXED 2026-09-06, ROUND 2 — James: real, live report from his actual
// Windows 11 machine: `FAIL: expected PASS ... got:` — empty. Traced two
// real, separate Windows bugs in THIS TEST FILE, not the fix it checks:
//   1. execSync(`node -e "${script...}"`) built a shell command string
//      and relied on POSIX quoting (backslash-escaping embedded quotes).
//      Windows' cmd.exe (what execSync spawns through by default, even
//      when the caller's own shell is PowerShell) has different quoting
//      rules entirely — the multi-line script string never survived
//      intact, so node -e ran empty/garbled input and produced no real
//      output at all. Fixed: write the child script to a real temp file
//      and run `node <file>` via execFileSync with an argument ARRAY,
//      not a single shell string — no shell quoting involved either way.
//   2. `'file://' + SPEC_ENGINE` naively concatenated a Windows path
//      (D:\Backups\...\index.js — backslashes, a drive letter) onto a
//      URL prefix. That produces an invalid file:// URL on Windows
//      (needs file:///D:/Backups/... — forward slashes, three slashes
//      total). Likely the real, second reason nothing loaded. Fixed
//      with the real, built-in url.pathToFileURL(), which handles this
//      correctly on every OS instead of a manual string-concat guess.
//
// This session's own earlier testing never caught either bug because it
// only ever ran on Linux — both are Windows-specific failure modes that
// simply don't exist on the platform this was originally written and
// tested on.

const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SPEC_ENGINE_URL = pathToFileURL(path.join(__dirname, '..', 'idearium', 'spec-engine', 'index.js')).href;

function main() {
  const script = `
    import(${JSON.stringify(SPEC_ENGINE_URL)}).then(se => {
      if (!Array.isArray(se.SPEC_SECTIONS) || se.SPEC_SECTIONS.length !== 11) {
        console.error('FAIL: SPEC_SECTIONS did not load correctly — ' + JSON.stringify(se.SPEC_SECTIONS));
        process.exit(1);
      }
      const meta = se.SPEC_SECTIONS.find(b => b.id === 'meta');
      if (!meta || !meta.agent) {
        console.error('FAIL: meta block missing or has no real agent field — ' + JSON.stringify(meta));
        process.exit(1);
      }
      // 0.39.286: block 11 'registry' (the component registry / interaction contract) comes last, after build_order.
      const last = se.SPEC_SECTIONS[se.SPEC_SECTIONS.length - 1];
      if (last.id !== 'registry' || !(last.dependsOn || []).includes('build_order')) {
        console.error('FAIL: registry block missing, not last, or not depending on build_order — ' + JSON.stringify(last));
        process.exit(1);
      }
      console.log('PASS');
      process.exit(0);
    }).catch(e => {
      console.error('FAIL: ' + e.message);
      process.exit(1);
    });
  `;

  // Real temp file, not an inline -e string — sidesteps shell quoting
  // entirely, on every OS, not just the one this was first tested on.
  const tmpFile = path.join(os.tmpdir(), `spec-engine-yaml-import-test-${process.pid}.mjs`);
  fs.writeFileSync(tmpFile, script, 'utf8');

  let output;
  try {
    output = execFileSync(process.execPath, [tmpFile], { encoding: 'utf8', timeout: 15000 });
  } catch (e) {
    const stderr = (e.stderr || '').toString();
    const stdout = (e.stdout || '').toString();
    throw new Error(`spec-engine/index.js failed to import in a clean process: ${stderr || stdout || e.message}`);
  } finally {
    fs.unlinkSync(tmpFile);
  }

  if (!output.includes('PASS')) {
    throw new Error(`expected PASS in a clean-process import of spec-engine/index.js, got: ${output}`);
  }
  console.log('PASS: spec-engine/index.js imports cleanly in a fresh process — SPEC_SECTIONS has all 11 real blocks (registry last), each with a real agent field');
}

try { main(); console.log('ALL PASS'); process.exit(0); }
catch (e) { console.error('FAIL:', e.message); process.exit(1); }
