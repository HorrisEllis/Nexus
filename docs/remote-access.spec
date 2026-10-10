# Remote access — made in the spec workshop (idearium)
# Written 2026-10-10 from James's request and docs/2026-10-10-idearium-access-phasemap.spec IA6 IA7. To be opened in the
# workshop (nexus/core → docs) and built through Idearium. Decisions as choices [A] [B] [C] [custom], recommendation
# marked; "chosen:" open until he picks. Nothing here is built yet.
spec:
  name: Remote access
  ambition: 2 — creative
  source: "James 2026-10-10 · maps: idearium-access IA6 IA7 · idearium-solid SD15"
  owner: core (the remote doors, the CLI) · idearium (app passwords, its access gate) · copilot (agent chats) · clear-glass (stays local)
  status: specced 2026-10-10, not built
  james: >-
    "i want to be able to access nexus remotely, I thought of a discord bot, or ssh access to the cli or copolit, agent
    chats, something."
sections:
  - id: purpose
    title: Purpose
    body: |
      Reach Nexus from away from the machine — the CLI, copilot, the agent chats, Idearium's pages — without opening a
      door anyone else can walk through.

      Evidence: 0.58.0 gave Idearium app passwords (scoped per repo, capability, hat), and another device already has to
      sign in (origin mode). Every capability is a command (route-commands), so the CLI is a complete remote surface. What
      is missing: Nexus's own processes carry no key (IA6), Guardian/copilot/cortex/versionium still answer any website
      (SD15), and nothing is reachable off the machine by design (everything binds 127.0.0.1).

  - id: primitives
    title: Primitives
    body: |
      door        (boundary)  one way in: { kind: ssh | tunnel | chat-bot | web, reaches[], auth }
      key         (thing)     an Idearium app password (0.58.0) — the one credential every door uses, scoped
      session     (thing)     who came in through which door, when, and what they did (a ledger row per command)
      bot         (action)    a chat-platform client that turns messages into commands and replies into messages

  - id: axioms
    title: Axioms
    body: |
      AX1  Nothing binds beyond 127.0.0.1. A remote door reaches the machine through something that authenticates first.
      AX2  One credential system: app passwords, scoped. No second password store per door.
      AX3  Read-only or one-repo keys for anything that leaves the machine through a third party (a chat bot).
      AX4  Every remote command is a ledger row with the key that ran it (IA7's actor).
      AX5  SD15 first: no remote door until every local service refuses websites.

  - id: doors
    title: Doors
    body: |
      choices — the first remote door:
        [A] SSH over a private network (Tailscale or WireGuard) into the machine, then the `idearium` CLI and copilot's CLI  ← recommended (no new code, no new listener; every command already works)
        [B] a tunnel to Idearium's pages (Tailscale serve / Cloudflare Tunnel) with app-password sign-in — the full UI on a phone; one more exposed surface
        [C] a Discord bot — messages become commands, replies come back; convenient on a phone, but Discord holds the conversation and the bot holds a key
        [D] Telegram / Matrix bot — same shape as C, Matrix can be self-hosted
        [custom] ____
      chosen: open

      Whatever is chosen, the bot shape (C/D) is: one process, outbound only (no listener), a key scoped read + chosen
      repos, allowed commands from a list (no system restart, no access new/revoke — personOnly rows stay person-only),
      replies trimmed with a link to the full answer.

  - id: api
    title: API
    body: |
      IA6: Idearium writes a machine key (0600) at start; every Nexus process sends it (copilot, guardian, the CLI, the MCP server)
      Remote CLI: unchanged commands; `idearium --remote <host>` uses the app password from the environment
      Bot: `nexus bot start --platform discord --key-env NEXUS_BOT_KEY --allow "idea log,idea ask,status,repo show"`
      Ledger: idearium access ledger gains { door, command, key } per remote command

  - id: build_order
    title: Build order
    body: |
      1  SD15 the security floor on guardian, copilot, cortex, versionium (one shared helper)
      2  IA6  every local caller carries the machine key; password mode works for the whole stack
      3  IA7  the key's hat/label is the actor in every ledger row
      4  door A documented and proven: SSH + the CLI from another machine (no code; a page in docs)
      5  door C or D only after 1–3, as its own phase, with the allow-list and a read-only key

  - id: failure_modes
    title: Failure modes
    body: |
      F1  A bot key leaks → it is scoped (AX3) and revoked from Settings → Access; its sign-ins end at once (0.58.0).
      F2  A door bypasses the gate (binds 0.0.0.0) → AX1; a test fails any service listening beyond loopback.
      F3  Agents act remotely on a person's behalf without being asked → personOnly rows stay person-only through every door.

  - id: tests
    title: Tests
    body: |
      T1  every Nexus service: a request with a foreign Origin is 403 (SD15's proof)
      T2  password mode on: the loop sim runs end to end; a request with no key is 401 (IA6's proof)
      T3  a bot key that is read-only cannot run a write command; the refusal is said in the chat
      T4  no service listens on anything but 127.0.0.1 (a startup check)
