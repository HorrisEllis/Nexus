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

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-24. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**944** files · **240** code files · **128** registry components declared here · **241** events emitted · **36** heard · **128** routes · **54** code files with a covering test

### Routes (128)

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
- IPC autofill:gig:file — A gig as a .gig file (YAML, limits beside each field), or an empty .gig template to fill in — text only, never saves, types or publishes · declared in `clear-glass/registry-components.js`
- IPC autofill:gig:fill — Type the gig into the gig editor open in a tab — never saves or publishes · declared in `clear-glass/registry-components.js`
- IPC autofill:gig:import — Load a gig from a .gig.json file — held to Fiverr's limits like a written gig; never saves, types or publishes · declared in `clear-glass/registry-components.js`
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
- IPC providers:account — Which account a provider tab runs as, the provider's dispatch account, and the saved sign-ins · declared in `clear-glass/registry-components.js`
- IPC providers:syncAccount — Bring a provider tab to its default account's saved sign-in (or save the tab's sign-in to it) · declared in `clear-glass/registry-components.js`
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
- … 8 more (loom: GET /api/registry/component/<id>)

### Events it emits (241) — and who hears them

- **bookmarks.added** — from `clear-glass/src/gates/index.js` → `clear-glass/test/phase2.test.js`
- **bookmarks.listed** — from `clear-glass/src/gates/index.js` → `clear-glass/test/phase2.test.js`
- **bus.test** — from `clear-glass/test/bus.test.js` → `clear-glass/test/bus.test.js`
- **dom.query.result** — from `clear-glass/src/gates/index.js` → `clear-glass/plugins/captcha-pause/index.js`
- **driver.result** — from `clear-glass/src/driver/index.js`, `clear-glass/src/gates/index.js` → `clear-glass/plugins/passwords/index.js`
- **driver.retry** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **mesh.route** — from `clear-glass/seam/watchdog-gates.js` → `clear-glass/test/watchdog.test.js`
- **passwords.result** — from `clear-glass/src/gates/index.js` → `clear-glass/plugins/passwords/index.js`
- **plugin:error** — from `clear-glass/src/plugins/host.js` → `clear-glass/src/ipc/bridge.js`
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
- **context.fp.switch** — from `clear-glass/src/main/index.pre-userscripts.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
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
- **diag.nexus** — from `clear-glass/src/main/index.pre-userscripts.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- … 161 more — loom.find.tool kind "event"

### Events it hears from elsewhere (12)

**cg:navigate** · **dom:event** · **dom:pick-result** · **floatcli:nav** · **floatcli:state** · **net.open** · **options:changed** · **passwords:available** · **passwords:offer** · **permission:decision** · **shortcut:action** · **webrequest:decision**

### Files, directory by directory (200 directories)

#### `clear-glass/`

2 code · 4 other file(s).

- `clear-glass/fix-orchestrator.js` (74 lines) — fix-orchestrator.js Fixes: Error: Cannot find module './lib/intent-map'
- `clear-glass/registry-components.js` (272 lines) — Clear Glass System Contract Served at GET /contract from the IPC server (port 7702).  
  exports systemId, namespace, version, port, tlsPort, wirePort +6 · requires 0 · required by 2 · tested by `tests/modules/clear-glass-gig.test.js`
- other: `clear-glass/README.md`, `clear-glass/compartment.json`, `clear-glass/interaction-contract.json`, `clear-glass/package.json`

#### `clear-glass/docs/`

1 other file(s).

- other: `clear-glass/docs/clear-glass-seam.spec.md`

#### `clear-glass/docs/gigs/`

3 other file(s).

- other: `clear-glass/docs/gigs/gig-template.gig`, `clear-glass/docs/gigs/nodejs-automation-scraping.gig`, `clear-glass/docs/gigs/nodejs-automation-scraping.gig.json`

#### `clear-glass/input/`

1 other file(s).

- other: `clear-glass/input/.gitkeep`

#### `clear-glass/phases/`

1 other file(s).

- other: `clear-glass/phases/INDEX.md`

#### `clear-glass/phases/2026-08-22-session-full/`

1 other file(s).

- other: `clear-glass/phases/2026-08-22-session-full/SF14_wake_pipeline_real_architecture.phase`

#### `clear-glass/phases/2026-08-22-session-full/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-08-22-session-full/graph/SF14_wake_pipeline_real_architecture-197e4087240a93cd.graph`

#### `clear-glass/phases/2026-08-23-backlog/`

17 other file(s).

- other: 17 files (.phase)

#### `clear-glass/phases/2026-08-23-backlog/graph/`

17 other file(s).

- other: 17 files (.graph)

#### `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/`

4 other file(s).

- other: `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR1_callto_component_hotswap_catalog.phase`, `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR4_erosmancer_as_clearglass_plugin.phase`, `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR8_clearglass_full_agent_tool_parity.phase`, `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR9_theme_consolidation_to_nexus_dark.phase`

#### `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/`

4 other file(s).

- other: `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR1_callto_component_hotswap_catalog-e6e82690ee483733.graph`, `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR4_erosmancer_as_clearglass_plugin-03ecdb7f9c99b61f.graph`, `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR8_clearglass_full_agent_tool_parity-62e54d03c6ab830a.graph`, `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR9_theme_consolidation_to_nexus_dark-4ab785621dee1689.graph`

#### `clear-glass/phases/2026-08-28-self-building-pipeline/`

1 other file(s).

- other: `clear-glass/phases/2026-08-28-self-building-pipeline/SBP7_agent_suite_lives_in_clearglass.phase`

#### `clear-glass/phases/2026-08-28-self-building-pipeline/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-08-28-self-building-pipeline/graph/SBP7_agent_suite_lives_in_clearglass-48087c2a9f893bf5.graph`

#### `clear-glass/phases/2026-08-30-interaction-contract-context/`

5 other file(s).

- other: `clear-glass/phases/2026-08-30-interaction-contract-context/IC11_agent_truth_fragmentation.phase`, `clear-glass/phases/2026-08-30-interaction-contract-context/IC3_intention_taxonomy_per_system.phase`, `clear-glass/phases/2026-08-30-interaction-contract-context/IC4_idearium_system_template_update.phase`, `clear-glass/phases/2026-08-30-interaction-contract-context/IC8_callto_event_driven_cli_injection.phase`, `clear-glass/phases/2026-08-30-interaction-contract-context/IC9_diagnostic_stall_detection_and_autofix.phase`

#### `clear-glass/phases/2026-08-30-interaction-contract-context/graph/`

5 other file(s).

- other: `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC11_agent_truth_fragmentation-0a51b71bfcb6edc5.graph`, `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC3_intention_taxonomy_per_system-4e285ed5aef34d74.graph`, `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC4_idearium_system_template_update-9f874130772add91.graph`, `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC8_callto_event_driven_cli_injection-f44516d2a55c9222.graph`, `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC9_diagnostic_stall_detection_and_autofix-13ed862cf85ae1ff.graph`

#### `clear-glass/phases/2026-08-30-interaction-contract-context/graph/_superseded/`

1 other file(s).

- other: `clear-glass/phases/2026-08-30-interaction-contract-context/graph/_superseded/IC11_agent_truth_fragmentation-b9dc58c002c61d18.graph`

#### `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/`

3 other file(s).

- other: `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/LM17_downloads_manager_for_artifacts.phase`, `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/LM24_atlas_prose_layer.phase`, `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/LM8_full_pipeline_wiring.phase`

#### `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/`

3 other file(s).

- other: `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM17_downloads_manager_for_artifacts-3d19dd972de8a30e.graph`, `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM24_atlas_prose_layer-fb1d1886928a6b42.graph`, `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM8_full_pipeline_wiring-b48e3d072c5de953.graph`

#### `clear-glass/phases/2026-09-02-nexus-vision-master/`

1 other file(s).

- other: `clear-glass/phases/2026-09-02-nexus-vision-master/T4_userscript_event_types.phase`

#### `clear-glass/phases/2026-09-02-nexus-vision-master/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-09-02-nexus-vision-master/graph/T4_userscript_event_types-921142887d6d72f5.graph`

#### `clear-glass/phases/2026-09-02-versionium-sovereign-and-cleanup/`

1 other file(s).

- other: `clear-glass/phases/2026-09-02-versionium-sovereign-and-cleanup/CG1_process_manager_in_settings.phase`

#### `clear-glass/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/CG1_process_manager_in_settings-fb5aa1a99a71129f.graph`

#### `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/`

8 other file(s).

- other: `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CG1_ncp_events_real.phase`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CG2_route_ncp_onto_guardian_sse.phase`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP1_tool_index_hooked_to_living_model.phase`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP2_copilot_versionium_awareness.phase`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP3_git_vs_versionium_decision.phase`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DA2_dispatch_outcome_events.phase`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/ID1_resolve_versionium_cortex_dependency.phase`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/IDU1_idearium_homepage_and_repo_browser.phase`

#### `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/`

8 other file(s).

- other: `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CG1_ncp_events_real-d173963e478d5d69.graph`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CG2_route_ncp_onto_guardian_sse-5a0bf626fc918b86.graph`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP1_tool_index_hooked_to_living_model-ce14ab9b2c29744b.graph`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP2_copilot_versionium_awareness-dc90fa1d06d6df9e.graph`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP3_git_vs_versionium_decision-5596e1b70a39c284.graph`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DA2_dispatch_outcome_events-24bdcc78690144b7.graph`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/ID1_resolve_versionium_cortex_dependency-4782d4c5e56ab572.graph`, `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/IDU1_idearium_homepage_and_repo_browser-59239d65a2593d97.graph`

#### `clear-glass/phases/2026-09-11-sovereign-node-architecture/`

16 other file(s).

- other: 16 files (.phase)

#### `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/`

16 other file(s).

- other: 16 files (.graph)

#### `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/`

9 other file(s).

- other: `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P1_driver.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P2_mesh_transport.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P3_endpoint.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P4_identity.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P6_verify.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T2_duplicate_prompt.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T3_wrong_page.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T4_two_actuators.phase`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T5_untestable_here.phase`

#### `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/`

9 other file(s).

- other: `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P1_driver-ca4c42738e1cad5b.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P2_mesh_transport-fb229d927ed658aa.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P3_endpoint-80b9c1cda9f7d5a5.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P4_identity-f5af86aa56495490.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P6_verify-e233123773468798.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T2_duplicate_prompt-fd69a7a86a7aeec7.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T3_wrong_page-36dd2c25439e70e1.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T4_two_actuators-1e41d389b0d7fe92.graph`, `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T5_untestable_here-3ec3c1ec8bf6950c.graph`

#### `clear-glass/phases/2026-09-29-build-surface/`

2 other file(s).

- other: `clear-glass/phases/2026-09-29-build-surface/BS0_compartment_windows.phase`, `clear-glass/phases/2026-09-29-build-surface/BS17_copilot_browser_verbs.phase`

#### `clear-glass/phases/2026-09-29-build-surface/graph/`

2 other file(s).

- other: `clear-glass/phases/2026-09-29-build-surface/graph/BS0_compartment_windows-96cfa0a56795fd3f.graph`, `clear-glass/phases/2026-09-29-build-surface/graph/BS17_copilot_browser_verbs-612a170a43473d39.graph`

#### `clear-glass/phases/2026-09-29-provider-economy/`

1 other file(s).

- other: `clear-glass/phases/2026-09-29-provider-economy/EC9_input_path_in_editors.phase`

#### `clear-glass/phases/2026-09-29-provider-economy/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-09-29-provider-economy/graph/EC9_input_path_in_editors-2b376534e7e951b9.graph`

#### `clear-glass/phases/2026-10-01-idearium-agent-ready-master/`

3 other file(s).

- other: `clear-glass/phases/2026-10-01-idearium-agent-ready-master/CG1_clear_glass_accounts_and_private.phase`, `clear-glass/phases/2026-10-01-idearium-agent-ready-master/CG2_clear_glass_drag_wrapper_and_fluid_url_bar.phase`, `clear-glass/phases/2026-10-01-idearium-agent-ready-master/PF10_clear_glass_err_aborted_9000.phase`

#### `clear-glass/phases/2026-10-01-idearium-agent-ready-master/graph/`

3 other file(s).

- other: `clear-glass/phases/2026-10-01-idearium-agent-ready-master/graph/CG1_clear_glass_accounts_and_private-adf380e049b8562f.graph`, `clear-glass/phases/2026-10-01-idearium-agent-ready-master/graph/CG2_clear_glass_drag_wrapper_and_fluid_url_bar-c9f738c8197eb8e4.graph`, `clear-glass/phases/2026-10-01-idearium-agent-ready-master/graph/PF10_clear_glass_err_aborted_9000-8f9d250d6b6fb2ea.graph`

#### `clear-glass/phases/2026-10-01-work-visibility-job-reuse/`

1 other file(s).

- other: `clear-glass/phases/2026-10-01-work-visibility-job-reuse/J5.phase`

#### `clear-glass/phases/2026-10-01-work-visibility-job-reuse/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-01-work-visibility-job-reuse/graph/J5-664d74fc10c451b6.graph`

#### `clear-glass/phases/2026-10-02-emerge-field-memory-build/`

1 other file(s).

- other: `clear-glass/phases/2026-10-02-emerge-field-memory-build/PR2_screenshots_through_clear_glass.phase`

#### `clear-glass/phases/2026-10-02-emerge-field-memory-build/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-02-emerge-field-memory-build/graph/PR2_screenshots_through_clear_glass-3444f6584530ed41.graph`

#### `clear-glass/phases/2026-10-05-fiverr-guide/`

2 other file(s).

- other: `clear-glass/phases/2026-10-05-fiverr-guide/FR1_the_guide.phase`, `clear-glass/phases/2026-10-05-fiverr-guide/FR2_show_me_on_the_page.phase`

#### `clear-glass/phases/2026-10-05-fiverr-guide/graph/`

2 other file(s).

- other: `clear-glass/phases/2026-10-05-fiverr-guide/graph/FR1_the_guide-c57302eaf1167ddf.graph`, `clear-glass/phases/2026-10-05-fiverr-guide/graph/FR2_show_me_on_the_page-b6e7861ffe663d01.graph`

#### `clear-glass/phases/2026-10-05-idea-to-spec-workshop/`

1 other file(s).

- other: `clear-glass/phases/2026-10-05-idea-to-spec-workshop/WK0_pop_out_windows_borderless.phase`

#### `clear-glass/phases/2026-10-05-idea-to-spec-workshop/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-05-idea-to-spec-workshop/graph/WK0_pop_out_windows_borderless-460dfe0e0222e3da.graph`

#### `clear-glass/phases/2026-10-07-compartment-control-and-activity/`

1 other file(s).

- other: `clear-glass/phases/2026-10-07-compartment-control-and-activity/DC1_a_click_that_did_nothing.phase`

#### `clear-glass/phases/2026-10-07-compartment-control-and-activity/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-07-compartment-control-and-activity/graph/DC1_a_click_that_did_nothing-58a4e2e09bd4dc9c.graph`

#### `clear-glass/phases/2026-10-10-design-surface/`

3 other file(s).

- other: `clear-glass/phases/2026-10-10-design-surface/DS1_tokens_edited_live.phase`, `clear-glass/phases/2026-10-10-design-surface/DS2_pick_and_edit_any_page.phase`, `clear-glass/phases/2026-10-10-design-surface/DS4_interface_types_by_adapter.phase`

#### `clear-glass/phases/2026-10-10-design-surface/graph/`

3 other file(s).

- other: `clear-glass/phases/2026-10-10-design-surface/graph/DS1_tokens_edited_live-8d477dcf2270ac45.graph`, `clear-glass/phases/2026-10-10-design-surface/graph/DS2_pick_and_edit_any_page-47581699d0b5073d.graph`, `clear-glass/phases/2026-10-10-design-surface/graph/DS4_interface_types_by_adapter-23e21f01a2f3ded3.graph`

#### `clear-glass/phases/2026-10-10-idearium-access/`

1 other file(s).

- other: `clear-glass/phases/2026-10-10-idearium-access/IA4_clear_glass_signs_in_for_you.phase`

#### `clear-glass/phases/2026-10-10-idearium-access/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-10-idearium-access/graph/IA4_clear_glass_signs_in_for_you-5aa67551e81230b4.graph`

#### `clear-glass/phases/2026-10-10-idearium-solid/`

1 other file(s).

- other: `clear-glass/phases/2026-10-10-idearium-solid/SD8_an_agent_can_see_and_fix_a_tab.phase`

#### `clear-glass/phases/2026-10-10-idearium-solid/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-10-idearium-solid/graph/SD8_an_agent_can_see_and_fix_a_tab-487ac3e1e6056957.graph`

#### `clear-glass/phases/2026-10-10-shape-of-nexus/`

6 other file(s).

- other: `clear-glass/phases/2026-10-10-shape-of-nexus/CG1_the_field_injects_once.phase`, `clear-glass/phases/2026-10-10-shape-of-nexus/CG2_one_source_of_truth_for_the_browser.phase`, `clear-glass/phases/2026-10-10-shape-of-nexus/CG3_the_fiverr_tutorial_in_the_browser.phase`, `clear-glass/phases/2026-10-10-shape-of-nexus/FN2_nerve_sees_the_field.phase`, `clear-glass/phases/2026-10-10-shape-of-nexus/SH2_explain_this_anywhere.phase`, `clear-glass/phases/2026-10-10-shape-of-nexus/TU1_the_nexus_tutorial.phase`

#### `clear-glass/phases/2026-10-10-shape-of-nexus/graph/`

6 other file(s).

- other: `clear-glass/phases/2026-10-10-shape-of-nexus/graph/CG1_the_field_injects_once-d4aad8bc65bd8eba.graph`, `clear-glass/phases/2026-10-10-shape-of-nexus/graph/CG2_one_source_of_truth_for_the_browser-b8620004bc4e6726.graph`, `clear-glass/phases/2026-10-10-shape-of-nexus/graph/CG3_the_fiverr_tutorial_in_the_browser-aaa3675caef098b9.graph`, `clear-glass/phases/2026-10-10-shape-of-nexus/graph/FN2_nerve_sees_the_field-716118daf05d258b.graph`, `clear-glass/phases/2026-10-10-shape-of-nexus/graph/SH2_explain_this_anywhere-ee5f18699614cf8c.graph`, `clear-glass/phases/2026-10-10-shape-of-nexus/graph/TU1_the_nexus_tutorial-3c410e7addc61b7e.graph`

#### `clear-glass/phases/2026-10-12-browser-providers-and-work/`

17 other file(s).

- other: 17 files (.phase)

#### `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/`

17 other file(s).

- other: 17 files (.graph)

#### `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/`

4 other file(s).

- other: `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/JB3_autofill_fields_mapped_by_pick-f03c5d98203972f2.graph`, `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/JB4_resume_import-5f5bfc35c620b31f.graph`, `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/JB6_the_application_ledger-46f6fdd5ad1b1534.graph`, `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/TB5_site_and_account_nodes-43acd84436dcbc96.graph`

#### `clear-glass/phases/2026-10-13-gates-that-learn-and-priorities/`

1 other file(s).

- other: `clear-glass/phases/2026-10-13-gates-that-learn-and-priorities/PF1_profiles_hats_tabs.phase`

#### `clear-glass/phases/2026-10-13-gates-that-learn-and-priorities/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-13-gates-that-learn-and-priorities/graph/PF1_profiles_hats_tabs-559a264e9111dce2.graph`

#### `clear-glass/phases/2026-10-13-identities-tabs-and-automation/`

16 other file(s).

- other: 16 files (.phase)

#### `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/`

16 other file(s).

- other: 16 files (.graph)

#### `clear-glass/phases/2026-10-13-projects-raid-and-gates/`

1 other file(s).

- other: `clear-glass/phases/2026-10-13-projects-raid-and-gates/WF0_workflows.phase`

#### `clear-glass/phases/2026-10-13-projects-raid-and-gates/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-13-projects-raid-and-gates/graph/WF0_workflows-974d9c5ead887971.graph`

#### `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/`

3 other file(s).

- other: `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/CS3_feature_starts_as_a_spec.phase`, `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/SP1_semantic_page_tree.phase`, `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/SP2_semantic_addresses_for_the_field_map.phase`

#### `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/`

3 other file(s).

- other: `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/CS3_feature_starts_as_a_spec-a5a6068f4e05064d.graph`, `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/SP1_semantic_page_tree-8a8b6900ce74fa3b.graph`, `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/SP2_semantic_addresses_for_the_field_map-e4824b3db829762f.graph`

#### `clear-glass/phases/2026-10-15-clear-glass-network-posture/`

18 other file(s).

- other: 18 files (.phase)

#### `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/`

18 other file(s).

- other: 18 files (.graph)

#### `clear-glass/phases/2026-10-15-clear-glass-surfaces/`

5 other file(s).

- other: `clear-glass/phases/2026-10-15-clear-glass-surfaces/CS1_one_popup_frame.phase`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/CS2_settings_providers_and_accounts.phase`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/CS3_clear_glass_users_as_plugins.phase`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/PF2_the_items.phase`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/PF3_the_section.phase`

#### `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/`

5 other file(s).

- other: `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/CS1_one_popup_frame-2309fce9f645ea6b.graph`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/CS2_settings_providers_and_accounts-377b41fc576de436.graph`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/CS3_clear_glass_users_as_plugins-65f150cb1b4a6789.graph`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/PF2_the_items-63bc80b6b271a79e.graph`, `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/PF3_the_section-66f9578d26cb5b2c.graph`

#### `clear-glass/phases/2026-10-15-cos-app/`

1 other file(s).

- other: `clear-glass/phases/2026-10-15-cos-app/COSA7_clear_glass_delivers.phase`

#### `clear-glass/phases/2026-10-15-cos-app/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-15-cos-app/graph/COSA7_clear_glass_delivers-07b5a7f81ad0d2e7.graph`

#### `clear-glass/phases/2026-10-15-macro-node-recording/`

13 other file(s).

- other: 13 files (.phase)

#### `clear-glass/phases/2026-10-15-macro-node-recording/graph/`

13 other file(s).

- other: 13 files (.graph)

#### `clear-glass/phases/2026-10-15-personal-chat-import/`

7 other file(s).

- other: `clear-glass/phases/2026-10-15-personal-chat-import/PI2_the_listener.phase`, `clear-glass/phases/2026-10-15-personal-chat-import/PI3b_the_measured_patterns.phase`, `clear-glass/phases/2026-10-15-personal-chat-import/PI4_the_review_screen.phase`, `clear-glass/phases/2026-10-15-personal-chat-import/PI5_the_crawler.phase`, `clear-glass/phases/2026-10-15-personal-chat-import/PI5_the_sync.phase`, `clear-glass/phases/2026-10-15-personal-chat-import/PI6_the_firefox_script.phase`, `clear-glass/phases/2026-10-15-personal-chat-import/PI7_the_links.phase`

#### `clear-glass/phases/2026-10-15-personal-chat-import/graph/`

7 other file(s).

- other: `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI2_the_listener-d65ed1a624638d21.graph`, `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI3b_the_measured_patterns-6edf264fc41eb579.graph`, `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI4_the_review_screen-3419972235b0c3d4.graph`, `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI5_the_crawler-f8d69ae582cc49df.graph`, `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI5_the_sync-548476dceeead35e.graph`, `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI6_the_firefox_script-bf5f6880f62879e2.graph`, `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI7_the_links-8e6fdc9331be6c5f.graph`

#### `clear-glass/phases/2026-10-16-code-tab-rebuild/`

2 other file(s).

- other: `clear-glass/phases/2026-10-16-code-tab-rebuild/TB7_runs_tab.phase`, `clear-glass/phases/2026-10-16-code-tab-rebuild/TB7c_graph_and_zoom.phase`

#### `clear-glass/phases/2026-10-16-code-tab-rebuild/graph/`

2 other file(s).

- other: `clear-glass/phases/2026-10-16-code-tab-rebuild/graph/TB7_runs_tab-56ae3f6835f01b06.graph`, `clear-glass/phases/2026-10-16-code-tab-rebuild/graph/TB7c_graph_and_zoom-78e30e5a8955bb39.graph`

#### `clear-glass/phases/2026-10-16-google-signin/`

6 other file(s).

- other: `clear-glass/phases/2026-10-16-google-signin/GS1_present_as_firefox_on_google_signin.phase`, `clear-glass/phases/2026-10-16-google-signin/GS2_request_hooks_compose.phase`, `clear-glass/phases/2026-10-16-google-signin/GS3_domains_and_version.phase`, `clear-glass/phases/2026-10-16-google-signin/GS4_page_without_a_debugger.phase`, `clear-glass/phases/2026-10-16-google-signin/GS5_contexts_one_firefox.phase`, `clear-glass/phases/2026-10-16-google-signin/GS6_proxy.phase`

#### `clear-glass/phases/2026-10-16-google-signin/graph/`

6 other file(s).

- other: `clear-glass/phases/2026-10-16-google-signin/graph/GS1_present_as_firefox_on_google_signin-0c6919648171727e.graph`, `clear-glass/phases/2026-10-16-google-signin/graph/GS2_request_hooks_compose-0889c4dbc2a8419e.graph`, `clear-glass/phases/2026-10-16-google-signin/graph/GS3_domains_and_version-be7633a1c9ac3502.graph`, `clear-glass/phases/2026-10-16-google-signin/graph/GS4_page_without_a_debugger-b89e3f9a2ae563ec.graph`, `clear-glass/phases/2026-10-16-google-signin/graph/GS5_contexts_one_firefox-8fd91edb7c3ff9cb.graph`, `clear-glass/phases/2026-10-16-google-signin/graph/GS6_proxy-aea64bd8ae7f3973.graph`

#### `clear-glass/phases/2026-10-16-nexus-git-sync/`

5 other file(s).

- other: `clear-glass/phases/2026-10-16-nexus-git-sync/GS1_commands.phase`, `clear-glass/phases/2026-10-16-nexus-git-sync/GS2_nexus_as_a_repo.phase`, `clear-glass/phases/2026-10-16-nexus-git-sync/GS3_pull_is_a_switch.phase`, `clear-glass/phases/2026-10-16-nexus-git-sync/GS4_push_policy.phase`, `clear-glass/phases/2026-10-16-nexus-git-sync/GS6_update_notice.phase`

#### `clear-glass/phases/2026-10-16-nexus-git-sync/graph/`

5 other file(s).

- other: `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS1_commands-81faeb652af072b8.graph`, `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS2_nexus_as_a_repo-202b9f274359c7c1.graph`, `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS3_pull_is_a_switch-39af288a02e05a34.graph`, `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS4_push_policy-498533e55109c664.graph`, `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS6_update_notice-1d54722ef89351a1.graph`

#### `clear-glass/phases/2026-10-16-tls-layer/`

3 other file(s).

- other: `clear-glass/phases/2026-10-16-tls-layer/TLS1_helper.phase`, `clear-glass/phases/2026-10-16-tls-layer/TLS2_clear_glass_runs_it.phase`, `clear-glass/phases/2026-10-16-tls-layer/TLS3_personas_use_it.phase`

#### `clear-glass/phases/2026-10-16-tls-layer/graph/`

3 other file(s).

- other: `clear-glass/phases/2026-10-16-tls-layer/graph/TLS1_helper-65a76242b17b178d.graph`, `clear-glass/phases/2026-10-16-tls-layer/graph/TLS2_clear_glass_runs_it-b14334ea754ba2f7.graph`, `clear-glass/phases/2026-10-16-tls-layer/graph/TLS3_personas_use_it-01945ef6a6f43e3f.graph`

#### `clear-glass/phases/2026-10-19-gig-autofill-and-learn/`

10 other file(s).

- other: `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA1_copilot_fills_the_gig.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA1a_a_written_gig_is_remembered.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA2_a_missed_field_asks_the_picker.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA3_the_pick_is_saved_three_ways.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA4_the_matcher_learns.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA1_the_matcher_consults_learned.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA2_a_pick_is_saved_per_site.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA3_the_picker_on_a_miss.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA4_the_learn_loop_ui.phase`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA5_the_pick_is_also_a_macro.phase`

#### `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/`

10 other file(s).

- other: `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA1_copilot_fills_the_gig-6d8a7e5ce0db2455.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA1a_a_written_gig_is_remembered-dfa9db0a9ad9b3e7.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA2_a_missed_field_asks_the_picker-5486fbf8b49b9969.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA3_the_pick_is_saved_three_ways-b06bce491aee3a8d.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA4_the_matcher_learns-a4442f1b8c96933e.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA1_the_matcher_consults_learned-8650f43be33938ea.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA2_a_pick_is_saved_per_site-af5f76542e8c50de.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA3_the_picker_on_a_miss-5c93f0806d60b930.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA4_the_learn_loop_ui-bf671d3ddbd3bbcc.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA5_the_pick_is_also_a_macro-66ae4523314f8948.graph`

#### `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/`

3 other file(s).

- other: `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/GA1a_a_written_gig_is_remembered-f600c0df5b9c0f5c.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/GA2_a_missed_field_asks_the_picker-99874dafdee9dee9.graph`, `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/GA3_the_pick_is_saved_three_ways-44b0a16a16b16c5c.graph`

#### `clear-glass/phases/2026-10-19-pipeline-root-causes/`

1 other file(s).

- other: `clear-glass/phases/2026-10-19-pipeline-root-causes/PR1_page_reader.phase`

#### `clear-glass/phases/2026-10-19-pipeline-root-causes/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-19-pipeline-root-causes/graph/PR1_page_reader-1b941aeeae85b18a.graph`

#### `clear-glass/phases/2026-10-19-upload-intent-and-page-map/`

7 other file(s).

- other: `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM1_blocks.phase`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM2_index_and_chunks.phase`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM3_synthesized_map_that_learns.phase`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM4_intent_to_targets.phase`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM5_tools_routes_commands.phase`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM7_live_injected_map.phase`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM8_page_map_panel.phase`

#### `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/`

7 other file(s).

- other: `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM1_blocks-283abe1c8554e022.graph`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM2_index_and_chunks-7f6219ca6e083920.graph`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM3_synthesized_map_that_learns-96e7aa80c587e8fa.graph`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM4_intent_to_targets-e1554f1dbdf1cb92.graph`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM5_tools_routes_commands-00c3906ed11442c9.graph`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM7_live_injected_map-0026f5b7f1346993.graph`, `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM8_page_map_panel-cbb3ab807175cb3c.graph`

#### `clear-glass/phases/2026-10-21-adblock/`

5 other file(s).

- other: `clear-glass/phases/2026-10-21-adblock/AB1_engine.phase`, `clear-glass/phases/2026-10-21-adblock/AB2_lists.phase`, `clear-glass/phases/2026-10-21-adblock/AB3_wiring.phase`, `clear-glass/phases/2026-10-21-adblock/AB4_surface.phase`, `clear-glass/phases/2026-10-21-adblock/AB5_import.phase`

#### `clear-glass/phases/2026-10-21-adblock/graph/`

5 other file(s).

- other: `clear-glass/phases/2026-10-21-adblock/graph/AB1_engine-ce7213dcdf797a4c.graph`, `clear-glass/phases/2026-10-21-adblock/graph/AB2_lists-403ef9771243dd1b.graph`, `clear-glass/phases/2026-10-21-adblock/graph/AB3_wiring-0f2843b6cd64ba0b.graph`, `clear-glass/phases/2026-10-21-adblock/graph/AB4_surface-3faa436c3064d0f8.graph`, `clear-glass/phases/2026-10-21-adblock/graph/AB5_import-8bd5bbcc7bc580a9.graph`

#### `clear-glass/phases/2026-10-21-adblock/graph/_superseded/`

4 other file(s).

- other: `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB1_engine-20cef4608d9b1787.graph`, `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB2_lists-48ec7173619ce759.graph`, `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB3_wiring-f21a76a58142b5cf.graph`, `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB4_surface-c9c24c363b6af3aa.graph`

#### `clear-glass/phases/2026-10-21-brainos-into-idearium/`

1 other file(s).

- other: `clear-glass/phases/2026-10-21-brainos-into-idearium/BX10_float.phase`

#### `clear-glass/phases/2026-10-21-brainos-into-idearium/graph/`

1 other file(s).

- other: `clear-glass/phases/2026-10-21-brainos-into-idearium/graph/BX10_float-718eb952045d7b89.graph`

#### `clear-glass/phases/2026-10-21-browser-shell/`

20 other file(s).

- other: 20 files (.phase)

#### `clear-glass/phases/2026-10-21-browser-shell/graph/`

20 other file(s).

- other: 20 files (.graph)

#### `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/`

5 other file(s).

- other: `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS12_context_automatic-0ff3ebe721017029.graph`, `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS12_context_automatic-953b56c3f6ba45cd.graph`, `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS14_zoom_core-5aa982aa70280429.graph`, `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS15_context_menu-b603bd17ec87a808.graph`, `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS6_float_cli-c0fd47f327b73e8c.graph`

#### `clear-glass/phases/2026-10-21-compartment-downloads/`

5 other file(s).

- other: `clear-glass/phases/2026-10-21-compartment-downloads/CD1_magnet_parse.phase`, `clear-glass/phases/2026-10-21-compartment-downloads/CD2_quarantine_downloads.phase`, `clear-glass/phases/2026-10-21-compartment-downloads/CD3_verified_handoff.phase`, `clear-glass/phases/2026-10-21-compartment-downloads/CD4_kill_on_disconnect.phase`, `clear-glass/phases/2026-10-21-compartment-downloads/CD5_surface.phase`

#### `clear-glass/phases/2026-10-21-compartment-downloads/graph/`

5 other file(s).

- other: `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD1_magnet_parse-e3defc132656fe7c.graph`, `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD2_quarantine_downloads-3d4f0cd284c268ef.graph`, `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD3_verified_handoff-b1f1f8ce8c648a8f.graph`, `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD4_kill_on_disconnect-5cffcae8e1562525.graph`, `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD5_surface-925d52606c535ce8.graph`

#### `clear-glass/phases/2026-10-21-compartment-downloads/graph/_superseded/`

2 other file(s).

- other: `clear-glass/phases/2026-10-21-compartment-downloads/graph/_superseded/CD4_kill_on_disconnect-37c214a6e1300775.graph`, `clear-glass/phases/2026-10-21-compartment-downloads/graph/_superseded/CD5_surface-182f083bae4413ca.graph`

#### `clear-glass/phases/2026-10-21-passwords/`

4 other file(s).

- other: `clear-glass/phases/2026-10-21-passwords/PW1_service.phase`, `clear-glass/phases/2026-10-21-passwords/PW2_page.phase`, `clear-glass/phases/2026-10-21-passwords/PW3_wiring.phase`, `clear-glass/phases/2026-10-21-passwords/PW4_surface.phase`

#### `clear-glass/phases/2026-10-21-passwords/graph/`

4 other file(s).

- other: `clear-glass/phases/2026-10-21-passwords/graph/PW1_service-1adb1f53787dac35.graph`, `clear-glass/phases/2026-10-21-passwords/graph/PW2_page-a3c8be28c7f429ea.graph`, `clear-glass/phases/2026-10-21-passwords/graph/PW3_wiring-a624445100ffd099.graph`, `clear-glass/phases/2026-10-21-passwords/graph/PW4_surface-3c20d9cd7701c3e2.graph`

#### `clear-glass/phases/2026-10-21-passwords/graph/_superseded/`

2 other file(s).

- other: `clear-glass/phases/2026-10-21-passwords/graph/_superseded/PW1_service-0fb18010d2b4dadf.graph`, `clear-glass/phases/2026-10-21-passwords/graph/_superseded/PW3_wiring-7f2131c31f53703e.graph`

#### `clear-glass/phases/2026-10-21-snowflake-compartment/`

9 other file(s).

- other: `clear-glass/phases/2026-10-21-snowflake-compartment/SF1_honest_detection.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF2_bridge_sources.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF3_page_in_the_compartment.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF4_https_only.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF5_circuit_check.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF6_surface.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF7_bridge_automatic.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF8_host_import.phase`, `clear-glass/phases/2026-10-21-snowflake-compartment/SF9_install_in_use.phase`

#### `clear-glass/phases/2026-10-21-snowflake-compartment/graph/`

9 other file(s).

- other: `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF1_honest_detection-bcc77d2324b63a88.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF2_bridge_sources-ea5b5eea6b68382f.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF3_page_in_the_compartment-0ccd30fdd4450abd.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF4_https_only-502b5c00f2ac8030.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF5_circuit_check-1d7cfbc07fe905be.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF6_surface-87e275793f76b7a7.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF7_bridge_automatic-130bca196028d7d7.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF8_host_import-b02e6f7310f9be5f.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF9_install_in_use-0f35a722345fb09e.graph`

#### `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/`

8 other file(s).

- other: `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF1_honest_detection-8e5bdcaa5c7f6e9f.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF1_honest_detection-e5aa6ec75cff3f9c.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF3_page_in_the_compartment-f34764dd0fbfd96e.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF5_circuit_check-ac5c7c03123bac85.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF5_circuit_check-f8487134f916abcc.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF6_surface-6689d30ab14e6f63.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF6_surface-dfa1169546059591.graph`, `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF7_bridge_automatic-1fb57e40a95cf705.graph`

#### `clear-glass/phases/2026-10-23-site-profile-processes/`

6 other file(s).

- other: `clear-glass/phases/2026-10-23-site-profile-processes/SP1_one_resolver_for_every_feature.phase`, `clear-glass/phases/2026-10-23-site-profile-processes/SP2_each_feature_reads_its_site_value.phase`, `clear-glass/phases/2026-10-23-site-profile-processes/SP3_the_site_settings_screen.phase`, `clear-glass/phases/2026-10-23-site-profile-processes/SP4_cleardriver_mesh_guardian_settings.phase`, `clear-glass/phases/2026-10-23-site-profile-processes/SP5_processes_and_activity.phase`, `clear-glass/phases/2026-10-23-site-profile-processes/SP6_the_processes_screen.phase`

#### `clear-glass/phases/2026-10-23-site-profile-processes/graph/`

6 other file(s).

- other: `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP1_one_resolver_for_every_feature-26dcc9df7dd4d061.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP2_each_feature_reads_its_site_value-5cb374cc92e52409.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP3_the_site_settings_screen-344ad9a833e51ca5.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP4_cleardriver_mesh_guardian_settings-fb57cef4503dcfda.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP5_processes_and_activity-d43cecd51dde3c80.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP6_the_processes_screen-ba0b54480cfed70e.graph`

#### `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/`

9 other file(s).

- other: `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP1_one_resolver_for_every_feature-603b7985ce8f9b73.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP1_one_resolver_for_every_feature-7eae9a633ce4b434.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP2_each_feature_reads_its_site_value-249259a90e6883d4.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP2_each_feature_reads_its_site_value-817ef2353afca489.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP3_the_site_settings_screen-1d671034540d6a5c.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP4_cleardriver_mesh_guardian_settings-4ef5b98a501e3da4.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP4_cleardriver_mesh_guardian_settings-daaaec093ead2831.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP5_processes_and_activity-ca2e1a930897994f.graph`, `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP6_the_processes_screen-d170b15d089baaf0.graph`

#### `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/`

8 other file(s).

- other: `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX12_bookmark_reconciliation.phase`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX13_browser_chrome_backlog.phase`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX15_whisper_as_a_real_optional_capability.phase`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX16_persistent_listener_registry_and_callable_elements.phase`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX3_talk_to_agent_launcher.phase`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX5_backup_snapshot_for_talk_to_agent.phase`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX6_stop_using_this_chat_migration.phase`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX8_3d_cfr_visual_for_loom.phase`

#### `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/`

8 other file(s).

- other: `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX12_bookmark_reconciliation-c7c761c27904fff6.graph`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX13_browser_chrome_backlog-6657fef2cd1f6328.graph`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX15_whisper_as_a_real_optional_capability-9064ceff1c0912a4.graph`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX16_persistent_listener_registry_and_callable_elements-22078f9597907db9.graph`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX3_talk_to_agent_launcher-095e5e9f21e07bf9.graph`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX5_backup_snapshot_for_talk_to_agent-c39c26b3536d05a0.graph`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX6_stop_using_this_chat_migration-70835de8de91fd23.graph`, `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX8_3d_cfr_visual_for_loom-ebbf61ff54a94603.graph`

#### `clear-glass/phases/copilot-autonomous/`

1 other file(s).

- other: `clear-glass/phases/copilot-autonomous/CA2_triggers_conditions.phase`

#### `clear-glass/phases/copilot-autonomous/graph/`

1 other file(s).

- other: `clear-glass/phases/copilot-autonomous/graph/CA2_triggers_conditions-92729b5ec5388a88.graph`

#### `clear-glass/phases/copilot-awareness-routing/`

4 other file(s).

- other: `clear-glass/phases/copilot-awareness-routing/CA1_status_report.phase`, `clear-glass/phases/copilot-awareness-routing/CA3_tool_first.phase`, `clear-glass/phases/copilot-awareness-routing/CA4_capability_extend.phase`, `clear-glass/phases/copilot-awareness-routing/CA7_clearglass_multi_account.phase`

#### `clear-glass/phases/copilot-awareness-routing/graph/`

4 other file(s).

- other: `clear-glass/phases/copilot-awareness-routing/graph/CA1_status_report-12cbbffc8d376eab.graph`, `clear-glass/phases/copilot-awareness-routing/graph/CA3_tool_first-913f66ec208c6737.graph`, `clear-glass/phases/copilot-awareness-routing/graph/CA4_capability_extend-7ebf1286b0abb9d9.graph`, `clear-glass/phases/copilot-awareness-routing/graph/CA7_clearglass_multi_account-efcdff2b11c0d466.graph`

#### `clear-glass/phases/copilot-full-capability/`

2 other file(s).

- other: `clear-glass/phases/copilot-full-capability/P5_clear_glass_url_tools.phase`, `clear-glass/phases/copilot-full-capability/P8_rewind_replay_tool.phase`

#### `clear-glass/phases/copilot-full-capability/graph/`

2 other file(s).

- other: `clear-glass/phases/copilot-full-capability/graph/P5_clear_glass_url_tools-f149cbe6b2883fce.graph`, `clear-glass/phases/copilot-full-capability/graph/P8_rewind_replay_tool-ad52bfced684ea88.graph`

#### `clear-glass/phases/nexus-self-build-pipeline/`

1 other file(s).

- other: `clear-glass/phases/nexus-self-build-pipeline/SB9_full_clearglass_control.phase`

#### `clear-glass/phases/nexus-self-build-pipeline/graph/`

1 other file(s).

- other: `clear-glass/phases/nexus-self-build-pipeline/graph/SB9_full_clearglass_control-77c994bfadf395ac.graph`

#### `clear-glass/phases/raid-verification-spine/`

4 other file(s).

- other: `clear-glass/phases/raid-verification-spine/P2_constitution_on_the_approve_path.phase`, `clear-glass/phases/raid-verification-spine/P4_sigma_and_drift_scoring.phase`, `clear-glass/phases/raid-verification-spine/P5_compare_contract_vs_output.phase`, `clear-glass/phases/raid-verification-spine/P7_one_raid_verify_entrypoint.phase`

#### `clear-glass/phases/raid-verification-spine/graph/`

4 other file(s).

- other: `clear-glass/phases/raid-verification-spine/graph/P2_constitution_on_the_approve_path-c2b44c2f71d1648f.graph`, `clear-glass/phases/raid-verification-spine/graph/P4_sigma_and_drift_scoring-0bc9660bb9269c47.graph`, `clear-glass/phases/raid-verification-spine/graph/P5_compare_contract_vs_output-056dbb544ba1058f.graph`, `clear-glass/phases/raid-verification-spine/graph/P7_one_raid_verify_entrypoint-f6475ea7b7f6cac4.graph`

#### `clear-glass/phases/raid-verification-spine/graph/_superseded/`

1 other file(s).

- other: `clear-glass/phases/raid-verification-spine/graph/_superseded/P2_constitution_on_the_approve_path-f38f5f3bd87e3832.graph`

#### `clear-glass/phases/raid-warp-verification/`

8 other file(s).

- other: `clear-glass/phases/raid-warp-verification/P11_diagnose_and_repair_on_prompt.phase`, `clear-glass/phases/raid-warp-verification/P1_raid_records_every_decision.phase`, `clear-glass/phases/raid-warp-verification/P2_constitution_gate.phase`, `clear-glass/phases/raid-warp-verification/P3_cos_isolate_and_verify.phase`, `clear-glass/phases/raid-warp-verification/P4_sigma_drift_score.phase`, `clear-glass/phases/raid-warp-verification/P5_compare_contract_vs_output.phase`, `clear-glass/phases/raid-warp-verification/P7_one_raid_verify_spine.phase`, `clear-glass/phases/raid-warp-verification/P8_ui_as_copilot_tools.phase`

#### `clear-glass/phases/raid-warp-verification/graph/`

8 other file(s).

- other: `clear-glass/phases/raid-warp-verification/graph/P11_diagnose_and_repair_on_prompt-fd9f03d8e2ba0434.graph`, `clear-glass/phases/raid-warp-verification/graph/P1_raid_records_every_decision-50590a227a1bc452.graph`, `clear-glass/phases/raid-warp-verification/graph/P2_constitution_gate-8aac611e5c52d941.graph`, `clear-glass/phases/raid-warp-verification/graph/P3_cos_isolate_and_verify-3c5807492e4c58ca.graph`, `clear-glass/phases/raid-warp-verification/graph/P4_sigma_drift_score-f97bb1eb7af72c05.graph`, `clear-glass/phases/raid-warp-verification/graph/P5_compare_contract_vs_output-aee6030d764aba5b.graph`, `clear-glass/phases/raid-warp-verification/graph/P7_one_raid_verify_spine-d51684d9b6de9d1f.graph`, `clear-glass/phases/raid-warp-verification/graph/P8_ui_as_copilot_tools-34bbffc617747a9c.graph`

#### `clear-glass/phases/raid-warp-verification/graph/_superseded/`

1 other file(s).

- other: `clear-glass/phases/raid-warp-verification/graph/_superseded/P2_constitution_gate-dff121c29106c93f.graph`

#### `clear-glass/phases/rich-atlas/`

2 other file(s).

- other: `clear-glass/phases/rich-atlas/AT1_full_enumeration_and_clickable_links.phase`, `clear-glass/phases/rich-atlas/AT3_agent_queryable_atlas.phase`

#### `clear-glass/phases/rich-atlas/graph/`

2 other file(s).

- other: `clear-glass/phases/rich-atlas/graph/AT1_full_enumeration_and_clickable_links-b44d8db195669926.graph`, `clear-glass/phases/rich-atlas/graph/AT3_agent_queryable_atlas-528df862578c4752.graph`

#### `clear-glass/plugins/adblocker/`

1 code · 1 other file(s).

- `clear-glass/plugins/adblocker/index.js` (102 lines) — plugins/adblocker/index.js — the Ad Blocker plugin: the surface of Clear Glass's content blocker (AB3, 0.60.183). Spec: clear-glass/spec/adblock.spec MOD-ABK-WIRING.  
  exports isBlocked, filterRequest, toggleFromToolbar, settings, BLOCKLIST · requires 2 · required by 2
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

- `clear-glass/plugins/passwords/index.js` (167 lines) — PW4 (0.60.186) — James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses." Websites now reach the password manager through a…  
  exports settings, getFormDetectorUserscript, onFormDetected, promptSavePassword · requires 1 · required by 0 · emits driver.exec, passwords.get, passwords.save · hears driver.result, passwords.result
- other: `clear-glass/plugins/passwords/manifest.json`

#### `clear-glass/plugins/permissions/`

1 code · 1 other file(s).

- `clear-glass/plugins/permissions/index.js` (66 lines) — plugins/permissions/index.js — real permission-filter contribution. §UPDATED 2026-08-24 — now consults the real per-origin settings store  
  exports filterPermission, HIGH_RISK · emits driver.exec, site-settings.get · hears site-settings.result
- other: `clear-glass/plugins/permissions/manifest.json`

#### `clear-glass/plugins/snowflake/`

1 code · 1 other file(s).

- `clear-glass/plugins/snowflake/index.js` (71 lines) — plugins/snowflake/index.js — "Open link with Snowflake" (context-menu-item), NP11/NP12; its page (settings), SF8 0.60.184. Composes with core the way every plugin here does: ctx.emit / ctx.on…  
  exports openLink, openPage, settings · requires 3 · required by 0
- other: `clear-glass/plugins/snowflake/manifest.json`

#### `clear-glass/renderer/`

10 code · 10 other file(s).

- `clear-glass/renderer/browser.js` (3657 lines) — // §fix 2026-06-29, take 2 — the Proxy-wrapping approach below broke // everything: contextBridge.exposeInMainWorld freezes/locks property  
  hears cg:navigate
- `clear-glass/renderer/copilot-cli.js` (294 lines) — renderer/copilot-cli.js — the Co-pilot pane's CLI, wearing the Clear Glass hat component_id: cg.renderer.copilot-cli
- `clear-glass/renderer/float-cli.js` (82 lines) — renderer/float-cli.js — the floating CLI's behaviour (BS6, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-FLOAT-CLI. copilot-cli.js (the pane's CLI, wearing the Clear Glass hat) does…
- `clear-glass/renderer/gig-panel.js` (157 lines) — Fiverr in the browser itself (0.59.3). James, 2026-10-10: "fiverr tutorial for helping me speed up gigs as much as possible, i need serious help. i have no  
  requires 1 · required by 0
- `clear-glass/renderer/guardian-picker.js` (1590 lines) — // §0.59.2 — James: "the popup … cant close it." Every toggle of the picker runs this file again; destroy() closed the // popups but left their elements, so a second run added a SECOND #__g-popup…
- `clear-glass/renderer/mesh-picker.js` (148 lines) — // ── Injected styles — same real visual language as guardian-picker.js // (IBM Plex Mono / Rajdhani, #00ffa3 accent) per James: "do not change
- `clear-glass/renderer/page-map-panel.js` (91 lines) — PM8 0.60.175: the page map beside the page. Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM8_page_map_panel)
- `clear-glass/renderer/processes.js` (151 lines) — renderer/processes.js — the Processes window (SP6, 0.60.220). (page: processes.html, styles: processes.css) Spec: clear-glass/spec/site-profile.spec MOD-SP-PROCESSES-UI · Map:…
- `clear-glass/renderer/selector-check.js` (260 lines)  
  exports create
- `clear-glass/renderer/site-profile-groups.js` (138 lines) — renderer/site-profile-groups.js — one site's settings, grouped by feature, drawn from the key table (SP3, 0.60.217). (styles: site-profile-groups.css) Spec: clear-glass/spec/site-profile.spec…
- other: `clear-glass/renderer/browser.css`, `clear-glass/renderer/browser.html`, `clear-glass/renderer/cos-theme.css`, `clear-glass/renderer/float-cli.css`, `clear-glass/renderer/float-cli.html`, `clear-glass/renderer/library.html`, `clear-glass/renderer/processes.css`, `clear-glass/renderer/processes.html`, `clear-glass/renderer/settings.html`, `clear-glass/renderer/site-profile-groups.css`

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
- `clear-glass/renderer/library/sections/responses.js` (115 lines) — renderer/library/sections/responses.js — Library → Responses (styles: responses.css) v0.39.239 (as ui/library/areas/responses.js) → 0.39.241 on the Settings runtime.
- other: `clear-glass/renderer/library/sections/accounts.css`, `clear-glass/renderer/library/sections/autofill.css`, `clear-glass/renderer/library/sections/bookmarks.css`, `clear-glass/renderer/library/sections/downloads.css`, `clear-glass/renderer/library/sections/history.css`, `clear-glass/renderer/library/sections/macros.css`, `clear-glass/renderer/library/sections/passwords.css`, `clear-glass/renderer/library/sections/responses.css`

#### `clear-glass/renderer/selector-assign/`

1 code · 1 other file(s).

- `clear-glass/renderer/selector-assign/selector-assign.js` (188 lines) — v0.39.251 The element picker assigns selectors (handoff 2026-09-25, step 1). One area,
- other: `clear-glass/renderer/selector-assign/selector-assign.css`

#### `clear-glass/renderer/settings/`

2 code · 1 other file(s).

- `clear-glass/renderer/settings/boot.js` (4 lines) — // renderer/settings/boot.js — last script on the page: every section file has registered by now.
- `clear-glass/renderer/settings/core.js` (315 lines) — renderer/settings/core.js — Clear Glass Settings runtime §BUILT 2026-09-23 — James: "a beautiful, fully built, settings page with  
  requires 0 · required by 1
- other: `clear-glass/renderer/settings/settings.css`

#### `clear-glass/renderer/settings/sections/`

23 code · 23 other file(s).

- `clear-glass/renderer/settings/sections/accounts.js` (269 lines) — renderer/settings/sections/accounts.js — Save session (styles: accounts.css)  
  requires 3 · required by 0
- `clear-glass/renderer/settings/sections/autofill.js` (372 lines) — renderer/settings/sections/autofill.js — Autofill & answers (styles: autofill.css) v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file").…
- `clear-glass/renderer/settings/sections/automation.js` (648 lines) — renderer/settings/sections/automation.js — Automation (styles: automation.css) v0.39.227 — split out of sections/mesh.js. The engine is
- `clear-glass/renderer/settings/sections/chats.js` (66 lines) — renderer/settings/sections/chats.js — Chat capture (styles: chats.css) 0.60.55 PI5. James, 2026-10-15: "make sure you add extensive settings for all of this, expand the settings the best you can."
- `clear-glass/renderer/settings/sections/connections.js` (60 lines) — renderer/settings/sections/connections.js — Connections (styles: connections.css) v0.39.227 — split out of sections/system.js (James: "each UI area its own file, including its own CSS file").…
- `clear-glass/renderer/settings/sections/copilot.js` (129 lines) — renderer/settings/sections/copilot.js — Co-pilot (styles: copilot.css) v0.39.227 — split out of sections/system.js. Connections + co-pilot use
- `clear-glass/renderer/settings/sections/diagnostics.js` (38 lines) — renderer/settings/sections/diagnostics.js — Diagnostics (styles: diagnostics.css) v0.39.227 — split out of sections/system.js (James: "each UI area its own file, including its own CSS file").…
- `clear-glass/renderer/settings/sections/downloads.js` (53 lines) — renderer/settings/sections/downloads.js — Downloads (styles: downloads.css) §BUILT 2026-09-25 — James: "Yes build all the ui" (Firefox-reference gap
- `clear-glass/renderer/settings/sections/driver.js` (49 lines) — renderer/settings/sections/driver.js — ClearDriver (styles: driver.css) §0.60.218 SP4 — James, 2026-10-23: "Cleardriver, agentmesh and guardian setting." ClearDriver had no settings: its navigate…
- `clear-glass/renderer/settings/sections/eros.js` (188 lines) — renderer/settings/sections/eros.js — ErosmancerOS (styles: eros.css) v0.39.227 — split out of sections/macros.js (James: "each UI area its own file, including its own CSS file"). Notes below are…  
  requires 1 · required by 0
- `clear-glass/renderer/settings/sections/fingerprint.js` (41 lines) — renderer/settings/sections/fingerprint.js — Browser fingerprint (styles: fingerprint.css) v0.39.227 — split out of sections/providers.js (James: "each UI area its own file, including its own CSS…
- `clear-glass/renderer/settings/sections/general.js` (65 lines) — renderer/settings/sections/general.js — General (styles: general.css) v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file"). Notes below are…
- `clear-glass/renderer/settings/sections/guardian.js` (54 lines) — renderer/settings/sections/guardian.js — Guardian (styles: guardian.css) §0.60.218 SP4 — James, 2026-10-23: "Cleardriver, agentmesh and guardian setting." Guardian had no settings section in Clear…
- `clear-glass/renderer/settings/sections/import.js` (78 lines) — renderer/settings/sections/import.js — Import from Firefox (BS7, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-SURFACE. James, 2026-10-21: "can you build a import for firefox…
- `clear-glass/renderer/settings/sections/macros.js` (411 lines) — renderer/settings/sections/macros.js — Macros (styles: macros.css) §BUILT 2026-09-23 — list/run + the step builder; every step is a real
- `clear-glass/renderer/settings/sections/mesh.js` (145 lines) — renderer/settings/sections/mesh.js — Agent mesh (styles: mesh.css)
- `clear-glass/renderer/settings/sections/network.js` (250 lines) — renderer/settings/sections/network.js — Network (styles: network.css) 0.60.160 — James, 2026-10-18: "can you add snowflake to the ui. it doesn't show up as a plugin." The Tor-with-Snowflake
- `clear-glass/renderer/settings/sections/plugins.js` (102 lines)
- `clear-glass/renderer/settings/sections/privacy.js` (40 lines) — renderer/settings/sections/privacy.js — Privacy & data (styles: privacy.css) v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file"). Notes…
- `clear-glass/renderer/settings/sections/providers.js` (69 lines) — renderer/settings/sections/providers.js — Provider tabs (styles: providers.css)
- `clear-glass/renderer/settings/sections/shortcuts.js` (116 lines) — renderer/settings/sections/shortcuts.js — Keyboard shortcuts (styles: shortcuts.css) §0.39.265 — James: "add keyboard shortcuts including macro support."
- `clear-glass/renderer/settings/sections/sites.js` (178 lines) — renderer/settings/sections/sites.js — Site settings (styles: sites.css) §BUILT 2026-09-26 — James: "expand per site settings." Was one pane
- `clear-glass/renderer/settings/sections/suite.js` (121 lines) — renderer/settings/sections/suite.js — Ledger (Cortex event) (styles: suite.css)
- other: 23 files (.css)

#### `clear-glass/renderer/shell/`

9 code · 3 other file(s).

- `clear-glass/renderer/shell/agents.js` (88 lines) — renderer/shell/agents.js — Guardian's agents in one place (BS9, 0.60.180). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-AGENTS. James, 2026-10-21: "access to all guardian agent stuff." One…
- `clear-glass/renderer/shell/ctxmenu.js` (207 lines) — renderer/shell/ctxmenu.js — the right-click menu: which rows apply, and where it opens (BS15, 0.60.183). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-CTXMENU. comp_id: cg.renderer.shell.ctxmenu
- `clear-glass/renderer/shell/downloads.js` (76 lines) — renderer/shell/downloads.js — the ⬇ button and panel, like Firefox's (BS5, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-DOWNLOADS. comp_id: cg.renderer.shell.downloads
- `clear-glass/renderer/shell/extensions.js` (235 lines) — renderer/shell/extensions.js — plugins as little icons, like Firefox (BS4, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-EXTENSIONS. James, 2026-10-21: "addons or plugins built with…
- `clear-glass/renderer/shell/icons.js` (92 lines) — renderer/shell/icons.js — Clear Glass's own icon set (BS8, 0.60.180). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-DESIGN. James, 2026-10-21: "omg this looks bad. enterprise grade, production…
- `clear-glass/renderer/shell/menus.js` (208 lines) — renderer/shell/menus.js — the menu bar and the ☰ app menu, from one model (BS3, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-MENUS. James, 2026-10-21: "make it dynamic like…
- `clear-glass/renderer/shell/newtab.js` (90 lines) — renderer/shell/newtab.js — the start page (BS10, 0.60.180). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-NEWTAB. A new tab was a black about:blank. This draws a start page over the page area…
- `clear-glass/renderer/shell/passwords.js` (89 lines) — renderer/shell/passwords.js — the key in the address bar: save a login when a site asks, fill one when you return (PW4, 0.60.186). Spec: clear-glass/spec/passwords.spec MOD-PW-SHELL. comp_id:…
- `clear-glass/renderer/shell/shell.js` (89 lines) — renderer/shell/shell.js — the shell's own small parts (BS2/BS6, 0.60.179). Spec: clear-glass/spec/browser-shell.spec. CGShellUI one popover at a time under its button (aria-expanded kept), Esc /…
- other: `clear-glass/renderer/shell/copilot.css`, `clear-glass/renderer/shell/shell.css`, `clear-glass/renderer/shell/toolbar.css`

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

11 other file(s).

- other: `clear-glass/spec/adblock.spec`, `clear-glass/spec/browser-shell.spec`, `clear-glass/spec/clear-glass.node-taxonomy.md`, `clear-glass/spec/clear-glass.spec`, `clear-glass/spec/compartment-downloads.spec`, `clear-glass/spec/design-surface.spec`, `clear-glass/spec/guided-browser.spec`, `clear-glass/spec/passwords.spec`, `clear-glass/spec/semantic-tree.spec`, `clear-glass/spec/site-profile.spec`, `clear-glass/spec/snowflake.spec`

#### `clear-glass/src/`

1 code file(s).

- `clear-glass/src/event-taxonomy.js` (174 lines) — (userscript // errors). Every event below is copied from the actual real emit()  
  requires 0 · required by 1 · tested by `tests/modules/clear-glass-gig.test.js`

#### `clear-glass/src/accounts/`

3 code file(s).

- `clear-glass/src/accounts/for-site.js` (38 lines) — which of his accounts are signed in to a site (BS20, 0.60.185). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-BOOKMARK-ACCOUNTS. comp_id: cg.accounts.for-site  
  exports forSite, RANK · requires 1 · required by 1
- `clear-glass/src/accounts/idearium-login.js` (50 lines) — src/accounts/idearium-login.js — Clear Glass signs in to Idearium for you (IA4, docs/2026-10-10-idearium-access-phasemap.spec). James, 2026-10-10: "what about a app password style login in…  
  exports signIn, ORIGIN · requires 2 · required by 1
- `clear-glass/src/accounts/login-portal.js` (340 lines)  
  exports LoginPortal, LOGIN_URLS, partitionFor, legacyPartitionFor, fillScript, AUTH_COOKIE_RE · requires 3 · required by 2 · tested by `clear-glass/test/login-portal-elsewhere.test.js`, `clear-glass/test/signin-window-quiet.test.js`

#### `clear-glass/src/adblock/`

3 code file(s).

- `clear-glass/src/adblock/engine.js` (279 lines) — the content blocker's engine: filter lists parsed, requests matched, element hiding per page (AB1, 0.60.183). Spec: clear-glass/spec/adblock.spec MOD-ABK-ENGINE. comp_id: cg.adblock.engine  
  exports BARE_HOST, parseList, parseNetwork, parseCosmetic, Engine, siteOf +2 · requires 0 · required by 3
- `clear-glass/src/adblock/import.js` (65 lines) — his own lists: files, folders, host lists (AB5, 0.60.184). Spec: clear-glass/spec/adblock.spec MOD-ABK-IMPORT. comp_id: cg.adblock.import  
  exports detectFormat, sources, LISTLIKE, MAX_FILES, MAX_BYTES · requires 1 · required by 2
- `clear-glass/src/adblock/lists.js` (253 lines) — the blocker's lists, state and store, and the one service a process has (AB2, 0.60.183). Spec: clear-glass/spec/adblock.spec MOD-ABK-LISTS. comp_id: cg.adblock.lists  
  exports CATALOGUE, BUILTIN, createService, service, DUE_MS · requires 2 · required by 3

#### `clear-glass/src/api/`

1 code file(s).

- `clear-glass/src/api/settings.js` (141 lines) — src/api/settings.js — NEXUS Connection Settings Stores NEXUS service ports and co-pilot routing config.  
  requires 1 · required by 2

#### `clear-glass/src/autofill/`

5 code file(s).

- `clear-glass/src/autofill/gig.js` (356 lines)  
  exports GIG_FORMAT, gigFile, gigTemplate, END_STATE_QUESTIONS, briefToSpec, LIMITS +9 · requires 0 · required by 1 · tested by `clear-glass/test/gig-file.test.js`, `tests/modules/clear-glass-gig.test.js` +1
- `clear-glass/src/autofill/learn-pick.js` (243 lines)  
  exports MODULE_ID, VERSION, FIELD_TYPE_SET, SELECTOR_PREFIX, isFillable, needsPick +11
- `clear-glass/src/autofill/matcher.js` (290 lines) — real form-field matching §BUILT 2026-09-19 — pure functions, no DOM/network access, so this  
  exports matchFields, fieldKeysOf, valueFor, learnKey, learnedFromSettings, LEARNED_PREFIX +5 · requires 2 · required by 4 · tested by `tests/modules/clear-glass-autofill.test.js`
- `clear-glass/src/autofill/proposal.js` (96 lines) — cover letters and freelance proposals from an autofill profile.  
  exports fillTemplate, profileVars, buildProposalPrompt, PLATFORM_GUIDE · requires 0 · required by 3
- `clear-glass/src/autofill/store.js` (234 lines) — Autofill Profile Store §BUILT 2026-09-19 — James: "autofill." Deliberately NOT named  
  exports AutofillStore, FIELD_TYPES, DOCUMENT_FIELDS, EXTRA_FIELDS · requires 0 · required by 3 · tested by `tests/modules/clear-glass-autofill.test.js`, `tests/modules/clear-glass-screen-qa.test.js`

#### `clear-glass/src/automation/`

8 code file(s).

- `clear-glass/src/automation/cron.js` (102 lines) — standard 5-field cron, local time. component_id: cg.automation.cron  
  exports parse, next, describe · requires 0 · required by 3
- `clear-glass/src/automation/dom.js` (294 lines) — the in-page half of the automation DOM tools. component_id: cg.automation.dom  
  exports extract, table, links, page, act, check +4 · requires 0 · required by 1 · tested by `tests/modules/test-chatgpt-scrape-template.test.js`
- `clear-glass/src/automation/from-macro.js` (58 lines) — a saved macro, as workflow steps. component_id: cg.automation.from-macro  
  exports macroToSteps, macroToWorkflow · requires 0 · required by 1
- `clear-glass/src/automation/nodes.js` (286 lines)  
  exports workflowNode, macroNode, parse, importNode, importMacro, saveNode +4 · requires 1 · required by 2
- `clear-glass/src/automation/routes.js` (158 lines) — every /automation/* route of Clear Glass's wire server. component_id: cg.automation.routes  
  exports handle, listView, LOCAL_ORIGIN · requires 6 · required by 1
- `clear-glass/src/automation/steps.js` (317 lines) — what every workflow step is, for the UI and for validation. component_id: cg.automation.steps  
  exports CATALOGUE, TRIGGER, COMMON, OPS, UNARY_OPS, BROWSER_ACTIONS +5 · requires 1 · required by 2
- `clear-glass/src/automation/template.js` (182 lines)  
  exports render, evaluate, lookup, placeholders, formatDate, FILTERS · requires 0 · required by 1
- `clear-glass/src/automation/templates.js` (221 lines) — ready-made workflows for "New workflow". component_id: cg.automation.templates  
  exports TEMPLATES · requires 0 · required by 1 · tested by `tests/modules/test-chatgpt-scrape-template.test.js`, `tests/modules/test-release-deliver.test.js`

#### `clear-glass/src/bookmarks/`

2 code file(s).

- `clear-glass/src/bookmarks/browser.js` (2273 lines) — // §fix 2026-06-29, take 2 — the Proxy-wrapping approach below broke // everything: contextBridge.exposeInMainWorld freezes/locks property  
  hears cg:navigate
- `clear-glass/src/bookmarks/store.js` (169 lines) — src/bookmarks/store.js — Clear Glass Bookmark Store Per-agent bookmarks. Named, tagged, bus-controllable.  
  requires 1 · required by 1 · tested by `clear-glass/test/phase2.test.js`

#### `clear-glass/src/chats/`

3 code file(s).

- `clear-glass/src/chats/crawler.js` (93 lines) — drives lib/chat-crawl-plan.js: reads the chat list, visits one chat at a time, reports, saves (PI5, 0.60.84) Map: docs/2026-10-15-personal-chat-import-phasemap.spec (PI5_the_crawler)  
  exports Crawler · requires 2 · required by 1 · tested by `tests/modules/test-chat-crawler.test.js`
- `clear-glass/src/chats/ports.js` (127 lines) — the three ports the chat crawler needs, made of Clear Glass automations (PI5b, 0.60.85) Map: docs/2026-10-15-personal-chat-import-phasemap.spec (PI5_the_crawler, addendum e: "the crawler's page…  
  exports PROVIDERS, classifyPage, listSteps, readSteps, ensureWorkflows, fileStore +2 · requires 1 · required by 1
- `clear-glass/src/chats/service.js` (43 lines) — starts, stops and reports the chat crawler per account (PI5b, 0.60.85) James, 2026-10-16: "build it." One crawler per account key ("chatgpt:a1"), run in the background, off until the account's…  
  exports ChatCrawlService · requires 3 · required by 0

#### `clear-glass/src/contexts/`

3 code file(s).

- `clear-glass/src/contexts/google-signin.js` (129 lines)  
  exports isSignin, firefoxUA, rewriteHeaders, applySession, attach, inSignin +4 · requires 3 · required by 2 · tested by `clear-glass/test/google-signin.test.js`
- `clear-glass/src/contexts/manager.js` (255 lines) — Context Manager One Chromium session partition per agent.  
  requires 4 · required by 2 · emits context.created, context.destroyed, context.fp.switched, context.network.error +3
- `clear-glass/src/contexts/session-headers.js` (87 lines) — src/contexts/session-headers.js — Shared CSP / X-Frame-Options / PNA bypass Originally this lived inline in main/index.js's bootstrap, applied ONLY to  
  exports applyCspBypass, needsRewrite, requestHook · requires 1 · required by 3 · tested by `clear-glass/test/google-signin.test.js`

#### `clear-glass/src/cookies/`

2 code file(s).

- `clear-glass/src/cookies/session-hub.js` (221 lines)  
  exports MODULE_ID, VERSION, SessionHub, canonicalPartition, legacyMeshPartition, isAuthCookie +2 · requires 1 · required by 2 · tested by `clear-glass/test/session-hub.test.js`, `clear-glass/test/signin-window-quiet.test.js`
- `clear-glass/src/cookies/vault.js` (337 lines) — Cookie Vault Encrypted per-agent cookie storage with versioned snapshots.  
  requires 1 · required by 4

#### `clear-glass/src/copilot/`

7 code file(s).

- `clear-glass/src/copilot/bridge.js` (1029 lines)  
  requires 14 · required by 2 · emits copilot.response, copilot.stream.connected, copilot.thinking, copilot.tool.error +2 · tested by `tests/copilot-bridge-direct-dispatch.test.js`, `tests/modules/clear-glass-agent-surface.test.js`
- `clear-glass/src/copilot/chat-store.js` (98 lines) — the co-pilot pane's conversation, kept. §0.39.278 — James: "copilot and clearglass, isnt really working. its dumb, isnt persistent, and needs to work in the  
  exports TABLE, CONV, MAX_TURNS, current, startNew, append +2 · requires 1 · required by 2
- `clear-glass/src/copilot/context-need.js` (43 lines) — what a message needs from the page, decided before any model is asked (BS12, 0.60.182). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-AUTO-CONTEXT. comp_id: cg.copilot.context-need  
  exports need, cookieSummary, PAGE, POINT, SIGNIN · requires 0 · required by 2
- `clear-glass/src/copilot/hat.js` (89 lines) — src/copilot/hat.js — the Clear Glass hat component_id: cg.copilot.hat  
  exports status, ensure, update, personaFor, SEED_KEY, DEFAULT_PERSONA · requires 0 · required by 2 · tested by `clear-glass/test/copilot-cli.test.js`
- `clear-glass/src/copilot/tools.js` (210 lines) — src/copilot/tools.js — Co-pilot Tool Registry Every Clear Glass capability the co-pilot can invoke, declared as tools.  
  exports TOOLS, BY_NAME, buildToolsPrompt, buildCompactToolsPrompt · requires 0 · required by 2
- `clear-glass/src/copilot/verbs.js` (108 lines)  
  exports parseBlock, normalize, parseCommands, browseIntent, archiveImportIntent, screenIntent +3 · requires 0 · required by 1
- `clear-glass/src/copilot/wake-relay.js` (207 lines) — src/copilot/wake-relay.js — closes the real loop James described: "hey nexus" said in any agent tab -> guardian/cortex detects it  
  exports startWakeRelay

#### `clear-glass/src/core/`

2 code file(s).

- `clear-glass/src/core/bus.js` (50 lines) — src/core/bus.js — Clear Glass Central SISO Bus The single Stream that owns all Clear Glass events.  
  exports createBus, getBus, getLog, emit, on, off +4 · requires 1 · required by 12 · tested by `clear-glass/test/bus.test.js`, `clear-glass/test/content-filter-exempt.test.js` +2
- `clear-glass/src/core/zoom.js` (53 lines) — page zoom, one implementation in Clear Glass's core (BS14, 0.60.183). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-ZOOM-CORE. comp_id: cg.core.zoom  
  exports STEPS, MIN, MAX, clamp, step, createZoom +1 · requires 0 · required by 3

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
- `clear-glass/src/downloads/artifact-chat-index.js` (563 lines)  
  exports MODULE_ID, COMPARTMENT_NAME, ensureCompartment, recordResponse, queryItems, rebuildIndexFromResponses +12 · requires 7 · required by 10 · tested by `tests/modules/test-agent-memory.test.js`, `tests/modules/test-code-artifact.js` +1
- `clear-glass/src/downloads/chat-ledger.js` (224 lines)  
  exports MODULE_ID, VERSION, chatKeyOf, applyDelta, appendTurn, readChat +3 · requires 1 · required by 3
- `clear-glass/src/downloads/intake-bridge.js` (106 lines)  
  exports install, VERSION, MODULE_ID · requires 1 · required by 1 · tested by `clear-glass/test/downloads-intake-bridge.test.js`
- `clear-glass/src/downloads/store.js` (125 lines) — src/downloads/store.js — Real Local Downloads Store Real gap named directly in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's  
  exports DownloadsStore · requires 1 · required by 1 · tested by `tests/modules/test-one-tab-e2e.test.js`, `tests/modules/test-response-downloads.test.js`

#### `clear-glass/src/driver/`

5 code file(s).

- `clear-glass/src/driver/cg-stub.js` (32 lines) — a stand-in window.ClearGlass for driving Clear Glass's own pages in its engine (glass.js) without the Electron main process (BS 0.60.179 tests). Built from the preload's real namespace list, so a…  
  exports initScript, names
- `clear-glass/src/driver/glass.js` (468 lines)  
  exports chromium, launch, engine, Browser, Page, PAGE_LIB · tested by `tests/modules/test-agent-live.test.js`, `tests/modules/test-canvas-compartments.test.js` +23
- `clear-glass/src/driver/index.js` (972 lines) — ClearDriver — NEXUS sovereign browser automation No Playwright. No Puppeteer. Own the primitives.  
  requires 8 · required by 3 · emits driver.error, driver.network.blocked, driver.network.intercepted, driver.recording +8
- `clear-glass/src/driver/page-resolver.js` (41 lines) — the ONE place that turns an agentId into the webContents of the page the agent lives in. 2026-09-19.  
  exports createPageResolver, mkErr · requires 0 · required by 3 · tested by `tests/modules/test-mesh-dom-transport.js`
- `clear-glass/src/driver/url-listener.js` (179 lines) — URL Listener Add a listener for any URL pattern — fires a NEXUS hook on match.  
  requires 0 · required by 2 · emits url.listener.added, url.listener.removed, url.match, url.request.headers +1

#### `clear-glass/src/driver/glass-host/`

1 code · 1 other file(s).

- `clear-glass/src/driver/glass-host/main.js` (87 lines) — Clear Glass's engine, run as a page host for glass.js. §0.39.263 — James: "playright? no what is that for? litterally have clearglas".
- other: `clear-glass/src/driver/glass-host/package.json`

#### `clear-glass/src/eros/`

1 code file(s).

- `clear-glass/src/eros/supervisor.js` (175 lines) — ErosmancerOS runs with Clear Glass. §0.39.264 — James: "hook it in to run with clearglass" / "just need  
  exports ErosSupervisor, SERVER_TS, NEXUS_ROOT, _tsxCli, _health, _postJson · requires 1 · required by 1

#### `clear-glass/src/fingerprint/`

2 code file(s).

- `clear-glass/src/fingerprint/engine.js` (315 lines) — Fingerprint Engine Builds and manages per-agent Firefox fingerprint profiles.  
  exports ffPool, FF_UA_POOL_2023 · requires 2 · required by 2 · tested by `clear-glass/test/bus.test.js`, `clear-glass/test/google-signin.test.js`
- `clear-glass/src/fingerprint/firefox-version.js` (38 lines) — src/fingerprint/firefox-version.js — the Firefox version Clear Glass claims, computed from Mozilla's release calendar, so it never goes stale. UUID:…  
  exports versionNow, ua, isFirefox, versionOf, stale, ANCHOR · requires 0 · required by 2 · tested by `clear-glass/test/google-signin.test.js`

#### `clear-glass/src/gates/`

1 code file(s).

- `clear-glass/src/gates/index.js` (873 lines) — src/gates/index.js — Clear Glass Gate Registry Every system behavior is a Gate registered on the central bus.  
  exports registerAll, gate, domQueryGate, domMutateGate, domPickGate, contextCreateGate +24 · requires 2 · required by 3 · emits account.created, account.deleted, account.error, account.get.result +105 · tested by `clear-glass/test/bus.test.js`, `clear-glass/test/phase2.test.js`

#### `clear-glass/src/history/`

1 code file(s).

- `clear-glass/src/history/store.js` (104 lines) — Real Browsing History Store §GAP CLOSED 2026-08-30 — James: "build them all." Real, confirmed gap:  
  exports HistoryStore · requires 1 · required by 1 · tested by `clear-glass/test/storage-jaa.test.js`

#### `clear-glass/src/import/`

1 code file(s).

- `clear-glass/src/import/firefox.js` (161 lines) — bring a Firefox profile into Clear Glass, for real (BS1, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-FIREFOX. comp_id: cg.import.firefox  
  exports roots, parseIni, profiles, readCookies, toElectron, importCookies +6 · requires 0 · required by 1

#### `clear-glass/src/ipc/`

3 code file(s).

- `clear-glass/src/ipc/agent-routes.js` (152 lines)  
  exports MODULE_ID, VERSION, install, buildState · requires 1 · required by 2 · tested by `tests/modules/clear-glass-agent-surface.test.js`
- `clear-glass/src/ipc/bridge.js` (2563 lines) — src/ipc/bridge.js — SISO-native IPC Bridge NEXUS commands arrive as HTTP POST /cmd → become SISO Events → bus.emit()  
  requires 36 · required by 6 · emits driver.exec, guardian.listener.command-result, guardian.listener.copilot-answer, guardian.listener.copilot-panel +8 · hears dom:event, net.open, plugin:error · tested by `tests/modules/test-cg-gig-autofill.test.js`
- `clear-glass/src/ipc/handler-registry.js` (97 lines)  
  exports MODULE_ID, VERSION, DENIED, install, register, list +3 · requires 0 · required by 1

#### `clear-glass/src/jobs/`

1 code file(s).

- `clear-glass/src/jobs/intake.js` (179 lines)  
  exports createJobIntake, guardianJobFetcher · requires 1 · required by 2

#### `clear-glass/src/macros/`

3 code file(s).

- `clear-glass/src/macros/live-recording.js` (89 lines) — a recording that IS a .macro node file from the first second (MR1, 0.60.57) James, 2026-10-15: "this is wrong... needs to start recording a macro node file."  
  exports LiveRecorder · requires 3 · required by 1
- `clear-glass/src/macros/recorder-script.js` (58 lines) — the page-side recorder, as a script string (MR1, 0.60.57) James, 2026-10-15: "this is wrong... needs to start recording a macro node file." The old recorder kept its events in window.__cgRecording  
  exports INSTALL, DRAIN · requires 0 · required by 1
- `clear-glass/src/macros/recording.js` (138 lines) — src/macros/recording.js — recorded page events → macro steps (pure) component_id: cg.macros.recording  
  exports recordingToSteps, describeStep, SENSITIVE · requires 0 · required by 1

#### `clear-glass/src/main/`

6 code file(s).

- `clear-glass/src/main/compartment-window.js` (98 lines) — idearium's pop-out pages as COS-compartment windows. §0.39.280. James: "can you have the electron popup windows for the desktop envirement and settings, be in a borderless  
  exports isCompartmentPage, parseFeatures, windowOptions, attach, registerIpc, PAGES +1 · requires 1 · required by 1 · tested by `clear-glass/test/window-frame.test.js`
- `clear-glass/src/main/float-cli.js` (83 lines) — the floating CLI's own window (BS6, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-FLOAT-CLI. James, 2026-10-21: "make a beautiful cli like the floating menu button 3-way cli.…  
  exports attach, register, FAB, PANEL, _byParent · requires 0 · required by 1
- `clear-glass/src/main/index.js` (2947 lines) — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):  
  exports openAgentWindow, openOrFocus, closeAgentWindow, minimizeAgentWindow, hideAgentWindow, maximizeAgentWindow +13 · requires 67 · required by 4 · emits bgtab.closed, bgtab.opened, download.done, library.opened +4
- `clear-glass/src/main/index.pre-userscripts.js` (637 lines) — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):  
  exports openAgentWindow, closeAgentWindow, minimizeAgentWindow, hideAgentWindow, windows · requires 19 · required by 0 · emits context.fp.switch, diag.nexus, lifecycle.ready, lifecycle.shutdown +2
- `clear-glass/src/main/passwords-wiring.js` (58 lines) — pages ↔ the password service ↔ the window (PW3, 0.60.186). Spec: clear-glass/spec/passwords.spec MOD-PW-MAIN. comp_id: cg.main.passwords-wiring  
  exports attach · requires 0 · required by 1
- `clear-glass/src/main/window-frame.js` (41 lines) — one dark frame for every Clear Glass window that is not the main browser (CS1, 0.60.54) Map: docs/2026-10-15-clear-glass-surfaces-phasemap.spec (CS1_one_popup_frame)  
  exports BG, popupOptions, withDark, darkenWindow, setAppTheme · requires 0 · required by 1 · tested by `clear-glass/test/window-frame.test.js`

#### `clear-glass/src/mesh/`

4 code file(s).

- `clear-glass/src/mesh/agent-mesh.js` (1194 lines) — Agent Mesh Free AI agent channels baked into Clear Glass.  
  exports drainSettings · requires 5 · required by 2 · emits mesh.agent.spawned, mesh.constraints.unavailable, mesh.guardian.dispatch, mesh.job.progress +19 · tested by `tests/modules/agent-mesh-drainer.test.js`, `tests/modules/agent-mesh-hostile.test.js` +1
- `clear-glass/src/mesh/automation-engine.js` (1221 lines)  
  exports AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR, NODES_DIR, TICK_MS +5 · requires 6 · required by 2 · tested by `tests/modules/automation-engine.test.js`
- `clear-glass/src/mesh/dom-transport.js` (168 lines) — host side of the mesh's DOM transport (2026-09-19). Drives page/agent-page.js inside an agent's chat page and exposes JOBS, not blocking calls:  
  exports createDomTransport, PAGE_SRC · requires 0 · required by 1 · tested by `tests/modules/test-mesh-chat-reload.test.js`, `tests/modules/test-mesh-dom-transport.js`
- `clear-glass/src/mesh/route-graph.js` (120 lines) — real, persisted node-to-node routing edges for BrainOS's canvas (docs/2026-09-11-brainos-agent-  
  exports RouteGraph, ROUTES_DIR · tested by `tests/modules/route-graph.test.js`

#### `clear-glass/src/mesh/page/`

1 code file(s).

- `clear-glass/src/mesh/page/agent-page.js` (347 lines)

#### `clear-glass/src/net/`

12 code file(s).

- `clear-glass/src/net/bridge-sources.js` (104 lines) — where a real Snowflake bridge line comes from (SF2, 0.60.178). Spec: clear-glass/spec/snowflake.spec MOD-SF-BRIDGE-SOURCES. comp_id: cg.net.bridge-sources  
  exports local, builtin, torBrowserDirs, linesFromTorrc, MOAT_BUILTIN, SYSTEM_EXAMPLES · requires 1 · required by 1
- `clear-glass/src/net/compartment.js` (60 lines) — a window opened through a route is one compartment, page and all (SF3, 0.60.178). Spec: clear-glass/spec/snowflake.spec MOD-SF-COMPARTMENT. comp_id: cg.net.compartment  
  exports PREFIX, partitionFor, isPartition, isCompartment, cleanUserAgent, harden +2 · requires 0 · required by 2
- `clear-glass/src/net/host-import.js` (72 lines) — host lists through Snowflake: a list (or a folder of them) becomes the sites that always take the transport (SF8, 0.60.184). Spec: clear-glass/spec/snowflake.spec MOD-SF-HOST-IMPORT. comp_id:…  
  exports hostsOf, importHosts, importPaths, lists, removeList, MAX_HOSTS +1 · requires 2 · required by 2
- `clear-glass/src/net/https-only.js` (42 lines) — HTTPS-only for windows opened through a route (SF4, 0.60.178). Spec: clear-glass/spec/snowflake.spec MOD-SF-HTTPS-ONLY. comp_id: cg.net.https-only  
  exports decide, toCallback, attach · requires 0 · required by 1
- `clear-glass/src/net/installer.js` (300 lines)  
  exports TorInstaller, platformToken, untar, inside, findFile, bridgeLines +3 · requires 1 · required by 2
- `clear-glass/src/net/kill-switch.js` (64 lines) — kill on disconnect for routed windows (CD4, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec MOD-CDL-KILL. comp_id: cg.net.kill-switch  
  exports KillSwitch, RUNGS · requires 0 · required by 2
- `clear-glass/src/net/magnet.js` (39 lines) — a magnet link, parsed (CD1, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec MOD-CDL-MAGNET. James, 2026-10-21: "add magnet link handling." Pure: no lookup and no network. A routed…  
  exports parse, isMagnet, base32ToHex · requires 0 · required by 1
- `clear-glass/src/net/policy.js` (188 lines) — which way does a request go? (NP2, 0.60.60). Pure: no Electron, no network. James, 2026-10-15: "protocol specific proxy settings, with settings for global connection settings, per site settings…  
  exports signinRoute, WEB, BLACKHOLE, FAILURES, specificity, overlaps +10 · requires 0 · required by 1 · tested by `clear-glass/test/google-signin.test.js`
- `clear-glass/src/net/qbittorrent.js` (82 lines) — the one torrent hand-off, verified first (CD3, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec MOD-CDL-QBIT. comp_id: cg.net.qbittorrent  
  exports verify, QBit, TOR_DEFAULT · requires 0 · required by 1
- `clear-glass/src/net/quarantine.js` (135 lines) — the compartment's download manager (CD2, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec MOD-CDL-QUARANTINE. comp_id: cg.net.quarantine  
  exports Quarantine, clean · requires 1 · required by 1
- `clear-glass/src/net/service.js` (220 lines) — the one door for routes and the transport (NP1+NP2+NP3 slice, 0.60.60). CLI first (James's order): src/ipc/bridge.js exposes this as /cli/net/*, idearium/cli/route-commands.js as 'net',…  
  exports NetService, service, EMPTY · requires 5 · required by 5
- `clear-glass/src/net/transport-host.js` (134 lines) — tor with Snowflake as its bridge, run as an isolated child (NP1, 0.60.60). Everything impure is injected. What this is NOT: it adds no cryptography. The path is already encrypted at every hop that mat  
  exports TransportHost, torrc, STATES · requires 0 · required by 1

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

- `clear-glass/src/options/store.js` (1001 lines) — src/options/store.js — Nexus Options Store Persistent, bus-controllable settings for Clear Glass's own behavior —  
  requires 0 · required by 5 · tested by `tests/modules/clear-glass-accounts.test.js`, `tests/modules/nexus-options-autoboot.test.js`

#### `clear-glass/src/page/`

9 code file(s).

- `clear-glass/src/page/attention.js` (78 lines) — where each window's attention is (FN2, docs/2026-10-10-shape-of-nexus-phasemap.spec). James, 2026-10-10: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?"  
  exports MODULE_ID, VERSION, createAttention, shared · requires 0 · required by 2
- `clear-glass/src/page/blocks.js` (80 lines)  
  exports MODULE_ID, VERSION, DEFAULTS, pageScript, normalize, siteKey +1 · requires 1 · required by 1
- `clear-glass/src/page/field.js` (216 lines)  
  exports MODULE_ID, VERSION, DEFAULTS, fieldScript, fieldOffScript, atScript +8 · requires 0 · required by 2
- `clear-glass/src/page/nexus-chat.js` (165 lines)  
  exports MODULE_ID, VERSION, RAN, DIAG_JS, attach, watched +4 · requires 2 · required by 1
- `clear-glass/src/page/page-map.js` (144 lines)  
  exports MODULE_ID, VERSION, terms, chunk, index, search +4 · requires 0 · required by 1
- `clear-glass/src/page/page-memory.js` (80 lines) — PM3/PM4: what Clear Glass remembers about a kind of page, so the map learns over time. Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM3_synthesized_map_that_learns,…  
  exports MODULE_ID, VERSION, DEFAULT_DIR, createMemory, shared, intentKey · requires 0 · required by 1
- `clear-glass/src/page/page-session.js` (123 lines)  
  exports MODULE_ID, VERSION, createPageSession, words · requires 2 · required by 1
- `clear-glass/src/page/reader.js` (156 lines) — one call that tells an agent what is on the page. James, 2026-09-27: "i want copilot completely aware of clearglass, hooked in completely."  
  exports MODULE_ID, VERSION, DEFAULTS, pageScript, normalize, _inPage · requires 0 · required by 1 · tested by `tests/modules/clear-glass-agent-surface.test.js`, `tests/modules/test-opportunity.test.js`
- `clear-glass/src/page/semantic-tree.js` (322 lines)  
  exports MODULE_ID, VERSION, DEFAULTS, KEEP, FIELD_ROLES, addressOf +12 · requires 1 · required by 4 · tested by `clear-glass/test/google-signin.test.js`

#### `clear-glass/src/passwords/`

2 code file(s).

- `clear-glass/src/passwords/service.js` (114 lines) — the one door between pages, the window and the password vault (PW1, 0.60.186). Spec: clear-glass/spec/passwords.spec MOD-PW-SERVICE. comp_id: cg.passwords.service  
  exports createPasswordService, service, originOf, TTL · requires 0 · required by 3
- `clear-glass/src/passwords/vault.js` (168 lines)  
  exports PasswordVault · requires 1 · required by 3 · tested by `clear-glass/test/storage-jaa.test.js`

#### `clear-glass/src/plugins/`

7 code file(s).

- `clear-glass/src/plugins/context-items.js` (22 lines) — src/plugins/context-items.js — the right-click menu entries plugins contribute (contribution type 'context-menu-item'). Same idea as src/toolbar/commands.js's registerPluginCommand: the plugin…  
  exports registerContextItem, unregisterContextItem, listContextItems, WHEN · requires 0 · required by 2
- `clear-glass/src/plugins/contribution-types.js` (100 lines)  
  exports CLEAR_GLASS_CONTRIBUTION_TYPE · requires 0 · required by 1
- `clear-glass/src/plugins/host.js` (413 lines)  
  exports PluginHost, PluginHostError, PLUGIN_STATE · requires 6 · required by 2 · emits plugin:error, plugins:killswitch.fullstop, userscript.create, userscript.toggle · hears userscript.created, userscript.error
- `clear-glass/src/plugins/permission-adapter.js` (89 lines) — src/plugins/permission-adapter.js — permission-filter ↔ Electron wiring §HONEST LIMIT — traced against Electron's real, documented  
  exports attachPermissionFilters · requires 1 · required by 1 · hears permission:decision
- `clear-glass/src/plugins/schema.js` (169 lines)  
  exports PluginSchemaError, validateManifest · requires 2 · required by 1
- `clear-glass/src/plugins/webextensions.js` (229 lines) — src/plugins/webextensions.js — Chrome WebExtensions in Clear Glass component_id: cg.plugins.webextensions  
  exports WebExtensionHost, crxToZip, readManifest, displayName, TABLE, CG_DIR · requires 2 · required by 1 · tested by `clear-glass/test/webextensions.test.js`
- `clear-glass/src/plugins/webrequest-adapter.js` (120 lines) — src/plugins/webrequest-adapter.js — content-filter ↔ Electron wiring §HONEST LIMIT — traced against real, existing source, not live-run.  
  exports attachContentFilters, _pageUrlOf · requires 3 · required by 1 · hears webrequest:decision · tested by `clear-glass/test/content-filter-exempt.test.js`

#### `clear-glass/src/preload/`

5 code file(s).

- `clear-glass/src/preload/compartment-window.js` (13 lines) — // clear-glass/src/preload/compartment-window.js — §0.39.280. The only thing idearium's compartment windows // (/desktop.html, /settings.html; main/compartment-window.js) get from Electron: their…  
  requires 0 · required by 2
- `clear-glass/src/preload/google-signin.js` (38 lines) — src/preload/google-signin.js — a session preload: on Google's sign-in pages, before Google's own scripts run, the page reads as the Firefox its user agent says it is. Registered on every session…  
  exports HOSTS, asFirefox · requires 0 · required by 1 · tested by `clear-glass/test/google-signin.test.js`
- `clear-glass/src/preload/index.js` (482 lines) — Preload — contextIsolation bridge Exposes a minimal, typed API to the renderer.  
  requires 0 · required by 1 · hears floatcli:nav, floatcli:state, options:changed, passwords:available +2
- `clear-glass/src/preload/passwords.js` (77 lines) — the page side of the password manager (PW2, 0.60.186). Spec: clear-glass/spec/passwords.spec MOD-PW-PAGE. comp_id: cg.preload.passwords
- `clear-glass/src/preload/webview-bridge.js` (58 lines) — src/preload/webview-bridge.js §BUILD 2026-07-09 — the injected PICKER_SCRIPT in renderer/browser.html

#### `clear-glass/src/processes/`

1 code file(s).

- `clear-glass/src/processes/index.js` (160 lines)  
  exports createProcesses, createActivity, activity, KINDS

#### `clear-glass/src/providers/`

8 code file(s).

- `clear-glass/src/providers/account-switch.js` (301 lines)  
  exports MODULE_ID, VERSION, createAccountSwitch · requires 2 · required by 0 · tested by `clear-glass/test/provider-account-sync.test.js`, `clear-glass/test/session-hub.test.js` +1
- `clear-glass/src/providers/attention.js` (445 lines)  
  exports MODULE_ID, VERSION, panelScript, pickerScript, guardianPickScript, describeScript +3 · requires 1 · required by 1
- `clear-glass/src/providers/download-capture.js` (190 lines) — a file downloaded from a provider tab is announced to Guardian, with the chat it came from attached.  
  exports attach, VERSION, MODULE_ID
- `clear-glass/src/providers/gm-shim.js` (134 lines)  
  exports buildGmShim · requires 0 · required by 1 · tested by `tests/modules/test-gm-shim-sse-streaming.js`
- `clear-glass/src/providers/host.js` (991 lines) — src/providers/host.js — NCP Provider Auto-Host v2 Spawns one hidden BrowserWindow per NCP provider on boot.  
  requires 4 · required by 1 · emits provider.host.all-booted, provider.host.closed_unexpectedly, provider.host.crashed, provider.host.injected +7
- `clear-glass/src/providers/profile-tabs.js` (86 lines)  
  exports MODULE_ID, VERSION, PROFILE_TAB, tabIdFor, partitionFor, createProfileTabs · requires 1 · required by 1
- `clear-glass/src/providers/registry.js` (174 lines) — src/providers/registry.js — NCP Provider Registry: a CACHE of Guardian's agent facts (GA1, map invariant E13). §GA1 2026-10-02 — "Guardian is the source of truth for the Clear Glass agents." This…  
  exports NCP_PROVIDERS, SEED, getProvider, listProviders, DEFAULT_AUTOSTART, autoBootList +4 · requires 1 · required by 5 · emits agent.cache.stale · tested by `clear-glass/test/phase2.test.js`, `tests/modules/nexus-options-autoboot.test.js`
- `clear-glass/src/providers/selector-assign.js` (89 lines) — v0.39.251 Main-process half of "the element picker assigns selectors" (handoff  
  exports MODULE_ID, VERSION, KEYS, providerForUrl, validate, assign · requires 1 · required by 1

#### `clear-glass/src/releases/`

2 code file(s).

- `clear-glass/src/releases/deliver.js` (77 lines) — Clear Glass brings a Nexus release to COS's inbox (COSA7, 0.60.93) Map: docs/2026-10-15-cos-app-phasemap.spec (COSA7_clear_glass_delivers)  
  exports check, deliver, cmpVer, MAX_BYTES · requires 0 · required by 2 · tested by `tests/modules/test-release-deliver.test.js`
- `clear-glass/src/releases/service.js` (29 lines) — what Clear Glass knows about COS, and the two calls the bridge and the command use (COSA7, 0.60.93) James, 2026-10-16: "auto updates from dropping in new zips, downloading it from clearglass."  
  exports cosView, status, fetchLatest · requires 2 · required by 0 · tested by `tests/modules/test-release-deliver.test.js`

#### `clear-glass/src/rewind/`

2 code file(s).

- `clear-glass/src/rewind/engine.js` (340 lines) — src/rewind/engine.js — Clear Glass Rewind Engine Rewind is the session time-machine. Every N seconds (or on significant  
  exports FORM_FIELDS_CAPTURE_JS, FORM_FIELDS_RESTORE_JS · requires 0 · required by 2 · emits rewind.restored, rewind.restoring, rewind.snapshot · tested by `clear-glass/test/phase2.test.js`
- `clear-glass/src/rewind/resume.js` (59 lines) — a site's "resume state": on a revisit, put back where he was (SP2, 0.60.216). Spec: clear-glass/spec/site-profile.spec MOD-SP-READERS · key resume.restore (off | scroll | scroll+forms)  
  exports resumeScript, MODES

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

- `clear-glass/src/shortcuts/registry.js` (177 lines) — src/shortcuts/registry.js — keyboard shortcuts: the actions, their default keys, and turning a key press into a binding.  
  exports ACTIONS, DEFAULT_BINDINGS, accelFromInput, normalize, isSafe, isValidAction +4 · requires 0 · required by 2

#### `clear-glass/src/site-settings/`

4 code file(s).

- `clear-glass/src/site-settings/keys.js` (71 lines) — the per-site keys every feature reads (SP1, 0.60.215). Spec: clear-glass/spec/site-profile.spec MOD-SP-KEYS · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP1  
  exports KEYS, FEATURES, byFeature, get, validate
- `clear-glass/src/site-settings/profile.js` (112 lines) — one site's settings for every feature, through one resolver (SP1, 0.60.215). Spec: clear-glass/spec/site-profile.spec MOD-SP-RESOLVER · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP1  
  exports createSiteProfile, originOf, ruleId, ROUTES, PERSON_ONLY
- `clear-glass/src/site-settings/readers.js` (57 lines) — each feature reads its site value at its decision point (SP2, 0.60.216). Spec: clear-glass/spec/site-profile.spec MOD-SP-READERS · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP2  
  exports install, installed, autofillFor, macrosOnLoad, workflowsAllowed, passwordPolicy +4
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

2 code file(s).

- `clear-glass/src/tls/helper.js` (138 lines) — src/tls/helper.js — runs cg-tls-helper (clear-glass/tls-helper/), Clear Glass's TLS layer, and says what state it is in. Map: docs/2026-10-16-tls-layer-phasemap.spec (TLS2)  
  exports TlsHelper, binaryPath, issuedByUs, verifyProc, defaultDir, setCurrent +2 · requires 0 · required by 2
- `clear-glass/src/tls/proxy.js` (218 lines) — TLS Proxy — Firefox JA4 Fingerprint Layer Sits between Clear Glass and the internet.  
  requires 0 · required by 2 · emits tls.error, tls.tunnel

#### `clear-glass/src/toolbar/`

1 code file(s).

- `clear-glass/src/toolbar/commands.js` (149 lines)  
  exports TOOLBAR_COMMANDS, defaultPinnedIds, registerPluginCommand, unregisterPluginCommand · requires 0 · required by 2

#### `clear-glass/src/userscripts/`

1 code file(s).

- `clear-glass/src/userscripts/manager.js` (307 lines) — src/userscripts/manager.js — Clear Glass Userscript Manager Manages userscripts per agent. Scripts can be:

#### `clear-glass/test/`

24 test file(s).


#### `clear-glass/tls-helper/`

1 code · 4 other file(s).

- `clear-glass/tls-helper/build.js` (32 lines) — builds cg-tls-helper for each platform into bin/<os>-<arch>/, with SHA256SUMS. Map: docs/2026-10-16-tls-layer-phasemap.spec (TLS1). Needs Go (1.24+).
- other: `clear-glass/tls-helper/go.mod`, `clear-glass/tls-helper/go.sum`, `clear-glass/tls-helper/main.go`, `clear-glass/tls-helper/main_test.go`

#### `clear-glass/tls-helper/bin/`

1 other file(s).

- other: `clear-glass/tls-helper/bin/SHA256SUMS`

#### `clear-glass/tls-helper/bin/linux-amd64/`

1 other file(s).

- other: `clear-glass/tls-helper/bin/linux-amd64/cg-tls-helper`

#### `clear-glass/tls-helper/bin/windows-amd64/`

1 other file(s).

- other: `clear-glass/tls-helper/bin/windows-amd64/cg-tls-helper.exe`

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
