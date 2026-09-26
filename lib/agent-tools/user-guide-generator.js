'use strict';
/**
 * lib/agent-tools/user-guide-generator.js — real, live, human-facing docs
 * for co-pilot's 44 tools.
 * comp_id: nexus.lib.agent-tools.user-guide-generator
 * UUID: nexus-agent-tools-user-guide-generator-v1-0000-2026-0813-001
 *
 * James: "need user documentation for co-pilot... maybe user docs that
 * co-pilot can also read, so it can navigate the user through using
 * itself."
 *
 * §16.5 — no new source of truth. Every tool name + description comes from
 * getToolSchemas() (the SAME live registry copilot itself dispatches
 * against); every "what it's actually for" line comes from tool-guide.js's
 * NOTES (the SAME operational layer already injected into co-pilot's own
 * system prompt). This file adds exactly one new thing neither of those
 * has: a human-facing GROUPING (which is editorial judgment, same as
 * NOTES itself being hand-authored — categorizing 44 flat tool names into
 * something a person can scan is not derivable from the data alone).
 *
 * §R6 (docs/repair-contract-and-loom-hub-phasemap.spec) — regenerate this
 * file, never hand-edit docs/copilot-user-guide.md directly, or it drifts
 * from the real registry the exact way lib/version.js's architect comment
 * drifted earlier this session.
 *
 * Placed under docs/ on purpose: nexus_help's search_docs (lib/agent-
 * tools/tools/nexus-help.js) already full-text-searches docs/*.md and
 * docs/*.spec with zero new wiring — so the moment this file exists,
 * co-pilot can already find and quote it back to a person asking "what
 * can you do" or "how do I schedule something." One real doc, two real
 * readers (a person, and co-pilot answering a person), no third copy.
 *
 * §GATE — every tool in the live registry appears in exactly one group
 * below, or generation throws. A tool silently missing from a human-
 * facing guide is worse than an ugly one, and this is the same "loud,
 * never silent" axiom (§1.2) as everywhere else in this session.
 */

const fs = require('fs');
const path = require('path');
const OUT_FILE = path.join(__dirname, '..', '..', 'docs', 'copilot-user-guide.md');

// Hand-authored grouping — the one genuinely new piece (see header). Every
// live tool name must appear in exactly one group; generate() asserts this
// against the real registry rather than assuming the list below stays
// complete as tools are added.
const GROUPS = [
  { title: 'Talking to co-pilot about itself',
    tools: ['nexus_help', 'nexus_status', 'copilot_identity'] },
  { title: 'Getting things built',
    tools: ['run_command', 'run_pipeline', 'run_closed_loop', 'module_builder', 'forge_tool', 'safe_apply'] },
  { title: 'Understanding what NEXUS is doing',
    tools: ['diagnose', 'loom_scan', 'nexus_heal', 'query_movement', 'resource_monitor', 'fault_log', 'axiom_check', 'raid_snr'] },
  { title: 'Working with other AI agents',
    tools: ['agent_capability', 'agent_chat_search', 'agent_council', 'roundtable', 'parallel_dispatch', 'cos_simulate', 'run_adversarial', 'emergence'] },
  { title: 'Memory, recall & analysis',
    tools: ['query_recall', 'nexus_intelligence', 'meta_query', 'parse_lenses', 'analyze'] },
  { title: 'Automation — do this later / when this happens',
    tools: ['schedule_task', 'register_trigger', 'run_chain'] },
  { title: 'Ideas & self-improvement',
    tools: ['propose_idea'] },
  { title: 'Reaching other systems & data',
    tools: ['move_data', 'call_system', 'nexus_capability'] },
  { title: 'Browser & the visual UI',
    tools: ['browser_action', 'ui_spotlight', 'ui_nerve', 'rewind_replay'] },
  { title: 'Isolation & safety',
    tools: ['cos_compartment'] },
  { title: 'Roles co-pilot can wear',
    tools: ['hat_forge'] },
  { title: 'Files',
    tools: ['read_file'] },
];

function _firstSentence(desc) {
  const s = String(desc || '').split(/\n/)[0];
  const m = s.match(/^(.*?[.!?])\s/);
  return (m ? m[1] : s).trim();
}

/** generate() — build the real markdown from the live registry, live. */
function generate() {
  const { getToolSchemas, TOOLS } = require('./index.js');
  const { noteFor } = require('./tool-guide.js');
  const schemas = getToolSchemas();
  const byName = new Map(schemas.map(s => [s.name || (s.function && s.function.name), s]));

  // §GATE — every live tool accounted for exactly once, not assumed.
  const grouped = new Set(GROUPS.flatMap(g => g.tools));
  const missing = [...byName.keys()].filter(n => !grouped.has(n));
  const stale = [...grouped].filter(n => !byName.has(n));
  if (missing.length) throw new Error(`user-guide-generator: ungrouped live tool(s), fix GROUPS: ${missing.join(', ')}`);
  if (stale.length) throw new Error(`user-guide-generator: GROUPS names a tool that no longer exists: ${stale.join(', ')}`);

  const lines = [];
  lines.push('# Talking to co-pilot');
  lines.push('');
  lines.push(`_Generated live from co-pilot's own tool registry (${byName.size} tools) — regenerate this file with ` +
    '`node lib/agent-tools/user-guide-generator.js`, never hand-edit it (§R6). Co-pilot can find this same file itself ' +
    'via nexus_help\'s search_docs — ask it "what can you do" or "how do I schedule something" and it can quote from here.');
  lines.push('');
  lines.push('Co-pilot is NEXUS\'s agent — talk to it in plain language and it decides which of the tools below to use. ' +
    'You very rarely need to name a tool yourself; this page exists so you know what\'s actually possible, and so ' +
    'co-pilot has something real to point to when you ask.');
  lines.push('');
  lines.push('A few things worth knowing up front:');
  lines.push('- **Everything consequential is governed.** Scheduled tasks, triggers, chain steps, and hat-wearing all ' +
    'pass through the same real gate (RAID) before they run — a denial is logged, not hidden.');
  lines.push('- **"Forging" is real, not a metaphor.** Ask co-pilot to forge a tool or a hat and it makes one — a real ' +
    'named capability it (or another agent) can use again.');
  lines.push('- **Nothing here fabricates.** If co-pilot doesn\'t know something, the tools below are built to say so ' +
    '(a missing source, an UNAVAILABLE lens, a null instead of a guess) rather than make it up.');
  lines.push('');

  for (const group of GROUPS) {
    lines.push(`## ${group.title}`);
    lines.push('');
    for (const name of group.tools) {
      const schema = byName.get(name);
      const desc = schema.description || (schema.function && schema.function.description);
      const note = noteFor(name);
      lines.push(`### \`${name}\``);
      lines.push('');
      lines.push(_firstSentence(desc) || '_(no description)_');
      if (note && note.use && note.use !== _firstSentence(desc)) {
        lines.push('');
        lines.push(`*In practice:* ${note.use}`);
      }
      if (note && note.prefer) lines.push(`*Reach for this instead of a similar tool when:* ${note.prefer}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('*Looking for how co-pilot is built, not how to use it? Ask co-pilot itself with `nexus_help` — ' +
    '`rundown` for the current-state picture, `search_docs` for anything in `docs/*.spec`.*');

  return lines.join('\n');
}

/** write() — generate() + write to disk, real overwrite, no manual edit. */
function write() {
  const md = generate();
  fs.writeFileSync(OUT_FILE, md);
  return { ok: true, file: OUT_FILE, bytes: md.length };
}

module.exports = { generate, write, OUT_FILE, GROUPS, MODULE_ID: 'agent-tools-user-guide-generator', VERSION: '1.0.0' };

if (require.main === module) {
  const r = write();
  console.log(`[user-guide-generator] wrote ${r.file} (${r.bytes} bytes)`);
}
