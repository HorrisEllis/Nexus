'use strict';
/**
 * orchestrator/cos-ui-door.js — the COS channel's door on the orchestrator (MG34, 2026-11-01). Spec: cos/spec/cos-manager.spec MOD-MG-COS-CHANNEL.
 * James, 2026-11-01: "not tension, thats noise. cos ui needs a channel."
 * status(): COS's cockpit (:7797) and manager (:7799 /api/cos/health) probed, each said. start(): only what is down — the manager (it starts
 * its cockpit and boots nothing; the launcher's way in, MG17: only the server's path is known, never its code) or the cockpit alone — and
 * never a second supervisor beside an old autopilot on the manager's port.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

const ports = (o = {}) => ({ uiPort: o.uiPort || Number(process.env.COS_UI_PORT) || 7797, mgrPort: o.mgrPort || Number(process.env.COS_MANAGER_PORT) || 7799 });
function probe(port, p, timeout = 2500) {
  return new Promise(r => {
    const q = http.get({ host: '127.0.0.1', port, path: p, timeout }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) {} r({ up: true, status: x.statusCode, json: j }); }); });
    q.on('timeout', () => { q.destroy(); r({ up: false, why: `no answer in ${timeout / 1000} s` }); });
    q.on('error', (e) => r({ up: false, why: e.code || e.message }));
  });
}
async function status(o = {}) {
  const { uiPort, mgrPort } = ports(o);
  const [ui, mg] = await Promise.all([probe(uiPort, '/'), probe(mgrPort, '/api/cos/health')]);
  const isMgr = !!(mg.up && mg.json && mg.json.service === 'cos-manager');
  return { ok: true,
    cockpit: { up: ui.up, url: `http://127.0.0.1:${uiPort}/`, ...(ui.up ? {} : { why: `nothing answers on :${uiPort} (${ui.why})` }) },
    manager: { up: isMgr, port: mgrPort, ...(isMgr ? { pid: mg.json.pid, systems: mg.json.systems }
      : { why: mg.up ? `something on :${mgrPort} answers, but not as COS's manager (an old autopilot?)` : `nothing answers on :${mgrPort} (${mg.why})`, other: !!mg.up }) } };
}
async function start(o = {}) {
  const { uiPort, mgrPort } = ports(o), root = o.root || ROOT;
  const st = await status({ uiPort, mgrPort });
  if (st.cockpit.up) return { ...st, ok: true, started: null, why: 'the cockpit already answers' };
  if (st.manager.other) return { ...st, ok: false, code: 409, error: `${st.manager.why} — not starting a second supervisor beside it; restart Nexus with npm run start:all` };
  const logDir = o.logDir || path.join(root, 'data', 'logs'); fs.mkdirSync(logDir, { recursive: true });
  const log = path.join(logDir, 'cos-start.log'), fd = fs.openSync(log, 'a');
  const args = st.manager.up ? [path.join(root, 'cos', 'ui', 'serve.js'), '--port', String(uiPort), '--manager', `http://127.0.0.1:${mgrPort}`] : [path.join(root, 'cos', 'manager', 'server.js')];
  let child;
  try { child = require('child_process').spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...(o.env || {}), COS_UI_PORT: String(uiPort), COS_MANAGER_PORT: String(mgrPort) }, detached: true, stdio: ['ignore', fd, fd], windowsHide: true }); child.unref(); }
  catch (e) { return { ok: false, code: 500, error: `could not start: ${e.message}`, log }; }
  finally { try { fs.closeSync(fd); } catch (_) {} }
  for (let i = 0; i < (o.waitTicks || 40); i++) { await new Promise(r => setTimeout(r, 250)); if ((await probe(uiPort, '/', 1000)).up) break; }
  const after = await status({ uiPort, mgrPort });
  return { ...after, ok: after.cockpit.up, code: after.cockpit.up ? 200 : 502, started: st.manager.up ? 'cockpit' : 'manager', pid: child.pid, log: path.relative(root, log),
    ...(after.cockpit.up ? {} : { error: `started (pid ${child.pid}) but the cockpit does not answer yet — see ${path.relative(root, log)}` }) };
}
module.exports = { status, start, probe, MODULE_ID: 'orchestrator.cos-ui-door', VERSION: '1.0.0' };
