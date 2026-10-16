# __LABEL__ (`__ID__`)
A tool folder. Everything this tool is lives here, nothing else does:

    __TOOL__/
      tool.json            manifest (schemas/tool.schema.json) — id, category, what it needs, which packs it ships
      __TOOL__.engine.js   define() + engine(ctx): params, ports, behaviour — runs headless
      __TOOL__.ui.js       the window (view.* only)
      __TOOL__.spec        the behaviour contract + acceptance tests
      preview.svg|png      shown in ＋ Add and the Pack Browser (build/shots.mjs renders the real one)
      packs/<id>/pack.json content packs: presets, kits, patterns, samples (schemas/pack.schema.json)
      tests/               optional tool-local tests

Needs: list only what it cannot be without in tool.json → needs (e.g. `music.engine` to make sound,
`eravos.song-recorder` to record into). The shell turns on exactly that and nothing more.
