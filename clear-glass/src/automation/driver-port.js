'use strict';
/**
 * clear-glass/src/automation/driver-port.js — Clear Glass's browser, reached by the orchestrator's automation engine over :7704 (AE2).
 * Map: docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec AE2_browser_driver_port.
 *
 * James, 2026-10-31: "merge and finish automation and cos backend". The engine moved to the orchestrator (AE1); its browserFn and
 * runMacroFn call POST /automation/driver and POST /automation/macro-run here (orchestrator/automation/index.js). Clear Glass answers with
 * what it already had: _automationBrowser (its browser step) and its macro tool. A step that fails is { error } (the engine names it);
 * Clear Glass down → the orchestrator's own _cg says "browser steps need Clear Glass running", and only the browser step-types pause.
 *
 *   handle({ method, url, body }, { browser, runMacro }) → { status, body } | null   (null: not this port's route)
 */
async function handle({ method, url, body = {} } = {}, { browser, runMacro } = {}) {
  const p = String(url || '').split('?')[0];
  if (method !== 'POST' || (p !== '/automation/driver' && p !== '/automation/macro-run')) return null;
  try {
    if (p === '/automation/driver') {
      if (!body || !body.action) return { status: 400, body: { error: 'a browser step needs an action' } };
      return { status: 200, body: (await browser(body)) ?? { ok: true } };
    }
    if (!body || !body.name) return { status: 400, body: { error: 'a macro step needs the macro\'s name' } };
    return { status: 200, body: (await runMacro({ name: body.name, agentId: body.agentId, params: body.params })) ?? { ok: true } };
  } catch (e) { return { status: 200, body: { error: e.message } }; }   // the step failed, not the port: the engine reads { error }
}

module.exports = { handle };
