# {{name}}

{{description}}

A canvas made from James Brooks's ERAVOS, laid out by the COS archetype `eravos-canvas`. His README: "the canvas and the
tools are separate".

    canvas/      the empty canvas — domain-free: kernel/, runtime/, index.html, scripts.js
    tools/       one folder per domain; inside a domain, tools/<category>/<tool>/ (one tool each). In Nexus each tool is
                 its own COS compartment, nested under this one, and linked here.
    schemas/     the formats both sides agree on (tool, pack, mode, category, domain)
    templates/   copy-to-start folders for a new tool, sound tool, pack, mode, category, domain
    build/       new-tool.mjs · index-tools.mjs · validate.mjs (Node built-ins only)
    serve.js     serves this folder at http://localhost:4747 (node serve.js --open)

Add a tool: in Nexus, `idearium canvas add-tool <canvas> <domain> <category> <tool-id> "<Label>"` (a nested compartment),
or here, `node build/new-tool.mjs --domain music --category effects --id fx-shimmer --label "Shimmer"`, then
`node build/index-tools.mjs` and `node build/validate.mjs`.
