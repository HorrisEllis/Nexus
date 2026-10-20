# 0.60.180 — 2026-10-21 — the window designed properly, Guardian's agents in one place, the bridge set up by itself

James, 2026-10-21, after the 0.60.179 screenshots: "show me the ui. lets design it" · "need to have it nice and clear. access to all
guardian agent stuff. need to have the bridge setup automatically." · "omg this looks bad. enterprise grade, production quality.
outliar level ui"

His verdict was right, and the calls are his. The coder's part: what was wrong in the shots, the design, the code.

## What was wrong (the coder's read of the 0.60.179 shots)
- **Emoji for every icon.** Every OS draws them differently, and they read as a prototype.
- **Layout gaps.** A narrow address bar, a black void for a new tab, and an empty bookmarks strip.
- **An unfinished co-pilot pane.** It was still in the older monospace style, with a grey bar where the mic should be.
- **Guardian's agents behind a menu row, and its panel was wrong.** The panel read `p.hosted` while the provider host sends `running`, so
  every agent always showed **Start**, even when it was running. That is the screenshot he sent. The same field was read wrong in the
  Options list.
- **A Snowflake bridge line he had to find and paste himself.**

## Also found: a bug the redesign itself introduced, fixed before release
Drawn icons put an `<svg>` inside each button. `browser.js` decided "a click outside closes the menu" by comparing `e.target.id` with the
button's id, so a click on the icon opened the ☰ menu and closed it in the same moment. Three such checks (☰, the agent mesh, the
bookmark dialog) now use `closest()`. Positions are measured from the button, not its icon.

## Built
- **BS8, design system.**
  - `renderer/shell/icons.js`: one drawn icon set (24-unit grid, 1.75 stroke, round caps; the Firefox Proton / Lucide manner). It needs
    no font and no network. Every toolbar button, the window controls, the mic, the identity badge and each plugin uses it.
  - `shell.css`: type, spacing and elevation scales on Settings' palette. Tabs are rounded and lift when active. A 48px toolbar.
  - The address bar now starts at most of the row (his 0.60.7 auto-size and drag are kept). The site identity reads green 🔒, amber ⚠,
    or violet ❄ in a Snowflake window. An empty bookmarks strip is hidden.
- **BS9, the Guardian hub** (`renderer/shell/agents.js`). A toolbar button with a running-count badge opens:
  - every NCP agent, in its brand colour, with its real state (running, crashed, health): Open and Stop when running, Start when not, and
    Start every agent;
  - the Guardian tools: agent mesh and queue, pick an element (assign a provider's selectors), Guardian scripts, the mesh HUD, accounts and
    profiles, chat capture.
- **BS10, a start page** (`renderer/shell/newtab.js`). Drawn by the browser over a blank tab, never inside a site:
  - a greeting and a search box;
  - the agents as cards, one press to start or open;
  - bookmarks as tiles;
  - Snowflake's state with Start, and the floating CLI.

  It hides the moment the tab goes somewhere.
- **BS11, the co-pilot pane** (`renderer/shell/copilot.css`, CSS only):
  - the route as one segmented control;
  - readable messages, his on the right;
  - one composer with the context chips, the mic inside, and Send.
- **SF7, the bridge set up automatically.** `NetService.ensureBridge` runs before every start (the Start button, `net start`, Open with
  Snowflake):
  - a line he set himself is never replaced;
  - with no line set, it takes the first one on the machine (Tor Browser, the installed bundle, the snowflake-client package);
  - with none there, it asks the Tor Project's builtin list. This supersedes the coder's 0.60.178 rule that this was his button only; the
    old rule is kept in the spec, marked superseded. The page says the request goes to bridges.torproject.org directly;
  - the source is recorded and shown. If nothing answers, Start says what was tried, in order.
- **Settings → Network leads with one status card:** Connected / Connecting / Off, where the bridge came from, the exit address, and Start
  or Stop and Check the circuit. Start installs the programs first if they're missing. The programs and the bridge line sit under
  Advanced, which opens by itself only when something needs him.

## Measured
- `test-browser-shell` 12/12, with three new checks in Clear Glass's own engine:
  - BST-09: every toolbar button draws an icon, no emoji is left, the address bar takes the row, and the empty strip is hidden;
  - BST-10: the hub shows real state per agent and the right actions, the badge counts running agents, Start calls the real API, and the
    old panel reads `running`;
  - BST-11: the start page appears on a blank tab, its search navigates, and it hides after navigating.
- `test-snowflake` 9/9:
  - SFW-09: a set line is kept, otherwise a local one is used, otherwise the Tor Project is asked; refusals are said; every start path
    sets the bridge up first;
  - SFW-08: now checks the status card first, then Advanced.
- Unchanged: `test-compartment-downloads` 6/6, `test-net-routes` 24/24, `test-cg-network-ui` 4/4, `test-substrate-spec` 3/3,
  `test-loom-map` 19/19. `clear-glass-library-ui` fails only Ctrl+J, as on the base.

## Not done, and said
- His running app is on `main` (0.60.176). 0.60.177–0.60.180 are on the branch, so none of this is in the window he is using until it is
  merged.
- Electron's main process and live providers are not in this sandbox. The hub is tested against the documented provider API, not a
  live Guardian.
