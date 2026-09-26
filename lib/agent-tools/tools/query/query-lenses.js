'use strict';
/**
 * lib/agent-tools/tools/query-lenses.js — copilot reads through many lenses at once.
 * comp_id: nexus.lib.agent-tools.query-lenses
 * UUID: nexus-tool-lenses-v1-0000-2026-0809-001
 *
 * Wraps lib/lenses.js. The value is not the readings, it is the CONTRAST:
 * where lenses disagree, and where one fires alone while every other abstains.
 * A sole finding is either the sharpest signal in the set or a false positive,
 * and a count of findings buries it either way.
 *
 * Blindness is surfaced at the top of every reply. A "clean" verdict computed
 * from lenses that never ran is exactly the failure this exists to prevent.
 */
const path = require('path');
const L = require(path.join(__dirname, '../../../lenses.js'));

module.exports = {
  name: 'parse_lenses',
  description:
    'Read one input through several independent lenses at once and contrast them: liminal (12 gap ' +
    'detectors), axioms (constitutional check), edge-cases (known per-system failures), sigma ' +
    '(deviation from field baseline), shape (structural markers like empty catch blocks). ' +
    'Each lens returns FINDING, ABSTAIN, UNAVAILABLE or ERROR — a lens that could not run is never ' +
    'reported as clean. Use action "list" to see the lenses, "parse" for the readings, "contrast" ' +
    'for the verdict (recommended: it names where the lenses disagree and where one fired alone).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'parse', 'contrast'] },
      input:  { type: 'string', description: 'the text, code, or message to read' },
      lenses: { type: 'array', items: { type: 'string' }, description: 'subset by name; default all' },
      system: { type: 'string', description: 'system context for the edge-cases lens' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    try {
      if (args.action === 'list') return { ok: true, lenses: L.list() };
      if (!args.input) return { error: 'input required for parse/contrast' };
      const parsed = L.parse(args.input, { lenses: args.lenses, system: args.system });
      if (!parsed.ok) return parsed;
      if (args.action === 'parse') return parsed;
      const c = L.contrast(parsed);
      // Contrast first, then the readings behind it — so the verdict and the
      // coverage are read before any individual finding.
      return { ok: true, ...c, readings: parsed.readings };
    } catch (e) { return { error: `parse_lenses ${args.action} failed: ${e.message}` }; }
  },
};
