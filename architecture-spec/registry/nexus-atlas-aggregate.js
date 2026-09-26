'use strict';
/**
 * .architecture/registry/nexus-atlas-aggregate.js — rolls up idearium's
 * real per-project atlas.json files (repository, fileCount, byLanguage,
 * byKind, components[]) into one NEXUS-level summary. Does not invent
 * a new schema — every field below is idearium's own real shape,
 * confirmed against idearium/data/projects/<repo-id>/atlas.json.
 *
 * The "repo compartment" idea this supports: each NEXUS system, once
 * it's its own idearium project, already produces exactly this file.
 * This tool is what turns N of those into one NEXUS-wide index — it
 * has nothing system-specific in it, it only knows idearium's real
 * atlas.json shape.
 */

/**
 * aggregate(perSystemAtlases) — perSystemAtlases: { [systemName]: atlasJson }
 * atlasJson matches idearium's real shape exactly.
 */
function aggregate(perSystemAtlases) {
  const systems = Object.keys(perSystemAtlases);
  let totalFiles = 0;
  const byLanguage = {};
  const byKind = {};
  const perSystemSummary = {};

  for (const [system, atlas] of Object.entries(perSystemAtlases)) {
    totalFiles += atlas.fileCount || 0;
    for (const [lang, count] of Object.entries(atlas.byLanguage || {})) {
      byLanguage[lang] = (byLanguage[lang] || 0) + count;
    }
    for (const [kind, count] of Object.entries(atlas.byKind || {})) {
      byKind[kind] = (byKind[kind] || 0) + count;
    }
    perSystemSummary[system] = {
      fileCount: atlas.fileCount || 0,
      byLanguage: atlas.byLanguage || {},
      byKind: atlas.byKind || {},
      generatedAt: atlas.generatedAt || null,
    };
  }

  return {
    generatedAt: Date.now(),
    systemCount: systems.length,
    totalFiles,
    byLanguage,
    byKind,
    perSystem: perSystemSummary,
  };
}

module.exports = { aggregate };
