# 0.60.213 — no second box inside the start page's search

James, 2026-10-22, with a screenshot of the start page: "such a small thing but get rid of that border in the search. comit but also hand me
the file you change."

- **Cause.**
  - The shell gives every control a keyboard-focus ring: `body.cg-shell :focus-visible` in `renderer/shell/shell.css`.
  - That rule outranked the search input's own `outline: 0`, so a second rounded box was drawn inside the search field.
- **Fix.** The search field already shows focus with its glowing border, so the input inside now draws no ring of its own. One rule, in
  `clear-glass/renderer/shell/shell.css`.
- **Proof.** BST-22, in Clear Glass, focuses the search, types, and checks two things: the input has no outline, and the field still shows
  its focus glow. `test-browser-shell` passes 28/28.
