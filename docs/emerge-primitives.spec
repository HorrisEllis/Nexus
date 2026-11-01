# docs/emerge-primitives.spec — Emerge in his words: the eight primitives, how each of his words becomes code, and the component registry
# as the spine of every project the compiler builds. Saved so it can be read, taught and rebuilt (his 2026-10-20 rule: "everything needs to
# be speccced before built, so it can be rebuilt if lost").

spec:
  meta:
    name: emerge-primitives
    version: 0.1.0
    date: 2026-11-01
    status: "DRAFT — his primitives recorded; the coder's mapping of each to Emerge and Nexus marked TO CONFIRM where it is a reading"
    owner: "emerge (the language and its compiler live in github.com/HorrisEllis/emerge; Nexus holds it at emerge/, locked)"
    origin: >-
      James, 2026-11-01, after the coder walked a sentence back into code: "okay that needs to be saves or specced. thats much easier for
      me to understand. / what about: state process event delta sigma gate input output / how about using the component registry as a
      spine for projects from the compiler." Before it: "it is supposed to write witout ai." · "i reverse engineer. like i like to take
      something and work backwards. and i need simple primitves or principles."
    how_he_works: >-
      He reverse engineers: he takes something finished and works backwards to its parts. So everything here is written end first: what
      you see, then the primitive that made it, then the word you say to get it.

  # ── 1. The eight primitives (his list) ──────────────────────────────────────────────────────────────────────────────────────────
  # Each: what it is plainly, what it is exactly, where it already lives in Emerge and in Nexus. Order is the order a thing moves through.
  primitives:
    - name: input
      plainly: "what comes in"
      exactly: "a typed door in (Emerge: `in name(x: shape) { … }`); a system's input/ folder where a handoff lands (Emerge's skeleton: input/ processing/ done/ failed/ output/)"
      already: ["emerge: `in` hooks, input/ folder, POST /handoff", "nexus: each system's input/ (genesis skeleton)"]
    - name: event
      plainly: "a note that something happened, sent to whoever listens"
      exactly: "`emit \"name\" { … }`; travels only along a road; delivered in order"
      already: ["emerge: emit, on, roads (CIE-EG §6)", "nexus: the bus, COS's event stream"]
    - name: gate
      plainly: "the keeper that checks every note before it is delivered"
      exactly: "the ordered checks (CIE-EG §6.2) and the rules (`constraint … hard` refuses, `soft` with friction lets it through and counts the cost); the first failure writes a gap"
      already: ["emerge: gate_emit, constraint", "nexus: RAID's gates, COS's wall, the cockpit server's origin check"]
    - name: process
      plainly: "the work that turns what came in into a change"
      exactly: "a handler (`on \"x\" (e) { … }`, a `fn`) that proposes a change; at the size of a system, its process run by COS"
      reading: "TO CONFIRM — the coder's reading: process is the handler at small size and the running system at large size, the same idea"
      already: ["emerge: on-handlers, fn, lib/commands.js", "nexus: COS's supervised processes (runtime.process)"]
    - name: delta
      plainly: "the change itself: what was, what is now"
      exactly: "the difference a process proposes to the state, {before, after}; committed whole or refused whole by the gate; written to the ledger"
      already: ["emerge: a compartment's proposed change, committed or refused whole", "nexus: RFR2's delta stream (intelligence/rfr2/delta), Versionium's changes"]
    - name: state
      plainly: "what it remembers"
      exactly: "a compartment's memory, written only by its own processes, read from outside as a frozen copy"
      already: ["emerge: `state { … }`", "nexus: each system's store; a node's payload"]
    - name: sigma
      plainly: "how far from normal this is"
      exactly: "the distance of a value or a delta from its baseline, in standard deviations; past a threshold it is tension (a gap's pressure)"
      already: ["emerge: observe (the ledger read as a field)", "nexus: CFR's sigma (intelligence/cfr/sigma.js)"]
    - name: output
      plainly: "what goes out"
      exactly: "a typed door out (`out name: shape`); a system's output/ folder; a handoff to another system"
      already: ["emerge: `out` hooks, output/ folder, POST /handoffs", "nexus: each system's output/"]

  # The chain, read end first as he works (the coder's reading, TO CONFIRM):
  #   output ← state ← delta ← gate ← process ← event ← input,   with sigma measuring every delta and every state against its baseline.
  # Forwards: input arrives → becomes an event → the gate checks it → a process proposes a delta → the gate commits or refuses it → state
  # changes → sigma says how far from normal → output goes out. Every step is written to the ledger; anything missing is a gap.
  chain: [input, event, gate, process, delta, gate, state, sigma, output]

  # ── 2. His words → code (saved: the walk-back of 2026-11-01) ────────────────────────────────────────────────────────────────────
  # `eg say` turns a sentence in his words into Emerge with no model: each word to exactly one thing, the same every time; numbers become
  # levers in a .node file beside the code; an unknown word is named back as a gap, never guessed. The garden sentence, walked back:
  #   "a compartment called Garden with plants, at most 50 plants with friction. when rain falls add 3 to plants, plants compound by 10
  #    percent, ripple to bloom. if plants over 40 then gap the garden is crowded. what if rain falls. tension 0.7. test it"
  words:
    - { say: "a compartment called X with Y",   becomes: "compartment X { state { Y: … } }",                  primitive: state }
    - { say: "when … (rain falls)",              becomes: "on \"x.rain_falls\" (e) { … }",                     primitive: event }
    - { say: "add / take / set N to Y",          becomes: "state.Y += o.lever",                                 primitive: delta }
    - { say: "at most / never",                  becomes: "constraint … hard { … }",                            primitive: gate }
    - { say: "… with friction",                  becomes: "constraint … soft (the cost counted in spent())",    primitive: gate }
    - { say: "Y compound by P percent",          becomes: "state.Y += state.Y * o.rate",                        primitive: delta }
    - { say: "ripple to Z",                      becomes: "emit \"x.Z\" { … }",                                 primitive: event }
    - { say: "if … then gap …",                  becomes: "gap \"…\" pressure o.tension",                       primitive: sigma }
    - { say: "tension T",                        becomes: "the gap's pressure, a lever",                        primitive: sigma }
    - { say: "what if …",                        becomes: "whatif { … } — tried in a copy, nothing real changes", primitive: process }
    - { say: "test it",                          becomes: "a test block, run in its own fork",                  primitive: process }
    - { say: "takes … / sends …",                becomes: "in / out hooks",                                     primitive: "input / output" }
  levers: "every number he says goes to the .node file beside the code (a lever), changed there, never in the code"

  # ── 3. The component registry as the spine of every project the compiler builds ─────────────────────────────────────────────────
  registry_as_spine:
    his: "how about using the component registry as a spine for projects from the compiler."
    reading: >-
      TO CONFIRM — the coder's reading: when Emerge's compiler builds a project (eg build, eg say → code), it writes the project's component
      registry first, from the program itself: every compartment and component with its id, its input and output doors, its rules (gates),
      its events and the roads between them. That registry is the project's spine: the code is generated from it, Loom reads it, COS runs
      the project through the doors it declares, and Idearium's repo spine (`repo spine`) checks the code against it. Nothing is declared
      twice.
    already: >-
      `eg components <file.eg>` exports a program's components, hooks and wires as Loom records (emerge/emerge/lang/components.js); Idearium
      has `repo spine <repo>`, "the project's component registry as its spine: every component and every wire with its evidence"; every
      Nexus system has registry-components.js; COS reads each system's door and contract.
    missing: "the compiler does not yet write the registry as the first artifact of a build, and a built project is not yet a COS compartment from it"

  decisions:
    EP_D0_his_eight_primitives:
      status: DECIDED 2026-11-01 (his list; the mapping TO CONFIRM)
      chosen: "Emerge is taught and built from eight primitives: input, event, gate, process, delta, state, sigma, output. Every word he says maps to one of them."
      by: "his, 2026-11-01: \"what about: state process event delta sigma gate input output\""
    EP_D1_the_registry_is_the_compiler_s_spine:
      status: DECIDED 2026-11-01 (his; the reading TO CONFIRM)
      chosen: "A project built by Emerge's compiler starts from its component registry, written first from the program; code, Loom, COS and Idearium's spine all read that one registry."
      by: "his, 2026-11-01: \"how about using the component registry as a spine for projects from the compiler.\""

  phases:
    EP1_the_eight_in_emerge_s_words:
      status: OPEN
      depends_on: [EP_D0_his_eight_primitives]
      files: ["Emerge:docs/learn/words.md", "Emerge:docs/learn/0-the-idea.md", "Emerge:emerge/lang/say"]
      interface: [cli, html]
      does: "the eight in Emerge's own lessons and words table, end first; `say` names which primitive each word became; delta and sigma said as words (`change`, `how far from normal`)"
      proof: "the garden sentence's say output names a primitive beside each word; the lessons teach the eight in the chain's order"
      note: "Emerge's repo: a change made there and brought into Nexus by a new lock (scripts/emerge-lock.js --write)"
    EP2_the_registry_first:
      status: OPEN
      depends_on: [EP_D1_the_registry_is_the_compiler_s_spine]
      files: ["Emerge:emerge/lang/components.js", "Emerge:emerge/lang/eg.js", "idearium/repo/spine"]
      interface: [cli, route]
      does: "eg build writes the project's component registry first (the eight primitives as its records), then the code from it; Idearium's repo spine reads that registry; a built project becomes a COS compartment from it (CP9)"
      proof: "the garden built: its registry first, the code second; repo spine finds no drift; COS runs it through the doors the registry declares"
