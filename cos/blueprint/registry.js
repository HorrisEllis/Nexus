/**
 * blueprint/registry.js
 * COMPARTMENT OS — Built-in Blueprint Registry (spec §61.3)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * All 11 built-in blueprints, transcribed from spec §61.3.
 *
 * NOTE on `id`: same situation as archetype/registry.js — spec §61.1's
 * JSON Schema requires `id: { format: "uuid" }` but §61.3's listing used
 * mnemonic strings like 'bp-fullstack-app-0001'. Real UUID v4s minted
 * once, hardcoded below, spec mnemonic kept as a comment.
 *
 * NOTE on node.archetypeId: resolved through archetype/registry.js by
 * NAME (ARCH('web-server')) rather than hardcoding a second copy of each
 * archetype's UUID here — one source of truth. validateBlueprint() is
 * also given the archetype map so a typo'd role reference fails loud at
 * require() time, not silently at launch time.
 */

'use strict';

const { validateBlueprint } = require('./schema.js');
const { getBuiltInArchetype, ARCHETYPE_MAP } = require('../archetype/registry.js');

function ARCH(name) {
  const a = getBuiltInArchetype(name);
  if (!a) throw new Error(`Blueprint registry: unknown archetype "${name}" — check archetype/registry.js`);
  return a.id;
}

const BLUEPRINTS_RAW = [

  // bp-fullstack-app-0001
  {
    id: '744e8636-2a00-4894-8186-c8f1e966c1d3',
    name: 'fullstack-app',
    version: '1.0.0',
    displayName: 'Fullstack App',
    description: 'Frontend + API + Database — pre-wired, ready to run',
    icon: '🧱',
    nodes: [
      {
        role: 'frontend', archetypeId: ARCH('web-server'), nameTemplate: '{{blueprintName}}-frontend',
        overrides: { purpose: 'Serves the user-facing UI' },
        resources: { ramLimitMB: 512, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'api', archetypeId: ARCH('api-server'), nameTemplate: '{{blueprintName}}-api',
        overrides: { purpose: 'REST API — internal facing' },
        resources: { ramLimitMB: 512, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'db', archetypeId: ARCH('database'), nameTemplate: '{{blueprintName}}-db',
        overrides: { purpose: 'Persistent data store' },
        resources: { ramLimitMB: 1024, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'frontend', to: 'api', hookId: 'hk-a-http-proxy', name: 'frontend→api', filter: null },
      { from: 'api',      to: 'db',  hookId: 'hk-a-db-query',   name: 'api→db',       filter: null },
    ],
    sharedNetwork: true,
    startOrder: ['db', 'api', 'frontend'],
    builtIn: true, pluginId: null,
    tags: ['fullstack', 'web', 'database'],
  },

  // bp-microservice-trio-0002
  {
    id: '6d9f448e-7b5d-48de-8b67-ce7656b36cd4',
    name: 'microservice-trio',
    version: '1.0.0',
    displayName: 'Microservice Trio',
    description: 'API gateway + two backend services — independently deployable',
    icon: '🔀',
    nodes: [
      {
        role: 'gateway', archetypeId: ARCH('reverse-proxy'), nameTemplate: '{{blueprintName}}-gateway',
        overrides: { purpose: 'Public-facing API gateway' },
        resources: { ramLimitMB: 128, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'service-a', archetypeId: ARCH('api-server'), nameTemplate: '{{blueprintName}}-service-a',
        overrides: { purpose: 'Microservice A' },
        resources: { ramLimitMB: 256, cpuPriority: 'normal' },
        scalable: true, minInstances: 1, maxInstances: 5,
      },
      {
        role: 'service-b', archetypeId: ARCH('api-server'), nameTemplate: '{{blueprintName}}-service-b',
        overrides: { purpose: 'Microservice B' },
        resources: { ramLimitMB: 256, cpuPriority: 'normal' },
        scalable: true, minInstances: 1, maxInstances: 5,
      },
    ],
    pipes: [
      { from: 'gateway', to: 'service-a', hookId: 'hk-a-http-proxy', name: 'gateway→service-a', filter: 'payload.path.startsWith("/a")' },
      { from: 'gateway', to: 'service-b', hookId: 'hk-a-http-proxy', name: 'gateway→service-b', filter: 'payload.path.startsWith("/b")' },
    ],
    sharedNetwork: true,
    startOrder: ['service-a', 'service-b', 'gateway'],
    builtIn: true, pluginId: null,
    tags: ['microservices', 'gateway', 'api'],
  },

  // bp-worker-pool-0003
  {
    id: 'a893a4e2-2b94-47af-a11f-5a10d2d5fa6c',
    name: 'worker-pool',
    version: '1.0.0',
    displayName: 'Worker Pool',
    description: 'Dispatcher + N scalable workers — job queue pattern',
    icon: '⚙️',
    nodes: [
      {
        role: 'dispatcher', archetypeId: ARCH('scheduler'), nameTemplate: '{{blueprintName}}-dispatcher',
        overrides: { purpose: 'Dispatches jobs to worker pool' },
        resources: { ramLimitMB: 128, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'worker', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-worker-{{index}}',
        overrides: { purpose: 'Processes jobs from dispatcher' },
        resources: { ramLimitMB: 256, cpuPriority: 'low' },
        scalable: true, minInstances: 1, maxInstances: 20,
      },
    ],
    pipes: [
      { from: 'dispatcher', to: 'worker',     hookId: 'hk-a-job-dispatch', name: 'dispatcher→worker', filter: null },
      { from: 'worker',     to: 'dispatcher', hookId: 'hk-a-job-result',   name: 'worker→dispatcher', filter: null },
    ],
    sharedNetwork: false,
    startOrder: ['worker', 'dispatcher'],
    builtIn: true, pluginId: null,
    tags: ['workers', 'queue', 'background', 'scalable'],
  },

  // bp-ci-pipeline-0004
  {
    id: '035f33f2-51ad-4aba-a6bd-c4c87d7ce4e2',
    name: 'ci-pipeline',
    version: '1.0.0',
    displayName: 'CI Pipeline',
    description: 'Trigger → Build → Test → Deploy — sequential pipeline',
    icon: '🔁',
    nodes: [
      {
        role: 'trigger', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-trigger',
        overrides: { purpose: 'Listens for git webhooks or manual trigger' },
        resources: { ramLimitMB: 64, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'builder', archetypeId: ARCH('compiler'), nameTemplate: '{{blueprintName}}-builder',
        overrides: { purpose: 'Compiles and bundles the project' },
        resources: { ramLimitMB: 1024, cpuPriority: 'high' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'tester', archetypeId: ARCH('test-runner'), nameTemplate: '{{blueprintName}}-tester',
        overrides: { purpose: 'Runs the test suite' },
        resources: { ramLimitMB: 512, cpuPriority: 'high' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'deployer', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-deployer',
        overrides: { purpose: 'Deploys on successful test pass' },
        resources: { ramLimitMB: 128, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'trigger', to: 'builder',  hookId: 'hk-a-job-dispatch',   name: 'trigger→builder', filter: null },
      { from: 'builder', to: 'tester',   hookId: 'hk-a-build-complete', name: 'builder→tester',  filter: "payload.status === 'success'" },
      { from: 'tester',  to: 'deployer', hookId: 'hk-a-test-complete',  name: 'tester→deployer', filter: "payload.status === 'pass'" },
    ],
    sharedNetwork: false,
    startOrder: ['trigger', 'builder', 'tester', 'deployer'],
    builtIn: true, pluginId: null,
    tags: ['ci', 'pipeline', 'build', 'test', 'deploy'],
  },

  // bp-ai-assistant-0005
  {
    id: 'dcfdd9a6-18fc-4022-a161-827cf1d0f738',
    name: 'ai-assistant',
    version: '1.0.0',
    displayName: 'AI Assistant',
    description: 'Chat UI + LLM agent + memory + tool executor — full AI stack',
    icon: '🤖',
    nodes: [
      {
        role: 'frontend', archetypeId: ARCH('web-server'), nameTemplate: '{{blueprintName}}-frontend',
        overrides: { purpose: 'Chat UI served to the user' },
        resources: { ramLimitMB: 256, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'agent', archetypeId: ARCH('ai-agent'), nameTemplate: '{{blueprintName}}-agent',
        overrides: { purpose: 'LLM agent — processes prompts, calls tools' },
        resources: { ramLimitMB: 2048, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'memory', archetypeId: ARCH('database'), nameTemplate: '{{blueprintName}}-memory',
        overrides: { purpose: 'Conversation history and long-term memory' },
        resources: { ramLimitMB: 512, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'tools', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-tools',
        overrides: { purpose: 'Executes tool calls from the agent in isolation' },
        resources: { ramLimitMB: 512, cpuPriority: 'normal' },
        scalable: true, minInstances: 1, maxInstances: 4,
      },
    ],
    pipes: [
      { from: 'frontend', to: 'agent',  hookId: 'hk-a-http-proxy',  name: 'frontend→agent', filter: null },
      { from: 'agent',    to: 'memory', hookId: 'hk-a-db-query',    name: 'agent→memory',   filter: null },
      { from: 'memory',   to: 'agent',  hookId: 'hk-a-db-query',    name: 'memory→agent',   filter: null },
      { from: 'agent',    to: 'tools',  hookId: 'hk-a-job-dispatch', name: 'agent→tools',    filter: null },
      { from: 'tools',    to: 'agent',  hookId: 'hk-a-job-result',   name: 'tools→agent',    filter: null },
    ],
    sharedNetwork: true,
    startOrder: ['memory', 'tools', 'agent', 'frontend'],
    builtIn: true, pluginId: null,
    tags: ['ai', 'llm', 'chat', 'agent', 'tools'],
  },

  // bp-desktop-app-0006
  {
    id: '1148f381-9264-4687-8aad-b9be92b0c97f',
    name: 'desktop-app',
    version: '1.0.0',
    displayName: 'Desktop App',
    description: 'Electron UI + local API + local DB — fully offline desktop app',
    icon: '🖥️',
    nodes: [
      {
        role: 'ui', archetypeId: ARCH('sandbox-browser'), nameTemplate: '{{blueprintName}}-ui',
        overrides: { purpose: 'Electron UI — no internet, loopback to backend only' },
        resources: { ramLimitMB: 1024, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'backend', archetypeId: ARCH('api-server'), nameTemplate: '{{blueprintName}}-backend',
        overrides: { purpose: 'Local API — loopback only' },
        resources: { ramLimitMB: 256, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'storage', archetypeId: ARCH('database'), nameTemplate: '{{blueprintName}}-storage',
        overrides: { purpose: 'Local SQLite/LevelDB storage' },
        resources: { ramLimitMB: 512, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'ui',      to: 'backend', hookId: 'hk-a-http-proxy', name: 'ui→backend',      filter: null },
      { from: 'backend', to: 'storage', hookId: 'hk-a-db-query',   name: 'backend→storage', filter: null },
    ],
    sharedNetwork: true,
    startOrder: ['storage', 'backend', 'ui'],
    builtIn: true, pluginId: null,
    tags: ['desktop', 'electron', 'offline', 'local'],
  },

  // bp-security-audit-0007
  {
    id: '0dbd4ea5-863e-40f8-9bc9-7c80f8763f36',
    name: 'security-audit',
    version: '1.0.0',
    displayName: 'Security Audit',
    description: 'Drop any exe into containment — monitor, analyze, report',
    icon: '🔬',
    nodes: [
      {
        role: 'target', archetypeId: ARCH('containment'), nameTemplate: '{{blueprintName}}-target',
        overrides: { purpose: 'Runs the untrusted executable under full audit' },
        resources: { ramLimitMB: 256, cpuPriority: 'background' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'monitor', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-monitor',
        overrides: { purpose: 'Parses the .nex audit log stream in real time' },
        resources: { ramLimitMB: 256, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'report', archetypeId: ARCH('file-processor'), nameTemplate: '{{blueprintName}}-report',
        overrides: { purpose: 'Generates diff/audit report from monitor output' },
        resources: { ramLimitMB: 256, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'target',  to: 'monitor', hookId: 'hk-a-audit-stream', name: 'target→monitor', filter: null },
      { from: 'monitor', to: 'report',  hookId: 'hk-a-job-result',   name: 'monitor→report', filter: null },
    ],
    sharedNetwork: false,
    startOrder: ['report', 'monitor', 'target'],
    builtIn: true, pluginId: null,
    tags: ['security', 'audit', 'containment', 'malware'],
  },

  // bp-game-server-0008
  {
    id: '119ccb3b-f3fc-4edd-a798-e0fddba23fb1',
    name: 'game-server',
    version: '1.0.0',
    displayName: 'Game Server',
    description: 'Game logic + matchmaking + leaderboard — multiplayer backend',
    icon: '🎮',
    nodes: [
      {
        role: 'game-server', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-game',
        overrides: { purpose: 'Core game logic — high CPU priority' },
        resources: { ramLimitMB: 1024, cpuPriority: 'high' },
        scalable: true, minInstances: 1, maxInstances: 10,
      },
      {
        role: 'matchmaker', archetypeId: ARCH('api-server'), nameTemplate: '{{blueprintName}}-matchmaker',
        overrides: { purpose: 'Lobby and matchmaking API' },
        resources: { ramLimitMB: 256, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'leaderboard', archetypeId: ARCH('database'), nameTemplate: '{{blueprintName}}-leaderboard',
        overrides: { purpose: 'Score and state persistence' },
        resources: { ramLimitMB: 512, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'matchmaker',  to: 'game-server', hookId: 'hk-a-job-dispatch', name: 'matchmaker→game',        filter: null },
      { from: 'game-server', to: 'leaderboard',  hookId: 'hk-a-db-query',     name: 'game→leaderboard',       filter: null },
      { from: 'leaderboard', to: 'matchmaker',   hookId: 'hk-a-db-query',     name: 'leaderboard→matchmaker', filter: null },
    ],
    sharedNetwork: true,
    startOrder: ['leaderboard', 'matchmaker', 'game-server'],
    builtIn: true, pluginId: null,
    tags: ['game', 'multiplayer', 'backend'],
  },

  // bp-scraper-pipeline-0009
  {
    id: 'b6b133e8-4d66-44db-ad69-0a38fa0a08f7',
    name: 'scraper-pipeline',
    version: '1.0.0',
    displayName: 'Scraper Pipeline',
    description: 'Controlled browser + extractor + storage — web scraping with full audit',
    icon: '🕷️',
    nodes: [
      {
        role: 'browser', archetypeId: ARCH('sandbox-browser'), nameTemplate: '{{blueprintName}}-browser',
        overrides: { purpose: 'Visits pages — every URL logged as a kernel event' },
        resources: { ramLimitMB: 1024, cpuPriority: 'normal' },
        scalable: true, minInstances: 1, maxInstances: 4,
      },
      {
        role: 'extractor', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-extractor',
        overrides: { purpose: 'Extracts structured data from page events' },
        resources: { ramLimitMB: 256, cpuPriority: 'low' },
        scalable: true, minInstances: 1, maxInstances: 4,
      },
      {
        role: 'storage', archetypeId: ARCH('database'), nameTemplate: '{{blueprintName}}-storage',
        overrides: { purpose: 'Stores extracted results' },
        resources: { ramLimitMB: 512, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'browser',   to: 'extractor', hookId: 'hk-a-page-loaded', name: 'browser→extractor', filter: null },
      { from: 'extractor', to: 'storage',   hookId: 'hk-a-db-query',     name: 'extractor→storage', filter: null },
    ],
    sharedNetwork: false,
    startOrder: ['storage', 'extractor', 'browser'],
    builtIn: true, pluginId: null,
    tags: ['scraper', 'browser', 'data', 'pipeline'],
  },

  // bp-llm-eval-0010
  {
    id: '8b9e27c6-2648-4281-abc7-05c77f980340',
    name: 'llm-eval',
    version: '1.0.0',
    displayName: 'LLM Eval',
    description: 'Prompt runner + judge + results writer — automated LLM evaluation',
    icon: '📊',
    nodes: [
      {
        role: 'prompt-runner', archetypeId: ARCH('ai-agent'), nameTemplate: '{{blueprintName}}-runner',
        overrides: { purpose: 'Sends prompts to the model under test' },
        resources: { ramLimitMB: 1024, cpuPriority: 'normal' },
        scalable: true, minInstances: 1, maxInstances: 4,
      },
      {
        role: 'judge', archetypeId: ARCH('ai-agent'), nameTemplate: '{{blueprintName}}-judge',
        overrides: { purpose: 'Evaluates prompt-runner outputs against criteria' },
        resources: { ramLimitMB: 1024, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'results', archetypeId: ARCH('file-processor'), nameTemplate: '{{blueprintName}}-results',
        overrides: { purpose: 'Writes eval results to CSV/JSON' },
        resources: { ramLimitMB: 128, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'prompt-runner', to: 'judge',   hookId: 'hk-a-prompt-result', name: 'runner→judge',  filter: null },
      { from: 'judge',         to: 'results', hookId: 'hk-a-job-result',    name: 'judge→results', filter: null },
    ],
    sharedNetwork: false,
    startOrder: ['results', 'judge', 'prompt-runner'],
    builtIn: true, pluginId: null,
    tags: ['eval', 'llm', 'testing', 'ai'],
  },

  // bp-dev-environment-0011
  {
    id: 'a6be3d82-f195-4931-87ef-8b72161b8eb2',
    name: 'dev-environment',
    version: '1.0.0',
    displayName: 'Dev Environment',
    description: 'Editor + live preview + hot builder + terminal — isolated dev box',
    icon: '💻',
    nodes: [
      {
        role: 'editor', archetypeId: ARCH('sandbox-browser'), nameTemplate: '{{blueprintName}}-editor',
        overrides: { purpose: 'Monaco/CodeMirror editor UI' },
        resources: { ramLimitMB: 512, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'runtime', archetypeId: ARCH('web-server'), nameTemplate: '{{blueprintName}}-runtime',
        overrides: { purpose: 'Live preview of the running project' },
        resources: { ramLimitMB: 512, cpuPriority: 'normal' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'builder', archetypeId: ARCH('compiler'), nameTemplate: '{{blueprintName}}-builder',
        overrides: { purpose: 'Watches for file changes and hot-rebuilds' },
        resources: { ramLimitMB: 512, cpuPriority: 'high' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
      {
        role: 'terminal', archetypeId: ARCH('worker'), nameTemplate: '{{blueprintName}}-terminal',
        overrides: { purpose: 'Shell access inside the dev environment', runtimeId: 'shell' },
        resources: { ramLimitMB: 128, cpuPriority: 'low' },
        scalable: false, minInstances: 1, maxInstances: 1,
      },
    ],
    pipes: [
      { from: 'editor',  to: 'builder', hookId: 'hk-a-file-written',   name: 'editor→builder',  filter: null },
      { from: 'builder', to: 'runtime', hookId: 'hk-a-build-complete', name: 'builder→runtime', filter: "payload.status === 'success'" },
    ],
    sharedNetwork: true,
    startOrder: ['terminal', 'builder', 'runtime', 'editor'],
    builtIn: true, pluginId: null,
    tags: ['dev', 'editor', 'environment', 'ide'],
  },
];

// ─── Validate every built-in at load time — COS-1 ─────────────────────────────

for (const bp of BLUEPRINTS_RAW) {
  validateBlueprint(bp, ARCHETYPE_MAP);
}

const BLUEPRINTS    = Object.freeze(BLUEPRINTS_RAW.map(b => Object.freeze(b)));
const BLUEPRINT_MAP = new Map(BLUEPRINTS.map(b => [b.id, b]));
const BLUEPRINT_NAME_MAP = new Map(BLUEPRINTS.map(b => [b.name, b]));
const BLUEPRINT_IDS  = Object.freeze(BLUEPRINTS.map(b => b.id));
const BLUEPRINT_NAMES = Object.freeze(BLUEPRINTS.map(b => b.name));

/**
 * @param {string} idOrName
 * @returns {object|null}
 */
function getBuiltInBlueprint(idOrName) {
  return BLUEPRINT_MAP.get(idOrName) || BLUEPRINT_NAME_MAP.get(idOrName) || null;
}

module.exports = {
  BLUEPRINTS,
  BLUEPRINT_MAP,
  BLUEPRINT_NAME_MAP,
  BLUEPRINT_IDS,
  BLUEPRINT_NAMES,
  getBuiltInBlueprint,
};
