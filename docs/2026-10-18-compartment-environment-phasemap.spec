spec:
  meta:
    name:     compartment-environment
    version:  1.0.0
    date:     2026-10-18
    release:  "0.60.159 (mapped)"
    uuid:     nexus-compartment-environment-phasemap-v1-0000-2026-1018-jamesbrooks-001
    owner:    "cos (the machine, the shell, the guest's files) · lib (the drawbridge crossing, the tunnel) · orchestrator (the handshake) · idearium (the Code tab: files, terminal)"
    voice: >-
      The ideas, the direction and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to
      correct. Decisions his axioms settle are recorded as decided by them; what they do not settle is asked.
    origin: >-
      James, 2026-10-18 (after "Pre commit should be the raid compartment right?" and "Like all of the work is supposed to be
      stored in the compartment. The contract creates a compartment becomes the end state of the compartment."): "Feature in So
      with the file section in the code tab in Idearium, there needs to be a simulated environment, a file tree for the
      compartment, the desktop environment. It needs to use Ubuntu server or Debian without the desktop environment, just the
      command line interface. Then use the component registry. Look at the drawbridge specs. Use the component registry as a
      tunnel into the CLI interface for the terminal in Linux. As an interaction contract with handshake verification."
    axioms: "docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §5.2 the contract is the bridge, §1.1 nothing trusted until proven, §1.2 nothing fails silently, §5.9 secrets never leave, §0.3 nothing lost; docs/CLAUDE.md: backend → route → command → UI; UI tested in Clear Glass; a dependency graph before every phase"
    reading_of_his_words: >-
      The coder's reading, to confirm: the contract's compartment (his "the contract creates a compartment") is a real machine:
      Debian (or Ubuntu) server, command line only, no desktop. The Code tab's file section shows that machine's file tree beside
      the repo's, and the Code tab has a terminal into it. Nothing reaches the machine except through the component registry:
      the registry is the tunnel (his DB13 decision, 2026-10-17), the shell is a capability the compartment declares, and a
      session opens only after a handshake has verified the compartment's interaction contract — the same trust states the
      orchestrator already gives HTTP services (VERIFIED, MISMATCH, UNREACHABLE). "Simulated" read as: an isolated machine the
      work runs in, not a mock.

  # ── What exists, read 2026-10-18 at 0.60.158 ─────────────────────────────────
  exists:
    the_os: "cos/testenv/provision.js — downloads Debian 12 genericcloud (server: cloud-init, virtio, no desktop, ~350 MB), boots it once, installs node and qemu-guest-agent, proves `node -v`, keeps the base image and base.json (what it has). --image-url takes any cloud image (an Ubuntu server cloud image is the same shape)."
    the_machine: "cos/compartment/qemu-runtime.js — a compartment backed by a real guest kernel: ephemeral (a throwaway overlay on the read-only base) or persistent (its own disk, qemu-img snapshots); network 'none' by default; COS-1 nothing silently fails."
    a_command_inside: "cos/compartment/guest-agent.js — guest-exec / guest-exec-status over the QMP guest agent: a command run inside, its output and exit code back, no SSH needed."
    the_terminal: "MB1 (0.60.77) `cos vm shell <compartment> [--user] [-- cmd]` — ssh over the loopback forward, a real TTY handed through (editors, sudo, colours, Ctrl+C), the guest's exit code returned."
    the_tunnel: "lib/system-registry.js tunnel(name) (DB13, 0.60.128, read side): a system's runtime entry, its declared routes, the commands that reach them, its toasts, its compartment; heartbeat(name). A call THROUGH the tunnel is DB3, open."
    the_handshake: "orchestrator/lib/contract-handshake.js — a system's /api/contract fetched and verified: id, routes reachable, schema hash against the one on file; UNVERIFIED · VERIFIED · DEGRADED · MISMATCH · UNREACHABLE. For HTTP services only (DB5 extends it to every system, open)."
    the_contracts: "each system's interaction-contract.json (cortex/, loom/ …): its routes, health, ports."
    the_code_tab: "idearium/ui/js/code-surface.js views files · changes · plans · runs · cos; the cos view is static text ('the proposal is tested here'). No terminal, no guest file tree."
    the_compartments: "lib/cos-bridge.js createCompartment / mountPath / listCompartments / tree. RAID provisions a repo per contract with a compartment id (cortex/core/raid/contract-intake.js _provisionContractRepo)."
    decided_before: "D17 (GW0e) sandbox egress: default deny, an allowlist per compartment, open egress a per-run switch he sets. D20 (GW0h) minimal default: base + the one runtime plan() finds, display none."
    not_here: "no in-browser terminal renderer; no PTY library (none needed: `ssh -tt` allocates the TTY on the guest side, the host side is pipes); `ws` is present in node_modules but not declared in package.json."

  found:
    - "His machine is already built: COS makes exactly the server image he names (Debian, no desktop) and boots it as a compartment. What is missing is the door, not the room."
    - "The door is the drawbridge's two open phases: DB3 (a call through the tunnel) and DB5 (the handshake for every system). The terminal is their first real crossing, so building it builds them, for one capability, end to end."
    - "GW13 (the sandbox door: sandbox.exec/put/get, a key per compartment, egress policy) is the agents' half of the same door. One door, two users: him in the terminal, agents through exec. Mapped once, here; GW13 points at it."

  decisions:
    CE0a_one_compartment_per_what:
      question: "What is one contract, and so one compartment: a whole phasemap (its phases and bricks are gates inside it), or each phase?"
      options:
        - "one per map: the map's end state is the compartment's; phases and bricks are its gates (coder's recommendation: one machine per piece of work he thinks of as one thing; a 30-phase map is one machine, not 30)"
        - "one per phase"
      status: "HIS — asked 2026-10-18, before this request; carried here because the machine is the compartment's."
    CE0b_the_os:
      status: "DECIDED 2026-10-18 by his axioms (§8.6 reuse before build) — Debian 12 server (genericcloud), the image COS's provisioner already builds and proves. His 'Ubuntu server or Debian' leaves the choice open; Ubuntu server stays one flag away (--image-url, the same cloud-init shape), never a second provisioner."
    CE0c_the_renderer:
      status: "DECIDED by his axioms (§8.6 reuse; §1.1 proven) — xterm.js, vendored into idearium/ui/vendor/ (Idearium runs local; nothing fetched at runtime), not a terminal renderer written here. The coder's call; he can overturn it."
    CE0d_what_the_handshake_verifies:
      status: "DECIDED by his axioms (§5.2 the contract is the bridge; §1.1) — the compartment's interaction contract = what it declares in the registry (its capabilities: shell, files.list, files.read, exec) + its machine's manifest (the base image's base.json hash, the overlay). Hashed; checked before every session; a MISMATCH (the machine or its declarations changed since it was verified) or UNREACHABLE refuses the session and says why. First use: on file nothing → recorded as the canonical (the orchestrator's own rule)."

    CE0e_cos_answers_on_a_route:
      status: >-
        DECIDED 2026-10-18 by his axioms — his DB11 ("each system is soveriegn and self contained", 2026-10-17), his DB13 (the
        registry is the tunnel), and the drawbridge rule (systems cross only through routes; test-system-boundary SB-06). COS has
        no server and no port today: lib/cos-bridge.js reaches it by requiring cos/ files (crossings in the ratchet's baseline).
        A terminal through the tunnel needs COS to answer for itself: cos/server.js, a port in the config, its capabilities as
        routes. Brought to him as a cost he may want to know: one more process at boot (on demand, started the first time a
        compartment's machine is asked for, like the other on-demand systems).
    CE0f_the_handshake_is_the_kernel_s:
      status: >-
        DECIDED by his axioms (SB-10: a file used by two systems is the kernel's; SB-06) — the handshake's verification (hash a
        contract, compare with the one on file, give the trust state) moves from orchestrator/lib/contract-handshake.js into
        lib/contract-handshake.js, which the orchestrator then uses for its HTTP services and lib/drawbridge.js for a
        compartment. Without the move, the drawbridge (lib) would require the orchestrator's file: lib reaching up.

  phases:
    CE1a_cos_answers_on_a_route:
      status: OPEN
      depends_on: []
      files: [cos/server.js, cos/registry-components.js, cos/interaction-contract.json, lib/system-registry.js]
      does: >-
        cos/server.js: COS's own process, on a configured port, started on demand; GET /health, GET /api/contract (its
        interaction contract, which the handshake reads); its capabilities' routes as CE2 declares them. lib/system-registry.js
        knows its port, so tunnel('cos') and heartbeat('cos') answer. Nothing else in Nexus requires a cos/ file for these
        capabilities (the existing lib/cos-bridge.js crossings stay in the baseline, to move later under DB6).
      proof: "the server answers /health and /api/contract; tunnel('cos') reaches it; the boundary census shows no new crossing"
    CE1_the_compartment_machine:
      status: OPEN
      depends_on: [CE1a_cos_answers_on_a_route]
      files: [cos/compartment/qemu-runtime.js, cos/testenv/provision.js, lib/cos-bridge.js]
      does: >-
        A compartment gets its machine lazily: the first time its terminal or a sandbox gate needs it (not at creation — a
        contract's compartment is storage and identity first), a persistent disk on the Debian base (its own changes kept,
        qemu-img snapshots for rewind), display none (D20), network none or the allowlist (D17). Stopped when idle, its disk
        kept. lib/cos-bridge.js: machineFor(compartment) → { state, base, overlay, ports } or why not (no qemu, no base image —
        `cos testenv provision` named as the fix).
      proof: "with a fake runtime: first ask starts it, the second reuses it, idle stops it and keeps the disk; no qemu → said, with the command that fixes it"
    CE2_the_shell_is_declared:
      status: OPEN
      depends_on: [CE1_the_compartment_machine]
      files: [cos/registry-components.js, lib/system-registry.js]
      does: >-
        COS's registry declares the compartment capabilities — compartment.shell (interactive), compartment.exec (one command,
        the agents' door, GW13), compartment.files.list and compartment.files.read — with their routes, so tunnel('cos') lists
        them and the commands that reach them. What is not declared cannot be reached (DB3's rule).
      proof: "tunnel('cos') lists the four; a capability not declared is not in it"
    CE3_the_handshake:
      status: OPEN
      depends_on: [CE2_the_shell_is_declared]
      files: [lib/contract-handshake.js, orchestrator/lib/contract-handshake.js, lib/drawbridge.js]
      does: >-
        DB5 for a compartment, and DB3's cross() for its first capability. lib/drawbridge.js cross(from, to, capability, args):
        looks the capability up through the tunnel, runs the handshake (lib/contract-handshake.js, CE0f: CE0d's contract read
        from COS's GET /api/contract, hashed, compared with the one on file), records the crossing on the bus (who, which
        compartment, which capability, the contract hash, the trust state), then opens it. MISMATCH or UNREACHABLE: refused,
        said why. DB3/DB5 stay open for every other system; this is their first instance.
      proof: "VERIFIED opens; a changed declaration or machine manifest is MISMATCH and refused with the difference; an unreachable machine is UNREACHABLE; every attempt is a crossing record"
    CE4_the_terminal_bridge:
      status: OPEN
      depends_on: [CE3_the_handshake]
      files: [cos/compartment/terminal.js, cos/server.js, idearium/api/index.js, package.json]
      does: >-
        A session is a crossing that stays open: cos/compartment/terminal.js spawns MB1's `ssh -tt` over the loopback forward
        (the TTY is the guest's; the host side is pipes), resize passed as the window size. COS's server serves it as a
        WebSocket (ws, declared in package.json); Idearium's /api/compartments/:id/terminal relays to it by route (it never
        requires a cos/ file), opened only through cross() — the handshake first.
        The session's open, close, size and exit go on the bus; its bytes to a capped session ledger in the compartment (all the
        work is in the compartment — his words). The key is per compartment and never leaves the host (§5.9).
      proof: "with a fake transport: bytes both ways, resize, exit code back, the ledger capped; refused before any byte when the handshake is not VERIFIED"
    CE5_the_guest_file_tree:
      status: OPEN
      depends_on: [CE3_the_handshake]
      files: [cos/compartment/guest-files.js, cos/compartment/guest-agent.js, cos/server.js, idearium/api/index.js]
      does: >-
        The machine's file tree, read through the guest agent (guest-exec: a bounded `find` for a folder, `cat`/`head` for a
        file; no SSH needed), served by COS's server, through cross() like the shell. Idearium's GET
        /api/compartments/:id/files?path= and /file?path= relay to it by route. Read-only:
        a change to the compartment's work still goes through the proposal path (lib/repo-inject.js), never written behind it.
      proof: "a listing and a read through a fake guest agent; a path that climbs out of the root refused; an unreachable guest said"
    CE6_the_code_tab:
      status: OPEN
      depends_on: [CE4_the_terminal_bridge, CE5_the_guest_file_tree]
      files: [idearium/ui/js/code-surface.js, idearium/ui/js/code-tab-panels.js, idearium/ui/js/compartment-terminal.js, idearium/ui/css/compartment-terminal.css, idearium/ui/vendor/xterm.js]
      does: >-
        The Code tab's file section shows two roots: the repo, and the compartment's machine (its OS and state, its tree). The
        bottom bar gets a terminal panel (xterm.js): the handshake's trust state shown first (VERIFIED, or why not), then the
        prompt. Logic stays in the backend (DB7: the UI floats on top). Tested in Clear Glass.
      proof: "Clear Glass: the two roots render; the terminal shows the trust state, then echoes through a fake session; a refused handshake shows why and opens nothing"
    CE7_agents_and_commands:
      status: OPEN
      depends_on: [CE4_the_terminal_bridge, CE5_the_guest_file_tree]
      files: [idearium/cli/route-commands.js, lib/agent-tools/tool-catalog.js]
      does: >-
        `compartment shell <id>`, `compartment exec <id> -- <cmd>`, `compartment files <id> [path]`, `compartment handshake
        <id>` as command rows; the agents get compartment.exec and files through the same tool (GW13's sandbox door), egress per
        D17.

  build_order: "pieces held back only by depends_on (0.60.154's rule): CE1a, CE1; then CE2 → CE3; then CE4 and CE5 in any order; then CE6 and CE7."
  verification_here: >-
    This container has no KVM and no route to cloud.debian.org, so the machine itself cannot be booted here: every phase is
    proven with fake runtimes, transports and guest agents in tests, and the real boot is his machine's (said, not faked).

  # ── ADDENDUM 2026-10-18 (a) — every phase's dependency graph, and the crossings designed out before any code ──────────
  # lib/phase-graph.js on this map (files as named, after the design-out): CE1a 58153629 · CE1 4527189c · CE2 7f3f6ece · CE3 303bdc95 ·
  # CE4 459cf023 · CE5 b46da6c7 · CE6 3cff05cd · CE7 e8093372 — every phase ready, no NEW crossing. A graph cannot see what a file that does not exist yet will
  # require, so the coder read each new file's plan. Two would have crossed if built the obvious way, designed out above:
  #   - lib/drawbridge.js requiring orchestrator/lib/contract-handshake.js (lib → orchestrator, upward): the verification moves
  #     into lib (CE0f), the orchestrator uses it.
  #   - idearium/api requiring cos/compartment/terminal.js or guest-files.js (idearium → cos): COS answers on its own route
  #     (CE0e, CE1a) and Idearium relays by route.

