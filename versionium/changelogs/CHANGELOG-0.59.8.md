# 0.59.8 — 2026-10-10

James's 0.59.7 log said `https://claude.ai/code/session_01UXsXr4…: 0 command line(s) on the page`. His screenshot from the same moment showed two `nexus>` lines on that page. So Clear Glass could not see the lines; whether a command ran was never the question.

## Changes to the reader (`clear-glass/src/page/nexus-chat.js`)

- **Wait for the messages:** a chat app draws its messages after the page has loaded. The reader now waits up to 15 seconds for them before deciding what is history, so the first read no longer sees an empty page.
- **Read everything on the page:** the reader now checks every frame and every open shadow root, not only the top page. The answer is typed into the frame where the lines were found.
- **Say what it sees:** on open, the log shows one line describing the page: how much text it has, how many iframes and shadow roots, and whether "nexus>" appears anywhere. It also logs each change in the number of command lines.
- **Cut off hung commands:** a command that hangs is stopped after 30 seconds and the timeout is logged. Before, it blocked the reader with no message.

## Tests

`test-nexus-chat` passes 7/7:
- NC-07 is new: a page that draws its messages late still runs its newest line.
- NC-05 now reads a line inside a shadow root.
