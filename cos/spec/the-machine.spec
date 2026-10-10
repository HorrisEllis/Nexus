# The machine — made in the spec workshop (idearium)
# Written 2026-10-10 from docs/2026-10-10-idearium-solid-phasemap.spec SD11 SD13. To be opened in the workshop
# (nexus/cos → cos/spec) and built through Idearium. Decisions as choices [A] [B] [C] [custom], recommendation marked;
# "chosen:" open until James picks. Nothing here is built yet.
spec:
  name: The machine
  ambition: 2 — creative
  source: "map: idearium-solid SD11 SD13 · his still-open question: what did 'Start VM' say on his machine"
  owner: cos (the VM, its controls, its viewer) · idearium (embeds the viewer) · clear-glass (embeds the viewer)
  status: specced 2026-10-10, not built
  james: >-
    "tell me about the cos desktop envirement ui. like can we have in like the ui?" · "also the vm, i have no control
    over, also the remote desktop, what about integrating it into cos?"
sections:
  - id: purpose
    title: Purpose
    body: |
      A repo's machine (its QEMU desktop) is COS's: one surface of commands — setup, start, stop, status, pause, resume,
      checkpoint, rewind, screen — and one viewer, embedded natively inside Idearium (no pop-up, no iframe) with its
      controls beside it. Status says what is missing, in order, with the button that fixes it.

      Evidence: the VM code is COS's (qemu-runtime, workspace, vm-control, provision) but start/stop and checkpoints are
      Idearium routes, the viewer is an Idearium pop-up page loading noVNC from jsDelivr (fails offline and without
      network), and the desktop base image is built by a script nothing in the UI runs — so "Start VM" on a machine with
      no image cannot work and says so only in the window.

  - id: primitives
    title: Primitives
    body: |
      machine     (thing)    a repo's VM: {repo, image, overlay, state, vncPort, checkpoints[]}
      setup step  (thing)    qemu present? → desktop image present? → build it (progress) → start; each with its fix
      viewer      (boundary) noVNC's RFB attached to an element (vendored), embeddable anywhere
      control     (action)   pause · resume · checkpoint · rewind — COS routes, one command table

  - id: build_order
    title: Build order
    body: |
      1 SD13a `cos vm status` with the setup steps and what is missing, in order
      2 SD13b `cos vm setup` builds the desktop image with progress (cos/testenv/provision.js --with desktop)
      3 SD13c the controls as COS routes and commands; Idearium's routes become calls to them
      4 SD11  noVNC vendored; the viewer moved to COS (idearium/ui/desktop.html archived) and embedded in Idearium as a pane

      choices — where COS's routes are served:
        [A] hosted by Idearium as today (lib/cos-bridge); only the ownership moves  ← recommended (no new process to keep alive)
        [B] COS gets its own small server and port, supervised by autopilot
        [custom] ____
      chosen: open

  - id: tests
    title: Tests
    body: |
      T1 on a machine with QEMU and no image: status says "no desktop image" with Build it; building shows progress; Start boots it
      T2 every control works from the command line and from the pane
      T3 the viewer loads with no network (vendored noVNC); probed in Clear Glass with a stubbed VNC stream
      Not verifiable in the cloud container (no VM image): proven on his machine.
