'use strict';
// lib/compiler.js — component emerge.compiler, capability emerge.compiler.spec: Emerge's spec compiler through the system's door.
// EAS4 L1 (Nexus docs/2026-10-31-emerge-as-a-system-phasemap.spec EAS4, EAS_D5). James, 2026-11-05: "One primitive per gate. Compounds,
// each layer." Its command is a node (data/nodes/command/emerge.compiler.compile.command, its expectation in the node), served at
// POST /compiler/compile; this file is only what it runs.
//
// A caller in another system cannot share a folder with Emerge, so the spec comes in as text and the emitted files go back as text.
// Each call writes the spec into a fresh work folder, runs compiler/index.js compile() there on the local host (compiler/host.js: no
// network, no Cortex, "Emerge depends on nothing above it", 2026-10-28), reads back every file it emitted, and removes the folder.
// A host's preflight or writeback above Emerge (Cortex's) is the caller's to do around this call, not Emerge's.
const fs = require('fs');
const os = require('os');
const path = require('path');

function _bad(field) { return Object.assign(new Error(`missing ${field}`), { status: 400 }); }

/** POST /compiler/compile { spec, name?, tier? } -> { ok, files, t0, t1, ms } | { ok:false, error, step } */
async function compile(args = {}) {
  if (typeof args.spec !== 'string' || !args.spec.trim()) throw _bad('spec (the spec\'s YAML text)');
  const tier = args.tier === 0 ? 0 : 1;
  const name = path.basename(String(args.name || 'spec.spec')).replace(/[^\w.-]/g, '_') || 'spec.spec';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'emerge-compile-'));
  const t0 = Date.now();
  try {
    const src = path.join(work, name.endsWith('.spec') ? name : `${name}.spec`);
    const out = path.join(work, 'out');
    fs.writeFileSync(src, args.spec);
    const { compile: run } = require('../compiler/index.js');
    const log = console.log; console.log = () => {};   // the compiler narrates; the door answers in JSON only
    let r; try { r = await run(src, out, { tier, skipCortex: true }); } finally { console.log = log; }
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'the compiler did not run', step: (r && r.step) || 'compile', ms: Date.now() - t0 };
    const emitted = (t) => (r[t] && r[t].emitted) || [];
    const files = {};
    for (const rel of [...new Set([...emitted('t0'), ...emitted('t1')])].sort()) files[rel] = fs.readFileSync(path.join(out, rel), 'utf8');
    return { ok: true, files, t0: { emitted: emitted('t0') }, t1: { emitted: emitted('t1') }, ms: Date.now() - t0 };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is not an error of the call */ }
  }
}

module.exports = { compile };
