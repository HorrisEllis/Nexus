#!/usr/bin/env node
'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../lib/test-sandbox.js').ensure();
/**
 * tests/nexus-full-audit.js — NEXUS Complete System Audit
 * Runs without a live server: static analysis, syntax, structure checks.
 * Then live API tests if services are up.
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, warn = 0;
const results = [];

function t(label, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) {
      pass++;
      results.push({ status:'PASS', label });
      process.stdout.write(`  ✓  ${label}\n`);
    } else if (r === 'WARN') {
      warn++;
      results.push({ status:'WARN', label });
      process.stdout.write(`  ⚠  ${label}\n`);
    } else {
      fail++;
      results.push({ status:'FAIL', label, detail: String(r) });
      process.stdout.write(`  ✗  ${label}\n     → ${r}\n`);
    }
  } catch(e) {
    fail++;
    results.push({ status:'ERROR', label, detail: e.message });
    process.stdout.write(`  ✗  ${label}\n     → ${e.message}\n`);
  }
}

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// v0.39.228: ui/home/index.html links its JS/CSS per area — read the assembled page.
const { homePageSource } = require('./helpers/home-page-source');
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function syntaxOk(rel) {
  const { execSync } = require('child_process');
  try { execSync(`node --check "${path.join(ROOT, rel)}"`, { stdio:'pipe' }); return true; }
  catch(e) { return `syntax error: ${e.stderr?.toString().slice(0,100)}`; }
}

// ── SECTION 1: Critical file existence ────────────────────────────────────────
console.log('\n══ §1 CRITICAL FILES ══\n');

const criticalFiles = [
  'orchestrator/orchestrator.js', 'nexus/nexus-connect.js', 'nexus/autopilot.js',
  'guardian/server.js', 'guardian/agents/co-pilot/index.js',
  'cortex/cortex.js', 'cortex/self-heal/index.js', 'cortex/self-heal/escalation.js',
  'intelligence/index.js',
  'emerge/compiler/pipeline.js', 'emerge/compiler/emit.js',
  'emerge/compiler/reply-engine.js', 'emerge/compiler/t2-gate.js',
  'bridge/causal/expectation.js', 'bridge/causal/graph.js',
  'lib/component-registry.js', 'lib/grammar-engine.js',
  'lib/blueprint.js', 'lib/autonomous-loop.js',
  'lib/hot-loader.js', 'lib/mcp-server.js', 'lib/mcp-stdio.js',
  'lib/user-model.js', 'lib/descriptor-projector.js', 'lib/cli-map.js',
  'intelligence/causal/anomaly.js',
  'lib/cfr/sigma.js', 'lib/cfr/ledger.js', 'lib/cfr/graph.js',
  'idearium/index.js', 'architect/service.js',
  'ui/home/index.html', 'ui/emerge-ide.html',
  'ui/eravos/index.html', 'ui/eravos/catalog/catalog.js',
  'ui/eravos/catalog/catalog-ui.js', 'ui/eravos/catalog/catalog.css',
  'ui/eravos/pack/pack-loader.js', 'ui/eravos/bridge/nexus-bridge.js',
  'ui/eravos/runtime/organism-factory.js', 'ui/eravos/kernel/kernel.js',
  '.mcp.json', 'docs/mcp.spec', 'docs/mcp-claude-desktop-config.json',
];

criticalFiles.forEach(f => t(`exists: ${f}`, () => exists(f) || `MISSING: ${f}`));

// ── SECTION 2: Syntax check all .js files ────────────────────────────────────
console.log('\n══ §2 SYNTAX ══\n');

const jsFiles = [
  'orchestrator/orchestrator.js', 'nexus/nexus-connect.js',
  'guardian/server.js', 'guardian/agents/co-pilot/index.js',
  'cortex/self-heal/index.js', 'cortex/self-heal/escalation.js',
  'intelligence/index.js',
  'emerge/compiler/t2-gate.js', 'emerge/compiler/pipeline.js',
  'bridge/causal/expectation.js',
  'lib/component-registry.js', 'lib/grammar-engine.js',
  'lib/blueprint.js', 'lib/autonomous-loop.js', 'lib/hot-loader.js',
  'lib/mcp-server.js', 'lib/mcp-stdio.js', 'lib/user-model.js',
  'lib/descriptor-projector.js', 'lib/cli-map.js',
  'intelligence/causal/anomaly.js', 'lib/cfr/sigma.js',
  'idearium/index.js', 'architect/service.js',
  'ui/eravos/catalog/catalog.js', 'ui/eravos/catalog/catalog-ui.js',
  'ui/eravos/pack/pack-loader.js', 'ui/eravos/bridge/nexus-bridge.js',
  'ui/eravos/runtime/organism-factory.js', 'ui/eravos/kernel/kernel.js',
];

jsFiles.forEach(f => t(`syntax: ${f}`, () => exists(f) ? syntaxOk(f) : 'MISSING'));

// ── SECTION 3: Key integrations ───────────────────────────────────────────────
console.log('\n══ §3 INTEGRATION WIRING ══\n');

t('guardian boots mcp-server', () => {
  const s = read('guardian/server.js');
  return s.includes("require('../orchestrator/lib/mcp-server')") && s.includes('mcp.start()');
});
t('guardian has /build route (T2 gate)', () => read('guardian/server.js').includes("url.pathname === '/build'"));
t('guardian has /hot-load route (Phase 14/28)', () => read('guardian/server.js').includes("'/hot-load'"));
t('guardian has /blueprint/compile (Phase 42)', () => read('guardian/server.js').includes("'/blueprint/compile'"));
t('guardian has /autonomous/run (Phase 13)', () => read('guardian/server.js').includes("'/autonomous/run'"));
t('guardian has organism-queue routes (ERAVOS bridge)', () => read('guardian/server.js').includes('organism-queue'));
t('copilot has build intent', () => read('guardian/agents/co-pilot/index.js').includes("intent:'build'"));
t('copilot has token-first _tryDataAnswer', () => read('guardian/agents/co-pilot/index.js').includes('_tryDataAnswer'));
t('copilot grammar engine wired', () => read('guardian/agents/co-pilot/index.js').includes('_ensureGrammar'));
t('t2-gate imports pipeline', () => read('emerge/compiler/t2-gate.js').includes("require('./pipeline')"));
t('t2-gate posts to guardian /command', () => read('emerge/compiler/t2-gate.js').includes("'/command'"));
t('expectation engine wires anomaly engine', () => read('bridge/causal/expectation.js').includes("require('../../intelligence/causal/anomaly')"));
t('escalation has wireAnomalyTrigger (Phase 71.4)', () => read('cortex/self-heal/escalation.js').includes('wireAnomalyTrigger'));
t('component-registry seeds DESCRIPTOR_FIELDS (Phase 40)', () => read('lib/component-registry.js').includes('DESCRIPTOR_FIELDS'));
t('component-registry auto-projects on register (Phase 40 T1.5)', () => read('lib/component-registry.js').includes('descriptor-projector'));
t('blueprint wires cli-map generation (Phase 40.5)', () => read('lib/blueprint.js').includes("require('./cli-map')"));
t('user-model v2 has confidence decay (Phase 12)', () => read('lib/user-model.js').includes('DECAY_PER_DAY'));
t('grammar-engine has watchComponents (Phase 15)', () => read('lib/grammar-engine.js').includes('watchComponents'));
t('mcp-server has nexus_build tool', () => read('lib/mcp-server.js').includes("'nexus_build'"));
t('mcp-server has nexus_blueprint tool', () => read('lib/mcp-server.js').includes("'nexus_blueprint'"));
t('mcp-server has nexus_autonomous_run tool', () => read('lib/mcp-server.js').includes("'nexus_autonomous_run'"));
t('mcp-server has nexus_hot_load tool', () => read('lib/mcp-server.js').includes("'nexus_hot_load'"));
t('mcp-stdio imports mcp-server tools', () => read('lib/mcp-stdio.js').includes("require('../orchestrator/lib/mcp-server')"));
t('self-heal excludes semantic gaps (Phase 24.3 fix)', () => read('cortex/self-heal/index.js').includes('SEMANTIC_GAP_TYPES'));

// ── SECTION 4: ERAVOS system ──────────────────────────────────────────────────
console.log('\n══ §4 ERAVOS SYSTEM ══\n');

t('eravos index loads catalog.js', () => read('ui/eravos/index.html').includes('catalog/catalog.js'));
t('eravos index loads catalog-ui.js', () => read('ui/eravos/index.html').includes('catalog-ui.js'));
t('eravos index loads pack-loader.js', () => read('ui/eravos/index.html').includes('pack/pack-loader.js'));
t('eravos index loads nexus-bridge.js', () => read('ui/eravos/index.html').includes('bridge/nexus-bridge.js'));
t('eravos index has no inline catalog block', () => {
  const h = read('ui/eravos/index.html');
  // Should not have the old inline block
  return !h.includes('const catalogOverlay') && !h.includes('function _openCatalog');
});
t('eravos CatalogUI.init called', () => read('ui/eravos/index.html').includes('CatalogUI.init'));
t('eravos NexusBridge.start called', () => read('ui/eravos/index.html').includes('NexusBridge.start'));
t('eravos zip routed through PackLoader', () => read('ui/eravos/index.html').includes('PackLoader.install'));
t('catalog.js has register/list/search', () => {
  const s = read('ui/eravos/catalog/catalog.js');
  return s.includes('function register') && s.includes('function list') && s.includes('function search');
});
t('catalog-ui.js has open/close/toggle', () => {
  const s = read('ui/eravos/catalog/catalog-ui.js');
  return s.includes('function open') && s.includes('function close') && s.includes('function toggle');
});
t('pack-loader.js validates manifest', () => read('ui/eravos/pack/pack-loader.js').includes("required = ['manifest_version'"));
t('nexus-bridge.js polls organism-queue', () => read('ui/eravos/bridge/nexus-bridge.js').includes('organism-queue'));
t('organism-factory has register() (Phase 40 dynamic)', () => read('ui/eravos/runtime/organism-factory.js').includes('function register'));

// ── SECTION 5: Home UI ────────────────────────────────────────────────────────
console.log('\n══ §5 HOME UI ══\n');

t('home has ch-causal channel', () => homePageSource().includes('ch-causal'));
t('home has ch-conversations channel', () => homePageSource().includes('ch-conversations'));
t('home has ch-canvas channel', () => homePageSource().includes('ch-canvas'));
t('home has ch-emerge channel', () => homePageSource().includes('ch-emerge'));
t('home accent animation exists', () => homePageSource().includes('accent-cycle'));
t('home --ok not circular (green dot fix)', () => {
  const h = homePageSource();
  return h.includes('--ok:#00ff88') && !h.includes('--ok:var(--ok)');
});
t('home --err not circular', () => {
  const h = homePageSource();
  return h.includes('--err:#ff3355') && !h.includes('--err:var(--err)');
});
t('home NEXUS_UI_STATE exposed', () => homePageSource().includes('NEXUS_UI_STATE'));
t('home co-pilot sends uiState', () => homePageSource().includes('uiState:'));
t('emerge-ide has hot-load button', () => read('ui/emerge-ide.html').includes('doHotLoad'));
t('emerge-ide has spec-load button', () => read('ui/emerge-ide.html').includes('specFirst'));

// ── SECTION 6: MCP config ────────────────────────────────────────────────────
console.log('\n══ §6 MCP CONFIG ══\n');

t('.mcp.json is valid JSON', () => {
  try { JSON.parse(read('.mcp.json')); return true; }
  catch(e) { return `invalid JSON: ${e.message}`; }
});
t('.mcp.json has nexus server entry', () => {
  const j = JSON.parse(read('.mcp.json'));
  return !!j.mcpServers?.nexus;
});
t('mcp-claude-desktop-config.json valid', () => {
  try { JSON.parse(read('docs/mcp-claude-desktop-config.json')); return true; }
  catch(e) { return `invalid JSON: ${e.message}`; }
});

// ── SECTION 7: Phase 42 Blueprint ────────────────────────────────────────────
console.log('\n══ §7 BLUEPRINT ══\n');

t('blueprint.js has compile()', () => read('lib/blueprint.js').includes('async function compile'));
t('blueprint.js writes to disk before emit', () => read('lib/blueprint.js').includes("'utf8')") && read('lib/blueprint.js').includes('blueprint.loaded'));
t('blueprint.js sigma calculation', () => read('lib/blueprint.js').includes('sigma +='));

// ── SECTION 8: Phase 13 Autonomous Loop ──────────────────────────────────────
console.log('\n══ §8 AUTONOMOUS LOOP ══\n');

t('autonomous-loop requires 4 fields', () => read('lib/autonomous-loop.js').includes("['goal','budget','boundary','exit']"));
t('autonomous-loop sigma rewind at 0.70', () => read('lib/autonomous-loop.js').includes('0.70'));
t('autonomous-loop case library query', () => read('lib/autonomous-loop.js').includes('_queryCaseLibrary'));
t('autonomous-loop RAID gate', () => read('lib/autonomous-loop.js').includes('_approveTool'));
t('autonomous-loop boundary check', () => read('lib/autonomous-loop.js').includes('_boundaryViolation'));

// ── SECTION 9: Phase 71 Causal chain ─────────────────────────────────────────
console.log('\n══ §9 CAUSAL CHAIN (71.1-71.4) ══\n');

t('71.1 state reducer pure function', () => read('bridge/causal/expectation.js').includes('function reduce(state'));
t('71.2 ExpectationEngine has define/observe', () => {
  const s = read('bridge/causal/expectation.js');
  return s.includes('define(sessionId') && s.includes('observe(sessionId');
});
t('71.3 anomaly engine classify()', () => read('intelligence/causal/anomaly.js').includes('function classify'));
t('71.3 anomaly types cover all 6', () => {
  const s = read('intelligence/causal/anomaly.js');
  return ['missing_event','unexpected_event','timeout','state_violation','causal_gap','path_mismatch'].every(t => s.includes(t));
});
t('71.4 wireAnomalyTrigger closes the loop', () => {
  const s = read('cortex/self-heal/escalation.js');
  return s.includes('wireAnomalyTrigger') && s.includes("bus.on('anomaly.detected'");
});

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  STATIC AUDIT: ${pass} pass · ${fail} fail · ${warn} warn`);
console.log(`${'═'.repeat(50)}\n`);

fs.writeFileSync(
  path.join(__dirname, 'audit-results.json'),
  JSON.stringify({ ts: new Date().toISOString(), pass, fail, warn, results }, null, 2)
);

process.exit(fail > 0 ? 1 : 0);
