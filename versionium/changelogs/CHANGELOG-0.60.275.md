# 0.60.275 — dropdowns that wait and use the keyboard; keys bound to elements, per site

James, 2026-10-28, with a screenshot of the gig's Scope & Pricing (BASIC on "6 DAYS DELIVERY", STANDARD and PREMIUM still on "DELIVERY
TIME"): "the drop downs. it needs to wait for the system. it keeps freezing. and then, opens the drop down, doesn't click. could always try
arrows, or a number. any way you can add all of that to the keybindings. like elements to keys, per site?"

## Dropdowns (KB1, `clear-glass/src/driver/index.js` `_choose`)
- **It waits for the system.** Before opening, before reading and before picking, it waits until the page answers quickly
  (`_waitResponsive`: two quick answers in a row, for up to 20 s). A frozen page is waited for, not clicked at.
- **It reads the options until they hold still** (the same list twice), for up to 8 s (`optionsWaitMs`). If nothing appeared, it opens the
  dropdown once more.
- **A pick that does not take is tried again, each way read back:**
  1. the pointer (as before);
  2. the arrow keys from the highlighted option to the one meant, then Enter;
  3. the option's number typed ("6 DAYS DELIVERY" → 6), then Enter;
  4. a direct click on the option.
- The result says which way took (`clickedBy`: pointer, keys, number or page) and lists every try in `tried`.
- **The freeze, a likely cause:** before opening, choose used to write a marker attribute onto every element on screen. On Fiverr's editor
  that is thousands of changes at once, and both the site's scripts and Clear Glass's own DOM watcher react to each. The list is now kept
  in memory (a WeakSet in the page), and nothing is written onto the page's elements. This is the coder's reading, to confirm on his
  machine.

## Keys bound to elements, per site (KB2, KB3)
- On a site, a key can do one of four things, and on that site only it wins over a global shortcut on the same key:
  - click an element;
  - choose an option in a dropdown (using everything above);
  - press a key in the page (Down, Up, Enter, a digit), after clicking the element when one is named;
  - run a macro.
- The element is a CSS selector or the XPath the element picker gives (found on the page when the key is pressed; if it is not there, the
  log says so).
- **Where to set them:**
  - Pick an element: a "Bind a key" bar offers it. Press the keys, say what they do, Save.
  - Settings › Keyboard shortcuts › Keys on sites lists them, adds by hand and removes them.
  - Agents and the CLI use `glass keys [<site>]`, `glass keys bind <site> <keys> click|choose|key|macro --selector … [--option …]` and
    `glass keys unbind <site> <keys>`.
- Plain typing keys are refused, as for every shortcut: a site key needs Ctrl, Alt or a function key.
- Files:
  - `src/shortcuts/site-keys.js` (pure);
  - `src/options/store.js` (`siteKeys`);
  - `src/main/index.js` (`_runSiteKey`, checked before the global shortcuts);
  - `src/ipc/bridge.js` (IPC `siteKeys:*`, `/cli/site-keys`);
  - `src/preload/index.js`;
  - `renderer/site-keys/bind-bar.*`;
  - `renderer/settings/sections/shortcuts.*`.

## Also
- `renderer/settings/sections/about.css` (0.60.269) was not scoped to its own Settings area. It is now, and so are the new shortcuts
  rules. test-cg-settings-ui-files keeps its 3 base failures, which come from other files (mesh.js, accounts.css).

## Proof
- `tests/modules/test-dropdown-keys.test.js` 2/2, in Clear Glass:
  - options that ignore clicks: STANDARD is picked with the arrows (↓×6, Enter) and PREMIUM, whose menu ignores arrows, by typing 14 and
    Enter;
  - no attribute is written on the elements already there;
  - a blocked page is waited for.
- `tests/modules/test-site-keys.test.js` 5/5:
  - one site only, typing refused, each kind validated;
  - Alt+6 → choose "6" on a dropdown named by XPath, in Clear Glass;
  - the wiring;
  - the Settings pane, in Clear Glass;
  - the bind bar after a pick, in Clear Glass.
- These keep their results: fiverr-works 11/11, fiverr-pace 2/2 (it now expects the second options read), site-a11y-and-dropdowns 3/3,
  cg-shortcuts 8/8, browser-shell 28/28, about-and-nodes 4/4, site-settings-ui 3/3, live-recording 8/8.

## Not proven here
Fiverr blocks this sandbox (403). Whether its menus take the arrows, the number, or both, and whether the freeze is gone, is shown on his
machine. The result's `tried` line says exactly what each way did.
