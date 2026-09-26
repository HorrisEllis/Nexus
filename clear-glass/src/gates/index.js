'use strict';
/**
 * src/gates/index.js — Clear Glass Gate Registry
 * UUID: cg-gates-v1-0000-0000-000000000003
 *
 * Every system behavior is a Gate registered on the central bus.
 * Gates are pure: they receive an Event, emit zero or more Events, done.
 * No side-effects outside of stream.emit().
 *
 * Gate inventory:
 *   driver.*       — browser automation execution
 *   nav.*          — navigation lifecycle
 *   dom.*          — DOM archaeology and mutation
 *   context.*      — agent context lifecycle
 *   cookie.*       — vault operations
 *   fingerprint.*  — profile management
 *   copilot.*      — co-pilot message routing
 *   mesh.*         — agent mesh routing
 *   diag.*         — diagnostic execution
 *   url.listen     — URL pattern match dispatch
 *   seam.*         — NEXUS bus registration
 *   sse.*          — SSE broadcast
 *   tls.*          — TLS proxy events
 *   window.*       — host window lifecycle (open/close/minimize/hide)
 *   options.*      — Nexus options store (get/set, bus + UI controllable)
 *   lifecycle.*    — boot/shutdown
 *   bookmarks.*   — add/remove/list/open/check
 *   rewind.*       — snapshot/list/restore/clear
 *   provider.*     — NCP provider host (start/stop/list/show)
 */

const { Gate, Event } = require('../../siso/index');
const { detectFields, fillFields } = require('../autofill/matcher.js');

// ── Gate factory — cleaner than subclassing for simple transforms ──────────
function gate(signature, transformFn) {
  const g = new Gate(signature);
  g.transform = transformFn;
  return g;
}

// ── Driver gates ──────────────────────────────────────────────────────────
const driverExecGate = (driver) => gate('driver.exec', (event, stream) => {
  const { action, agentId = 'default', requestId, ...args } = event.data;
  driver.exec({ action, agentId, requestId, ...args })
    .then(result => stream.emit(new Event('driver.result', { action, agentId, requestId, result })))
    .catch(err  => stream.emit(new Event('driver.error',  { action, agentId, requestId, error: err.message })));
});

// ── Navigation gates ──────────────────────────────────────────────────────
const navStartGate = () => gate('nav.start', (event, stream) => {
  stream.emit(new Event('nav.loading', { agentId: event.data.agentId, url: event.data.url }));
});

// ── DOM gates ─────────────────────────────────────────────────────────────
const domQueryGate = (dom) => gate('dom.query', (event, stream) => {
  dom.handleQuery(event.data)
    .then(result => stream.emit(new Event('dom.query.result', { ...event.data, result })))
    .catch(err   => stream.emit(new Event('dom.error', { op: 'query', error: err.message })));
});

const domMutateGate = (dom) => gate('dom.mutate', (event, stream) => {
  dom.handleMutate(event.data)
    .then(result => stream.emit(new Event('dom.mutate.result', { ...event.data, result })))
    .catch(err   => stream.emit(new Event('dom.error', { op: 'mutate', error: err.message })));
});

const domPickGate = (dom) => gate('dom.pick', (event, stream) => {
  dom.handlePick(event.data)
    .then(pick => stream.emit(new Event('dom.pick.registered', pick)))
    .catch(err  => stream.emit(new Event('dom.error', { op: 'pick', error: err.message })));
});

const domTokenScanGate = (dom) => gate('dom.tokens', (event, stream) => {
  dom.scanTokens(event.data.agentId)
    .then(result => stream.emit(new Event('dom.tokens.result', { agentId: event.data.agentId, result })))
    .catch(err   => stream.emit(new Event('dom.error', { op: 'tokens', error: err.message })));
});

// ── Context gates ─────────────────────────────────────────────────────────
const contextCreateGate = (ctxMgr) => gate('context.create', (event, stream) => {
  ctxMgr.create(event.data)
    .then(ctx => stream.emit(new Event('context.created', { agentId: ctx.id, uuid: ctx.uuid })))
    .catch(err => stream.emit(new Event('context.error', { op: 'create', error: err.message })));
});

const contextSwitchGate = (ctxMgr) => gate('context.switch', (event, stream) => {
  ctxMgr.switchTo(event.data)
    .then(r => stream.emit(new Event('context.switched', r)))
    .catch(err => stream.emit(new Event('context.error', { op: 'switch', error: err.message })));
});

const contextFpSwitchGate = (ctxMgr) => gate('context.fp.switch', (event, stream) => {
  ctxMgr.switchFingerprint(event.data)
    .then(r => stream.emit(new Event('context.fp.switched', r)))
    .catch(err => stream.emit(new Event('context.error', { op: 'fp.switch', error: err.message })));
});

// ── Cookie gates ──────────────────────────────────────────────────────────
const cookieSaveGate = (vault) => gate('cookie.save', (event, stream) => {
  vault.save(event.data)
    .then(r  => stream.emit(new Event('cookie.saved', r)))
    .catch(err => stream.emit(new Event('cookie.error', { op: 'save', error: err.message })));
});

const cookieRestoreGate = (vault) => gate('cookie.restore', (event, stream) => {
  vault.restore(event.data)
    .then(r  => stream.emit(new Event('cookie.restored', r)))
    .catch(err => stream.emit(new Event('cookie.error', { op: 'restore', error: err.message })));
});

const cookieSnapshotGate = (vault, ctxMgr) => gate('cookie.snapshot', (event, stream) => {
  const ses = ctxMgr.getSession(event.data.agentId);
  vault.snapshot(event.data.agentId, ses)
    .then(r  => stream.emit(new Event('cookie.snapshotted', r)))
    .catch(err => stream.emit(new Event('cookie.error', { op: 'snapshot', error: err.message })));
});

const cookieHealthGate = (vault, ctxMgr) => gate('cookie.health', (event, stream) => {
  const ses = ctxMgr.getSession(event.data.agentId);
  vault.checkTokenHealth(event.data.agentId, ses)
    .then(r  => stream.emit(new Event('cookie.health.result', { agentId: event.data.agentId, ...r })))
    .catch(err => stream.emit(new Event('cookie.error', { op: 'health', error: err.message })));
});

// ── Copilot gates ─────────────────────────────────────────────────────────
const copilotMessageGate = (copilot) => gate('copilot.message', (event, stream) => {
  copilot.send(event.data)
    .then(r  => stream.emit(new Event('copilot.response', r)))
    .catch(err => stream.emit(new Event('copilot.error', { error: err.message })));
});

const copilotClearGate = (copilot) => gate('copilot.clear', (event, stream) => {
  copilot.clearHistory(event.data?.agentId);
  stream.emit(new Event('copilot.cleared', { agentId: event.data?.agentId }));
});

// ── Mesh gates ─────────────────────────────────────────────────────────────
const meshSpawnGate = (mesh) => gate('mesh.spawn', (event, stream) => {
  mesh.spawn(event.data.agentKey, event.data)
    .then(s  => stream.emit(new Event('mesh.agent.spawned', { key: s.key, contextId: s.contextId })))
    .catch(err => stream.emit(new Event('mesh.error', { op: 'spawn', error: err.message })));
});

const meshSendGate = (mesh) => gate('mesh.send', (event, stream) => {
  mesh.send(event.data)
    .then(r  => stream.emit(new Event('mesh.task.complete', r)))
    .catch(err => stream.emit(new Event('mesh.error', { op: 'send', error: err.message })));
});

const meshRouteGate = (mesh) => gate('mesh.route', (event, stream) => {
  mesh.route(event.data)
    .then(r  => {
      stream.emit(new Event('mesh.task.complete', r));
      // §MCO20 2026-09-13 — smallest real closure of MCO19's stated gap:
      // report completion to RAID's real /api/event so a real contract
      // (requestId === queueId, set by _dispatchToClearGlass) can advance
      // past PROCESSING instead of nothing ever consuming this result.
      try {
        const http = require('http');
        const body = JSON.stringify({ type: 'raid.contract.dispatched.clearglass.result', payload: { queueId: event.data.requestId, result: r } });
        const req = http.request({ hostname: '127.0.0.1', port: 3748, path: '/api/event', method: 'POST', timeout: 2000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => res.resume());
        req.on('error', () => {}); req.on('timeout', () => req.destroy());
        req.write(body); req.end();
      } catch (_) {}
    })
    .catch(err => stream.emit(new Event('mesh.error', { op: 'route', error: err.message })));
});

const meshEnqueueGate = (mesh) => gate('mesh.enqueue', (event, stream) => {
  const result = mesh.enqueue(event.data);
  stream.emit(new Event('mesh.queued', result));
});

// ── Mesh workflow gates ──────────────────────────────────────────────────────
// §BUILT 2026-09-19 — James: "do the structural fix." Real audit found
// AgentMesh's own automation engine (listWorkflows/getWorkflow/
// createWorkflow/updateWorkflow/removeWorkflow/runWorkflow/
// addWorkflowStep/updateWorkflowStep/removeWorkflowStep/
// moveWorkflowStep — 10 real delegate methods to this._automation,
// checked directly in agent-mesh.js) already backs BrainOS's UI via
// clear-glass/src/main/index.js's real /automation/workflows HTTP
// routes, but had zero gate coverage — completely unreachable from the
// same real bus/gate path mesh.spawn/send/route/enqueue above already
// prove works. This closes that: same real object, same real methods,
// now also reachable as gates for lib/agent-tools/tools/mesh/
// agent-mesh-route.js to dispatch to, exactly like the four above.
// The CRUD methods are synchronous (checked: no `async` on any of
// list/get/create/update/remove/addStep/updateStep/removeStep/
// moveStep in agent-mesh.js) — wrapped in try/catch here regardless,
// since a sync method can still throw and meshEnqueueGate right above
// this section has no such guard; not fixing that pre-existing gate,
// but not repeating its exposure in new code either. runWorkflow is
// wrapped with Promise.resolve().then() rather than assumed sync or
// async — its real steps (agent/http/delay) make a synchronous
// implementation unlikely, and Promise.resolve() is safe either way.
const meshWorkflowListGate = (mesh) => gate('mesh.workflow.list', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.list.result', { workflows: mesh.listWorkflows() })); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.list', error: err.message })); }
});

const meshWorkflowGetGate = (mesh) => gate('mesh.workflow.get', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.get.result', { workflow: mesh.getWorkflow(event.data.id) })); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.get', error: err.message })); }
});

const meshWorkflowCreateGate = (mesh) => gate('mesh.workflow.create', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.created', mesh.createWorkflow(event.data))); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.create', error: err.message })); }
});

const meshWorkflowUpdateGate = (mesh) => gate('mesh.workflow.update', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.updated', mesh.updateWorkflow(event.data.id, event.data.patch))); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.update', error: err.message })); }
});

const meshWorkflowRemoveGate = (mesh) => gate('mesh.workflow.remove', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.removed', mesh.removeWorkflow(event.data.id))); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.remove', error: err.message })); }
});

const meshWorkflowRunGate = (mesh) => gate('mesh.workflow.run', (event, stream) => {
  Promise.resolve(mesh.runWorkflow(event.data.id, event.data.reason))
    .then(r  => stream.emit(new Event('mesh.workflow.run.result', r)))
    .catch(err => stream.emit(new Event('mesh.error', { op: 'workflow.run', error: err.message })));
});

const meshWorkflowStepAddGate = (mesh) => gate('mesh.workflow.step.add', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.step.added', mesh.addWorkflowStep(event.data.id, event.data.step))); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.step.add', error: err.message })); }
});

const meshWorkflowStepUpdateGate = (mesh) => gate('mesh.workflow.step.update', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.step.updated', mesh.updateWorkflowStep(event.data.id, event.data.stepId, event.data.patch))); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.step.update', error: err.message })); }
});

const meshWorkflowStepRemoveGate = (mesh) => gate('mesh.workflow.step.remove', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.step.removed', mesh.removeWorkflowStep(event.data.id, event.data.stepId))); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.step.remove', error: err.message })); }
});

const meshWorkflowStepMoveGate = (mesh) => gate('mesh.workflow.step.move', (event, stream) => {
  try { stream.emit(new Event('mesh.workflow.step.moved', mesh.moveWorkflowStep(event.data.id, event.data.stepId, event.data.dir))); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'workflow.step.move', error: err.message })); }
});

// §BUILT 2026-09-19 — James: "finish it." The three real gaps named and
// deliberately left open in the prior two passes: AgentMesh.listNodes/
// listMeshView/listAgents (checked directly, all three synchronous, no
// args, same shape as enqueue above) had no gate at all. Closing them
// the same way, not differently — no reason for the last three methods
// on this same real object to follow a new convention.
const meshListNodesGate = (mesh) => gate('mesh.list.nodes', (event, stream) => {
  try { stream.emit(new Event('mesh.list.nodes.result', { nodes: mesh.listNodes() })); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'list.nodes', error: err.message })); }
});

const meshListMeshViewGate = (mesh) => gate('mesh.list.meshView', (event, stream) => {
  try { stream.emit(new Event('mesh.list.meshView.result', { view: mesh.listMeshView() })); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'list.meshView', error: err.message })); }
});

const meshListAgentsGate = (mesh) => gate('mesh.list.agents', (event, stream) => {
  try { stream.emit(new Event('mesh.list.agents.result', { agents: mesh.listAgents() })); }
  catch (err) { stream.emit(new Event('mesh.error', { op: 'list.agents', error: err.message })); }
});

// ── Diagnostic gates ──────────────────────────────────────────────────────
const diagRunGate = (diag) => gate('diag.run', (event, stream) => {
  diag.run(event.data)
    .then(r  => stream.emit(new Event('diag.complete', r)))
    .catch(err => stream.emit(new Event('diag.error', { error: err.message })));
});

const diagNexusGate = (diag) => gate('diag.nexus', (event, stream) => {
  diag.runNexusUiAudit(event.data)
    .then(r  => stream.emit(new Event('diag.complete', r)))
    .catch(err => stream.emit(new Event('diag.error', { error: err.message })));
});

const diagPageGate = (diag) => gate('diag.page', (event, stream) => {
  diag.runPageAudit(event.data)
    .then(r  => stream.emit(new Event('diag.complete', r)))
    .catch(err => stream.emit(new Event('diag.error', { error: err.message })));
});

// ── URL Listener gate ─────────────────────────────────────────────────────
const urlListenGate = (urlListener) => gate('url.listen', (event, stream) => {
  const result = urlListener.add(event.data);
  stream.emit(new Event('url.listener.added', result));
});

const urlListenRemoveGate = (urlListener) => gate('url.listen.remove', (event, stream) => {
  const result = urlListener.remove(event.data.listenerId);
  stream.emit(new Event('url.listener.removed', result));
});

// ── Window gates ──────────────────────────────────────────────────────────
const windowOpenGate     = (openFn)     => gate('window.open',     (event, stream) => { openFn(event.data);     });
const windowCloseGate    = (closeFn)    => gate('window.close',    (event, stream) => { closeFn(event.data);    });
const windowMinimizeGate = (minimizeFn) => gate('window.minimize', (event, stream) => { minimizeFn(event.data); });
const windowHideGate     = (hideFn)     => gate('window.hide',     (event, stream) => { hideFn(event.data);     });
const windowMaximizeGate = (maximizeFn) => gate('window.maximize', (event, stream) => { maximizeFn(event.data); });


// ── Bookmark gates ─────────────────────────────────────────────────────────
const bookmarkAddGate    = (bk) => gate('bookmarks.add', (event, stream) => {
  try {
    const result = bk.add(event.data);
    stream.emit(new Event('bookmarks.added', result));
  } catch (err) { stream.emit(new Event('bookmarks.error', { error: err.message })); }
});

const bookmarkRemoveGate = (bk) => gate('bookmarks.remove', (event, stream) => {
  try {
    const result = bk.remove(event.data);
    stream.emit(new Event('bookmarks.removed', result));
  } catch (err) { stream.emit(new Event('bookmarks.error', { error: err.message })); }
});

const bookmarkListGate   = (bk) => gate('bookmarks.list', (event, stream) => {
  stream.emit(new Event('bookmarks.listed', { bookmarks: bk.list(event.data) }));
});

const bookmarkOpenGate   = (bk, driver) => gate('bookmarks.open', (event, stream) => {
  const { id, agentId = 'default' } = event.data;
  const bookmark = bk.list().find(b => b.id === id);
  if (!bookmark) { stream.emit(new Event('bookmarks.error', { error: 'Not found' })); return; }
  bk.recordVisit({ id });
  driver.exec({ action: 'navigate', agentId, url: bookmark.url })
    .then(r => stream.emit(new Event('bookmarks.opened', { bookmark, result: r })))
    .catch(err => stream.emit(new Event('bookmarks.error', { error: err.message })));
});

const bookmarkVisitGate  = (bk) => gate('bookmarks.visit', (event, stream) => {
  bk.recordVisit(event.data);
  stream.emit(new Event('bookmarks.visited', event.data));
});

const bookmarkCheckGate  = (bk) => gate('bookmarks.check', (event, stream) => {
  const isBookmarked = bk.isBookmarked(event.data);
  stream.emit(new Event('bookmarks.check.result', { ...event.data, isBookmarked }));
});

// ── Rewind gates ──────────────────────────────────────────────────────────
const rewindSnapshotGate = (rewind) => gate('rewind.snapshot', (event, stream) => {
  const { agentId, label } = event.data;
  rewind.snapshot(agentId, { label })
    .then(entry => stream.emit(new Event('rewind.snapshotted', { entry })))
    .catch(err  => stream.emit(new Event('rewind.error', { error: err.message })));
});

const rewindListGate     = (rewind) => gate('rewind.list', (event, stream) => {
  const { agentId, limit } = event.data;
  stream.emit(new Event('rewind.listed', { agentId, snapshots: rewind.list(agentId, limit) }));
});

const rewindRestoreGate  = (rewind) => gate('rewind.restore', (event, stream) => {
  rewind.restore(event.data)
    .then(r   => stream.emit(new Event('rewind.restored', r)))
    .catch(err => stream.emit(new Event('rewind.error', { error: err.message })));
});

const rewindClearGate    = (rewind) => gate('rewind.clear', (event, stream) => {
  const result = rewind.clear(event.data.agentId);
  stream.emit(new Event('rewind.cleared', { agentId: event.data.agentId, ...result }));
});

// ── Provider host gates ───────────────────────────────────────────────────
const providerStartGate  = (ph) => gate('provider.start', (event, stream) => {
  const { providerId, show } = event.data;
  ph.start(providerId, { show: show ?? false })
    .then(r   => stream.emit(new Event('provider.started', r)))
    .catch(err => stream.emit(new Event('provider.error', { providerId, error: err.message })));
});

const providerStopGate   = (ph) => gate('provider.stop', (event, stream) => {
  const result = ph.stop(event.data.providerId);
  stream.emit(new Event('provider.stopped', result));
});

const providerListGate   = (ph) => gate('provider.list', (event, stream) => {
  stream.emit(new Event('provider.listed', { providers: ph.list() }));
});

const providerShowGate   = (ph) => gate('provider.show', (event, stream) => {
  ph.show(event.data.providerId);
  stream.emit(new Event('provider.shown', { providerId: event.data.providerId }));
});

// §BUILT 2026-08-14 — real request: "switch co-pilot to claude with this
// URL... use a URL given as the surface... prompt me to sign in if needed."
const providerNavigateGate = (ph) => gate('provider.navigate', (event, stream) => {
  const { providerId, url } = event.data;
  ph.navigateTo(providerId, url)
    .then(r => stream.emit(new Event('provider.navigated', r)))
    .catch(err => stream.emit(new Event('provider.error', { providerId, url, error: err.message })));
});

// ── Options gates ──────────────────────────────────────────────────────────
const optionsGetGate = (options) => gate('options.get', (event, stream) => {
  stream.emit(new Event('options.result', options.get()));
});

const optionsSetGate = (options) => gate('options.set', (event, stream) => {
  options.set(event.data)
    .then(data => stream.emit(new Event('options.result', data)))
    .catch(err  => stream.emit(new Event('options.error', { error: err.message })));
});

// ── Account gates ─────────────────────────────────────────────────────────
// §BUILT 2026-09-19 — James (via docs/2026-08-27-event-taxonomy-and-
// brainstorm-phasemap.spec's BR8, still real and open): "clear-glass
// needs commands for all the new features, tools for co-pilot and
// agents." Checked directly: clear-glass/src/options/store.js has a
// real, dedicated account CRUD surface (listAccounts/getAccount/
// createAccount/updateAccount/deleteAccount — real stable-uuid
// entities, real agentKeys linking) with ZERO gate coverage at all —
// a deeper gap than bookmarks (which at least had gates already).
// Same real, synchronous try/catch convention as the mesh workflow
// gates from earlier this session.
const accountListGate = (options) => gate('account.list', (event, stream) => {
  try { stream.emit(new Event('account.list.result', { accounts: options.listAccounts() })); }
  catch (err) { stream.emit(new Event('account.error', { op: 'list', error: err.message })); }
});

const accountGetGate = (options) => gate('account.get', (event, stream) => {
  try { stream.emit(new Event('account.get.result', { account: options.getAccount(event.data.id) })); }
  catch (err) { stream.emit(new Event('account.error', { op: 'get', error: err.message })); }
});

const accountCreateGate = (options) => gate('account.create', (event, stream) => {
  try { stream.emit(new Event('account.created', options.createAccount(event.data))); }
  catch (err) { stream.emit(new Event('account.error', { op: 'create', error: err.message })); }
});

const accountUpdateGate = (options) => gate('account.update', (event, stream) => {
  try { stream.emit(new Event('account.updated', options.updateAccount(event.data.id, event.data.updates))); }
  catch (err) { stream.emit(new Event('account.error', { op: 'update', error: err.message })); }
});

const accountDeleteGate = (options) => gate('account.delete', (event, stream) => {
  try { stream.emit(new Event('account.deleted', options.deleteAccount(event.data.id))); }
  catch (err) { stream.emit(new Event('account.error', { op: 'delete', error: err.message })); }
});

// ── Autofill gates ────────────────────────────────────────────────────────
// §BUILT 2026-09-19 — James: "autofill." Real, separate CRUD for
// AutofillProfile (distinct entity from Account — see autofill/
// store.js's own header), plus two real orchestration gates that
// reuse the already-real dom.handleQuery/handleMutate directly (same
// `dom` instance, no second bus round-trip per matched field).
const autofillProfileListGate = (af) => gate('autofill.profile.list', (event, stream) => {
  try { stream.emit(new Event('autofill.profile.list.result', { profiles: af.listProfiles() })); }
  catch (err) { stream.emit(new Event('autofill.error', { op: 'profile.list', error: err.message })); }
});

const autofillProfileGetGate = (af) => gate('autofill.profile.get', (event, stream) => {
  try { stream.emit(new Event('autofill.profile.get.result', { profile: af.getProfile(event.data.id) })); }
  catch (err) { stream.emit(new Event('autofill.error', { op: 'profile.get', error: err.message })); }
});

const autofillProfileCreateGate = (af) => gate('autofill.profile.create', (event, stream) => {
  try {
    const result = af.createProfile(event.data);
    if (result.error) { stream.emit(new Event('autofill.error', { op: 'profile.create', error: result.error })); return; }
    stream.emit(new Event('autofill.profile.created', result));
  } catch (err) { stream.emit(new Event('autofill.error', { op: 'profile.create', error: err.message })); }
});

const autofillProfileUpdateGate = (af) => gate('autofill.profile.update', (event, stream) => {
  try {
    const result = af.updateProfile(event.data.id, event.data.updates);
    if (result.error) { stream.emit(new Event('autofill.error', { op: 'profile.update', error: result.error })); return; }
    stream.emit(new Event('autofill.profile.updated', result));
  } catch (err) { stream.emit(new Event('autofill.error', { op: 'profile.update', error: err.message })); }
});

const autofillProfileDeleteGate = (af) => gate('autofill.profile.delete', (event, stream) => {
  try {
    const result = af.deleteProfile(event.data.id);
    if (result.error) { stream.emit(new Event('autofill.error', { op: 'profile.delete', error: result.error })); return; }
    stream.emit(new Event('autofill.profile.deleted', result));
  } catch (err) { stream.emit(new Event('autofill.error', { op: 'profile.delete', error: err.message })); }
});

// (Confidence filtering now lives in autofill/matcher.js's own fillFields — shared with ipc/bridge.js's real, separate channel, not duplicated here.)

const autofillDetectGate = (dom, af) => gate('autofill.detect', (event, stream) => {
  detectFields(dom, af, event.data)
    .then(result => {
      if (result.error) stream.emit(new Event('autofill.error', { op: 'detect', error: result.error }));
      else stream.emit(new Event('autofill.detect.result', result));
    })
    .catch(err => stream.emit(new Event('autofill.error', { op: 'detect', error: err.message })));
});

const autofillFillGate = (dom, af) => gate('autofill.fill', (event, stream) => {
  fillFields(dom, af, event.data)
    .then(result => {
      if (result.error) stream.emit(new Event('autofill.error', { op: 'fill', error: result.error }));
      else stream.emit(new Event('autofill.fill.result', result));
    })
    .catch(err => stream.emit(new Event('autofill.error', { op: 'fill', error: err.message })));
});

// §BUILT 2026-09-19 — James: "account manager with account ids for
// providers." 5 new real methods on the same NexusOptions instance,
// checked directly against clear-glass/src/options/store.js's own
// real implementation (schema, collision enforcement, and every
// failure path proven with a real test run before these gates were
// written) — not a second account model, additive to the existing
// agentKeys linkage.
const accountLinkProviderGate = (options) => gate('account.provider.link', (event, stream) => {
  try {
    const { id, provider, accountId, email, displayName } = event.data;
    const result = options.linkProviderAccount(id, provider, { accountId, email, displayName });
    if (result.error) { stream.emit(new Event('account.error', { op: 'provider.link', error: result.error })); return; }
    stream.emit(new Event('account.provider.linked', result));
  } catch (err) { stream.emit(new Event('account.error', { op: 'provider.link', error: err.message })); }
});

const accountUnlinkProviderGate = (options) => gate('account.provider.unlink', (event, stream) => {
  try {
    const { id, provider } = event.data;
    const result = options.unlinkProviderAccount(id, provider);
    if (result.error) { stream.emit(new Event('account.error', { op: 'provider.unlink', error: result.error })); return; }
    stream.emit(new Event('account.provider.unlinked', result));
  } catch (err) { stream.emit(new Event('account.error', { op: 'provider.unlink', error: err.message })); }
});

const accountVerifyProviderGate = (options) => gate('account.provider.verify', (event, stream) => {
  try {
    const { id, provider } = event.data;
    const result = options.verifyProviderAccount(id, provider);
    if (result.error) { stream.emit(new Event('account.error', { op: 'provider.verify', error: result.error })); return; }
    stream.emit(new Event('account.provider.verified', result));
  } catch (err) { stream.emit(new Event('account.error', { op: 'provider.verify', error: err.message })); }
});

const accountGetProviderGate = (options) => gate('account.provider.get', (event, stream) => {
  try {
    const { id, provider } = event.data;
    stream.emit(new Event('account.provider.get.result', { id, provider, entry: options.getProviderAccount(id, provider) }));
  } catch (err) { stream.emit(new Event('account.error', { op: 'provider.get', error: err.message })); }
});

const accountFindByProviderGate = (options) => gate('account.provider.find', (event, stream) => {
  try {
    const { provider, accountId } = event.data;
    stream.emit(new Event('account.provider.find.result', { provider, accountId, account: options.findAccountByProviderAccountId(provider, accountId) }));
  } catch (err) { stream.emit(new Event('account.error', { op: 'provider.find', error: err.message })); }
});

// ── History gates ────────────────────────────────────────────────────────
// §BUILT 2026-09-19 — James: "history manager." clear-glass/src/history/
// store.js's real methods (record/list/delete/clear — checked directly,
// not guessed), zero gate coverage at all, same deeper-gap class as
// accounts just above.
const historyRecordGate = (history) => gate('history.record', (event, stream) => {
  try { stream.emit(new Event('history.recorded', history.record(event.data))); }
  catch (err) { stream.emit(new Event('history.error', { op: 'record', error: err.message })); }
});

const historyListGate = (history) => gate('history.list', (event, stream) => {
  try { stream.emit(new Event('history.list.result', { entries: history.list(event.data) })); }
  catch (err) { stream.emit(new Event('history.error', { op: 'list', error: err.message })); }
});

const historyDeleteGate = (history) => gate('history.delete', (event, stream) => {
  try { stream.emit(new Event('history.deleted', history.delete(event.data.id))); }
  catch (err) { stream.emit(new Event('history.error', { op: 'delete', error: err.message })); }
});

const historyClearGate = (history) => gate('history.clear', (event, stream) => {
  try { stream.emit(new Event('history.cleared', history.clear(event.data?.agentId))); }
  catch (err) { stream.emit(new Event('history.error', { op: 'clear', error: err.message })); }
});

// ── SEAM gates ────────────────────────────────────────────────────────────
const seamRegisterGate = (seam) => gate('seam.register', (event, stream) => {
  seam.register()
    .then(() => stream.emit(new Event('seam.registered', { moduleId: seam.moduleId, uuid: seam.uuid })))
    .catch(err => stream.emit(new Event('seam.error', { error: err.message })));
});

// ── Status gate ───────────────────────────────────────────────────────────
const statusGate = (getStatusFn) => gate('status.request', (event, stream) => {
  stream.emit(new Event('status.response', getStatusFn()));
});

// ── Lifecycle gates ───────────────────────────────────────────────────────
const lifecycleReadyGate  = () => gate('lifecycle.ready',    (event, stream) => {
  console.log('[ClearGlass] →E→ lifecycle.ready');
});
const lifecycleShutdownGate = () => gate('lifecycle.shutdown', (event, stream) => {
  console.log('[ClearGlass] →E→ lifecycle.shutdown');
});

// ── Userscript gates ─────────────────────────────────────────────────────
const userscriptListGate   = (us) => gate('userscript.list',   (event, stream) => {
  stream.emit(new Event('userscript.listed', { scripts: us.list(event.data) }));
});
const userscriptInjectGate = (us) => gate('userscript.inject', (event, stream) => {
  const { agentId, scriptId } = event.data;
  us.inject(agentId, scriptId)
    .then(r   => stream.emit(new Event('userscript.injected', r)))
    .catch(err => stream.emit(new Event('userscript.error', { error: err.message })));
});
const userscriptToggleGate = (us) => gate('userscript.toggle', (event, stream) => {
  try {
    const r = us.toggle(event.data.scriptId, event.data.enabled);
    stream.emit(new Event('userscript.toggled', r));
  } catch (err) { stream.emit(new Event('userscript.error', { error: err.message })); }
});
const userscriptCreateGate = (us) => gate('userscript.create', (event, stream) => {
  try {
    const s = us.create(event.data);
    stream.emit(new Event('userscript.created', { id: s.id, name: s.name }));
  } catch (err) { stream.emit(new Event('userscript.error', { error: err.message })); }
});
const userscriptDeleteGate = (us) => gate('userscript.delete', (event, stream) => {
  try {
    const r = us.delete(event.data.scriptId);
    stream.emit(new Event('userscript.deleted', r));
  } catch (err) { stream.emit(new Event('userscript.error', { error: err.message })); }
});

// ── Site settings — §NEW 2026-08-24 ────────────────────────────────────────
const siteSettingsGetGate = (ss) => gate('site-settings.get', (event, stream) => {
  try {
    const { url, key } = event.data;
    const value = key ? ss.get(url, key) : ss.getAllForOrigin(url);
    stream.emit(new Event('site-settings.result', { url, key, value }));
  } catch (err) { stream.emit(new Event('site-settings.error', { error: err.message })); }
});
const siteSettingsSetGate = (ss) => gate('site-settings.set', (event, stream) => {
  try {
    const { url, key, value } = event.data;
    const ok = ss.set(url, key, value);
    stream.emit(new Event('site-settings.set.result', { url, key, value, ok }));
  } catch (err) { stream.emit(new Event('site-settings.error', { error: err.message })); }
});
const siteSettingsDeleteKeyGate = (ss) => gate('site-settings.deleteKey', (event, stream) => {
  try {
    const { url, key } = event.data;
    const ok = ss.deleteKey(url, key);
    stream.emit(new Event('site-settings.deleteKey.result', { url, key, ok }));
  } catch (err) { stream.emit(new Event('site-settings.error', { error: err.message })); }
});

// §BUILT 2026-09-19 — James: "site specific settings." SiteSettingsStore's
// own real methods clear(url)/clearAll()/listOrigins() had zero gate
// coverage — get/set/deleteKey covered 3 of 7 real methods. Same
// partial-coverage class as browser_action's original 5-of-30.
const siteSettingsClearGate = (ss) => gate('site-settings.clear', (event, stream) => {
  try { stream.emit(new Event('site-settings.cleared', { url: event.data.url, ok: ss.clear(event.data.url) })); }
  catch (err) { stream.emit(new Event('site-settings.error', { op: 'clear', error: err.message })); }
});

const siteSettingsClearAllGate = (ss) => gate('site-settings.clearAll', (event, stream) => {
  try { stream.emit(new Event('site-settings.clearedAll', { ok: ss.clearAll() })); }
  catch (err) { stream.emit(new Event('site-settings.error', { op: 'clearAll', error: err.message })); }
});

const siteSettingsListOriginsGate = (ss) => gate('site-settings.listOrigins', (event, stream) => {
  try { stream.emit(new Event('site-settings.list.result', { origins: ss.listOrigins() })); }
  catch (err) { stream.emit(new Event('site-settings.error', { op: 'listOrigins', error: err.message })); }
});

// ── Passwords — §NEW 2026-08-24 ─────────────────────────────────────────────
const passwordSaveGate = (pv) => gate('passwords.save', (event, stream) => {
  try {
    const { origin, username, password } = event.data;
    const r = pv.save(origin, username, password);
    stream.emit(new Event('passwords.saved', r));
  } catch (err) { stream.emit(new Event('passwords.error', { error: err.message })); }
});
const passwordGetGate = (pv) => gate('passwords.get', (event, stream) => {
  try {
    const r = pv.get(event.data.origin);
    stream.emit(new Event('passwords.result', { origin: event.data.origin, entries: r }));
  } catch (err) { stream.emit(new Event('passwords.error', { error: err.message })); }
});
const passwordListGate = (pv) => gate('passwords.list', (event, stream) => {
  try { stream.emit(new Event('passwords.list.result', { entries: pv.list() })); }
  catch (err) { stream.emit(new Event('passwords.error', { error: err.message })); }
});
const passwordDeleteGate = (pv) => gate('passwords.delete', (event, stream) => {
  try { stream.emit(new Event('passwords.deleted', { id: event.data.id, ok: pv.delete(event.data.id) })); }
  catch (err) { stream.emit(new Event('passwords.error', { error: err.message })); }
});

// ── Speech-to-text — §NEW 2026-08-24 ────────────────────────────────────────
const speechTranscribeGate = (speech) => gate('speech.transcribe', (event, stream) => {
  speech.transcribe(event.data.audioPath)
    .then(result => stream.emit(new Event('speech.result', { requestId: event.data.requestId, ...result })))
    .catch(err => stream.emit(new Event('speech.error', { requestId: event.data.requestId, error: err.message })));
});
const speechAvailableGate = (speech) => gate('speech.available', (event, stream) => {
  speech.isAvailable().then(result => stream.emit(new Event('speech.available.result', result)));
});

// ── Registry — register all gates on the bus ──────────────────────────────
function registerAll(bus, deps) {
  const {
    driver, dom, ctxMgr, vault, copilot, mesh, diag, urlListener, seam,
    openFn, closeFn, minimizeFn, hideFn, maximizeFn, getStatusFn, options,
    bookmarks, rewind, providerHost, userscripts, siteSettings, passwordVault, speech,
    history, autofillStore,
  } = deps;

  // §NEW 2026-08-24 — real, structural gap fix: every userscript
  // injected via userscripts.inject()/autoInject() now needs to know its
  // own agentId (window.__cgAgentId) for the passwords autofill plugin's
  // in-page detector to report back correctly — see manager.js's
  // _buildInjectable fix, same commit.

  const gates = [
    // Driver
    driver     && driverExecGate(driver),
    // Nav
    navStartGate(),
    // DOM
    dom        && domQueryGate(dom),
    dom        && domMutateGate(dom),
    dom        && domPickGate(dom),
    dom        && domTokenScanGate(dom),
    // Context
    ctxMgr     && contextCreateGate(ctxMgr),
    ctxMgr     && contextSwitchGate(ctxMgr),
    ctxMgr     && contextFpSwitchGate(ctxMgr),
    // Cookies
    vault      && cookieSaveGate(vault),
    vault      && cookieRestoreGate(vault),
    vault      && cookieSnapshotGate(vault, ctxMgr),
    vault      && cookieHealthGate(vault, ctxMgr),
    // Copilot
    copilot    && copilotMessageGate(copilot),
    copilot    && copilotClearGate(copilot),
    // Mesh
    mesh       && meshSpawnGate(mesh),
    mesh       && meshSendGate(mesh),
    mesh       && meshRouteGate(mesh),
    mesh       && meshEnqueueGate(mesh),
    mesh       && meshWorkflowListGate(mesh),
    mesh       && meshWorkflowGetGate(mesh),
    mesh       && meshWorkflowCreateGate(mesh),
    mesh       && meshWorkflowUpdateGate(mesh),
    mesh       && meshWorkflowRemoveGate(mesh),
    mesh       && meshWorkflowRunGate(mesh),
    mesh       && meshWorkflowStepAddGate(mesh),
    mesh       && meshWorkflowStepUpdateGate(mesh),
    mesh       && meshWorkflowStepRemoveGate(mesh),
    mesh       && meshWorkflowStepMoveGate(mesh),
    mesh       && meshListNodesGate(mesh),
    mesh       && meshListMeshViewGate(mesh),
    mesh       && meshListAgentsGate(mesh),
    // Diagnostics
    diag       && diagRunGate(diag),
    diag       && diagNexusGate(diag),
    diag       && diagPageGate(diag),
    // URL Listener
    urlListener && urlListenGate(urlListener),
    urlListener && urlListenRemoveGate(urlListener),
    // Windows
    openFn     && windowOpenGate(openFn),
    closeFn    && windowCloseGate(closeFn),
    minimizeFn && windowMinimizeGate(minimizeFn),
    hideFn     && windowHideGate(hideFn),
    maximizeFn && windowMaximizeGate(maximizeFn),
    // Options
    options    && optionsGetGate(options),
    options    && optionsSetGate(options),
    options    && accountListGate(options),
    options    && accountGetGate(options),
    options    && accountCreateGate(options),
    options    && accountUpdateGate(options),
    options    && accountDeleteGate(options),
    autofillStore && autofillProfileListGate(autofillStore),
    autofillStore && autofillProfileGetGate(autofillStore),
    autofillStore && autofillProfileCreateGate(autofillStore),
    autofillStore && autofillProfileUpdateGate(autofillStore),
    autofillStore && autofillProfileDeleteGate(autofillStore),
    (dom && autofillStore) && autofillDetectGate(dom, autofillStore),
    (dom && autofillStore) && autofillFillGate(dom, autofillStore),
    options    && accountLinkProviderGate(options),
    options    && accountUnlinkProviderGate(options),
    options    && accountVerifyProviderGate(options),
    options    && accountGetProviderGate(options),
    options    && accountFindByProviderGate(options),
    history    && historyRecordGate(history),
    history    && historyListGate(history),
    history    && historyDeleteGate(history),
    history    && historyClearGate(history),
    // Bookmarks
    bookmarks  && bookmarkAddGate(bookmarks),
    bookmarks  && bookmarkRemoveGate(bookmarks),
    bookmarks  && bookmarkListGate(bookmarks),
    bookmarks  && driver && bookmarkOpenGate(bookmarks, driver),
    bookmarks  && bookmarkVisitGate(bookmarks),
    bookmarks  && bookmarkCheckGate(bookmarks),
    // Rewind
    rewind     && rewindSnapshotGate(rewind),
    rewind     && rewindListGate(rewind),
    rewind     && rewindRestoreGate(rewind),
    rewind     && rewindClearGate(rewind),
    // Provider host
    providerHost && providerStartGate(providerHost),
    providerHost && providerStopGate(providerHost),
    providerHost && providerListGate(providerHost),
    providerHost && providerShowGate(providerHost),
    providerHost && providerNavigateGate(providerHost),
    // Userscripts
    userscripts  && userscriptListGate(userscripts),
    userscripts  && userscriptInjectGate(userscripts),
    userscripts  && userscriptToggleGate(userscripts),
    userscripts  && userscriptCreateGate(userscripts),
    userscripts  && userscriptDeleteGate(userscripts),
    // Site settings
    siteSettings && siteSettingsGetGate(siteSettings),
    siteSettings && siteSettingsSetGate(siteSettings),
    siteSettings && siteSettingsDeleteKeyGate(siteSettings),
    siteSettings && siteSettingsClearGate(siteSettings),
    siteSettings && siteSettingsClearAllGate(siteSettings),
    siteSettings && siteSettingsListOriginsGate(siteSettings),
    // Passwords
    passwordVault && passwordSaveGate(passwordVault),
    passwordVault && passwordGetGate(passwordVault),
    passwordVault && passwordListGate(passwordVault),
    passwordVault && passwordDeleteGate(passwordVault),
    // Speech-to-text
    speech && speechTranscribeGate(speech),
    speech && speechAvailableGate(speech),
    // SEAM
    seam       && seamRegisterGate(seam),
    // Status
    getStatusFn && statusGate(getStatusFn),
    // Lifecycle
    lifecycleReadyGate(),
    lifecycleShutdownGate(),
  ].filter(Boolean);

  for (const g of gates) {
    try { bus.register(g); }
    catch (err) { console.error(`[Gates] Failed to register '${g.signature}':`, err.message); }
  }

  console.log(`[Gates] Registered ${gates.length} gates on bus`);
  return gates.length;
}

module.exports = {
  registerAll,
  gate,
  // Export individual factories for testing
  driverExecGate, domQueryGate, domMutateGate, domPickGate,
  contextCreateGate, contextSwitchGate, cookieSaveGate, cookieRestoreGate,
  copilotMessageGate, meshSpawnGate, meshRouteGate, diagRunGate,
  urlListenGate, windowOpenGate, windowCloseGate, windowMinimizeGate, windowHideGate,
  optionsGetGate, optionsSetGate, statusGate,
  bookmarkAddGate, bookmarkRemoveGate, bookmarkListGate, bookmarkOpenGate,
  rewindSnapshotGate, rewindListGate, rewindRestoreGate,
  providerStartGate, providerStopGate, providerListGate,
  providerShowGate, providerNavigateGate,
  userscriptListGate, userscriptInjectGate, userscriptToggleGate,
  userscriptCreateGate, userscriptDeleteGate,
  siteSettingsGetGate, siteSettingsSetGate, siteSettingsDeleteKeyGate,
  passwordSaveGate, passwordGetGate, passwordListGate, passwordDeleteGate,
  speechTranscribeGate, speechAvailableGate,
};
