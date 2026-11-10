'use strict';
// lib/compiler.js — component emerge.compiler: the spec compiler's old door, answering where it went.
// James, 2026-11-07: "yeah move it, until we have something to slot in the gap it will leave" · "as long as its removed from emerge."
// The spec compiler moved to Idearium (Nexus phase CIE8, his CIE_D7): idearium/spec-engine/spec-compiler, served at
// POST /api/spec-compiler/compile|build|run|check. Emerge's copy is archived (_archive/2026-11-07-emerge-spec-compiler-moved). A caller that
// still asks this door is told where to go, never left with a silent 404 (§1.2). The gap it leaves is his to fill, ground up, in Emerge.

const moved = (verb) => async () => {
  throw Object.assign(new Error(`the spec compiler moved to Idearium on 2026-11-07 (CIE8): POST /api/spec-compiler/${verb} on Idearium's door, not Emerge's /compiler/${verb}`), { status: 410 });
};

module.exports = { compile: moved('compile'), build: moved('build'), run: moved('run'), check: moved('check') };
