# 0.60.181 — 2026-10-21 — the co-pilot pane is just Co-pilot

James, 2026-10-21, of the 0.60.180 pane (its four-way Ollama / Copilot / Guardian / Claude-Code switch): "i still hate it. maybe just
copilot"

His call. The coder's reading of it, to confirm: the pane is Co-pilot only.

## Changed
- **No route switch in the pane.** `copilot-cli.js` gains `fixedBackend`, and the pane passes `'copilot'`:
  - no switch or hat chip is drawn;
  - Settings → Co-pilot's default backend no longer moves the pane;
  - no route line appears under replies;
  - typing `/backend` still works when he wants it.
- **The floating CLI keeps the full three-way switch.** That was its whole ask ("the floating menu button 3-way cli").
- **The header is just "Co-pilot".** The backend chip is gone.
- **Shorter words:** the greeting is "Ask me about this page, or tell me what to do on it.", and the box's placeholder is "Ask Co-pilot…
  (/help for commands)".

## Measured
- `test-browser-shell` 12/12. BST-09 now also checks that the pane has no route switch and that the floating CLI keeps its own.
- `test-snowflake` 9/9. `test-tool-layers-and-pane-memory` 14/14 and `guardian-picker-answer-roundtrip` 4/4 are unchanged.
