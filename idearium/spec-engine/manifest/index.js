// idearium/spec-engine/manifest/index.js
// UUID: nexus-idearium-manifest-index-v1-0000-2026-0925-jamesbrooks-001
// Intent: Phase 1 in one call — source text → file list → wire-check →
// manifest + component registry. No LLM anywhere in this path.

import { fromSource } from './file-list.js';
import { wireCheck } from './wire-check.js';
import { buildManifest, buildRegistry, chunkContext } from './registry.js';

export function generate(text, { source = null } = {}) {
  const { format, files } = fromSource(text, source || '');
  if (!files.length) return { ok: false, format, violations: [{ code: 'EMPTY', severity: 'error', where: source, message: 'no files found in source' }] };
  const check = wireCheck(files);
  const manifest = buildManifest(files, check.graph, source);
  return { ok: check.ok, format, violations: check.violations, manifest, registry: check.ok ? buildRegistry(manifest) : null };
}

export { chunkContext, wireCheck, fromSource };
