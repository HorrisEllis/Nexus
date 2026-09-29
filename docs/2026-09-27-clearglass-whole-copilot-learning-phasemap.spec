spec:
  meta:
    name:     clearglass-whole-copilot-learning
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.272
    uuid:     nexus-clearglass-whole-copilot-learning-phasemap-v1-0000-2026-0927-jamesbrooks-001
    owner:    clear-glass (driver, ipc, copilot bridge, page reader) · copilot (context, awareness, chat tools, routes) ·
              lib.agent-tools · lib.opportunity · lib.context-atlas · lib.cg-learning · idearium (api, ui, prompt blocks) ·
              loom.maps.clearglass-whole
    status:   mapped — built in the order below
    origin: >
      James, 2026-09-27: "i want copilot completely aware of clearglass, hooked in completely. all of it, copilot can
      use it. do anything you can to help me automate job applications, fiverr, etc. expand it as much as possible.
      idearium agents should be able to find the context easily when talking to them, all of the memory systems,
      graphs, etc" … "so he can do everything clearglass can do?" … then, with this tree (0.39.271): "this is the
      current CLEARglass. i gave you the wrong zip. expand it as much as possible. also have him learn."

  # ── Drift, stated (§12.5, §0.0) ───────────────────────────────────────────
  drift: >
    The first pass (P0 below) was built on 0.39.258, the wrong base, and delivered as a "0.39.259" that collides with
    this tree's own 0.39.259 (turn-2/3 completion). Nothing from it is copied blind: every piece is re-applied against
    0.39.271's source, which moved (Clear Glass on JAA, micro-http instead of express, the clear_glass hat and pane CLI,
    auto-run, WebExtensions, autofill proposals, agent memory over the download manager, the {memory} prompt block).
    The old "0.39.259" number is retired; this is 0.39.272.

  # ── What exists (read on 0.39.271, not recalled — §8.6) ───────────────────
  exists:
    - clear-glass/src/driver/index.js — 30 actions; record.start/stop build unique selectors (0.39.262).
    - clear-glass/src/ipc/bridge.js — 171 ipcMain.handle channels; 46 /cli/* HTTP routes; driver already wired in.
    - clear-glass/src/copilot/bridge.js — send() with per-call route (backend/agent/hat), autoRun toggle, execCommand;
      tool results are still never sent back to the model.
    - clear-glass/src/copilot/hat.js — the clear_glass hat (seedKey clear_glass) composed per call.
    - clear-glass/src/autofill/{store,matcher,proposal}.js — identity + 25 fields + job/freelance extras, documents
      (resume path, coverLetter, proposal templates), buildProposalPrompt (upwork/fiverr/job).
    - clear-glass/src/automation/* — workflow engine (cron, steps, templates, from-macro) on the wire server.
    - clear-glass/src/plugins/webextensions.js — WebExtensions (registry in JAA).
    - lib/agent-memory.js — record/recall over the download manager; repo-prompt-blocks {memory} block.
    - lib/agent-tools — the tool registry, tool-guide (coverage test T-001), tool-catalog groups.
    - copilot/server.js DEFAULT_CHAT_TOOLS — the tools the ordinary chat offers (15, 3 of them Clear Glass).
    - copilot/lib/activity-recall.js — "what have you been up to".
    - lib/tool-index.js, lib/fault-log.js — every tool call already records consumer/intent/edge case and faults.
  missing:
    - M1 a browser action's result reaches no caller outside the Electron process except through guardian + SSE.
    - M2 no "what is on this page" (fields with labels and selectors), no "what is Clear Glass doing" in one call.
    - M3 no select / check / setValue / upload / pressKey in the driver.
    - M4 clear_glass_command_index targets :7704 for /cli/* (served on :7702): discover never live, every call 404s.
    - M5 the pane co-pilot never sees its tool results; cannot run NEXUS agent tools.
    - M6 125 of 171 IPC channels have no door outside the renderer (window control, options set, login portal,
      plugins invoke, custom agents, selectors, errors, downloads open, extensions …).
    - M7 copilot's chat offers 3 of ~16 Clear Glass tools; tool-guide lacks notes for most tools.
    - M8 no pipeline for finding, scoring, tracking and applying to jobs/gigs/leads (autofill + proposal are per page).
    - M9 an Idearium agent cannot search across memory systems and graphs in one place.
    - M10 copilot learns nothing from what it does in the browser: a selector that failed fails again next time; a
      flow that worked is not kept; outcomes of applications do not change what gets shortlisted; James's edits to
      drafts do not change the next draft.

  invariants:
    I1: one implementation, second door — every HTTP route calls the same handler the IPC channel / gate calls.
    I2: nothing reveals a secret — no route returns a decrypted password; saving credentials stays James's (denied).
    I3: approval of an application is James's (by:'user'); an agent submits only under his policy (+ ToS ack).
    I4: nothing is sent to a model that James cannot edit (templates, prompt blocks); placeholders are data.
    I5: learning is evidence: every learned item names the observation(s) it came from, is listed, and can be
        forgotten; a learned rule never overrides James's explicit settings.
    I6: failures are data (§1.2) — a failed action, a refused channel, a healed selector are ledgered with reasons.

  phases:
    A1: {title: page reader + driver form actions, closes: [M2, M3], files: [clear-glass/src/page/reader.js, clear-glass/src/driver/index.js]}
    A2: {title: synchronous agent surface (/cli/driver, /cli/page/read, /cli/state) + generic IPC door (/cli/invoke), closes: [M1, M2, M6],
         files: [clear-glass/src/ipc/agent-routes.js, clear-glass/src/ipc/handler-registry.js, clear-glass/src/ipc/bridge.js]}
    A3: {title: clearglass.browser.tool + command-index surface fix, closes: [M4], files: [lib/agent-tools/tools/clear-glass/browser.js, lib/agent-tools/tools/clear-glass/command-index.js]}
    A4: {title: pane co-pilot results loop + agent tools from the pane (merged with route/hat/autoRun), closes: [M5], files: [clear-glass/src/copilot/bridge.js, clear-glass/src/copilot/tools.js]}
    A5: {title: copilot awareness — L7/L8 layers, answerAbout, every Clear Glass tool in the chat, tool-guide coverage, catalog, closes: [M7],
         files: [copilot/lib/copilot-context.js, copilot/lib/nexus-awareness.js, copilot/server.js, lib/agent-tools/tool-guide.js, lib/agent-tools/tool-catalog.js, lib/hat-seed.js]}
    B1: {title: opportunity pipeline reusing Clear Glass autofill identity + proposal guides, closes: [M8],
         files: [lib/opportunity/*, lib/agent-tools/tools/opportunity/opportunity.js, cli/opportunity.js, copilot/routes/opportunity.js, clear-glass/src/toolbar/commands.js, clear-glass/renderer/browser.js]}
    C1: {title: context atlas (agent memory + JAA + graphs + prose) — its own {atlas}/{directory} blocks beside {memory}, closes: [M9],
         files: [lib/context-atlas.js, lib/agent-tools/tools/query/context-atlas.js, lib/repo-prompt-blocks.js, lib/repo-agent.js, idearium/api/index.js, idearium/ui/js/app.js]}
    L1: {title: site memory — every browser action outcome per host; hints returned with read(), closes: [M10], files: [lib/cg-learning.js]}
    L2: {title: self-healing selectors — a missing element is re-found by its label/text, retried once, the mapping learned, closes: [M10]}
    L3: {title: learned flows — a sequence that worked on a host is kept; promote to a Clear Glass macro on James's word, closes: [M10]}
    L4: {title: outcome learning — responses/interviews/rejections move source and keyword weights (bounded, explained), closes: [M10]}
    L5: {title: voice learning — James's edited drafts become {examples} in the drafting templates, closes: [M10]}
    X1: {title: axioms pass — loom map with wires, spec addenda, SPEC-REGISTRY, version 0.39.272, run-all, tests, nexus.zip}

  open_items:
    - The job APIs cannot be reached from the build environment; normalizers are fixture-tested.
    - No live Electron window in the build environment: driver actions and CDP upload are tested through the routes
      with a driver stand-in, the reader in jsdom.
