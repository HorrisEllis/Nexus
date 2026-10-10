# 0.59.9 — 2026-10-10

James: "i want all sessions captured. i want this: ⌘ Nexus ran: census --limit 4 … hooked into copilot so you can talk to nexus".

## Talk to Nexus from the co-pilot (`clear-glass/src/copilot/bridge.js`, `verbs.js`)

- Type `nexus> census --limit 4` (or `nexus: …`, `/nexus …`) in the co-pilot pane. The line runs through the same command tool a watched chat uses (`lib/listener-commands.js`), and the pane answers `⌘ Nexus ran: census --limit 4` with the result. No model is involved.
- Because he types it in his own pane, commands that change Nexus run too. The rows that belong to the person (approving, stopping a system) are still refused by the tool, as everywhere.
- The same line typed again runs again. A watched chat page runs each line only once.
- `nexus> list` (or `help`) lists every command.
- New event `copilot.nexus.command` (`line`, `ok`, `refused`), declared in the taxonomy.

## Every session captured (`clear-glass/src/page/nexus-chat.js` 1.4.0)

- The chat watcher's default now covers all of `https://claude.ai/`: every Claude Code session and every claude.ai chat. Before, it covered only `https://claude.ai/code`. It is still read-only there, and `nexusChat.urls` still overrides the default.
- A chat's result in the co-pilot pane showed as `⌘ ⌘ Nexus ran`. It now shows one ⌘ and the session it came from (`— from session_…`). The result event carries `url`.

## Browse rule (handoff item 3)

- "ok go to google.com", "hey, just go to bing.com", "go to: google.com", "copilot, visit x" and `go to localhost:9000` (plain http) used to reach the model. They now take the browse rule. Prose such as "go to the store" still goes to the model.
- The "visit bing.com → Could you please provide more details" reply in his pane sits above the `restored 24 messages` line, so it is history from before 0.39.280. The current rule matches that phrase.

## Tests

- `test-cg-copilot-verbs` passes 9/9. CV-08 (browse phrasings) and CV-09 (`nexus>` in the pane: no model call, the result text, a repeated line runs again) are new.
- `test-nexus-chat` passes 7/7. NC-01 now checks that claude.ai chats are watched.
- `test-event-contracts` passes 8/8 and `test-listener-commands` passes 4/4.
