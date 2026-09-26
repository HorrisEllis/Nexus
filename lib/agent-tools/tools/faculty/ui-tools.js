'use strict';
/**
 * lib/agent-tools/tools/ui-tools.js — P8 of the bridge phases
 * UUID: nexus-agent-tools-ui-v1-0000-2026-0730-001
 *
 * §PHASEMAP P8 (docs/raid-warp-verification-phasemap.spec, Part II). Co-pilot
 * must be able to ACT on the UI to assist the user. spotlight + nerve are ALREADY
 * co-pilot-callable over HTTP (their own headers: "Co-pilot sends commands via
 * HTTP. Spotlight executes" / nerve "registers with co-pilot"). These tools wrap
 * those documented endpoints (§8.6 wrap the built surface, build no new UI;
 * §16.5 wire before add) so co-pilot's tool-loop can light up a system, walk the
 * user through steps, or surface the live field.
 *
 * The endpoints (served to the tv-shell):
 *   POST /api/ui/spotlight/on    { target, ttl }
 *   POST /api/ui/spotlight/off
 *   POST /api/ui/spotlight/step  { steps: [] }
 *   POST /api/ui/nerve/on | /off | /sigma
 */

const http = require('http');

// The tv-shell UI host. Co-pilot posts UI commands here; the shell executes them.
const UI_HOST = process.env.NEXUS_UI_HOST || '127.0.0.1';
const UI_PORT = process.env.NEXUS_UI_PORT || 3000;

function _post(path, body) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = http.request({ hostname: UI_HOST, port: UI_PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }, timeout: 5000 },
      (res) => {
        let out = '';
        res.on('data', c => out += c);
        res.on('end', () => { try { resolve({ ok: res.statusCode < 400, status: res.statusCode, body: out ? JSON.parse(out) : null }); } catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, body: out }); } });
      });
    req.on('error', (e) => resolve({ error: `UI unreachable at ${UI_HOST}:${UI_PORT} — ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'UI command timed out' }); });
    req.write(data); req.end();
  });
}

const uiSpotlightTool = {
  name: 'ui_spotlight',
  description: 'Guide the user\'s attention in the NEXUS UI. action "on" highlights a system (target: guardian/cortex/idearium/...); "off" clears it; "step" walks the user through a sequence of steps. Use to show the user WHERE something is happening while you assist.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['on', 'off', 'step'], description: 'on = highlight a target, off = clear, step = guided sequence' },
      target: { type: 'string', description: 'For "on": which system to highlight (guardian, cortex, idearium, ...).' },
      ttl:    { type: 'number', description: 'For "on": how long the highlight lasts, ms (default 8000).' },
      steps:  { type: 'array', description: 'For "step": ordered step objects to walk the user through.', items: { type: 'object' } },
    },
    required: ['action'],
  },
  execute: async ({ action, target, ttl, steps }) => {
    if (action === 'on') {
      if (!target) return { error: 'ui_spotlight "on" needs a target' };
      return _post('/api/ui/spotlight/on', { target, ttl: ttl || 8000 });
    }
    if (action === 'off') return _post('/api/ui/spotlight/off', {});
    if (action === 'step') {
      if (!Array.isArray(steps) || !steps.length) return { error: 'ui_spotlight "step" needs a non-empty steps array' };
      return _post('/api/ui/spotlight/step', { steps });
    }
    return { error: `unknown ui_spotlight action "${action}"` };
  },
};

const uiNerveTool = {
  name: 'ui_nerve',
  description: 'Surface the live NEXUS "nervous system" field (the CFR sigma field) in the UI. action "on" shows it, "off" hides it, "sigma" pushes a specific field value. Use to make the system\'s live state visible to the user.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['on', 'off', 'sigma'], description: 'on = show the field, off = hide, sigma = push a field value' },
      sigma:  { type: 'number', description: 'For "sigma": the field value to surface (0..1).' },
    },
    required: ['action'],
  },
  execute: async ({ action, sigma }) => {
    if (action === 'on')  return _post('/api/ui/nerve/on', {});
    if (action === 'off') return _post('/api/ui/nerve/off', {});
    if (action === 'sigma') return _post('/api/ui/nerve/sigma', { sigma: sigma ?? 0 });
    return { error: `unknown ui_nerve action "${action}"` };
  },
};

module.exports = [uiSpotlightTool, uiNerveTool];
