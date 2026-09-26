'use strict';
/**
 * clear-glass/src/automation/routes.js — every /automation/* route of Clear Glass's wire server.
 * component_id: cg.automation.routes
 *
 * §0.39.265 — one place, so the main process and the tests answer exactly the
 * same way. handle(A, req, deps) → { status, body } or null (not an automation
 * route). A is the AutomationEngine; deps carries what only the Electron main
 * process has: the automation pages, opening a folder, reading a macro.
 *
 * Every route except webhooks (which carry their own secret) answers Clear
 * Glass's own pages and local tools only — workflows drive signed-in pages,
 * so a script on some other site must not be able to start or edit one.
 */
const S = require('./steps.js');

const LOCAL_ORIGIN = /^(null|file:\/\/.*|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

/** the list view: without the engine's memory (seen-item lists can be long) or runtime-only fields */
function listView(A) {
  return A.list().map(({ memory, _nextRuns, ...w }) => ({ ...w, nextRunAt: A.nextRunAt({ ...w, _nextRuns }) }));
}

async function handle(A, { method, url, body = {}, headers = {}, rawBody = '' }, deps = {}) {
  const u = new URL(url, 'http://127.0.0.1');
  if (!u.pathname.startsWith('/automation/')) return null;
  const p = u.pathname.split('/').map(decodeURIComponent);   // ['', 'automation', …]
  const q = (k) => u.searchParams.get(k);
  const ok = (b, status = 200) => ({ status, body: b });
  const res = (r, bad = 400) => ({ status: r && r.ok === false ? (r.status || bad) : 200, body: r });
  if (!A) return ok({ ok: false, error: 'the agent mesh is not ready' }, 503);

  // webhooks: the one route another machine or site may call
  if (p[2] === 'hook') {
    if (method !== 'POST' || !p[3]) return ok({ ok: false, error: 'POST /automation/hook/<workflow id>?token=…' }, 405);
    const token = headers['x-nexus-token'] || q('token');
    const payload = body && typeof body === 'object' && Object.keys(body).length ? body : rawBody ? { body: rawBody } : {};
    const r = await A.fireWebhook(p[3], token, payload, { wait: q('wait') === '1' });
    const { status, ...rest } = r;
    return ok(rest, status || (r.ok ? 200 : 500));
  }
  if (headers.origin && !LOCAL_ORIGIN.test(headers.origin)) return ok({ ok: false, error: 'automation routes answer local pages only' }, 403);

  const path = u.pathname;
  // ── workflows ────────────────────────────────────────────────────────────
  if (path === '/automation/workflows' && method === 'GET') return ok({ ok: true, workflows: listView(A) });
  if (path === '/automation/workflows' && method === 'POST') return res(A.create(body || {}));
  if ((path === '/automation/log') && method === 'GET') return ok({ ok: true, log: A.getLog(parseInt(q('limit'), 10) || 50, q('workflowId') || null) });
  if (path === '/automation/catalogue' && method === 'GET') return ok({ ok: true, catalogue: S.CATALOGUE, trigger: S.TRIGGER, common: S.COMMON, ops: S.OPS });
  if (path === '/automation/templates' && method === 'GET') return ok({ ok: true, templates: require('./templates.js').TEMPLATES });
  if (path === '/automation/active' && method === 'GET') return ok({ ok: true, runs: A.activeRuns() });
  if (path === '/automation/import' && method === 'POST') return res(A.importWorkflow(body));
  if (path === '/automation/step' && method === 'POST') return ok(await A.runStep((body && body.step) || body, { vars: (body && body.vars) || {}, workflowId: (body && body.workflowId) || null }));
  if (p[2] === 'cron' && method === 'GET') {   // the trigger editor's live preview
    const C = require('./cron.js');
    const expr = q('expr') || '';
    try { C.parse(expr); const next = []; let t = Date.now(); for (let i = 0; i < 3 && t; i++) { t = C.next(expr, t); if (t) next.push(t); } return ok({ ok: true, text: C.describe(expr), next }); }
    catch (e) { return ok({ ok: false, error: e.message }); }
  }
  if (p[2] === 'events' && p[3] && method === 'POST') return ok({ ok: true, started: A.emitEvent(p[3], body || {}) });
  if (p[2] === 'runs' && p[3] && !p[4] && method === 'GET') { const r = A.getRun(p[3]); return r ? ok({ ok: true, run: r }) : ok({ ok: false, error: 'no such run' }, 404); }
  if (p[2] === 'runs' && p[3] && p[4] === 'cancel' && method === 'POST') return res(A.cancel(p[3]), 404);
  if (path === '/automation/from-macro' && method === 'POST') {
    if (!deps.getMacro) return ok({ ok: false, error: 'macros are not available here' }, 501);
    const m = await deps.getMacro(body.name);
    if (!m || !m.ok) return ok({ ok: false, error: (m && m.error) || 'no such macro' }, 404);
    const w = require('./from-macro.js').macroToWorkflow(m.macro, { name: body.workflowName });
    const r = A.create({ name: w.name, description: w.description, status: 'paused', vars: w.vars, steps: w.steps });
    return ok({ ...r, warnings: w.warnings });
  }
  if (p[2] === 'pages') {
    if (!deps.pages) return ok({ ok: true, pages: [] });
    if (!p[3] && method === 'GET') return ok({ ok: true, pages: deps.pages.list() });
    if (p[3] && /^(show|close)$/.test(p[4] || '') && method === 'POST') {
      try { return ok({ ok: true, result: await deps.pages.act(p[3], p[4]) }); } catch (e) { return ok({ ok: false, error: e.message }, 400); }
    }
  }

  // ── one workflow ─────────────────────────────────────────────────────────
  if (p[2] === 'workflows' && p[3]) {
    const id = p[3];
    if (!A.get(id)) return ok({ ok: false, error: 'no such workflow' }, 404);
    if (!p[4]) {
      if (method === 'PATCH') return res(A.update(id, body || {}), 404);
      if (method === 'DELETE') return res(A.remove(id), 404);
      if (method === 'GET') { const w = listView(A).find(x => x.id === id); return ok({ ok: true, workflow: w }); }
    }
    if (p[4] === 'run' && method === 'POST') {
      try { const r = await A.run(id, 'manual', { vars: (body && body.vars) || {} }); return ok(r, r.ok ? 200 : 500); }
      catch (e) { return ok({ ok: false, error: e.message }, 500); }
    }
    if (p[4] === 'start' && method === 'POST') {   // start without waiting for the end
      A.run(id, 'manual', { vars: (body && body.vars) || {} }).catch(() => {});
      await new Promise(r => setTimeout(r, 30));
      return ok({ ok: true, running: A.activeRuns(id) });
    }
    if (p[4] === 'runs' && method === 'GET') return ok({ ok: true, runs: A.listRuns(id, parseInt(q('limit'), 10) || 30) });
    if (p[4] === 'cancel' && method === 'POST') return ok(A.cancelAll(id));
    if (p[4] === 'export' && method === 'GET') return res(A.exportWorkflow(id));
    if (p[4] === 'validate' && method === 'GET') return res(A.validate(id));
    if (p[4] === 'output' && method === 'POST') {
      const dir = A.outputDir(id);
      require('fs').mkdirSync(dir, { recursive: true });
      if (!deps.openPath) return ok({ ok: true, dir });
      const err = await deps.openPath(dir);
      return err ? ok({ ok: false, error: err }, 500) : ok({ ok: true, dir });
    }
    // steps
    if (p[4] === 'steps' && !p[5] && method === 'POST') return res(A.addStep(id, body || {}));
    if (p[4] === 'steps' && p[5] && !p[6] && method === 'PATCH') return res(A.updateStep(id, p[5], body || {}), 404);
    if (p[4] === 'steps' && p[5] && !p[6] && method === 'DELETE') return res(A.removeStep(id, p[5]), 404);
    if (p[4] === 'steps' && p[5] && p[6] === 'move' && method === 'POST') return res(A.moveStep(id, p[5], body && body.dir), 404);
  }
  return ok({ ok: false, error: `no automation route ${method} ${path}` }, 404);
}

module.exports = { handle, listView, LOCAL_ORIGIN };
