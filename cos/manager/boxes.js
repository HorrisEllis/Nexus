'use strict';
/**
 * cos/manager/boxes.js — COS's door to the box shape (PC1, MOD-PC-BOX). JavaScript only because COS's manager is JavaScript by its contract
 * (cos/spec/cos-manager.spec) until CIE10/CIE13; it holds no logic of the shape. The shape is Emerge's: cos/automation/box.eg, run through
 * Emerge's own CLI (eg run cos/automation/cli.eg boxes <file.json>).
 *
 * James, 2026-11-08: "cli commands, agent tools, copilot commands, inject nodes to agents. keep going. i want this built and added to cos ui."
 *
 *   createBoxes({ automation, fetchProcedure, root }) → { of({ pipeline } | { procedure }) → Promise<{ ok, kind, graph, problems, unchecked } | { ok:false, code, error }> }
 *   automation       COS's automation door (its handle()): the pipeline is read from it, never from its folder
 *   idearium         (path) → Promise<json>: a GET on Idearium's own route (its procedures), never its folder
 *   procedures()     → Promise<{ ok, procedures }>: Idearium's GET /api/procedures, forwarded so the cockpit reads only COS
 */
const fs = require('fs'), os = require('os'), path = require('path'), { execFile } = require('child_process');

function createBoxes({ automation, idearium, root = path.join(__dirname, '..', '..') } = {}) {
  const EG = path.join(root, 'emerge/emerge/lang/eg.js'), CLI = path.join(root, 'cos/automation/cli.eg');
  const run = (obj, cmd = 'boxes') => new Promise((resolve) => {
    const f = path.join(os.tmpdir(), `cos-boxes-${process.pid}-${Date.now().toString(36)}.json`);
    fs.writeFileSync(f, JSON.stringify(obj));
    execFile(process.execPath, [EG, 'run', CLI, cmd, f], { cwd: root, timeout: 30000, maxBuffer: 8 << 20 }, (err, out, errOut) => {
      try { fs.unlinkSync(f); } catch (_) {}
      if (err) return resolve({ ok: false, code: 500, error: `Emerge's box shape did not answer: ${(errOut || err.message).trim().split('\n').pop()}` });
      try { resolve({ ok: true, ...JSON.parse(String(out).trim().split('\n').pop()) }); } catch (e) { resolve({ ok: false, code: 500, error: `Emerge answered what is not JSON: ${e.message}` }); }
    });
  });
  // as: 'boxes' (the graph) or 'erv' (an ERAVOS project: one Box tool per step and the wires, which ERAVOS opens with its own Open)
  async function of({ pipeline = null, procedure = null, as = 'boxes' } = {}) {
    const cmd = as === 'erv' ? 'erv' : 'boxes';
    if (pipeline) {
      const r = await automation.handle({ method: 'GET', url: `/automation/pipelines/${encodeURIComponent(pipeline)}`, body: {}, headers: {} });
      const p = r && r.body && (r.body.pipeline || r.body);
      if (!r || r.status >= 400 || !p || !Array.isArray(p.tasks)) return { ok: false, code: 404, error: `no pipeline "${pipeline}"` };
      return cmd === 'erv' ? { ok: true, erv: (await run(p, 'erv')), name: p.name || pipeline } : { ...(await run(p)), source: { pipeline, name: p.name || pipeline } };
    }
    if (procedure) {
      let p = null; try { const r = await idearium(`/api/procedures/${encodeURIComponent(procedure)}`); p = r && (r.procedure || r); } catch (e) { return { ok: false, code: 502, error: `Idearium did not answer for procedure "${procedure}": ${e.message}` }; }
      if (!p || !Array.isArray(p.steps)) return { ok: false, code: 404, error: `no procedure "${procedure}"` };
      return cmd === 'erv' ? { ok: true, erv: (await run(p, 'erv')), name: p.name || procedure } : { ...(await run(p)), source: { procedure, name: p.name || procedure } };
    }
    return { ok: false, code: 400, error: 'name one: ?pipeline=<id> or ?procedure=<id>' };
  }
  async function procedures() {
    try { const r = await idearium('/api/procedures'); return { ok: true, procedures: (r && r.procedures) || [] }; }
    catch (e) { return { ok: false, code: 502, error: `Idearium did not answer: ${e.message}` }; }
  }
  return { of, procedures };
}

module.exports = { createBoxes, MODULE_ID: 'cos.manager.boxes', VERSION: '1.0.0' };
