// idearium/spec-engine/manifest/commands.js
// UUID: nexus-idearium-manifest-commands-v1-0000-2026-0925-jamesbrooks-001
// Intent: the three manifest verbs, once. Both doors call these — the
// idearium CLI router (idearium manifest …) and the pure entry point
// (node idearium/spec-engine/manifest/cli.js …), which loads no store.
// Each returns { code, out: [lines] | json } and never exits the process.

import fs from 'fs';
import path from 'path';
import { generate, chunkContext } from './index.js';

function run(file) {
  if (!file) return { error: 'usage: manifest check|generate|context <file> [id]' };
  if (!fs.existsSync(file)) return { error: `no such file: ${file}` };
  return { r: generate(fs.readFileSync(file, 'utf8'), { source: file }) };
}

export function check(file, { warnings = false } = {}) {
  const { r, error } = run(file); if (error) return { code: 1, out: [error] };
  const errs = r.violations.filter(v => v.severity === 'error'), warns = r.violations.filter(v => v.severity !== 'error');
  const out = [`MANIFEST CHECK ${file} · ${r.format} · ${r.manifest ? r.manifest.count : 0} files`];
  for (const v of errs) out.push(`  ✗ ${v.code.padEnd(22)} ${v.where}  ${v.message}`);
  if (warnings) for (const v of warns) out.push(`  ! ${v.code.padEnd(22)} ${v.where}  ${v.message}`);
  else if (warns.length) out.push(`  ${warns.length} warning(s) — add --warnings to list them`);
  out.push(r.ok ? `  ✓ wiring is clean · ${r.manifest.layers.length} build layers` : `  ${errs.length} error(s) — chunking blocked`);
  return { code: r.ok ? 0 : 1, out, result: r };
}

export function generateTo(file, { out: outDir } = {}) {
  const { r, error } = run(file); if (error) return { code: 1, out: [error] };
  if (!r.ok) return { code: 1, out: [`manifest has ${r.violations.filter(v => v.severity === 'error').length} error(s) — run: manifest check ${file}`] };
  const dir = outDir || path.join(path.dirname(file), path.basename(file).replace(/\.[^.]+$/, '') + '.manifest');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(r.manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'component-registry.json'), JSON.stringify(r.registry, null, 2) + '\n');
  const out = [`✓ ${r.manifest.count} components · ${r.manifest.layers.length} layers → ${dir}`];
  r.manifest.layers.forEach((l, i) => out.push(`  L${i}  ${l.length} in parallel`));
  return { code: 0, out, dir };
}

export function context(file, id) {
  const { r, error } = run(file); if (error) return { code: 1, out: [error] };
  const ctx = r.manifest && chunkContext(r.manifest, id);
  if (!ctx) return { code: 1, out: [`no component "${id}" in ${file}`] };
  return { code: 0, json: ctx };
}

/** dispatch(argv) — the verb router shared by both doors. */
export function dispatch([verb, file, id], flags = {}) {
  if (verb === 'check') return check(file, { warnings: !!flags.warnings });
  if (verb === 'generate') return generateTo(file, { out: flags.out });
  if (verb === 'context') return context(file, id);
  return { code: 1, out: ['usage: manifest check <file> [--warnings] | generate <file> [--out dir] | context <file> <id>'] };
}
