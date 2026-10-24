# ui/home — Decomposition Map
# Author: James Brooks
# Status: Pre-build spec — map before touching anything
# Date: 2026-06-27

## §ADDENDUM 2026-09-25 (v0.39.228) — read this before the 07-11 addendum

The 07-11 addendum below lists 11 channel documents under ui/channels/. Only
4 exist on disk now: causal, conversations, idearium, log. overview, guardian,
cortex, bridge, diagnose, blueprint and build are gone, and git history
(which starts 2026-09-17) never contained them. So nexus-home.html + shell.js
cannot serve 7 of the 11 channels they register, and the 4 that remain are
July-era inline forks that have drifted from index.html since.

index.html is therefore still the only working home. v0.39.228 split it IN
PLACE instead of cutting over: markup-only index.html, one JS + one CSS file
per area in ui/home/areas/, non-UI modules in ui/home/core/, shared home.css.
The areas map onto this plan's per-channel files (overview.js/.css,
guardian.js/.css, ...), so a later cut-over moves files rather than
re-extracting them. Phase 3 (thin shell via iframes) is not started, and should
not start until the missing channel documents are rebuilt from the areas.

## §ADDENDUM 2026-07-11 — Phase 1 & 2 executed

Phase 1 (extract modules) and Phase 2 (channels as sovereign HTML) below
are done, for the 10 channels this plan named plus `blueprint` (found
inline alongside them, not originally listed but extracted the same way):

  ui/channels/overview/overview.html
  ui/channels/guardian/guardian.html
  ui/channels/cortex/cortex.html
  ui/channels/idearium/idearium.html
  ui/channels/bridge/bridge.html
  ui/channels/log/log.html
  ui/channels/diagnose/diagnose.html
  ui/channels/causal/causal.html          (includes the CG force-graph engine)
  ui/channels/conversations/conversations.html
  ui/channels/blueprint/blueprint.html
  ui/channels/build/build.html            (build.js existed already; the
                                            HTML host it needed never did —
                                            fixed as part of this pass)

Each is a real standalone document (inline JS rather than the plan's
separate .js/.css per channel — functionally sovereign either way, just
not split a second time). Every shell-scope global a channel's extracted
code still referenced (SYSTEMS, railDots, AUTOPILOT_KEY_MAP, CP stub,
flashDot stub, CONTRACT_KEY_MAP, _verifiedSystems, evCount/logFilter_)
was audited call-site by call-site and either given a local definition or
a safe no-op stub — see each channel's own `§SOVEREIGN CHANNEL` comments.

**The bigger gap this closed**: `ui/home/shell.js` already existed,
already implemented `tune()`/`tuneById()`/the SSE wiring DECOMP.md
specifies it should own — but had exactly ONE channel registered
('build'), and nothing on disk ever loaded shell.js at all (no HTML host
existed). Both fixed: `ui/home/nexus-home.html` is that host, and
shell.js's CH_META now lists all 11 channels above with a real rail UI
to switch between them.

**Also fixed, found during the same audit** — `ui/tv-shell/menu.js`,
`spotlight.js`, and `nerve.js` (loaded by shell.js) each expected globals
the old monolith provided by co-location in one script tag
(`window.CH_META`, `window.curCh`, `window.B`) that a real multi-script
shell has to expose explicitly. `nerve.js` also hard-required a
`#nerve-canvas` element with no null-guard — its own markup lives in
`nerve.html`, which nothing was injecting; added to nexus-home.html and
null-guarded nerve.js itself to match the codebase's own established
defensive pattern (see index.html's void-canvas §FIX 2026-06-21). And
`spotlight.js`'s `CP.init()` — wires click-observation and CFR polling —
was defined, returned, but never called by anything; now self-invokes on
DOM-ready.

**Not done — Phase 3 & 4 remain open**: `ui/home/index.html` itself is
untouched (still the full 2788-line monolith, still production traffic,
per this plan's own migration philosophy of proving the decomposed shape
works standalone before cutting the monolith over). No `POST /api/ui/
spotlight/*` HTTP control surface exists yet on the orchestrator side.
Channel functional correctness (does guardian.html's job list actually
render right) is verified by syntax check, dependency-closure audit, and
static-serve reachability — not by a live multi-service NEXUS stack,
which wasn't available to test against in the session that built this.

---

## What exists now

ui/home/index.html — 4032 lines, single monolith
  CSS:      ~620 lines inline
  HTML:     ~900 lines inline (channels, overlays, tiles)
  JS:       ~2500 lines inline (all logic, all state, all data fetching)

Everything is coupled. Nothing is callable by the system.
The system cannot tell the UI to do anything.
The UI cannot be composed into other surfaces.

---

## What it should be

### Shell (stays thin)
ui/home/index.html           — HTML skeleton only. Loads modules. No logic.
ui/home/shell.js             — Channel switching, rail, menu toggle, SSE wire-up
ui/home/shell.css            — Layout only (layers, rail, menu, assistant bar)

### Sovereign modules (each callable, each independent)

ui/copilot/
  copilot.js                 — Input handler, render replies, send to /copilot/prompt
  copilot.css                — Styles for the bar and response area
  API exposed:
    CoPilot.send(prompt)
    CoPilot.receive(text, opts)   — render a response
    CoPilot.spotlight(targets)    — delegate to spotlight module

ui/spotlight/
  spotlight.js               — Pressure/attention system. Zero coupling to home.
  spotlight.css              — .spotlight, .spotlight-rail, @keyframes only
  API exposed:
    Spotlight.on(selector)        — activate spotlight on element
    Spotlight.off(selector)
    Spotlight.clear()
    Spotlight.step(steps[])       — guided step sequence
    Spotlight.tension(map)        — update tension field
  HTTP API (served by orchestrator):
    POST /api/ui/spotlight/on  { target: '#tile-gd' }
    POST /api/ui/spotlight/off
    POST /api/ui/spotlight/step { steps: [] }
    — so any system can direct the UI without touching HTML

ui/channels/
  Each channel is a sovereign HTML document served as an iframe.
  The shell tunes to it. The channel manages itself.

  overview/
    overview.html            — System grid tiles, health polling
    overview.js              — pollHealth(), loadMetrics(), tile click routing
    overview.css

  causal/
    causal.html              — Force graph canvas
    causal.js                — CG object, load(), simulate(), attach()
    causal.css
    API: GET /api/cfr/graph → nodes + edges (already exists in cortex)

  conversations/
    conversations.html       — Co-pilot exchange log
    conversations.js         — convLoad(), render rows
    conversations.css

  guardian/
    guardian.html            — Jobs, providers, dispatch form
    guardian.js
    guardian.css

  cortex/
    cortex.html              — Gaps, failures, memory stats
    cortex.js
    cortex.css

  idearium/
    idearium.html            — Ideas, specs
    idearium.js
    idearium.css

  diagnose/
    diagnose.html            — Diagnostic engines, CFR, gap analysis
    diagnose.js
    diagnose.css

  log/
    log.html                 — Live event stream
    log.js
    log.css

  bridge/
    bridge.html              — Relay nodes, requests
    bridge.js
    bridge.css

  canvas/  (ERAVOS iframe — already sovereign)
    → iframe to /ui/eravos/index.html

  emerge/  (Emerge IDE iframe — already sovereign)
    → iframe to /ui/emerge-ide.html

  agents/  (each agent console already sovereign)
    → iframe to /ui/agents/<provider>/index.html

ui/rewind/
  rewind.js                  — Timeline canvas, snapshot viewer
  rewind.css

ui/mode-selector/
  mode-selector.html         — Provider selection cards
  mode-selector.js           — selectMode(), openModeSelector()
  mode-selector.css

ui/agent-suite/
  agent-suite.html           — Post-selection dashboard
  agent-suite.js             — _bootAgentSuite(), _refreshAgentSuite()
  agent-suite.css

ui/spec-wizard/
  spec-wizard.html
  spec-wizard.js             — wizNext(), wizBuildNext(), _autoBuildLoop()
  spec-wizard.css

---

## What stays in shell.js (and nothing else)

  tune(n)                    — activate channel by index
  tuneById(id)               — activate channel by id
  toggleMenu()               — open/close overlay
  openInspect() / closeInspect()
  connectSSE()               — one SSE connection, dispatches events to channels
  flashDot(src)              — system heartbeat indicator
  pollHealth()               — health checks, update tile status
  CH_META[]                  — channel registry (id, name, accent)
  MODE_CONFIG{}              — provider config map
  P{}                        — port map

  Everything else is in the module that owns it.

---

## What the system gains

1. Cortex can call POST /api/ui/spotlight/on { target: '#tile-gd' }
   → Guardian is spotlit. No JS required anywhere else.

2. Co-pilot replies stream into copilot.js directly.
   The channel doesn't need to know.

3. Each channel can be opened independently in a browser tab for debugging.
   GET http://127.0.0.1:9000/ui/channels/causal/causal.html

4. ERAVOS can embed a channel as an organism.
   An organism wrapper loads ui/channels/cortex/cortex.html.
   It subscribes to the bus. It's just another organism.

5. The spec-wizard, agent-suite, rewind are loadable from anywhere.
   Any page can open them. They don't require home.html to exist.

6. Orchestrator serves the modules. Nothing is bundled.
   `GET /ui/spotlight/spotlight.js` returns the module.
   Any page in the system can import it.

---

## Build order (§3.1 bottom-up)

Phase 1 — Extract modules (no new features)
  1a. ui/spotlight/spotlight.js + css   — extract from lines 2763-3000
  1b. ui/copilot/copilot.js + css       — extract from lines 91-140, 1609, 3000+
  1c. ui/rewind/rewind.js + css         — extract from lines 3167-3225
  1d. ui/mode-selector/*                — extract from lines 922-1038, 3329-3416

Phase 2 — Channels as sovereign HTML
  Each channel becomes its own HTML document.
  Shell switches to it via iframe src change.
  Start with: causal, conversations (simplest, no server deps for skeleton)
  Then: guardian, cortex, idearium, log, bridge, diagnose

Phase 3 — Shell becomes thin
  ui/home/index.html shrinks to <200 lines.
  shell.js owns channel routing only.

Phase 4 — HTTP API for UI control
  POST /api/ui/spotlight/on
  POST /api/ui/spotlight/off
  POST /api/ui/spotlight/step
  → Orchestrator receives, broadcasts via SSE to all connected home UIs
  → spotlight.js subscribes on its own SSE channel

---

## What NOT to do

× Never put data fetching in index.html
× Never put render logic in index.html  
× Never couple two channels to each other
× Never let a channel call another channel directly
× Never let spotlight know about channels
× Never let copilot know about spotlight (it sends commands, spotlight executes)
× Never inline CSS that belongs to a module

---

## Current state of inline logic that needs moving

LINE RANGE   WHAT IT IS              → DESTINATION
13-15        void canvas init        → ui/home/shell.js
16-21        channel CSS             → shell.css
272-350      spotlight CSS           → ui/spotlight/spotlight.css
379-615      channel CSS             → each channel's own .css
619-920      mode/agent CSS          → ui/mode-selector/mode-selector.css
1588-1607    void canvas draw        → ui/home/shell.js (or ui/void/void.js)
1609-1611    get/post/del helpers    → ui/lib/api.js (shared utility)
1650         toggleMenu              → shell.js
1654-1719    tune(), tuneById()      → shell.js
1720-1758    inspect overlay         → shell.js (thin) or ui/inspect/inspect.js
1819-1833    pulseCard               → ui/channels/overview/overview.js
1834-1875    pollHealth              → ui/channels/overview/overview.js
1876-1959    loadMetrics             → ui/channels/overview/overview.js
1960-2005    connectSSE              → shell.js
2006-2034    flashDot                → shell.js
2035-2073    addEvent, log           → ui/channels/log/log.js
2074-2208    guardian functions      → ui/channels/guardian/guardian.js
2209-2261    cortex functions        → ui/channels/cortex/cortex.js
2223-2261    idearium functions      → ui/channels/idearium/idearium.js
2244-2261    bridge functions        → ui/channels/bridge/bridge.js
2262-2360    diagnose functions      → ui/channels/diagnose/diagnose.js
2361-2600    causal graph (CG obj)   → ui/channels/causal/causal.js
2606-2670    conversations           → ui/channels/conversations/conversations.js
2763-3000    spotlight system        → ui/spotlight/spotlight.js
3068-3165    agent suite send        → ui/agent-suite/agent-suite.js
3167-3230    rewind                  → ui/rewind/rewind.js
3329-3460    mode selector           → ui/mode-selector/mode-selector.js
3571-3666    agent forge             → ui/agent-suite/agent-suite.js
3667-3736    logging, forge shell    → shell.js + ui/forge/forge.js
3737-3886    forge tile              → ui/channels/overview/overview.js
3887-4060    spec wizard             → ui/spec-wizard/spec-wizard.js

