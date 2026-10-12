spec:
  meta:
    name:     copilot-talk-to-nexus
    version:  1.0.0
    date:     2026-10-10
    release:  0.59.11
    uuid:     nexus-copilot-talk-to-nexus-phasemap-v1-0000-2026-1010-jamesbrooks-001
    owner:    idearium.cli.route-commands (the table) · lib.agent-tools.nexus.command · copilot.lib.nexus-ask ·
              clear-glass.copilot.bridge · copilot.server (/api/prompt) · lib.listener-commands
    status:   mapped — built in the order below
    origin: >
      James, 2026-10-10: "okay. now. make it useful like; hooked into copilot so you can talk to nexus" … "map first,
      maybe use lifeline or something, or look at the atlas' and .spec. agent tools". Before it, 0.59.9/0.59.10: `nexus>
      census --limit 4` typed in the co-pilot pane runs with no model; in a watched chat the answer is typed back.

  # ── What exists (read on 0.59.10, not recalled — §8.6) ────────────────────
  exists:
    - idearium/cli/route-commands.js SPEC — 36 rows, one per capability; each has usage, about, req(a), and print(d, a, h)
      that writes a readable answer to the terminal (colours through h.c). makeRouteCommands(h) is the CLI's one runner.
    - lib/agent-tools/tools/nexus/command.js (nexus.command.tool) — runs any row for an agent; returns the row's RAW
      JSON (trimmed to MAX_CHARS). The readable printer is never used outside the terminal.
    - lib/listener-commands.js — `nexus> …` lines → nexus.command; summary() shows result.text, else JSON.
    - clear-glass/src/copilot/bridge.js send() — no-model paths in order: nexus> (0.59.9), archive drop box, visit/go to,
      "what do you see"; everything else → _ask → copilot :3750 /api/prompt → Ollama/Guardian.
    - copilot/server.js /api/prompt — regex intercepts before the model: capabilities, nexus-awareness (rundown, what's
      wrong, versions, Clear Glass state, opportunities, memory directory), accounts, user-model, autonomy-router;
      then lifeline.route (Ollama first, Guardian on low confidence).
    - copilot/intuition.js — greetings and pattern answers with modelUsed 'data-only' ("hello" → "Ready.").
    - lib/context-atlas.js (nexus.context.tool) — deterministic search over ~70 memory tables, specs, changelogs.
    - docs/atlases/copilot-atlas.md §2 "Talking to it — plain words first" — the user guide's table of what plain words do.
  missing:
    - M1 a plain question about Nexus ("what's unbuilt?", "which models are loaded?", "how's memory?") reaches the 3B
      model with no Nexus data in hand; it answers "Could you please provide more details" (his pane, 2026-10-10).
    - M2 a command's answer, outside the terminal, is raw JSON: an agent or the pane reads `{"report":{"current":…}}`
      where the terminal shows "memory 3.1GB free of 15.9GB". More tokens, less sense (the Leverage rule).
    - M3 nothing says which plain words reach which command; a row cannot say it.

  # ── Design ─────────────────────────────────────────────────────────────────
  design: >
    One table, no new door (Leverage): a row of SPEC may carry `ask` — the plain words that mean it, and the flags they
    imply. The row's own print() renders the answer as plain text (h.c without colour, console captured), so every
    caller — the pane, a watched chat, an agent through nexus.command — reads the same text the terminal shows.
    copilot/lib/nexus-ask.js matches a message against the rows' `ask`, runs the row through nexus.command, and says
    `⌘ Nexus · <command>` with the text and the exact command line (so he learns it). No model in the path; deterministic,
    works with Ollama down. Only rows with `ask` are reachable by plain words; a row that changes Nexus gets `ask` only
    when it is his own words that say so ("idea: …" → dump).

  phases:
    - id: TN1
      title: the row's printer as plain text
      build: route-commands.js renderText(row, d, a) — print() with h.c as identity, header/shortRepo/die plain, console.log
             and stdout captured; nexus.command returns `text` beside `result`; listener-commands summary() prefers it.
      proof: test — census/perf/models rows render to plain text with no ANSI codes; summary() uses r.text.
    - id: TN2
      title: plain words on the rows
      build: `ask: { re, flags?(m), args?(m) }` on census, models, perf, activity, nerve, store, picks, access, ollama tape,
             field windows, and dump ("idea: …"). copilot/lib/nexus-ask.js match(message) → { key, args, flags } | null;
             answer(message) → { text, command } through nexus.command.
      proof: test — 20 phrasings reach the right row and flags; ordinary chat ("help me with jobs", "hello",
             "tell me about this page") reaches none.
    - id: TN3
      title: wired where he talks
      build: clear-glass bridge.send — after nexus>/archive/browse/screen, before the model (modelUsed 'nexus');
             copilot/server.js /api/prompt — after nexus-awareness, for every other channel (model_used 'nexus-ask').
      proof: test — the pane answers "what's unbuilt?" with census --specs unbuilt, no model call.
    - id: TN4
      title: the command, the screen, the registry
      build: `ask <words>` row is not needed — nexus-ask is reachable through the pane and /api/prompt; agents already hold
             nexus.command, which now returns text. UI: the pane's /help names plain-words Nexus and nexus>; the atlas
             §2 table gains the rows. loom: copilot.lib.nexus-ask with its require() wires. Addenda on copilot.spec.
      proof: test-loom wiring sees the component with edges; atlas lists the phrasings.
  deferred:
    - TN5 a question that names Nexus but matches no row → context-atlas search hits given to the model as grounding.
      Deferred: the search walks ~70 tables in the Clear Glass main process on every message; measure first.
