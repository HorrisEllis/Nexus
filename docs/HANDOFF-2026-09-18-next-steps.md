# Handoff — 2026-09-18, from v0.39.147

Real status and mapped (not yet built) next steps, for the next session
to pick up cold. Every "found" item below was located by direct
inspection this session — not assumed.

## Done this session (v0.39.147)

- **MCO01** — `lib/project-compartment.js`'s `buildSeedFromDrop()` now
  unwraps intake's `<archive>.expanded/` wrapper down to the real
  project root. Verified live: `myproject.zip.expanded/myproject/src/
  app.js` → `src/app.js`.
- **MCO02→MCO04** — built a `PHASE` (EXPLORING/ACTING/VERIFYING) model
  on `lib/compartment-engine.js` first, then found — via direct
  inspection of `lib/cos-bridge.js`'s own header comments — that this
  was the WRONG compartment concept. Migrated the real work to `cos/`:
  `WORK_PHASES`/`WORK_PHASE_TRANSITIONS`/`isValidWorkPhaseTransition()`
  in `cos/foundation/types.js`, a real `AdvanceWorkPhaseGate` in
  `cos/host/gates/compartment.js`, `cos/cli/commands/advance-work-
  phase.js`, and `lib/cos-bridge.js`'s `advanceWorkPhase()` +
  `toolsAllowedForWorkPhase()`. `guardian/routes/autonomous-loop.js`'s
  executor now creates a real COS compartment per run, advances it
  through all three real phases, and destroys it on completion.
- **Cleanup** — removed the superseded `PHASE`/`advancePhase`/
  `toolsAllowedForPhase` from `lib/compartment-engine.js` after
  confirming (grep across the whole repo) zero live consumers remained
  besides the now-retired test file. `compartment-engine.js` is back to
  doing exactly one real job: end-state PASS/FAIL evaluation.
- **MCO05** — `loom/lib/changelog.js`: real, durable, append-only
  per-version changelog. `GET/POST /api/changelog` on loom.
- Cleared ~70MB of accumulated test residue from idearium/RAID (see
  git log for the baseline commit).

## Mapped, not yet built — in the order I'd tackle them

### 1. Expose COS's existing snapshot/restore through the bridge
**Found:** `cos/foundation/snapshot.js`'s `SnapshotEngine` already has
real `take()`, `list()`, `load()`, `restore(snapId)`, `delete(snapId)`.
This is already VM-like snapshot/restore for a COS compartment — it
exists, it's just not reachable through `lib/cos-bridge.js` (which only
exposes create/destroy/mount/list/get + the new advanceWorkPhase).
**Not yet checked:** whether `SnapshotEngine`'s constructor
`(host, compartment)` needs a *live, running* compartment instance (the
kernel.js `Compartment` class — see the warning below) or just the
plain data record `createCompartment()` returns. These may not be
interchangeable. Check before wiring the bridge.

### 2. `cos/kernel.js` is a DIFFERENT "Compartment" — resolve the naming collision
**Found, not yet resolved:** `cos/kernel.js` defines its own
`Compartment` class — axioms, 7 birth gates (axiom_integrity,
condition_reasoning, bus_protocol, constraint_imagination, adversarial,
load_stress, identity_persistence), bus connections, synthesis history.
This looks like a "cognitive mesh" / agent-identity concept, unrelated
to the disk-backed project compartment `cos/cli/commands/create.js`
actually creates. Two real, different things share the name
"Compartment" inside the same `cos/` folder. This needs mapping (is
kernel.js's Compartment used anywhere live, or dormant?) before "make
compartments like a VM" goes further — a VM analogy might reasonably
apply to EITHER concept, and building on the wrong one repeats this
session's exact mistake.

### 3. Repos: git vs. versionium — pick one real rewind engine, don't build a third
**Found, not yet compared:**
- `lib/project-container.js`'s `_gitInit()` — real, per-repo `git
  init` + first commit, already wired into Idearium's real import flow.
- `versionium/lib/engine.js`'s real `commit()` / `restore(commitId)` —
  system-wide causal versioning, already has its own calendar/state
  read-back.
Both are real and already built. Before adding a third "rewind"
concept: does Idearium's repo need per-file/per-commit rewind (git is
already that, for free) or system-wide causal rewind across multiple
systems at once (versionium's actual job)? These may both be needed for
different reasons, but that's a decision to make explicit, not merge
silently.

### 4. `lib/nexus-uri.js` — read it before proposing `nexus://`
**Not yet opened.** Referenced by filename only so far. Could be a real,
partial URI-scheme implementation already, or a placeholder. Read this
FIRST — proposing a new `nexus://` protocol without checking is the
same mistake as building PHASE on the wrong compartment concept.

### 5. Idearium UI reflecting rewind
Blocked on #3 (which rewind engine) being decided first — the UI's job
is to reflect real state, and there's no real state to reflect until
the rewind engine itself is chosen and wired to Idearium's real repos.

### 6. Audit other systems against §5.9–§5.14 (Sovereignty & Contracts)
`docs/AXIOMS-v3.1.md`'s real, existing axiom group — not new. Worth
checking whether copilot, cortex, or versionium reach into COS or
compartment-engine internals directly instead of through a declared
contract, the same class of gap this session found and fixed for
Idearium → COS.

## Honest gaps / risks carried forward

- COS's own `state` (created/running/stopped — process lifecycle) and
  the new `workPhase` (EXPLORING/ACTING/VERIFYING — kind of work) are
  real, independent axes by design (tested: T-MCO04-008). Any future
  code should not assume they move together.
- `guardian/routes/autonomous-loop.js`'s executor destroys its COS
  compartment (`wipe: true`) on every run's completion. This is safe
  today because the compartment never has an external project mounted
  into it — if that changes (e.g., wiring a real project via
  `mountPath()` for the agent to work inside), the destroy-on-finish
  behavior needs re-examining before it silently deletes real project
  content that was never meant to be ephemeral.
