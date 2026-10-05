'use strict';
/**
 * scripts/bench-file-prompt.js — the benchmark behind the file prompt's size claim (§17.11: every performance claim
 * names its benchmark, and reports the unfavourable case beside the favourable one).
 * comp_id: nexus.scripts.bench-file-prompt
 * UUID: nexus-scripts-bench-file-prompt-v1-0000-2026-1005-jamesbrooks-001
 *
 * James, 2026-10-05: "combining primitives or invariants to build higher leverage code for less tokens."
 *
 * Method: a file-tree spec (spec-engine createFileTreeSpec) whose kernel layer is N real Nexus lib files, built
 * (content = the file on disk), and one engine file above them whose purpose names two of them. The engine file's
 * prompt is built with spec-engine buildChunkPrompt — the exact function the build dispatch uses — and measured:
 * characters (tokens estimated at chars/4 — no tokenizer is bundled, docs/2026-10-02-emerge-field-memory-build-
 * phasemap.spec EC6), files in full, files by interface, files not seen at all. Run it on two trees (git stash / a
 * worktree) to compare. Writes nothing: lib/test-sandbox.js gives it a throwaway data root.
 *
 *   node scripts/bench-file-prompt.js            → one JSON line
 */
// a script is not a test process: the marker arms a real throwaway sandbox (lib/test-sandbox.js ensure, §0.39.300)
process.env.NEXUS_TEST_SANDBOX = process.env.NEXUS_TEST_SANDBOX || '1';
require('../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const KERNEL = ['lib/agent-memory.js', 'lib/chunk-glyph.js', 'lib/component-store.js', 'lib/spec-digest.js', 'lib/reply-continuation.js',
  'lib/registry-harness.js', 'lib/gap-field.js', 'lib/hat-forge.js', 'lib/agent-router.js', 'lib/vector-memory.js', 'lib/repo-context.js',
  'lib/context-atlas.js', 'lib/build-verify.js', 'lib/relational-context.js'];

async function main() {
  const _log = console.log; console.log = (...a) => { if (/^\[(jaa|idearium|spec-engine)/i.test(String(a[0] || ''))) return; _log(...a); };
  const se = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
  const files = [{ path: 'src/engine/recall-build.js', layer: 'engine', purpose: 'recall memory and glyph context for a build using agent-memory and chunk-glyph' }];
  for (const p of KERNEL) files.push({ path: p, layer: 'kernel', purpose: path.basename(p, '.js') });
  const m = se.createFileTreeSpec({ name: 'bench-file-prompt', description: 'benchmark', plan: { planSource: 'bench', files } });
  for (const c of m.chunks) if (c.file.layer === 'kernel') { c.status = 'complete'; c.content = fs.readFileSync(path.join(ROOT, c.realPath), 'utf8'); }
  const target = m.chunks.find(c => c.file.layer === 'engine');
  const p = se.buildChunkPrompt(m, target, '');
  const full = (p.match(/^--- (\S+)/gm) || []).map(x => x.slice(4));
  const iStart = p.indexOf('THE OTHER FILES BELOW');
  const byInterface = iStart < 0 ? [] : (p.slice(iStart).match(/^- (lib\/\S+)/gm) || []).map(x => x.slice(2));
  const seen = new Set([...full, ...byInterface]);
  const kernelChars = KERNEL.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  console.log = _log;
  console.log(JSON.stringify({
    bench: 'scripts/bench-file-prompt.js', method: 'spec-engine buildChunkPrompt over a file-tree spec of real lib files',
    promptChars: p.length, tokensEstimate: Math.ceil(p.length / 4), tokenMethod: 'chars/4 (no tokenizer bundled)',
    kernelFiles: KERNEL.length, kernelChars, inFull: full, byInterface: byInterface.length, notSeen: KERNEL.filter(f => !seen.has(f)),
  }));
}
main().catch(e => { console.error(`[bench-file-prompt] ${e.stack}`); process.exit(1); });
