'use strict';
// cos/ui/run-console-preview/server.js — a preview of the pipeline's run console on live data (2026-11-21, PC8 slice d, preview first).
// James, 2026-11-21: "ideariums work surface, where it shows the code being generated live. i would love a console for that or something in the
// pipeline. like a console for the pipeline, and the ui have all the side tabs idearium does, plus anything else additive?" · after the first
// preview: "where are the side tabs like idearium has? also no side panels ... Make it enterprise grade."
// Reads only: the Ollama system's jobs (each job's text so far, job.partial, LS1; its prompt), Ollama's loaded models, COS's systems, usage and
// pipeline runs. The theme is Nexus's own (lib/ui/themes/nexus-dark.css). It never acts.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const get = (port, p, ms = 6000) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: p, timeout: ms }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (_) { res(null); } }); }); q.on('timeout', () => { q.destroy(); res(null); }); q.on('error', () => res(null)); });
const tail = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(-n) : s; };
const head = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) : s; };
http.createServer(async (q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/data') {
    const [jobs, runs, sys, use, ps] = await Promise.all([get(3749, '/api/jobs'), get(7799, '/api/cos/automation/pipeline-runs?limit=20'), get(7799, '/api/cos/systems'),
      get(7799, '/api/cos/usage'), get(11434, '/api/ps')]);
    const out = ((jobs && jobs.jobs) || []).map((j) => {
      const m = j.meta || {}; const text = j.partial || (j.result && (j.result.response || j.result.text)) || '';
      return { id: j.uuid, status: j.status, model: j.model, intent: j.intent || null, source: m.source || null, gap: m.gap || m.fn || null, phase: m.phase || null,
        run: m.runId || null, contract: j.contractId || m.contractId || null, queued: j.queuedAt || null, at: j.startedAt || null, end: j.completedAt || null,
        ms: j.durationMs || (j.startedAt ? Date.now() - j.startedAt : null), chars: text.length, text: tail(text, 12000), thinking: tail(j.partialThinking, 2000),
        prompt: head(j.prompt, 4000), promptChars: String(j.prompt || '').length, error: j.error || null, warp: j.warpSource || null };
    });
    const rr = ((runs && runs.runs) || []).map((x) => ({ id: x.id, name: x.pipelineName, status: x.status, at: x.startedAt, end: x.finishedAt, error: x.error ? head(x.error, 200) : null,
      tasks: Object.entries(x.tasks || {}).map(([k, v]) => ({ id: k, status: v.status, ms: v.ms })) }));
    const up = ((sys && (sys.systems || sys)) || []).map((s) => ({ name: s.name, state: s.state, port: s.port }));
    const host = use && use.usage ? use.usage.host : null;
    const loaded = ((ps && ps.models) || []).map((m) => ({ name: m.name, vramMB: Math.round((m.size_vram || 0) / 1048576), sizeMB: Math.round((m.size || 0) / 1048576) }));
    r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ at: Date.now(), jobs: out, runs: rr, systems: up, host, loaded })); return;
  }
  if (u.pathname === '/theme.css') { r.setHeader('Content-Type', 'text/css'); r.end(fs.readFileSync(path.join(ROOT, 'lib', 'ui', 'themes', 'nexus-dark.css'))); return; }
  r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(path.join(__dirname, 'index.html')));
}).listen(47125, '127.0.0.1', () => console.log('run console preview on http://127.0.0.1:47125/'));
