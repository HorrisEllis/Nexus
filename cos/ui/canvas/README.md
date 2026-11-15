# Nexus's canvas

James, 2026-11-14: "i want you to pull the canvas from the eravos canvas repo and remove the tools. make just the tools for nexus and the build
pipeline" · "importing eravos' canvas. isolated from the repo and start blank and make the tools for nexus."

    canvas/    ERAVOS's canvas (the host: windows, wires, kit, themes), imported whole and unchanged from HorrisEllis/Eravos-Canvas
               at 0ace521 (3.48.3, 2026-11-13). It names no tool; it finds the tools through ERAVOS_TOOLS (../tools/).
    tools/     what this canvas loads (tools/index.js): core and dataflow (ERAVOS's two tool-free shared folders the wires need),
               then nexus/ — Nexus's own tools. None of ERAVOS's music, video, image, agents or coding tools are here.
    schemas/   the formats a tool, pack, category and domain are written in (ERAVOS's)

Isolated from the ERAVOS repository: nothing here is fetched from it or kept in step with it; a later canvas version is imported again by
hand. Served by COS's cockpit server (cos/ui/serve.js) at /canvas/canvas/ , the same origin as COS's routes, so a tool calls /api/cos/… directly.
It starts blank. State: imported and booting blank (checked in Clear Glass's driver, no errors); Nexus's tools are not built yet.
