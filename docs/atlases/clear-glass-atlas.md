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

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**211** files · **151** code files · **123** registry components declared here · **238** events emitted · **30** heard · **123** routes · **37** code files with a covering test

### Routes (123)

- GET /agent-mesh/intake — Jobs Clear Glass has taken in from guardian (only jobs guardian claimed for it on their .job), with each <jobId>.intake record · declared in `clear-glass/registry-components.js`
- GET /agent-mesh/job?jobId={jobId} — Status of a mesh job; survives a Clear Glass restart as clear_glass_restarted (sent:null, never resend) · declared in `clear-glass/registry-components.js`
- GET /agents — List mesh agents · declared in `clear-glass/registry-components.js`
- GET /agents — List available AI agents and their URLs · declared in `clear-glass/seam/registry-components.js`
- GET /bus/log — SISO StreamLog entries · declared in `clear-glass/seam/registry-components.js`
- GET /cli/downloads/responses — Agent chats (one row per chat at its newest version; ?versions=all lists every version, ?chatKey=provider:chatId one chat), agent replies and provider-tab downloads in the downloads index, each filed under its agent; filters agentId, jobId, provider, kind · declared in `clear-glass/registry-components.js`
- GET /cli/downloads/responses/:id — One downloads-index item in full: a chat transcript version, the reply text and code blocks, or the downloaded file record · declared in `clear-glass/registry-components.js`
- GET /contexts — List agent contexts · declared in `clear-glass/registry-components.js`
- GET /contexts — Agent health — RAID routing weight · declared in `clear-glass/seam/registry-components.js`
- GET /contract — Clear Glass interaction contract · declared in `clear-glass/registry-components.js`
- GET /diag/reports — List diagnostic run reports · declared in `clear-glass/seam/registry-components.js`
- GET /events — SSE — all SISO bus events · declared in `clear-glass/registry-components.js`
- GET /fingerprint/:id — Get agent Firefox fingerprint profile · declared in `clear-glass/seam/registry-components.js`
- GET /health — Clear Glass health, context count, bus stats · declared in `clear-glass/registry-components.js`
- GET /listeners — List active listeners · declared in `clear-glass/registry-components.js`
- GET /status — Full system status — bus sample, agents, listeners, TLS · declared in `clear-glass/registry-components.js`
- GET /status — TLS proxy — JA4 rewrite stats, tunnels, errors · declared in `clear-glass/seam/registry-components.js`
- GET /status — List open agent windows · declared in `clear-glass/seam/registry-components.js`
- GET /wire/health — Wire bridge health · declared in `clear-glass/registry-components.js`
- IPC accounts:defaults — Per-provider default account map · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:capture — Capture the signed-in session into the cookie vault + link the provider identity · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:close — Close an open sign-in window · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:credentials — Seal optional sign-in credentials in the password vault for pre-fill · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:list — List open sign-in windows · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:open — Open a provider sign-in window in the account's own mesh partition · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:providers — Providers a login portal can open, with their sign-in urls · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:signOut — Clear the account's partition and delete its vault copy · declared in `clear-glass/registry-components.js`
- IPC accounts:portal:status — Live cookies, vault copy, identity and portal state for one account/provider · declared in `clear-glass/registry-components.js`
- IPC accounts:resolve — Resolve the account a dispatch to this provider would use (never auto-creates) · declared in `clear-glass/registry-components.js`
- IPC accounts:setDefault — Set/clear the per-provider default account (Clear Glass is the account authority guardian resolves against) · declared in `clear-glass/registry-components.js`
- IPC autofill:detect — Detect real form fields an autofill profile would confidently fill · declared in `clear-glass/registry-components.js`
- IPC autofill:fill — Fill real form fields from an autofill profile · declared in `clear-glass/registry-components.js`
- IPC autofill:gig — Write a Fiverr gig from a profile and one line of what it offers — title, tags, description, three packages, FAQ, buyer questions, held to Fiverr's limits · declared in `clear-glass/registry-components.js`
- IPC autofill:gig:detect — Preview which field of the gig editor open in a tab takes which part of the gig (nothing typed) · declared in `clear-glass/registry-components.js`
- IPC autofill:gig:fill — Type the gig into the gig editor open in a tab — never saves or publishes · declared in `clear-glass/registry-components.js`
- IPC autofill:profile:create — Create a real autofill profile · declared in `clear-glass/registry-components.js`
- IPC autofill:profile:delete — Delete a real autofill profile · declared in `clear-glass/registry-components.js`
- IPC autofill:profile:get — Get one real autofill profile · declared in `clear-glass/registry-components.js`
- IPC autofill:profile:list — List real AutofillProfile records · declared in `clear-glass/registry-components.js`
- IPC autofill:profile:update — Update a real autofill profile · declared in `clear-glass/registry-components.js`
- IPC autofill:proposal — Draft an Upwork proposal, a Fiverr offer or a cover letter from a profile (a draft only, never sent) · declared in `clear-glass/registry-components.js`
- IPC autofill:readPage — The text and url of the page open in a tab (the job post the proposal answers) · declared in `clear-glass/registry-components.js`
- IPC bgtab:close — Close a real background tab · declared in `clear-glass/registry-components.js`
- IPC bgtab:list — List real open background tabs · declared in `clear-glass/registry-components.js`
- IPC bgtab:open — Open a real background service tab · declared in `clear-glass/registry-components.js`
- IPC bookmarks:addWithState — Bookmark + save real full page state · declared in `clear-glass/registry-components.js`
- IPC bookmarks:openWithState — Open a bookmark and restore its real saved state · declared in `clear-glass/registry-components.js`
- IPC calltos:forUrl — Find calltos registered for a given origin · declared in `clear-glass/registry-components.js`
- IPC calltos:list — List every registered callto · declared in `clear-glass/registry-components.js`
- IPC calltos:remove — Remove a registered callto · declared in `clear-glass/registry-components.js`
- IPC downloads:listListeners — List configured download listeners · declared in `clear-glass/registry-components.js`
- IPC downloads:openFile — Open a completed download with the OS default app (Library → Downloads, click the name) · declared in `clear-glass/registry-components.js`
- IPC downloads:registerListener — Register a real download listener · declared in `clear-glass/registry-components.js`
- IPC downloads:removeListener — Remove a download listener · declared in `clear-glass/registry-components.js`
- IPC downloads:updateListener — Update a download listener · declared in `clear-glass/registry-components.js`
- IPC extensions:list — List real loaded Chrome extensions · declared in `clear-glass/registry-components.js`
- IPC extensions:load — Load a real unpacked extension · declared in `clear-glass/registry-components.js`
- IPC extensions:pickDirectory — Real OS directory picker for extensions · declared in `clear-glass/registry-components.js`
- IPC extensions:unload — Unload a real extension · declared in `clear-glass/registry-components.js`
- IPC history:clear — Clear real history · declared in `clear-glass/registry-components.js`
- IPC history:delete — Delete a real history entry · declared in `clear-glass/registry-components.js`
- IPC history:list — Real browsing history search/list · declared in `clear-glass/registry-components.js`
- IPC macros:create — Create a macro through macro.js's own validation (step builder) · declared in `clear-glass/registry-components.js`
- IPC macros:delete — Delete a macro (soft-delete, audit trail kept) · declared in `clear-glass/registry-components.js`
- IPC macros:get — Get one real macro · declared in `clear-glass/registry-components.js`
- IPC macros:list — List real stored macros (real erosmancer integration where used) · declared in `clear-glass/registry-components.js`
- IPC macros:run — Run a real macro against a real agent · declared in `clear-glass/registry-components.js`
- IPC macros:schema — Real browser_action enum + erosmancer actions + behavior profiles for the step builder · declared in `clear-glass/registry-components.js`
- IPC passwords:delete — Delete a real saved password · declared in `clear-glass/registry-components.js`
- IPC passwords:list — List real saved passwords (metadata only) · declared in `clear-glass/registry-components.js`
- IPC rewind:clear — Clear real rewind snapshots · declared in `clear-glass/registry-components.js`
- IPC rewind:list — List real rewind snapshots · declared in `clear-glass/registry-components.js`
- IPC rewind:restore — Restore a real rewind snapshot · declared in `clear-glass/registry-components.js`
- IPC rewind:snapshot — Take a real rewind snapshot · declared in `clear-glass/registry-components.js`
- IPC screen-qa:answer — Answer a real question through the real copilot bridge (text only — never writes to the page) · declared in `clear-glass/registry-components.js`
- IPC screen-qa:derive-question — Derive a question from one real field's metadata (label/aria-label/placeholder/name) · declared in `clear-glass/registry-components.js`
- IPC screen-qa:detect — Detect real open-ended questions on the page, excluding whatever autofill would already confidently fill · declared in `clear-glass/registry-components.js`
- IPC screen-qa:element-at — The real field at a window-relative point — the right-click path's own target · declared in `clear-glass/registry-components.js`
- IPC screen-qa:inject — Write a chosen answer into one real field · declared in `clear-glass/registry-components.js`
- IPC selectors:assign — Record a picked, live-checked input/send/reply selector in guardian's selector map (POST :7820/api/agents/:id/selectors, source picker); refused without evidence or with evidence from another provider's page · declared in `clear-glass/registry-components.js`
- IPC selectors:provider-for-url — Which NCP provider a page belongs to (src/providers/registry.js hosts) — decides whether a pick is offered as a provider selector · declared in `clear-glass/registry-components.js`
- IPC site-settings:clear — Clear all real settings for an origin · declared in `clear-glass/registry-components.js`
- IPC site-settings:deleteKey — Delete one real setting key · declared in `clear-glass/registry-components.js`
- IPC site-settings:get — Get one real per-origin setting · declared in `clear-glass/registry-components.js`
- IPC site-settings:getAll — Get all real settings for an origin · declared in `clear-glass/registry-components.js`
- IPC site-settings:listOrigins — List every real origin with settings · declared in `clear-glass/registry-components.js`
- IPC site-settings:set — Set a real per-origin setting · declared in `clear-glass/registry-components.js`
- IPC speech:available — Real offline speech engine availability · declared in `clear-glass/registry-components.js`
- IPC speech:transcribeBuffer — Real offline audio-buffer transcription · declared in `clear-glass/registry-components.js`
- IPC vault:status — Which key protects each vault — OS-sealed (safeStorage) or legacy · declared in `clear-glass/registry-components.js`
- IPC window:closeLibrary — Close the Library window · declared in `clear-glass/registry-components.js`
- IPC window:openLibrary — Open (or focus) the Library window at an area — downloads, responses, bookmarks, history, accounts, passwords, autofill, macros · declared in `clear-glass/registry-components.js`
- POST /agent-mesh/send — Guardian hands Clear Glass a job it CLAIMED on its .job; the intake verifies the claim via guardian /jobs?id= before queueing (idempotent by jobId) · declared in `clear-glass/registry-components.js`
- POST /bridge/driver — ClearDriver → ErosmancerOS actions · declared in `clear-glass/registry-components.js`
- POST /cmd — Execute ClearDriver browser action · declared in `clear-glass/registry-components.js`
- POST /cmd — Query live DOM tree · declared in `clear-glass/registry-components.js`
- POST /cmd — Mutate DOM node · declared in `clear-glass/registry-components.js`
- POST /cmd — Register element picker result · declared in `clear-glass/registry-components.js`
- POST /cmd — Token archaeology — detect LLM API patterns · declared in `clear-glass/registry-components.js`
- POST /cmd — Create isolated Chromium partition · declared in `clear-glass/registry-components.js`
- POST /cmd — Switch active agent context · declared in `clear-glass/registry-components.js`
- POST /cmd — Switch fingerprint mode · declared in `clear-glass/registry-components.js`
- POST /cmd — Save per-account cookies · declared in `clear-glass/registry-components.js`
- POST /cmd — Restore cookies from vault · declared in `clear-glass/registry-components.js`
- POST /cmd — Route to Clear Glass co-pilot · declared in `clear-glass/registry-components.js`
- POST /cmd — Spawn free AI agent · declared in `clear-glass/registry-components.js`
- POST /cmd — Send prompt to mesh agent · declared in `clear-glass/registry-components.js`
- POST /cmd — RAID-route to healthiest agent · declared in `clear-glass/registry-components.js`
- POST /cmd — Add URL pattern listener · declared in `clear-glass/registry-components.js`
- POST /cmd — Run diagnostic suite · declared in `clear-glass/registry-components.js`
- POST /cmd — NEXUS home UI audit · declared in `clear-glass/registry-components.js`
- POST /cmd — Open agent browser window · declared in `clear-glass/registry-components.js`
- POST /cmd — Close agent window to tray · declared in `clear-glass/registry-components.js`
- POST /cmd — Snapshot current session cookies · declared in `clear-glass/seam/registry-components.js`
- POST /cmd — Check token validity heuristic for RAID · declared in `clear-glass/seam/registry-components.js`
- POST /cmd — Clear co-pilot conversation history for agent · declared in `clear-glass/seam/registry-components.js`
- POST /cmd — Queue task for mesh processing · declared in `clear-glass/seam/registry-components.js`
- POST /cmd — Remove URL pattern listener by ID · declared in `clear-glass/seam/registry-components.js`
- POST /cmd — Page audit — broken images, JS errors, performance · declared in `clear-glass/seam/registry-components.js`
- POST /cmd — Import Firefox profile for agent · declared in `clear-glass/seam/registry-components.js`
- … 3 more (loom: GET /api/registry/component/<id>)

### Events it emits (238) — and who hears them

- **driver.result** — from `clear-glass/src/driver/index.js`, `clear-glass/src/gates/index.js` → `clear-glass/plugins/passwords/index.js`, `clear-glass/plugins/zoom/index.js`
- **bookmarks.added** — from `clear-glass/src/gates/index.js` → `clear-glass/test/phase2.test.js`
- **bookmarks.listed** — from `clear-glass/src/gates/index.js` → `clear-glass/test/phase2.test.js`
- **bus.test** — from `clear-glass/test/bus.test.js` → `clear-glass/test/bus.test.js`
- **dom.query.result** — from `clear-glass/src/gates/index.js` → `clear-glass/plugins/captcha-pause/index.js`
- **driver.error** — from `clear-glass/src/driver/index.js`, `clear-glass/src/gates/index.js` +1 → `clear-glass/plugins/zoom/index.js`
- **driver.retry** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **mesh.route** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **passwords.result** — from `clear-glass/src/gates/index.js` → `clear-glass/plugins/passwords/index.js`
- **provider.listed** — from `clear-glass/src/gates/index.js` → `clear-glass/test/phase2.test.js`
- **provider.stopped** — from `clear-glass/src/gates/index.js` → `clear-glass/test/phase2.test.js`
- **pub.event** — from `clear-glass/test/bus.test.js` → `clear-glass/test/bus.test.js`
- **rewind.listed** — from `clear-glass/src/gates/index.js` → `clear-glass/test/phase2.test.js`
- **site-settings.result** — from `clear-glass/src/gates/index.js` → `clear-glass/plugins/permissions/index.js`
- **unsub.test** — from `clear-glass/test/bus.test.js` → `clear-glass/test/bus.test.js`
- **userscript.created** — from `clear-glass/src/gates/index.js` → `clear-glass/src/plugins/host.js`
- **userscript.error** — from `clear-glass/src/gates/index.js` → `clear-glass/src/plugins/host.js`
- **watchdog.driver.error** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **watchdog.gap.open** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **watchdog.mesh.demote** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **watchdog.nexus.offline** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **watchdog.nexus.reconnected** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **watchdog.rate-limit.handled** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **watchdog.tokens.found** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **account.created** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.deleted** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.error** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.get.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.list.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.provider.find.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.provider.get.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.provider.linked** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.provider.unlinked** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.provider.verified** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **account.updated** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **agent.cache.stale** — from `clear-glass/src/providers/registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **app.start** — from `clear-glass/src/main/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.detect.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.error** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.fill.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.profile.created** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.profile.deleted** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.profile.get.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.profile.list.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autofill.profile.updated** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bgtab.closed** — from `clear-glass/src/main/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bgtab.opened** — from `clear-glass/src/main/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bookmarks.add** — from `clear-glass/test/phase2.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bookmarks.check.result** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bookmarks.error** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bookmarks.list** — from `clear-glass/test/phase2.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bookmarks.opened** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bookmarks.removed** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **bookmarks.visited** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **chain.1** — from `clear-glass/test/bus.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **chain.2** — from `clear-glass/test/bus.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.created** — from `clear-glass/src/contexts/manager.js`, `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.destroyed** — from `clear-glass/src/contexts/manager.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.error** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.fp.switch** — from `clear-glass/src/main/index.js`, `clear-glass/src/main/index.pre-userscripts.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.fp.switched** — from `clear-glass/src/contexts/manager.js`, `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.network.error** — from `clear-glass/src/contexts/manager.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.rate-limited** — from `clear-glass/src/contexts/manager.js`, `clear-glass/test/watchdog.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **context.switched** — from `clear-glass/src/contexts/manager.js`, `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cookie.error** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cookie.event** — from `clear-glass/src/contexts/manager.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cookie.health.result** — from `clear-glass/src/gates/index.js`, `clear-glass/test/watchdog.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cookie.restored** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cookie.saved** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cookie.snapshotted** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.cleared** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.error** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.response** — from `clear-glass/src/copilot/bridge.js`, `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.stream.connected** — from `clear-glass/src/copilot/bridge.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.thinking** — from `clear-glass/src/copilot/bridge.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.tool.error** — from `clear-glass/src/copilot/bridge.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.tool.result** — from `clear-glass/src/copilot/bridge.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **copilot.tool.start** — from `clear-glass/src/copilot/bridge.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **diag.complete** — from `clear-glass/src/gates/index.js`, `clear-glass/test/watchdog.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **diag.error** — from `clear-glass/src/gates/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- … 158 more — loom.find.tool kind "event"

### Events it hears from elsewhere (6)

**cg:navigate** · **dom:event** · **dom:pick-result** · **permission:decision** · **shortcut:action** · **webrequest:decision**

### Files, directory by directory (66 directories)

#### `clear-glass/`

2 code · 4 other file(s).

- `clear-glass/fix-orchestrator.js` (74 lines) — fix-orchestrator.js Fixes: Error: Cannot find module './lib/intent-map'
- `clear-glass/registry-components.js` (265 lines) — Clear Glass System Contract Served at GET /contract from the IPC server (port 7702).  
  exports systemId, namespace, version, port, tlsPort, wirePort +6 · requires 0 · required by 2 · tested by `tests/modules/clear-glass-gig.test.js`
- other: `clear-glass/README.md`, `clear-glass/compartment.json`, `clear-glass/interaction-contract.json`, `clear-glass/package.json`

#### `clear-glass/docs/`

1 other file(s).

- other: `clear-glass/docs/clear-glass-seam.spec.md`

#### `clear-glass/input/`

1 other file(s).

- other: `clear-glass/input/.gitkeep`

#### `clear-glass/plugins/adblocker/`

1 code · 1 other file(s).

- `clear-glass/plugins/adblocker/index.js` (117 lines) — plugins/adblocker/index.js — real content-filter contribution. §HONEST SCOPE — the actual Electron wiring (session.fromPartition(...)  
  exports isBlocked, filterRequest, toggleFromToolbar, BLOCKLIST
- other: `clear-glass/plugins/adblocker/manifest.json`

#### `clear-glass/plugins/captcha-pause/`

1 code · 1 other file(s).

- `clear-glass/plugins/captcha-pause/index.js` (136 lines) — plugins/captcha-pause/index.js — real pause-resume-gate contribution. Composes two ALREADY-REAL primitives, exactly as  
  exports detectFromQueryResults, checkAndWait, CAPTCHA_SELECTORS · emits dom.query, driver.exec · hears dom.query.result
- other: `clear-glass/plugins/captcha-pause/manifest.json`

#### `clear-glass/plugins/guardian-listeners/`

1 code · 1 other file(s).

- `clear-glass/plugins/guardian-listeners/index.js` (233 lines) — plugins/guardian-listeners/index.js — real userscript contributions. §HONEST LIMIT — the original old-Guardian source (base-module.js,  
  exports getInstagramUserscript, getThreadsUserscript, stopListenersOnPage, buildModuleSource, PLATFORM_CONFIGS · emits driver.exec
- other: `clear-glass/plugins/guardian-listeners/manifest.json`

#### `clear-glass/plugins/passwords/`

1 code · 1 other file(s).

- `clear-glass/plugins/passwords/index.js` (138 lines) — plugins/passwords/index.js — real userscript + page-detector + toolbar-command contributions.  
  exports getFormDetectorUserscript, onFormDetected, promptSavePassword · emits driver.exec, passwords.get, passwords.save · hears driver.result, passwords.result
- other: `clear-glass/plugins/passwords/manifest.json`

#### `clear-glass/plugins/permissions/`

1 code · 1 other file(s).

- `clear-glass/plugins/permissions/index.js` (66 lines) — plugins/permissions/index.js — real permission-filter contribution. §UPDATED 2026-08-24 — now consults the real per-origin settings store  
  exports filterPermission, HIGH_RISK · emits driver.exec, site-settings.get · hears site-settings.result
- other: `clear-glass/plugins/permissions/manifest.json`

#### `clear-glass/plugins/zoom/`

1 code · 1 other file(s).

- `clear-glass/plugins/zoom/index.js` (49 lines) — plugins/zoom/index.js — real toolbar-command contributions. Composes the real driver.exec 'zoom' action (src/driver/index.js's  
  exports zoomIn, zoomOut, zoomReset · emits driver.exec · hears driver.error, driver.result
- other: `clear-glass/plugins/zoom/manifest.json`

#### `clear-glass/renderer/`

5 code · 4 other file(s).

- `clear-glass/renderer/browser.js` (3421 lines) — // §fix 2026-06-29, take 2 — the Proxy-wrapping approach below broke // everything: contextBridge.exposeInMainWorld freezes/locks property  
  hears cg:navigate
- `clear-glass/renderer/copilot-cli.js` (285 lines) — renderer/copilot-cli.js — the Co-pilot pane's CLI, wearing the Clear Glass hat component_id: cg.renderer.copilot-cli
- `clear-glass/renderer/guardian-picker.js` (1442 lines) — // ── Injected styles — VERBATIM from the real, original Guardian // content.js (v3.4.0), byte-for-byte, per James: "do not change any
- `clear-glass/renderer/mesh-picker.js` (148 lines) — // ── Injected styles — same real visual language as guardian-picker.js // (IBM Plex Mono / Rajdhani, #00ffa3 accent) per James: "do not change
- `clear-glass/renderer/selector-check.js` (260 lines)  
  exports create
- other: `clear-glass/renderer/browser.css`, `clear-glass/renderer/browser.html`, `clear-glass/renderer/library.html`, `clear-glass/renderer/settings.html`

#### `clear-glass/renderer/library/`

2 code file(s).

- `clear-glass/renderer/library/api.js` (61 lines) — renderer/library/api.js — what every Library area shares beyond the Settings runtime (window.CGS, ../settings/core.js).
- `clear-glass/renderer/library/boot.js` (12 lines) — // renderer/library/boot.js — last script on library.html: every area has registered. // What the Library changes about the shared Settings runtime (settings/core.js boot()):

#### `clear-glass/renderer/library/sections/`

8 code · 8 other file(s).

- `clear-glass/renderer/library/sections/accounts.js` (50 lines) — renderer/library/sections/accounts.js — Library → Accounts (styles: accounts.css) Ported 0.39.241 from ui/library/library-app.js (TABS.accounts): NEXUS
- `clear-glass/renderer/library/sections/autofill.js` (83 lines) — renderer/library/sections/autofill.js — Library → Autofill (styles: autofill.css) Ported 0.39.241 from ui/library/library-app.js (TABS.autofill, editAutofillProfile,
- `clear-glass/renderer/library/sections/bookmarks.js` (62 lines) — renderer/library/sections/bookmarks.js — Library → Bookmarks (styles: bookmarks.css) Ported 0.39.241 from ui/library/library-app.js (TABS.bookmarks, 2026-09-19/21):
- `clear-glass/renderer/library/sections/downloads.js` (139 lines) — renderer/library/sections/downloads.js — Library → Downloads (styles: downloads.css) §BUILT 0.39.241 — James: "the download manager in clearglass" with Firefox's
- `clear-glass/renderer/library/sections/history.js` (51 lines) — renderer/library/sections/history.js — Library → History (styles: history.css) Ported 0.39.241 from ui/library/library-app.js (TABS.history): same data
- `clear-glass/renderer/library/sections/macros.js` (50 lines) — renderer/library/sections/macros.js — Library → Macros (styles: macros.css) Ported 0.39.241 from ui/library/library-app.js (TABS.macros + runMacro): list
- `clear-glass/renderer/library/sections/passwords.js` (36 lines) — renderer/library/sections/passwords.js — Library → Passwords (styles: passwords.css) Ported 0.39.241 from ui/library/library-app.js (TABS.passwords). Read-only
- `clear-glass/renderer/library/sections/responses.js` (102 lines) — renderer/library/sections/responses.js — Library → Responses (styles: responses.css) v0.39.239 (as ui/library/areas/responses.js) → 0.39.241 on the Settings runtime.
- other: `clear-glass/renderer/library/sections/accounts.css`, `clear-glass/renderer/library/sections/autofill.css`, `clear-glass/renderer/library/sections/bookmarks.css`, `clear-glass/renderer/library/sections/downloads.css`, `clear-glass/renderer/library/sections/history.css`, `clear-glass/renderer/library/sections/macros.css`, `clear-glass/renderer/library/sections/passwords.css`, `clear-glass/renderer/library/sections/responses.css`

#### `clear-glass/renderer/selector-assign/`

1 code · 1 other file(s).

- `clear-glass/renderer/selector-assign/selector-assign.js` (188 lines) — v0.39.251 The element picker assigns selectors (handoff 2026-09-25, step 1). One area,
- other: `clear-glass/renderer/selector-assign/selector-assign.css`

#### `clear-glass/renderer/settings/`

2 code · 1 other file(s).

- `clear-glass/renderer/settings/boot.js` (4 lines) — // renderer/settings/boot.js — last script on the page: every section file has registered by now.
- `clear-glass/renderer/settings/core.js` (299 lines) — renderer/settings/core.js — Clear Glass Settings runtime §BUILT 2026-09-23 — James: "a beautiful, fully built, settings page with  
  requires 0 · required by 1
- other: `clear-glass/renderer/settings/settings.css`

#### `clear-glass/renderer/settings/sections/`

18 code · 18 other file(s).

- `clear-glass/renderer/settings/sections/accounts.js` (244 lines) — renderer/settings/sections/accounts.js — Save session (styles: accounts.css)  
  requires 3 · required by 0
- `clear-glass/renderer/settings/sections/autofill.js` (294 lines) — renderer/settings/sections/autofill.js — Autofill & answers (styles: autofill.css) v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file").…
- `clear-glass/renderer/settings/sections/automation.js` (648 lines) — renderer/settings/sections/automation.js — Automation (styles: automation.css) v0.39.227 — split out of sections/mesh.js. The engine is
- `clear-glass/renderer/settings/sections/connections.js` (60 lines) — renderer/settings/sections/connections.js — Connections (styles: connections.css) v0.39.227 — split out of sections/system.js (James: "each UI area its own file, including its own CSS file").…
- `clear-glass/renderer/settings/sections/copilot.js` (129 lines) — renderer/settings/sections/copilot.js — Co-pilot (styles: copilot.css) v0.39.227 — split out of sections/system.js. Connections + co-pilot use
- `clear-glass/renderer/settings/sections/diagnostics.js` (38 lines) — renderer/settings/sections/diagnostics.js — Diagnostics (styles: diagnostics.css) v0.39.227 — split out of sections/system.js (James: "each UI area its own file, including its own CSS file").…
- `clear-glass/renderer/settings/sections/downloads.js` (53 lines) — renderer/settings/sections/downloads.js — Downloads (styles: downloads.css) §BUILT 2026-09-25 — James: "Yes build all the ui" (Firefox-reference gap
- `clear-glass/renderer/settings/sections/eros.js` (188 lines) — renderer/settings/sections/eros.js — ErosmancerOS (styles: eros.css) v0.39.227 — split out of sections/macros.js (James: "each UI area its own file, including its own CSS file"). Notes below are…  
  requires 1 · required by 0
- `clear-glass/renderer/settings/sections/fingerprint.js` (41 lines) — renderer/settings/sections/fingerprint.js — Browser fingerprint (styles: fingerprint.css) v0.39.227 — split out of sections/providers.js (James: "each UI area its own file, including its own CSS…
- `clear-glass/renderer/settings/sections/general.js` (65 lines) — renderer/settings/sections/general.js — General (styles: general.css) v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file"). Notes below are…
- `clear-glass/renderer/settings/sections/macros.js` (385 lines) — renderer/settings/sections/macros.js — Macros (styles: macros.css) §BUILT 2026-09-23 — list/run + the step builder; every step is a real
- `clear-glass/renderer/settings/sections/mesh.js` (154 lines) — renderer/settings/sections/mesh.js — Agent mesh (styles: mesh.css)
- `clear-glass/renderer/settings/sections/plugins.js` (102 lines)
- `clear-glass/renderer/settings/sections/privacy.js` (44 lines) — renderer/settings/sections/privacy.js — Privacy & data (styles: privacy.css) v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file"). Notes…
- `clear-glass/renderer/settings/sections/providers.js` (61 lines) — renderer/settings/sections/providers.js — Provider tabs (styles: providers.css)
- `clear-glass/renderer/settings/sections/shortcuts.js` (116 lines) — renderer/settings/sections/shortcuts.js — Keyboard shortcuts (styles: shortcuts.css) §0.39.265 — James: "add keyboard shortcuts including macro support."
- `clear-glass/renderer/settings/sections/sites.js` (161 lines) — renderer/settings/sections/sites.js — Site settings (styles: sites.css) §BUILT 2026-09-26 — James: "expand per site settings." Was one pane
- `clear-glass/renderer/settings/sections/suite.js` (121 lines) — renderer/settings/sections/suite.js — Ledger (Cortex event) (styles: suite.css)
- other: 18 files (.css)

#### `clear-glass/schemas/`

1 code · 10 other file(s).

- `clear-glass/schemas/index.js` (51 lines) — // clear-glass/schemas/index.js — clear-glass's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `clear-glass/schemas/schema.capability`, `clear-glass/schemas/schema.clearglass_search_engine`, `clear-glass/schemas/schema.command`, `clear-glass/schemas/schema.component`, `clear-glass/schemas/schema.event`, `clear-glass/schemas/schema.hook`, `clear-glass/schemas/schema.macro`, `clear-glass/schemas/schema.node`, `clear-glass/schemas/schema.system`, `clear-glass/schemas/schema.wire`

#### `clear-glass/seam/`

2 code file(s).

- `clear-glass/seam/registry-components.js` (152 lines) — seam/registry-components.js — Clear Glass Component Registry Follows lib/component-registry.js schema exactly.  
  requires 0 · required by 2
- `clear-glass/seam/watchdog-gates.js` (292 lines) — seam/watchdog-gates.js — Co-pilot Watchdog Gates Co-pilot as watchdog — active, not passive.  
  exports registerWatchdogs, cookieHealthWatchdog, diagWatchdog, driverErrorWatchdog, tokenRelayWatchdog, meshErrorWatchdog +2 · requires 2 · required by 0 · emits driver.retry, mesh.route, watchdog.driver.error, watchdog.gap.open +7 · tested by `clear-glass/test/watchdog.test.js`

#### `clear-glass/siso/`

1 code · 1 other file(s).

- `clear-glass/siso/index.js` (144 lines) — siso/index.js — Clear Glass SISO Core (CJS) Jonathan Bailey's SISO primitives ported to CJS for Electron/Node.  
  exports Event, Gate, Stream, StreamLog · requires 0 · required by 3 · tested by `clear-glass/test/bus.test.js`, `clear-glass/test/phase2.test.js` +1
- other: `clear-glass/siso/package.json`

#### `clear-glass/spec/`

2 other file(s).

- other: `clear-glass/spec/clear-glass.node-taxonomy.md`, `clear-glass/spec/clear-glass.spec`

#### `clear-glass/src/`

1 code file(s).

- `clear-glass/src/event-taxonomy.js` (102 lines) — (userscript // errors). Every event below is copied from the actual real emit()  
  requires 0 · required by 1 · tested by `tests/modules/clear-glass-gig.test.js`

#### `clear-glass/src/accounts/`

1 code file(s).

- `clear-glass/src/accounts/login-portal.js` (246 lines)  
  exports LoginPortal, LOGIN_URLS, partitionFor, fillScript · requires 3 · required by 2

#### `clear-glass/src/api/`

1 code file(s).

- `clear-glass/src/api/settings.js` (141 lines) — src/api/settings.js — NEXUS Connection Settings Stores NEXUS service ports and co-pilot routing config.  
  requires 1 · required by 2

#### `clear-glass/src/autofill/`

4 code file(s).

- `clear-glass/src/autofill/gig.js` (270 lines)  
  exports LIMITS, TIERS, GIG_PATTERNS, buildGigPrompt, parseGig, gigParts +4 · requires 0 · required by 1 · tested by `tests/modules/clear-glass-gig.test.js`
- `clear-glass/src/autofill/matcher.js` (244 lines) — real form-field matching §BUILT 2026-09-19 — pure functions, no DOM/network access, so this  
  exports matchFields, NAME_PATTERNS, LABEL_PATTERNS, EXTRA_PATTERNS, detectFields, fillFields · requires 2 · required by 4 · tested by `tests/modules/clear-glass-autofill.test.js`
- `clear-glass/src/autofill/proposal.js` (96 lines) — cover letters and freelance proposals from an autofill profile.  
  exports fillTemplate, profileVars, buildProposalPrompt, PLATFORM_GUIDE · requires 0 · required by 3
- `clear-glass/src/autofill/store.js` (225 lines) — Autofill Profile Store §BUILT 2026-09-19 — James: "autofill." Deliberately NOT named  
  exports AutofillStore, FIELD_TYPES, DOCUMENT_FIELDS, EXTRA_FIELDS · requires 0 · required by 2 · tested by `tests/modules/clear-glass-autofill.test.js`, `tests/modules/clear-glass-screen-qa.test.js`

#### `clear-glass/src/automation/`

8 code file(s).

- `clear-glass/src/automation/cron.js` (102 lines) — standard 5-field cron, local time. component_id: cg.automation.cron  
  exports parse, next, describe · requires 0 · required by 3
- `clear-glass/src/automation/dom.js` (294 lines) — the in-page half of the automation DOM tools. component_id: cg.automation.dom  
  exports extract, table, links, page, act, check +4 · requires 0 · required by 1
- `clear-glass/src/automation/from-macro.js` (58 lines) — a saved macro, as workflow steps. component_id: cg.automation.from-macro  
  exports macroToSteps, macroToWorkflow · requires 0 · required by 1
- `clear-glass/src/automation/nodes.js` (286 lines)  
  exports workflowNode, macroNode, parse, importNode, importMacro, saveNode +4 · requires 1 · required by 1
- `clear-glass/src/automation/routes.js` (158 lines) — every /automation/* route of Clear Glass's wire server. component_id: cg.automation.routes  
  exports handle, listView, LOCAL_ORIGIN · requires 6 · required by 1
- `clear-glass/src/automation/steps.js` (304 lines) — what every workflow step is, for the UI and for validation. component_id: cg.automation.steps  
  exports CATALOGUE, TRIGGER, COMMON, OPS, UNARY_OPS, BROWSER_ACTIONS +5 · requires 1 · required by 2
- `clear-glass/src/automation/template.js` (182 lines)  
  exports render, evaluate, lookup, placeholders, formatDate, FILTERS · requires 0 · required by 1
- `clear-glass/src/automation/templates.js` (125 lines) — ready-made workflows for "New workflow". component_id: cg.automation.templates  
  exports TEMPLATES · requires 0 · required by 1

#### `clear-glass/src/bookmarks/`

2 code file(s).

- `clear-glass/src/bookmarks/browser.js` (2273 lines) — // §fix 2026-06-29, take 2 — the Proxy-wrapping approach below broke // everything: contextBridge.exposeInMainWorld freezes/locks property  
  hears cg:navigate
- `clear-glass/src/bookmarks/store.js` (169 lines) — src/bookmarks/store.js — Clear Glass Bookmark Store Per-agent bookmarks. Named, tagged, bus-controllable.  
  requires 1 · required by 1 · tested by `clear-glass/test/phase2.test.js`

#### `clear-glass/src/contexts/`

2 code file(s).

- `clear-glass/src/contexts/manager.js` (221 lines) — Context Manager One Chromium session partition per agent.  
  requires 1 · required by 2 · emits context.created, context.destroyed, context.fp.switched, context.network.error +3
- `clear-glass/src/contexts/session-headers.js` (46 lines) — src/contexts/session-headers.js — Shared CSP / X-Frame-Options / PNA bypass Originally this lived inline in main/index.js's bootstrap, applied ONLY to  
  exports applyCspBypass · requires 0 · required by 2

#### `clear-glass/src/cookies/`

1 code file(s).

- `clear-glass/src/cookies/vault.js` (286 lines) — Cookie Vault Encrypted per-agent cookie storage with versioned snapshots.  
  requires 1 · required by 3

#### `clear-glass/src/copilot/`

6 code file(s).

- `clear-glass/src/copilot/bridge.js` (928 lines)  
  requires 9 · required by 2 · emits copilot.response, copilot.stream.connected, copilot.thinking, copilot.tool.error +2 · tested by `tests/copilot-bridge-direct-dispatch.test.js`, `tests/modules/clear-glass-agent-surface.test.js`
- `clear-glass/src/copilot/chat-store.js` (98 lines) — the co-pilot pane's conversation, kept. §0.39.278 — James: "copilot and clearglass, isnt really working. its dumb, isnt persistent, and needs to work in the  
  exports TABLE, CONV, MAX_TURNS, current, startNew, append +2 · requires 1 · required by 2
- `clear-glass/src/copilot/hat.js` (88 lines) — src/copilot/hat.js — the Clear Glass hat component_id: cg.copilot.hat  
  exports status, ensure, update, personaFor, SEED_KEY, DEFAULT_PERSONA · requires 0 · required by 2 · tested by `clear-glass/test/copilot-cli.test.js`
- `clear-glass/src/copilot/tools.js` (193 lines) — src/copilot/tools.js — Co-pilot Tool Registry Every Clear Glass capability the co-pilot can invoke, declared as tools.  
  exports TOOLS, BY_NAME, buildToolsPrompt, buildCompactToolsPrompt · requires 0 · required by 2
- `clear-glass/src/copilot/verbs.js` (90 lines) — how the co-pilot's words become browser actions. §0.39.280 BS17. Map: docs/2026-09-29-build-surface-phasemap.spec (BS17).  
  exports parseBlock, normalize, parseCommands, browseIntent, archiveImportIntent, label +1 · requires 0 · required by 1
- `clear-glass/src/copilot/wake-relay.js` (207 lines) — src/copilot/wake-relay.js — closes the real loop James described: "hey nexus" said in any agent tab -> guardian/cortex detects it  
  exports startWakeRelay

#### `clear-glass/src/core/`

1 code file(s).

- `clear-glass/src/core/bus.js` (50 lines) — src/core/bus.js — Clear Glass Central SISO Bus The single Stream that owns all Clear Glass events.  
  exports createBus, getBus, getLog, emit, on, off +4 · requires 1 · required by 12 · tested by `clear-glass/test/bus.test.js`, `clear-glass/test/content-filter-exempt.test.js` +2

#### `clear-glass/src/diagnostic/`

3 code file(s).

- `clear-glass/src/diagnostic/engine.js` (342 lines) — Diagnostic Engine Playwright-equivalent powered by ClearDriver.  
  requires 0 · required by 2 · emits diag.run.complete, diag.run.start, diag.screenshot.saved, diag.step.fail +1
- `clear-glass/src/diagnostic/error-capture.js` (157 lines) — src/diagnostic/error-capture.js — Clear Glass Error Capture §fix 2026-06-30 — built because the actual gap was found, not assumed:  
  exports ErrorCapture
- `clear-glass/src/diagnostic/process-metrics.js` (118 lines) — src/diagnostic/process-metrics.js — real process instrumentation §NEW 2026-07-11 — built in direct response to "I need to actually know  
  exports ProcessMetrics · requires 0 · required by 1 · emits process.metrics, process.metrics.error

#### `clear-glass/src/dom/`

1 code file(s).

- `clear-glass/src/dom/archaeology.js` (547 lines) — DOM Archaeology Maps the live DOM into a NEXUS-readable addressable tree.  
  exports setActiveCompartment · requires 1 · required by 3 · emits dom.injected, dom.mutated, dom.pick.registered, dom.picked +1 · hears dom:event, dom:pick-result

#### `clear-glass/src/downloads/`

5 code file(s).

- `clear-glass/src/downloads/adapter.js` (82 lines) — src/downloads/adapter.js — will-download wiring for agent sessions Same session.on('will-download', ...) shape download-capture.js  
  exports attach · requires 1 · required by 1 · emits downloads.completed
- `clear-glass/src/downloads/artifact-chat-index.js` (541 lines)  
  exports MODULE_ID, COMPARTMENT_NAME, ensureCompartment, recordResponse, queryItems, rebuildIndexFromResponses +12 · requires 5 · required by 9 · tested by `tests/modules/test-agent-memory.test.js`, `tests/modules/test-code-artifact.js` +1
- `clear-glass/src/downloads/chat-ledger.js` (221 lines)  
  exports MODULE_ID, VERSION, chatKeyOf, applyDelta, appendTurn, readChat +3 · requires 1 · required by 2
- `clear-glass/src/downloads/intake-bridge.js` (106 lines)  
  exports install, VERSION, MODULE_ID · requires 1 · required by 1 · tested by `clear-glass/test/downloads-intake-bridge.test.js`
- `clear-glass/src/downloads/store.js` (125 lines) — src/downloads/store.js — Real Local Downloads Store Real gap named directly in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's  
  exports DownloadsStore · requires 1 · required by 1 · tested by `tests/modules/test-one-tab-e2e.test.js`, `tests/modules/test-response-downloads.test.js`

#### `clear-glass/src/driver/`

4 code file(s).

- `clear-glass/src/driver/glass.js` (452 lines)  
  exports chromium, launch, engine, Browser, Page, PAGE_LIB · tested by `tests/modules/test-nexus-atlas-and-glass.test.js`
- `clear-glass/src/driver/index.js` (871 lines) — ClearDriver — NEXUS sovereign browser automation No Playwright. No Puppeteer. Own the primitives.  
  requires 3 · required by 3 · emits driver.error, driver.network.blocked, driver.network.intercepted, driver.recording +7
- `clear-glass/src/driver/page-resolver.js` (41 lines) — the ONE place that turns an agentId into the webContents of the page the agent lives in. 2026-09-19.  
  exports createPageResolver, mkErr · requires 0 · required by 3 · tested by `tests/modules/test-mesh-dom-transport.js`
- `clear-glass/src/driver/url-listener.js` (179 lines) — URL Listener Add a listener for any URL pattern — fires a NEXUS hook on match.  
  requires 0 · required by 2 · emits url.listener.added, url.listener.removed, url.match, url.request.headers +1

#### `clear-glass/src/driver/glass-host/`

1 code · 1 other file(s).

- `clear-glass/src/driver/glass-host/main.js` (82 lines) — Clear Glass's engine, run as a page host for glass.js. §0.39.263 — James: "playright? no what is that for? litterally have clearglas".
- other: `clear-glass/src/driver/glass-host/package.json`

#### `clear-glass/src/eros/`

1 code file(s).

- `clear-glass/src/eros/supervisor.js` (175 lines) — ErosmancerOS runs with Clear Glass. §0.39.264 — James: "hook it in to run with clearglass" / "just need  
  exports ErosSupervisor, SERVER_TS, NEXUS_ROOT, _tsxCli, _health, _postJson · requires 1 · required by 1

#### `clear-glass/src/fingerprint/`

1 code file(s).

- `clear-glass/src/fingerprint/engine.js` (289 lines) — Fingerprint Engine Builds and manages per-agent Firefox fingerprint profiles.  
  requires 1 · required by 2 · tested by `clear-glass/test/bus.test.js`

#### `clear-glass/src/gates/`

1 code file(s).

- `clear-glass/src/gates/index.js` (873 lines) — src/gates/index.js — Clear Glass Gate Registry Every system behavior is a Gate registered on the central bus.  
  exports registerAll, gate, domQueryGate, domMutateGate, domPickGate, contextCreateGate +24 · requires 2 · required by 3 · emits account.created, account.deleted, account.error, account.get.result +105 · tested by `clear-glass/test/bus.test.js`, `clear-glass/test/phase2.test.js`

#### `clear-glass/src/history/`

1 code file(s).

- `clear-glass/src/history/store.js` (104 lines) — Real Browsing History Store §GAP CLOSED 2026-08-30 — James: "build them all." Real, confirmed gap:  
  exports HistoryStore · requires 1 · required by 1 · tested by `clear-glass/test/storage-jaa.test.js`

#### `clear-glass/src/ipc/`

3 code file(s).

- `clear-glass/src/ipc/agent-routes.js` (137 lines)  
  exports MODULE_ID, VERSION, install, buildState · tested by `tests/modules/clear-glass-agent-surface.test.js`
- `clear-glass/src/ipc/bridge.js` (2025 lines) — src/ipc/bridge.js — SISO-native IPC Bridge NEXUS commands arrive as HTTP POST /cmd → become SISO Events → bus.emit()  
  requires 19 · required by 3 · emits guardian.listener.copilot-answer, guardian.listener.copilot-panel, guardian.listener.direct-file-write, guardian.listener.ollama-answer +4 · hears dom:event
- `clear-glass/src/ipc/handler-registry.js` (94 lines)  
  exports MODULE_ID, VERSION, DENIED, install, register, list +3 · requires 0 · required by 1

#### `clear-glass/src/jobs/`

1 code file(s).

- `clear-glass/src/jobs/intake.js` (179 lines)  
  exports createJobIntake, guardianJobFetcher · requires 1 · required by 2

#### `clear-glass/src/macros/`

1 code file(s).

- `clear-glass/src/macros/recording.js` (111 lines) — src/macros/recording.js — recorded page events → macro steps (pure) component_id: cg.macros.recording  
  exports recordingToSteps, describeStep, SENSITIVE · requires 0 · required by 1

#### `clear-glass/src/main/`

3 code file(s).

- `clear-glass/src/main/compartment-window.js` (91 lines) — idearium's pop-out pages as COS-compartment windows. §0.39.280. James: "can you have the electron popup windows for the desktop envirement and settings, be in a borderless  
  exports isCompartmentPage, parseFeatures, windowOptions, attach, registerIpc, PAGES · requires 1 · required by 1
- `clear-glass/src/main/index.js` (2608 lines) — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):  
  exports openAgentWindow, closeAgentWindow, minimizeAgentWindow, hideAgentWindow, maximizeAgentWindow, focusAgentWindow +11 · requires 50 · required by 3 · emits app.start, bgtab.closed, bgtab.opened, context.fp.switch +10
- `clear-glass/src/main/index.pre-userscripts.js` (637 lines) — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):  
  exports openAgentWindow, closeAgentWindow, minimizeAgentWindow, hideAgentWindow, windows · requires 19 · required by 0 · emits context.fp.switch, diag.nexus, lifecycle.ready, lifecycle.shutdown +2

#### `clear-glass/src/mesh/`

4 code file(s).

- `clear-glass/src/mesh/agent-mesh.js` (1168 lines) — Agent Mesh Free AI agent channels baked into Clear Glass.  
  requires 5 · required by 2 · emits mesh.agent.spawned, mesh.constraints.unavailable, mesh.guardian.dispatch, mesh.job.progress +19 · tested by `tests/modules/agent-mesh-drainer.test.js`, `tests/modules/agent-mesh-hostile.test.js` +1
- `clear-glass/src/mesh/automation-engine.js` (1173 lines)  
  exports AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR, NODES_DIR, TICK_MS +5 · requires 6 · required by 1 · tested by `tests/modules/automation-engine.test.js`
- `clear-glass/src/mesh/dom-transport.js` (122 lines) — host side of the mesh's DOM transport (2026-09-19). Drives page/agent-page.js inside an agent's chat page and exposes JOBS, not blocking calls:  
  exports createDomTransport, PAGE_SRC · requires 0 · required by 1 · tested by `tests/modules/test-mesh-dom-transport.js`
- `clear-glass/src/mesh/route-graph.js` (120 lines) — real, persisted node-to-node routing edges for BrainOS's canvas (docs/2026-09-11-brainos-agent-  
  exports RouteGraph, ROUTES_DIR · tested by `tests/modules/route-graph.test.js`

#### `clear-glass/src/mesh/page/`

1 code file(s).

- `clear-glass/src/mesh/page/agent-page.js` (336 lines)

#### `clear-glass/src/network/`

3 code file(s).

- `clear-glass/src/network/install.js` (78 lines) — // clear-glass/src/network/install.js — wires the network subsystem's one // remaining real module: pulse-registry.  
  exports install · requires 1 · required by 2 · emits network.ready · tested by `clear-glass/test/network-install.test.js`
- `clear-glass/src/network/pulse-registry.js` (104 lines) — // clear-glass/src/network/pulse-registry.js — node handshake/heartbeat/ // liveness registry.  
  exports PulseRegistry, IDLE_MS, DEAD_MS
- `clear-glass/src/network/routes.js` (70 lines) — — Pulse Registry (network/pulse-registry.js) — // the one real, load-bearing module left here,  
  exports handle · requires 0 · required by 1 · tested by `clear-glass/test/network-install.test.js`

#### `clear-glass/src/options/`

1 code file(s).

- `clear-glass/src/options/store.js` (990 lines) — src/options/store.js — Nexus Options Store Persistent, bus-controllable settings for Clear Glass's own behavior —  
  requires 0 · required by 5 · tested by `tests/modules/clear-glass-accounts.test.js`, `tests/modules/nexus-options-autoboot.test.js`

#### `clear-glass/src/page/`

2 code file(s).

- `clear-glass/src/page/field.js` (216 lines)  
  exports MODULE_ID, VERSION, DEFAULTS, fieldScript, fieldOffScript, atScript +8 · requires 0 · required by 2
- `clear-glass/src/page/reader.js` (156 lines) — one call that tells an agent what is on the page. James, 2026-09-27: "i want copilot completely aware of clearglass, hooked in completely."  
  exports MODULE_ID, VERSION, DEFAULTS, pageScript, normalize, _inPage · requires 0 · required by 1 · tested by `tests/modules/clear-glass-agent-surface.test.js`, `tests/modules/test-opportunity.test.js`

#### `clear-glass/src/passwords/`

1 code file(s).

- `clear-glass/src/passwords/vault.js` (166 lines)  
  exports PasswordVault · requires 1 · required by 2 · tested by `clear-glass/test/storage-jaa.test.js`

#### `clear-glass/src/plugins/`

6 code file(s).

- `clear-glass/src/plugins/contribution-types.js` (95 lines)  
  exports CLEAR_GLASS_CONTRIBUTION_TYPE · requires 0 · required by 1
- `clear-glass/src/plugins/host.js` (377 lines)  
  exports PluginHost, PluginHostError, PLUGIN_STATE · requires 5 · required by 1 · emits plugin:error, plugins:killswitch.fullstop, userscript.create, userscript.toggle · hears userscript.created, userscript.error
- `clear-glass/src/plugins/permission-adapter.js` (89 lines) — src/plugins/permission-adapter.js — permission-filter ↔ Electron wiring §HONEST LIMIT — traced against Electron's real, documented  
  exports attachPermissionFilters · requires 1 · required by 1 · hears permission:decision
- `clear-glass/src/plugins/schema.js` (159 lines)  
  exports PluginSchemaError, validateManifest · requires 2 · required by 1
- `clear-glass/src/plugins/webextensions.js` (229 lines) — src/plugins/webextensions.js — Chrome WebExtensions in Clear Glass component_id: cg.plugins.webextensions  
  exports WebExtensionHost, crxToZip, readManifest, displayName, TABLE, CG_DIR · requires 2 · required by 1 · tested by `clear-glass/test/webextensions.test.js`
- `clear-glass/src/plugins/webrequest-adapter.js` (114 lines) — src/plugins/webrequest-adapter.js — content-filter ↔ Electron wiring §HONEST LIMIT — traced against real, existing source, not live-run.  
  exports attachContentFilters, _pageUrlOf · requires 1 · required by 1 · hears webrequest:decision · tested by `clear-glass/test/content-filter-exempt.test.js`

#### `clear-glass/src/preload/`

3 code file(s).

- `clear-glass/src/preload/compartment-window.js` (13 lines) — // clear-glass/src/preload/compartment-window.js — §0.39.280. The only thing idearium's compartment windows // (/desktop.html, /settings.html; main/compartment-window.js) get from Electron: their…  
  requires 0 · required by 2
- `clear-glass/src/preload/index.js` (418 lines) — Preload — contextIsolation bridge Exposes a minimal, typed API to the renderer.  
  hears shortcut:action
- `clear-glass/src/preload/webview-bridge.js` (51 lines) — src/preload/webview-bridge.js §BUILD 2026-07-09 — the injected PICKER_SCRIPT in renderer/browser.html

#### `clear-glass/src/providers/`

5 code file(s).

- `clear-glass/src/providers/download-capture.js` (190 lines) — a file downloaded from a provider tab is announced to Guardian, with the chat it came from attached.  
  exports attach, VERSION, MODULE_ID
- `clear-glass/src/providers/gm-shim.js` (134 lines)  
  exports buildGmShim · requires 0 · required by 1 · tested by `tests/modules/test-gm-shim-sse-streaming.js`
- `clear-glass/src/providers/host.js` (900 lines) — src/providers/host.js — NCP Provider Auto-Host v2 Spawns one hidden BrowserWindow per NCP provider on boot.  
  requires 3 · required by 1 · emits provider.host.all-booted, provider.host.closed_unexpectedly, provider.host.crashed, provider.host.injected +6
- `clear-glass/src/providers/registry.js` (171 lines) — src/providers/registry.js — NCP Provider Registry: a CACHE of Guardian's agent facts (GA1, map invariant E13). §GA1 2026-10-02 — "Guardian is the source of truth for the Clear Glass agents." This…  
  exports NCP_PROVIDERS, SEED, getProvider, listProviders, DEFAULT_AUTOSTART, autoBootList +4 · requires 1 · required by 3 · emits agent.cache.stale · tested by `clear-glass/test/phase2.test.js`, `tests/modules/nexus-options-autoboot.test.js`
- `clear-glass/src/providers/selector-assign.js` (89 lines) — v0.39.251 Main-process half of "the element picker assigns selectors" (handoff  
  exports MODULE_ID, VERSION, KEYS, providerForUrl, validate, assign · requires 1 · required by 1

#### `clear-glass/src/rewind/`

1 code file(s).

- `clear-glass/src/rewind/engine.js` (340 lines) — src/rewind/engine.js — Clear Glass Rewind Engine Rewind is the session time-machine. Every N seconds (or on significant  
  exports FORM_FIELDS_CAPTURE_JS, FORM_FIELDS_RESTORE_JS · requires 0 · required by 2 · emits rewind.restored, rewind.restoring, rewind.snapshot · tested by `clear-glass/test/phase2.test.js`

#### `clear-glass/src/screen-qa/`

1 code file(s).

- `clear-glass/src/screen-qa/detector.js` (143 lines) — detect open-ended on-screen questions (job-application screening questions, "why do you want this  
  exports deriveQuestion, detectOpenQuestions, buildAnswerPrompt, answerQuestion, injectAnswer · requires 1 · required by 1 · tested by `tests/modules/clear-glass-screen-qa.test.js`

#### `clear-glass/src/seam/`

1 code file(s).

- `clear-glass/src/seam/index.js` (38 lines) — src/seam/index.js — NEXUS registration shim This module is kept for gate backward-compat. Actual NEXUS registration  
  emits hook.result

#### `clear-glass/src/security/`

1 code file(s).

- `clear-glass/src/security/vault-key.js` (109 lines) — src/security/vault-key.js — one real key source for every clear-glass vault §BUILT 2026-09-23 — James: "yes clearglass" (Clear Glass owns accounts;  
  exports loadVaultKey, encryptWith, decryptWithFallback, ALGORITHM · requires 0 · required by 2

#### `clear-glass/src/shortcuts/`

1 code file(s).

- `clear-glass/src/shortcuts/registry.js` (175 lines) — src/shortcuts/registry.js — keyboard shortcuts: the actions, their default keys, and turning a key press into a binding.  
  exports ACTIONS, DEFAULT_BINDINGS, accelFromInput, normalize, isSafe, isValidAction +4 · requires 0 · required by 2

#### `clear-glass/src/site-settings/`

1 code file(s).

- `clear-glass/src/site-settings/store.js` (139 lines) — src/site-settings/store.js — Real Per-Site Settings Store Real gap named directly in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's  
  exports SiteSettingsStore, normalizeOrigin · requires 1 · required by 1 · tested by `clear-glass/test/storage-jaa.test.js`

#### `clear-glass/src/speech/`

1 code · 1 other file(s).

- `clear-glass/src/speech/engine.js` (94 lines) — src/speech/engine.js — Real Speech-to-Text Engine Real gap named in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's §9  
  exports transcribe, isAvailable · requires 0 · required by 1
- other: `clear-glass/src/speech/transcribe.py`

#### `clear-glass/src/sse/`

1 code file(s).

- `clear-glass/src/sse/server.js` (112 lines) — src/sse/server.js — SSE Bus Bridge Subscribes to the SISO bus via bus.on('*', ...) and broadcasts  
  requires 2 · required by 2

#### `clear-glass/src/storage/`

1 code file(s).

- `clear-glass/src/storage/jaa.js` (146 lines) — src/storage/jaa.js — Clear Glass's one database component_id: cg.storage.jaa  
  exports store, setDir, JaaKV, JaaRows, CG_DIR · requires 1 · required by 8 · tested by `clear-glass/test/storage-jaa.test.js`, `clear-glass/test/webextensions.test.js`

#### `clear-glass/src/tls/`

1 code file(s).

- `clear-glass/src/tls/proxy.js` (195 lines) — TLS Proxy — Firefox JA4 Fingerprint Layer Sits between Clear Glass and the internet.  
  requires 0 · required by 2 · emits tls.error, tls.tunnel

#### `clear-glass/src/toolbar/`

1 code file(s).

- `clear-glass/src/toolbar/commands.js` (142 lines)  
  exports TOOLBAR_COMMANDS, defaultPinnedIds, registerPluginCommand, unregisterPluginCommand · requires 0 · required by 2

#### `clear-glass/src/userscripts/`

1 code file(s).

- `clear-glass/src/userscripts/manager.js` (266 lines) — src/userscripts/manager.js — Clear Glass Userscript Manager Manages userscripts per agent. Scripts can be:

#### `clear-glass/test/`

10 test file(s).


#### `clear-glass/tools/`

1 other file(s).

- other: `clear-glass/tools/process-monitor.html`

#### `clear-glass/wire/`

2 code file(s).

- `clear-glass/wire/eros-registry-components.js` (123 lines) — wire/eros-registry-components.js ErosmancerOS component declarations for NEXUS component-registry.  
  requires 0 · required by 2
- `clear-glass/wire/nexus-wire.js` (256 lines) — wire/nexus-wire.js — ErosmancerOS ↔ Clear Glass ↔ NEXUS Standalone HTTP bridge process at port 7704.  
  exports start, EROS_COMPONENTS

<!-- generated:registry:end -->

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

## Fiverr gigs, written for you and filled into the editor (3.23.0, v0.39.301)
James: "I just want it to write gigs for me. Not automate talking or posting. Just write the gigs for me." · "No. I want ClearGlass to use autofill."

**Settings › Autofill & answers › Fiverr gigs.**
1. Pick your profile and say in one line what the gig offers (e.g. "simple websites for small businesses").
2. **Write the gig.** The co-pilot writes the title, tags, description, three packages (basic, standard, premium), FAQ and the questions buyers answer before work starts — only from what your profile says, never invented experience. Fiverr's limits are held, and anything cut is shown in yellow.
3. Edit any part in place. Each part has **Copy**, and **Copy everything** takes the whole gig.
4. **Fill the gig editor in a tab** (optional): open the step of Fiverr's gig editor you want, preview what goes where, then fill. It only types into boxes. It never saves, posts or publishes — you check the page and save it on Fiverr yourself. Fiverr's dropdowns and its description box may be its own widgets; those parts stay one click away to copy.

Code: `clear-glass/src/autofill/gig.js` (pure: prompt, parse and limits, parts, field matching, fill), called from `clear-glass/src/ipc/bridge.js` (IPC `autofill:gig`, `autofill:gig:detect`, `autofill:gig:fill`; REST `POST /cli/autofill/gig`, `/gig/detect`, `/gig/fill`) and the panel in `clear-glass/renderer/settings/sections/autofill.js`. Events `autofill.gig.drafted` and `autofill.gig.filled` are in `clear-glass/src/event-taxonomy.js`. Test: `tests/modules/clear-glass-gig.test.js`.
