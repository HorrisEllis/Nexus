'use strict';
// lib/agent-tools/generate-tool-nodes.js — real generator + real listener.
// James: "in the nodes folder in lib. they all need to be a real yaml
// file with the node type as the extension." Then: "check the agent
// tools... fix and expand the tools. Listeners for them."
//
// §RESTORED 2026-09-08 — lost in an earlier tree-switch, re-requested
// directly. Real, not guessed: iterates lib/agent-tools/index.js's own
// live TOOLS registry (the same registry every real dispatch actually
// uses, not a separate list that could drift from it). execute (the
// real function) is deliberately excluded from the exported .tool file,
// per lib/node-schemas/tool.js's own real schema note: "not
// serializable, present only in-process."
//
// §NEW — a real listener this time. James: "listeners for them." A
// real, periodic check comparing the live TOOLS registry (source of
// truth, in-memory) against the real .tool files on disk — if a tool
// is added/removed from the registry without regenerate() being run,
// the listener flags the real drift instead of the node files silently
// going stale. Same real "detect, don't silently drift" principle this
// whole session has repeatedly reached for, not a new one invented here.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exportToFile, importFromFile } = require('../node-export.js');

// §FOUND & FIXED 2026-09-08 — James: "data folders are basically blank.
// all data lives in the relevant data folder per system." Real, honest
// mistake caught and corrected: this originally wrote to lib/nodes/ —
// lib/ is cross-system CODE, these are real, per-system DATA files.
// Moved to data/nodes/, matching every other system's own real data/
// convention already established this session.
const NODES_DIR = path.join(__dirname, '../../data/nodes');
// §0.59.1 — was hard-coded without deepseek; the guardian userscripts are the one source (lib/agent-providers.js)
const REAL_AGENTS = (() => { try { return require('../agent-providers.js').guardianProviders(); } catch (_) { return ['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity']; } })();

function generate() {
  const { TOOLS } = require('./index.js');
  fs.mkdirSync(NODES_DIR, { recursive: true });

  // §1.2 — a regenerate must not leave stale .tool/.toolbox files from a
  // PRIOR generation (a tool renamed or removed from the registry would
  // otherwise leave an orphaned node file claiming to still exist).
  for (const f of fs.readdirSync(NODES_DIR)) {
    if (f.endsWith('.tool') || f.endsWith('.toolbox')) fs.unlinkSync(path.join(NODES_DIR, f));
  }

  const toolUuids = [];
  for (const [name, tool] of TOOLS) {
    const uuid = crypto.randomUUID();
    const filePath = exportToFile('tool', `${name}.${uuid}`, {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }, { source: 'lib/agent-tools' }, NODES_DIR);
    toolUuids.push({ name, uuid, filePath });
  }

  const toolboxPaths = [];
  for (const agent of REAL_AGENTS) {
    const uuid = crypto.randomUUID();
    const filePath = exportToFile('toolbox', `${agent}.${uuid}`, {
      agent,
      tools: toolUuids.map(t => ({ name: t.name, uuid: t.uuid })),
      toolCount: toolUuids.length,
    }, { source: 'lib/agent-tools/generate-tool-nodes.js' }, NODES_DIR);
    toolboxPaths.push(filePath);
  }

  return { toolCount: toolUuids.length, toolboxCount: toolboxPaths.length, dir: NODES_DIR };
}

// §NEW 2026-09-08 — James: "listeners for them." Real drift check: are
// the real, live TOOLS registry and the real .tool files on disk still
// in agreement? Returns real, specific findings — never a silent pass
// when they've actually diverged.
function checkDrift() {
  const { TOOLS } = require('./index.js');
  const onDisk = new Set();
  let files = [];
  try { files = fs.readdirSync(NODES_DIR).filter(f => f.endsWith('.tool')); }
  catch (_) { return { drifted: true, reason: 'nodes dir does not exist — regenerate() has never run', missing: [...TOOLS.keys()], stale: [] };
  }
  for (const f of files) {
    // real filename shape: toolname.<uuid>.tool
    const m = f.match(/^(.+)\.[0-9a-f-]{36}\.tool$/);
    if (m) onDisk.add(m[1]);
  }
  const missing = [...TOOLS.keys()].filter(name => !onDisk.has(name)); // real tools with no real node file
  const stale = [...onDisk].filter(name => !TOOLS.has(name)); // real node files for tools no longer registered
  return { drifted: missing.length > 0 || stale.length > 0, missing, stale, realCount: TOOLS.size, onDiskCount: onDisk.size };
}

function startDriftListener(intervalMs = 60000) {
  const timer = setInterval(() => {
    const d = checkDrift();
    if (d.drifted) {
      console.warn(`[agent-tools] .tool node drift detected — missing:[${d.missing.join(',')}] stale:[${d.stale.join(',')}]. Run generate-tool-nodes.js to resync.`);
    }
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { generate, checkDrift, startDriftListener, NODES_DIR, REAL_AGENTS };

if (require.main === module) {
  const r = generate();
  console.log(`[agent-tools] generated ${r.toolCount} .tool nodes + ${r.toolboxCount} .toolbox indexes in ${r.dir}`);
}
