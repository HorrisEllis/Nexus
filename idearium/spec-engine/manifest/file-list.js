// idearium/spec-engine/manifest/file-list.js
// UUID: nexus-idearium-manifest-file-list-v1-0000-2026-0925-jamesbrooks-001
// Intent: turn any supported source into ONE normalized file list:
//   { key, uuid, path, intent, summary, depends[], related[], emits[], consumes[], notes[] }
// Sources: a .spec catalog (genesis grammar), a build_order YAML list
// (compiler-t0's shape), or a JSON manifest. Resolution happens in graph.js.
//
// depends = "this file calls / needs that one first" (directional, generates wiring).
// related = "associated with" (not a dependency, generates nothing).
// Legacy `ref` meant both; it is read as depends and flagged, never silently trusted.

import { createRequire } from 'module';
import { parseCatalog } from './parse-catalog.js';
const _require = createRequire(import.meta.url);

const arr = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
const keyOf = (uuid, path) => (uuid ? String(uuid).split('-')[0] : path);

function _entry({ uuid = null, path, intent = null, summary = null, depends = [], related = [], emits = [], consumes = [], notes = [], line = null, kind = null }) {
  return { key: keyOf(uuid, path), uuid, path, intent, summary, kind,
    depends: arr(depends).map(String), related: arr(related).map(String),
    emits: arr(emits), consumes: arr(consumes), notes, line };
}

export function fromCatalog(text) {
  return parseCatalog(text).map(({ path, fields: f, line }) => {
    const notes = [];
    let depends = f.depends;
    if (depends === undefined && f.ref !== undefined) { depends = f.ref; notes.push('LEGACY_REF'); }
    return _entry({ uuid: f.uuid || null, path, intent: f.intent || null, summary: f.summary || null,
      depends, related: f.related, emits: f.emits, consumes: f.consumes, notes, line });
  });
}

/** build_order YAML: a list of paths or {path, kind, dependsOn}, or {files: [...]}. */
export function fromBuildOrderYaml(content) {
  const yaml = _require('js-yaml');
  const parsed = yaml.load(content);
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.files) ? parsed.files : null);
  if (!list) throw new Error('file-list: build_order must be a YAML list, or an object with a top-level `files:` list');
  return list.map((e, i) => {
    const path = typeof e === 'string' ? e : e?.path;
    if (!path || typeof path !== 'string') throw new Error(`file-list: build_order entry ${i} has no real path`);
    const o = typeof e === 'object' ? e : {};
    return _entry({ uuid: o.uuid || null, path, intent: o.intent || null, kind: o.kind || null,
      depends: o.depends || o.dependsOn || [], related: o.related, emits: o.emits, consumes: o.consumes });
  });
}

export function fromJson(content) {
  const j = typeof content === 'string' ? JSON.parse(content) : content;
  const list = Array.isArray(j) ? j : (j.entries || j.files);
  if (!Array.isArray(list)) throw new Error('file-list: JSON must be a list, or have `entries` or `files`');
  return list.map(e => _entry({ ...e, uuid: e.uuid || null }));
}

/** fromSource(text, hint) — picks the reader by content, not by trust in the extension. */
export function fromSource(text, hint = '') {
  const t = text.trimStart();
  if (/\bfile\s+"[^"]+"\s*\{/.test(text)) return { format: 'catalog', files: fromCatalog(text) };
  if (t.startsWith('{') || (t.startsWith('[') && /\.json$/i.test(hint))) return { format: 'json', files: fromJson(text) };
  return { format: 'build_order', files: fromBuildOrderYaml(text) };
}
