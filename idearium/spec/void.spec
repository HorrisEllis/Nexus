# The Void — made in the spec workshop (idearium)
# Written 2026-10-10 from James's words and docs/2026-10-02-spatial-void-phasemap.spec (the void as built, 0.39.295).
# Opened in the workshop (nexus/idearium → its spec folder, or NEXUS in the workshop's START FROM). Decisions as choices
# [A] [B] [C] [custom], recommendation marked; "chosen:" open until James picks. Nothing here is built yet.
spec:
  name: The Void
  ambition: 5 — outlier
  source: "James 2026-10-10 · built so far: idearium/lib/void.js (0.39.295 V2: ideas are his words only; creativity and stability dials; echoes from EROSMANCER, HOSTILE TRUTH, DELTA RISK, UNIFIED)"
  owner: idearium (the void, its ideas, its echoes, the thread) · copilot (the voices answer through it) · cos (the lab an end-state runs in, cos/spec/lab.spec)
  status: specced 2026-10-10, not built
  james: >-
    "no i mean i need to dump ideas somewhere, they are endless. like ive been trying, like maybe the spacial void is much
    more enterprise grade, expand it, the conditions, make it look better. like ambitous, creative, outliar, novel,
    beautiful, inspiring, something anyone could use, maybe some priming rituals for inspiriation, flow state, like help
    motivate me, move me, help accomplish the end-state." · "i need to stop creating and walk milo. or i need you to look at
    my inputs today and give me somewhere for them to land, this is typical for me."
sections:
  - id: purpose
    title: Purpose
    body: |
      A place where ideas land the second they arrive — endless, unsorted, never lost — and are carried from there toward
      an end-state, so the volume of ideas becomes motion instead of weight.

      Today the Void takes one idea at a time, answers it with one-shot echoes, and has no way in except typing in its
      page. It does not know which ideas belong together, which are already built, which repeat, or what any of them is
      for. The person producing hundreds of ideas a day needs the opposite: a dump that costs nothing to use, and a
      system that does the sorting, linking and reminding — while the ideas stay his words.

  - id: primitives
    title: Primitives
    body: |
      idea         (thing)    his words, verbatim, timestamped, with where it came from (typed, CLI, chat, voice, a picked element)
                              invariant: never rewritten by an agent (V2's rule)
      cluster      (thing)    ideas that belong together, proposed by meaning, accepted by him
      landing      (rule)     where an idea goes next: an existing spec/phase (the census knows them), a new spec, a lab end-state, later, or let go
      echo         (thing)    an answer to an idea (questions, angles, risks) — now a thread turn, not one-shot (SD6)
      end-state    (thing)    a stated outcome an idea or cluster aims at; what the lab works toward (cos/spec/lab.spec)
      ritual       (action)   a short, optional start to a session: intention, the end-state in view, one choice of what to move today
      momentum     (thing)    what moved: ideas landed, specs advanced, end-states closer — shown, never scored against him
      dial         (rule)     creativity (normal … outlier) and stability (stable … unstable), linked with slack — kept from V2

  - id: axioms
    title: Axioms
    body: |
      AX1  Capture costs nothing: one keystroke, one command, one message — from anywhere (page, CLI, copilot, Clear Glass).
      AX2  An idea is his words; agents answer, cluster and propose landings — they never rewrite or delete one.
      AX3  Nothing is lost: an idea let go is archived with the reason, findable.
      AX4  Sorting is the system's job; he only accepts or moves.
      AX5  Encouragement is honest: momentum shows real movement (landed, built, closer) — no streaks that punish, no fake progress.
      AX6  Anyone could use it: no Nexus words needed to drop an idea or read where it went.

  - id: capture
    title: Capture — every way in
    body: |
      page (the Void, a one-line field always focused) · `idearium idea <text>` · copilot ("idea: …") · Clear Glass (a hotkey
      opens a capture line over any page; the Guardian picker's → CLAUDE CODE can also send "an idea about this element") ·
      hey nexus (an agent's JSON message {"nexus":"idea","text":…}) · a phone through the remote door (docs/remote-access.spec)

      choices — the fastest way in:
        [A] a global hotkey in Clear Glass that opens a capture line over whatever is on screen  ← recommended (zero context switch)
        [B] the CLI / copilot only — nothing new to build in the browser
        [C] a phone path first (chat bot) — capture away from the desk
        [custom] ____
      chosen: open

  - id: landing
    title: Landing — where each idea goes
    body: |
      Each new idea is matched (meaning, not keywords) against: the census (1,232 phases, 224 specs), the clusters, the
      end-states. Proposed landings, his to accept:
        → joins <spec or phase> (it is already there — said with the match, so he sees it isn't lost)
        → joins cluster <name> (with others like it)
        → becomes a new spec (the workshop opens from it, idea-to-spec)
        → becomes an end-state for the lab
        → later (kept, resurfaced when its cluster moves)
      choices — when landings are proposed:
        [A] in a quiet batch he reviews when he wants (a "sort" view)  ← recommended (dumping stays fast; sorting is a separate moment)
        [B] immediately, under each idea as he types
        [C] only on request
        [custom] ____
      chosen: open

  - id: experience
    title: Experience — beautiful, inspiring, anyone can use it
    body: |
      The space keeps the Void's look (stars, depth) and gains: ideas as points of light that drift toward their clusters;
      a cluster brightens as it moves toward its end-state; the dials as two arcs; a calm capture line; no clutter — one
      thing to do at a time. Rituals are optional and short:
        start   — "what do you want to move today?" (one end-state chosen), a minute of the clusters closest to it
        flow    — capture-only mode: everything else hidden, ideas land silently
        close   — what moved today (momentum), what is waiting, one line for tomorrow
      choices — the ritual set:
        [A] start · flow · close, each skippable, nothing forced  ← recommended
        [B] none — the space alone
        [C] a richer set (breath, prompts from his own past ideas, a cross-domain d20 roll — the workshop's FEEDS reused)
        [custom] ____
      chosen: open

  - id: ideas_waiting
    title: Ideas waiting (2026-10-10, to import into the Void when it is built)
    body: |
      Each in his words, so nothing is lost; the importer makes each an idea and proposes its landing.
      - "the userscripts need widget with dynamic job queues, like shows a full guardian widget in the corner"   → guardian/spec/agents-and-accounts.spec
      - "hey nexus, is for the agents to use like a json string, and have copilot conversate"                     → guardian + copilot (a JSON message protocol)
      - "what about making macros or proceedures for the agents. frameworks? … like sends to raid to control the system" → cortex (RAID), after ME0–ME3
      - "then we need to clean up the project. maybe make tools for maintenence. like nodes can replace a lot of the code at somee point" → core (census, provider-list check are the first two)
      - "all of the over 1000 specs … consolidate them into full specs if applicable, maybe move complete into its own catagory" → the census (a computed category)
      - "should we migrate anything loom has thats useful, into idearium. also the nexus self."                    → docs/system-architecture.spec (loom choice)
      - "after you map it, can you update all the atlas' and .spec files … check all the phases with whats been completed" → the census + scripts/generate-atlases.js
      - "do not lose history, recycle any data you can into nexus. changelogs. the way to import nexus into the github repo." → idearium history import (exists: history.import.*)
      - "cos lab, uses end state, to have the agents, do anything it can in nexus inside a comaprtnmer to achieve the end state" → cos/spec/lab.spec
      - "i want to be able to access nexus remotely … discord bot, or ssh"                                         → docs/remote-access.spec

  - id: build_order
    title: Build order
    body: |
      1 VD1 capture from everywhere into one table (page, CLI `idearium idea`, copilot) — AX1
      2 VD2 the thread per idea (SD6 in idea-to-spec.spec)
      3 VD3 import "ideas waiting" from this spec
      4 VD4 landings proposed against the census, clusters and end-states; the sort view
      5 VD5 the space: clusters drifting, the dials as arcs, flow mode
      6 VD6 rituals and momentum
      7 VD7 end-states handed to the lab (cos/spec/lab.spec)

  - id: tests
    title: Tests
    body: |
      T1 an idea typed in the CLI, the page and copilot lands in the same table, verbatim, with its source
      T2 an idea that matches an existing phase is proposed to join it, with the match shown
      T3 letting an idea go archives it with the reason; it is findable
      T4 flow mode: ideas land with no prompt, no echo, until it ends
      T5 the importer turns "ideas waiting" into ideas, each in his words
      Screens proven in Clear Glass.
