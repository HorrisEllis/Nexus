spec:
  meta:
    name:     tool-layers-and-pane-memory
    roadmap: 'later — one leftover (declutter 2026-10-09, James: "okay")'
    version:  1.0.0
    date:     2026-09-29
    release:  0.39.278
    uuid:     nexus-tool-layers-pane-memory-phasemap-v1-0000-2026-0929-jamesbrooks-001
    owner:    lib.agent-tools.tool-catalog · lib.agent-tools.tools.nexus.tool-layers · lib.repo-agent · lib.repo-hat ·
              clear-glass.src.copilot.chat-store · clear-glass.src.copilot.bridge · clear-glass.src.ipc.bridge ·
              clear-glass.src.preload · clear-glass.renderer.browser · clear-glass.renderer.copilot-cli ·
              clear-glass.src.api.settings
    status:   built (0.39.278) — T1–T4 and P1–P5 closed; P6 open
    origin: >-
      James, 2026-09-29: "need to solidify the coding for the repos. okay need to expose the agent tools as layers.
      layer one is the command to list the 2 layer, which is just the catogories of tools, then the next command
      expands a specific tree of tools. okay and copilot and clearglass, isnt really working. its dumb, isnt
      persistent, and needs to work in the clearglass copilot panel" → "Continue".

  drift: >-
    docs/CLAUDE.md rule 1 (map before build) was NOT followed: the code for T1–T3 and P1–P4 was written in the same
    session as the reading, and this map was written after, from what was built and what the reading found. Recorded
    here rather than back-dated. One defect was found by the tests after writing: rows ordered by ts alone came back in
    any order when two landed in the same millisecond (PM-01/02/04/05 failed); fixed with a monotonic seq.

  found:
    - >-
      F-1 tool discovery was one flat list or one search: the harness prompt named the categories and said "find one
      with loom.find.tool kind tool"; 'all' scope listed every tool (126 registered on 0.39.277). No way to walk the
      catalog a layer at a time.
    - >-
      F-2 the repo code tools shared a group with generic file tools ("Files & code").
    - >-
      F-3 the pane's conversation lived only in the DOM (renderer/browser.js addMsg): a reload or restart erased it.
    - >-
      F-4 no backend was sent the conversation: the direct Ollama/Guardian paths got one message; copilot's session was
      in copilot's memory, lost on each of its restarts (every few minutes in the 2026-09-28 log).
    - >-
      F-5 every pane turn fetched the orchestrator's whole capability prompt (plus ~7.9k chars of Clear Glass actions) —
      too much for the local 3B model, and a cross-system fetch for something Clear Glass does not own.
    - >-
      F-6 a reply reached innerHTML unescaped. Harmless-ish while replies vanished; a stored injection once they are kept.

  invariants:
    I1 (§10.3): one catalog — the layers are views over tool-catalog.js catalog(), not a second list.
    I2 (§1.2): an unknown category is an error naming the real ids, never an empty tree.
    I3: a tool the agent may not call is not shown in either layer (tool-config gate, run allowedTools).
    I4 (sovereignty): the pane's conversation is Clear Glass's, in Clear Glass's own JAA store.
    I5 (§0.3): /new starts another conversation; the old one is kept.
    I6 (memory): a conversation keeps its newest 400 rows; the history sent is bounded by turns and characters, and
      what was left out is stated.
    I7: a failed store never blocks a reply — the call goes without history and copilot.memory.error is emitted.

  phases:
    - { id: T1, status: closed, name: "catalog: categories() and expand() — branches per owning system, typed params", files: [lib/agent-tools/tool-catalog.js] }
    - { id: T2, status: closed, name: "nexus.tools.tool (layer 1) and nexus.tools_expand.tool (layer 2), registered", files: [lib/agent-tools/tools/nexus/tool-layers.js, lib/agent-tools/index.js] }
    - { id: T3, status: closed, name: "Code — this repo as its own category; the layers in the harness first message, ALWAYS_IN_SCOPE and new repo hats", files: [lib/agent-tools/tool-catalog.js, lib/repo-agent.js, lib/repo-hat.js] }
    - { id: T4, status: closed, name: "tests updated where they pinned the old list/text (CT-401, CT-402, RH-006); new TL-01…06", files: [tests/modules/test-code-tools.test.js, tests/modules/test-registry-harness.test.js, tests/modules/test-tool-layers-and-pane-memory.test.js] }
    - { id: P1, status: closed, name: "chat-store — Clear Glass's own store, bounded, seq-ordered", files: [clear-glass/src/copilot/chat-store.js] }
    - { id: P2, status: closed, name: "bridge: store both sides, send the recent turns on every backend; 'Nothing answered' not stored", files: [clear-glass/src/copilot/bridge.js, clear-glass/src/api/settings.js] }
    - { id: P3, status: closed, name: "layered tool surface — no orchestrator fetch by default", files: [clear-glass/src/copilot/bridge.js] }
    - { id: P4, status: closed, name: "pane: restore on open, /new, escaped formatter for live and replayed replies", files: [clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/renderer/browser.js, clear-glass/renderer/copilot-cli.js] }
    - id: P5
      status: closed
      name: loom, atlases, registry
      note: >-
        The new files' edges are literal requires, wired by the whole-tree scanner (checked: tool-layers.js → naming,
        tool-catalog, tool-guide, tool-config, agent-tools; chat-store.js → storage/jaa; bridge.js → chat-store). The
        renderer → main edge is IPC (copilot:history, copilot:newConversation), modelled the same way as the existing
        copilot:send — not as a wire. Atlases: idearium-atlas (What it can use), clear-glass-atlas (new section).
    - id: P6
      status: open
      name: proof in the running window
      note: >-
        The pane changes are proven by unit tests against the real bridge and store, and by syntax checks of the
        renderer. They have not been run in a live Clear Glass window. Open until James sends a message, reloads the
        pane and sees it restored.

  decisions_needed:
    D1: >-
      Should the pane's conversation also be recorded into NEXUS-wide agent memory (lib/agent-memory.js) so other
      agents can recall it? Kept inside Clear Glass by design (I4) until decided.
