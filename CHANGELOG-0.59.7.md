# 0.59.7 — 2026-10-10

James restarted on 0.59.6 and said "try now". His log showed `[ClearGlass/nexus-chat] watching https://claude.ai/code/session_01UXsXr4…`, and then nothing more about the chat page. The log gave no sign that the command ran, and no sign that it failed, because every failure was silent.

## The chat loop says what it does (`clear-glass/src/page/nexus-chat.js`)

The boot log now has a line for each step:
- **On open:** how many `nexus>` lines it found on the page, and which one is newest.
- **After a command:** which command ran, and whether it ended ok, refused, or with an error.
- **After answering:** whether the answer was typed into the chat and sent, or why not.
- **If the page can't be read:** a line saying so.

Two silent failures are fixed:
- **Command tool fails:** the failure is now reported instead of swallowed.
- **Non-breaking space:** a `nexus>` line in a code block can render the space after `nexus>` as a non-breaking space (U+00A0). 0.59.6 didn't match those lines. They count now.

## Tests

`test-nexus-chat`: 6/6. NC-05 reads a non-breaking-space line in Clear Glass's own engine.
