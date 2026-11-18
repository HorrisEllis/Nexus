'use strict';
// cos/ui/cockpit-preview/server.js — a preview of the cockpit on Nexus's own sources (2026-11-18, his "Make a preview").
// Nothing hardcoded: systems, states and resources from COS; components from each system's own registry (§5.16); wires from each
// compartment's declared dependsOn; the timeline from COS's ledger. A preview server only: it reads, it never acts.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIR = { 'ollama-bridge': 'ollama', 'clear-glass': 'clear-glass' };
const dirOf = (s) => path.join(ROOT, DIR[s] || s);
const cos = (p) => new Promise((res) => { http.get({ host: '127.0.0.1', port: 7799, path: p, timeout: 8000 }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (_) { res(null); } }); }).on('error', () => res(null)); });
function registry(s) {
  try { delete require.cache[require.resolve(path.join(dirOf(s), 'registry-components.js'))]; const m = require(path.join(dirOf(s), 'registry-components.js'));
    const list = Array.isArray(m) ? m : (m.COMPONENTS || []); return { read: true, components: list.map((c) => ({ id: c.id || c.name, name: c.name || c.id, route: c.route ? `${c.route.method} ${c.route.path}` : null, about: c.description || '' })) };
  } catch (e) { return { read: false, why: e.code === 'MODULE_NOT_FOUND' ? 'no registry-components.js' : e.message }; }
}
function compartment(s) { try { const c = JSON.parse(fs.readFileSync(path.join(dirOf(s), 'compartment.json'), 'utf8')); return { dependsOn: c.dependsOn || {}, findings: c.boundaryFindings || null, mode: c.runtime && c.runtime.process && c.runtime.process.boundary ? c.runtime.process.boundary.mode : null }; } catch (_) { return null; } }
function ledger() {
  const f = path.join(ROOT, 'cos', 'data', 'manager', 'ledger.jsonl'); const out = [];
  try { const st = fs.statSync(f); const n = Math.min(st.size, 6 << 20); const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd);
    const since = Date.now() - 24 * 3600e3;
    for (const l of b.toString('utf8').split('\n')) { let e; try { e = JSON.parse(l); } catch (_) { continue; }
      if (e.ts >= since && /^(crash|circuit-open|restart|adopted|handover|boot|pulse-missed|pulse-recovered|spawn|stop|idle-stop|refused|over-limit)$/.test(e.kind)) out.push({ at: e.ts, kind: e.kind, sys: e.system, why: String(e.why || '').slice(0, 220) }); }
  } catch (_) {}
  return out;
}
http.createServer(async (q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/data') {
    const sys = await cos('/api/cos/systems'), use = await cos('/api/cos/usage');
    const systems = ((sys && (sys.systems || sys)) || []).map((s) => ({ name: s.name, state: s.state, pid: s.pid, port: s.port, critical: s.critical, restarts: s.restarts && s.restarts.count,
      usage: use && use.usage && use.usage.systems ? use.usage.systems[s.name] || null : null, registry: registry(s.name), compartment: compartment(s.name) }));
    const pl = await cos('/api/cos/automation/pipelines'), runs = await cos('/api/cos/automation/pipeline-runs?limit=60');
    const pipelines = ((pl && pl.pipelines) || []).map((p) => ({ id: p.id, name: p.name, steps: (p.tasks || []).map((t) => ({ id: t.id, label: t.label, sys: (/^nexus:\/\/([a-z0-9-]+)/i.exec(String((t.step && t.step.config && t.step.config.url) || '')) || [])[1] || null })) }));
    const rr = ((runs && runs.runs) || []).map((x) => ({ id: x.id, pipelineId: x.pipelineId, name: x.pipelineName, status: x.status, at: x.startedAt, end: x.finishedAt, error: x.error ? String(x.error).slice(0, 200) : null,
      tasks: Object.fromEntries(Object.entries(x.tasks || {}).map(([k, v]) => [k, { status: v.status, ms: v.ms }])) }));
    const turns = []; try { const d = path.join(ROOT, 'ollama', 'data', 'metrics'); for (const f of fs.readdirSync(d).filter((f) => /^turns-/.test(f)).sort().slice(-2)) for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) { try { turns.push(JSON.parse(l).payload); } catch (_) {} } } catch (_) {}
    r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ at: Date.now(), host: use && use.usage ? use.usage.host : null, systems, events: ledger(), pipelines, runs: rr, turns: turns.slice(-200) })); return;
  }
  r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(path.join(__dirname, 'index.html')));
}).listen(47124, '127.0.0.1', () => console.log('cockpit preview on http://127.0.0.1:47124/'));
