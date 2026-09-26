'use strict';
// lib/agent-tools/generate-agent-nodes.js — real generator + real listener
// for .agent node instances.
//
// James: "populate real .agent node instances from RAID's live health
// data (the schema already exists, zero instances populated) — that's
// the literal foundation the rest of the command/tool/event node vision
// sits on." Then: "also deepseek." Then: "get raid solid. enterprise
// grade."
//
// Follows the exact, already-proven pattern of generate-tool-nodes.js
// (same file, same directory) — not a second, different convention:
// reads the live, in-memory source of truth (RAID's own _health/
// HEALTH_KEY, the same data _agentAvailable()/_pollHealth() actually
// use — not a separate list that could drift from it), cleans stale
// .agent files before regenerating (§1.2 — a stale node file claiming
// an agent still exists is worse than no file), and includes a real
// drift listener matching the same real "detect, don't silently drift"
// principle already established for .tool nodes.
//
// §REAL BUG FOUND WHILE BUILDING THIS — not guessed, found by reading
// RAID's own _pollHealth() directly before writing anything here: the
// real poll loop only ever checked ['claude','chatgpt'] — gemini was
// in HEALTH_KEY/_health but its real online flag was NEVER updated
// after boot, permanently stuck at the honest-but-wrong false default
// regardless of real connection status. _agentAvailable() requires
// online===true, so RAID could never have dispatched to gemini at all,
// silently, for as long as that bug existed. Fixed in cortex/core/
// raid/index.js itself (this file's own real data source) before this
// generator was written against it — populating nodes from data that
// was itself wrong would have just made the wrong answer look official.

const fs = require('fs');
const path = require('path');
const { exportToFile } = require('../node-export.js');

const NODES_DIR = path.join(__dirname, '../../data/nodes');

function generate() {
  const raid = require('../../cortex/core/raid/index.js');
  const { _health, HEALTH_KEY } = raid;
  fs.mkdirSync(NODES_DIR, { recursive: true });

  // §1.2 — same real convention as generate-tool-nodes.js: a regenerate
  // must not leave stale .agent files from a prior generation (an
  // agent removed from HEALTH_KEY would otherwise leave an orphaned
  // node file claiming it still exists).
  for (const f of fs.readdirSync(NODES_DIR)) {
    if (f.endsWith('.agent')) fs.unlinkSync(path.join(NODES_DIR, f));
  }

  const agentPaths = [];
  for (const dispatchName of Object.keys(HEALTH_KEY)) {
    const healthKey = HEALTH_KEY[dispatchName];
    const snap = _health[healthKey];
    if (!snap) continue; // honest — no real snapshot, no fabricated node
    const filePath = exportToFile('agent', dispatchName, {
      dispatchName,
      online: !!snap.online,
      consecutiveFails: snap.consecutiveFails || 0,
      callCount: snap.callCount || 0,
      successRate: typeof snap.successRate === 'number' ? snap.successRate : 1,
      role: snap.role || null,
    }, { source: 'cortex/core/raid/index.js', context: 'RAID live health snapshot' }, NODES_DIR);
    agentPaths.push(filePath);
  }

  return { agentCount: agentPaths.length, dir: NODES_DIR };
}

// Real drift check — same shape as checkDrift() in generate-tool-nodes.js.
function checkDrift() {
  const raid = require('../../cortex/core/raid/index.js');
  const { HEALTH_KEY } = raid;
  const onDisk = new Set();
  let files = [];
  try { files = fs.readdirSync(NODES_DIR).filter(f => f.endsWith('.agent')); }
  catch (_) { return { drifted: true, reason: 'nodes dir does not exist — generate() has never run', missing: Object.keys(HEALTH_KEY), stale: [] }; }
  for (const f of files) {
    // real filename shape: dispatchname.agent
    const m = f.match(/^(.+)\.agent$/);
    if (m) onDisk.add(m[1]);
  }
  const missing = Object.keys(HEALTH_KEY).filter(name => !onDisk.has(name));
  const stale = [...onDisk].filter(name => !HEALTH_KEY[name]);
  return { drifted: missing.length > 0 || stale.length > 0, missing, stale, realCount: Object.keys(HEALTH_KEY).length, onDiskCount: onDisk.size };
}

function startDriftListener(intervalMs = 60000) {
  const timer = setInterval(() => {
    const d = checkDrift();
    if (d.drifted) {
      console.warn(`[agent-nodes] .agent node drift detected — missing:[${d.missing.join(',')}] stale:[${d.stale.join(',')}]. Run generate-agent-nodes.js to resync.`);
    }
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { generate, checkDrift, startDriftListener, NODES_DIR };

if (require.main === module) {
  const r = generate();
  console.log(`[agent-nodes] generated ${r.agentCount} .agent nodes in ${r.dir}`);
}
