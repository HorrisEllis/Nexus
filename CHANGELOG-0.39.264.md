# NEXUS 0.39.264: the Nexus atlas written out, a test VM for any repo, ErosmancerOS runs with Clear Glass

**Date:** 2026-09-26 · idearium 4.8.0 → 4.9.0 · eravos 3.17.0 → 3.18.0 · git: 0.39.263 + claude/adoring-tesla-cb5705 merged first (`34c7753`)

James:

> *"merge. to 264. keep the git, loom relies on it. the nexus atlas in the nexus repo. expand it completely, don't make it just a list. then make each reference a link to either open the nested or file. then with cos, i need help setting the vm up. either a batch file or just in the packages. or invent a js alternative. needs to be able to create a test env for any repo."*
>
> *"this in idearium needs to only show in nested compartments/repos. also make sure your following the axioms in the docs folder"* · *"instead of download, it should create a idea or spec for a new organism"* · *"hook it in to run with clearglass … just need erosmanceros to start with clearglass"*

Mapped first in `docs/2026-09-26-cos-testenv-vm-and-nexus-atlas-phasemap.spec`. The axiom reminder arrived after the tar, detect and host modules were written; the phasemap records them as built before the map rather than back-dating it.

## The merge, with the git

- `claude/adoring-tesla-cb5705` was cut from 0.39.263 and only adds to it (an idea that became a spec lives in its repo; `/ui/architect/`). It was taken whole.
- The 0.39.263 zip had no `.git`. The history comes from the 0.39.253 zip's `.git` (last commit `bf5adc9`). On top of it: `34c7753` (0.39.263 as delivered, 254–263 in one commit, since those commits exist only on James's machine), then the 0.39.264 commits. `data/` is never staged.

## The Nexus atlas, written out

- `docs/atlases/nexus-atlas.md` covers:
  - how to read it;
  - what NEXUS is;
  - the kernels, phases and ports;
  - every top-level directory;
  - how work moves through NEXUS (a prompt, a repo change, healing, self-knowledge);
  - the governing law;
  - a section per system (13 kernels + core);
  - core, directory by directory;
  - cross-cutting concerns, the build and run reference, and known drift.
- The previous text is kept in `docs/atlases/_archive/`.
- New atlases were written for the four systems that had none: `orchestrator-atlas.md`, `architect-atlas.md`, `eravos-atlas.md` and `core-atlas.md`. Every system now opens into a nested atlas.
- On the page:
  - Under each system heading, "open its atlas ›" opens the nested atlas in place, and "open the repo ›" opens the system.
  - A contents list at the top jumps to each section.
  - Nested atlases get a contents list too.
- References:
  - Every reference is a link: a system, a file, a directory, a document, or a glob (which opens its directory).
  - Routes and data folders link to the code that owns them.
  - Code spans are no longer mangled when they contain an asterisk.
- `resolveWith()` / `indexOf()` are exported from `idearium/repo/nexus-self.js`, so the page's own resolution rules can be tested.

**Tested:**
- `tests/modules/test-nexus-atlas-refs.test.js` 45/45. It renders every new atlas with the page's own renderer and resolves every reference against the real tree: 0 dead.
  - The Nexus atlas holds ~400 references across all four kinds, over 5,600 words.
  - The older atlases' stale references are listed, not failed.
- `tests/probe/nexus-atlas-home.js` 17/17 in a real browser, including the nested-atlas click.

## Create and Build live inside a repo

- At the top level Idearium shows Welcome and Repos. Create, Build, and the ideas/specs counters appear once a repo is open.
- The navigator nests Create and Build under the open repo, which it shows expanded.
- Welcome's pillars that lead into Create/Build are hidden at the top level too.
- **Default, not confirmed:** James was asked whether he meant the counters, Create/Build, or both. With no answer before the build, both was built.

## A new Eravos organism starts in Idearium

- The catalog's "+ NEW" no longer downloads engine.js + schema.json. It offers **CREATE IDEA** and **CREATE SPEC**.
- Inside Idearium, the request goes to the page. Idearium makes the idea and opens it, or opens the New Spec dialog filled in and linked to the idea.
- Standalone, the canvas calls Idearium's API itself.
- Idearium takes the message only from its own Eravos frame.
- The same change was made in both canvases (`ui/eravos/`, `eravos/ui/`), which remain two contracts.
- The download path is superseded; it is in git at `34c7753`.

## COS: a test VM for any repo

**What was wrong**
- The VM shared the repo over 9p, which exists only in Linux-host QEMU, so on Windows it was never offered.
- There was no way to make a base image.
- Tests were found by file name only, so a repo with `tests/basic.js` said "no test files found".
- A fresh `winget install QEMU` is not on the running Nexus's PATH.

**What changed**
- `cos/testenv/tar.js`: the repo goes to the guest as a read-only tar disk, written in pure JavaScript (ustar + PAX).
- `cos/testenv/detect.js`: for any repo, works out the install step, the repo's own test command (npm/pnpm/yarn test, pytest, go test, cargo test, rspec, phpunit, make test), and the test files by every common convention.
- `cos/testenv/index.js`:
  - Dependencies install with the network on.
  - Then QMP `set_link nic0 off` pulls the cable, and the guest must prove it cannot resolve names before any test runs.
  - Then the suite and the test files run.
  - If WHPX or KVM is not really available, it boots again under TCG.
- `cos/testenv/host.js`: finds QEMU off the PATH, and reads the base image manifest from `%LOCALAPPDATA%\nexus\cos-testenv` (never the repo).
- `cos/testenv/provision.js`, the "JS alternative":
  - Downloads a Debian 12 cloud image.
  - Seeds cloud-init over HTTP via SMBIOS, so no ISO tools are needed.
  - Installs qemu-guest-agent, Node LTS, Python, git and build tools; `--with go,ruby,php,rust` adds more.
  - Verifies the image with a second boot the way a test run boots.
  - Keeps the previous base.
- **`cos/testenv/setup-vm.bat`**: one command on Windows. It installs QEMU with winget if needed, then runs the provisioner. `setup-vm.sh` does the same elsewhere, and `npm run cos:vm-setup` / `cos:vm-status` are also available.
- Idearium Run menu:
  - When the VM is missing, "Set up the test VM" starts the setup in the background and shows its progress (`GET /api/cos/testenv`, `POST /api/cos/testenv/setup`).
  - The VM option describes its plan.
  - The result line shows the accelerator, the network and whether the offline check passed.
- `qemu-runtime.js` got opt-in additions: CPU model, share disk, NIC id, SMBIOS seed, serial log, kernel/initrd boot, and resolved binaries. Existing VMs boot unchanged.

**Tested:**
- `test-cos-testenv` 29/29.
- `test-cos-testenv-any-repo` 65/65, including a **real QEMU boot** (TCG) of a guest assembled from the host's kernel, busybox, qemu-ga and node (`tests/helpers/cos-mini-guest.js`). `npm test` and per-file tests ran in the guest's own kernel behind the cut network.
- **Not proven here:** a real Debian download and first boot. The build machine has no internet. The seed and cloud-init path is tested with a real HTTP seed server and an emulated guest. The first real run is `setup-vm.bat` on James's machine.

## ErosmancerOS runs with Clear Glass

**What was wrong**
- Nothing started ErosmancerOS. Every boot logged `ECONNREFUSED 127.0.0.1:7432`.
- Once started by hand, every `/api/connect` crashed: `DEFAULT_CONFIG` lacked the routing, behavior and observer defaults its own types declared, and a comment claimed they had been merged in.

**What changed**
- `clear-glass/src/eros/supervisor.js`:
  - Clear Glass starts ErosmancerOS through tsx (already installed with the workspace) and waits for it.
  - It connects ErosmancerOS to Clear Glass's own DevTools port (9333).
  - A crash is restarted with backoff. Five crashes in two minutes stop the restarts, and the reason is shown.
  - Quitting Clear Glass stops it.
  - An ErosmancerOS already running is reused, and `EROS_AUTOSTART=0` opts out.
- Settings › ErosmancerOS shows who started it and offers Start or Reconnect. Its port field now defaults to 9333; it said 9222.
- ErosmancerOS itself:
  - The defaults are fixed.
  - `EROS_LOG_LEVEL` limits what it prints, so each DevTools message no longer floods Clear Glass's console.

**Tested:** `test-cg-eros-supervisor` 16/16, including a real tsx start connected to a real Chromium's DevTools port, then stopped and the port freed.

## Also fixed

Clear Glass's page driver (`src/driver/glass.js`) failed on Chromium 141 with "Target position can only be set for new windows". It now creates the target, then sizes its viewport.

## Registry and records

- `loom/maps/cos-testenv-map.js` maps every new component with its real wires, including edges the scanner cannot see: spawn, HTTP and postMessage. It also maps ErosmancerOS's TypeScript server.
- Addenda: `cos/spec/cos.spec`, `idearium/spec/idearium.spec`, `erosmancer/spec/erosmancer.spec`, `clear-glass/spec/clear-glass.spec`. The phasemap is registered in `docs/SPEC-REGISTRY.spec`.
- `lib/version.js`: system 0.39.264. The line had said 0.39.258 while `package.json` said 0.39.263, because 0.39.259–263 never moved it; this bump corrects it.
- Not recorded in Versionium from here: that needs the running system.
