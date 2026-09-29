# clear-glass — Sovereign NEXUS Browser

> **v3.11.0 (active, 2026-09-23)** · 97 real components · account authority for NEXUS · Electron + Chromium + Firefox fingerprint + TLS JA4 + ErosmancerOS wire (SISO-native)

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Clear-glass is NEXUS's sovereign browser shell — one of the most actively developed subsystems in the codebase, per its own spec, despite not having had a `.spec` written until 2026-09-01. Its own spec was written *from* the live `registry-components.js` contract rather than from scratch: *"This spec is written FROM that live registry-components.js contract... §8.6 reuse-before-build, applied to spec authorship itself."* — the same discipline `architecture-spec.spec` used for itself, confirmed here as a real, repeated house convention rather than a one-off.

---

## Quick Start

Not confirmed this session.

---

## Architecture

### Governing axioms

| Name | Statement |
|---|---|
| `AX-001` | validate all inputs at boundary |
| `AX-002` | no silent failures — bus event on error |
| `AX-004` | self-describing — `registry-components.js` served at `/contract` |
| `AX-010` | sovereign transport — no cross-system `require()` into this tree |

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| clear-glass's "routes" | `ipcMain.handle()` channels — `{method: 'IPC', path: <channel name>}` | HTTP method/path pairs. Its own spec is explicit: *"a spec claiming HTTP method/path pairs for these would misrepresent the transport"* — clear-glass is an Electron shell, not a web server |

### Sovereignty (cross-system contract)

Real, multi-port surface: `ipc: 7702` (orchestrator polls `/contract` here), `sse: 7701`, `tls: 7703`, `wire: 7704`.

---

## The Modules

---

### registry-components

**id:** `clear-glass.registry-components`
**path:** `clear-glass/registry-components.js:1` — [open](clear-glass/registry-components.js#L1)

**What it does**

The real, live self-description contract — served at `GET /contract`
on the IPC server (`:7702`), verified by orchestrator's
contract-handshake on boot. **Stale-data correction, this pass:** an
earlier version of this atlas cited "67 components across 11
families" from `clear-glass.spec` (v3.1.0, 2026-09-01). The real file
as of `v0.39.214` is **v3.9.0, 79 components** — re-extracted directly
this pass, not assumed current from the earlier read. `clear-glass.spec`
itself is now stale relative to its own source.

**Every real component, addressed by file:line — not a family summary**

| id | IPC channel | file:line | tags |
|---|---|---|---|
| `cg.health` | `GET /health` | [`registry-components.js:42`](clear-glass/registry-components.js#L42) | health |
| `cg.status` | `GET /status` | [`registry-components.js:43`](clear-glass/registry-components.js#L43) | health |
| `cg.contract` | `GET /contract` | [`registry-components.js:44`](clear-glass/registry-components.js#L44) | health |
| `cg.events` | `GET /events` (SSE) | [`registry-components.js:45`](clear-glass/registry-components.js#L45) | stream |
| `cg.driver.exec` | `POST /cmd` | [`:48`](clear-glass/registry-components.js#L48) | driver, automation — typecode `CG-DRV-001` |
| `cg.dom.query` | `POST /cmd` | [`:53`](clear-glass/registry-components.js#L53) | dom — `CG-DOM-001` |
| `cg.dom.mutate` | `POST /cmd` | [`:54`](clear-glass/registry-components.js#L54) | dom — `CG-DOM-002` |
| `cg.dom.pick` | `POST /cmd` | [`:55`](clear-glass/registry-components.js#L55) | dom, seam — `CG-DOM-003` |
| `cg.dom.tokens` | `POST /cmd` | [`:56`](clear-glass/registry-components.js#L56) | dom, archaeology |
| `cg.context.create` | `POST /cmd` | [`:59`](clear-glass/registry-components.js#L59) | context — `CG-CTX-001` |
| `cg.context.switch` | `POST /cmd` | [`:60`](clear-glass/registry-components.js#L60) | context — `CG-CTX-001` |
| `cg.context.list` | `GET /contexts` | [`:61`](clear-glass/registry-components.js#L61) | context |
| `cg.context.fp.switch` | `POST /cmd` | [`:62`](clear-glass/registry-components.js#L62) | context, fingerprint — `CG-CTX-002` |
| `cg.cookie.save` | `POST /cmd` | [`:65`](clear-glass/registry-components.js#L65) | cookie — `CG-CKI-001` |
| `cg.cookie.restore` | `POST /cmd` | [`:66`](clear-glass/registry-components.js#L66) | cookie — `CG-CKI-002` |
| `cg.copilot.message` | `POST /cmd` | [`:69`](clear-glass/registry-components.js#L69) | copilot — `CG-CPL-001` |
| `cg.mesh.spawn` | `POST /cmd` | [`:74`](clear-glass/registry-components.js#L74) | mesh — `CG-MSH-001` |
| `cg.mesh.send` | `POST /cmd` | [`:75`](clear-glass/registry-components.js#L75) | mesh — `CG-MSH-002` |
| `cg.mesh.route` | `POST /cmd` | [`:76`](clear-glass/registry-components.js#L76) | mesh, raid — `CG-MSH-003` |
| `cg.mesh.list` | `GET /agents` | [`:77`](clear-glass/registry-components.js#L77) | mesh |
| `cg.url.listen` | `POST /cmd` | [`:80`](clear-glass/registry-components.js#L80) | listener — `CG-URL-001` |
| `cg.url.listen.list` | `GET /listeners` | [`:81`](clear-glass/registry-components.js#L81) | listener |
| `cg.diag.run` | `POST /cmd` | [`:84`](clear-glass/registry-components.js#L84) | diagnostic — `CG-DGN-001` |
| `cg.diag.nexus` | `POST /cmd` | [`:85`](clear-glass/registry-components.js#L85) | diagnostic — `CG-DGN-002` |
| `cg.window.open` | `POST /cmd` | [`:88`](clear-glass/registry-components.js#L88) | window — `CG-WIN-001` |
| `cg.window.close` | `POST /cmd` | [`:89`](clear-glass/registry-components.js#L89) | window — `CG-WIN-002` |
| `cg.wire.health` | `GET /wire/health` | [`:92`](clear-glass/registry-components.js#L92) | wire |
| `cg.wire.eros.proxy` | `POST /eros/*` | [`:93`](clear-glass/registry-components.js#L93) | wire, eros |
| `cg.wire.driver.bridge` | `POST /bridge/driver` | [`:94`](clear-glass/registry-components.js#L94) | wire, driver |
| `cg.wire.hostile` | `POST /hook/hostile` | [`:95`](clear-glass/registry-components.js#L95) | wire, security |
| `cg.wire.behavior` | `POST /hook/behavior` | [`:96`](clear-glass/registry-components.js#L96) | wire, intelligence |
| `cg.calltos.list` | IPC `calltos:list` | [`:107`](clear-glass/registry-components.js#L107) | guardian, callto |
| `cg.calltos.forUrl` | IPC `calltos:forUrl` | [`:108`](clear-glass/registry-components.js#L108) | guardian, callto |
| `cg.calltos.remove` | IPC `calltos:remove` | [`:109`](clear-glass/registry-components.js#L109) | guardian, callto |
| `cg.downloads.listListeners` | IPC `downloads:listListeners` | [`:112`](clear-glass/registry-components.js#L112) | downloads, listener |
| `cg.downloads.registerListener` | IPC `downloads:registerListener` | [`:113`](clear-glass/registry-components.js#L113) | downloads, listener |
| `cg.downloads.updateListener` | IPC `downloads:updateListener` | [`:114`](clear-glass/registry-components.js#L114) | downloads, listener |
| `cg.downloads.removeListener` | IPC `downloads:removeListener` | [`:115`](clear-glass/registry-components.js#L115) | downloads, listener |
| `cg.siteSettings.get` | IPC `site-settings:get` | [`:118`](clear-glass/registry-components.js#L118) | site-settings |
| `cg.siteSettings.getAll` | IPC `site-settings:getAll` | [`:119`](clear-glass/registry-components.js#L119) | site-settings |
| `cg.siteSettings.set` | IPC `site-settings:set` | [`:120`](clear-glass/registry-components.js#L120) | site-settings |
| `cg.siteSettings.deleteKey` | IPC `site-settings:deleteKey` | [`:121`](clear-glass/registry-components.js#L121) | site-settings |
| `cg.siteSettings.clear` | IPC `site-settings:clear` | [`:122`](clear-glass/registry-components.js#L122) | site-settings |
| `cg.siteSettings.listOrigins` | IPC `site-settings:listOrigins` | [`:123`](clear-glass/registry-components.js#L123) | site-settings |
| `cg.history.list` | IPC `history:list` | [`:126`](clear-glass/registry-components.js#L126) | history |
| `cg.history.delete` | IPC `history:delete` | [`:127`](clear-glass/registry-components.js#L127) | history |
| `cg.history.clear` | IPC `history:clear` | [`:128`](clear-glass/registry-components.js#L128) | history |
| `cg.extensions.list` | IPC `extensions:list` | [`:131`](clear-glass/registry-components.js#L131) | extensions |
| `cg.extensions.load` | IPC `extensions:load` | [`:132`](clear-glass/registry-components.js#L132) | extensions |
| `cg.extensions.unload` | IPC `extensions:unload` | [`:133`](clear-glass/registry-components.js#L133) | extensions |
| `cg.extensions.pickDirectory` | IPC `extensions:pickDirectory` | [`:134`](clear-glass/registry-components.js#L134) | extensions |
| `cg.bookmarks.addWithState` | IPC `bookmarks:addWithState` | [`:137`](clear-glass/registry-components.js#L137) | bookmarks, rewind |
| `cg.bookmarks.openWithState` | IPC `bookmarks:openWithState` | [`:138`](clear-glass/registry-components.js#L138) | bookmarks, rewind |
| `cg.rewind.list` | IPC `rewind:list` | [`:141`](clear-glass/registry-components.js#L141) | rewind |
| `cg.rewind.snapshot` | IPC `rewind:snapshot` | [`:142`](clear-glass/registry-components.js#L142) | rewind |
| `cg.rewind.restore` | IPC `rewind:restore` | [`:143`](clear-glass/registry-components.js#L143) | rewind |
| `cg.rewind.clear` | IPC `rewind:clear` | [`:144`](clear-glass/registry-components.js#L144) | rewind |
| `cg.passwords.list` | IPC `passwords:list` | [`:147`](clear-glass/registry-components.js#L147) | passwords, security |
| `cg.passwords.delete` | IPC `passwords:delete` | [`:148`](clear-glass/registry-components.js#L148) | passwords, security |
| `cg.speech.available` | IPC `speech:available` | [`:151`](clear-glass/registry-components.js#L151) | speech |
| `cg.speech.transcribeBuffer` | IPC `speech:transcribeBuffer` | [`:152`](clear-glass/registry-components.js#L152) | speech |
| `cg.macros.list` | IPC `macros:list` | [`:155`](clear-glass/registry-components.js#L155) | macros |
| `cg.macros.get` | IPC `macros:get` | [`:156`](clear-glass/registry-components.js#L156) | macros |
| `cg.macros.run` | IPC `macros:run` | [`:157`](clear-glass/registry-components.js#L157) | macros |
| `cg.bgtab.open` | IPC `bgtab:open` | [`:160`](clear-glass/registry-components.js#L160) | bgtab |
| `cg.bgtab.close` | IPC `bgtab:close` | [`:161`](clear-glass/registry-components.js#L161) | bgtab |
| `cg.bgtab.list` | IPC `bgtab:list` | [`:162`](clear-glass/registry-components.js#L162) | bgtab |
| `cg.autofill.listProfiles` | IPC `autofill:profile:list` | [`:173`](clear-glass/registry-components.js#L173) | autofill |
| `cg.autofill.getProfile` | IPC `autofill:profile:get` | [`:174`](clear-glass/registry-components.js#L174) | autofill |
| `cg.autofill.createProfile` | IPC `autofill:profile:create` | [`:175`](clear-glass/registry-components.js#L175) | autofill |
| `cg.autofill.updateProfile` | IPC `autofill:profile:update` | [`:176`](clear-glass/registry-components.js#L176) | autofill |
| `cg.autofill.deleteProfile` | IPC `autofill:profile:delete` | [`:177`](clear-glass/registry-components.js#L177) | autofill |
| `cg.autofill.detect` | IPC `autofill:detect` | [`:178`](clear-glass/registry-components.js#L178) | autofill |
| `cg.autofill.fill` | IPC `autofill:fill` | [`:179`](clear-glass/registry-components.js#L179) | autofill |
| `cg.screenQa.detect` | IPC `screen-qa:detect` | [`:183`](clear-glass/registry-components.js#L183) | screen-qa |
| `cg.screenQa.answer` | IPC `screen-qa:answer` | [`:184`](clear-glass/registry-components.js#L184) | screen-qa |
| `cg.screenQa.inject` | IPC `screen-qa:inject` | [`:185`](clear-glass/registry-components.js#L185) | screen-qa |
| `cg.screenQa.elementAt` | IPC `screen-qa:element-at` | [`:186`](clear-glass/registry-components.js#L186) | screen-qa |
| `cg.screenQa.deriveQuestion` | IPC `screen-qa:derive-question` | [`:187`](clear-glass/registry-components.js#L187) | screen-qa |

**Real, dated context worth carrying forward verbatim** — this file's
own comment on the autofill/screen-qa rows (added 2026-09-22, the same
day as this pass): *"loom component registry... Real, already-shipped
IPC surface... with zero entries here — the same 'backend real,
registry never touched' gap this file's own downloads/macros/bgtab
entries exist to close, just never closed for these two."* This is the
exact same registry-drift failure class this whole session's node/
registry/watcher pattern was built to catch structurally instead of
by periodic manual audit.

**What it connects to**

- `orchestrator` — verifies this contract on boot
- `cortex` — handles `cortex.raid.decide` (real, `events.handles`)
- `guardian` — handles `guardian.job.dispatch.receive` (real, `events.handles`)

**Bus events emitted**

`clear-glass.boot.complete`, `clear-glass.window.opened`,
`clear-glass.registered`, `clear-glass.shutdown`,
`eros.hostile.detected`, `eros.behavior.plan`, `lifecycle.ready`,
`nexus.status` — real, from this file's own `module.exports.events.emits`.

---

## Accounts, login portals, vaults, Settings (3.10.0, 2026-09-23)

**Clear Glass is the account authority** (James: "yes clearglass" — D3 of the mesh-first phasemap). One account = one options-store uuid; that uuid is the `accountId` everywhere downstream.

| Path | What |
|---|---|
| `src/options/store.js` | accounts, `accountDefaults`, `resolveAccountForDispatch`, `recordSession` |
| `src/main/index.js` | `GET :7702/accounts/resolve` — what guardian's ladder asks (`guardian/lib/cg-account-authority.js`) |
| `src/accounts/login-portal.js` | sign-in window in `persist:mesh-<provider>-<accountId>`; capture → CookieVault `{agentId: provider, accountId}` |
| `src/security/vault-key.js` | safeStorage-sealed data key for both vaults, legacy-key read fallback |
| `renderer/settings.html` + `renderer/settings/` | Settings shell + `core.js` + one file per area under `sections/` |

End to end: **+** → account uuid → **Sign in** (portal, same partition the mesh uses) → **Save session** (vault) → guardian dispatch resolves the account from Clear Glass → mesh `spawn()` opens that partition and restores that vault entry.

## Job intake (3.11.0, v0.39.227)

Clear Glass takes guardian jobs in through `src/jobs/intake.js`, never by reading guardian's folder.

1. guardian writes `<jobId>.job` (required at creation).
2. guardian's ladder **claims** it on the `.job` — `transport: mesh`, `claimedBy: clear-glass` — before sending (required write).
3. `POST /agent-mesh/send` → intake reads the job back through guardian `GET /jobs?id=`; no claim → refused (`intake_refused`, nothing sent).
4. intake writes its own `<jobId>.intake` (`%APPDATA%|$HOME/.clear-glass/job-intake/`), then queues on the mesh DOM transport (idempotent by jobId).
5. `GET /agent-mesh/job` answers from the live queue, or — after a Clear Glass restart — `clear_glass_restarted`, `sent: null` (never resend). `GET /agent-mesh/intake` lists records.

## Settings UI files (v0.39.227)

`renderer/settings/sections/<area>.js` + `<area>.css` — one pair per area (14). `settings.css` = tokens, frame, shared components only. `core.js` sets `body[data-area]` and loads the area's CSS the first time it's shown; every area rule is scoped to it. Enforced by `tests/modules/test-cg-settings-ui-files.test.js`.

## Modules Not Yet Built

Real, from the spec's own `gaps`: `loom/scanners/spec-map.js`'s `SPEC_DIRS` allowlist does not include `clear-glass/spec` — this spec was not picked up by loom's own coverage scanner as of its last read (§SM1). Same real gap class as `loom.spec`'s own SM2 and `architecture-spec.spec`'s AS2 — three independent real systems with the identical unfixed gap.

## In Progress: TR1 (repo-derived agentId in dispatch)

**Phase node:** `clear-glass.TR1` · **status:** active — real chain fully patched, but deeper unresolved than originally diagnosed

Full real chain traced and patched this pass, five files, not one:

1. [`lib/repo-agent.js:322`](lib/repo-agent.js#L322) — builds `payload.agentId = repo-${repo.uuid}` (0.1.0→0.2.0)
2. [`copilot/server.js:2347`](copilot/server.js#L2347) — forwards `body.agentId` to `dispatchToNcpAgent`
3. [`copilot/lifeline.js`](copilot/lifeline.js) `_tryGuardian` — includes `agentId` in the real POST to guardian's `/api/copilot/prompt`
4. [`guardian/server.js:2898`](guardian/server.js#L2898) — forwards `body.agentId` into `askSync`'s opts
5. [`guardian/ask.js:181`](guardian/ask.js#L181) — passes `opts.agentId` into `createJob()`, whose real schema (`guardian/lib/jobs.js`) already had an `agentId` field, unused until now

**Logic-simulated end to end, all five hops' real transformation logic, not mocked behavior:** two different repos produce distinct final `job.agentId` values (`repo-repo-A` vs `repo-repo-B`); ollama-routed dispatch correctly carries none.

**The real, deeper gap this pass found, not assumed fixed:** the original phasemap diagnosis said *"guardian's own NCP dispatch resolves that agentId to a real clear-glass background tab."* Searched all of `guardian/` for any window/tab-selection mechanism (`BrowserWindow`, `tabPool`, `windowFor`, `selectWindow`) — **zero matches anywhere**, including `guardian/lib/ncp-handler.js` itself, which has no reference to clear-glass, its port `7702`, or its DOM IPC bridge at all. A job can now carry the correct `agentId` all the way to creation and still have nowhere real to be used — NCP dispatch has no per-window routing logic to consult it against. Closing TR1 for real needs new dispatch logic in guardian, likely using clear-glass's real `cg.window.open`/`cg.window.close` IPC components (already addressed above, `registry-components.js:88-89`), not just the field-plumbing done this pass.

---

## Version History

**Source:** hand-maintained — `clear-glass.spec`'s own `version_history`, real:

| Version | Date | Summary |
|---|---|---|
| 3.1.0 | 2026-09-01 | First real `.spec` authored, matching live code@3.1.0 exactly (no version bump required) |
| 3.1.0 | 2026-09-19 | 13 new real gates added (`mesh.workflow.*`, `mesh.list.*`) — closes a real gap: AgentMesh's own 10-method automation engine had zero gate coverage despite already backing BrainOS's UI. No version bump — same real object, same real methods, just now also reachable |
| 3.9.0 | 2026-09-22 (registry-components.js AND clear-glass.spec, confirmed) | **Correction to this atlas's own earlier claim:** an earlier pass of this atlas, built from an older snapshot, said `clear-glass.spec` was stale at v3.1.0/67 against a v3.9.0/79 `registry-components.js`. Re-checked directly against the current source: `clear-glass.spec` was already fixed the same day, its own `version_history` entry documenting the exact drift (plus `package.json` independently disagreeing too, reaching 3.8.0) and correcting all sources to 3.9.0. The lesson worth keeping, not the stale claim: this system had FOUR independent version fields disagreeing at once (`lib/version.js`, `main/index.js`'s `CG_VERSION`, `clear-glass.spec`, `package.json`) — a real, repeated pattern worth a structural fix, not just a one-time correction. |
| 3.10.0 – 3.13.2 | 2026-09-23 – 2026-09-25 | **Not rowed here** — this table was not kept up through those releases. They are recorded in `clear-glass.spec`'s `version_history` and in the sections above/below (accounts, job intake, agent tabs, downloads/Library). |
| 3.14.0 | 2026-09-25 (v0.39.251) | The element picker assigns provider selectors — see "The element picker assigns provider selectors" below. Versionium: see the spec entry's `versioniumCommitId`. |
| 3.14.1 | 2026-09-25 (v0.39.252) | `src/copilot/wake-relay.js` leaves an agent's "hey nexus" to guardian's wake-loop — see "The wake relay leaves agent wakes to guardian" below. |
| 3.15.0 | 2026-09-26 (v0.39.254) | The downloads manager logs every provider chat, one versioned record per chat — see "Every chat, one versioned record" below. |

**Whether clear-glass reports to Versionium separately** — not confirmed this session. Releases are recorded in Versionium from outside (`versionium/lib/engine.js` `commit`), and the id goes in the spec entry.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.

## Agent tabs restart as themselves (3.11.3, v0.39.237)

An agent tab (`${providerId}::${agentId}`) that crashes or closes unexpectedly restarts as the same agent tab, hidden. It used to call `start(providerId)` with no agentId, which started the **shared** provider window — a second instance.

`closeAgentTab()` — used by the idle sweep (15 min) and the LRU cap (6 tabs) — marks the window `_nexusIntentionalStop` before destroying it, the same flag `stop()` sets for shared windows. Without it, every intentional agent-tab close looked unexpected and started the shared window 5 s later.

Proven against the real `ProviderHost` class (only `electron` faked): `tests/modules/test-provider-host-one-tab.test.js`, 7/7, each fix mutation-checked.

## The downloads manager files every response under its agent (3.12.0, v0.39.239)

Guardian writes each completed agent reply into the downloads index (`src/downloads/artifact-chat-index.js`, COS compartment `clearglass-downloads-index`), and every file a provider tab downloads is recorded there too. Each item now carries `agent_id` and `job_id` as fields. `defaultRoot()` is the one place the index's folder is resolved; guardian's writer and recovery, the read routes and the download capture all call it.

`GET /cli/downloads/responses` (filters `agentId`, `jobId`, `provider`, `kind`) and `GET /cli/downloads/responses/:id` read it. The Library window's **Responses** tab (`ui/library/areas/responses.js` + `.css`) shows them by agent.

`download-capture` attaches once per provider session — every window of a provider shares one session, and it used to add a listener per window — and resolves which agent tab a download came from.

**☰ → 📚 Library (3.12.1, v0.39.240).** The Library window is also in Clear Glass's own ☰ menu (`renderer/browser.js`, `#bookmark-mgr-btn`), after History — the same window the tray opens (agentId `nexus-library`, `/ui/library/`).

## The element picker assigns provider selectors (3.14.0, v0.39.251)

Handoff 2026-09-25, step 1. Picking an element on a provider's page (◎ Element Picker, or the fallback picker) now offers it as that provider's **reply**, **input box** or **send button** in guardian's selector map (`guardian/lib/selector-map.js`, 0.39.249) — the map every userscript job reads, so the next job uses it without a release.

| piece | where | what it does |
|---|---|---|
| pick report | `renderer/guardian-picker.js` (one added line) | on click, `dom:event` `guardian.picker.picked` with the picker's own xpath and the page URL. Nothing about the picker's look changed (test SA-06 diffs it against git HEAD). |
| offer + UI | `renderer/selector-assign/selector-assign.{js,css}` | one area, one JS + one CSS, every rule under `#cg-selector-assign`. Only provider pages get an offer (`selectors:provider-for-url` → `src/providers/registry.js` hosts). Shows the selector, its matches and what it reads — outlined on the page — before anything is recorded; a failure shows why and every candidate tried, and cannot be assigned. |
| live check | `renderer/selector-check.js` (injected into the page) | generates a stable selector and checks it the way the consumer uses it. **resp**: the userscript takes the LAST `querySelectorAll` match's `innerText`, so the last match must be the pick, matches must not nest, it must hold text, and a selector matching every reply beats a one-off; a pick on an older answer is refused. **input / send**: exactly one match, an editable box / a button (walks up from the inner `<p>` or the icon's `<path>`). Never builds on uuids, long digit runs, React ids, hashed classes (`css-9x8k2m`) or per-turn counters (`conversation-turn-6`); no `#id` for resp (an id names one reply). One reply on the page → `single` plus every passing candidate: no check can tell a per-reply selector from an every-reply one with one reply, so the person chooses. |
| record | `src/providers/selector-assign.js`, IPC `selectors:assign` | refuses anything without evidence, with `matched < 1`, or with evidence taken on another provider's page; POSTs guardian `/api/agents/:id/selectors` with `source: 'picker'`; returns guardian's answer verbatim. SSE `selectors.assigned` / `selectors.assign.failed`. |

**Found and fixed on the way.** guardian-picker's `getXPath()` writes a positional path such as `…/button/svg/path`; XPath in an HTML document does not match SVG elements by bare name, so a pick on a send button's icon could never resolve through `document.evaluate`. `selector-check.js` walks the positional form by `localName`. Separately, `src/dom/archaeology.js` `handlePick` called `Object.keys()` on a `Map`, so every unnamed pick was named `pick-1` and replaced the last one.

**Proven.** Real Chromium 141 via Playwright: `tests/probe/selector-check-chromium.py` 10/10 on `tests/fixtures/chatgpt-like.html`, using guardian-picker's own `getXPath` and the userscript's own `_lastMatch` extracted from their files (includes: a reply appended after assignment is read by the same selector); `tests/probe/selector-assign-ui-chromium.py` 9/9, the area's whole flow against guardian's real selector map (served under `https://chatgpt.com/` by request routing, because the evidence URL must be a provider page). `tests/modules/test-cg-selector-assign.test.js` 10/10 runs both. **Not yet proven:** live on James's machine — a ChatGPT job's reply detected → `.response` → Library → Responses.

## The wake relay leaves agent wakes to guardian (3.14.1, v0.39.252)

James: *"its not voice assistance. its for the agents to talk to nexus through clearglass."* `src/copilot/wake-relay.js` listens to cortex's `nexus.wake.detected`. Cortex raises that from `/api/meta/observe`, which the userscript posts when an agent's reply first **appears**, while it is still streaming. The relay answered that fragment (`hey nexus, w` → co-pilot asked "w") as a `/wake-reply` job. The job queued behind the unfinished reply and was never typed. At the same time, the page's own `checkMessage()` answered the same fragment with an overlay, and typed the answer into the composer unsent.

An agent's wake (`role: 'assistant'`) is now answered once, by guardian's `lib/wake-loop.js`, from the completed reply, as a job sent into the same tab (guardian atlas, 3.11.1). The relay logs `agent wake from <agent> left to guardian's wake-loop` and returns. A non-agent wake is still answered by the relay as before. Test WK-018 runs the real relay against a fake cortex stream: no co-pilot call, no guardian job, no overlay.

## Every chat, one versioned record (3.15.0, v0.39.254)

James: *"we were working on getting the download manager logging agent chats."* Asked, he chose a full-transcript sync, one record per chat (versioned), and every provider chat, including the userscripts in his own browser: *"i want nexus to help remember. persistent memory for ai agents."*

**Why the job path was not enough.** Until now a chat reached the downloads index only when a guardian job **completed**. The 0.39.253 live log has four ChatGPT jobs and none completed (reply detection is the open break), so the index held nothing from them. A chat opened by hand never completes a job at all.

**The record.** `src/downloads/artifact-chat-index.js` gains kind `transcript`:

| field | meaning |
|---|---|
| `chat_key` | `provider:chatId`, the chat's identity |
| `version` | 1, 2, 3 … the newest is the **highest version**, not the newest `captured_at` (two versions can share a millisecond) |
| `transcript_hash` | sha256 of the normalized messages only |
| `message_count` | messages in this version |
| `raw.messages` | `[{role: user\|assistant, text}]` in page order; `raw.supersedes` = the previous version's id |

`recordChat()` writes a new `.response` only when the messages changed. It refuses, by name:
- `no-provider` / `no-chat-id` (`home`, a new chat the provider has not named yet);
- `empty`;
- `unchanged`;
- `contained-in-latest`: every message is already in the newest version, in order, so a partial or lazily-loaded read never replaces a fuller one.

Every version is kept. A chat keeps the agent it was first filed under. `recordResponse()` and `recordChat()` share one write path (`_write`: the `.response` is fsync'd first, then the index row; an index failure is reported, never fatal). The writer is guardian (`lib/chat-transcripts.js`, guardian atlas 3.12.0); Clear Glass reads.

**The Library.** `/cli/downloads/responses` lists a chat once, at its newest version with `versions`; `?versions=all` lists every version and `?chatKey=` one chat. Library → Responses shows a chat row (☰, `chat · v2 (2 versions) · 4 messages`), opens it as a conversation (prompt / reply), and a version picker opens any earlier version.

Tests: `test-chat-transcripts` TX-01–TX-10 (the index, each guard mutation-checked); `tests/probe/clearglass-library-window.js` 29/29 in real Chromium, with 4 new chat checks.

## Every chat, kept live in the download manager; the co-pilot pane remembers (3.19.0, v0.39.278)

James: *"maybe use the download manager in clearglass for the chat ledgers. also said guardian is polling, but it shouldn't be, live streams the dom mutation live to the download manager, that way we don't lose progress. including you expanding elements for your thoughts."*

**The chat ledger** (`clear-glass/src/downloads/chat-ledger.js`). One append-only file per chat, ledgers/<chatKey>.jsonl, under the downloads index root (the COS compartment clearglass-downloads-index, so a COS snapshot carries it with the .response files). The first line is a head; every change after it is one delta line: per turn, the whole text (text) or what was appended (add at at), and the thinking the same way (thinking / thinkingAdd at thinkingAt), plus generating. Nothing written is rewritten, and a torn last line (a crash mid-write) is skipped on replay. An append at an offset the ledger does not hold is refused with the lengths it does hold (resync), and the page resends that turn whole, so a lost delta can never splice text into the wrong place. readChat() replays a chat and lists its code blocks with the path on the fence (a fence with the path after the language, js src/file.js).

| route | what |
|---|---|
| POST /cli/downloads/ledger | one delta from a page (guardian atlas 3.16.0, `guardian/userscript-chat-stream.js`) |
| GET /cli/downloads/ledgers | every chat, newest first (?agentId=, ?provider=) |
| GET /cli/downloads/ledgers/:chatKey | one chat, replayed, with its code blocks |

Each chat is also one entry in the downloads list (kind: 'chat-ledger'): in progress while the page is generating, completed when it stops, its size growing as it is written. The versioned transcript (3.15.0) is unchanged; the ledger is the live layer under it.

**The co-pilot pane remembers** (`clear-glass/src/copilot/chat-store.js`). The pane's conversation is kept in Clear Glass's own JAA store (cg_copilot_chat, one current conversation per window in cg_copilot_conv, at most 400 turns each) and mirrored into the ledger as provider copilot. Every call carries the recent turns (copilotHistoryTurns 10, copilotHistoryChars 4,000, oldest left out first and the prompt says so), whichever backend answers: copilot, Ollama or a Guardian agent. "Nothing answered" is not stored as the assistant's turn. The pane restores the conversation when it opens (IPC copilot:history); /new starts another and keeps the old one (copilot:newConversation). copilotRemember: false keeps nothing.

**The pane's tools, layered.** By default (copilotToolSurface: 'layered') a call lists Clear Glass's own actions by name and the two layer tools (nexus.tools.tool → nexus.tools_expand.tool), and does not ask the orchestrator. The whole capability prompt (about 7.9k characters every turn) was more than the local 3B model could use; 'full' brings it back.

**Replies are escaped.** A reply went into the pane's innerHTML raw, so a page the co-pilot read could put markup into it. With replies kept and replayed, that would be a stored injection. Every reply, live or restored, now goes through formatReply(), which escapes first.

**The prelude.** `clear-glass/src/providers/host.js` injects `guardian/userscript-chat-stream.js` before each provider script, next to `guardian/userscript-nexus-wake.js`. Either one can fail to load without stopping the other.

Tests: test-chat-ledger-stream 14/14, test-tool-layers-and-pane-memory 14/14; the stream checked in headless Chromium (a reply streamed word by word, 5 coalesced posts, the thinking toggle opened and kept apart).

## The interaction field: the page as numbered x/y/z targets, a virtual pointer, a spotlight (3.20.0, v0.39.279)

James: *"i also want to be able to have copilot interact on clearglass using a virtual input through erosmanceros, nexus nerve, spotlight injected css into web pages, and a interaction field for xyz coords to help the agents see and navigate the ui in clearglass. I really need to get a job, and i want to be able to automate as much as possible."*

readPage says what is on a page; nothing said where. A model that cannot see pixels could only act through selectors, and a small model's selector is often wrong or names something hidden behind a cookie banner. `clear-glass/src/page/field.js` is that view:

| driver action | what it does |
|---|---|
| field {overlay, offscreen} | every interactive element numbered 1…n with its box, its centre (x, y) and z: how many layers cover its centre (0 = on top and clickable, more than 0 = under a banner or modal, -1 = off-screen). Also its name (label, aria-label, text), role, a selector and CSS z-index. With overlay the numbers, outlines and a labelled grid are drawn in a layer that takes no clicks. The result carries a text map a small model reads: #3 button "Apply now" (412,580) 120×32 z0. |
| at {x, y} | the stack under one point, top first |
| spotlight {n or selector or x,y,w,h, label} | a ring and a label on the target, the rest of the page dimmed, so James sees what the agent is about to do |
| pointer {n or x,y or selector, do, text, via} | acts on a target with real input. do is click, double, right, move, scroll or type. via native uses sendInputEvent along a curved, human-paced path from where the pointer last was. via eros uses ErosmancerOS's new /api/input (the behaviour engine's own path over the DevTools protocol), reached through the wire's tab resolver in `clear-glass/src/main/index.js`. A covered target is reported, never silently clicked through; an off-screen one is refused with "scroll first". |
| fieldOff | removes everything drawn |

The last field per tab is kept, so "pointer n 3" needs no second read. field and spotlight events go on the bus and are forwarded to NEXUS (the nerve) with the other browser events. The co-pilot pane lists the actions in its compact tool list, and `lib/agent-tools/tools/clear-glass/browser.js` exposes field, pointer and spotlight to every agent, returning the text map rather than 150 objects.

Tests: `tests/modules/test-cg-field.test.js` 13/13 (the driver with a fake page, the tool, the Eros route and its wiring), and `tests/probe/field-chromium.js` 12/12 in Clear Glass's own engine.

## Compartment windows and a co-pilot that browses (v0.39.280)

James: *"can you have the electron popup windows for the desktop envirement and settings, be in a borderless windowed and possible a manipulatable cos compartment so i can drag it around and resize it? keep the theme consistent."* · *"i told it to visit google.com and it ran the blue command but nothing happened. its meant to be the ais browser"*.

**Compartment windows** (`clear-glass/src/main/compartment-window.js`). Idearium runs in a webview; its pop-outs for a repo's desktop and the settings console now open frameless, dark from the first paint, resizable from every edge, with no menu bar. The page's own title bar is the drag handle and carries pin, minimize, maximize and close, which reach the window through a small preload (`clear-glass/src/preload/compartment-window.js`). Every other pop-up is unchanged.

**The co-pilot browses** (`clear-glass/src/copilot/verbs.js`). "visit google.com", "go to …", "open … and …" go there without asking a model and answer with the page's title, address and numbered targets; anything asked after it goes to the model with that page in hand. A driver block the model wrote loosely is repaired and run; one that still cannot be read comes back as a failed result the model and you both see (it used to be dropped while the pane said it was sent). The pane names the command each block carried. The full user guide is in `docs/atlases/copilot-atlas.md`.

Tests: `tests/modules/test-compartment-window.test.js`, `tests/modules/test-cg-copilot-verbs.test.js`.

## ErosmancerOS in workflows, and its workbench (v0.39.281)

James: *"Can we enforce have the jobs types using ErosmancerOS"* and *"What about having a huge editor for the ErosmancerOS? Only if it these are additive."*

**Input on browser steps** (Settings → Automation, `src/automation/steps.js`). Click, hover and type steps have an **Input** choice:
- **In the page** (the default): events inside the page, as before.
- **ErosmancerOS**: real mouse and keyboard input through the driver's pointer (`via: 'eros'`, so ErosmancerOS's `/api/input`), at the element's centre. Typing this way needs the element's selector. If ErosmancerOS refuses, the step fails and says why; it is never quietly sent in the page instead. The step's output names the path (`inputPath: 'erosmancer'`).

**The workbench** (Settings → ErosmancerOS → Workbench, `renderer/settings/sections/eros.js`). It sits below the existing panes, which are unchanged, and has four views:
- **Tabs:** open one, attach one (primary, shadow or proxy), close one.
- **Nodes:** search the registry, inspect a node, send it to the console.
- **Console:** send one command (click, type, hover, scroll, evaluate, navigate, screenshot) to an attached tab, or tick **Plan only** to see what would run without sending anything.
- **Replay:** the recorded frames, each with its commands and how often it was replayed; replay one with a delay.

Everything goes through Clear Glass's `/eros/*` wire. The console sends no behaviour profile of its own. ErosmancerOS 0.3.0 now lists its replay frames (`GET /api/replay/frames` returns `frames` beside the snapshot).

Tests: `tests/modules/test-economy.test.js` EC9-01, `tests/modules/test-eros-workbench.test.js`.
