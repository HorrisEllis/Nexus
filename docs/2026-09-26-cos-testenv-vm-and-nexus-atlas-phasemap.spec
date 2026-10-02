spec:
  meta:
    name:     cos-testenv-vm-and-nexus-atlas
    version:  1.0.0
    date:     2026-09-26
    release:  0.39.264
    owner:    cos.testenv · idearium.ui.nexus-atlas · idearium.ui.navigator
    status:   built (0.39.264) — every phase below; one open item in open_items
    origin: >
      James (0.39.264): "the nexus atlas in the nexus repo. expand it completely, don't make it
      just a list. then make each reference a link to either open the nested or file. then with
      cos, i need help setting the vm up. either a batch file or just in the packages. or invent a
      js alternative. needs to be able to create a test env for any repo."
      Then: "this in idearium needs to only show in nested compartments/repos. also make sure
      your following the axioms in the docs folder" (screenshot: the Idearium top bar ideas/specs
      counters and the Create / Build navigator).

  # ── Drift, stated (§12.5, §0.0) ───────────────────────────────────────────
  drift: >
    Phases T1–T3 were written before this map existed — the axiom reminder arrived mid-session.
    They are recorded here as built-before-mapped, not back-dated. Everything from T4 on is
    built after this map.

  # ── What exists (read, not recalled — §8.6) ───────────────────────────────
  exists:
    - cos/testenv/index.js — process + vm backends; vm needs qemu on PATH, COS_TESTENV_BASE_IMAGE,
      and a LINUX host (9p virtfs). On Windows the VM option could never be offered.
    - cos/compartment/qemu-runtime.js — buildQemuArgs (guestAgent, shareDir), overlays, QMPClient.
    - cos/compartment/guest-agent.js — QGA client (guest-exec with captured output).
    - lib/cos-run.js — the COS run menu; ordinary repos find tests only by basename
      (*.test.js, *.spec.js, test_*.py, *_test.py) — a repo with tests/foo.js shows "no test files".
    - idearium/ui/js/nexus-atlas.js — renders docs/atlases/nexus-atlas.md with resolvable references.
    - docs/atlases/nexus-atlas.md — 13 modules as short index entries, 7 systems "not yet mapped".
  missing:
    - M1 no way to MAKE a base image — every user must hand-build a Linux guest with qemu-ga.
    - M2 no VM on a Windows host (9p is Linux-only).
    - M3 no notion of "how is this repo tested" beyond file names — no install step, no suite command.
    - M4 QEMU installed by winget is not on the running process's PATH → "not on PATH" forever.
    - M5 the Nexus atlas is an index, not an atlas; 4 kernels (orchestrator, architect, eravos, core)
      have no atlas of their own, so their "nested" link lands on nothing.
    - M6 the Idearium top-level shows Create/Build and repo-scoped counters outside any repo.

  invariants:
    I1: the base image is made from a public cloud image + cloud-init, by JS — no host tools but QEMU.
    I2: tests never run with network; dependency install is the only online phase, and the cut is
        verified from inside the guest before any test starts (§4.3).
    I3: every "unavailable" names the missing piece AND the fix (§1.2).
    I4: >-
      nothing about the VM is committed or stored in the tree: images live in the user cache dir.
    I5: every atlas reference resolves to a file, dir, system or doc in the snapshot, or is plain text —
        checked by a test over the real tree, never by eye (§1.1).

  phases:
    - id: T1
      name: tar disk (repo → guest without 9p)
      status: built-before-mapped
      files: [cos/testenv/tar.js]
      closes: [M2]
    - id: T2
      name: detect — how any repo is installed and tested
      status: built-before-mapped
      files: [cos/testenv/detect.js]
      closes: [M3]
    - id: T3
      name: host — find QEMU off-PATH; base image manifest in the user cache
      status: built-before-mapped
      files: [cos/testenv/host.js, cos/compartment/qemu-runtime.js (cpu, shareDisk, nic0 id, smbios, serial log, resolved binaries)]
      closes: [M4]
    - id: T4
      name: runner — tar disk, install online, cut + verify offline, suite + files, accel fallback to TCG
      status: built
      files: [cos/testenv/index.js]
      depends_on: [T1, T2, T3]
    - id: T5
      name: provisioner — download a Debian cloud image, cloud-init over the user-mode network
            (smbios nocloud-net seed served by a JS http server), install qemu-ga + node + python3,
            power off, verify by booting it, write base.json
      status: built
      files: [cos/testenv/provision.js, cos/testenv/setup-vm.bat, cos/testenv/setup-vm.sh]
      depends_on: [T3]
      closes: [M1]
    - id: T6
      name: run menu + Idearium — broadened test detection, VM option uses the plan,
            "Set up the test VM" from the menu (background job, live log)
      status: built
      files: [lib/cos-run.js, idearium/api/index.js, idearium/ui/js/app.js]
      depends_on: [T4, T5]
    - id: T7
      name: tests — unit (tar/detect/host/runner with emulated guest) + a REAL QEMU boot where the host has one
      status: built
      files: [tests/modules/test-cos-testenv.js, tests/modules/test-cos-testenv-vm.js]
      depends_on: [T4, T5, T6]
    - id: A1
      name: Nexus atlas — every system and every top-level directory, in prose + structure;
            atlases for orchestrator, architect, eravos, core; every reference resolvable
      status: built
      files: [docs/atlases/*.md, idearium/ui/js/nexus-atlas.js]
      closes: [M5]
    - id: A2
      name: atlas reference test — every reference in every atlas resolves against the real tree
      status: built
      files: [tests/modules/test-nexus-atlas-refs.test.js]
      depends_on: [A1]
    - id: N1
      name: Idearium top level shows only Welcome + Repos; Create/Build and the counters live inside a repo
      status: built
      decision: >
        James was asked which part of the screenshot ("counters", "Create/Build", or both) and did not
        answer before the build; the stated default, both, was built. Welcome's pillars that lead into
        Create/Build are hidden at the top level too, for the same reason.
      files: [idearium/ui/index.html, idearium/ui/js/app.js]
      closes: [M6]
    - id: E1
      name: Eravos "+ NEW" creates an Idearium idea or spec instead of downloading engine.js + schema.json
      origin: 'James: "instead of download, it should create a idea or spec for a new organism"'
      status: built (ui/eravos + eravos/ui catalog-ui.js; Idearium message listener, Eravos frame only)
      superseded: the download scaffold — kept in git history (34c7753), reported in CHANGELOG (§0.3)
      files: [ui/eravos/catalog/catalog-ui.js, eravos/ui/catalog/catalog-ui.js, idearium/ui/js/app.js]
    - id: R1
      name: registry + records — loom map with real require() wires, cos.spec + idearium.spec addenda,
            SPEC-REGISTRY, lib/version.js, CHANGELOG, commit
      status: built
      depends_on: [T7, A2, N1, E1]

  # ── Mid-release addition ──────────────────────────────────────────────────
  added:
    - id: X1
      name: ErosmancerOS starts with Clear Glass (clear-glass/src/eros/supervisor.js)
      origin: 'James: "hook it in to run with clearglass" / "just need erosmanceros to start with clearglass"'
      status: built — addenda in erosmancer/spec/erosmancer.spec and clear-glass/spec/clear-glass.spec
  open_items:
    - provision.js has not run against a real Debian cloud image download here (no internet on the build
      machine); the seed and cloud-init path is tested with a real HTTP seed and an emulated first boot.
    - the two Eravos canvases (eravos/ui mods, ui/eravos organisms) are still two contracts.
