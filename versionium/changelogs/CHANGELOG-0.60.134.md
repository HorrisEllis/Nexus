# 0.60.134 — 2026-10-17

James: "and you know i mean cos compartment right? make a template for it now that loom holds"

Yes: sovereign means each system runs in its own COS compartment, isolated, with its registry as the drawbridge. That is
his "cos is the isolated compartment for each system using the regisry as a drawbridge". A clean folder is the condition
for it, not the whole of it.

The coder reads "a template for it now that loom holds" as a template for a system's COS compartment, held in loom and
served by loom. That reading is to confirm. "Now that loom holds" could also mean "now that loom's tests hold".

## The compartments already exist

His 0.39.261 is "i want a nexus repo in idearium, that immutable with nested compartments per system so i can manage nexus
from inside nexus". It made `nexus-self` (the parent) and `nexus-self-<system>` (one child per system), with the live
folders mounted read-only (`idearium/repo/nexus-self.js` `ensureCompartments()`). The template describes those same
compartments. It does not make a second set.

## Built: `loom/templates/cos-compartment.js`

`compartmentFor(system)` returns one system's compartment, schema `nexus.compartment/2`:

| Part | What it holds |
|---|---|
| `cos` | The COS create config (name, parent, purpose, runtime, network isolated), with a checkable intent in COS's own format (`cos/foundation/intent.js`). The end state is "the system is sovereign", checked by a command: `node lib/system-boundary.js sovereign <system>`, which exits 0 when sovereign and 1 with its blockers otherwise. The conditions are its registry and its contract. The axioms are the five genesis rules |
| `runtime` | Port and health route, from `lib/system-registry.js` (the tunnel), never typed in |
| `mounts` | Its own folder (read-write once it runs there, read-only while it is still a mirror), plus the kernel read-only (`lib/`, `node_modules/`). Nothing of any other system |
| `drawbridge` | Its registry and contract, the only door in. Other systems are reached through their routes |
| `store` | Its node files, its node database and its JAA store. This compartment's process is the one writer |
| `seal` | Ready only when the system is sovereign. Until then, its blockers |

- `compartments()` builds all of them.
- `apply()` writes each intent onto the compartment COS holds (`lib/cos-bridge.js` `setIntent`). It creates none: a missing
  compartment is said, together with how it is made.
- `state(system)` shows what COS holds for it now.

Loom serves it from its own routes, declared in its registry:
- `GET /api/compartments`
- `GET /api/compartments/:system`
- `POST /api/compartments/apply`

The command `system compartment [<system>] [--apply]` reaches loom through those routes. The template reads only the
kernel, so the ratchet holds at 540.

## What it shows

There are 14 compartments, and every intent is one COS accepts. Their seals:
- **nexus-healer:** the one seal ready.
- **The others:** open, with their blockers named:

| System | Crossings to close |
|---|---|
| architect | 6 |
| ollama | 6 |
| emerge | 5 |
| loom | 8 |
| clear-glass | 10 |
| diagnostic | 10 |
| versionium | 10 |
| intelligence | 16 |
| cortex | 20 |
| copilot | 27 |
| guardian | 32 |
| idearium | 37 |
| orchestrator | 38 |

## Not done yet

- **Moving a system in (DB11):** running its process inside its compartment, with its folder mounted read-write. Next
  for nexus-healer, the first sealed one.
- **`cli/compartments.js`:** writes the older `nexus.compartment/1` manifests with its own copy of the crossing scanner,
  the third one. It is redundant now and is recorded for IM2. It is not removed here.

## Proof

- `tests/modules/test-cos-compartment-template.test.js` CT-01..07 pass:
  - CT-01: every intent is accepted by COS's `normalize`;
  - CT-02: the same compartments as nexus-self, not a second set;
  - CT-03: COS's own `verify()` runs the end-state check for real, and nexus-healer meets it while cortex does not;
  - CT-04: the seal and the mounts;
  - CT-05: `apply` writes intents, creates nothing, and says what is missing;
  - CT-06: the routes, the registry rows and the command;
  - CT-07: no crossing, and the ratchet holds.
- Booted loom for real. `GET /api/compartments` served 14 manifests with nexus-healer ready, and
  `/api/compartments/nexus-healer` said its compartment is "not created yet (ensureCompartments)" in this cloud copy. The
  data the boot touched was restored afterwards.
