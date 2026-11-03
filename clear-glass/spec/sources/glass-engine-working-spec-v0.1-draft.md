# Glass Engine — Working Spec (v0.1, draft)

Working title; name is open. Status: concept stage, nothing built. Origin: design conversation, 2026-10-13, building on Looking Glass (UI renderer and app host) and Clear Glass (Electron-based sovereign browser inside Nexus).

Legend: **DECIDED** = you said it or agreed directly. **PROPOSED** = suggested in conversation, not yet confirmed. **OPEN** = unresolved.

---

## 1. What this is

A from-scratch engine for rendering and running web-style content, owned end to end. It is not a fork or wrapper of any existing engine, and it is meant to go beyond current engines rather than copy their design.

### Goals (DECIDED)

- Completely ours: no Chromium, Gecko, Servo, or Ladybird underneath.
- Invent beyond current engines, not just reimplement what works.
- Powerful: a real engine, not a layer on top of one.

### Non-goals (for now)

- Full web compatibility on day one.
- Passing as a mainstream browser to get through bot defenses (see section 5).
- Writing our own cryptography.

---

## 2. Relationship to existing projects

**Looking Glass** (PROPOSED as the base): its renderer (`wgpu`, SDF shapes, per-layer textures, compositor), typed-data UI, variables and motion, and layer model become the engine's paint backend and native format.

**Clear Glass** (reference, not a base): an Electron app (Chromium inside), v3.22, about 27k lines of JS. Useful ideas to carry over: the gate/stream bus (every behavior is a gate on a stream, no module talks directly to another), per-agent isolated sessions, and the profile model. Its limits are the reason for this project: it is still Chromium underneath, its fingerprint spoofing is a JS-level layer that cannot hide engine-level quirks, and its TLS proxy (Node `tls.connect()`) likely cannot control ClientHello extension order, so the Firefox JA4 claim is probably not achieved (untested).

---

## 3. Core bets (PROPOSED, to confirm)

These are the breaks from current engines. Bets 1 to 3 define the architecture and are hard to retrofit; 4 to 6 build on them.

### 3.1 Native typed format, HTML as a frontend

The engine's real input is a typed scene tree with variables (Looking Glass's model). HTML and CSS become one optional frontend that compiles into that tree. This removes the DOM/CSSOM/JS entanglement at the root.

### 3.2 Reactive layout

Every property is a literal or a variable reference. Layout is a dataflow graph: changing one value recomputes only what depends on it, instead of invalidation-driven reflow passes. Animation becomes cheap and does not cause jank.

### 3.3 Capabilities instead of same-origin policy

Every layer is an isolated actor with an explicit grant of what it can read, draw, or call. Security is built in from the start rather than retrofitted.

### 3.4 Deterministic and replayable

Same input event stream gives the same pixels. Recording the stream gives time-travel debugging, crash replay, and page snapshots.

### 3.5 Semantic tree as the source of truth

Every element declares what it means (button, price, form field, list item) in the data itself, and visuals are generated from that. The meaning is the real page and the pixels are one rendering of it. Accessibility tools and AI agents read the tree directly instead of scraping tags, class names, or pixels, which is what Clear Glass's `dom.query` and `dom.tokens` currently do fragilely.

### 3.6 No ambient fingerprint surface

Pages cannot quietly query fonts, canvas readback, GPU details, or screen specifics. A layer can read only what it was explicitly granted. Nothing to measure means nothing to fingerprint, and there are no lies to keep consistent. Trade-off: legitimate features such as a drawing app reading back its own canvas need an explicit grant.

---

## 4. Architecture

### 4.1 Event bus and gate pipeline (DECIDED direction)

The engine is built around an **event bus**. Every stage (net, parse, style, layout, paint, input) is a gate: a component that subscribes to topics, transforms state, and publishes events. Gates never call each other; they communicate only through bus messages, so any stage can be swapped, observed, recorded, or replayed. The append-only bus log is the timeline (section 39). Per-frame hot paths (layout solve, paint, GPU) run directly and exchange only coarse events with the bus (section 39.9).

### 4.2 Pipeline stages

1. **Net:** HTTP/1.1 first, then HTTP/2. TLS through an existing library such as `rustls`.
2. **Frontends:** the native format loader first; an HTML parser and tree builder following the WHATWG spec later.
3. **Style:** CSS parser, selectors, cascade, computed values (compatibility frontend only).
4. **Layout:** reactive dataflow engine; block and inline flow, then flexbox. Grid and floats come later.
5. **Paint:** display list drawn through the Looking Glass renderer. Text shaping through a library at first (FreeType and HarfBuzz, or `cosmic-text`).
6. **Script:** a small interpreter, last. This is the biggest cliff. Bind the scene tree only once the interpreter works.

### 4.3 Layers

As in Looking Glass: one layer to start, added at runtime, each with depth, bounds, an owner, a lifecycle policy, and its own texture. Layer names are conventions, not engine types.

---

## 5. Identity, privacy, and the open web

A client that reveals nothing is rare among real users, and a brand-new engine's TLS and HTTP/2 handshake matches no known browser. Bot-management systems such as Cloudflare will often challenge or block such a client. "Reveal nothing" and "be treated as a normal visitor" pull in opposite directions.

Position (PROPOSED): **private by default, provably human when you choose to be.**

- **Honest identity:** the engine identifies itself truthfully and does not impersonate another browser.
- **Privacy-preserving attestation:** support mechanisms such as Privacy Pass and Private Access Tokens, so a client can prove a real device and human is behind it without handing over a fingerprint.
- **Signed bot identity:** for automated use, support verified-bot and signed-request schemes (such as Web Bot Auth) so automation is recognized openly.
- **Target pages that welcome the engine:** your own apps and services never hit this problem.

The Clear Glass approach of spoofing a mainstream browser is explicitly not carried over.

---

## 6. Build plan (smallest slice first)

Each phase must pass its exit test before the next starts.

| # | Phase | Delivers | Exit test |
| --- | --- | --- | --- |
| 0 | Foundations | Workspace, language, repo layout | Builds one binary that starts and exits |
| 1 | Window + rectangle | Borderless GPU window drawing one rectangle from data | Editing the data changes the rectangle; resize stays sharp |
| 2 | Scene tree + variables | Typed elements, bindings, reactive layout core | A variable change updates only dependent nodes |
| 3 | Net | HTTP/1.1 + TLS fetch | Fetches a page and a resource reliably |
| 4 | HTML frontend | Tokenizer and tree builder into the scene tree | A static page parses to the correct tree |
| 5 | Style and layout | CSS cascade, block/inline flow, flexbox | A plain static page renders correctly |
| 6 | Capabilities | Per-layer grants, gated readback and enumeration | A layer cannot read what it was not granted |
| 7 | Record and replay | Event-stream capture, deterministic playback | A recorded session replays pixel-identical |
| 8 | Semantic layer | Meaning tree exposed to agents and accessibility | An agent queries "the price" with no scraping |
| 9 | Script | Small interpreter, scene-tree bindings | A page runs a script that changes the tree |
| 10 | Attestation | Privacy Pass / token support | A challenge is answered without a fingerprint |

**First milestone (PROPOSED):** fetch a plain static page and render it with no JavaScript. Small enough to finish, and it proves the pipeline end to end.

---

## 7. Language and tools (PROPOSED)

Rust. `winit` and `wgpu` for window and GPU, `rustls` for TLS, a shaping library for text, `serde` for data. Test against the Web Platform Tests and the Acid tests for the HTML frontend. Windows first, with a thin platform layer so other systems can follow.

---

## 8. Open questions

1. **Name** for the engine.
2. **Confirm the six core bets.** Which are in the core and which ride on top? (Suggested: 1 to 3 core, 4 to 6 on top.)
3. **Is this one project with Looking Glass, or a sibling that reuses its renderer?**
4. **Scripting:** write a small interpreter or embed one? How early?
5. **Compatibility target:** which pages must work first? A named target list is more useful than "the web."
6. **Threads or processes per layer** (carried over from Looking Glass).
7. **Native format:** JSON first, or a purpose-built binary format later?
8. **Attestation scope:** which mechanisms first, and who is the first relying party?

---

## 9. Risks

- **Scope:** an engine, a renderer, a script runtime, and an HTML frontend are each large. Mitigation: add a piece only when the previous one works.
- **Compatibility:** existing sites will not run natively, and the HTML frontend will lag the real web for a long time.
- **Security:** a new engine means new vulnerabilities. Mitigation: capability model from day one, memory-safe language, no custom crypto.
- **Bot defenses:** the engine will be challenged or blocked by some sites. Mitigation: honest identity and attestation, not impersonation.
- **Abstraction without a target:** designing in the abstract tends to fold back on itself. Keep a concrete first milestone in view.

---

# Part II — Compatibility-Maximal Expansion (v0.2)

This part supersedes the v0.1 non-goal of 'full web compatibility on day one.' Compatibility is now a first-class goal: **as much of the real web as possible, with an architecture that is better than any engine that serves it today.** Where Part I and Part II disagree, Part II wins. Status labels (DECIDED / PROPOSED / OPEN) apply as before; everything new here is PROPOSED until confirmed.

---

## 10. Strategy: two worlds, one substrate

The engine has two content worlds that share one core:

- **Native World:** the typed scene graph, variables, reactive layout, and semantic tree from Part I. Content built for the engine is maximally fast, safe, and meaningful.
- **Web World:** a full standards implementation (HTML, CSS, DOM, JS, Web APIs) that **compiles down to the same scene graph.** A web page is not a separate subsystem, it is one more producer of scene nodes.

Because both worlds meet in the substrate, they can be mixed: a native dashboard panel can sit inside a web page, a web article can sit inside a native layer, and both are styled, animated, recorded, replayed, and permissioned by the same machinery. Compatibility stops being a bolt-on and becomes a frontend.

**Design rule:** nothing in the substrate may be shaped by web legacy. Web legacy is translated at the edge.

---

## 11. Compatibility tiers and the Compat Router

Every page or frame is served by the lowest tier that renders it correctly. Tiers are ordered by how much of the stack we own.

| Tier | What serves it | Owned by us | Used when |
| --- | --- | --- | --- |
| 0 | Native format | 100% | Content built for the engine |
| 1 | Own standards engine (Web World) | 100% | Pages within current conformance coverage |
| 2 | Quirks and shim layer | 100% | Pages that rely on legacy behavior (quirks mode, vendor prefixes, old APIs) |
| 3 | Embedded legacy engine, sandboxed as a single layer | Host only | Pages that fail Tiers 0 to 2 (heavy DRM video, exotic APIs, broken-by-design sites) |

**Compat Router.** A gate in the stream that picks the tier per site and per frame:

1. Start at Tier 1. Run the page.
2. Watch for failure signals: unimplemented API calls, script errors on load, layout invariants violated, user-reported breakage, and a local record of past results for that origin.
3. Escalate to the next tier and remember the decision for that origin. Re-test periodically so sites migrate back down as conformance improves.
4. Show the tier in the UI, always. The user can pin a site to a tier or turn Tier 3 off for a pure-sovereign mode.

**Tier 3 rules:**

- It is a normal layer with its own capability grants, not a back door into the host. It renders to a texture the compositor treats like any other layer.
- It is optional and replaceable (a system webview now, anything later). The engine must run fully without it.
- Identity stays honest everywhere (section 17).
- Honest note: DRM-protected media (EME) requires licensed content decryption modules and will, for the foreseeable future, only work through Tier 3.

This is how 'as much compatibility as possible' becomes practically reachable early: Tier 3 catches the long tail while Tiers 1 and 2 grow.

---

## 12. Standards coverage matrix

Priority P0 = needed for the first useful web pages. P1 = needed for most modern sites. P2 = needed for apps and rich sites. P3 = long tail.

| Area | Scope | Priority |
| --- | --- | --- |
| HTML | WHATWG parser, tree builder, forms, tables, templates, microdata, quirks mode | P0 |
| CSS core | Cascade, specificity, inheritance, selectors L3 and L4, units, calc, custom properties | P0 |
| CSS layout | Block, inline, floats, positioning, flexbox | P0 |
| CSS layout (modern) | Grid, subgrid, multicolumn, tables, container queries, logical properties | P1 |
| CSS visual | Transforms, transitions, animations, filters, gradients, masks, blend modes, scroll snap | P1 |
| Text | Shaping, bidi, line breaking, variable and color fonts, WOFF2, emoji, vertical writing | P1 |
| DOM | Core, events, mutation observers, shadow DOM, custom elements, ranges, selection | P0 |
| JavaScript | Modern ECMAScript, modules, async, generators, proxies, BigInt, regex, Intl | P0 |
| Networking | HTTP/1.1, HTTP/2, HTTP/3, TLS 1.3, fetch, XHR, WebSocket, CORS, CSP, cookies, cache | P0 to P1 |
| Storage | localStorage, sessionStorage, IndexedDB, Cache API, cookies | P1 |
| Workers | Web Workers, shared workers, service workers, worklets | P1 to P2 |
| Graphics | Canvas 2D, SVG, WebGL, WebGPU, OffscreenCanvas | P1 to P2 |
| Media | video and audio elements, MSE, Web Audio, codecs through OS decoders | P2 |
| Real-time | WebRTC, media capture | P2 |
| WebAssembly | Core, threads, SIMD | P1 |
| Platform APIs | Permissions, clipboard, notifications, credentials, payments, geolocation, gamepad, share | P2 to P3 |
| Accessibility | ARIA mapping, platform accessibility trees, focus and keyboard navigation | P1 |
| Security | Same-origin and CORS semantics, CSP, SRI, secure contexts, mixed content | P0 |

---

## 13. Conformance and proof

Compatibility claims must be measured, not asserted.

- **Web Platform Tests** are the main scoreboard for HTML, CSS, DOM, and APIs, tracked per area.
- **test262** for the JavaScript engine.
- **Acid tests and CSS conformance suites** as quick smoke checks.
- **Real-site corpus:** a curated list of pages with recorded sessions. Because the engine is deterministic and replayable (bet 3.4), every site in the corpus is a reproducible regression test, not a manual check.
- **Public compat dashboard:** per-area pass rates, per-site tier assignments, and trends over time.
- **Targets are targets, not promises.** They are set per milestone in section 18.

---

## 14. Web World internals (re-imagined, not copied)

**Living DOM.** DOM nodes are backed by scene nodes. The DOM API is a facade over the substrate, and every mutation becomes a typed event on the stream, so mutation is observable, recordable, and replayable by construction.

**Reactive CSS.** The cascade is resolved into a dependency graph rather than recomputed in bulk. Custom properties map directly to substrate variables. CSS transitions and animations compile to springs and tweens. A style change recomputes only what depends on it.

**Layout.** A constraint-dataflow engine with specialized solvers per mode (block, inline, float, flex, grid, table, multicolumn, positioned). CSS containment is used as an explicit parallelism hint: contained subtrees become layout islands that solve on separate threads.

**JavaScript.** Staged to unlock compatibility early:

1. Embed a proven small engine behind a clean interface so web pages run on day one.
2. Build our own bytecode VM with a precise garbage collector.
3. Add a baseline JIT, then an optimizing JIT.
4. Each JS realm maps to a capability layer. A deterministic mode virtualizes time and randomness (`Date`, `performance.now`, `Math.random`) for replay.

**Networking.** HTTP/1.1, 2, and 3 (QUIC), TLS 1.3 through a vetted library, a shared cache with content addressing, partitioned cookies, CORS, CSP, and service workers. DNS over HTTPS is available as an option.

**Text.** Shaping and bidi through proven libraries first, then owned in the long run. Full Unicode line breaking, variable and color fonts.

**GPU.** One `wgpu` path. WebGPU maps almost directly. WebGL is implemented as a translation layer over `wgpu`. Canvas 2D and SVG paint through the same compositor.

**Media.** Decoding through OS codecs by capability grant; own decoders only later and only where licensing allows.

**Storage.** Per-origin, partitioned by default, encrypted at rest, content-addressed where possible.

---

## 15. Beyond current engines: the inventions

These are the features no mainstream engine has, and the reason to build this instead of forking one. Each one follows from the substrate (scene graph, variables, event stream, capabilities), which is why they cannot be retrofitted onto an existing engine.

### 15.1 Semantic Lift

The weakness of the semantic tree (section 3.5) is that legacy pages do not declare meaning. Semantic Lift infers it. It combines ARIA roles, microdata and JSON-LD, form semantics, document outline, and local heuristics (optionally a small on-device model) to produce a semantic tree for any web page, with a **confidence score per node**. Native content has confidence 1.0. Agents and accessibility tools read the same tree regardless of where it came from, and low-confidence nodes are flagged rather than trusted.

### 15.2 Rewind and Fork

Because the event stream is deterministic, any session is a timeline. The user can scrub a page backward, inspect the exact state at any moment, and **fork** it: branch the page at a point in time and try a different action. Bug reports become a single replayable file. Developers get time-travel debugging with no instrumentation.

### 15.3 Glass materials and real depth

Building on Looking Glass: layers are not flat sheets. The compositor has a material system (frosted, refractive, tinted, shadowed, depth-of-field) and true depth ordering with optional parallax. Any page, web or native, can be rendered with spatial depth: dialogs float above content, background layers blur by distance, and motion stays physically coherent. This is a visual identity as well as a feature.

### 15.4 Wires

Variables are first-class, so the user can connect them. A **wire** binds one element's output to another's input (a slider to a chart's range, a form field to a filter, a data feed to a gauge) across layers and even across origins when capabilities allow. Pages become live dataflow compositions that people can rewire without writing code.

### 15.5 Lenses

A **lens** is a typed transform over the scene graph, applied at render time: true dark mode, density changes, large-text reflow, translation, clutter removal, reading mode, color-blind palettes. Because it operates on structured nodes instead of patching CSS, it is reliable, reversible, shareable, and permissioned. Lenses are the safe replacement for injected stylesheets and userscripts.

### 15.6 Agent Port

A typed interface for AI agents and automation, built on the semantic tree: **query** meaning, **act** on semantic nodes (activate, fill, select), **observe** changes. Agents get their own capability grants, separate from the user's, and every action is logged and replayable. This replaces the scraping approach used in Clear Glass's driver with something stable and auditable.

### 15.7 Gate extensions

Extensions are gates in the stream, in the Clear Glass tradition, with explicit capability grants. There is no 'read and change all sites' permission. Compatibility with the WebExtensions API ships as a translation layer so existing extensions can run with narrowed grants.

### 15.8 Glassfile

A **Glassfile** is a single content-addressed bundle containing a page, its resources, and its event timeline. It opens offline, replays exactly, deduplicates shared resources by hash, and can be signed. It is the unit for archiving, sharing, bug reports, and reproducible tests.

### 15.9 Adaptive scheduler

Each layer has a frame budget and a priority. The scheduler degrades quality gracefully (lower blur resolution, paused offscreen animation, deferred layout) to protect input latency. Offscreen and background layers idle or unload per their lifecycle policy, so a heavy page cannot starve the foreground.

### 15.10 One engine, many surfaces

The same engine renders to a window, an overlay, a full-screen shell, or a TV-style interface (Nexus already includes a TV shell concept), and later to spatial and head-mounted displays. Surfaces are outputs of the compositor, not separate products.

---

## 16. Security and process architecture

- **Memory-safe core** in Rust, with an explicit budget for `unsafe` code that is reviewed and documented.
- **Process model:** a small trusted host (UI, compositor, capability broker) and sandboxed workers for layout, script, network, and decode. Site and layer isolation by default, so a compromised page cannot read another origin.
- **Typed IPC** only. No shared mutable state across the trust boundary.
- **OS sandboxing:** job objects and AppContainer-style restriction on Windows, namespaces and seccomp on Linux, sandbox profiles on macOS.
- **Capabilities** (bet 3.3) are enforced in the broker, not in the page. Granting is explicit, scoped, revocable, and logged.
- **Fuzzing from day one** for every parser (HTML, CSS, JS, network, fonts, images), with continuous fuzzing in CI.
- **Supply chain:** pinned dependencies, vendored critical libraries, reproducible builds.
- **Privacy defaults:** partitioned storage, third-party tracker blocking by structure (not just lists), no ambient fingerprint surface (bet 3.6), and Privacy Pass support for proving humanity without identifying.

---

## 17. Identity and web compatibility, honestly

Many sites sniff the user agent and break on unknown ones. The answer is neither silence nor impersonation.

- **Honest product token.** The engine sends the standard legacy prefix that every browser uses for historical reasons, plus its real name and version (for example `GlassEngine/1.0`). It does not claim to be Chrome, Firefox, or Safari.
- **Client Hints and feature detection** are implemented truthfully, so well-written sites adapt to what the engine actually supports.
- **Per-site compatibility notes** are kept in the Compat Router, so a site that needs a workaround gets Tier 2 shims, not a lie about identity.
- **Attestation** (Privacy Pass, Private Access Tokens) and **signed bot identity** (Web Bot Auth) are supported for sites that challenge new or automated clients.
- Some sites will still block unknown engines. That is their right, and the path through it is attestation and the Tier 3 fallback, not spoofing.

---

## 18. Revised roadmap (compatibility milestones)

This replaces the phase table in section 6 for planning purposes. Pass-rate figures are PROPOSED targets to be calibrated once a baseline exists.

| Milestone | Delivers | Exit test |
| --- | --- | --- |
| M0 Foundations | Workspace, CI, fuzz harness, window and GPU surface | One binary starts, draws, exits |
| M1 Native core | Scene graph, variables, reactive layout, Looking Glass renderer | Data edits update only dependents; resize stays sharp |
| M2 Net and static web | HTTP/1.1, TLS, HTML parser, basic CSS, block and inline layout | Static pages render; first real-site corpus entries pass |
| M3 Modern layout | Flexbox, grid, floats, positioning, text shaping, fonts | Common marketing and article sites render correctly |
| M4 Script | Embedded JS engine, DOM facade, events, fetch, forms | Interactive pages work; test262 baseline recorded |
| M5 Compat Router and Tier 3 | Router, shims, sandboxed legacy layer | Long-tail sites load, with the tier shown to the user |
| M6 Capabilities and replay | Broker, grants, record and replay, Glassfile | A recorded session replays pixel-identical |
| M7 Semantic Lift and Agent Port | Meaning tree for web pages, typed agent interface | An agent completes a task on a real site with no scraping |
| M8 Rich platform | Workers, storage, canvas, SVG, WebGL and WebGPU, WebAssembly | Rich web apps run; WPT pass rates tracked per area |
| M9 Media and real-time | Codecs through OS, MSE, Web Audio, WebRTC | Video and calling sites work |
| M10 Own the script engine | Own VM, then baseline JIT | Embedded engine retired behind the same interface |
| M11 Extensions, lenses, wires | Gate extensions, lens store, user dataflow | Extensions and lenses installable with narrowed grants |
| M12 Attestation and hardening | Privacy Pass, signed bot identity, external security review | Challenges answered without fingerprints |

---

## 19. Honest limits

- **Complete parity with Chromium is a multi-year, multi-team effort.** The router and Tier 3 make the engine useful long before then, but they do not remove that gap.
- **DRM media** needs licensed modules and will depend on Tier 3.
- **JS performance** will trail V8 until the JIT stages land.
- **Semantic Lift is probabilistic.** It is better than scraping and worse than native declaration.
- **Anything shipped before external security review should be treated as unhardened.**
- Scope discipline is the main risk. The order in section 18 exists so that every milestone ends with something that works.

---

## 20. Open questions (v0.2)

1. **Tier 3 backend:** which legacy engine or system webview, and is a pure-sovereign mode a launch requirement?
2. **First embedded JS engine:** which one, and on what timeline do we replace it?
3. **Which two or three compatibility categories matter most first** (articles, web apps, dashboards, video)?
4. **Extension story:** WebExtensions translation first, or gate-native only?
5. **Semantic Lift:** heuristics only, or an on-device model, and what confidence threshold is safe for agents to act on?
6. **Glassfile format:** open and documented from the start?
7. **First surface:** desktop window only, or TV shell too?
8. **Name** for the engine (still open from Part I).

---

# Part III — Agents, Orchestration, Automation, Macros (v0.3)

This part makes **automation the primary use case** of the engine. Chrome and Firefox were built for a human looking at a page; agents, macros, and orchestration are where that design hurts most and this one helps most. Everything here sits on the substrate from Parts I and II (scene graph, event stream, capability broker, semantic tree). Status: PROPOSED.

**v0.4 change:** the Agent Port, orchestration, and audit are now defined on the Event Bus (section 39). Where sections 22 to 38 describe verbs as calls, read them as command topics with correlated result events; call-and-response survives only as a thin convenience layer.

---

## 21. Scope and goals

**Goals**

- Agents and macros are first-class citizens of the engine, not tools poking it from outside.
- Automation survives site redesigns because it targets meaning, not markup.
- Every run is recorded, replayable, auditable, and safe by default.
- One system covers the whole range: one-click macros, scheduled jobs, single agents, and teams of agents under a supervisor.

**Non-goals**

- Automating consumer chat products through their web interfaces against their terms (see section 27).
- Defeating bot defenses (see section 29).
- Replacing the model providers. The engine hosts and governs agents; it does not train them.

---

## 22. Concept model

| Concept | Meaning |
| --- | --- |
| Agent | An actor with an identity, a set of capability grants, a model or script driving it, and its own isolated session |
| Session | An agent's private world: layers, storage, cookies, secrets, and timeline |
| Task | A unit of work with an objective, inputs, constraints, and a budget |
| Plan | An ordered or branching set of intended steps, produced by a person, a macro, or a model |
| Macro | A reusable, typed, parameterized program of steps with triggers and declared capabilities |
| Step | One typed operation: navigate, query, act, extract, assert, wait, call, branch, and so on |
| Trigger | What starts a macro or task: schedule, URL match, data change, webhook, manual, another agent |
| Wire | A live binding from one variable or event to another (section 15.4 of Part II) |
| Run | One execution of a task or macro, with a full timeline |
| Timeline | The recorded, replayable event stream of a run |
| Supervisor | An agent that spawns, routes, monitors, and ends other agents |
| Blackboard | A scoped, typed shared state that agents in a team can read and write |
| Vault | Encrypted secret and session storage; secrets never enter a model's context |
| Policy | Rules that allow, deny, or require approval for classes of action |
| Artifact | An output of a run: extracted data, files, screenshots, reports |

---

## 23. System map

Every layer is a participant on the Event Bus (section 39). Layers never call each other directly: they publish and subscribe to topics within their grants, and the broker enforces ordering, access, and logging.

```
          AGENTS / MACROS / HUMANS / EXTERNAL BRIDGES (MCP, BiDi, local API)
                          | publish / subscribe, within grants
=============================== EVENT BUS ===============================
 topics   cmd.* intents   evt.* facts   qry.* reads   chan.* agent channels
 envelope id, correlation, causation, agent, grant, taint, idempotency key
 broker   topic ACLs, schema checks, per-partition order, backpressure,
          append-only log (the timeline)
==========================================================================
 L7 authoring and observability     L6 governance     L5 intelligence adapters
 L4 orchestration                   L3 automation core
 L2 Agent Port (topic facade)       L1 agent runtime
 L0 substrate gates: net, parse, style, layout*, paint*, input
    (* hot paths run directly and report coarse events only)
```

External interfaces are bridges that translate to and from bus topics (section 39.10): an MCP server, a WebDriver BiDi and CDP compatibility shim, a local API with event streaming, and SDKs (section 32).

---

## 24. Agent Port (L2)

The Agent Port is the bus's public face for seeing and acting: a set of command, query, and event topics (section 39) used by every agent, macro, and external tool. A call-and-response wrapper exists for convenience; underneath, each call is a command message answered by a correlated result event.

### 24.1 Verbs

| Verb | What it does |
| --- | --- |
| `query` | Find nodes by role, name, value, state, relationships, or text. Returns nodes with stable ids and confidence |
| `read` | Get a node's value, state, text, table contents, or children |
| `act` | Activate, fill, select, toggle, focus, scroll, drag, upload, press keys |
| `navigate` | Open a URL, go back or forward, reload, open or close a layer |
| `observe` | Subscribe to changes with filters; receive diffs, not full snapshots |
| `wait` | Block until a predicate on the tree, network, or time holds |
| `extract` | Pull typed data against a schema (for example a product with name, price, currency) |
| `assert` | Check a condition and fail the step with evidence if it does not hold |
| `see` | Fallback: capture pixels or a region for visual reasoning |
| `eval` | Run script in the page realm (capability-gated, off by default) |
| `batch` | Run several verbs as one transaction with a shared timeout |

### 24.2 Addressing

Selectors are semantic: `{role: button, name: 'Place order', within: {role: form, name: 'Checkout'}}`. Nodes carry **stable semantic ids** that persist across re-renders of the same meaning. Selectors resolve through a **fallback ladder**:

1. Semantic match with high confidence.
2. Semantic match with relaxed constraints (fuzzy name, nearby label).
3. Structural path from a recorded run.
4. Visual match.
5. Ask a human or a supervising agent.

Each rung down lowers confidence; policy decides how far a task may fall before it must pause.

### 24.3 Results

Every command is answered by a result event, tied to it by correlation id, that carries an envelope: status, value, **confidence**, **evidence** (a pointer into the timeline, with the tree and optional pixels at that moment), and a failure class when it fails.

### 24.4 Failure classes

Not found, ambiguous, disabled, not visible, blocked by policy, timeout, navigation changed, page error, network error, challenge detected (bot defense), low confidence. Each class has a default recovery (retry, wait, re-query, escalate, abort) that a macro can override.

### 24.5 Observation efficiency

The semantic tree is compact, so observations are small. Agents receive **diffs** by default, which is cheaper in model tokens and faster than raw HTML or screenshots.

---

## 25. Macros and the automation core (L3)

### 25.1 Macro anatomy

A macro is a typed document:

- **Header:** name, version, author, description, trust level.
- **Parameters:** typed inputs with defaults and validation.
- **Capabilities required:** the exact grants it needs, shown to the user before it runs.
- **Steps:** a graph of typed step nodes.
- **Outputs:** typed artifacts it produces.
- **Triggers:** optional start conditions.
- **Tests:** replay fixtures (Glassfiles) with expected outcomes.

### 25.2 Step catalog

| Group | Steps |
| --- | --- |
| Navigation | open, back, reload, switch layer, close |
| Interaction | click, type, select, toggle, scroll, drag, upload, press key, hover |
| Reading | read, extract, table to rows, screenshot, download, save artifact |
| Waiting | wait for node, wait for network idle, wait for text, wait for time, wait for event |
| Logic | if, else, loop over, while, parallel, race, try and recover, retry with backoff, stop |
| Data | set variable, transform, map, filter, join, format, parse, validate against schema |
| Calls | run macro, call agent, call model, call API, send message, notify |
| Human | ask, approve, choose, hand over control, wait for human |
| Assert | assert node, assert value, assert no error, checkpoint |
| System | log, metric, sleep, schedule, emit event |

### 25.3 Recording and generalization

The **recorder** watches a human session and produces a macro. It does not store raw coordinates or CSS paths. It converts each action into a semantic step, lifts literals into parameters when they look variable (a search term, a date), and attaches fallback evidence. The user edits the result in the step editor.

### 25.4 Execution modes

- **Strict replay:** repeat the recorded timeline exactly. Used for tests and reproduction.
- **Adaptive:** follow the macro, resolving selectors live through the fallback ladder.
- **Agentic:** a model plans and acts within the macro's declared capabilities, using steps as tools.
- **Dry run:** simulate every act without committing anything; return what would happen.

### 25.5 Triggers

Schedule (cron and calendar), URL match (visiting or loading a pattern), data change (a wire fires), event (another macro or agent emits), webhook or local API call, manual or hotkey, system (startup, idle, network change).

### 25.6 Composition, versioning, sharing

Macros call macros. Versions are immutable and content-addressed; a run records exactly which versions it used. Shared macros are signed packages with declared capabilities, so a downloaded macro cannot ask for more than it states.

### 25.7 Self-healing

When a step fails, the engine tries the fallback ladder, then proposes a **patch** (an updated selector with evidence). Patches are suggestions that a person or a policy-approved supervisor accepts, so macros improve without silently drifting.

---

## 26. Orchestration (L4)

### 26.1 Supervision tree

Agents form a tree. A **supervisor** owns the lifecycle of its children: spawn, pause, resume, cancel, restart on failure, and propagate budgets and cancellation downward. Failures escalate upward by policy.

### 26.2 Roles

Planner, worker, verifier, reviewer, router, scribe (records and summarizes), and human proxy. A role is a template of grants plus a prompt or script, not a special engine type.

### 26.3 Coordination patterns

Pipeline, fan-out and fan-in, race (first success wins), consensus (several agents vote), supervisor and worker, plan then execute then verify, debate, and human in the loop. Patterns are macros, so they can be edited and shared like any other.

### 26.4 Queues and routing

A durable task queue with priorities, leases, retries with backoff, idempotency keys, and a dead-letter queue. The **router** assigns tasks by capability, health, cost, latency, and recent success rate (the idea behind Clear Glass's RAID routing, made first-class).

### 26.5 Pools and warm starts

Pre-warmed agent sessions are kept per role and per site category so tasks start fast, and are recycled or destroyed by lifecycle policy to bound resource use.

### 26.6 Shared state and messaging

Agents talk through **typed channels** and a scoped **blackboard**. Nothing is shared implicitly: an agent sees only the channels and keys it was granted. Messages are events on the stream, so they are recorded and replayable.

On the bus, channels are topics (`chan.<team>.<name>`), the blackboard is a keyed state topic with compaction, and the task queue (section 26.4) is a consumer group with leases (section 39.6).

### 26.7 Budgets and limits

Every task and agent carries budgets: wall time, actions, pages, network bytes, model tokens, and money. Exceeding a budget pauses the run and escalates.

### 26.8 Checkpoint and resume

Because runs are timelines, any run can be checkpointed, survive a crash or restart, and resume from the last good point. A long task can also be forked to try an alternative.

---

## 27. Intelligence adapters (L5)

- **Provider-agnostic Model Adapter.** One interface for hosted models through their official APIs and for local models (the Nexus stack already includes an Ollama integration). Tool schemas are generated from the Agent Port verbs.
- **Official access only.** Agents reach models through APIs and local runtimes. The engine does not automate consumer chat websites in ways their terms forbid, which is a departure from Clear Glass's mesh.
- **Memory.** A scratchpad per task, run memory per agent, and an optional long-term store, all capability-scoped and inspectable.
- **Context shaping.** Observations are semantic diffs, long histories are summarized, and large artifacts are passed by reference rather than inlined.
- **Structured output.** Plans, extractions, and decisions are validated against schemas before they can drive an action.

---

## 28. Governance and safety (L6)

Agents that act are only useful if they are safe to leave running. Governance is part of the engine, not an add-on.

### 28.1 Capability tiers

Grants are layered, so each tier includes only what it names:

1. **Observe:** read the tree of allowed origins.
2. **Interact:** click, type, and navigate within allowed origins.
3. **Submit:** send forms and make state-changing requests.
4. **Spend or destroy:** payments, deletions, irreversible sends.
5. **Extend:** install macros or extensions, change policy.

A task declares the highest tier it needs. Defaults are low.

### 28.2 Policies

Rules of the form: for this origin, this action class, this data class, **allow, deny, or ask**. Policies are layered (user, organization, task) with the most restrictive winning. Policies are data, so they are reviewable and versioned.

### 28.3 Approvals

When policy says ask, the run pauses and shows the person exactly what will happen: the action, the target node, the evidence snapshot, and the expected effect. Approval can be once, for this run, or remembered under a scope. Irreversible actions always require explicit approval unless a policy states otherwise.

### 28.4 Prompt-injection defense

Pages can contain text written to hijack an agent. The engine treats this as a structural problem:

- **Taint tracking.** Text that originates from page content is tagged untrusted. Untrusted text is data and is never merged into instructions, system prompts, or policy.
- **No privilege from content.** A tainted value cannot raise a grant, change a policy, or add a tool.
- **Action allowlists per task.** An agent can only perform the verbs and target classes its task declared, so an injected 'also email this file' has nothing to call.
- **Cross-origin data fences.** Data read from one origin is not sent to another origin by an agent unless a grant allows that flow.
- **Verifier agents** can independently check high-risk actions against the original task.

This lowers risk substantially but does not eliminate it, which is why approvals and budgets stay in place.

### 28.5 Secrets and the vault

Credentials and session tokens live in the vault. They are injected by the broker at act time (for example when filling a password field) and **never enter a model's context or a log**. Agents see a reference such as `secret:bank/login`, not the value. Session state is encrypted at rest and scoped per agent.

### 28.6 Audit

An append-only, signed log of every action: who (agent and macro version), what, where, when, which grant authorized it, and the evidence pointer. Because runs are timelines, the audit trail is replayable, not just readable.

The audit log is a signed, filtered projection of the bus log (section 39.7), not a separate store.

### 28.7 Limits and the kill switch

Rate limits per origin, concurrency caps, budgets (section 26.7), and a global and per-agent **kill switch** that revokes grants and halts runs immediately.

### 28.8 Trust levels for macros

Unsigned, signed, reviewed, and organization-approved. Higher levels may request higher capability tiers and run unattended. A macro's declared capabilities are shown at install and enforced at run time.

---

## 29. Identity and third-party sites

- Each agent has an honest, distinct identity. No impersonation of a human browser.
- **Prefer APIs.** Where a site offers an official API, the agent uses it instead of the interface.
- **Attestation and signed identity** (Privacy Pass, Web Bot Auth) are used so sites can verify an automated client openly.
- **Politeness:** respect robots directives and published automation policies, rate limit by default, back off on challenges.
- **Challenge handling:** if a challenge appears, the run pauses and hands control to a person. It does not attempt to solve or evade it.
- **Your own apps and services:** no friction. This is where the platform is strongest first.

---

## 30. Authoring and observability (L7)

| Surface | Purpose |
| --- | --- |
| Recorder | Capture a human session into a macro |
| Step editor | Edit steps as a graph and as structured text; set parameters, triggers, capabilities |
| Timeline scrubber | Move backward and forward through any run; inspect tree and pixels at each point |
| Live console | Watch agents act in real time; pause, step, take over, or abort |
| Diff viewer | Compare the expected semantic tree with the actual one at a failed step |
| Test runner | Replay macros against Glassfile fixtures and report regressions |
| Fleet dashboard | Agents, queues, success rates, budgets, costs, and alerts |
| Approval inbox | Pending approvals with evidence, on every surface |
| Policy editor | View and edit grants and rules with a plain-language preview |
| Registry | Browse, install, sign, and version macros and roles |

Pending approvals and run status must be reachable from a phone-sized surface, since long-running agents need a human who is not at the desk.

---

## 31. Data model and storage

- **Runs:** id, task, macro versions, agent tree, status, budgets used, timeline reference.
- **Timelines:** content-addressed event streams (Glassfile segments), deduplicated.
- **Artifacts:** typed outputs with provenance (which run and step produced them).
- **Registry:** macros, roles, and policies as versioned, signed documents.
- **Vault:** encrypted secrets and sessions.
- **Memory:** scratchpads, run memory, long-term store, each scoped to an agent or task.
- **Audit log:** append-only and signed.

Retention is configurable per data class, with secure deletion for sessions and secrets.

---

## 32. Interfaces and compatibility

- **MCP server.** Exposes the Agent Port as tools so any MCP-capable agent can drive the engine, within grants.
- **WebDriver BiDi and CDP compatibility shim.** Existing Playwright, Puppeteer, and Selenium scripts can run against the engine with narrowed grants. This lowers adoption cost sharply and gives a migration path to semantic selectors.
- **Local API.** HTTP and IPC for tasks, runs, macros, approvals, and events (server-sent events for streaming).
- **CLI.** Run macros, replay timelines, inspect runs.
- **SDKs.** Rust first, then TypeScript and Python.
- **Webhooks and events** in and out for integration with other systems.
- **Import and export:** macros and timelines as documented, signed, open formats.

---

## 33. Mapping from Clear Glass

How the existing Clear Glass gates (from its README and source layout) map into the engine.

| Clear Glass today | In the engine |
| --- | --- |
| `driver.exec` (click, type, navigate, screenshot) | Agent Port `act`, `navigate`, `see` |
| `dom.query`, `dom.mutate`, `dom.pick`, `dom.tokens` | `query`, `act`, interactive node picker, Semantic Lift |
| `context.create`, `context.switch` | Agent sessions and layers |
| `context.fp.switch` and fingerprint profiles | Removed. Replaced by honest identity and attestation |
| `cookie.save`, `restore`, `snapshot`, `health` | Vault session storage with health checks |
| `mesh.spawn`, `send`, `route`, `enqueue` | Supervisor, channels, router, durable queue |
| `copilot.message` | Model adapter and assistant agent |
| Automation engine, steps, nodes | Macro engine and step catalog |
| Macros | Macros with recorder, parameters, and signing |
| `url.listen` | URL-match trigger |
| Userscripts and plugins | Lenses and gate extensions with capability grants |
| Rewind engine | Native timelines and Rewind and Fork |
| `diag.run`, `diag.page`, `diag.nexus` | Diff viewer, test runner, diagnostics |
| `window.open`, `close`, `hide`, `minimize` | Layer lifecycle and surfaces |
| `options.get`, `options.set` | Configuration and policy store |
| SSE event stream on :7701, command endpoint on :7702 | Local API with event streaming |

The gate and stream architecture carries over unchanged. What changes is that these become native capabilities instead of workarounds around another engine.

---

## 34. Agent platform roadmap

These run alongside the engine milestones in section 18.

| Step | Delivers | Exit test | Needs engine milestone |
| --- | --- | --- | --- |
| A0 | Agent Port on native content | A script queries and acts on a native app by meaning | M1 |
| A1 | Recorder and strict replay | A recorded macro replays pixel-identical | M6 |
| A2 | Agent sessions and capability grants | An agent cannot read outside its grants | M6 |
| A3 | Adaptive macros and the fallback ladder | A macro survives a markup-only redesign of a test app | M4 |
| A4 | Governance: policies, approvals, vault, audit | A payment-class action pauses for approval and is logged | M6 |
| A5 | Orchestrator: supervisor, queue, router, budgets | Three agents complete a fan-out task and a crash resumes from checkpoint | M6 |
| A6 | Model adapters and the MCP server | An external agent completes a task through the MCP server | M4 |
| A7 | Injection defense: taint tracking and allowlists | A planted instruction in page text cannot trigger an action | M6 |
| A8 | WebDriver BiDi and CDP shim | A standard Playwright test suite passes with narrowed grants | M4 |
| A9 | Semantic Lift for web pages | An agent completes a task on a real site with no scraping | M7 |
| A10 | Authoring UI: editor, scrubber, console, dashboard | A non-developer builds and debugs a macro end to end | M6 |
| A11 | Registry and signed macros | A signed macro installs with its declared capabilities enforced | M11 |

---

## 35. Success measures

- **Macro survival:** percentage of runs unaffected by a site redesign, compared with a selector-based baseline.
- **Task success rate** by tier and difficulty, with and without self-healing.
- **Repair time:** time from failure to an accepted patch.
- **Replay determinism:** percentage of recorded runs that replay identically.
- **Cost per task:** tokens and wall time, with semantic diffs versus raw page input.
- **Safety:** injection test suite pass rate; approval prompts per task; incidents of out-of-grant action (target zero).

---

## 36. Risks and limits

- **Bot defenses** will block or challenge automation on many third-party sites. The honest path is APIs, attestation, and human handover, which narrows what is automatable.
- **Prompt injection** is reduced by structure, not solved. Approvals and budgets remain the backstop.
- **Semantic Lift is probabilistic**, so adaptive macros on legacy pages need confidence thresholds and human review.
- **Terms of service:** automating a site can violate its terms even when technically possible. Policies should encode this per origin.
- **Scope:** this part is a platform in its own right. The roadmap in section 34 keeps every step shippable.
- **Dependence on engine milestones:** the most valuable pieces (A1, A2, A4, A5, A7) need the capability and replay machinery from M6.

---

## 37. Open questions (Part III)

1. **First automation target:** your own apps and services, or a named set of third-party sites?
2. **Macro format:** typed JSON first, or a readable scripting language from the start?
3. **Where do agents run:** local only, or also remote workers?
4. **Model strategy:** hosted APIs, local models, or both at launch?
5. **Approval defaults:** how conservative should the out-of-the-box policy be?
6. **Playwright compatibility:** is the BiDi and CDP shim a launch requirement or a later addition?
7. **Registry:** public marketplace, private organization registry, or both?
8. **Surfaces for approvals:** desktop only, or phone first?

---

## 38. ClearDriver audit: what carries over, what changes

Source: `clear-glass/src/driver/` (index.js about 870 lines, glass.js 451, glass-host, page-resolver, url-listener) plus `src/page/reader.js` and `src/page/field.js`. ClearDriver is a Chromium-based automation layer with no Playwright or Puppeteer dependency. About 45 actions arrive as bus messages and results stream back as events.

### 38.1 Action mapping to the Agent Port

| ClearDriver action | Agent Port verb |
| --- | --- |
| `navigate`, `back`, `forward`, `reload`, `getUrl`, `getTitle` | `navigate` |
| `click`, `type`, `hover`, `scroll`, `select`, `check`, `setValue`, `pressKey`, `upload`, `pointer` | `act` |
| `readPage`, `field`, `at` | `read`, `query` (with occlusion) |
| `wait`, `waitFor` | `wait` (predicates) and `observe` (subscriptions) |
| `screenshot`, `spotlight` | `see`, intent overlay |
| `eval`, `inject` | `eval` (capability-gated, off by default) |
| `cookies.*`, `storage.*` | Vault and session storage under grants |
| `network.block`, `network.intercept` | Network policy gate |
| `record.start`, `record.stop` | Recorder |
| `url.listen` | URL-match trigger |
| `zoom`, `findInPage`, `print`, `toast` | Surface and layer controls |

### 38.2 Carry over unchanged in spirit

- **Fail loudly on target resolution** (`page-resolver.js`). The old resolvers fell back to whatever page was focused, which could type into the wrong page. The resolver now throws a staged error (`no_window`, `no_webview`). In the engine this becomes a rule: an unresolved agent or target is an error, never a guess.
- **One-call page reading** (`readPage`). URL, title, budgeted text, headings, links, labeled fields, and buttons in one shape, with selectors that the act verbs accept. This is the seed of the semantic tree and the diff-friendly observation in section 24.5.
- **The interaction field** (`field.js`). Every interactive target numbered, with its box, centre, role, name, and a **z value counting how many layers cover its centre** (0 means clickable, 2 means under a modal and a banner, -1 means off screen), plus `at(x, y)` to see the stack under a point. Occlusion awareness is added to `query` results as a first-class field.
- **Drawing what the agent sees.** The overlay with numbered badges and a coordinate grid, and `spotlight` (a ring and dimmed page around the intended target with a label). The engine makes this the **intent overlay**: before any act at Submit tier or above, the target is highlighted so the person sees exactly what is about to happen. It is also the visual for approvals (section 28.3) and the live console (section 30).
- **Compact text rendering for small models** (`describe(map)`), for example `#3 button 'Apply now' (412,580) 120x32 z0`. Keep a compact text form of observations for small local models alongside the structured form.
- **Lifecycle events.** Each call emits start, result, and error events with an exec id, agent id, and timestamp. These map directly onto the audit log and timelines.
- **Recorder hygiene.** Passwords are kept out of recorded macros. In the engine this is enforced by the vault: secrets are references, never recorded values.
- **Testing the same code that runs.** In-page functions are real functions serialized with `toString()` and tested in jsdom. The engine keeps the rule that test code and production code are the same code.
- **Playwright-shaped compatibility** (`glass.js`). A subset of the Playwright page API (goto, evaluate, locator, route, waitForSelector, keyboard, screenshot, text= and chained selectors) driven over the DevTools protocol, with a fallback to any Chromium binary. This is the working prototype of the BiDi and CDP shim in section 32 and step A8.

### 38.3 What the engine changes

| Limitation in ClearDriver | Engine answer |
| --- | --- |
| Targets are CSS selectors resolved by running script in the page | Semantic selectors resolved by the engine outside the page realm |
| Recorder and state (`window.__cgRecording`, install flags) live in the page world, where the page can read or overwrite them | Recorder state lives in the host, invisible to page script |
| Waiting polls with an eval every 200 ms | Subscriptions to tree changes (`observe`) and predicates (`wait`) |
| Click computes the centre of a bounding box and sends a coordinate, with no occlusion or scroll-into-view check in the click itself | Actionability checks before `act`: visible, enabled, unobscured (z = 0), stable, scrolled into view |
| Results are bare values and error strings | Result envelope with confidence, evidence pointer, and a failure class (section 24.3 and 24.4) |
| `eval` and `inject` run arbitrary code in logged-in sessions with no policy layer | `eval` is a capability, off by default, logged, and tainted-input-safe |
| Navigation waits on one load event and does not distinguish the main frame from subframes | Navigation as a tracked state machine with main-frame semantics, redirects, and error pages |
| `network.block` and `network.intercept` each register a request listener on the session; Electron keeps only the last listener, so these and any other listener can silently overwrite each other (to be verified against url-listener) | A single ordered network policy gate that composes rules |
| Typing sends one key event per character and uses Ctrl+A to clear, which is fragile for non-ASCII input and on macOS | Text input as an editing operation on the focused node, with real IME and platform shortcuts |
| Human-like random delays in click and type | Not needed for own apps; pacing is a rate-limit policy, not disguise |
| Commands arrive over a local HTTP port | Every command authenticated and authorized against the caller's grants |

### 38.3.1 Items to verify in the code before relying on this table

- Whether the local command endpoint (`:7702/cmd`) authenticates callers at all. If not, any local process can drive any agent session, including `eval`.
- Whether `did-fail-load` handling in `navigate` filters to the main frame.
- Whether `url-listener` and `network.*` share the single session request listener.

### 38.4 New requirements added to the Agent Port

1. `query` results include `occlusion` (layer count over the target's centre) and `visible` and `enabled` flags.
2. `see` supports a numbered-target overlay and a coordinate grid, for agents and for people.
3. `act` runs actionability checks and returns a failure class instead of clicking blindly.
4. Observations have a compact text form for small models.
5. Unresolved agents or targets raise a typed error and never fall back to another page.
6. Intent overlay precedes every action at Submit tier or above, unless policy says otherwise.

---

# Part IV — The Event Bus (v0.4)

## 39. Event bus

### 39.1 Decision and scope

The engine's backbone is an event bus. **DECIDED** (direction): control, state changes, agents, macros, orchestration, audit, and replay all run on the bus. **PROPOSED** (details below). Assumption to confirm: the bus covers the whole engine core, not only the Agent Port; per-frame hot paths stay off it (section 39.9).

The bus is the descendant of Clear Glass's SISO stream (gates registered by event type, events emitted depth-first, results broadcast over SSE). The engine keeps the idea and fixes what that design lacks: ordering guarantees, access control, correlation, persistence, and backpressure.

### 39.2 Message kinds

| Kind | Meaning | Example topic |
| --- | --- | --- |
| Command | An intent that someone wants done; may be refused | `cmd.act.activate` |
| Event | A fact that happened; never refused, never edited | `evt.node.changed`, `evt.act.done` |
| Query | A read-only request answered by a reply message | `qry.tree.snapshot` |
| Reply | The answer to a query, tied to it by correlation id | `rep.tree.snapshot` |

Commands are handled by exactly one owner. Events fan out to any number of subscribers. State changes only ever happen in response to commands and are announced as events.

### 39.3 Envelope

Every message carries the same header, followed by a typed payload.

| Field | Purpose |
| --- | --- |
| `id` | Unique message id (time-ordered) |
| `kind`, `topic` | Message kind and topic name |
| `ts` | Logical clock tick plus wall time |
| `agent` | Who published it (agent, human, or system) |
| `grant` | The capability grant that authorized publishing it |
| `correlation` | Ties results and replies to the command or query that caused them |
| `causation` | The message that directly triggered this one, so any event traces back to its root |
| `taint` | Marks content that originated from untrusted page text (section 28.4) |
| `idem` | Idempotency key on state-changing commands |
| `schema` | Payload schema name and version |
| `payload` | Typed body; large data travels by content hash, not inline |

### 39.4 Topics and access

Topics are named `<kind>.<domain>.<name>`. Domains: `node`, `act`, `nav`, `net`, `layout`, `frame`, `run`, `agent`, `task`, `chan`, `policy`, `approval`, `audit`, `vault`, `timeline`, `bus`, `system`.

- **Capability-scoped.** Publishing and subscribing both require a grant matching the topic pattern (for example `cmd.act.*` on origin X). The broker enforces this, never the publisher.
- **Schema-checked.** Messages that do not match the topic's schema are rejected at publish.
- **Secrets never travel the bus.** Payloads carry references such as `secret:bank/login`.
- **Static topic registry.** Every command topic is declared with its owner. A build-time check fails if a command has no handler or a handler has no declared topic.

### 39.5 Delivery and ordering

- **Ordering:** guaranteed per partition (one partition per agent session, per layer, and per queue), not globally.
- **Delivery:** at-least-once. State-changing commands carry an idempotency key and the owner deduplicates within a window, giving exactly-once effect. A retried Submit cannot double-submit a form.
- **Backpressure:** bounded queues per subscriber. Topics marked `coalesce` (scroll, pointer movement, tree diffs) merge or drop older messages under load. Topics marked `lossless` (commands, approvals, audit) never drop and slow the publisher instead.
- **Priority lanes:** input first, then control, then telemetry.
- **Unrouted messages are loud.** Publishing a command with no live handler returns `evt.bus.unrouted` to the publisher. The README addenda for Clear Glass record repeated bugs where an emit had no subscriber and failed silently (a renamed event, a channel that never existed). The engine makes that class of bug impossible to miss.
- **Poison messages** that repeatedly fail go to a dead-letter topic with their failure history.
- **Call-and-response sugar:** `await act(...)` publishes the command with a correlation id and waits for `evt.act.done` or `evt.act.failed` with that id, with a timeout and cancellation.

### 39.6 Subscriptions and consumers

- **Filters:** topic pattern, node selector, or predicate over the payload.
- **Cursors:** a subscriber can start from now, from a past offset, or from the start of a run.
- **Consumer groups with leases:** the durable task queue (section 26.4) is a topic read by a group; a message is leased to one consumer, redelivered on timeout, and acknowledged on completion.
- **Snapshots plus diffs:** `observe` on the tree sends one snapshot and then diffs, so subscribers stay cheap.
- **Keyed state topics** with compaction hold the latest value per key (the blackboard, presence, run status).

### 39.7 The log is the timeline

Each run partition is an append-only, content-addressed log. Many features become views of it instead of separate systems:

| Feature | On the bus |
| --- | --- |
| Timeline and Rewind | Read the log to any offset and rebuild state |
| Fork | Branch the log at an offset and continue with different commands |
| Replay | Feed recorded ingress events into the deterministic gates with side-effect gates stubbed |
| Glassfile | A signed bundle of log segments plus the resources they reference |
| Checkpoint and resume | An offset plus a state snapshot |
| Audit | A signed, filtered projection (action, approval, and grant topics) |
| Macros | Recorded command sequences, or event-driven state machines |
| Wires | Subscriptions with a transform, publishing to another variable's topic |
| Orchestration | Topics, consumer groups, and supervisors that watch `evt.run.*` |
| Diagnostics | A subscriber that checks invariants and publishes findings |

### 39.8 Determinism

Everything non-deterministic enters through **ingress gates** and is recorded as an event: wall-clock time, randomness, network responses, device and user input, and file reads. Every other gate is a pure function of its state and the events it receives. The engine uses a virtual clock. Same ingress log, same state, same pixels.

### 39.9 What stays off the bus

The bus carries control, semantics, state changes, and lifecycle. These run directly, for speed, and report coarse events only:

- Layout solving, painting, compositing, and GPU command encoding (events such as `evt.layout.settled` and `evt.frame.presented`).
- Text shaping, hit testing, and the inner loop of the script engine.
- Large payloads (images, pixel buffers), which move by content hash and shared handle with only a reference on the bus.

The rule: if it must happen every frame, it is not a message.

### 39.10 Bridges to the outside

- **MCP server:** exposes `qry.*` and `cmd.*` topics as tools and `evt.*` as notifications, within grants.
- **WebDriver BiDi:** a natural fit, since BiDi is already a command and event protocol. The shim maps its commands and events onto bus topics. CDP is mapped the same way.
- **Local API:** HTTP for commands and queries, server-sent events or WebSocket for subscriptions.
- **Authentication:** every external publisher is authenticated and receives a scoped grant. Nothing external publishes as a trusted internal agent.
- **Pages and script:** a page has no bus access by default. A capability can grant a narrow, origin-scoped bus handle.

### 39.11 Implementation notes

- A Rust crate (working name `glass-bus`): typed messages as enums, serialized with `serde`, one envelope format in-process and across processes.
- In-process gates share lock-free ring buffers per partition. Cross-process traffic uses the same envelope over typed IPC.
- The log is stored as append-only segments, memory-mapped, content-addressed, with documented compaction rules for keyed topics only.
- A schema registry versions payloads with explicit compatibility rules, so old Glassfiles keep replaying.
- One dispatcher per partition, asynchronous. Clear Glass emits depth-first and synchronously, which invites re-entrancy and ordering surprises; the engine does not.

### 39.12 Roadmap impact

- **M0 and M1:** the bus core (envelope, partitions, ordering, topic ACLs, static registry, unrouted events, append-only log) lands before any other subsystem, because everything else is built on it.
- **M6** (capabilities and replay) becomes smaller: the log already exists, so replay and Glassfile are views of it.
- **A0:** the Agent Port starts as topics on the bus, not as a separate API.

| Step | Delivers | Exit test |
| --- | --- | --- |
| B0 | Bus core with envelope, ordered partitions, log | Messages published in order are delivered in order per partition and appear in the log |
| B1 | Topic ACLs and static registry | An agent without a grant cannot publish or subscribe; a command with no handler yields `evt.bus.unrouted` |
| B2 | Idempotency and backpressure | A retried command takes effect once; a flood on a `coalesce` topic does not stall input |
| B3 | Replay from the log | A recorded session replays to an identical state hash |
| B4 | Bridges | An MCP client and a BiDi client drive the same session through the bus |

Throughput and latency targets are set after the first baseline measurement.

### 39.13 Open questions (bus)

1. **Scope:** whole engine core, or Agent Port and orchestration only (assumed: whole core, hot paths excluded)?
2. **Processes:** in-process only at first, or multi-process from the start?
3. **Delivery:** is at-least-once with idempotency enough, or does any topic need strict exactly-once?
4. **Schema language:** Rust types with `serde`, or an interface definition language such as Protocol Buffers or Cap'n Proto?
5. **Retention:** how long are logs kept, and what may be compacted besides keyed state topics?
6. **Page access:** should pages ever get a bus handle, and under what grants?
