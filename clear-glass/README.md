# Clear Glass v3 — NEXUS Sovereign Browser

**Architecture: →E→E→ (SISO-native)**

Every behavior is a Gate on a Stream. No module talks to another directly.
Commands arrive as Events. Gates transform them. SSE broadcasts results.

## §ADDENDUM 2026-07-11 (7) — v3.8.0, a mistake in my own previous fix, corrected, plus two more real ones found the same way

Caught on re-audit, not by being told: addendum (6)'s fix was itself
wrong in one detail. `context:switch` already had a real, correctly-
matched gate (`switchTo` — switch which agent's context is active) that
the original fire-and-forget emit genuinely reached; that path was never
broken. What was actually true is narrower: no IPC channel for
`switchFingerprint` (the identity-spoofing method) ever existed at all —
not a name mismatch, a channel that was simply never added. My first fix
repurposed `context:switch` for fingerprint switching instead of adding
a new one. Nothing broke (nothing in the renderer called it before I
added the identity badge), but it left `switchTo()` unreachable by IPC
and used the wrong channel for the job. Restored `context:switch` to its
real purpose and added `context:switchFingerprint` as a genuinely new
channel — the identity badge now calls the correct one.

While re-checking for this class of bug systematically (comparing every
`rendererEmit(...)` fire-and-forget call against the real gate registry
in `src/gates/index.js`), found two more of the *exact* same disease:
`copilot:build` and `copilot:diagnose` emitted local bus events
(`'copilot.build'`, `'copilot.diagnose'`) that no gate anywhere
subscribed to — while `src/copilot/bridge.js` has real, working
`build()`/`diagnose()` methods that correctly dispatch through Bridge to
the actual copilot service, with two live callers already (nothing
renderer-facing, but real). Fixed both handlers to call the real methods
directly. Added the first UI for them too: `/build <description>` and
`/diagnose <topic>` as slash commands in the existing co-pilot input box
— this is the first working path from "type something in Clear Glass"
to "co-pilot builds it," which is the actual thing asked for many turns
back in this session, now reachable from inside the browser itself.

## §ADDENDUM 2026-07-11 (6) — v3.7.0, a real "built but never connected" gap closed

Went looking for "expand the code, then rebuild the UI." First pass was
wrong: I assumed the renderer barely called any of the real backend API
and said so — that was a bad grep, not a real finding. `renderer/
browser.js` already calls bookmarks, rewind, providers, cookies, DOM
driver, mesh, diagnostics, and userscripts extensively. Corrected course
and diffed the *actual* full IPC surface (`src/preload/index.js`) against
every handler registered anywhere (`src/main/index.js` +
`src/ipc/bridge.js`) to find the real gap instead of guessing from a
narrower search.

Found one, and it's a good one: `ContextManager.switchFingerprint()` —
spoof this tab's browser identity as Chrome/Firefox/Safari/Edge, generate
a fresh profile, swap the user agent — is real, complete, and already
had two live callers: `main/index.js` auto-triggers it when a page shows
hostile/blocking behavior, and it's registered as a copilot tool
(`context.fp.switch`) so you can already ask co-pilot to do it. The only
path that never worked was a human clicking something — the manual IPC
handler (`context:switch`) emitted an event, `'context.switch'`, that
nothing in the entire codebase ever subscribed to. The real gate is
registered under `'context.fp.switch'` — one word different, silently
wrong for as long as this handler has existed.

Fixed the handler to call `switchFingerprint()` directly (and return the
real result — new mode + UA — instead of firing into the void), and
added the first manual UI for it: an identity badge next to the existing
agent-window switcher, same interaction pattern (click → dropdown →
pick), Chrome/Firefox/Safari/Edge. It also listens for
`context.fp.switched` so it stays honest when hostile-detection rotates
your fingerprint automatically — the badge won't say "Chrome" while
you're actually spoofing Firefox because a page forced a rotation you
didn't ask for.

Not verified live — same Electron limitation as everything else marked
this way in this file. Syntax-checked, and the full call chain traced by
hand end to end (renderer → preload → ipc handler → ContextManager →
back), but nobody has clicked the actual button yet.

## §ADDENDUM 2026-07-11 (5) — v3.6.0, a real regression from my own earlier fix

The GPU crash fix in addendum (1) below stopped the fatal crash-loop, but
broke something worse: it rendered the actual page content as a solid
black screen, confirmed live via a screenshot (browser chrome — toolbar,
health indicators — painted correctly; the `<webview>` content area did
not). This app's windows are all `frame: false` with `webviewTag: true`,
and both of those depend on the GPU process for compositing — the
original fix's three switches (`--disable-gpu`,
`--disable-gpu-compositing`, `--disable-software-rasterizer`) removed
that process entirely, which is a known, documented way to get exactly
this black-screen failure with this window configuration.

Replaced with a narrower fix aimed at the actual failure: `error_code=18`
on Windows is very commonly a GPU **sandbox** initialization failure
specifically, not a general incapacity to use the GPU at all.
`--disable-gpu-sandbox` removes just the sandbox restriction the process
was failing to initialize under, leaving the process itself — and
therefore compositing for frameless windows and webviews — intact.
Paired with `--disable-gpu-process-crash-limit` as a defensive companion:
doesn't prevent a crash, but stops Chromium's own internal crash-count
circuit breaker from escalating an occasional GPU hiccup into the same
fatal app-kill, independent of whether the sandbox fix fully holds.

Not verified live — same limitation as every GPU-related note in this
file: no Electron here to run it. The `process-monitor.html` tool (built
specifically for questions like this) is what caught the black-screen
regression in the first place; use it again after this change to confirm
compositing actually recovered rather than taking this note's word for it.

## §ADDENDUM 2026-07-11 (2) — v3.3.0, fixed from a real crash log

You ran this on a real Windows machine and it caught two things no amount
of code review here would have: `app.disableHardwareAcceleration()` alone
didn't stop the GPU process from being spawned for software compositing —
on this machine that process itself failed to launch (`error_code=18`,
`FATAL: GPU process isn't usable. Goodbye.`), crashing Clear Glass
entirely and taking every provider window down with it (repeated `oom`/
`launch-failed` on claude/chatgpt/gemini/perplexity as autopilot kept
respawning into the same failure). Added `--disable-gpu`,
`--disable-gpu-compositing`, `--disable-software-rasterizer` — removes
the GPU process from the picture entirely instead of just deprioritizing
it. Standard fix for this exact fatal error on constrained/virtualized
Windows hosts.

Separately: `copilot/bridge.js` had already self-diagnosed, across three
prior debugging rounds, that `fetch()` fails against `bridge:9999`
specifically (`ERR_STREAM_PREMATURE_CLOSE`) while `http.request()` against
the identical URL/payload succeeds — confirmed live in your boot log
("http.request FALLBACK succeeded where fetch() failed — status 200").
Its own logged conclusion, "Real fix: switch this function to
http.request permanently," is now the actual code — both bridge call
sites (`_bridgeHandshake`, `_bridgeDispatch`) use `http.request` as
primary rather than trying `fetch()` first and eating the failure. This
likely also explains the guardian NCP connect/disconnect cycling in the
same log — every co-pilot prompt and guardian command routes through
`_bridgeDispatch`.

Not fixed this round, flagged from the same log for later: `/cfr/field`
returning without a numeric `tension` field (cfr-influence polling skips
gracefully, doesn't crash, but the field itself is worth checking), 6
systems with spec/code version drift (orchestrator, bridge, guardian,
copilot, forge, spec-drift itself), 12 systems with no spec at all, and
ErosmancerOS not running (`ECONNREFUSED 127.0.0.1:7432` — ClearGlass/Wire
retries on first driver call rather than failing, so this may be
intentional if you don't run it every session).

## §ADDENDUM 2026-07-11 (3) — v3.4.0, lighter by default

Every boot was unconditionally spawning 4 hidden full Chromium renderer
windows (claude, chatgpt, gemini, perplexity) via `providerHost.
autoBootAll()`, whether or not you were about to use any of them —
`src/gates/index.js` already boots a provider on-demand the instant
something actually needs it, so the eager pre-warm was pure duplication
of a lazy path that already worked. Default is now lazy-only — nothing
pre-warms. Set `CG_AUTOBOOT_PROVIDERS=claude,chatgpt` to pre-warm
specific ones back, or `CG_AUTOBOOT_PROVIDERS=all` for the old behavior.
Combined with the GPU-crash fix above (which was itself causing repeat
respawns of all 4 windows every time the crash loop fired), this should
meaningfully cut idle resource use.

## §ADDENDUM 2026-07-11 (4) — real process instrumentation, not more claims

Every fix above this point was verified by syntax check and reading
Electron's documented behavior — never by watching real numbers on a
real machine, because this sandbox can't run Electron. That's a real
limit, not something to explain away.

**`src/diagnostic/process-metrics.js`** (new) polls `app.getAppMetrics()`
— Electron's own real, OS-level list of every process it has spawned,
with real CPU/memory numbers — and `app.getGPUFeatureStatus()`, which is
Chromium's own report of whether GPU features are actually
disabled, not our assumption that `--disable-gpu` worked. Streams as
`process.metrics` over the existing SSE connection (`:7701/events`) and
is available on demand at `GET /api/metrics`.

**`tools/process-monitor.html`** (new) — open this directly in any
browser (works as a plain `file://` page — CORS is already open on the
SSE server) while Clear Glass is running. Live-updating: total process
count, memory, a process-type breakdown, and a large unmissable banner
that reads **"No GPU process running — the fix is holding"** in green,
or **"N GPU process(es) running"** in red if it isn't. This is the
direct, checkable answer to whether the 2026-07-11(1) GPU fix actually
took effect on your specific machine — not my claim about it.

## §ADDENDUM 2026-07-11 — v3.2.0, renderer decomposed

`renderer/browser.html` was 1879 lines with ~1600 of that as one inline
`<script>` block. Extracted to `renderer/browser.js` (external, same-origin
`<script src>`); `browser.html` is 275 lines now, structure only. CSP's
`script-src` dropped `'unsafe-inline'` — nothing inline left to justify it
(`style-src` keeps it; inline `style="..."` attributes weren't part of
this pass). `npm test` below is unaffected — it exercises `src/`, not
`renderer/`, and was re-run after the extraction (46/46, unchanged).

---

## Boot

```bash
npm install
npm test       # 46 tests total (29 bus + 17 watchdog), pure Node — no Electron needed
npm start      # Launch browser

```

---

## SISO Architecture

```
Command arrives
  → emit(Event)
    → Stream looks up Gate by event.type  [O(1)]
      → Gate.transform(event, stream)
        → stream.emit(new Event(...))     [depth-first]
          → SSE broadcasts to NEXUS
```

### Gate inventory

| Signature | What it does |
|---|---|
| `driver.exec` | Browser automation — click, type, navigate, screenshot |
| `dom.query` | Query live DOM tree |
| `dom.mutate` | Mutate DOM node |
| `dom.pick` | Register element picker result |
| `dom.tokens` | Token archaeology scan |
| `context.create` | New agent partition |
| `context.switch` | Switch active agent |
| `context.fp.switch` | Switch fingerprint mode |
| `cookie.save` | Save account cookies |
| `cookie.restore` | Restore cookies from vault |
| `cookie.snapshot` | Snapshot session |
| `cookie.health` | Token validity check |
| `copilot.message` | Send to Cortex co-pilot |
| `mesh.spawn` | Spawn free AI agent |
| `mesh.send` | Send prompt to agent |
| `mesh.route` | RAID-route to best agent |
| `mesh.enqueue` | Queue task |
| `diag.run` | Run diagnostic suite |
| `diag.nexus` | NEXUS UI audit |
| `diag.page` | Page audit |
| `url.listen` | Add URL pattern listener |
| `url.listen.remove` | Remove listener |
| `window.open` | Open agent window |
| `window.close` | Close window (destroy) |
| `window.minimize` | Minimize window to taskbar |
| `window.hide` | Hide window to tray |
| `options.get` | Read Nexus options |
| `options.set` | Write Nexus options |
| `status.request` | Get full system status |
| `lifecycle.ready` | Boot complete |
| `lifecycle.shutdown` | Shutdown |

---

## Ports

| Port | Service |
|---|---|
| 7701 | SSE event stream |
| 7702 | IPC command endpoint |
| 7703 | TLS proxy (Firefox JA4) |

---

## NEXUS integration

All commands via POST to `:7702/cmd`:
```json
{ "eventType": "driver.exec", "data": { "action": "navigate", "agentId": "default", "url": "https://example.com" } }
```

Subscribe to all events:
```
GET http://localhost:7701/events
```

---

## Fix: orchestrator.js `Cannot find module './lib/intent-map'`

Wrong directory. Run from inside the extracted NEXUS folder:
```
cd nexus-complete-v1_0_9
npm start
```

See `fix-orchestrator.js` for diagnosis tool.

---

## Test results

```
[1] SISO Core           12/12 ✓
[2] Gate factory         3/3  ✓
[3] Bus singleton        4/4  ✓
[4] URL Listener         5/5  ✓
[5] Fingerprint Engine   5/5  ✓
Total: 29/29 ✓
```
