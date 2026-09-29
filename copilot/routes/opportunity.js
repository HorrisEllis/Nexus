'use strict';
/**
 * copilot/routes/opportunity.js — /api/opportunity/* and /api/context/* on copilot :3750. 0.39.272.
 *
 * The HTTP door to lib/opportunity (jobs, gigs, Fiverr/Upwork leads) and lib/context-atlas (every memory system and
 * graph). Same shape as routes/person-model.js: handle() returns false for a path it does not own.
 *
 * §USER-ONLY — approve, submit, answer approval and template edits are James's. These routes hard-code by:'user'
 * (the request body is not trusted to say who is asking), exactly as person-model's accept does. The agent tool
 * (nexus.opportunity.tool) cannot reach them: it refuses approve and submits only as by:'agent' under policy.
 * §HONEST LIMIT — like every copilot route, this trusts that only James's own machine reaches 127.0.0.1:3750.
 */

// The route table — one row per served route, in the same path shape registry-components.js declares.
// Order matters only where a literal and a parameter could both match (literals first).
const ROUTES = [
  ['GET',    '/api/opportunity/status',            (O) => ({ ok: true, ...O.status() })],
  ['GET',    '/api/opportunity/profile',           (O) => ({ ok: true, profile: O.getProfile() })],
  ['POST',   '/api/opportunity/profile',           (O, { body }) => O.setProfile(body.profile || body)],
  ['POST',   '/api/opportunity/import-resume',     (O, { body }) => O.importResume(body.path)],
  ['GET',    '/api/opportunity/sources',           (O) => ({ ok: true, types: Object.entries(O.sources.TYPES).map(([k, v]) => ({ type: k, needs: v.needs, describe: v.describe })), configured: O.getProfile().sources })],
  ['POST',   '/api/opportunity/cycle',             (O, { body }) => O.cycle({ draft: typeof body.draft === 'number' ? body.draft : null })],
  ['POST',   '/api/opportunity/rescore',           (O) => O.rescore()],
  ['POST',   '/api/opportunity/followups',         (O) => O.followups()],
  ['GET',    '/api/opportunity/list',              (O, { q }) => ({ ok: true, items: O.list({ stage: q('stage'), kind: q('kind'), limit: +q('limit') || 50, q: q('q') }) })],
  ['POST',   '/api/opportunity/capture',           (O, { body }) => O.capture({ agentId: body.agentId || 'default', kind: body.kind || null })],
  ['GET',    '/api/opportunity/answers',           (O, { q }) => ({ ok: true, answers: O.answers.list({ approvedOnly: q('approved') === '1' }) })],
  ['POST',   '/api/opportunity/answers',           (O, { body }) => O.answers.add({ question: body.question, answer: body.answer, by: 'user', tags: body.tags || [] })],
  ['POST',   '/api/opportunity/answers/:id/approve', (O, { p }) => O.answers.approve(p.id, 'user')],
  ['DELETE', '/api/opportunity/answers/:id',       (O, { p }) => O.answers.remove(p.id)],
  ['GET',    '/api/opportunity/templates',         (O) => ({ ok: true, templates: O.drafting.listTemplates() })],
  ['PUT',    '/api/opportunity/templates/:id',     (O, { p, body }) => O.drafting.setTemplate(p.id, body.text)],
  ['DELETE', '/api/opportunity/templates/:id',     (O, { p }) => O.drafting.resetTemplate(p.id)],
  ['PUT',    '/api/opportunity/recipes/:host',     (O, { p, body }) => O.setRecipe(p.host, body)],
  ['GET',    '/api/opportunity/:id',               (O, { p }) => O.show(p.id)],
  ['POST',   '/api/opportunity/:id/approve',       (O, { p, body }) => O.approve(p.id, { by: 'user', note: body.note || null })],
  ['POST',   '/api/opportunity/:id/dismiss',       (O, { p, body }) => O.dismiss(p.id, { by: 'user', note: body.note || null })],
  ['POST',   '/api/opportunity/:id/draft',         (O, { p, body }) => O.draftFor(p.id, { kind: body.kind || null, extra: body.extra || {} })],
  ['PUT',    '/api/opportunity/:id/draft/:kind',   (O, { p, body }) => O.editDraft(p.id, p.kind, body.text)],
  ['POST',   '/api/opportunity/:id/prepare',       (O, { p, body }) => O.prepare(p.id, { force: !!body.force })],
  ['POST',   '/api/opportunity/:id/prepare-reply', (O, { p, body }) => O.prepareReply(p.id, { kind: body.kind || null })],
  ['POST',   '/api/opportunity/:id/submit',        (O, { p }) => O.submit(p.id, { by: 'user' })],
  ['POST',   '/api/opportunity/:id/mark',          (O, { p, body }) => O.markResponse(p.id, body.stage, { note: body.note || null, by: 'user' })],
];

function _match(pattern, pathname) {
  const a = pattern.split('/'), b = pathname.replace(/\/+$/, '').split('/');
  if (a.length !== b.length) return null;
  const p = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) { if (!b[i]) return null; p[a[i].slice(1)] = decodeURIComponent(b[i]); }
    else if (a[i] !== b[i]) return null;
  }
  return p;
}

async function handle(req, res, { method, url, pathname, json, readBody }) {
  if (pathname.startsWith('/api/context/')) return _context(req, res, { method, url, pathname, json });
  if (!pathname.startsWith('/api/opportunity')) return false;
  let O;
  try { O = require('../../lib/opportunity'); }
  catch (e) { json(res, 503, { ok: false, error: `opportunity pipeline unavailable: ${e.message}` }); return true; }
  const path0 = pathname === '/api/opportunity' ? '/api/opportunity/status' : pathname;
  for (const [m, pattern, fn] of ROUTES) {
    if (m !== method) continue;
    const p = _match(pattern, path0);
    if (!p) continue;
    try {
      const body = method === 'POST' || method === 'PUT' ? await readBody(req) : {};
      const r = await fn(O, { p, body: body || {}, q: (k) => url.searchParams.get(k) });
      json(res, r && r.ok === false ? (r.userOnly ? 403 : /^no (opportunity|answer)/.test(r.error || '') ? 404 : 400) : 200, r);
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return true;
  }
  json(res, 404, { ok: false, error: `no ${method} ${pathname}` });
  return true;
}

async function _context(req, res, { method, url, pathname, json }) {
  if (method !== 'GET') { json(res, 405, { ok: false, error: 'GET only' }); return true; }
  const A = require('../../lib/context-atlas.js');
  const q = (k) => url.searchParams.get(k);
  try {
    if (pathname === '/api/context/directory') { json(res, 200, A.directory({ counts: q('counts') !== '0' })); return true; }
    if (pathname === '/api/context/search') {
      const query = q('q') || q('query');
      if (!query) { json(res, 400, { ok: false, error: 'q required' }); return true; }
      const r = await A.search(query, { sources: q('sources') ? q('sources').split(',').map(s => s.trim()).filter(Boolean) : null, limit: Math.min(+q('limit') || 20, 100), repoDir: q('repoDir') || null, repoUuid: q('repoUuid') || null });
      json(res, r.ok ? 200 : 400, r); return true;
    }
    if (pathname === '/api/context/get') { const r = A.get(q('source'), q('id')); json(res, r.ok ? 200 : 404, r); return true; }
  } catch (e) { json(res, 500, { ok: false, error: e.message }); return true; }
  return false;
}

// ── scheduler: profile.schedule.everyMinutes > 0 runs a cycle on that interval (copilot boot calls start()) ─────
let _timer = null;
function startScheduler({ log = console } = {}) {
  if (process.env.OPPORTUNITY_SCHEDULER === '0' || _timer) return { started: false };
  let every = 0;
  try { every = +(require('../../lib/opportunity').getProfile().schedule || {}).everyMinutes || 0; } catch (e) { log.warn(`[opportunity] scheduler: profile unreadable (${e.message}) — not started`); return { started: false }; }
  if (every <= 0) return { started: false, reason: 'profile.schedule.everyMinutes is 0' };
  const ms = Math.max(15, every) * 60000;
  _timer = setInterval(async () => {
    try { const r = await require('../../lib/opportunity').cycle({}); log.log(`[opportunity] cycle: ${r.ok ? `${r.created} new, ${r.shortlisted} shortlisted, ${r.drafted} drafted${r.problems.length ? `, ${r.problems.length} problem(s)` : ''}` : r.error}`); }
    catch (e) { log.warn(`[opportunity] scheduled cycle failed: ${e.message}`); }
  }, ms);
  if (_timer.unref) _timer.unref();
  log.log(`[opportunity] scheduler: a cycle every ${Math.max(15, every)} min`);
  return { started: true, everyMinutes: Math.max(15, every) };
}

module.exports = { handle, startScheduler, ROUTES, _match };
