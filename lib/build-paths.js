'use strict';
/**
 * lib/build-paths.js — WB0: every build path, the agent call it makes, and whether WARP is on it. Measured from source.
 * comp_id: nexus.lib.build-paths
 *
 * James, 2026-10-15: "make sure all builds use warp."
 *
 * Not a hand-kept list of claims (§0.1: a declaration is a claim until checked). The census reads the build code, finds
 * every agent call (RA.dispatch, dispatchToNcpAgent, buildChunkWithAgent, warpFn / warpDispatch), names the function or
 * route it sits in, and says what each one is:
 *   build      a known build path — WARP or direct
 *   not-build  a call that is not a build (chat, a notice to the agent) — named here with why
 *   unknown    an agent call in build code that nobody has classified — a new path cannot hide; CK-255 fails on it
 *
 * census({ root }) → { paths: [{ id, label, file, where, sites: [{ line, call, warp }], warp: 'yes'|'fallback'|'no' }],
 *                      notBuilds: [...], unknown: [...], ok }
 * WARP 'fallback': the path calls WARP and only falls back to a direct call when WARP could not load (said in its log).
 */
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
// the files whose agent calls are builds (or must be classified)
const FILES = ['idearium/api/index.js', 'cortex/core/raid/officiator.js', 'cortex/core/raid/contract-intake.js'];
const CALL_RE = /\b(RA\.dispatch|dispatchToNcpAgent|buildChunkWithAgent|warpFn|warpDispatch)\s*\(/;
const WARP_CALLS = new Set(['warpFn', 'warpDispatch']);
// the enclosing unit: a top-level function, or a route case
const UNIT_RE = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^\s+case\s+'([\w.-]+)'/;

// known units → what they are. Every agent call in FILES must land in one of these, or it is 'unknown'.
const BUILDS = {
  _phaseBuild:          { id: 'phase-build', label: 'phase build (whole, chunked, bricks through RAID, planned)' },
  _provePhase:          { id: 'proof-repair', label: 'proof run — the agent repairs what failed its conditions' },
  _reviewDraft:         { id: 'draft-review', label: 'a guardian agent reviews an Ollama draft' },
  'speceng.build':      { id: 'spec-chunk-build', label: 'spec engine chunk build' },
  'speceng.codegen':    { id: 'codegen-plan', label: 'code generation from a spec — the planner\'s file plan' },
  'speceng.create':     { id: 'spec-create-plan', label: 'a new spec\'s file plan' },
  'repo.expand':        { id: 'expand', label: 'a system grown from its spec (expand)' },
  _realAgentExecutor:   { id: 'raid-worker-brick', label: 'RAID worker runs a queued contract' },
  _synthesizeCore:      { id: 'officiator-synthesis', label: 'RAID officiator synthesizes a contract from a staged artifact' },
};
const NOT_BUILDS = {
  'repo.agent.prompt':  'the Agent tab chat — a conversation, not a build',
  _tellAgentRejected:   'tells the agent its proposal was rejected — a notice, not a build',
};

/** _unitOf(lines, i) → the name of the function or route case the line sits in */
function _unitOf(lines, i) {
  for (let k = i; k >= 0; k--) { const m = UNIT_RE.exec(lines[k]); if (m) return m[1] || m[2]; }
  return null;
}

function census({ root = path.resolve(__dirname, '..'), files = FILES } = {}) {
  const byId = new Map(); const notBuilds = []; const unknown = [];
  for (const rel of files) {
    let text; try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { unknown.push({ file: rel, why: `unreadable: ${e.message}` }); continue; }
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;   // a comment that names a call is not a call
      const m = CALL_RE.exec(l); if (!m) return;
      const where = _unitOf(lines, i);
      const site = { file: rel, line: i + 1, call: m[1], warp: WARP_CALLS.has(m[1]), where };
      if (where && BUILDS[where]) {
        const b = BUILDS[where];
        const p = byId.get(b.id) || byId.set(b.id, { id: b.id, label: b.label, file: rel, where, sites: [] }).get(b.id);
        p.sites.push(site);
      } else if (where && NOT_BUILDS[where]) notBuilds.push({ ...site, why: NOT_BUILDS[where] });
      else unknown.push({ ...site, why: `an agent call in ${where || 'top-level code'} that no build path names — classify it in lib/build-paths.js` });
    });
  }
  const paths = [...byId.values()].map(p => {
    const w = p.sites.filter(s => s.warp).length;
    return { ...p, warp: w === p.sites.length ? 'yes' : w ? 'fallback' : 'no' };
  });
  const bypass = paths.filter(p => p.warp === 'no');
  return { paths, notBuilds, unknown, bypass: bypass.map(p => p.id), ok: !bypass.length && !unknown.length };
}

module.exports = { VERSION, FILES, BUILDS, NOT_BUILDS, census };
