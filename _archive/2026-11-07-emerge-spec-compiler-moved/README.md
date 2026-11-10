# Emerge's spec compiler, archived when it moved to Idearium (2026-11-07, CIE8)

James, 2026-11-07: "yeah move it, until we have something to slot in the gap it will leave. then we could even invent something ground up,
thats another point of emerge. build towards a world a bit more me." · "as long as its removed from emerge." · "do it".

These are Emerge's copies as they stood when the compiler moved, kept so nothing is lost (§0.3). The live compiler is Idearium's:
`idearium/spec-engine/spec-compiler/`, served at POST /api/spec-compiler/compile|build|run|check. It was proven equal before the move:
- kg-builder output on all 47 registered specs;
- cie-eg.spec's T0/T1 compile, 28 files.

Emerge's door still answers its old /compiler/* routes, with a 410 that names the new place (emerge/emerge/lib/compiler.js). Map:
docs/2026-11-06-cie-eg-build-phasemap.spec CIE8, CIE_D7. The gap it leaves in Emerge is his to fill, "ground up".

Nothing here is required by code. Emerge's `siso/` stayed in Emerge (emerge-ide.js and emerge-codegen-v2.js use it); Idearium has a copy,
counted as a duplicate for PIL5's census.
