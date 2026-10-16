# docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec
# A spec per capability, whose surface is the gate; and a semantic tree for Clear Glass's own browser agent.
# Registered in docs/SPEC-REGISTRY.spec.

origin:
  date: 2026-10-15
  james: >-
    "should we have each module or capability specced. invent, innovate, fix anything that makes it more stable. what
    about a semantic tree for our own browser agent? like specs can reduce surface area, then the phases also. like i
    want the specs to be like new features or capabilities to the project."

found:
  # §8.6, read on 2026-10-15
  - "orchestrator/lib/spec-drift.js runs at every boot: his run said 60 synced, 0 drifted, 14 unspecced (build-verify, proof-run, void, nexstore, workshop, spec-library, reply-continuation, pipeline-routing, code-edit, code-api, code-tools, divergence-watcher, macro-compiler, gap-loop). It compares versions only — never what a spec says the module exposes."
  - "lib/code-intel/decls.js and cards.js measure a file's real surface (exports, what it uses, what uses it); loom has the edges."
  - "the spec engine, spec library and phasemaps exist; a phasemap is how a feature is built today, but nothing ties a feature to ONE spec that owns it."
  - "Clear Glass's agent reads pages through clear-glass/src/page/reader.js (flat: text, headings, links, fields, buttons, each with a CSS selector) and dom/archaeology.js (the raw DOM tree). Neither uses the tree the browser already computes for screen readers: the accessibility tree (role + accessible name per node), reachable through webContents.debugger (CDP Accessibility.getFullAXTree)."
  - "the provider userscripts find the input, send and reply by CSS selectors in a field map; his run: Claude's reply element not found ('needs-you'), and the picker saved ChatGPT's placeholder as the send button — both are class/structure churn a role+name address does not suffer."

decided:
  CS_capability_spec:
    reading: >-
      The coder's reading (to confirm): a capability spec is short — what it is for, its SURFACE (exports, routes,
      commands, events: the things others can touch), its invariants and its checks — and the surface is measured from
      the code, not typed. A change that grows the surface beyond the spec fails a check and proposes an addendum; that
      is how a spec reduces surface area. A new feature starts as a new capability spec; its phases are generated from
      the gap between the spec and the code.
  ST_semantic_page_tree:
    reading: >-
      The page as the browser's own accessibility tree, pruned to what an agent needs: landmarks, headings, every
      interactive node, and text, each addressed by its semantic path ("main › form › textbox 'Message ChatGPT'",
      "button 'Send prompt'") rather than by CSS. Stable across class churn, small enough for a small model, and the
      same tree shape as KT1 (observations attach to page nodes the way they attach to files).

phases:
  CS1_capability_spec_and_surface_check:
    status: DONE (0.60.49)
    files: [lib/capability-spec.js (new), orchestrator/lib/spec-drift.js, lib/code-intel/decls.js]
    does: "parse a capability spec's surface block; measure the module's real surface (decls + routes + command rows + emitted events); diff: in code not in spec (surface grew), in spec not in code (promise unkept). spec-drift reports it beside versions; a runnable check (CK-, catalogue)."
    proof: "a module that adds an export not in its spec is red, named; the spec's addendum makes it green"

  CS2_spec_the_unspecced:
    status: OPEN
    depends_on: [CS1_capability_spec_and_surface_check]
    does: "draft the 14 unspecced modules' capability specs FROM their measured surface (nothing invented), as proposals; James's words where he gave the module's reason (the code's own headers quote him)."
    proof: "spec-drift: 0 unspecced; every draft's surface equals the code's"

  CS3_feature_starts_as_a_spec:
    status: OPEN
    depends_on: [CS1_capability_spec_and_surface_check]
    does: "a new capability = a new spec (surface promised, invariants, checks) → its phases generated from the spec-vs-code gap, bottom-up → built through RAID bricks; each brick's gate checks it stays inside the promised surface (GA1's assess gains a surface check)."
    proof: "a spec with two promised exports yields phases that build exactly those; a brick adding a third is refused, said"

  SP1_semantic_page_tree:
    status: DONE (0.60.49; the CDP path awaits a run in Clear Glass on James's machine)
    files: [clear-glass/src/page/semantic-tree.js (new), clear-glass/src/page/reader.js]
    does: "read the accessibility tree (webContents.debugger, Accessibility.getFullAXTree), prune to landmarks/headings/interactive/text, give each node a semantic address (role + name + landmark path) and a CSS fallback; budgeted; readPage gains it."
    proof: "on a fixture page: the send button is 'button \"Send prompt\"' whatever its classes; the tree of a long page fits the budget"

  SP2_semantic_addresses_for_the_field_map:
    status: DONE (0.60.70; tested in jsdom, a live pick awaits his run)
    depends_on: [SP1_semantic_page_tree]
    does: "the userscripts' field map (input / send / reply) gains a semantic address beside the selector; when the selector misses, the address finds it; the picker records both, and refuses a pick whose role does not fit its key (a 'send' must be a button)."
    proof: "with the selector broken by a class change, the address still finds the input and the send button"

  SP3_the_browser_agent_reads_the_tree:
    status: OPEN
    depends_on: [SP1_semantic_page_tree]
    does: "Clear Glass's agent tools (driver read/click/type) take semantic addresses; observations per page node (KT1's shape: what worked, what broke) so the agent learns a site."
    proof: "an agent task done by addresses only; a broken address leaves an observation on that node"

order: "CS1 → SP1 → SP2 → CS2 → CS3 → SP3 (CS1 and SP1 first: each is the primitive the rest stand on; SP2 fixes what his last run broke)"

drift_accounted:
  - "Nothing stored twice: surfaces are measured from code; the semantic tree is read from the browser each time."
  - "This map runs beside docs/2026-10-15-automatic-tracking-phasemap.spec (KT1/CX1); SP1's tree and KT1's tree share one node shape."

## ADDENDUM 2026-10-15 — CS1 and SP1 built (0.60.49)

# James: "start CS1 and SP1".
# CS1. lib/capability-spec.js (parse / measure / check / find / draft) and CK-254 (lib/checks/ck-254-surface.js, the
# catalogue's 121st check). A capability spec lives at <system>/spec/<name>.spec with meta kind: capability and files:,
# and a surface block (exports, events, routes); a kind left out is not checked and is said to be unconstrained.
# spec-drift counts capability specs as a module's spec and logs each one's surface every boot. Changed from the map:
# the surface does not include command rows yet (route-commands keys) — exports, events and routes first. Found by CS1
# checking itself: its measurement read doc comments as surface; comments are stripped by a character scanner that
# keeps strings, templates and regex whole (a regex stripper swallowed 289 of Idearium's 307 routes on a '/*' inside a
# glob string). Then CK-254 flagged the export that fix added (stripComments) until the spec listed it.
# First capability specs: lib/spec/capability-spec.spec, clear-glass/spec/semantic-tree.spec (both green).
# SP1. clear-glass/src/page/semantic-tree.js: _inPageTree (serialised into the page; jsdom-tested), fromAX (CDP
# Accessibility.getFullAXTree nodes → the same shape), readAX (Electron; attaches the debugger only if free), resolve.
# Addresses are numbered as the walk goes, so a child of the 2nd article says article #2. Driver: readTree (auto: the
# browser's tree, else the page's) and resolve; listed in the agent tool and copilot action lists and tool cards.
# Not proven here: readAX against a live Electron page (no Electron in the coder's container) — the AX path is tested
# on a CDP-shaped fixture; the in-page path in jsdom. SP2 (the userscripts' field map by address) is next.

## ADDENDUM 2026-10-15 — spec gaps mapped to the intelligence system (0.60.49)

# James: "i want any gaps to be mapped to the intelligence system". Found: spec drift (orchestrator/lib/spec-drift.js)
# wrote spec.version.drift and spec.missing gaps raw into the gaps table — no predicate, dedup key, truth floor or TTL,
# so the intelligence gap system (intelligence/gap/predicate.js: hunter, tension, reflection) treated them as unknown.
# Now one door (_intelligenceGap → enrichGap) for every gap spec drift opens, including the new spec.surface.drift;
# the three types are in the predicate library under the names spec drift already writes (no open gap orphaned); spec
# drift resolves surface and missing gaps when the next check is green. Still to do (named): the gaps other modules write
# raw — FR1 (failure reports) is the phase that maps contract failures; a sweep for every raw `insert('gaps'` is next.


## ADDENDUM 2026-10-16 — SP2 built (0.60.70)

# James: "alright." (SP2 first, then the gap sweep). The picker records each pick's semantic address (addressScript) and
# refuses a pick whose role does not fit its field (roleFits: send a button, input a text box); Guardian's selector map
# carries it (semantics); the field map resolves it through window.NexusSemantic when the selector misses — order:
# selector → address → anchor point; a reply is the last node of its shape. Changed from the map: the reply is matched by
# its address with every #n stripped (the newest reply is a new article). Next on this map: the gap-writer sweep (named in
# the 2026-10-15 addendum), then CS2.
