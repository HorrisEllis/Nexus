'use strict';
/**
 * lib/agent-tools/tools/clear-glass/stream-bridge.js — clear_glass_stream_bridge tool
 * UUID: nexus-agent-tools-clear-glass-stream-bridge-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — thin wrapper over lib/clear-glass-stream-bridge.js's
 * real enable/disable/status. Its own header has the full reasoning for
 * why this is an explicit, callable action rather than something tied
 * to a hat-activation lifecycle that doesn't exist.
 */

const bridge = require('../../../clear-glass-stream-bridge.js');

module.exports = {
  name: 'clear_glass_stream_bridge',
  description:
    'Turn real ClearGlass state (DOM archaeology, driver actions, agent-mesh events, diagnostics — every ' +
    'real subsystem that reports through clear-glass/src/sse/server.js\'s own emit()) into copilot\'s own ' +
    'event stream, live. enable connects and forwards every real ClearGlass SSE event from that point on; ' +
    'disable stops it; status reports whether it\'s running and how many real events have been forwarded.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['enable', 'disable', 'status'], description: 'Which action to perform' },
    },
    required: ['action'],
  },
  execute: async ({ action } = {}) => {
    if (action === 'enable')  return bridge.enable();
    if (action === 'disable') return bridge.disable();
    if (action === 'status')  return bridge.status();
    return { error: `unknown action "${action}" — expected one of: enable, disable, status` };
  },
};
