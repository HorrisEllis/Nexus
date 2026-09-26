// cos/runtime/resolve-hook.mjs — ESM resolution fallback for COS runs.
// UUID: cos-runtime-resolve-hook-v1-0000-2026-0926-001
//
// §0.39.261 — a repo run in a COS branch has no node_modules of its own (repo-run
// never installed anything, so any `import 'x'` failed). CommonJS is covered by
// NODE_PATH, which the runner points at Nexus's root node_modules; ESM ignores
// NODE_PATH, so this hook does the same for `import`: when a BARE specifier does
// not resolve from the importing file, it is resolved again as if imported from
// the package root (COS_PACKAGES_ROOT). The repo's own node_modules, if it has
// any, still win — this only runs on a miss.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.env.COS_PACKAGES_ROOT || null;
const FALLBACK_PARENT = ROOT ? pathToFileURL(path.join(ROOT, 'package.json')).href : null;

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    const bare = !specifier.startsWith('.') && !specifier.startsWith('/') && !/^[a-z]+:/i.test(specifier);
    if (!bare || !FALLBACK_PARENT || e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    return nextResolve(specifier, { ...context, parentURL: FALLBACK_PARENT });
  }
}
