# 0.60.57 - 2026-10-15

James: "this is wrong... needs to start recording a macro node file. i was saying the whole process of the chat listener.. like expand the automation and macros."

## What changed
- **Record a macro creates the `.macro` node file when Start is pressed** (0 steps), then rewrites it every ~400 ms from all events so far. A closed dialog, a reload or a crash leaves a real file. Cancel stops the recorder and keeps the draft; nothing is deleted.
- **The page script keeps a queue** (`recorder-script.js`) that main drains. Events written just before a page unloads go to sessionStorage and are picked up by the next page. Navigation is seen in main (`did-navigate`, `dom-ready` reinstall).
- **More is captured:** scroll (summed per scroller), arrow keys, Page Up/Down, Home, End, Space (as real `pressKey` steps), and waits for pauses of 1.5 s or more (capped at 5 s). Passwords still become `{{password}}`.
- **The dialog:** Start disables once recording, shows the saved path and a live event/step count, and takes a name.

## Not done (mapped in docs/2026-10-15-macro-node-recording-phasemap.spec)
MR4-MR6: the chat-listener process (list chats, open one, scroll and read) as per-provider recorded nodes and automations. That is the part of his message about "the whole process"; the coder's reading of it is marked to confirm in the map.

## Proof
`tests/modules/test-live-recording.test.js` LR-01..LR-08 (jsdom + fake webContents). **Unverified:** the real Electron recorder, scroll events on a provider's inner scroller, and whether `pressKey` replays arrow keys on a live chat. A recording of a real chat is the check.
