# NEXUS 0.39.279: agents in Clear Glass, Gemini and DeepSeek whole, "hey nexus" from any chat, branches and desktops, a settings console, staging S0 + S1

**Date:** 2026-09-29 · base: 0.39.278 · MINOR: new routes (below)

James: *"can you fix gemini and deepseek. i want the agents to be able to use clearglass. i also want to be able to have
copilot interact on clearglass using a virtual input through erosmanceros, nexus nerve, spotlight injected css into web
pages, and a interaction field for xyz coords to help the agents see and navigate the ui in clearglass. I really need to
get a job, and i want to be able to automate as much as possible."* · *"i want to have agents be able to retrieve the
context with agent tools, not injected each time. have only necessities injected, and everything else available with
the tool layers. i want the agents to be able to use hey nexus, its detected but the response from nexus isnt injected
as a job."* · *"I was thinking we could have cos create the vm envirement, and each new repo, if applicable could create
a branch of the original, to save resources, can you also make it so once its generated, you can open it like a desktop
envirement?"* · *"can you have a full enterprise grade settings menu that encompassed all the idearium compartment and
agent settings. and if you have more, can you work on the self heal contract"*

## Gemini and DeepSeek read the whole conversation

- guardian/userscript-gemini.js: user-query / model-response turns (AI Studio: ms-chat-turn) in page order, thinking
  (model-thoughts, opened by the chat-stream prelude's "Show thinking") apart from the reply.
- guardian/userscript-deepseek.js: every .ds-message; a reply carries .ds-markdown outside the thinking
  (.ds-think-content). Chat id = the session id of /a/chat/s/<id>.
- A page without turns falls back to the newest reply, marked partial, as before. Perplexity is unchanged.
- Proof: tests/probe/gemini-deepseek-reader-chromium.js 11/11 on pages built to those shapes. **Not checked against
  the live gemini.google.com / chat.deepseek.com DOM from here.**

## "hey nexus" is answered from any chat, as a job

- guardian/lib/wake-loop.js handleTranscript: the settled transcript's newest turn, when it is the agent's and starts a
  line with a wake, is answered as a wake-reply job typed into THAT chat (createJob chatUrl; the dispatcher resumes
  it). Once per turn; never while generating; depth = the run of [NEXUS] answers just sent. The job path and the
  transcript path defer to each other once, so a wake both see is answered once. guardian/server.js listens to
  guardian.ncp.transcript.
- Repo agents now know they can ask: a one-line 'wake' prompt block (browser agents).
- Proof: tests/modules/test-guardian-wake.js 21/21 (WK-040…WK-044 new).

## Context by tools; only necessities injected

- lib/repo-prompt-blocks.js 1.2.0: memory, context-atlas and context-directory are OFF by default; a 'context-tools'
  block names nexus.context.tool, and 'wake' is added. Reset now restores each block's default on/off (it used to
  switch every block on). Memory is recalled only when its block is on (dispatch and preview).
- The harness first message stays under 3,000 characters (RH-006) with both new lines: the layer tools are named once.
- Fixed: 0.39.278 listed the chat-stream prelude as an agent provider ("chat-stream"); lib/agent-providers.js excludes it.
- Proof: test-composed-prompt 20/20 (CP-101 was already failing on 0.39.277 — it predated voice and context-map-off),
  test-agent-memory 9/9, test-registry-harness 7/7, test-repo-agent-provider 60/60 (was failing on 0.39.277).

## Clear Glass: the interaction field, a virtual pointer, a spotlight

- clear-glass/src/page/field.js: field (every interactive element numbered, with box, centre x/y and z = layers
  covering it; optional drawn overlay + labelled grid, pointer-events:none), at(x,y), spotlight (injected CSS ring +
  label), describe() (a text map a small model reads), pointerPath().
- Driver actions field / fieldOff / at / spotlight / pointer {n | x,y | selector, do, text, via}: native =
  sendInputEvent along a curved path; eros = ErosmancerOS POST /api/input (new; the behaviour engine's curvedPath over
  CDP), wired through main/index.js's tab resolver. A covered target is reported, an off-screen one refused.
- clearglass.browser.tool field / pointer / spotlight (text map, not 150 objects); the pane's DRIVER_ACTIONS and
  compact list; field.map / field.spotlight forwarded to NEXUS.
- Proof: tests/modules/test-cg-field.test.js 13/13; tests/probe/field-chromium.js 12/12. ErosmancerOS: tsc clean
  apart from its existing TS6059; its /api/input was not run against a live browser here.

## COS workspaces: code repos as branches, a repo's VM as a desktop

- cos/workspace/index.js: branchWorkspace (the original made its own git repository, then a worktree on
  nexus/<name>; reused; uncommitted work snapshotted first), listBranches / removeBranch (the branch is kept),
  branchDisk (qcow2 overlay of the original's disk), startDesktop / desktopStatus / stopDesktop.
- cos/compartment/qemu-runtime.js: a headless VM's display is also a websocket on 5700+N; desktopPorts().
- cos/testenv/provision.js --with desktop: xfce + lightdm autologin (user nexus), graphical boot.
- idearium: the Code button's repo is a branch of the original (worktree + child compartment) unless body.branch is
  false or repos.code_repo_mode is 'copy'; the repo records branchOf/branch. /api/repos/:uuid/desktop (GET status,
  POST start, DELETE stop), /api/repos/:uuid/branches, idearium/ui/desktop.html (noVNC), an "open desktop" button.
- lib/cos-bridge.js: branchWorkspace, listBranches, desktop.
- Proof: tests/modules/test-cos-workspace.test.js 11/11 (real git; QEMU, the process and the guest agent faked).
  **No VM was booted here (no QEMU); the desktop viewer was not loaded against a real VNC websocket.**

## The settings console

- idearium/ui/settings.html: global config (every key with its source default/file/runtime, bounds, reset) and per
  repo Agent / Prompt (every block: on/off, text, reset, live preview) / Hat / Compartment & desktop. Edits wait in a
  save bar; each goes to the route that owns it. A branch shows its original's settings read-only.
- GET /api/settings/console[/:uuid], POST /api/config/reset; config keys repos.code_repo_mode, desktop.ram_mb,
  desktop.cpus, desktop.network. ⚙ settings in idearium's top bar and each repo's settings tab.
- idearium/api/index.js exports _route (one request through the real router, for tests).
- Proof: tests/modules/test-settings-console.test.js 5/5; tests/probe/settings-console-chromium.js 10/10.

## Staging self-heal: S0 and S1 closed

- S0 (versionium): createBranch records forkedFrom and starts the branch at the fork commit; commit({from});
  branches(), forkPoint(); GET/POST /api/versionium/branches. Closes spec gap V2.
- S1: lib/repo-inject.js status 'staged'; lib/code-edit.js 1.1.0 stage() (one versionium commit on
  repo-<uuid>@staging caused by the gap, the repo untouched, unrecorded = undone) and promote() (the one apply,
  all-or-nothing, conflicts never overwrite); code API stage:true, GET code/staged, POST code/promote.
- docs/2026-09-28-staging-self-heal-phasemap.spec: S0 and S1 CLOSED with findings, what landed and proof.
- Proof: tests/modules/test-staging-s0-s1.test.js 7/7; 12 existing versionium / code-edit / inject suites unchanged.

## Versions

system 0.39.279 · guardian 3.17.0 · idearium 4.10.0 · versionium 3.4.0 · clear-glass 3.20.0 · ErosmancerOS 0.2.0 ·
userscript-gemini / -deepseek 10.10.0 · repo-prompt-blocks 1.2.0 · code-edit 1.1.0.

## Not done

- Loom: the new files are wired by the source scanner through their require()s; the HTTP edges (Clear Glass → Eros
  /api/input, desktop.html → the VM websocket) are not hand-mapped yet.
- Staging S2 onward (the heal loop landing on staging, the verify gate, score, promote dial, rewind, feedback).
- Moving per-repo settings out of cortex's store into idearium's (the sovereignty map's plan) — the console reads and
  writes them where they are today.
