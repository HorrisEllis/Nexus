'use strict';
/**
 * lib/agent-tools/tools/identity/intent-hat.js — intent_hat tool
 * UUID: nexus-tool-intent-hat-v1-0000-2026-0817-jamesbrooks-001
 * §WIRED 2026-08-17 — wraps lib/intent-hat-router.js. See that module's
 * own header for what already existed vs. what this actually adds.
 */
const ihr = require('../../../intent-hat-router.js');

module.exports = {
  name: 'intent_hat',
  description:
    'Real, automatic intent-to-hat suggestion. Action "suggest" (needs prompt) classifies a message\'s ' +
    'real verb and reports which real hat (the_diagnostician/the_builder/the_auditor/the_librarian) it ' +
    'suggests, without switching anything — for a caller that wants to offer the switch rather than do it ' +
    'silently. The actual temporary switch-and-restore (withIntentHat) is a direct function call for a ' +
    'real dispatch path to wrap, not exposed as a tool action itself — a tool call can\'t hold the "restore ' +
    'after" guarantee across the caller\'s own dispatch the way a real function wrapper can.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['suggest'] },
      prompt: { type: 'string' },
    },
    required: ['action', 'prompt'],
  },
  async execute({ action, prompt } = {}) {
    if (action !== 'suggest') return { error: 'only "suggest" is available as a tool action' };
    if (!prompt) return { error: 'prompt is required' };
    try { return ihr.suggestHat(prompt); }
    catch (e) { return { error: `intent_hat suggest failed: ${e.message}` }; }
  },
};
