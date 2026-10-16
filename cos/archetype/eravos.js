'use strict';
/**
 * cos/archetype/eravos.js — the COS archetypes eravos-canvas, eravos-tool and eravos-sound-tool, from James's ERAVOS.
 * UUID: nexus-cos-archetype-eravos-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-16-canvas-compartments-phasemap.spec (CN1_canvas_archetype, CN2_tool_archetypes)
 *
 * James, 2026-10-16 (with Eravos-merged.zip): "here, use this. what about using cos for the canvas, then each tool a
 * nested compartment? … creating templates for cos and ideariun spec workshop"
 *
 * Assembled from three folders every time it is read (as nexus-system is), his files kept as he wrote them:
 *   eravos-canvas/       his domain-free canvas/ verbatim, schemas/, templates/, the dependency-free build/ scripts
 *                        (new-tool, index-tools, validate), serve.js, index.html, an empty tools/index.js, a README
 *   eravos-tool/         his templates/tool        (one tool: manifest, engine, window, spec, test, preview, factory pack)
 *   eravos-sound-tool/   his templates/tool-sound
 * His templates mark what to fill as __TOOL__, __LABEL__, __ID__ … (build/new-tool.mjs). Read here, those become COS's
 * {{slug}}, {{name}}, {{toolId}} … so lib/file-tree-plan.js fills them, in paths and contents. The canvas's own copy of
 * templates/ keeps his markers: its build/new-tool.mjs reads them.
 */
const fs = require('fs');
const path = require('path');

const MARKS = [['__CATEGORY_LABEL__', '{{categoryLabel}}'], ['__DOMAIN_LABEL__', '{{domainLabel}}'], ['__MODE_LABEL__', '{{modeLabel}}'],
  ['__PACK_LABEL__', '{{packLabel}}'], ['__PACK_ID__', '{{packId}}'], ['__CATEGORY__', '{{category}}'], ['__DOMAIN__', '{{domain}}'],
  ['__AUTHOR__', '{{author}}'], ['__LABEL__', '{{name}}'], ['__MODE__', '{{mode}}'], ['__TOOL__', '{{slug}}'], ['__ID__', '{{toolId}}']];
function toCos(s) { let t = String(s); for (const [a, b] of MARKS) t = t.split(a).join(b); return t; }

function _walk(dir, base = dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(..._walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

/** files(folder, { marks }) -> [{ path, content, binary }] — a folder under cos/archetype/, his markers turned to COS's */
function files(folder, { marks = true } = {}) {
  const dir = path.join(__dirname, folder);
  return _walk(dir).map((p) => {
    const content = fs.readFileSync(path.join(dir, p), 'utf8');
    return marks ? { path: toCos(p), content: toCos(content), binary: false } : { path: p, content, binary: false };
  });
}

/** the tool's acceptance lines, from its spec (the 'acceptance' block) — what a tool compartment's intent checks */
function acceptance(specText) {
  const lines = String(specText || '').split('\n');
  const i = lines.findIndex(l => /^acceptance\b/.test(l));
  if (i < 0) return [];
  const out = [];
  for (const l of lines.slice(i + 1)) { const m = /^\s+-\s+(.+)$/.exec(l); if (m) out.push(m[1].trim()); else if (/^\S/.test(l)) break; }
  return out;
}

// A canvas page runs in a browser: a static-file host with no watchdog of its own; the compartment is the unit Nexus
// builds, versions and tests (the coder's reading of "each tool a nested compartment", to confirm).
const BASE = {
  version: '1.0.0', runtimeId: 'html', runtimeOptions: ['html', 'node'],
  resources: { cpuLimitPercent: 0, cpuPriority: 'normal', ramLimitMB: 0, ramReservedMB: 0, governorPolicy: 'fair', ioThrottle: 'none' },
  watchdogPreset: { enabled: false, memoryLimitMB: 0, cpuLimitPct: 0, stallTimeoutMs: 0, crashLoopLimit: 0, crashLoopWindowMs: 0,
    fsPolicy: 'log', netPolicy: 'log', onAnomaly: 'log-only', httpHealthCheck: null, customRules: [], alertWebhook: null },
  networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
  builtIn: true, pluginId: null,
};

function canvas() {
  return { ...BASE, id: '5f1c9a3e-6d2b-4c7e-9a41-2e8d7b6c1f04', name: 'eravos-canvas', displayName: 'ERAVOS canvas',
    description: 'James Brooks\'s ERAVOS canvas: a domain-free canvas of living tools (kernel, runtime, window manager, wires); every tool is its own nested compartment, linked into tools/',
    icon: '◎', runtimeOptions: ['html', 'node'],
    pipeSignature: { exposes: ['canvas:tool-added', 'canvas:wire'], consumes: ['tool:ready'] },
    fsTemplate: files('eravos-canvas', { marks: false }),   // his templates/ keep their __MARKS__: the canvas's build/new-tool.mjs reads them
    detectionHints: ['canvas/kernel/kernel.js', 'canvas/scripts.js', 'schemas/tool.schema.json'],
    tags: ['eravos', 'canvas', 'browser', 'tools'] };
}

/** toolVars(v) — what a tool's markers default to, by James's build/new-tool.mjs rules: the id is eravos.<tool> in music,
 *  eravos.<domain>.<tool> elsewhere; the category label is the category with its first letter up; the author is "me". */
function toolVars(v = {}) {
  const domain = v.domain || 'custom', category = v.category || 'custom', slug = v.slug || 'tool';
  return { domain, category, categoryLabel: category.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()),
    domainLabel: domain.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), author: 'me',
    toolId: domain === 'music' ? `eravos.${slug}` : `eravos.${domain}.${slug}`, packId: `${slug}.factory`, packLabel: `${v.name || slug} factory` };
}

function tool(folder, { id, name, displayName, description, tags }) {
  return { ...BASE, id, name, displayName, description, icon: '◆', varDefaults: toolVars,
    pipeSignature: { exposes: ['{{slug}}:value'], consumes: ['{{slug}}:input'] },
    fsTemplate: files(folder), detectionHints: ['tool.json'], tags };
}

/** DOMAINS — his ERAVOS domains that ship a shared core (cos/archetype/eravos-domains/<domain>/): a canvas that gets a tool
 *  in one of these domains gets his real domain (core engine, domain.js, data, content), not an empty generated one. */
const DOMAINS = Object.freeze({
  music: { label: 'Music', why: 'the audio engine, music SDK (audio_out, …), transport, theory, data and bundles every music tool runs on' },
  dataflow: { label: 'Data', why: 'the shared language other domains meet in: typed values sent along the wires (no tools of its own)' },
});
function domainFiles(domain) { return DOMAINS[domain] ? files(`eravos-domains/${domain}`, { marks: false }) : null; }
function domain(name, uuid) {
  return { ...BASE, id: uuid, name: `eravos-domain-${name}`, displayName: `ERAVOS ${DOMAINS[name].label} domain`,
    description: `His ERAVOS ${name} domain: ${DOMAINS[name].why}. Lays out at tools/${name}/ of a canvas.`, icon: '◈',
    pipeSignature: { exposes: [], consumes: [] }, fsTemplate: domainFiles(name), detectionHints: ['domain.js'], tags: ['eravos', 'domain', name] };
}

function archetypes() {
  return [
    canvas(),
    domain('music', '6e4b2a9c-3f1d-4b8e-a7c5-1d9f3b5e7a21'),
    domain('dataflow', '9a3c5e7b-2d4f-4c6a-8b1e-5f7d9b3c1a46'),
    tool('eravos-tool', { id: '8b2e4d6f-1a3c-4e5b-9d7f-0c2a4e6b8d13', name: 'eravos-tool', displayName: 'ERAVOS tool',
      description: 'One ERAVOS tool (James Brooks\'s template eravos.tool/1): manifest, headless engine with declared ports, window, spec, test, preview and a factory pack', tags: ['eravos', 'tool'] }),
    tool('eravos-sound-tool', { id: '3d7a1c5e-9b2f-4a6d-8e0c-7f1b3a5d9e27', name: 'eravos-sound-tool', displayName: 'ERAVOS sound tool',
      description: 'One ERAVOS sound tool (his tool-sound template): the tool shape with an audio engine and a sound preset pack', tags: ['eravos', 'tool', 'sound'] }),
  ];
}

module.exports = { archetypes, files, toCos, toolVars, acceptance, domainFiles, DOMAINS, MARKS };
