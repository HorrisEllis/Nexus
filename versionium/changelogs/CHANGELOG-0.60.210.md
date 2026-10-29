# 0.60.210 — the ☰ menu's Tools and Customize toolbar, rebuilt

James, 2026-10-22, with a screenshot of the ☰ menu: "customize toolbar and those toolbar links, and customize toolbar need to be rebuilt
for  the new ui, they are cheap and crappy, and look bad."

Owned by: clear-glass/spec/browser-shell.spec MOD-BSH-DESIGN (dated addendum).

## Why they looked cheap
- **Text glyphs next to drawn icons.** The Tools rows drew each command's text glyph (✦ ⛏ ◎ ⬡ ⏮ ⟳ ⚙), while every other row in the menu
  has a drawn icon. The pinned tool buttons on the toolbar drew the same glyphs.
- **The old editor.**
  - It was a grid of identical chips under an all-caps heading.
  - Nothing said what a tool does.
  - The only way to move a tool was to drag it.

## What was rebuilt
- **Commands** (`src/toolbar/commands.js`, the one place commands are defined).
  - Each command has a drawn icon and one line on what it does. Fiverr gigs got a briefcase, a new drawing.
  - Every tool button on the toolbar now draws its icon.
  - A plugin's command draws its plugin's icon.
- **☰ menu → Tools.**
  - Its rows use the menu's own row style.
  - Each row has a pin button that puts the tool on the toolbar at once. The heading has an "Edit" link that opens Customize toolbar.
  - Settings is no longer listed twice, since the menu has its own Settings row.
- **Customize toolbar** (`renderer/shell/toolbar.css`, on the shell's own design system).
  - A live preview of the toolbar.
  - Two lists, "On the toolbar" and "In the ☰ menu". Each tool shows its icon and what it does, with Pin or Unpin on every row. Dragging
    still works. Each list shows its count.
  - "Run once" actions as buttons.
  - Restore defaults and Done.
- **Toolbar order.** The movable tools now sit on the toolbar in the order they were pinned.

## Found on the way
- **A plugin command with no toolbar button** (the Zoom plugin's commands) was offered for pinning, which did nothing.
  - It is now a run-once action in the editor.
  - It stays in the menu's Tools, without a pin button.
- **Clean-up.** The old editor's rules were removed from `browser.css`; they are in git history. Every element id from 0.60.178 is kept.

## Proof
- tests/modules/test-browser-shell.test.js, 26/26. **BST-21** runs in Clear Glass and checks:
  - drawn icons on the toolbar, in the menu and in the editor;
  - the menu's pin button pins the tool, and it appears on the toolbar at once;
  - each editor row's icon and description;
  - Pin and Unpin, the counts, and the preview;
  - Done saves the toolbar list in order.
- test-adblock 13/13. test-cg-accounts-portal-settings: the same 2 failures as before this release.

## Also
- 0.60.206–0.60.209 are merged to main in HorrisEllis/Nexus#143.
