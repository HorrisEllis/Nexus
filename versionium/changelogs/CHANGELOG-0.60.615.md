# 0.60.615 — the model ladder in the ▶ build

James, 2026-11-20: "okay, continue. to get the pipeline working, that way we can use it to build the rest of nexus." · "▶ build using that ladder" · "okay do it." (the merge into main and the move of COS's folder)

## What changed
EMB2 expanded.
- **`routing.emerge_ladder`**: the Emerge rung's Ollama models, smallest first, comma-separated. In Idearium's config schema (copilot-writable), set with `system routing emerge_ladder <models>` or `POST /api/config`, the same way as `emerge_first`. Empty: the rung's one model, as before.
- **The ▶ build gives the rung its ladder:** one rung per model, each asked through the Ollama system's job route, whose door records every call on the tape.
- **Deployed the same day:** the folder COS runs (`D:\…\nexus`) moved to main. Its 579 uncommitted tracked changes are kept on the branch `saved/eloquent-maxwell-2026-11-20`; 36 files that blocked the move are copied to `nexus-saved-2026-11-20\` (26 identical to main, 7 live logs put back, 3 older copies of gaps.eg, its build and reuse.test.eg). Idearium and COS were restarted through COS's own routes; the Ollama system (ollama-bridge, declared, not running) was started.

test-emerge-rung 10/10; test-pipeline-routing 9/10 before and after (its one failure is a Windows file URL, there before).

## Not done (said)
- The settings screen's row for `emerge_ladder`: his rule is a live preview and his yes before UI is built.
- Versionium shows "degraded" in COS after the restart; not yet looked at.

## Files
- idearium/lib/config-core.cjs, lib/pipeline-routing.js: the setting
- idearium/api/index.js: the ladder, the Ollama door shared by every rung
