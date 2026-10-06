'use strict';
/**
 * cos/archetype/nexus-system.js — the COS archetype "nexus-system": a new system in Guardian's shape.
 * UUID: nexus-cos-archetype-nexus-system-v1-0000-2026-1006-jamesbrooks-001
 *
 * §0.39.359 SB30 — James: "Like I want this to be a skeleton, only using the minimal code. Then expands from there.
 * Using the .spec as a living model." · "then we can have it a cos template with reusable components."
 *
 * Assembled, never copied, from three real sources every time it is read:
 *   1. cos/archetype/nexus-system/   the skeleton's own files (server, CLI, boot, registry, contract, seed nodes, spec)
 *   2. cos/archetype/components/     the reusable parts skeleton.json names, with what they require
 *   3. idearium/spec-engine/templates/system/schemas/   the system template's node schemas, written as JSON (which is
 *      also YAML) so the system reads them with no dependency; the system owns its copies from then on
 * Placeholders: {{name}} {{slug}} {{SLUG}} {{uuid8}} {{description}} — filled by whoever lays the files out
 * (lib/file-tree-plan.js fromCosTemplate), in paths as well as contents.
 */
const fs = require('fs');
const path = require('path');
const components = require('./components/index.js');

const DIR = path.join(__dirname, 'nexus-system');
const SCHEMA_DIR = path.join(__dirname, '..', '..', 'idearium', 'spec-engine', 'templates', 'system', 'schemas');

function _walk(dir, base = dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(..._walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

function skeleton() { return JSON.parse(fs.readFileSync(path.join(DIR, 'skeleton.json'), 'utf8')); }

function schemaFiles() {
  let yaml;
  try { yaml = require('js-yaml'); } catch (_) { return []; }
  let names = [];
  try { names = fs.readdirSync(SCHEMA_DIR).filter(f => f.startsWith('schema.')).sort(); } catch (_) { return []; }
  return names.map((f) => {
    const doc = yaml.load(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'));
    const own = { ...doc, system: '{{slug}}', context: `copied from the nexus-system template; {{slug}} owns it from here` };
    return { path: `schemas/${f}`, content: JSON.stringify(own, null, 2) + '\n', from: 'template-schemas' };
  });
}

/** files() -> [{ path, content, binary, from }] — the whole skeleton, components included. */
function files() {
  const sk = skeleton();
  const own = _walk(DIR).filter(p => p !== 'skeleton.json').map(p => ({ path: p, content: fs.readFileSync(path.join(DIR, p), 'utf8'), from: 'skeleton' }));
  const parts = components.files(sk.components).map(f => ({ path: f.path, content: f.content, from: `component:${f.component}` }));
  const seen = new Set(), out = [];
  for (const f of [...own, ...parts, ...schemaFiles()]) {
    if (seen.has(f.path)) throw new Error(`nexus-system: ${f.path} comes from two places`);
    seen.add(f.path);
    out.push({ ...f, binary: false });
  }
  return out;
}

function archetype() {
  const sk = skeleton();
  return {
    id: '8adc98c2-a619-4aa6-913a-4ddad88d8340',
    name: 'nexus-system',
    version: '1.0.0',
    displayName: 'Nexus System',
    description: sk.description,
    icon: '◆',
    runtimeId: 'node',
    runtimeOptions: ['node'],
    resources: { cpuLimitPercent: 80, cpuPriority: 'normal', ramLimitMB: 512, ramReservedMB: 64, governorPolicy: 'fair', ioThrottle: 'none' },
    watchdogPreset: {
      enabled: true, memoryLimitMB: 512, cpuLimitPct: 80, stallTimeoutMs: 60000, crashLoopLimit: 3, crashLoopWindowMs: 60000,
      fsPolicy: 'log', netPolicy: 'log', onAnomaly: 'snapshot+restart',
      httpHealthCheck: { path: '/health', expectedStatus: 200, intervalMs: 30000, timeoutMs: 5000, failThreshold: 3 },
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 3, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: { exposes: ['heartbeat', 'node.changed', 'command.ran'], consumes: [] },
    fsTemplate: files().map(({ path: p, content, binary }) => ({ path: p, content, binary })),
    detectionHints: ['registry-components.js', 'interaction-contract.json', 'event-taxonomy.js'],
    tags: ['nexus', 'system', 'skeleton', 'genesis'],
    builtIn: true, pluginId: null,
  };
}

module.exports = { archetype, files, skeleton, DIR, SCHEMA_DIR };
