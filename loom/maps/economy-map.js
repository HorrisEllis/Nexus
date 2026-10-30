'use strict';
/**
 * loom/maps/economy-map.js — 0.39.281: docs/2026-09-29-provider-economy-phasemap.spec mapped into LOOM, one component
 * per FILE with every REAL edge as a wire. Mirrors loom/maps/build-surface-map.js.
 * comp_id: nexus.loom.maps.economy
 * UUID: nexus-loom-map-economy-v1-0000-2026-0929-001
 *
 * Hand-mapped because several edges are not require()s the source scanner can see:
 *   guardian/lib/dispatcher.js → guardian/lib/economy-guard.js          deps.economy (handed in by server.js via lib/index.js)
 *   lib/repo-inject.js → lib/repo-agent.js                              the stage option (repo-agent._economyStage) it is handed
 *   idearium/ui/settings.html → idearium/api/index.js                   HTTP GET|POST /api/economy, GET /api/economy/:what
 *   idearium/api/index.js → guardian/server.js                          HTTP :7820/api/economy* (nexus-client)
 *   lib/automation/engine.js → clear-glass/src/driver/index.js   browserFn → driver.exec pointer (via 'eros')
 *   clear-glass/renderer/settings/sections/eros.js → clear-glass/src/main/index.js   HTTP /eros/* (the wire proxy)
 *   clear-glass/src/main/index.js → erosmancer-os/src/api/server.ts     _proxyEros → ErosmancerOS REST
 * The .ts and .html files are not scanned (.js only), so they are declared here; lib/economy/* and
 * guardian/lib/economy-guard.js are hand-mapped (excluded from the scan in loom/bootstrap.js).
 */
const { idFor } = require('../scanners/source-map');
const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['lib/economy/policy.js', I('lib/economy/policy.js'), []],
  ['lib/economy/ledger.js', I('lib/economy/ledger.js'), []],
  ['lib/economy/gate.js', I('lib/economy/gate.js'), []],
  ['lib/economy/tokens.js', I('lib/economy/tokens.js'), []],
  ['lib/economy/router.js', I('lib/economy/router.js'), []],
  ['lib/economy/store.js', I('lib/economy/store.js'), [
    I('lib/economy/policy.js'), I('lib/economy/ledger.js'),   // require('./policy.js'), require('./ledger.js') — normalize, dir()
    I('lib/agent-providers.js'),                              // require('../agent-providers.js') — the one provider list
  ]],
  ['guardian/lib/economy-guard.js', I('guardian/lib/economy-guard.js'), [
    I('lib/economy/gate.js'), I('lib/economy/ledger.js'), I('lib/economy/store.js'), I('lib/economy/tokens.js'),
  ]],
  ['idearium/ui/settings.html', I('idearium/ui/settings.html'), [I('idearium/api/index.js')]],   // HTTP /api/economy*
  // §AT1 0.60.256 — James, 2026-10-26: "i want to be able to import and export the data." The autofill data as one .autofill file
  ['clear-glass/src/contexts/human-check.js', I('clear-glass/src/contexts/human-check.js'), [I('clear-glass/src/net/compartment.js')]],   // §HC1 0.60.260
  ['clear-glass/src/main/glass-frame.js', I('clear-glass/src/main/glass-frame.js'), []],   // §GF1 0.60.258 the Clear Glass title bar over a foreign page
  ['clear-glass/src/autofill/transfer.js', I('clear-glass/src/autofill/transfer.js'), [I('clear-glass/src/autofill/learn-pick.js'), I('clear-glass/src/autofill/matcher.js')]],
  // §DD1 0.60.298 — James, 2026-10-30: "Make sure it works for all elements. Including drop downs." The dropdown/checkbox option matcher (pure, no deps)
  ['clear-glass/src/dom/select-match.js', I('clear-glass/src/dom/select-match.js'), []],
  // §PF1 0.60.299 — James, 2026-10-30: "make a .portfolio node, all nodes are physical files in the backend. import and export." The .portfolio node + store
  ['clear-glass/src/autofill/portfolio.js', I('clear-glass/src/autofill/portfolio.js'), [I('clear-glass/src/storage/jaa.js')]],
  ['clear-glass/erosmancer/erosmancer-os/src/replay/index.ts', I('clear-glass/erosmancer/erosmancer-os/src/replay/index.ts'), []],
  ['clear-glass/erosmancer/erosmancer-os/src/api/server.ts', I('clear-glass/erosmancer/erosmancer-os/src/api/server.ts'), [
    I('clear-glass/erosmancer/erosmancer-os/src/replay/index.ts'),         // import { ScriptReplayQueue } — snapshot(), list() (EC10)
  ]],
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('guardian/server.js'), I('guardian/lib/economy-guard.js'), 'createEconomyGuard() → wireGuardianCore({ economy }), attach(bus)'],
  [I('guardian/server.js'), I('lib/economy/store.js'), 'GET|POST /api/economy'],
  [I('guardian/server.js'), I('lib/economy/ledger.js'), 'GET /api/economy/usage|limits|routing'],
  [I('guardian/server.js'), I('lib/economy/gate.js'), 'GET /api/economy/usage (gate per provider)'],
  [I('guardian/server.js'), I('lib/economy/tokens.js'), 'GET /api/economy/limits'],
  [I('guardian/server.js'), I('lib/economy/router.js'), 'GET /api/economy/routing'],
  [I('guardian/server.js'), I('lib/economy/policy.js'), 'GET /api/economy (tiers, job types, limits)'],
  [I('guardian/lib/dispatcher.js'), I('guardian/lib/economy-guard.js'), 'deps.economy.check / begin before the dispatch pool'],
  [I('lib/repo-agent.js'), I('lib/economy/store.js'), '_economyStage(provider) — the stage tiers'],
  [I('lib/repo-inject.js'), I('lib/repo-agent.js'), 'fromReply({ stage }) — the stage record repo-agent hands it'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/store.js'), '_learnedOrder: policy'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/ledger.js'), '_learnedOrder: build records'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/gate.js'), '_learnedOrder: only providers the gate allows'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/router.js'), '_learnedOrder: choose("build", …)'],
  [I('idearium/api/index.js'), I('guardian/server.js'), 'economy.get / economy.set / economy.view → HTTP :7820/api/economy*'],
  [I('lib/automation/engine.js'), I('clear-glass/src/driver/index.js'), "_erosInput → browserFn → driver.exec pointer via 'eros'"],
  [I('clear-glass/renderer/settings/sections/eros.js'), I('clear-glass/src/main/index.js'), 'HTTP /eros/tabs|nodes|execute|replay (workbench)'],
  // §GA1 0.60.161 — the co-pilot fills the Fiverr gig editor through the engine (James: "need help with the autofill for fiverr")
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.161 autofill.gig -> /cli/autofill/gig/autofill (_gigAutofill)'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/autofill/gig.js'), '_gigAutofill/_gigFill/_gigDraft: write and fill a Fiverr gig'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/autofill/store.js'), '0.60.161 GA1a getLastGig/setLastGig: the panel and the co-pilot fill the same gig'],
  // §DD1 0.60.298 — the dropdown/checkbox option matcher, used by both fill paths (reuse)
  [I('clear-glass/src/dom/archaeology.js'), I('clear-glass/src/dom/select-match.js'), '0.60.298 DD1 bestOption/boolOf SOURCE interpolated into DOM_OBSERVER_SCRIPT mutate: a <select> selects the matching option, a checkbox/radio sets checked'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/dom/select-match.js'), '0.60.298 DD1 _autofillFillOne: bestOption resolves the profile value to the real option before driver.select'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/erosmancer/erosmancer-os/src/api/server.ts'), '_proxyEros: /eros/* → /api/*'],
  // §JA3 0.60.230 — the element picker on a missed autofill field (James: "have the element picker popup for me to select the element")
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.230 autofill.pick -> /cli/autofill/pick (_autofillPick)'],
  [I('idearium/cli/route-commands.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.230 autofill pick|learn rows -> HTTP :7702 /cli/autofill/pick|learn'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/autofill/learn-pick.js'), '_autofillPick -> pickAndLearn; /cli/autofill/learn -> saveLearned (one save path)'],
  [I('clear-glass/src/autofill/learn-pick.js'), I('clear-glass/renderer/guardian-picker.js'), 'pickScript: the Guardian picker source run in the tab, field mode (pickField)'],
  [I('clear-glass/src/autofill/matcher.js'), I('clear-glass/src/autofill/learn-pick.js'), 'fillFields/detectFields -> needsPick (lazy require: learn-pick requires matcher)'],
  // §JA5 0.60.232 — the pick is also a macro (James: "saves to per site settings, and as a macro or automation")
  [I('clear-glass/src/autofill/learn-pick.js'), I('clear-glass/renderer/selector-check.js'), 'selectorScript: selector-check.js source run in the tab, key input (the box\'s selector)'],
  [I('clear-glass/src/ipc/bridge.js'), I('lib/agent-tools/tools/clear-glass/macro.js'), '0.60.232 _autofillMacroDoor: learn-pick saveMacro -> macroTool get/delete/create/export'],
  [I('clear-glass/src/ipc/bridge.js'), I('lib/automation/engine.js'), '0.60.232 _autofillMacroDoor: NODES_DIR, where the site macro\'s .macro node goes'],
  // §JA4 0.60.231 — the learn-loop on screen: the panel → preload → IPC → learn-pick
  [I('clear-glass/renderer/settings/sections/autofill.js'), I('clear-glass/src/preload/index.js'), '0.60.231 cg.autofill.pick / learned / forget (Pick buttons; Fields it learned, Forget)'],
  [I('clear-glass/src/preload/index.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.231 IPC autofill:pick | autofill:learned | autofill:forget'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.231 autofill.learned -> GET /cli/autofill/learned; autofill.forget -> POST /cli/autofill/forget'],
  // §AD 0.60.251 — James, 2026-10-25: "need clearglass' fiverr, job application automation, autofill and macros working fully, including with the agents and copilot."
  [I('lib/agent-tools/tools/clear-glass/browser.js'), I('clear-glass/src/ipc/bridge.js'), 'HTTP :7702 /cli/* (_call) — the agents\' direct door'],
  [I('lib/agent-tools/tools/autofill/autofill-manage.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.251 AD1 autofill_manage -> /cli/autofill/* (profiles, detect, fill, gig, pick, learn, learned, forget)'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.251 AD3 autofill.profiles|detect|fill, macro.list|get|run|create|delete|record.* -> /cli/autofill/*, /cli/macros*'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/copilot/verbs.js'), '0.60.251 AD3 send(): fillIntent / pickIntent / recordIntent, isGigEditor, describeJob — before the model'],
  [I('idearium/cli/route-commands.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.251 AD4 autofill profiles|detect|fill, gig fill|detect, macro list|show|run|record|stop rows -> HTTP :7702'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/macros/live-recording.js'), '0.60.251 AD2 _macroRecord: one LiveRecorder for IPC macros:record* and /cli/macros/record/*'],
  // §UP 0.60.252 — James, 2026-10-25: "can we make a tool for the copilot (remmber copilot is meant to be a hat.) like a update tool using github?"
  [I('lib/nexus-update.js'), I('lib/release-version.js'), '0.60.252 UP1 _releasesBetween: lineOf/quoteOf on origin\'s lib/version.js — his words per release (the parsers are lib\'s since 0.60.277)'],
  [I('lib/agent-tools/tools/nexus/update.js'), I('lib/nexus-update.js'), '0.60.252 UP4 nexus.update.tool check|history|apply|rollback'],
  [I('lib/agent-tools/index.js'), I('lib/agent-tools/tools/nexus/update.js'), '0.60.252 UP4 registerTool(nexus.update.tool)'],
  [I('lib/hat-seed.js'), I('lib/agent-tools/tools/nexus/update.js'), '0.60.252 UP4 the_clearglass_operator toolScope + SEED_ADDITIONS 0.60.252'],
  [I('idearium/api/index.js'), I('lib/nexus-update.js'), '0.60.252 UP3 /api/update, /api/update/apply|rollback|history; /api/update/restart → autopilot /control/:name/restart'],
  [I('idearium/cli/route-commands.js'), I('idearium/api/index.js'), '0.60.252 UP3 update | update apply|rollback|history rows → /api/update*'],
  [I('idearium/ui/update.html'), I('idearium/api/index.js'), '0.60.252 UP4 the Updates page: fetch /api/update*'],
  // §ER 0.60.253 — James, 2026-10-25: "can you hook erosmanceros into snowflake, accounts manager, and the dom mutator."
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/eros/tab-match.js'), '0.60.253 ER1 resolveTab: the agent\'s own page (url+title, a marker on a tie) — no first-tab guess'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/erosmancer/erosmancer-os/src/api/server.ts'), '0.60.253 ER2 /api/input {profile} (the account\'s pace), /api/behavior/profile, /api/evaluate (the tie-break)'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.253 ER2 erosOpen via snowflake → _netOpenVia (Snowflake\'s forced session); erosOpen/erosTabs handed to the bridge'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/options/store.js'), '0.60.253 ER2 getAccount(id).erosProfile — an acct-<id> window moves at its account\'s pace'],
  [I('clear-glass/src/dom/archaeology.js'), I('clear-glass/src/driver/index.js'), '0.60.253 ER3 dom.erosInput = driver.erosInput: handleMutate via eros types the value through ErosmancerOS'],
  [I('clear-glass/renderer/settings/sections/accounts.js'), I('clear-glass/src/preload/index.js'), '0.60.253 ER4 cg.accounts.update {erosProfile} (each account\'s Eros pace)'],
  [I('idearium/cli/route-commands.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.253 ER4 eros open|tabs|pace rows → /cli/eros/open, /cli/eros/tabs, PUT /cli/accounts/:id'],
  // §HC 0.60.260 — James, 2026-10-26: "i can't get passed this. can you help?"
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/contexts/human-check.js'), '0.60.260 HC2 _humanCheck after a tab loads; _identityBeforeLoad for a remembered site'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/contexts/manager.js'), '0.60.260 HC2 useEngineIdentity / contextForSession; the hostile hook asks mode engine on a challenge'],
  [I('clear-glass/src/contexts/manager.js'), I('clear-glass/src/contexts/human-check.js'), '0.60.260 HC2 engineUserAgent'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/contexts/human-check.js'), '0.60.260 HC3 _humanCheckGate before every fill (IPC, /cli, the gig)'],
  // §GF 0.60.258 — James, 2026-10-26: "also the popup windows need to match the rest of the ui."
  [I('clear-glass/src/providers/host.js'), I('clear-glass/src/main/glass-frame.js'), '0.60.258 GF1 the provider window is a Glass frame (frame(o), the BrowserWindow calls it makes)'],
  [I('clear-glass/src/main/compartment-window.js'), I('clear-glass/src/main/glass-frame.js'), '0.60.258 GF1 a site popup: setWindowOpenHandler createWindow → fromOpen (opener kept)'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/main/glass-frame.js'), '0.60.258 GF1/GF2 registerIpc, devToolsKeys on every window, the login portal\'s frame'],
  [I('clear-glass/src/providers/attention.js'), I('clear-glass/src/main/glass-frame.js'), '0.60.258 GF1 all(): frames count in the popup check'],
  [I('clear-glass/src/main/glass-frame.js'), I('clear-glass/renderer/glass-frame.html'), '0.60.258 GF1 the bar page; preload/glass-frame.js → glass-frame:control'],
  // §AT 0.60.256 — the autofill data out and in; .gig only
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/autofill/transfer.js'), '0.60.256 AT2 _autofillExport/_autofillImport/_autofillImportUndo: IPC autofill:export|import|import:undo, /cli/autofill/export|import|import/undo'],
  [I('clear-glass/src/autofill/transfer.js'), I('clear-glass/src/autofill/store.js'), '0.60.256 AT1 listProfiles/putProfile/replaceProfiles, getLastGig/setLastGig (the store is passed in)'],
  [I('clear-glass/src/autofill/transfer.js'), I('clear-glass/src/site-settings/store.js'), '0.60.256 AT1 the learned fields: getAllForOrigin/set/deleteKey (passed in)'],
  [I('clear-glass/renderer/settings/sections/autofill.js'), I('clear-glass/src/preload/index.js'), '0.60.256 AT3 cg.autofill.exportAll / importAll / importUndo / gigTemplate (Your autofill data)'],
  [I('clear-glass/src/preload/index.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.256 AT2 IPC autofill:export | autofill:import | autofill:import:undo'],
  [I('idearium/cli/route-commands.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.256 AT2 autofill export [--out] | autofill import <file>|undo rows -> HTTP :7702'],
  [I('lib/agent-tools/tools/autofill/autofill-manage.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.256 AT2 autofill_manage export | import | importUndo -> /cli/autofill/export|import|import/undo'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.256 AT2 autofill.export | autofill.import (undo) -> /cli/autofill/*'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/autofill/gig.js'), '0.60.256 AT4 gigFilename: every gig file written ends in .gig'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.253 ER4 eros.open | eros.tabs → /cli/eros/*'],
  [I('clear-glass/src/copilot/bridge.js'), I('lib/agent-tools/tools/nexus/update.js'), '0.60.252 UP4 update.check|apply|rollback|history and "is there an update?" → nexus.update.tool (copilot /api/tools/run)'],
];

function mapEconomy(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0929-003` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  for (const [, id, req] of FILES) {
    const e = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0929-003` });
    (e.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r: e });
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0929-003` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  // A consumer whose edge is not a require() (deps handed in, a renderer script over HTTP) has no import hook from the
  // scan; declare it, so the wire has both ends. One that already exists is refused as a duplicate — that is fine.
  for (const consumer of new Set(CONSUMERS.map(c => c[0]))) {
    if (own.has(consumer)) continue;
    const r = driver.declare('hook', { id: `${consumer}.import`, component_id: consumer, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${consumer}-import-v1-0000-2026-0929-003` });
    if (r.ok) results.hooks.push({ id: `${consumer}.import`, r });
    else if (!(r.failures || []).every(f => f.axiomId === 'loom.unique-id')) results.failures.push({ id: `${consumer}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `economy.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-economy-wire-${n}-v1-0000-2026-0929-001`, external: true });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      const r = driver.declare('wire', { id: `economy.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-economy-wire-${n}-v1-0000-2026-0929-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapEconomy, FILES, CONSUMERS };
