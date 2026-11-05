# 0.60.403 — Bookmarks that run a macro (BM1)

James, 2026-11-05: "bookmarks with ability to bind macros."

## Built
- **Binding.** A bookmark can be bound to one of your macros. The name is checked against your macros; "No macro on open" unbinds it.
- **In the Library** (Library › Bookmarks), each bookmark has **Macro on open**.
- **From the bookmarks bar.** The page loads first (the webview's stop-loading, at most 30 s), then the macro runs as your act, with its own
  toast. A bound bookmark shows ⚡ in the bar.
- **From the Library.** The macro runs once the bookmark opens in its window.
- **Failures.** A macro that is gone or fails is said, and the page stays open.

## Proof
- `test-cg-bookmark-macros` 4/4.
- `test-cg-bookmark-account-state` 6/6, unchanged.
- `clear-glass-library-ui` 43/2, the same as on main. Its two Ctrl+J failures are not from this change.
