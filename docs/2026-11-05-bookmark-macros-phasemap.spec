# docs/2026-11-05-bookmark-macros-phasemap.spec — a bookmark that runs a macro when it opens. Owner: clear-glass. The ask is James's; the shape
# is the coder's, decided by his axioms (cited). BM1 built 0.60.403.

origin: "James, 2026-11-05: \"bookmarks with ability to bind macros.\""

found: >-
  (read 2026-11-05) Bookmarks (clear-glass/src/bookmarks/store.js, JAA rows cg_bookmarks) carry url, title, tags, an account and a page state
  (linkState, 0.39.265); they open from the bookmarks bar (renderer/browser.js openBookmark) and the Library (renderer/library/sections/
  bookmarks.js openIn). Macros (lib/agent-tools/tools/clear-glass/macro.js) are listed and run as a person (bridge macros:list, macros:run →
  runMacroAsPerson, with its toast, MB4). Nothing joined the two.

phases:
  BM1_a_bookmark_runs_its_macro:
    status: "BUILT 0.60.403 — test-cg-bookmark-macros"
    depends_on: []
    files: [clear-glass/src/bookmarks/store.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/renderer/browser.js, clear-glass/renderer/library/sections/bookmarks.js, tests/modules/test-cg-bookmark-macros.test.js, tests/modules/run-all.js]
    does: >-
      A bookmark can be bound to one of his macros (store bindMacro({ id, macro }); null unbinds; the name must be a macro that exists). In the
      Library each bookmark has "Macro on open" (none or a macro). Opened from the bar, the page loads first (the webview's stop-loading, at
      most 30 s), then the macro runs as his act through macros:run, with its own toast; from the Library, after the page opens in its window.
      The bar marks a bound bookmark ⚡. A macro that is gone or fails is said, never silent; the page stays open either way.
    proof: "a bound bookmark keeps its macro and unbinds; an unknown macro is refused; the bar runs it after the page loads; the Library offers the choice and runs it on open"
