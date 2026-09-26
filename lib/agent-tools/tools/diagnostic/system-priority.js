'use strict';
/**
 * lib/agent-tools/tools/diagnostic/system-priority.js — system_priority tool
 * UUID: nexus-tool-system-priority-v1-0000-2026-0817-jamesbrooks-001
 *
 * §BUILT 2026-08-17 — wraps lib/gap-priority.js, lib/system-check.js, and
 * gap-field.js's new logFix(). James: "can everytime you fix something,
 * find an error, etc, add it to the diagnostic system... expand each
 * other as you work?" This is the real, callable path for that — any
 * agent, not just this session's own direct file edits.
 */
const gp = require('../../../gap-priority.js');
const sc = require('../../../system-check.js');
const gapField = require('../../../gap-field.js');

const ACTIONS = {
  score: (a) => {
    if (!a.system) return { error: 'score needs system' };
    return gp.score({ system: a.system, filePath: a.filePath, componentId: a.componentId, severity: a.severity || 'medium' });
  },
  boot_check: (a) => sc.run({ dryRun: a.dryRun !== false }), // defaults to dryRun:true for a tool call — writing real gaps needs explicit opt-in
  log_fix: (a) => {
    if (!a.system || !a.description) return { error: 'log_fix needs system and description' };
    return gapField.logFix({ system: a.system, location: a.location, component: a.component, severity: a.severity || 'medium', description: a.description });
  },
  order: () => ({ order: sc._orderedSystems() }),
};

module.exports = {
  name: 'system_priority',
  description:
    'Bottom-up, architecture-first priority for gaps and system health. Actions: "score" (needs system, ' +
    'optional filePath/componentId/severity — returns a real composite priority, cortex-and-core weighted ' +
    'highest), "boot_check" (runs the real core/cli/api/events/ui presence check across all real systems, ' +
    'ordered by vitality — dryRun defaults true, set dryRun:false to actually write findings as real gaps), ' +
    '"log_fix" (needs system + description — records a real fix into the same diagnostic system gaps live ' +
    'in, with a real priority score; use this whenever you find or fix something real, not just at the end ' +
    'of a task), "order" (the real system check order, cortex first).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      system: { type: 'string' },
      filePath: { type: 'string' },
      componentId: { type: 'string' },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      dryRun: { type: 'boolean', description: 'for "boot_check" — false to actually write real gaps' },
      description: { type: 'string', description: 'for "log_fix" — what was found/fixed, real detail' },
      location: { type: 'string', description: 'for "log_fix"' },
      component: { type: 'string', description: 'for "log_fix"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `system_priority ${args.action} failed: ${e.message}` }; }
  },
};
