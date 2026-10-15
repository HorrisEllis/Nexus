'use strict';
/**
 * lib/capability-spec.js — CS1: a spec per capability, whose surface is the gate. component_id: nexus.lib.capability-spec
 * Map: docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec (CS1)
 *
 * James (2026-10-15): "should we have each module or capability specced. … like specs can reduce surface area, then the
 * phases also. like i want the specs to be like new features or capabilities to the project."
 *
 * Spec drift compared version numbers only — a spec could say 1.2.0 while its module grew ten exports nobody promised.
 * A capability spec says what the module is for and its SURFACE — what others can touch — and the surface is checked
 * against the code, not taken on trust:
 *
 *   spec:
 *     meta: { name: pipeline-routing, version: 1.2.0, kind: capability, files: [lib/pipeline-routing.js] }
 *     purpose: "…"
 *     surface:
 *       exports: [DEFAULTS, policyFrom]
 *       events:  []                        # names this module emits on a bus
 *       routes:  []                        # "/api/…" paths it serves
 *     invariants: [ … ]
 *
 *   parse(text)            → { name, version, kind, files, surface: { exports, events, routes } | null }
 *   measure(files, {root}) → the real surface: exports (lib/phase-plan exportsOf), events (emit('x.y') literals), routes
 *                            (pathname === '/api/…' literals and Idearium's ['GET', ['api', …]] rows)
 *   check(spec, {root})    → { ok, grew: {exports, events, routes}, unkept: {…}, measured } — grew: in the code, not the
 *                            spec (the surface widened, unpromised); unkept: promised, not in the code. A list holding '*'
 *                            is not constrained (said: unconstrained).
 *   find({ root })         → every capability spec: <system>/spec/*.spec whose meta kind is capability
 *   draft(name, files)     → a spec text whose surface IS the measured one (CS2 drafts from this; nothing invented)
 * Read-only; deterministic; no model.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.capability-spec';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const KINDS = ['exports', 'events', 'routes'];

const _list = (v) => {
  const s = String(v || '').trim();
  if (!s) return [];
  const inner = s.replace(/^\[/, '').replace(/\]\s*(#.*)?$/, '');
  return inner.split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};

/** parse(text) — the spec's meta and surface; tolerant of inline [a, b] and block "- a" lists */
function parse(text) {
  const lines = String(text || '').split('\n');
  const meta = {}; let surface = null;
  let section = null, sectionIndent = -1, key = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^ */)[0].length;
    const t = line.trim();
    if (/^(meta|surface):\s*$/.test(t)) { section = t.replace(':', ''); sectionIndent = indent; key = null; if (section === 'surface') surface = { exports: null, events: null, routes: null }; continue; }
    if (section && indent <= sectionIndent) { section = null; key = null; }
    const kv = t.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (section === 'meta' && kv) { meta[kv[1]] = kv[2].replace(/^['"]|['"]$/g, ''); key = kv[1]; if (kv[2] === '') meta[kv[1]] = []; continue; }
    if (section === 'meta' && /^-\s+/.test(t) && key && Array.isArray(meta[key])) { meta[key].push(t.replace(/^-\s+/, '').replace(/^['"]|['"]$/g, '')); continue; }
    if (section === 'surface' && kv && KINDS.includes(kv[1])) { key = kv[1]; surface[key] = kv[2] ? _list(kv[2]) : []; continue; }
    if (section === 'surface' && /^-\s+/.test(t) && key && Array.isArray(surface[key])) { surface[key].push(t.replace(/^-\s+/, '').replace(/^['"]|['"]$/g, '')); continue; }
  }
  const files = Array.isArray(meta.files) ? meta.files : _list(meta.files);
  return { name: meta.name || null, version: meta.version || null, kind: meta.kind || null, files, surface };
}

/**
 * stripComments(src) — the code with its comments blanked (newlines kept), strings, template literals and regex literals
 * left whole. A character scanner, not a regex: a '/*' inside a string ('lib/**' + '/*.js') must not open a comment —
 * the regex version swallowed 289 of Idearium's 307 routes.
 */
function stripComments(src) {
  const s = String(src || ''); let out = ''; let i = 0; const n = s.length;
  let lastSig = '';   // the last significant character outside a comment — decides whether '/' starts a regex
  const regexAfter = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n && s[i] !== q) { if (s[i] === '\\') { out += s[i] + (s[i + 1] || ''); i += 2; continue; } if (q !== '`' && s[i] === '\n') break; out += s[i]; i++; }
      if (i < n) { out += s[i]; i++; } lastSig = q; continue;
    }
    if (c === '/' && regexAfter.has(lastSig)) {
      out += c; i++; let cls = false;
      while (i < n && s[i] !== '\n') { const e = s[i]; out += e; i++; if (e === '\\') { out += s[i] || ''; i++; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; }
      lastSig = '/'; continue;
    }
    out += c; if (!/\s/.test(c)) lastSig = /[A-Za-z0-9_$)\]]/.test(c) ? 'w' : c; i++;
  }
  return out;
}

/** measure(files) — what the code exposes, read from the files themselves */
function measure(files, { root = ROOT } = {}) {
  const PP = require('./phase-plan.js');
  const out = { exports: new Set(), events: new Set(), routes: new Set(), missingFiles: [] };
  for (const f of files || []) {
    let src;
    try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { out.missingFiles.push(f); continue; }
    // comments are not surface: a doc line that mentions emit('x.y') or '/api/…' must not count (found by CS1 checking itself)
    src = stripComments(src);
    for (const e of PP.exportsOf(src)) out.exports.add(e);
    for (const m of src.matchAll(/\b(?:emit|_emitEvent|busEmit\??\.?|bus\.emit|emitEvent)\s*\(\s*['"`]([a-z][\w-]*(?:[.:][\w-]+)+)['"`]/g)) out.events.add(m[1]);
    for (const m of src.matchAll(/pathname\s*===\s*['"`](\/api\/[^'"`]+)['"`]/g)) out.routes.add(m[1]);
    for (const m of src.matchAll(/\[\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*\[([^\]]+)\]/g)) {
      out.routes.add('/' + m[2].split(',').map(x => x.trim().replace(/^'|'$/g, '')).join('/'));
    }
  }
  return { exports: [...out.exports].sort(), events: [...out.events].sort(), routes: [...out.routes].sort(), missingFiles: out.missingFiles };
}

/** check(spec) — the promised surface against the measured one */
function check(spec, { root = ROOT } = {}) {
  const s = typeof spec === 'string' ? parse(spec) : spec;
  if (!s || !s.surface) return { ok: false, verifiable: false, reason: `${(s && s.name) || 'this spec'} has no surface block — nothing to check the code against` };
  if (!s.files.length) return { ok: false, verifiable: false, reason: `${s.name || 'this spec'} names no files (meta.files)` };
  const m = measure(s.files, { root });
  if (m.missingFiles.length === s.files.length) return { ok: false, verifiable: false, reason: `none of ${s.name}'s files exist: ${m.missingFiles.join(', ')}` };
  const grew = {}, unkept = {}, unconstrained = [];
  for (const k of KINDS) {
    const promised = s.surface[k];
    if (promised == null) { unconstrained.push(k); grew[k] = []; unkept[k] = []; continue; }   // not stated: not checked, said
    if (promised.includes('*')) { unconstrained.push(k); grew[k] = []; unkept[k] = promised.filter(x => x !== '*' && !m[k].includes(x)); continue; }
    grew[k] = m[k].filter(x => !promised.includes(x));
    unkept[k] = promised.filter(x => !m[k].includes(x));
  }
  const n = (o) => KINDS.reduce((a, k) => a + o[k].length, 0);
  const ok = !n(grew) && !n(unkept);
  return { ok, verifiable: true, name: s.name, files: s.files, grew, unkept, unconstrained, missingFiles: m.missingFiles, measured: { exports: m.exports, events: m.events, routes: m.routes },
    reason: ok ? null : [...KINDS.filter(k => grew[k].length).map(k => `${k} not in the spec: ${grew[k].join(', ')}`), ...KINDS.filter(k => unkept[k].length).map(k => `${k} promised but not in the code: ${unkept[k].join(', ')}`)].join('; ') };
}

/** find({ root }) — every capability spec under <system>/spec/ */
function find({ root = ROOT } = {}) {
  const out = [];
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !['node_modules', '.git', 'data'].includes(d.name)).map(d => d.name); } catch (_) {}
  for (const d of dirs) {
    const sd = path.join(root, d, 'spec');
    let fl = []; try { fl = fs.readdirSync(sd).filter(f => f.endsWith('.spec')); } catch (_) { continue; }
    for (const f of fl) {
      let text = ''; try { text = fs.readFileSync(path.join(sd, f), 'utf8'); } catch (_) { continue; }
      const s = parse(text);
      if (s.kind === 'capability') out.push({ ...s, file: path.join(d, 'spec', f).split(path.sep).join('/') });
    }
  }
  return out;
}

/** draft(name, files, { purpose, version }) — a capability spec whose surface is the measured one (nothing invented) */
function draft(name, files, { root = ROOT, purpose = null, version = '1.0.0', quote = null } = {}) {
  const m = measure(files, { root });
  const L = (a) => `[${a.join(', ')}]`;
  return [
    `# ${name} — capability spec (drafted from the measured surface; the purpose is to be written by James or confirmed)`,
    'spec:', '  meta:', `    name: ${name}`, `    version: ${version}`, '    kind: capability', `    files: ${L(files)}`,
    `  purpose: ${JSON.stringify(purpose || 'to confirm')}`, ...(quote ? [`  origin: ${JSON.stringify(quote)}`] : []),
    '  surface:', `    exports: ${L(m.exports)}`, `    events: ${L(m.events)}`, `    routes: ${L(m.routes)}`,
    '  invariants: []', '  checks: [CK-254]', '',
  ].join('\n');
}

module.exports = { MODULE_ID, VERSION, KINDS, parse, measure, check, find, draft, stripComments };
