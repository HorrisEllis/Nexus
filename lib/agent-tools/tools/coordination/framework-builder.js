'use strict';
/**
 * lib/agent-tools/tools/coordination/framework-builder.js — real,
 * agent-callable access to intelligence/framework-builder.js. Closes the
 * loop James asked for: "hey nexus lets create a framework" now reaches
 * a real, executable tool, not just a library function nothing calls.
 * comp_id: nexus.lib.agent-tools.tools.framework-builder
 */
const fb = require('../../../../intelligence/framework-builder.js');

module.exports = {
  name: 'framework_builder',
  description:
    'Generates a real, working WARP-based module skeleton (warp/core Gate/Axiom/Stream, syntactically correct and ' +
    'independently tested — not a template string that merely looks right) and drops it into intelligence/input/, ' +
    'the real, physical per-system queue folder. Needs "name" (becomes the file name and the createXxx() function ' +
    'name). Optional: "agent" (who asked for it), "description", "tags" (array). The generated file documents the ' +
    'real, currently-registered NEXUS tool vocabulary and points at the real chunker (lib/chunk-service.js) for ' +
    'oversized content — nothing fabricated, both pulled from the live registries at generation time.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'the framework name — becomes the file name and function name' },
      agent: { type: 'string', description: 'which agent is asking for this' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['name'],
  },
  execute: async (a) => {
    if (!a.name) return { error: 'framework_builder needs a real name' };
    try {
      return fb.drop(a.name, { agent: a.agent, description: a.description, tags: a.tags });
    } catch (e) {
      return { error: `framework_builder failed: ${e.message}` };
    }
  },
};
