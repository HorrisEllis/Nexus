# 0.59.10 — 2026-10-10

James pasted what his chat got back:

    ⌘ Nexus ran: list shows every command.
    ✗ no Nexus command "list shows"

The agent's own reply contained the bullet "`nexus> list` shows every command." On the page that line starts with `nexus>`, so the watcher ran it as a command and typed the error into the chat.

## Changes

- **Prose is not answered** (`clear-glass/src/page/nexus-chat.js` 1.5.0): a `nexus>` line on a watched chat that names no command is logged and shown in the co-pilot pane as "⌘ not run (no such command, not answered in the chat)". Nothing is typed into the chat. A real command that fails still gets its ✗ typed back.
- **`nexus> list` works everywhere** (`lib/listener-commands.js` 1.1.0): `list`, `help` and `commands` now list every command from a chat or a listener too. Before, only the co-pilot pane had this. The list may run up to 8000 characters; other answers are still cut at 1200. The runner marks an unknown line `unknown: true`.
- The co-pilot pane uses the same shared list (`commandList`); its own copy is removed.

## Tests

- `test-listener-commands` passes 5/5. LC-05 is new: `list` lists the commands, and an unknown line is marked unknown.
- `test-nexus-chat` passes 8/8. NC-08 is new: prose that starts with `nexus>` is not typed back.
- `test-cg-copilot-verbs` passes 9/9 and `test-event-contracts` passes 8/8.
