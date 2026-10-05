'use strict';
/**
 * loom/bootstrap.js — seeds loom/data/registry.json.
 * v2: replaces the earlier monolithic 'nexus.warp' single-component
 * registration with the real per-file map (loom/maps/warp-map.js) —
 * that first attempt had the wrong surface area, corrected here.
 *
 * Run: node loom/bootstrap.js
 */
const { LoomDriver } = require('./schema/index');
const { mapWarp } = require('./maps/warp-map');
const { mapObservability } = require('./maps/observability-map');
const { mapCopilotCapability } = require('./maps/copilot-capability-map');
const { mapSession20260814 } = require('./maps/session-2026-08-14-map');
const { mapUi } = require('./maps/ui-map');
const { mapRaidEventsAndTools } = require('./maps/raid-events-and-tools-map');
const { mapAccountsAuthority } = require('./maps/accounts-authority-map');

const driver = new LoomDriver(); // default dataDir = loom/data/

// ── §DEFERRED DECLARATIONS — fixed 2026-08-13 ──────────────────────────────
// Measured against a real from-scratch regeneration: 17 hook rejects and 99
// wire rejects, EVERY ONE of them `loom.hook-component-exists` or
// `loom.wire-endpoints-exist`. Instrumenting driver.declare and comparing the
// rejected payloads against the FINAL registry showed the dependency existed
// by the end of the run in every case — 16 of the 17 boundary .export hooks
// were rejected only because the boundary block runs before the hand maps
// that declare those components, and each map declares its own wires before
// later maps declare the hooks those wires terminate on. Nothing was missing;
// everything simply arrived out of order.
//
// The maps are correct and stay untouched (§16.5). Instead: a declaration
// rejected SOLELY for a not-yet-existing dependency is parked and replayed
// once every map has run. A replayed hook can unblock a wire, so the drain
// loops while it makes progress. Anything still rejected after that is a REAL
// gap and is reported as one — the deferral resolves ordering, it never
// invents an endpoint (§1.1).
const DEFERRABLE = new Set(['loom.hook-component-exists', 'loom.wire-endpoints-exist']);
const _deferred = [];
const _declare = driver.declare.bind(driver);
function _isOrderingReject(r) {
  return !r.ok && r.reason === 'axiom-rejected' && Array.isArray(r.failures) &&
         r.failures.length > 0 && r.failures.every(f => DEFERRABLE.has(f.axiomId));
}
driver.declare = function (kind, payload) {
  const r = _declare(kind, payload);
  if (_isOrderingReject(r)) _deferred.push({ kind, payload });
  return r;
};

// drainDeferred() — replay parked declarations until no further progress.
// Uses the UNWRAPPED _declare so a still-failing retry isn't re-parked here;
// the loop re-queues it explicitly instead, keeping the bound obvious.
function drainDeferred() {
  let resolved = 0, passes = 0;
  let queue = _deferred.splice(0, _deferred.length);
  while (queue.length && passes < 10) {
    const next = [];
    let progress = 0;
    for (const d of queue) {
      const r = _declare(d.kind, d.payload);
      if (r.ok) { resolved++; progress++; }
      else if (_isOrderingReject(r)) next.push(d);
      // any OTHER rejection (unique-id, schema) is a real one — drop it here
      // and let it surface in the unresolved count below rather than looping.
    }
    passes++;
    if (!progress) { queue = next; break; }
    queue = next;
  }
  return { resolved, unresolved: queue, passes };
}

// ── LOOM and the Architect — one component each, they aren't Warp files ────
const seed = [];
seed.push(['component', driver.declare('component', {
  id: 'nexus.loom', namespace: 'loom', name: 'LOOM', version: '0.1.0',
  uuid: 'nexus-loom-v1-0000-2026-0701-jamesbrooks-001',
})]);
seed.push(['component', driver.declare('component', {
  id: 'nexus.architect', namespace: 'architect', name: 'The Architect', version: '1.1.0',
  uuid: 'architect-spec-0000-2026-0530-rheon-002',
})]);

// §PHASEMAP observability/tablet (2026-07-30) — these components are mapped WITH
// their real require() edges as wires by mapObservability() below (see
// loom/maps/observability-map.js), NOT as bare declarations here. The registry is
// the system's self-model of its connections (James): a component without its
// wires is an isolated dot the system can't reason over. Mapped, not just listed.
seed.push(['hook', driver.declare('hook', {
  id: 'loom.hook.declare', component_id: 'nexus.loom', name: 'declare',
  type: 'callto', direction: 'in',
  uuid: 'nexus-loom-hook-declare-v1-0000-2026-0701-jamesbrooks-001',
})]);
seed.push(['component', driver.declare('component', {
  id: 'nexus.loom.agent-suite', namespace: 'loom', name: 'LOOM Agent Suite', version: '0.1.0',
  uuid: 'nexus-loom-agent-suite-v1-0000-2026-0701-jamesbrooks-001',
})]);
seed.push(['hook', driver.declare('hook', {
  id: 'loom.agent-suite.hook.declare-via-agent', component_id: 'nexus.loom.agent-suite',
  name: 'declare-via-agent', type: 'callto', direction: 'in',
  uuid: 'nexus-loom-agent-suite-hook-declare-v1-0000-2026-0701-jamesbrooks-001',
})]);
seed.push(['wire', driver.declare('wire', {
  id: 'wire.agent-suite-uses-loom-declare', from_hook_id: 'loom.hook.declare',
  to_hook_id: 'loom.agent-suite.hook.declare-via-agent',
  // §SB1 2026-08-14 — this seed example previously omitted intent,
  // matching (and probably the original template for) source-map.js's
  // same omission. Fixed here too since this is the founding example.
  intent: 'agent-suite declares components/hooks/wires via loom.hook.declare',
  type: 'direct-call',
  uuid: 'nexus-loom-wire-agent-suite-v1-0000-2026-0701-jamesbrooks-001',
})]);

let failures = 0;
for (const [kind, r] of seed) {
  if (r.ok) console.log(`  OK    ${kind}: ${r.stored.id}`);
  else { failures++; console.log(`  FAIL  ${kind}: ${JSON.stringify(r)}`); }
}

// ── WHOLE TREE — scanned from source, FIRST so later maps' wires resolve ────
// §2026-08-08. This tree carries loom/scanners/capability-map.js and
// spec-map.js but NOT source-map.js, and bootstrap never invoked any of the
// three. Result before this change, measured: 62 components with 195
// hard-rejected wires (loom.wire-endpoints-exist), because the hand maps wire
// into components no one declares. The scan runs FIRST and declares an .export
// hook per file, so the hand maps below have real endpoints to terminate on.
// Their own files are excluded by path so nothing is declared twice.
const { scanTree, mapSource } = require('./scanners/source-map');
const { mapCapabilities } = require('./scanners/capability-map');
const { mapSpecs } = require('./scanners/spec-map');
const handMapped = [
  ...require('./maps/warp-map').FILES.map(f => f[0]),
  ...require('./maps/observability-map').FILES.map(f => f[0]),
  ...require('./maps/copilot-capability-map').FILES.map(f => f[0]),
  ...require('./maps/session-2026-08-14-map').FILES.map(f => f[0]),
  ...require('./maps/ui-map').FILES.map(f => f[0]),
  ...require('./maps/raid-events-and-tools-map').FILES.map(f => f[0]),
  ...require('./maps/accounts-authority-map').FILES.map(f => f[0]),
  ...require('./maps/cos-testenv-map').FILES.map(f => f[0]),     // §0.39.264
  ...require('./maps/agent-memory-map').FILES.map(f => f[0]),    // §0.39.269
  ...require('./maps/one-idearium-map').FILES.map(f => f[0]),    // §0.39.271
  ...require('./maps/idearium-codebase-map').FILES.map(f => f[0]), // §0.39.273
  ...require('./maps/chat-ledger-map').FILES.map(f => f[0]),     // §0.39.278
  ...require('./maps/build-surface-map').FILES.map(f => f[0]),   // §0.39.280
  ...require('./maps/economy-map').FILES.map(f => f[0]),         // §0.39.281
  ...require('./maps/build-context-map').FILES.map(f => f[0]),   // §0.39.309
  ...require('./maps/verified-primitives-map').FILES.map(f => f[0]),   // §0.39.310
  'loom/agent-suite/index.js',
];
console.log('\nscanning whole tree from source (real require/import edges only)...\n');
const scan = scanTree({ excludePaths: handMapped });
console.log(`  files scanned:    ${scan.stats.scanned} (${scan.stats.excluded} hand-mapped, excluded)`);
console.log(`  edges found:      ${scan.stats.totalEdges}`);
console.log(`  NOT captured:     ${scan.stats.dynamicRequiresNotCaptured} dynamic require()/import() — no static reader resolves these`);
console.log(`  unresolved specs: ${scan.stats.unresolvedSpecifiers} (see loom/scanners/dangling-report.js)`);
// §BOUNDARY EXPORTS — a hand-mapped file that the scanned tree requires needs
// an .export hook, or every wire INTO it is hard-rejected. The hand maps only
// declare .export for ids inside their own requiredBy set, so cross-boundary
// consumers (jaa-db, meta/cfr/index, ...) had none. 69 wires died on this.
const { idFor } = require('./scanners/source-map');
const scannedTargets = new Set(scan.FILES.flatMap(f => f[2]));
let boundaryHooks = 0;
for (const file of handMapped) {
  const id = idFor(file);
  if (!scannedTargets.has(id)) continue;
  const r = driver.declare('hook', {
    id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
    uuid: `nexus-loom-boundary-${id}-export-v1-0000-2026-0808-001`,
  });
  if (r.ok) boundaryHooks++;
}
console.log(`  boundary .export hooks for hand-mapped files required by the tree: ${boundaryHooks}`);
// §PRUNE 0.39.260 — registry.json was add-only: a file the scanner mapped
// once stayed in the registry after it was deleted, moved, or (the case in
// James's boot log) turned out to be an imported user project under
// idearium/repo/repos/. Every such stale record's hooks were then reported
// as dangling on every boot. Only records THIS scanner owns are pruned
// (uuid prefix nexus-loom-scan-), plus anything under an excluded path;
// hand-mapped and seeded records are never touched. Wires whose endpoint
// hook is gone are removed with them — a wire cannot exist without both
// endpoints (loom.wire-endpoints-exist), so such a wire is stale by
// definition.
{
  const { skippedIdPrefixes } = require('./scanners/source-map');
  const prefixes = skippedIdPrefixes();
  const live = new Set(scan.FILES.map(f => f[1]));
  for (const f of handMapped) live.add(idFor(f));
  const isStaleComp = (c) =>
    prefixes.some(p => c.id.startsWith(p)) ||
    (typeof c.uuid === 'string' && c.uuid.startsWith('nexus-loom-scan-') && !live.has(c.id));
  const staleComps = new Set(Object.values(driver.registry.all('component')).filter(isStaleComp).map(c => c.id));
  // §0.39.266 — scan-owned EVENT hooks/wires are re-derived every run (below, in mapSource): drop them
  // first, so an event that stopped being emitted or heard leaves the registry instead of dangling, and
  // loom.unique-id does not reject the fresh declaration of one that still exists.
  const scanEvent = (rec) => typeof rec.uuid === 'string' && rec.uuid.startsWith('nexus-loom-scan-') && rec.type === 'event';
  const r1 = driver.registry.removeWhere((kind, rec) =>
    (kind === 'component' && staleComps.has(rec.id)) ||
    (kind === 'hook' && (staleComps.has(rec.component_id) || scanEvent(rec))) ||
    (kind === 'wire' && scanEvent(rec)));
  const hooksLeft = driver.registry.all('hook');
  const r2 = driver.registry.removeWhere((kind, rec) =>
    kind === 'wire' && (!hooksLeft[rec.from_hook_id] || !hooksLeft[rec.to_hook_id]));
  console.log(`  pruned stale scan records: ${r1.component} component(s), ${r1.hook} hook(s), ${r2.wire} wire(s)`);
}
const mappedSrc = mapSource(driver, scan.FILES);
console.log(`  components: ${mappedSrc.components.length} ok   hooks: ${mappedSrc.hooks.length} ok   wires: ${mappedSrc.wires.length} ok`);
// §0.39.266 — the registry as an event bus map: wired events became hooks + wires above; every event,
// wired or not, is written beside the registry for component cards and registry.find.
{
  const { eventMap } = require('./scanners/source-map');
  const em = eventMap(scan.FILES);
  const names = Object.keys(em.byEvent);
  console.log(`  events: ${names.length} named · ${mappedSrc.eventHooks.length} event hooks · ${mappedSrc.eventWires.length} emit→listen wires (${names.filter(n => em.byEvent[n].emitters.length && em.byEvent[n].listeners.length).length} events with both sides)`);
  try { require('fs').writeFileSync(require('path').join(__dirname, 'data', 'events.json'), JSON.stringify({ generatedAt: Date.now(), ...em }, null, 1)); }
  catch (e) { console.log(`  events.json not written: ${e.message}`); }
}
if (mappedSrc.failures.length) {
  console.log(`  FAILURES: ${mappedSrc.failures.length}`);
  for (const f of mappedSrc.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`);
  failures += mappedSrc.failures.length;
}

// ── Warp — 17 real components (one per file), per-file hooks, real-require wires ──
console.log('\nmapping warp/ (17 files, real require() edges only)...\n');
const mapped = mapWarp(driver);
console.log(`  components: ${mapped.components.length} ok`);
console.log(`  hooks:      ${mapped.hooks.length} ok`);
console.log(`  wires:      ${mapped.wires.length} ok`);
if (mapped.failures.length) {
  console.log(`  FAILURES:`);
  for (const f of mapped.failures) console.log(`    ${JSON.stringify(f)}`);
  failures += mapped.failures.length;
}

// ── Observability/tablet arc — components mapped WITH real require() wires ──
console.log('\nmapping observability/tablet arc (real require() edges only)...\n');
const mappedObs = mapObservability(driver);
console.log(`  components: ${mappedObs.components.length} ok`);
console.log(`  hooks:      ${mappedObs.hooks.length} ok`);
console.log(`  wires:      ${mappedObs.wires.length} ok`);
if (mappedObs.failures.length) {
  console.log(`  FAILURES:`);
  for (const f of mappedObs.failures) console.log(`    ${JSON.stringify(f)}`);
  failures += mappedObs.failures.length;
}

// ── RAID events + browser-agent tool-call parser — this session's own new
// components (§BUILT 2026-08-31), mapped AFTER observability so the real
// jaa-db/cfr.ledger .export hooks it declares already exist for this map's
// wires to reference ──
console.log('\nmapping RAID events + tool-call components (real require() edges only)...\n');
const mappedRaidTools = mapRaidEventsAndTools(driver);
console.log(`  components: ${mappedRaidTools.components.length} ok`);
console.log(`  hooks:      ${mappedRaidTools.hooks.length} ok`);
console.log(`  wires:      ${mappedRaidTools.wires.length} ok`);
if (mappedRaidTools.failures.length) {
  console.log(`  FAILURES:`);
  for (const f of mappedRaidTools.failures) console.log(`    ${JSON.stringify(f)}`);
  failures += mappedRaidTools.failures.length;
}

// ── Session 2026-08-14 — the 3 genuinely-new components from that session ──
console.log('\nmapping session-2026-08-14 components (real require() edges only)...\n');
const mappedS0814 = mapSession20260814(driver);
console.log(`  components: ${mappedS0814.components.length} ok`);
console.log(`  hooks:      ${mappedS0814.hooks.length} ok`);
console.log(`  wires:      ${mappedS0814.wires.length} ok`);
if (mappedS0814.failures.length) {
  console.log(`  FAILURES:`);
  for (const f of mappedS0814.failures) console.log(`    ${JSON.stringify(f)}`);
  failures += mappedS0814.failures.length;
}

// ── Copilot-capability tool session (2026-08-12) — real require/HTTP edges ──
console.log('\nmapping copilot-capability tools (real require()/HTTP edges only)...\n');
const mappedCC = mapCopilotCapability(driver);
console.log(`  components: ${mappedCC.components.length} ok`);
console.log(`  hooks:      ${mappedCC.hooks.length} ok`);
console.log(`  wires:      ${mappedCC.wires.length} ok`);

// ── UI files (2026-08-13) — plain UI, real HTTP-shaped edges only ──────────
console.log('\nmapping ui files...\n');
const mappedUi = mapUi(driver);
const mappedAccounts = mapAccountsAuthority(driver); // §0.39.223 — account authority / login portals / sealed vaults
// §0.39.264 — the COS test VM + Eravos "new organism" → Idearium (require, spawn, HTTP and postMessage edges)
const mappedCosTestenv = require('./maps/cos-testenv-map').mapCosTestenv(driver);
console.log(`  cos-testenv: ${mappedCosTestenv.components.length} components, ${mappedCosTestenv.hooks.length} hooks, ${mappedCosTestenv.wires.length} wires`);
if (mappedCosTestenv.failures.length) { console.log(`  cos-testenv FAILURES: ${mappedCosTestenv.failures.length}`); for (const f of mappedCosTestenv.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedCosTestenv.failures.length; }
// §0.39.269 — agent providers, agent memory over the Clear Glass download manager, copilot's activity recall
const mappedAgentMemory = require('./maps/agent-memory-map').mapAgentMemory(driver);
console.log(`  agent-memory: ${mappedAgentMemory.components.length} components, ${mappedAgentMemory.hooks.length} hooks, ${mappedAgentMemory.wires.length} wires`);
if (mappedAgentMemory.failures.length) { console.log(`  agent-memory FAILURES: ${mappedAgentMemory.failures.length}`); for (const f of mappedAgentMemory.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedAgentMemory.failures.length; }
// §0.39.271 — the Phases manager, the living spec, the COS debug report, per-system nodes
const mappedOneIdearium = require('./maps/one-idearium-map').mapOneIdearium(driver);
console.log(`  one-idearium: ${mappedOneIdearium.components.length} components, ${mappedOneIdearium.hooks.length} hooks, ${mappedOneIdearium.wires.length} wires`);
if (mappedOneIdearium.failures.length) { console.log(`  one-idearium FAILURES: ${mappedOneIdearium.failures.length}`); for (const f of mappedOneIdearium.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedOneIdearium.failures.length; }
// §0.39.273 — idearium's codebase toolkit: lib/code-intel, lib/code-edit, idearium/repo/code-api, the code tools
const mappedCodebase = require('./maps/idearium-codebase-map').mapIdeariumCodebase(driver);
console.log(`  idearium-codebase: ${mappedCodebase.components.length} components, ${mappedCodebase.hooks.length} hooks, ${mappedCodebase.wires.length} wires`);
if (mappedCodebase.failures.length) { console.log(`  idearium-codebase FAILURES: ${mappedCodebase.failures.length}`); for (const f of mappedCodebase.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedCodebase.failures.length; }
// §0.39.278 — the live chat ledger, the page-side stream that feeds it (HTTP), the pane's kept conversation
const mappedChatLedger = require('./maps/chat-ledger-map').mapChatLedger(driver);
console.log(`  chat-ledger: ${mappedChatLedger.components.length} components, ${mappedChatLedger.hooks.length} hooks, ${mappedChatLedger.wires.length} wires`);
if (mappedChatLedger.failures.length) { console.log(`  chat-ledger FAILURES: ${mappedChatLedger.failures.length}`); for (const f of mappedChatLedger.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedChatLedger.failures.length; }
// §0.39.280 — the build surface (docs/2026-09-29-build-surface-phasemap.spec): HTTP, preload and deps edges included
const mappedBuildSurface = require('./maps/build-surface-map').mapBuildSurface(driver);
console.log(`  build-surface: ${mappedBuildSurface.components.length} components, ${mappedBuildSurface.hooks.length} hooks, ${mappedBuildSurface.wires.length} wires`);
if (mappedBuildSurface.failures.length) { console.log(`  build-surface FAILURES: ${mappedBuildSurface.failures.length}`); for (const f of mappedBuildSurface.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedBuildSurface.failures.length; }
// §0.39.309 — what a build agent is sent about its file (lib/build-context.js) and the build path's edges (docs/build-context.spec)
const mappedBuildContext = require('./maps/build-context-map').mapBuildContext(driver);
console.log(`  build-context: ${mappedBuildContext.components.length} components, ${mappedBuildContext.hooks.length} hooks, ${mappedBuildContext.wires.length} wires`);
if (mappedBuildContext.failures.length) { console.log(`  build-context FAILURES: ${mappedBuildContext.failures.length}`); for (const f of mappedBuildContext.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedBuildContext.failures.length; }
// §0.39.310 — docs/2026-10-05-verified-primitives-phasemap.spec (VP7: the repo Settings tab's categories — page-global and HTTP edges)
const mappedVerifiedPrimitives = require('./maps/verified-primitives-map').mapVerifiedPrimitives(driver);
console.log(`  verified-primitives: ${mappedVerifiedPrimitives.components.length} components, ${mappedVerifiedPrimitives.hooks.length} hooks, ${mappedVerifiedPrimitives.wires.length} wires`);
if (mappedVerifiedPrimitives.failures.length) { console.log(`  verified-primitives FAILURES: ${mappedVerifiedPrimitives.failures.length}`); for (const f of mappedVerifiedPrimitives.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedVerifiedPrimitives.failures.length; }
// §0.39.281 — the provider economy (docs/2026-09-29-provider-economy-phasemap.spec): deps, HTTP and wire-proxy edges included
const mappedEconomy = require('./maps/economy-map').mapEconomy(driver);
console.log(`  economy: ${mappedEconomy.components.length} components, ${mappedEconomy.hooks.length} hooks, ${mappedEconomy.wires.length} wires`);
if (mappedEconomy.failures.length) { console.log(`  economy FAILURES: ${mappedEconomy.failures.length}`); for (const f of mappedEconomy.failures.slice(0, 6)) console.log(`    ${JSON.stringify(f).slice(0, 200)}`); failures += mappedEconomy.failures.length; }
console.log(`  components: ${mappedUi.components.length} ok`);
console.log(`  hooks:      ${mappedUi.hooks.length} ok`);
console.log(`  wires:      ${mappedUi.wires.length} ok`);
if (mappedCC.failures.length) {
  console.log(`  FAILURES:`);
  for (const f of mappedCC.failures) console.log(`    ${JSON.stringify(f)}`);
  failures += mappedCC.failures.length;
}

// ── CAPABILITY / CONSUMER registry — the semantic graph ────────────────────
console.log('\nmapping capability/consumer registry...\n');
const mappedCap = mapCapabilities(driver);
console.log(`  capabilities: ${mappedCap.total}  components: ${mappedCap.components.length}  hooks: ${mappedCap.hooks.length}  wires: ${mappedCap.wires.length}`);
console.log(`  ROUTES DECLARED BUT SERVED BY NOTHING: ${mappedCap.unserved.length}`);
for (const u of mappedCap.unserved) console.log(`    ${u.id.padEnd(28)} ${u.route}`);
console.log(`  CONSUMER WIRES THAT DO NOT RESOLVE: ${mappedCap.dangling.length}`);
for (const d of mappedCap.dangling) console.log(`    ${d.from} -> ${d.target}  (${d.why})`);
if (mappedCap.failures.length) { console.log(`  FAILURES: ${mappedCap.failures.length}`); failures += mappedCap.failures.length; }

// ── SPEC layer ─────────────────────────────────────────────────────────────
console.log('\nmapping spec layer...\n');
const mappedSpec = mapSpecs(driver);
console.log(`  specs: ${mappedSpec.specs}  routes: ${mappedSpec.routes}  components: ${mappedSpec.components.length}  wires: ${mappedSpec.wires.length}`);
console.log(`  §6.3 SPECS NOT TRACKED IN SPEC-REGISTRY.spec: ${mappedSpec.untracked.length}`);
console.log(`  SPEC ROUTES SERVED BY NOTHING: ${mappedSpec.unserved.length}`);
if (mappedSpec.failures.length) { console.log(`  FAILURES: ${mappedSpec.failures.length}`); failures += mappedSpec.failures.length; }

// ── DRAIN — every map has run, so every component and hook that will ever
// exist now does. Replay what was parked purely for arriving too early.
console.log('\nreplaying deferred declarations (ordering, not absence)...\n');
const drained = drainDeferred();
console.log(`  declared on retry: ${drained.resolved} (${drained.passes} pass(es))`);
console.log(`  STILL UNRESOLVED:  ${drained.unresolved.length} — real missing endpoints, not ordering`);
for (const d of drained.unresolved.slice(0, 20)) {
  const p = d.payload;
  console.log(`    ${d.kind}: ${p.id}${d.kind === 'wire' ? `  (${p.from_hook_id} -> ${p.to_hook_id})` : ''}`);
}
if (drained.unresolved.length > 20) {
  console.log(`    ...and ${drained.unresolved.length - 20} more`);
}
// §1.1 — the retried declarations really succeeded, so they are no longer
// failures. What the drain could NOT resolve stays counted, and the exit code
// still reflects it.
failures = Math.max(0, failures - drained.resolved);

console.log(`\nWritten to: loom/data/registry.json\n`);
if (failures > 0) process.exit(1);
