# 0.60.7 — 2026-10-13

James asked for all of the following:
- "yeah but can you manage it completely? also maybe, add in claude, also to follow axioms. name the tools, and best areas to get context, also can you open the james brooks skill. focus on what establishes credibility, and skills, portfolio, and proof of compentancy. money is needed, badly. idearium needs to work, badly."
- "can you use playwright or clearglass to test idearium yourself, as eyes. like maybe have integrity checks when importing?"
- "can you add history import tool to the repos. like maybe with versionium. i want real versions with the versionium tab. like a full index of versions, versions, revisions from the work surface, diffs, backups/snapshots, etc. like full management system for versionium backend, then with the api, expand the idearium ui repo tab."
- "like can you have a refactor tool, or a option to fix or migrate archecture, like decompose components, and use the component registry for the spine, decompose nodes, organize file structure… like what do you think of that? can you save whats important in the claude.md"

## Versionium for every repo (`lib/repo-history.js`, the Versionium tab)

Nothing new is stored beside Versionium. This module reads and writes what Versionium already keeps.

- **One index of every version**, newest first, counted by kind:
  - snapshots (branch `repo-<uuid>`);
  - backups (the snapshot a restore takes first);
  - staging (`@staging`);
  - imported history (`@history`, ordered by the original dates);
  - the work surface's revisions (injects: proposed, staged, applied, rejected, reverted).
- **A diff between any two versions**, or between a version and the files on disk now, with a patch per file.
- **One file put back** as it was at a version. The write is itself versioned, so putting a file back can be undone.
- **A project's past imported as real versions:**
  - A zip that carries `.git` gives every commit on its main line, with the commit's date, author and message. The
    git commands only read, and run on a copy with hooks and fsmonitor off.
  - Several zips of one project become one version each, ordered by version and then date (the archive importer's own
    `scanZip`/`orderScans`).
  - Credentials are looked for **before anything is stored**. If one is found, the import stops until you choose to
    keep it.
  - Importing the same history twice stores nothing new.

Wiring:
- **Routes:**
  - `GET /api/repos/:uuid/versions`
  - `GET /api/repos/:uuid/versions/diff?a=&b=`
  - `GET /api/repos/:uuid/versions/tree`
  - `POST /api/repos/:uuid/versions/restore-file`
  - `POST /api/repos/:uuid/history/import`
- **Commands** (every agent has them):
  - `repo versions`: the same command, now the whole index; `--kind snapshot` gives the old list.
  - `repo diff`, `repo restore-file`, `repo history-import`.
- **The tab:**
  - filters by kind;
  - A and B on any two rows, then compare, or compare one row against the files now;
  - open a version to see its files, with "diff now" and "put back" on each;
  - drop zips to import history, with a dry run you approve first.

## Integrity checks on import (`lib/import-checks.js`)

Every project import now runs six checks, all deterministic, and executes nothing from the project:

| Check | What it finds |
|---|---|
| CK-001 | files that don't parse |
| CK-002 | requires that resolve to nothing |
| CK-006 | packages used but not declared |
| CK-008 | whole-file duplicates |
| CK-060 | credentials, shown masked |
| IMP-01 | fewer files on disk than the import wrote |

What a finding becomes:
- Each failing check is **one note on the repo** (source `import`). Errors are todos and warnings are questions.
- A later run updates that note. A check that comes back clean closes its note: marked done and kept, never deleted.

Where it runs:
- automatically on every import;
- `repo integrity [--notes]`;
- `GET`/`POST /api/repos/:uuid/integrity`;
- the Debug tab's "import checks → notes" button.

## The eyes, and what they found

Clear Glass runs on Electron, so the eyes are an Electron window over a sandboxed Idearium. It reads the page's text
beside each screenshot, so a stale frame cannot pass as a result. Three bugs were found and fixed, and each fix was seen
working on the next pass:

- **Files tab.** Every imported repo said "manifest only — file content isn't stored yet" while 544 files sat on disk.
  `app.js` read `repo.localPath`, a field nothing writes. It now reads `materializeDir` and `sourceFileCount`.
- **Repo library.** Each project was headed by its compartment's raw UUID. It is now headed by the project's name.
- **Title bar.** It said "Repository" without the repo's name. It now names the repo.

## On real projects (sandboxed, real routes)

- **Bridge-OS:** its `.git` became **33 versions** in 3.6 s, from 2026-07-24 "Initial import: Bridge OS pre-review
  snapshot" to 2026-08-11 "fix(forensic-sweep): 5 modules -- MITM defaults, DNS vulns, auth bypass, schema injection,
  IP leaks". Comparing the first with the last: 10 files added, 5 removed, 31 changed.
- **clearglass-gig-import:** its two zips became two versions, in order.
- **Import checks:**
  - ERAVOS: 22 duplicate files. The zip ships both its source and a packaged Windows build of it.
  - clearglass-gig-import: 24 requires that resolve to nothing. It is a patch over the Clear Glass tree, not a whole
    project.
  - Bridge-OS: 2 undeclared packages and 2 duplicates.
  - update-system: clean.

## Clear Glass: three fixes from his next message, the rest mapped first

James: "continue. need to fix the cookies in clearglass. idearium. in the settings. like its saying its not signed in to the
account when it is." · "the interaction field and nexus nerve doesn't do much. besides inject 1300 scripts." · "can you fix
the macros?" · "maybe only inject onto interactable elements. then the copilot can use nexus nerve to understand where its
at in relation to the ui using the injected scrips"

- **"Not signed in" while signed in.**
  - Cause: Settings → Accounts read only the account's own session (`persist:mesh-<provider>-<account>`). You sign in
    either in a normal tab, whose `<webview>` browses in the app's default session, or in the provider tab
    (`persist:ncp-<provider>`), and it looked at neither.
  - Fix: the status now reads those two sessions as well, counting only that provider's own site's cookies. The chip
    says where the sign-in is: "Signed in in a normal tab — not saved to this account".
  - One button, "Save the sign-in from …", takes that sign-in into the account, saving both its vault row and its own
    session, so the account's agent tab is signed in too.
  - Proof: `clear-glass/test/login-portal-elsewhere.test.js`.
- **1,342 userscripts injected into one page.**
  - Cause: on every boot, each built-in plugin re-created its userscript under a new random id. It was saved as bare
    source, losing its name and `@match`, so the next boot loaded every copy as `<uuid>.js` matching every page.
  - Fix: there is now one script per name, so creating it again updates it.
  - Each script's name, `@match` and agent are kept in a `.meta.json` beside it, and only persistent scripts are
    written.
  - The copies already on disk are moved to `_duplicates/` at the next start: kept, not deleted, never injected.
  - Proof: `clear-glass/test/userscripts-dedupe.test.js`. Five boots leave one script, and its `@match` survives a
    restart.
- **The macro recorder recorded the settings page.**
  - Cause: "default (window)" resolved through `getFocusedWebContents()`, and when you press Start, Settings is the
    focused window.
  - Fix: a window's id now resolves to the tab open in that window (its `<webview>` guest). A Clear Glass page of its
    own (settings, library, the browser chrome) is never an agent's page.
  - Not yet run in Electron here; to be seen on your machine.
- **Everything else in that message is mapped first, as the rules require:**
  `docs/2026-10-13-identities-tabs-and-automation-phasemap.spec`, with 16 phases and 3 decisions for you:
  - **ID** identities linked to hats and repos, every cookie as a row, bookmarks that carry their identity, incognito.
  - **TB** each tab its own process and identity (a COS compartment record on the bus), the right-click new-tab menu,
    `browser.html` rebuilt.
  - **HM** the hat keeps a model of the repo, and the ChatGPT connection holds.
  - **NV** words to elements, mapping only interactable elements, as you said: "open images" picks the matching target
    with the least depth, and the copilot reads that map to know where it is.
  - **MC** steps as events and snapshots, and hotkeys for macros.

  The root of the cookie problem is recorded there: every tab in a window is one `<webview>` in the default session.
  An "account window" is not really signed in as the account until each tab has its own partition (decision
  `decision_tab_isolation`).

## CLAUDE.md, the skill, the record

- **`docs/CLAUDE.md` gains three sections:**
  - **Claude follows the axioms too:** AXIOMS-v3.1 and RAID's constitution: USER_AUTONOMY, REVERSIBILITY,
    TRUTH_OVER_COHERENCE, EXPLAINABILITY.
  - **Where to get context:** the tools, best first. These are `nexus.command` and the `mcp__nexus__*` tools, loom,
    the atlases, specs and phasemaps, code-intel, the activity log and ledgers, his notes, a repo's versions, and the
    component store.
  - **Credibility, skills, and proof.**
- **The skill:**
  - `skills/james-brooks/SKILL.md` was already the fuller version. It now loads every session through
    `.claude/skills/james-brooks`.
  - His four new Communication Rules lines are added verbatim.
  - The copy he pasted is kept at `skills/james-brooks/versions/2026-10-13-as-pasted.md`.
- **`docs/PROOF-OF-COMPETENCY.md`** is the portfolio record. Each skill comes with an instance, his words, and something
  a stranger can check.

## Mapped, not built yet

The refactor and architecture-migration tool is phases RF0–RF2 and `decision_refactor_tool` in
`docs/2026-10-13-projects-raid-and-gates-phasemap.spec`:
1. Read the architecture from what exists: the component store, cycles, coupling, duplicates, and the layout against
   the taxonomy.
2. Propose the migration as a phasemap in the repo.
3. Apply one phase at a time as staged injects: snapshot before, checks and tests after, all-or-nothing, undoable from
   the index.

The coder's recommendation is [A], a proposal engine where nothing moves without his yes. It is his call.

Also recorded: `decision_history_on_import` is chosen as A, in his words, built as a tool. Running it automatically on
every `.git` import is marked "to confirm".

## Proof

- `tests/modules/test-repo-history.test.js`: **20/20**. It runs against Versionium's real engine and file layer, with a
  real three-commit git repository zipped with its `.git`.
- `test-event-contracts` 8/8 (three events declared). `test-cm3-commands` 4/4.
- Registry and census: loom wires added in `loom/maps/component-intake-map.js`; the writer census shows no new writers.
- `test-sandbox`: a project import under test now stays in its sandbox
  (`NEXUS_PROJECT_IMPORT_REPO_DIR`).
