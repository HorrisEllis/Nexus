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
const json = (r, o) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(o)); };
http.createServer(async (q, r) => {
  const u = new URL(q.url, 'http://x');
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
    for (const s of rr) for (const k of Object.keys(s.tasks)) { const v = s.tasks[k] || {}; s.tasks[k] = { status: v.status, ms: v.ms, error: v.error ? head(v.error, 300) : null, out: v.output ? head(typeof v.output === 'string' ? v.output : JSON.stringify(v.output), 1500) : null }; }
    const up = ((sys && (sys.systems || sys)) || []).map((s) => ({ name: s.name, state: s.state, port: s.port }));
    const host = use && use.usage ? use.usage.host : null;
    const loaded = ((ps && ps.models) || []).map((m) => ({ name: m.name, vramMB: Math.round((m.size_vram || 0) / 1048576), sizeMB: Math.round((m.size || 0) / 1048576) }));
    return json(r, { at: Date.now(), jobs: out, runs: rr, pipelines: pipes, systems: up, host, loaded });
  }
  // the side panel's terminal: COS's console lines, and its command line (the same route COS's Console page uses; what is typed there is his)
  if (u.pathname === '/logs') return json(r, await get(7799, '/api/cos/console?limit=' + Math.min(800, Number(u.searchParams.get('limit')) || 300)));
  if (u.pathname === '/cli' && q.method === 'POST') {
    let b = ''; q.on('data', (c) => b += c); await new Promise((res) => q.on('end', res));
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
  if (u.pathname === '/baseline') return json(r, await get(7799, '/api/cos/pipeline/baseline?pipeline=' + encodeURIComponent(u.searchParams.get('pipeline') || ''), 30000));
  if (u.pathname === '/theme.css') { r.setHeader('Content-Type', 'text/css'); r.end(fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'css', 'nexus-theme.css'))); return; }
  r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(path.join(__dirname, 'index.html')));
}).listen(47125, '127.0.0.1', () => console.log('pipeline screen preview on http://127.0.0.1:47125/'));
