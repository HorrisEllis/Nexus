#!/usr/bin/env node
// Checks every tool folder, pack, mode, category and domain manifest against schemas/*.schema.json (required fields,
// types, enums, patterns, no unknown keys) — and that each tool's engine defines the id its tool.json claims.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', n + '.schema.json'), 'utf8'));
const errs = [];
function check(v, s, where) {
  if (s.const !== undefined && v !== s.const) errs.push(`${where}: must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${where}: ${JSON.stringify(v)} not one of ${s.enum.join(', ')}`);
  if (s.oneOf) { if (!s.oneOf.some(o => { const n = errs.length; check(v, o, where); const ok = errs.length === n; errs.length = n; return ok; })) errs.push(`${where}: does not match any allowed shape`); return; }
  const t = s.type; if (t === 'string' && typeof v !== 'string') return errs.push(`${where}: string expected`);
  if (t === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) return errs.push(`${where}: number expected`);
  if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) errs.push(`${where}: ${v} is below ${s.minimum}`);
  if (typeof v === 'number' && s.maximum !== undefined && v > s.maximum) errs.push(`${where}: ${v} is above ${s.maximum}`);
  if (t === 'integer' && !Number.isInteger(v)) return errs.push(`${where}: integer expected`);
  if (t === 'boolean' && typeof v !== 'boolean') return errs.push(`${where}: boolean expected`);
  if (t === 'array') { if (!Array.isArray(v)) return errs.push(`${where}: list expected`); if (s.minItems && v.length < s.minItems) errs.push(`${where}: at least ${s.minItems}`); if (s.maxItems && v.length > s.maxItems) errs.push(`${where}: at most ${s.maxItems}`); if (s.items) v.forEach((x, i) => check(x, s.items, `${where}[${i}]`)); }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return errs.push(`${where}: object expected`);
    (s.required || []).forEach(k => { if (v[k] === undefined) errs.push(`${where}: missing ${k}`); });
    Object.keys(v).forEach(k => { if (s.properties && s.properties[k]) check(v[k], s.properties[k], `${where}.${k}`); else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(v[k], s.additionalProperties, `${where}.${k}`); else if (s.additionalProperties === false) errs.push(`${where}: unknown key ${k}`); else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(v[k], s.additionalProperties, `${where}.${k}`); });
  }
  if (typeof v === 'string' && s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${where}: ${JSON.stringify(v)} does not match ${s.pattern}`);
  if (typeof v === 'string' && s.maxLength && v.length > s.maxLength) errs.push(`${where}: longer than ${s.maxLength}`);
}
const schemas = { tool: S('tool'), pack: S('pack'), mode: S('mode'), category: S('category'), domain: S('domain') };
let n = 0; const load = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { errs.push(`${path.relative(ROOT, f)}: not valid JSON (${e.message})`); return null; } };
const roots = (process.argv[2] ? [path.resolve(process.argv[2])] : [path.join(ROOT, 'tools')]);
const isTemplate = (f) => /[\\/]templates[\\/]/.test(f) || /__[A-Z_]+__/.test(fs.readFileSync(f, 'utf8').slice(0, 400));
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name), r = path.relative(ROOT, f);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f); continue; }
    let kind = e.name === 'tool.json' ? 'tool' : e.name === 'pack.json' ? 'pack' : e.name === 'category.json' ? 'category' : e.name === 'domain.json' ? 'domain' : /\.mode\.json$/.test(e.name) ? 'mode' : null;
    if (!kind) continue; const tpl = isTemplate(f); let v = load(f); if (!v) continue; if (tpl) v = JSON.parse(JSON.stringify(v).replace(/__[A-Z_]+__/g, 'tpl').replace(/"id":"tpl"/g, '"id":"eravos.tpl"')); n++; check(v, schemas[kind], r);
    if (tpl) continue; // templates keep __PLACEHOLDERS__: shape is checked, ids/paths are filled in by new-tool
    if (kind === 'tool') {
      const eng = path.join(dir, v.files && v.files.engine || ''); if (!fs.existsSync(eng)) { errs.push(`${r}: engine file ${v.files && v.files.engine} missing`); continue; }
      const src = fs.readFileSync(eng, 'utf8'), at = src.indexOf('OrganismFactory.define('), id = (src.slice(at < 0 ? 0 : at).match(/id: '([^']+)'/) || [])[1]; if (id !== v.id) errs.push(`${r}: tool.json id ${v.id} ≠ engine id ${id}`);
      if (!v.files.spec || !fs.existsSync(path.join(path.dirname(path.join(ROOT, r)), v.files.spec))) errs.push(`${r}: every tool has a spec beside its code (P37.2) — run build/specs.mjs`);
      ['ui', 'css', 'spec', 'preview'].forEach(k => { if (v.files[k] && !fs.existsSync(path.join(dir, v.files[k]))) errs.push(`${r}: ${k} file ${v.files[k]} missing`); });
      (v.packs && v.packs.shipped || []).forEach(p => { if (!fs.existsSync(path.join(dir, 'packs', p, 'pack.json'))) errs.push(`${r}: shipped pack ${p} missing`); });
      // the tool's own pack schema (build/tool-kit.mjs) — every pack in its packs/ folder must fit it
      const ps = path.join(dir, 'packs', 'pack.schema.json');
      if (!fs.existsSync(ps)) errs.push(`${r}: packs/pack.schema.json missing — run build/tool-kit.mjs`);
      else { const sch = load(ps); if (sch) for (const pk of fs.readdirSync(path.join(dir, 'packs'))) { const pj = path.join(dir, 'packs', pk, 'pack.json'); if (!fs.existsSync(pj)) continue; const pv = load(pj); if (pv && pv.items) check({ items: pv.items }, { type: 'object', properties: sch.properties }, path.relative(ROOT, pj)); } }
      if (!v.files.tests || !fs.existsSync(path.join(dir, v.files.tests))) errs.push(`${r}: every tool carries its tests (files.tests) — run build/tool-kit.mjs`);
      if (!v.files.preview || !fs.existsSync(path.join(dir, v.files.preview))) errs.push(`${r}: thumbnail missing — run build/tool-kit.mjs`);
      if (path.basename(path.dirname(dir)) !== v.category) errs.push(`${r}: lives in category folder ${path.basename(path.dirname(dir))} but says ${v.category}`);
    }
  }
})(roots[0]);
if (errs.length) { console.error(errs.map(e => '✗ ' + e).join('\n')); console.error(`${errs.length} problem(s) in ${n} manifest(s)`); process.exit(1); }
console.log(`✓ ${n} manifest(s) valid`);
