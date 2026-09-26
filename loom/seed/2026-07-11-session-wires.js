'use strict';
/**
 * loom/seed/2026-07-11-session-wires.js
 * UUID: nexus-loom-seed-session-2026-0711-jamesbrooks-001
 * Version: 1.0.0
 *
 * §NEW 2026-07-11 — every wire found broken or missing this session,
 * declared for real through loom's declare() API instead of just fixed
 * in place. The point isn't documentation — it's that loom/schema/
 * axioms.js's loom.wire-endpoints-exist axiom is HARD: once a wire is
 * declared here, any FUTURE attempt to redeclare one of its endpoints
 * with a typo, or delete a hook it depends on, gets rejected at
 * declare-time instead of shipping silently and surfacing as a black
 * screen or a discarded HTTP response three sessions later. That's the
 * actual value of this file — not what it records, what it prevents.
 *
 * Checked before writing this: loom/data/registry.json did not exist —
 * this deployment has never declared a single wire through loom, despite
 * the mechanism being real, hard-enforced, and running (:3752). Every
 * bug in this list existed entirely outside loom's enforcement, in
 * hand-written IPC channel strings, gate() registrations, and bus event
 * names matched by convention rather than checked by anything.
 *
 * Idempotent — safe to run more than once. `driver.declare()` on an
 * id that already exists in the registry returns
 * {ok:false, reason:'axiom-rejected', failures:[{axiomId:'loom.unique-id'}]}
 * via the loom.unique-id axiom; this script treats that as "already
 * seeded" rather than an error.
 *
 * Run: node loom/seed/2026-07-11-session-wires.js
 */

const crypto = require('crypto');
const { LoomDriver } = require('../schema/index.js');

const driver = new LoomDriver({}); // default dataDir — loom/data/registry.json, the real one

let declared = 0, alreadySeeded = 0, failed = 0;

function decl(kind, payload) {
  const withUuid = { uuid: crypto.randomUUID(), ...payload };
  const result = driver.declare(kind, withUuid);
  if (result.ok) {
    declared++;
    console.log(`  ✓ ${kind} ${payload.id}`);
  } else if (result.failures?.some(f => f.axiomId === 'loom.unique-id')) {
    alreadySeeded++;
    console.log(`  · ${kind} ${payload.id} (already seeded)`);
  } else {
    failed++;
    console.error(`  ✗ ${kind} ${payload.id} — ${JSON.stringify(result)}`);
  }
  return result;
}

console.log('[loom/seed] declaring components...');

decl('component', { id: 'clearglass.renderer',      namespace: 'clearglass', name: 'Clear Glass Renderer (browser.js)',        version: '3.8.0' });
decl('component', { id: 'clearglass.main',           namespace: 'clearglass', name: 'Clear Glass Main Process (ipc/bridge.js)', version: '3.8.0' });
decl('component', { id: 'clearglass.contextManager',  namespace: 'clearglass', name: 'ContextManager (src/contexts/manager.js)', version: '1.0.0' });
decl('component', { id: 'copilot.moduleBuilder',      namespace: 'copilot',    name: 'module-builder.js',                        version: '1.0.0' });
decl('component', { id: 'copilot.bridgeClient',       namespace: 'copilot',    name: 'copilot/bridge.js (build/diagnose real methods)', version: '1.0.0' });
decl('component', { id: 'copilot.server',             namespace: 'copilot',    name: 'copilot/server.js (:3750)',                version: '3.5.0' });
decl('component', { id: 'copilot.expectationWatcher', namespace: 'copilot',    name: 'expectation-watcher.js',                   version: '1.0.0' });
decl('component', { id: 'orchestrator.uiRoute',       namespace: 'orchestrator', name: 'orchestrator.js /ui/:sub route',         version: '2.2.0' });
decl('component', { id: 'idearium.ui',                namespace: 'idearium',   name: 'idearium/ui/ (served from its own dir, not UI_ROOT)', version: '3.2.0' });
decl('component', { id: 'emerge.consumer',            namespace: 'emerge',     name: 'emerge/consumer.js',                       version: '1.0.0' });
decl('component', { id: 'bridge.router',              namespace: 'bridge',     name: 'bridge/router.js (DispatchGate + ResultGate)', version: '3.2.0' });

console.log('[loom/seed] declaring hooks...');

// context:switch (renderer -> main, IPC) — was already correctly wired,
// re-declared here so it's covered going forward same as everything else.
decl('hook', { id: 'clearglass.renderer.contextSwitch.call',   component_id: 'clearglass.renderer',     name: 'cg.context.switch() call',     type: 'callto', direction: 'out' });
decl('hook', { id: 'clearglass.main.contextSwitch.receive',    component_id: 'clearglass.main',         name: "ipcMain.handle('context:switch')", type: 'callto', direction: 'in' });
decl('hook', { id: 'clearglass.main.switchTo.call',            component_id: 'clearglass.main',         name: 'ctxMgr.switchTo() call',        type: 'direct', direction: 'out' });
decl('hook', { id: 'clearglass.contextManager.switchTo',       component_id: 'clearglass.contextManager', name: 'switchTo()',                  type: 'direct', direction: 'in' });

// context:switchFingerprint (renderer -> main, IPC) — genuinely new channel
// added this session; context:switch above was never supposed to carry this.
decl('hook', { id: 'clearglass.renderer.identityBadge.click',       component_id: 'clearglass.renderer', name: 'identity badge dropdown click', type: 'callto', direction: 'out' });
decl('hook', { id: 'clearglass.main.contextSwitchFp.receive',       component_id: 'clearglass.main',     name: "ipcMain.handle('context:switchFingerprint')", type: 'callto', direction: 'in' });
decl('hook', { id: 'clearglass.main.switchFingerprint.call',        component_id: 'clearglass.main',     name: 'ctxMgr.switchFingerprint() call', type: 'direct', direction: 'out' });
decl('hook', { id: 'clearglass.contextManager.switchFingerprint',   component_id: 'clearglass.contextManager', name: 'switchFingerprint()',   type: 'direct', direction: 'in' });

// copilot:build / copilot:diagnose (renderer -> main, IPC) — fixed from
// rendererEmit-into-a-void to calling the real Bridge-dispatching methods.
decl('hook', { id: 'clearglass.renderer.slashBuild.call',      component_id: 'clearglass.renderer', name: '/build slash command',         type: 'callto', direction: 'out' });
decl('hook', { id: 'clearglass.main.copilotBuild.receive',     component_id: 'clearglass.main',     name: "ipcMain.handle('copilot:build')", type: 'callto', direction: 'in' });
decl('hook', { id: 'clearglass.main.copilotBuild.call',        component_id: 'clearglass.main',     name: 'this.copilot.build() call',    type: 'direct', direction: 'out' });
decl('hook', { id: 'copilot.bridgeClient.build',               component_id: 'copilot.bridgeClient', name: 'build()',                      type: 'direct', direction: 'in' });

decl('hook', { id: 'clearglass.renderer.slashDiagnose.call',   component_id: 'clearglass.renderer', name: '/diagnose slash command',      type: 'callto', direction: 'out' });
decl('hook', { id: 'clearglass.main.copilotDiagnose.receive',  component_id: 'clearglass.main',     name: "ipcMain.handle('copilot:diagnose')", type: 'callto', direction: 'in' });
decl('hook', { id: 'clearglass.main.copilotDiagnose.call',     component_id: 'clearglass.main',     name: 'this.copilot.diagnose() call', type: 'direct', direction: 'out' });
decl('hook', { id: 'copilot.bridgeClient.diagnose',            component_id: 'copilot.bridgeClient', name: 'diagnose()',                   type: 'direct', direction: 'in' });

// /ui/idearium — orchestrator special-cased idearium's UI dir since it
// lives outside UI_ROOT, unlike every other system's full-tab UI.
decl('hook', { id: 'orchestrator.uiRoute.ideariumRequest',     component_id: 'orchestrator.uiRoute', name: 'GET /ui/idearium',             type: 'webserver', direction: 'in' });
decl('hook', { id: 'orchestrator.uiRoute.ideariumServe',       component_id: 'orchestrator.uiRoute', name: 'serveFile(idearium/ui/...)',   type: 'direct',    direction: 'out' });
decl('hook', { id: 'idearium.ui.files',                        component_id: 'idearium.ui',          name: 'idearium/ui/ static files',    type: 'direct',    direction: 'in' });

// The build pipeline's actual gap: dispatch (file-drop queue) and the
// report-back (new POST /api/event). Two separate wires, matching the
// two separate mechanisms.
decl('hook', { id: 'copilot.moduleBuilder.dispatchContract',   component_id: 'copilot.moduleBuilder', name: 'cq.dispatch() → emerge/input/', type: 'event_bus', direction: 'out' });
decl('hook', { id: 'emerge.consumer.pollInput',                component_id: 'emerge.consumer',       name: "cq.pending('emerge') poll",     type: 'event_bus', direction: 'in' });

decl('hook', { id: 'emerge.consumer.reportEvent',              component_id: 'emerge.consumer',       name: 'POST /api/event (accepted/complete/failed)', type: 'api', direction: 'out' });
decl('hook', { id: 'copilot.server.apiEvent',                  component_id: 'copilot.server',        name: 'POST /api/event handler',       type: 'api', direction: 'in' });

// The expectation itself — copilot.server's real trigger emit into the
// in-process bus, consumed by expectation-watcher.
decl('hook', { id: 'copilot.moduleBuilder.emergeContractDispatched', component_id: 'copilot.moduleBuilder', name: 'emerge.contract.dispatched bus emit', type: 'event_bus', direction: 'out' });
decl('hook', { id: 'copilot.expectationWatcher.buildExpectation',    component_id: 'copilot.expectationWatcher', name: "'module-build-dispatched-then-accepted'", type: 'event_bus', direction: 'in' });

// bridge/router.js's internal DispatchGate → ResultGate handoff — the
// actual root cause of "co-pilot showing json strings, over and over."
// Both hooks belong to the same component on purpose: this was never a
// cross-component wire, it was one component's own internal seam
// silently dropping data between two of its own gates.
decl('hook', { id: 'bridge.router.dispatchGate.captured',      component_id: 'bridge.router', name: 'DispatchGate captured response body (`data`)', type: 'direct', direction: 'out' });
decl('hook', { id: 'bridge.router.resultGate.resolve',         component_id: 'bridge.router', name: 'ResultGate resolve(...) — now includes `data`', type: 'direct', direction: 'in' });

console.log('[loom/seed] declaring wires...');

decl('wire', { id: 'wire.clearglass.contextSwitch.ipc',         from_hook_id: 'clearglass.renderer.contextSwitch.call',   to_hook_id: 'clearglass.main.contextSwitch.receive' });
decl('wire', { id: 'wire.clearglass.contextSwitch.handler',     from_hook_id: 'clearglass.main.switchTo.call',            to_hook_id: 'clearglass.contextManager.switchTo' });

decl('wire', { id: 'wire.clearglass.contextSwitchFp.ipc',       from_hook_id: 'clearglass.renderer.identityBadge.click',  to_hook_id: 'clearglass.main.contextSwitchFp.receive' });
decl('wire', { id: 'wire.clearglass.contextSwitchFp.handler',   from_hook_id: 'clearglass.main.switchFingerprint.call',   to_hook_id: 'clearglass.contextManager.switchFingerprint' });

decl('wire', { id: 'wire.clearglass.copilotBuild.ipc',          from_hook_id: 'clearglass.renderer.slashBuild.call',      to_hook_id: 'clearglass.main.copilotBuild.receive' });
decl('wire', { id: 'wire.clearglass.copilotBuild.handler',      from_hook_id: 'clearglass.main.copilotBuild.call',        to_hook_id: 'copilot.bridgeClient.build' });

decl('wire', { id: 'wire.clearglass.copilotDiagnose.ipc',       from_hook_id: 'clearglass.renderer.slashDiagnose.call',   to_hook_id: 'clearglass.main.copilotDiagnose.receive' });
decl('wire', { id: 'wire.clearglass.copilotDiagnose.handler',   from_hook_id: 'clearglass.main.copilotDiagnose.call',     to_hook_id: 'copilot.bridgeClient.diagnose' });

decl('wire', { id: 'wire.orchestrator.ideariumUi.request',      from_hook_id: 'orchestrator.uiRoute.ideariumRequest',     to_hook_id: 'orchestrator.uiRoute.ideariumServe' });
decl('wire', { id: 'wire.orchestrator.ideariumUi.serve',        from_hook_id: 'orchestrator.uiRoute.ideariumServe',       to_hook_id: 'idearium.ui.files' });

decl('wire', { id: 'wire.emerge.dispatch',                      from_hook_id: 'copilot.moduleBuilder.dispatchContract',   to_hook_id: 'emerge.consumer.pollInput' });
decl('wire', { id: 'wire.emerge.reportBack',                    from_hook_id: 'emerge.consumer.reportEvent',              to_hook_id: 'copilot.server.apiEvent' });
decl('wire', { id: 'wire.emerge.expectation',                   from_hook_id: 'copilot.moduleBuilder.emergeContractDispatched', to_hook_id: 'copilot.expectationWatcher.buildExpectation' });

decl('wire', { id: 'wire.bridge.dispatchToResult',              from_hook_id: 'bridge.router.dispatchGate.captured',      to_hook_id: 'bridge.router.resultGate.resolve' });

// §NEW 2026-07-11 (round 2) — found by applying this exact sweep to
// idearium's own os.emit()/Gate pattern: refreshOnEvent()'s dispatcher
// only recognized bare-prefix event names ('spec.created'), not the
// 'idearium.'-prefixed convention several newer events use
// ('idearium.spec.built', 'idearium.repo.file.write', etc.) — every one
// of those silently triggered no UI refresh. Fixed the dispatcher
// systemically (strip the optional prefix once) rather than one case at
// a time; declaring the two most concrete instances as wires here.
decl('component', { id: 'idearium.repoLayer',    namespace: 'idearium', name: 'repo/index.js (file CRUD)',        version: '1.1.0' });
decl('component', { id: 'idearium.uiDispatcher', namespace: 'idearium', name: 'ui/js/app.js refreshOnEvent()',    version: '3.2.0' });

decl('hook', { id: 'idearium.repoLayer.fileWrite',   component_id: 'idearium.repoLayer',    name: "os.emit('idearium.repo.file.write')", type: 'event_bus', direction: 'out' });
decl('hook', { id: 'idearium.uiDispatcher.repoRefresh', component_id: 'idearium.uiDispatcher', name: 'refreshOnEvent() repo.* case',     type: 'event_bus', direction: 'in' });

decl('wire', { id: 'wire.idearium.repoFileWrite.refresh', from_hook_id: 'idearium.repoLayer.fileWrite', to_hook_id: 'idearium.uiDispatcher.repoRefresh' });

console.log(`\n[loom/seed] done — ${declared} declared, ${alreadySeeded} already seeded, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
