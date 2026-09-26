# NEXUS Home — Structure Spec
# Phase 1 — the contract before the build
# Author: James Brooks + Claude
# Date: 2026-06-05
# Supersedes: ui/orchestrator/index.html (system monitor only)

## §ADDENDUM 2026-07-11 — second entry point exists now

This spec describes `ui/home/index.html`, the original monolith — still
current, still accurate for that file. A second, additive entry point now
also exists: `ui/home/nexus-home.html` + `ui/home/shell.js`, built against
`ui/home/DECOMP.md`'s decomposition plan rather than this file's
single-page component tree. It boots the same tv-shell modules (menu,
spotlight, nerve) this spec lists under "COMPONENT TREE", but routes
between real standalone documents under `ui/channels/` via iframe instead
of toggling `.ch` div visibility inside one page. See DECOMP.md's own
2026-07-11 addendum for exactly what's decomposed and what isn't yet.

---



## SISO LAW
The home is a SISO subscriber. It never talks to systems directly.
All reads go through the Orchestrator (:9000) proxy.
All live events arrive via Orchestrator SSE (/sse).
The Orchestrator is the only endpoint the home calls.

## SYSTEM MAP
  Orchestrator  :9000  — root, watchdog, SSE relay, API proxy
  Guardian      :7820  — agent dispatch, Forge IDE (guardian/ui/index.html)
  Cortex        :3748  — memory, RAID, gap detection
  Idearium      :4800  — projects tab (idearium/ui/index.html)
  Bridge        :9999  — relay, P2P
  Emerge        :4242  — compiler, ESS
  Ollama        :11434 — local LLM

## DATA MODELS

### HomeSession (localStorage: nexus_home_session)
{
  version:        string,        // '1.0.0'
  firstRun:       boolean,       // true until setup completes
  setup: {
    complete:     boolean,
    projectsDir:  string,        // path to idearium data dir
    preferredProvider: string,   // 'claude'|'chatgpt'|'ollama'
    completedAt:  number         // epoch ms
  },
  lastState: {
    tab:          string,        // last active tab id
    spec: {
      active:     boolean,
      step:       number,        // wizard step 0-5
      answers:    object         // wizard answers so far
    },
    scrollY:      number
  },
  stats: {
    sessionCount: number,
    lastSeen:     number
  }
}

### ProjectCard (from Idearium /api/idearium/ideas)
{
  uuid:       string,
  title:      string,
  phase:      'seed'|'expanding'|'tensioned'|'specced'|'building'|'complete'|'archived',
  snr:        number,            // 0..1
  spec:       string|null,       // spec uuid if specced
  createdAt:  number,
  updatedAt:  number,
  gapCount:   number,
  tags:       string[]
}

### SystemStatus (from /health)
{
  [systemId]: {
    online:  boolean,
    ms:      number,             // response latency
    label:   string,
    color:   string,
    port:    number
  }
}

## API CONTRACTS (all via Orchestrator :9000)

GET  /health              → SystemStatus
GET  /sse                 → SSE stream (all bus events)
GET  /api/idearium/ideas  → ProjectCard[]
POST /api/idearium/ideas  → { title, phase, tags } → ProjectCard
GET  /api/idearium/specs  → Spec[]
GET  /api/guardian/health → Guardian health (proxied)
GET  /api/status          → full system status

## SSE EVENTS THE HOME SUBSCRIBES TO
  orchestrator.connected       — confirm SSE alive
  orchestrator.watchdog.tick   — system health ticks
  idearium.idea.created        — new project → refresh cards
  idearium.idea.updated        — project updated → refresh card
  guardian.provider.connected  — agent tab came online
  guardian.provider.disconnected
  guardian.job.complete        — job done (show in home activity)
  cortex.gap.found             — gap signal (entropy indicator)

## TAB REGISTRY
  home        — this screen (welcome, spec builder, continue, projects)
  idearium    — iframe: http://127.0.0.1:4800  (Idearium UI)
  guardian    — iframe: http://127.0.0.1:7820/cockpit  (Forge IDE)
  cortex      — iframe: http://127.0.0.1:3748  (Cortex UI)
  bridge      — iframe: http://127.0.0.1:9999  (Bridge UI)
  emerge      — iframe: http://127.0.0.1:4242  (Emerge IDE)
  architect   — future (The Architect spec)

## COMPONENT TREE
  #app
    #particle-canvas        ← WebGL/canvas — space background, alive
    #overlay-scanline        ← subtle scanline overlay
    #topbar
      .logo                  ← NEXUS wordmark
      .system-dots           ← one dot per system (live status)
      #ncp-pill              ← Guardian provider connection state
      #entropy-meter         ← system entropy (from ENTROPY module)
      .nav-tabs              ← tab buttons
    #panels
      #panel-home            ← the welcome/entry screen
        #home-welcome        ← logo, greeting, three entry CTAs
        #home-spec-wizard    ← spec builder (steps 0-5)
        #home-projects       ← recent project cards + add new
        #home-systems        ← system tiles grid
      #panel-idearium        ← <iframe src="http://127.0.0.1:4800">
      #panel-guardian        ← <iframe src="http://127.0.0.1:7820/cockpit">
      #panel-cortex          ← <iframe src="http://127.0.0.1:3748">
      #panel-bridge          ← <iframe src="http://127.0.0.1:9999">
      #panel-emerge          ← <iframe src="http://127.0.0.1:4242">
    #setup-overlay           ← first-time setup modal (blocks until done)
    #toast-root

## FIRST-TIME SETUP QUESTIONS
  1. Projects directory
     → default: data/idearium/projects/
     → ask: "Where should NEXUS store your projects?"
     → validate: writable path
  2. Primary AI provider
     → options: Claude tab / ChatGPT tab / Ollama (local)
     → no API key stored here — provider selection only
  3. (silent) Write HomeSession to localStorage, set firstRun=false

## CONTINUE (event-state resume)
  On open: check HomeSession.lastState
  If lastState.spec.active:
    → restore wizard at lastState.spec.step with saved answers
    → show "Continue your spec" banner
  If lastState.tab !== 'home':
    → offer "Return to [tab]" quick link
  Spec answers are saved to HomeSession on every wizard step

## SPEC BUILDER WIZARD (steps 0-5, mirrors NEXUS v0.53.0 wizard)
  0 → WHO IS THIS FOR?        (personal / team / client)
  1 → WHAT ARE YOU BUILDING?  (name + description)
  2 → WHAT INTERFACE?         (browser / desktop / cli / mobile / api)
  3 → ARCHITECTURE            (single / grouped / modular)
  4 → AMBITION LEVEL          (conventional / unconventional / outlier)
  5 → CONSTRAINTS             (offline / no-deps / encrypted / p2p)

  On finish: POST /api/idearium/ideas with derived project structure
             → redirect to Idearium tab with new project open

## VISUAL LANGUAGE (from NEXUS v0.53.0)
  Fonts:     Bebas Neue (display), DM Mono (mono), Space Grotesk (body)
  Colors:    #00d4ff (cyan), #cc44ff (magenta), #00ff88 (green),
             #f59e0b (amber), #60a5fa (blue), #f472b6 (pink)
  Space:     particle field (stars + nebula blobs), scanline
  Motion:    attractor-based particles, blob drift, pulse on events
  Axiom:     outlier-level beautiful — alive, vibrant, moving
