'use strict';
// cos/ui/run-console-preview/server.js — a preview of the pipeline screen: the canvas and the run console as one UI (2026-11-21, PC4 + PC8 slice d).
// James, 2026-11-21: "ideariums work surface, where it shows the code being generated live. i would love a console for that or something in the
// pipeline" · "where are the side tabs like idearium has? also no side panels ... Make it enterprise grade." · "they both need to be the same ui.
// the tabs css style identicle to idearium, expanded, and more proffessional and enterprise grade. expanded."
// Reads only, nothing hardcoded: COS's pipelines, runs and systems; the Ollama system's jobs (each job's text so far, job.partial, LS1); Ollama's
// loaded models; a pipeline's step baseline, fetched on its own (it is slow). Idearium's own theme file. It never acts.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const get = (port, p, ms = 6000) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: p, timeout: ms }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (_) { res(null); } }); }); q.on('timeout', () => { q.destroy(); res(null); }); q.on('error', () => res(null)); });
const tail = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(-n) : s; };
const head = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) : s; };
let PH = null;
const json = (r, o) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(o)); };
// 2026-11-25 (his: "the automation build the same. not stripped. but built"): the handler is also COS's, at /api/cos/view/* (cos/manager/server.js),
// which gives it the path under /api/cos/view (q.viewUrl) and the body it already read (q.cosBody)
async function handle(q, r) {
  const u = new URL(q.viewUrl || q.url, 'http://x');
  if (u.pathname === '/data') {
    const [jobs, runs, sys, use, ps, pl] = await Promise.all([get(3749, '/api/jobs'), get(7799, '/api/cos/automation/pipeline-runs?limit=80'), get(7799, '/api/cos/systems'),
      get(7799, '/api/cos/usage'), get(11434, '/api/ps'), get(7799, '/api/cos/automation/pipelines')]);
    const out = ((jobs && jobs.jobs) || []).map((j) => {
      const m = j.meta || {}; const text = j.partial || (j.result && (j.result.response || j.result.text)) || '';
      return { id: j.uuid, status: j.status, model: j.model, intent: j.intent || null, source: m.source || null, gap: m.gap || m.fn || null, phase: m.phase || null,
        contract: j.contractId || m.contractId || null, queued: j.queuedAt || null, at: j.startedAt || null, end: j.completedAt || null,
        ms: j.durationMs || (j.startedAt ? Date.now() - j.startedAt : null), chars: text.length, text: tail(text, 12000), thinking: tail(j.partialThinking, 2000),
        prompt: head(j.prompt, 4000), promptChars: String(j.prompt || '').length, error: j.error || null };
    });
    const rr = ((runs && runs.runs) || []).map((x) => ({ id: x.id, pipelineId: x.pipelineId, name: x.pipelineName, status: x.status, at: x.startedAt, end: x.finishedAt,
      error: x.error ? head(x.error, 300) : null, tasks: x.tasks || {} }));
    const pipes = ((pl && pl.pipelines) || []).filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name, description: p.description || '', vars: p.vars || {}, settings: p.settings || {},
      updatedAt: p.updatedAt, tasks: (p.tasks || []).map((t) => ({ id: t.id, label: t.label || t.id, depends_on: t.depends_on || t.dependsOn || [], step: t.step || null, gate: t.gate || null,
        retries: t.retries, onFail: t.onFail, when: t.when || null, method: t.method || null })), createdAt: p.createdAt || null }));
    for (const s of rr) for (const k of Object.keys(s.tasks)) { const v = s.tasks[k] || {}; s.tasks[k] = { status: v.status, ms: v.ms, ...(v.grownFrom ? { grownFrom: v.grownFrom, dependsOn: v.dependsOn || null, label: v.label || null, why: v.why || null, recovered: !!v.recovered } : {}), error: v.error ? head(v.error, 300) : null, out: v.output ? head(typeof v.output === 'string' ? v.output : JSON.stringify(v.output), 1500) : null }; }
    // 2026-11-26 — James: "these are not systems. inference/model server is. remove them from the list." Each model COS runs is part of the
    // model server: one row for it, up while any model is up, with how many are up
    const all = ((sys && (sys.systems || sys)) || []), models = all.filter((s) => /^model-/.test(s.name));
    const up = all.filter((s) => !/^model-/.test(s.name)).map((s) => ({ name: s.name, state: s.state, port: s.port }));
    if (models.length) up.push({ name: 'model server', state: models.some((s) => s.state === 'up') ? 'up' : 'stopped', port: null, models: `${models.filter((s) => s.state === 'up').length}/${models.length}` });
    const host = use && use.usage ? use.usage.host : null;
    const loaded = ((ps && ps.models) || []).map((m) => ({ name: m.name, vramMB: Math.round((m.size_vram || 0) / 1048576), sizeMB: Math.round((m.size || 0) / 1048576) }));
    // the build a pipeline step runs (cos/build/emerge-build.js): its own rows on disk, so nothing in the step is invisible (James, 2026-11-24:
    // "nothing should be invisible in the pipeline. where is the outputs? or anything usefull.")
    let build = null; try { const B = path.join(ROOT, 'cos', 'data', 'build'), f = fs.readdirSync(B).filter((x) => /^cbuild-.*\.jsonl$/.test(x)).map((x) => ({ x, t: fs.statSync(path.join(B, x)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
      if (f) { const rs = fs.readFileSync(path.join(B, f.x), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return {}; } }), g = {};
        const plan = (rs.find((x) => x.state === 'planned') || {}).exports || [];
        for (const e of plan) g[e.name] = { name: e.name, state: 'waiting', asks: 0, model: null, note: '' };
        for (const x of rs) if (x.gap) { const k = g[x.gap] || (g[x.gap] = { name: x.gap, state: 'waiting', asks: 0, model: null, note: '', helper: true }); if (x.state === 'gap-asked') k.asks++; k.state = x.state; if (x.model) k.model = x.model; if (x.note) k.note = head(x.note, 200); }
        const pcs = ([...rs].reverse().find((x) => x.state === 'pieces') || {}).pieces || []; for (const p of pcs) if (g[p.name]) g[p.name].state = p.status;
        build = { run: f.x.replace(/\.jsonl$/, ''), phase: (rs[0] || {}).phase, at: f.t, last: (rs[rs.length - 1] || {}).state, gaps: Object.values(g), rows: rs.slice(-40).map((x) => ({ t: x.ts, state: x.state, gap: x.gap || null, note: head(x.note || '', 240) })) };
        // the canvas grows from the gates (James, 2026-11-24: "not deterministic, only rigid static boxes"): every gap file of this phase is a
        // gate, its parent the gap it blocks (a piece broken down hangs under the one it unblocks), its state and tries its own record's
        try { const T = path.join(ROOT, 'idearium', 'data', 'tasks'), ph = build.phase; let dir = null;
          for (const r of fs.readdirSync(T)) { let es = []; try { es = fs.readdirSync(path.join(T, r)); } catch (_) { continue; } const d = es.find((x) => x.endsWith('.' + ph)); if (d) { dir = path.join(T, r, d); break; } }
          if (dir) build.gates = fs.readdirSync(dir).filter((x) => x.endsWith('.gap')).map((x) => { const t = fs.readFileSync(path.join(dir, x), 'utf8');
            return { name: x.replace(/^.*#/, '').replace(/\.gap$/, ''), status: ((/^\s*status:\s*([\w-]+)/m.exec(t) || [])[1]) || 'open', blocks: ((/^\s*blocks:\s*([\w$]+)/m.exec(t) || [])[1]) || null, tries: (t.match(/^\s*said:/gm) || []).length, at: fs.statSync(path.join(dir, x)).mtimeMs, said: tail(t, 1500) }; }); } catch (_) {} } } catch (_) {}
    return json(r, { at: Date.now(), jobs: out, runs: rr, pipelines: pipes, systems: up, host, loaded, build });
  }
  // the side panel's terminal: COS's console lines, and its command line (the same route COS's Console page uses; what is typed there is his)
  if (u.pathname === '/logs') return json(r, await get(7799, '/api/cos/console?limit=' + Math.min(800, Number(u.searchParams.get('limit')) || 300)));
  if (u.pathname === '/cli' && q.method === 'POST') {
    let b = ''; if (q.cosBody !== undefined) b = JSON.stringify(q.cosBody || {}); else { q.on('data', (c) => b += c); await new Promise((res) => q.on('end', res)); }
    let line = ''; try { line = String(JSON.parse(b).line || ''); } catch (_) {}
    const out = await new Promise((res) => { const body = JSON.stringify({ line, by: 'person' }); const rq = http.request({ host: '127.0.0.1', port: 7799, path: '/api/cos/cli', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 60000 },
      (rs) => { let t = ''; rs.on('data', (c) => t += c); rs.on('end', () => { try { res(JSON.parse(t)); } catch (_) { res({ lines: [t.slice(0, 2000)] }); } }); }); rq.on('timeout', () => { rq.destroy(); res({ lines: ['(COS did not answer in 60 s)'] }); }); rq.on('error', (e) => res({ lines: [e.message] })); rq.end(body); });
    return json(r, out);
  }
  // provenance: the phase's ledger history and the repo's lineage, from Idearium's own routes (it may not answer: said, not hidden)
  if (u.pathname === '/lineage') {
    const ph = u.searchParams.get('phase'), repo = u.searchParams.get('repo');
    const [hist, lin] = await Promise.all([ph ? get(4800, '/api/phases/ledger/history?phase=' + encodeURIComponent(ph), 5000) : null, repo ? get(4800, '/api/repos/' + encodeURIComponent(repo) + '/lineage', 5000) : null]);
    return json(r, { idearium: !!(hist || lin), history: hist, lineage: lin && lin.lineage });
  }
  // the editor reads what COS's engine offers (cos/automation/steps.js CATALOGUE: every step type and its fields) and what each system offers
  // (its own GET /commands), so nothing in the menus is typed by hand
  if (u.pathname === '/catalogue') return json(r, await get(7799, '/api/cos/automation/catalogue'));
  if (u.pathname === '/commands') {
    const sys = await get(7799, '/api/cos/systems'), s = ((sys && (sys.systems || sys)) || []).find((x) => x.name === u.searchParams.get('system'));
    const c = s && s.port ? await get(s.port, '/commands', 5000) : null, out = new Set();
    const walk = (v) => { if (typeof v === 'string') { if (/^\/[a-z]/i.test(v) && v.length < 120) out.add(v.split('?')[0]); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(c); return json(r, { system: s ? s.name : null, answered: !!c, paths: [...out].sort().slice(0, 400) });
  }
  // the maps' phases (docs/*.spec, the files the ledger and Idearium read): each phase, its map, status, what it does, what it waits on
  if (u.pathname === '/phases') {
    if (!PH || Date.now() - PH.at > 60000) { const out = [], dir = path.join(ROOT, 'docs');
      for (const f of fs.readdirSync(dir).filter((x) => /phasemap\.spec$/.test(x))) { let txt; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_) { continue; }
        const lines = txt.split(/\r?\n/), at = lines.findIndex((l) => /^phases:\s*$/.test(l)); if (at < 0) continue; let cur = null;
        for (let i = at + 1; i < lines.length; i++) { const l = lines[i]; if (/^\S/.test(l)) break;
          const m = /^  ([A-Za-z][A-Za-z0-9_]*):\s*$/.exec(l); if (m) { cur = { id: m[1], map: 'docs/' + f, status: '', does: '', depends_on: [] }; out.push(cur); continue; }
          if (!cur) continue; const s = /^    status:\s*"?([A-Za-z_ -]+)/.exec(l); if (s && !cur.status) cur.status = s[1].trim();
          const d = /^    depends_on:\s*\[(.*)\]/.exec(l); if (d && !cur.depends_on.length) cur.depends_on = d[1].split(',').map((x) => x.trim()).filter(Boolean);
          if (/^    does:/.test(l) && !cur.does) { let t = l.replace(/^    does:\s*(>-|\|)?\s*/, ''); for (let j = i + 1; j < lines.length && /^      /.test(lines[j]) && t.length < 260; j++) t += ' ' + lines[j].trim(); cur.does = t.replace(/^["']|["']$/g, '').slice(0, 280); } } }
      PH = { at: Date.now(), phases: out }; }
    return json(r, { phases: PH.phases });
  }
  // each system's own component registry (its registry-components.js, the drawbridge: §5.16), read as the cockpit preview reads it
  if (u.pathname === '/components') {
    const sys = await get(7799, '/api/cos/systems'), DIR = { 'ollama-bridge': 'ollama' }, out = [];
    for (const s of ((sys && (sys.systems || sys)) || [])) { const f = path.join(ROOT, DIR[s.name] || s.name, 'registry-components.js');
      try { delete require.cache[require.resolve(f)]; const m = require(f), list = Array.isArray(m) ? m : (m.COMPONENTS || m.components || []);
        for (const c of list) out.push({ system: s.name, id: c.id || c.name, name: c.name || c.id, about: c.description || c.about || '', method: c.route && c.route.method || null, path: c.route && c.route.path || null }); } catch (_) {} }
    return json(r, { components: out });
  }
  // the Frameworks tab (2026-11-24): every .framework file outside data/, its title line; the framework step takes its file
  if (u.pathname === '/frameworks') { const out = [];
    const walk = (d, rel) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) { if (/^(node_modules|data|\.git|_archive)$/.test(e.name)) continue; const p = path.join(d, e.name), r2 = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) { if (r2.split('/').length < 4) walk(p, r2); } else if (/\.framework$/.test(e.name)) { let t = ''; try { t = fs.readFileSync(p, 'utf8'); } catch (_) {}
          const title = (t.split(/\r?\n/).find((l) => /^#\s*\S/.test(l)) || e.name).replace(/^#\s*/, ''); out.push({ file: r2, title: head(title, 140), lines: t.split(/\r?\n/).length, steps: /schema\.process|^\s*steps:/m.test(t) }); } } };
    walk(ROOT, ''); return json(r, { frameworks: out }); }
  // the Templates tab (2026-11-24): Nexus's own node schemas (lib/node-schemas.js list + frame): each kind of node and what each of its fields holds
  if (u.pathname === '/templates') { let out = []; try { const s = require(path.join(ROOT, 'lib', 'node-schemas.js'));
      out = s.list().map((x) => { let holes = []; try { holes = (s.frame(x.type).holes || []).map((h) => ({ path: h.path, about: h.about })); } catch (_) {} return { type: x.type, status: x.status, holes }; }); } catch (e) { return json(r, { templates: [], error: e.message }); }
    return json(r, { templates: out }); }
  if (u.pathname === '/baseline') return json(r, await get(7799, '/api/cos/pipeline/baseline?pipeline=' + encodeURIComponent(u.searchParams.get('pipeline') || ''), 30000));
  if (u.pathname === '/theme.css') { r.setHeader('Content-Type', 'text/css'); r.end(fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'css', 'nexus-theme.css'))); return; }
  r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(path.join(__dirname, 'index.html')));
}
module.exports = { handle };
if (require.main === module) http.createServer(handle).listen(47125, '127.0.0.1', () => console.log('pipeline screen preview on http://127.0.0.1:47125/'));
