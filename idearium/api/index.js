/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Idearium HTTP API — idearium/api/index.js                             ║
 * ║  UUID:    idearium-api-v1-0000-4000-0000-000000000002                  ║
 * ║  Version: 2.0.0  ·  Port: 4800                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Every endpoint declared in interaction-contract.json is implemented here.
 * The UI talks ONLY to this layer. Never to core directly.
 * SSE on /sse — broadcasts all IdeaOS events.
 *
 * §1.2  Every error is loud, specific, traceable.
 * §5.2  Everything implements the bridge.
 */

import http         from 'http';
import { getIdeaOS, VERSION } from '../core/index.js';

const PORT    = 4800;
const BINDING = '127.0.0.1';

// ─── Body parser ─────────────────────────────────────────────────────────────

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ok: true, ...data }));
}

function err(res, code, message, detail = null) {
  // §1.2 — specific, not generic
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ok: false, error: message, detail }));
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

// ─── Router ──────────────────────────────────────────────────────────────────

function matchRoute(method, url) {
  const clean = url.split('?')[0].replace(/\/+$/, '') || '/';
  const segs  = clean.split('/').filter(Boolean);

  // Static routes first
  const routes = [
    ['GET',    [],                        'health'],
    ['GET',    ['api','contract'],        'contract.get'],
    ['GET',    ['api','stats'],           'stats.get'],
    ['GET',    ['api','snr'],             'snr.current'],
    ['GET',    ['api','snr','history'],   'snr.history'],
    ['GET',    ['api','events'],          'events.log'],
    ['GET',    ['api','ideas'],           'idea.list'],
    ['POST',   ['api','ideas'],           'idea.create'],
    ['GET',    ['api','specs'],           'spec.list'],
    ['GET',    ['api','gaps'],            'gap.list'],
    ['POST',   ['api','gaps'],            'gap.open'],
    ['GET',    ['api','snapshots'],       'snapshot.list'],
    ['POST',   ['api','snapshots'],       'snapshot.push'],
    ['GET',    ['sse'],                   'sse'],
  ];

  for (const [m, pattern, action] of routes) {
    if (m !== method) continue;
    if (pattern.length !== segs.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segs[i];
      else if (pattern[i] !== segs[i]) { match = false; break; }
    }
    if (match) return { action, params };
  }

  // Dynamic routes
  const dynRoutes = [
    ['GET',    ['api','ideas',    ':uuid'],               'idea.show'],
    ['PATCH',  ['api','ideas',    ':uuid'],               'idea.update'],
    ['DELETE', ['api','ideas',    ':uuid'],               'idea.archive'],
    ['POST',   ['api','ideas',    ':uuid','tension'],     'idea.tension'],
    ['POST',   ['api','ideas',    ':uuid','link'],        'idea.link'],
    ['POST',   ['api','ideas',    ':uuid','spec'],        'idea.spec'],
    ['POST',   ['api','ideas',    ':uuid','phase'],       'idea.phase'],
    ['GET',    ['api','specs',    ':uuid'],               'spec.show'],
    ['PATCH',  ['api','specs',    ':uuid'],               'spec.update'],
    ['POST',   ['api','specs',    ':uuid','check'],       'spec.check'],
    ['POST',   ['api','specs',    ':uuid','build'],       'spec.build'],
    ['GET',    ['api','specs',    ':uuid','export'],      'spec.export'],
    ['GET',    ['api','gaps',     ':uuid'],               'gap.show'],
    ['POST',   ['api','gaps',     ':uuid','resolve'],     'gap.resolve'],
    ['POST',   ['api','gaps',     ':uuid','ignore'],      'gap.ignore'],
    ['GET',    ['api','snapshots',':uuid'],               'snapshot.show'],
    ['GET',    ['api','snapshots',':a','diff',':b'],      'snapshot.diff'],
  ];

  for (const [m, pattern, action] of dynRoutes) {
    if (m !== method) continue;
    if (pattern.length !== segs.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segs[i];
      else if (pattern[i] !== segs[i]) { match = false; break; }
    }
    if (match) return { action, params };
  }

  return null;
}

function parseQuery(url) {
  const qs = url.split('?')[1] || '';
  const out = {};
  for (const p of qs.split('&')) { const [k,v] = p.split('='); if(k) out[decodeURIComponent(k)] = decodeURIComponent(v||''); }
  return out;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handle(req, res, route, query, body) {
  const os = getIdeaOS();
  const { action, params } = route;

  switch (action) {

    case 'health':
      return ok(res, { version: VERSION, snr: os.snr, uptime: process.uptime() });

    case 'contract.get':
      try { return ok(res, { contract: os.contract() }); }
      catch (e) { return err(res, 500, e.message); }

    case 'stats.get':
      return ok(res, { stats: os.stats() });

    case 'snr.current':
      return ok(res, { snr: os.snr });

    case 'snr.history':
      return ok(res, { samples: os.snrHistory(parseInt(query.n)||50) });

    case 'events.log':
      return ok(res, { events: os.eventLog(parseInt(query.n)||100) });

    // ── Ideas ──────────────────────────────────────────────────────────────

    case 'idea.list':
      return ok(res, { ideas: os.ideas(query) });

    case 'idea.create': {
      const { text, tags, compartment } = body;
      if (!text) return err(res, 400, 'text required');
      const ev = os.emit('idearium.idea.create', { text, tags: tags||[], compartment: compartment||null, source: 'api' });
      const idea = os.db.ideas[os.db.ideas.length - 1];
      return ok(res, { idea, eventId: ev.uuid });
    }

    case 'idea.show': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const links = os.db.links.filter(l=>l.fromUuid===idea.uuid||l.toUuid===idea.uuid);
      const gaps  = os.gaps({ status:'open' }).filter(g=>(g.between||[]).includes(idea.uuid)||g.ideaUuid===idea.uuid);
      return ok(res, { idea, links, openGaps: gaps });
    }

    case 'idea.update': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.idea.update', { uuid: params.uuid, fields: body, source: 'api' });
      return ok(res, { idea: os.idea(params.uuid) });
    }

    case 'idea.phase': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.phase) return err(res, 400, 'phase required');
      os.emit('idearium.idea.phase', { uuid: params.uuid, phase: body.phase, source: 'api' });
      return ok(res, { idea: os.idea(params.uuid) });
    }

    case 'idea.tension': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.idea.tension', { uuid: params.uuid });
      return ok(res, { idea: os.idea(params.uuid), tension: { score: os.idea(params.uuid).tension } });
    }

    case 'idea.link': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.toUuid) return err(res, 400, 'toUuid required');
      os.emit('idearium.idea.link', { fromUuid: params.uuid, toUuid: body.toUuid, linkType: body.linkType||'resonance', source:'api' });
      return ok(res, { linked: true });
    }

    case 'idea.spec': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.spec.create', { name: body.name || `Spec: ${idea.text.slice(0,40)}`, ideaUuid: params.uuid, source:'api' });
      const spec = os.db.specs[os.db.specs.length - 1];
      return ok(res, { spec });
    }

    case 'idea.archive': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.reason) return err(res, 400, 'reason required (§M1 — nothing deleted)');
      os.emit('idearium.idea.archive', { uuid: params.uuid, reason: body.reason, source:'api' });
      return ok(res, { archived: true });
    }

    // ── Specs ──────────────────────────────────────────────────────────────

    case 'spec.list':
      return ok(res, { specs: os.specs(query) });

    case 'spec.show': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      return ok(res, { spec });
    }

    case 'spec.update': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      os.emit('idearium.spec.update', { uuid: params.uuid, fields: body });
      return ok(res, { spec: os.spec(params.uuid) });
    }

    case 'spec.check': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      os.emit('idearium.spec.check', { uuid: params.uuid });
      return ok(res, { spec: os.spec(params.uuid) });
    }

    case 'spec.build':
      return ok(res, { status: 'build gate not yet implemented — Phase 8 (MOD-008)' });

    case 'spec.export': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      const md = specToMarkdown(spec);
      res.writeHead(200, { 'Content-Type': 'text/markdown', ...CORS });
      return res.end(md);
    }

    // ── Gaps ───────────────────────────────────────────────────────────────

    case 'gap.list':
      return ok(res, { gaps: os.gaps(query) });

    case 'gap.open': {
      if (!body.description) return err(res, 400, 'description required');
      const ev = os.emit('idearium.gap.open', { ...body, source:'api' });
      const gap = os.db.gaps[os.db.gaps.length - 1];
      return ok(res, { gap, eventId: ev.uuid });
    }

    case 'gap.show': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      return ok(res, { gap });
    }

    case 'gap.resolve': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      os.emit('idearium.gap.resolve', { uuid: params.uuid, resolution: body.resolution||'' });
      return ok(res, { gap: os.gap(params.uuid) });
    }

    case 'gap.ignore': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      os.emit('idearium.gap.ignore', { uuid: params.uuid, reason: body.reason||'' });
      return ok(res, { gap: os.gap(params.uuid) });
    }

    // ── Snapshots ──────────────────────────────────────────────────────────

    case 'snapshot.list':
      return ok(res, { snapshots: os.snapshots().slice(0, 50) });

    case 'snapshot.push': {
      os.emit('idearium.snapshot.commit', { message: body.message||'snapshot', branch: body.branch||'main', author:'api' });
      return ok(res, { snapshot: os.snapshots()[0] });
    }

    case 'snapshot.show': {
      const snap = os.snapshot(params.uuid);
      if (!snap) return err(res, 404, `snapshot not found: ${params.uuid}`);
      return ok(res, { snapshot: snap });
    }

    case 'snapshot.diff': {
      const diff = os.diffSnapshots(params.a, params.b);
      if (!diff) return err(res, 404, 'one or both snapshots not found');
      return ok(res, { diff });
    }

    default:
      return err(res, 404, `no handler for: ${action}`);
  }
}

// ─── Spec → Markdown ─────────────────────────────────────────────────────────

function specToMarkdown(spec) {
  let md = `# ${spec.name}\n\n**Version:** ${spec.version}  **Phase:** ${spec.phase}\n\n`;
  for (const s of spec.sections) {
    md += `## ${s.title}\n\n`;
    if (s.content) md += `${s.content}\n\n`;
    else md += `_not yet written_\n\n`;
  }
  return md;
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function startAPI() {
  const os = getIdeaOS();

  const server = http.createServer(async (req, res) => {
    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    // SSE
    if (req.url === '/sse') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        ...CORS,
      });
      res.write(': connected\n\n');
      os.addSSEClient(res);
      // Send current state immediately on connect
      res.write(`data: ${JSON.stringify({ type:'idearium.ready', payload: os.stats(), ts: Date.now() })}\n\n`);
      return;
    }

    const route = matchRoute(req.method, req.url);
    if (!route) {
      return err(res, 404, `${req.method} ${req.url.split('?')[0]} not found`);
    }

    const query = parseQuery(req.url);
    let body = {};
    if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
      try { body = await readBody(req); }
      catch (e) { return err(res, 400, 'body parse failed', e.message); }
    }

    try {
      await handle(req, res, route, query, body);
    } catch (e) {
      console.error('[API] Unhandled error:', e);
      err(res, 500, 'internal error', e.message);
    }
  });

  server.listen(PORT, BINDING, () => {
    console.log(`[Idearium API] v${VERSION} on http://${BINDING}:${PORT}`);
    console.log(`[Idearium API] SSE: http://${BINDING}:${PORT}/sse`);
    console.log(`[Idearium API] Contract: http://${BINDING}:${PORT}/api/contract`);
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Idearium API] Port ${PORT} already in use. Is Idearium already running?`);
      process.exit(1);
    }
    throw e;
  });

  return server;
}
