# 0.60.159 — 2026-10-18 (mapped)

James: "Feature in So with the file section in the code tab in Idearium, there needs to be a simulated environment, a file tree
for the compartment, the desktop environment. It needs to use Ubuntu server or Debian without the desktop environment, just the
command line interface. Then use the component registry. Look at the drawbridge specs. Use the component registry as a tunnel
into the CLI interface for the terminal in Linux. As an interaction contract with handshake verification."

Mapped before building, in `docs/2026-10-18-compartment-environment-phasemap.spec`.

## What already exists

- **The machine.** COS already builds the image he names. `cos/testenv/provision.js` makes a Debian 12 server image with no
  desktop, and `cos/compartment/qemu-runtime.js` boots it as a compartment.
- **Commands inside it.** The guest agent runs commands inside the machine without SSH, and `cos vm shell` (MB1) is a real
  terminal over ssh.
- **The doorways.** The registry's tunnel (DB13) and the orchestrator's contract handshake exist. The crossing through the tunnel
  (DB3) and the handshake for every system (DB5) were open.

## The map

| Phase | What it builds |
|---|---|
| CE1a | COS answers on its own route: `cos/server.js`, its contract, its port |
| CE1 | the compartment's machine, started lazily (storage and identity first), display none (D20), egress per D17 |
| CE2 | COS's registry declares the compartment's shell, exec, file list and file read |
| CE3 | `lib/drawbridge.js` `cross()` and the handshake, so a session opens only when the compartment's contract (its declarations plus its machine's manifest) is VERIFIED; MISMATCH or UNREACHABLE is refused, with why |
| CE4 | the terminal: `ssh -tt` streamed over a WebSocket from COS's server, which Idearium relays by route, and a session ledger kept in the compartment |
| CE5 | the guest's file tree, read through the guest agent, read-only |
| CE6 | the Code tab: two roots in the file section (the repo and the machine), and a terminal panel (xterm.js) that shows the trust state before the prompt |
| CE7 | the commands, and the agents' door (GW13) through the same tool |

## Decided by his axioms

- **CE0b:** Debian. COS's provisioner already builds and proves it. Ubuntu server stays one flag away.
- **CE0c:** xterm.js, vendored into Idearium.
- **CE0d:** what the handshake verifies.
- **CE0e:** COS answers on its own route. This adds one on-demand process, and it is brought to him as a cost.
- **CE0f:** the handshake's verification moves into lib, the kernel. Both the orchestrator and the drawbridge use it.

## Dependency graphs

Every phase has a graph and is ready, and none shows a new crossing. Two crossings were designed out by reading the new files'
plans:
- lib → orchestrator, for the handshake;
- idearium → cos, for the terminal and the files.

## Still his

- **CE0a:** one compartment per map, or per phase.
- **GM0a:** his answer is recorded ("Pre commit should be the raid compartment right?" · "The contract creates a compartment
  becomes the end state of the compartment."), with the coder's reading to confirm.

## Not verified here

This container has no KVM and cannot reach `cloud.debian.org`. Every phase will be proven here with fake runtimes, and the real
boot is on his machine.
