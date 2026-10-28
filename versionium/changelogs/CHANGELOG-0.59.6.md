# 0.59.6 — 2026-10-10

James opened this chat in Clear Glass and sent "open". Then he pasted his boot log and a screenshot: the `nexus> census --limit 3` line was on the page, and nothing ran.

## Why the command didn't run, and the fix

0.59.5 treated everything already on the page when it opened as history. James opened the chat after the command was posted, so the command was swallowed.

Now, in `clear-glass/src/page/nexus-chat.js`:

- **First open:** the page's newest `nexus> ` line runs, once it has stayed the same for two reads. Older lines never run.
- **Reload:** reloading the same page in the same session replays nothing. The lines already run are kept per URL.
- **Restart:** after a Clear Glass restart, the newest line can run once more. It is read-only.
- **Moving to another chat in the page** counts as a first open of that chat.
- Clear Glass now logs `[ClearGlass/nexus-chat] watching <url>`, so the log shows whether a page is being watched.
- `nexusChat.urls` is now actually read. `NexusOptions.get()` takes no key, so the option was always ignored before.
- No line of the typed answer starts with `nexus>`. Before, only the first line was guaranteed.

## From his boot log

- **`[system-map] persist failed: ENOENT rename …system-map.json.tmp`:** Idearium and ollama-bridge shared one tmp file. Each write now gets its own tmp name (pid plus random), and the tmp file is removed if the rename fails (`cos/host/system-map.js`).
- **Hundreds of `[cortex/snapshot] prune could not remove … ENOENT` lines:** a file that is already gone is what pruning wanted, so it is no longer a warning. Other errors still warn (`versionium/lib/snapshot.js`).
- **`[idearium] auth — disabled (internal-only, reached via orchestrator)`:** this was stale since 0.58.0. Idearium now prints the real `access.mode` and who needs an app password.

## Co-pilot, from his panel

- **Reading the screen:** "what do you see", "what's on the screen", "read the page", "safeway.com its on the screen", and "visit google.com what do you see" now read the tab (title, URL, numbered targets) instead of asking the model, which had answered "Could you please provide more details…" (`clear-glass/src/copilot/verbs.js` `screenIntent`, `bridge.js` `_read`).
- **"What do you know about me":** this no longer prints "?:? → unknown (0×, 0%)" five times. Empty crystal rows are dropped (`copilot/intuition.js`).

## Not fixed: navigation is inconsistent

"go to google.com" once answered `[driver: guardian.dispatch]`, and "visit bing.com" once got a model reply. Both match the browse rule, which needs no model, so those messages likely reached the model by another route. This isn't reproduced here.

## Tests

- `test-nexus-chat`: 6/6. NC-02 was rewritten for the first-open rule, and NC-06 is new.
- `test-cg-copilot-verbs`: 7/7, including the new CV-07.
- `test-snapshot-half-life-prune`: 7/7.
- `test-event-contracts`: 8/8.
