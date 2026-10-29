# 0.39.365 — 2026-10-07

James: "can you make sure the claude provider is…" (the message was cut off there), with this from his console:

```
[ProviderHost] claude loadURL failed: ERR_FAILED (-2) loading 'https://claude.ai'
[ProviderHost] claude window spawned → https://claude.ai
[guardian] queued 4ef2d1b4… — waiting for claude userscript
```

The job then waited forever. Gemini's tab, opened for the same repo's hat two minutes earlier, never reported anything at all.

## What was wrong
1. **A failed load was reported as started.** The window stayed in the map, so every later `start()` answered "already-running": a dead tab, never retried.
2. **Nothing said which URL failed or why.** `loadURL` only names the first URL. The real failure can be a redirect target, such as a login page or a challenge.
3. **Guardian asked Clear Glass to open the tab, then dropped the answer.** It gave up after 2 s and ignored the body, so a tab that never loaded left its jobs queued with nothing to wake them.

## Now
- **Every failed load is recorded** from `did-fail-load`: code, reason, and the URL it actually failed at. ERR_ABORTED (-3) is a redirect replacing the first navigation, so it's no longer counted as a failure.
- **Retried twice.** Before the second try, the tab's service workers and cache storage are cleared. A stale service worker is the usual cause of an instant ERR_FAILED, and cookies are kept, so the login survives.
- **A load still running after 30 s is left to finish.** The userscript is injected when it does, and the log says "still loading" instead of hanging the start.
- **Three failures:**
  - the window is closed;
  - `provider.host.load_failed` is posted with the reasons;
  - the next request starts clean.
- **Guardian waits up to 90 s for the answer.** If the tab didn't load, every job queued for that provider fails with "the claude tab did not load: <reason>". Its caller then moves on: a phase build climbs to its next rung instead of sitting out its own timeout.

## What this can't settle from here
**Why claude.ai refuses to load on James's machine can't be seen from this container.** There's no Electron and no claude.ai session here. The next boot's log will now name the URL and reason, for example `ERR_FAILED (-2) at https://claude.ai/login…`, which settles it. If clearing the service workers fixes it, the retry will simply succeed.

## Proof
- New: `test-provider-host-load` 5/5. It runs the real ProviderHost against a fake Electron and covers:
  - retry after clearing;
  - an abort that isn't a failure;
  - three failures that close the window and leave the next start clean;
  - an agent tab removed after it fails;
  - guardian failing the jobs queued for a tab that didn't load.
- Unchanged and passing:

| Suite | Result |
|---|---|
| provider-host-one-tab | 7/7 |
| provider-host-respawn | 4/4 |
| guardian-dispatch-ladder | 18/18 |
| idearium-guardian-dispatch | 5/5 |
| dispatcher-deepseek-ncp | 2/2 |
