# CHANGELOG 0.60.416 — EE3a: the Element Engine's full page

James, 2026-11-06: "That plugin needs to be front end too." · "It’s meant to replace the adblocker also like a full plugin page." · "It needs to
have a full page to edit, change and add. Like it needs to be fully featured. Not a small plugin at all dude."

He was looking at the Clear Glass additions of 2026-11-05 and asked whether they had reached browser.html. The Element Engine (EE0, the plugin
that was the Ad Blocker) only had the 🧩 popover: a small generic form drawn from the plugin's data. The coder asked: (a) a docked panel in
browser.html, or (b) its own window. He answered with the lines above. **The coder's reading, to confirm:** "a full page" is its own Clear Glass
window, built like the Library. The same area files can be docked into browser.html if he meant (a).

## Mapped first
- EE3 (one panel) expanded with his words, not a new map. EE3a is the full page: `depends_on: [EE2, ES3, ES5]`, its files named, the phase
  graph written (0 crossings), the whole DAG clean (layer 3, ready). EE3's per-element panel stays for after EE1.
- The element-engine map's EE0–EE2 `.phase`/`.graph` had drifted before this release; they were regenerated with it.

## Built, in his order (backend → route → command → UI)
- **Backend** `clear-glass/src/element-engine/index.js`:
  - every element-hiding rule across all sites, listed, added, changed in place and removed. Each is a line of his own filters, so the
    picker's Hide, My filters and this page write the same rule;
  - `hideRule`, the one check every hide goes through (the plugin's Hide uses it now too);
  - his ErosmancerOS copy (ES5's export folder): files listed with which changed, read, saved. Saves stay inside his folder, .ts only,
    no dot folder or node_modules, 1 MB at most. The syntax is checked on save.
- **Routes** on Clear Glass's bridge, `/cli/element-engine/`: `overview`, `hidden`, `copy`, `copy/file`, `copy/export`, `copy/diff`,
  `copy/import`, `pick`, `open`. A change to his filters or his copy needs `person:true`; an agent's tool never sends it.
- **Command** `element-engine <overview|hidden|hide|unhide|copy|copy-read|export|diff|import|pick|open>`. hide, unhide and import are his
  (personOnly).
- **Page** `clear-glass/renderer/element-engine.html`, on the Settings runtime, one JS and one CSS file per area:
  - Ad blocking: Overview, Filter lists, My filters, Allowed sites;
  - Elements: Hidden elements;
  - ErosmancerOS: Options, Threats, Edit TypeScript, and the Workbench (Settings' own ErosmancerOS area, reused unchanged).
- **Edit TypeScript** is an editor over his copy, never the live code: open a file, change it, save it (Ctrl+S), add a new file, show what
  changed, then import. Import keeps ES5's checks (syntax, conflicts, old files in `_archive`, the module's own test, the old files back if it
  fails). A refused import shows each file and why.
- **Pick an element** brings forward the browser window he used last (Electron's own focus event; no window code changed) and starts its
  Guardian picker.
- **Opening it:** the 🧩 row and the pinned 🛡 open the page instead of the popover. The popover stays for every other plugin, and for this
  one if the page cannot open, which is said. Plugin 3.1.0.

## Spec
- `clear-glass/spec/element-engine.spec`: three modules (MOD-CGE-BACKEND, -SURFACE, -PAGE). It compiles at full depth (SS-01) and is
  registered in `docs/SPEC-REGISTRY.spec`.
- EE3a names this spec and the modules it blocks.
- **The coder's miss, caught by SS-02 the same day:** the module was first written into `adblock.spec`. A module there must name a phase of
  the adblock map, so it moved out whole, as SC8 did in 0.60.387.

## Proof
- `tests/modules/test-cg-element-engine-page.test.js`, **9/9**:
  - EG-01 to EG-06: the backend, the routes and the command row;
  - EG-07: the page loads its files in order, and every area registers;
  - EG-08: the popover is replaced;
  - EG-09: every area's render runs on the real Settings runtime against fixture answers, including opening a file in the editor.
- EG-09 was checked by breaking one area on purpose: it failed, then passed once the area was restored.
- `test-cg-element-engine-plugin` 6/6 (EP-01 now expects 3.1.0).
- `tests/modules/test-cg-element-engine-page-drive.test.js`, **5/5**, driven in Clear Glass's own engine (AXIOMS §4.1; the driver ran on
  Electron 42 from `node_modules`). The page is served unchanged by a stand-in bridge on :7702 that answers with the real backend:
  - ED-01: it opens on Overview with the counts, and the rail holds every area;
  - ED-02: a hidden rule is written in the modal, changed and removed, each a line of his filters with his other lines untouched;
  - ED-03: My filters is saved whole;
  - ED-04: a file of his copy is opened, changed and saved, and the file on disk holds it;
  - ED-05: an option is set from the page and lands in the store `eros set` uses.
  The page threw no errors.
- **Found by the drive and fixed before release:** the count tiles were default grey buttons, so their labels were unreadable, and Overview
  said "1 files".
- **The full suite, against a clean worktree of the commit before:**
  - suites that failed only on this tree were each re-run alone on both trees;
  - `test-browser-shell` BST-13 changed on purpose. The adblocker's row now asks for the full page first, and BST-13 asserts that. When the
    page cannot open, it still checks the popover page it always checked (28/28);
  - `test-release-version` RV-01/RV-03 and `test-versionium-owns-releases` VO-04 (CK-253) fail only because HEAD is still tagged v0.60.415
    while the tree says 0.60.416. They pass once the release is committed. The release script says this test reads the committed tree;
  - every other difference was two suites running at once (port 3754 taken). Each passed alone.
- **Not run:** the page inside the full Clear Glass app (its preload, the real bridge, Pick bringing a real browser window forward). That
  is on his PC.
