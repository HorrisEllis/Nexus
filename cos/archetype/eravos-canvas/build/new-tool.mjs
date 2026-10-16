#!/usr/bin/env node
// Make a new tool from the template — its own folder, manifest, engine, window, spec, preview and packs/.
//   node build/new-tool.mjs --domain music --category effects --id fx-shimmer --label "Shimmer" [--flavour sound] [--category-label "Effects"]
// Then: node build/index-tools.mjs (the loader picks it up) · node build/validate.mjs (checks it against the schemas)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s--/).map(s => s.replace(/^--/, '')).filter(Boolean).map(s => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1).replace(/^"|"$/g, '')]; }));
for (const k of ['domain', 'category', 'id', 'label']) if (!a[k]) { console.error('missing --' + k); process.exit(1); }
if (!/^[a-z][a-z0-9-]*$/.test(a.id) || !/^[a-z][a-z0-9-]*$/.test(a.category)) { console.error('--id and --category: lower-case-with-dashes'); process.exit(1); }
const tpl = path.join(ROOT, 'templates', a.flavour === 'sound' ? 'tool-sound' : 'tool');
const catDir = path.join(ROOT, 'tools', a.domain, 'tools', a.category), dst = path.join(catDir, a.id);
if (fs.existsSync(dst)) { console.error('exists: ' + path.relative(ROOT, dst)); process.exit(1); }
const fullId = a.domain === 'music' ? 'eravos.' + a.id : `eravos.${a.domain}.${a.id}`;
const catLabel = a['category-label'] || a.category.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const sub = (s) => s.replace(/__ID__/g, fullId).replace(/__LABEL__/g, a.label).replace(/__DOMAIN__/g, a.domain).replace(/__CATEGORY_LABEL__/g, catLabel).replace(/__CATEGORY__/g, a.category).replace(/__TOOL__/g, a.id).replace(/__AUTHOR__/g, a.author || 'me');
(function copy(from, to) { fs.mkdirSync(to, { recursive: true }); for (const n of fs.readdirSync(from)) { const f = path.join(from, n), t = path.join(to, sub(n)); if (fs.statSync(f).isDirectory()) copy(f, t); else fs.writeFileSync(t, sub(fs.readFileSync(f, 'utf8'))); } })(tpl, dst);
if (!fs.existsSync(path.join(catDir, 'category.json'))) fs.writeFileSync(path.join(catDir, 'category.json'), sub(fs.readFileSync(path.join(ROOT, 'templates/category/category.json'), 'utf8')));
// then: node build/tool-kit.mjs writes packs/pack.schema.json, works_with and a real thumbnail
console.log('made ' + path.relative(ROOT, dst) + '  (' + fullId + ')\nnext: node build/index-tools.mjs && node build/tool-kit.mjs && node build/validate.mjs');
