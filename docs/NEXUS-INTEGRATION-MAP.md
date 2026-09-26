# NEXUS Integration Map — Cross-Project Audit
**Target:** nexus-complete-v1_0_9 (system v0.9.8)
**Sources audited:** kern-v2, Causal-Nexus.zip (v5.0.0), relational-field-reader/rfr2 (v0.2.0), nexus-v0_53_1, Causal-Nexus-v5_0_0-Spec.docx
**Method:** every claim below comes from reading the actual files, not the package names. Where I didn't verify something, it's marked as such.

---

## 0. Two things to flag before the map — both matter more than any single port

**A. This zip is missing prior work.** `lib/user-model.js` here has `observe()`, `deriveFromChatLog()`, `checkContradictions()` — but no `irs-signals.js`, no `INVERSION`/`checkInversions()`, no `user_model_misses` JAA table. That work (adding IRS's gap/edge/inversion as a third state) was built in a prior session. It's not in this export. Either it lives in a branch that didn't make it into this zip, or it needs redoing. I'm not redoing it blind — confirm which.

**B. Causal Nexus is not supposed to be merged in.** Its own v5.0.0 spec (the docx) says it directly: *"It is a standalone, independent project... It does not belong to NEXUS, Forge, or any other project. Those projects may eventually use it. That is their concern."* NEXUS already treats it this way correctly — `cockpit/forge.js` says outright "same contract as causal-nexus/forge v5.0.0." So the right integration shape for Causal Nexus isn't "rebuild its modules inside NEXUS" — it's "consume the specific modules NEXUS doesn't already have a native equivalent for." Most of its substrate (kernel, ledger, causality, time, identity) duplicates what CFR-Ω + ESS + SISO already do. A few pieces don't.

---

## 1. kern-v2 → mostly **not a NEXUS fit**, confirmed again

- `bridge/identity.js` (NEXUS's internal bridge) uses shared secrets across 9 known, trusted services — correct for that threat model. `bridge/causal/server.js` already uses Ed25519, but for *signing the causal ledger*, not peer auth. kern-v2's actual value — Ed25519 peer identity + replay-protected sequence tracking + continuous sigma trust decay for **untrusted** mesh peers — still has no home in NEXUS.
- `nexus-v0_53_1/.../bridge/erosmancer-os/` looks like it might actually be the real "Bridge OS" — the sovereign P2P project kern-v2 belongs to. Unverified — I didn't open it. Worth its own look, separate from this NEXUS pass.
- `predict.js` (linear-regression drift forecasting) needs a real diff against `lib/meta/telemetry-codec/drift-engine.js`, which already exists and already does drift detection. Don't port until that diff happens.
- `fuzz.js`, `watchdog.js`, `probe.js`, `replay.js`, `mesh.js`, `transport-ws.js` — mesh-networking test/infra tooling, no NEXUS target.

**Verdict: hold kern-v2 for Bridge OS, not NEXUS.**

---

## 2. Causal-Nexus.zip (14 URCK modules) — mostly redundant, two real exceptions

| Module | Status in NEXUS | Action |
|---|---|---|
| `kernel`, `causality`, `time`, `identity` | Duplicated by CFR-Ω (`lib/cfr/*`) + ESS (`lib/ess.js`) + SISO event semantics | Skip |
| `adapter`, `projection`, `lazy` | No direct NEXUS equivalent found, but low standalone value without the kernel they're built for | Skip for now |
| `compress` | Overlaps `snapshot.js`'s NEX-SNAP/1.2 format — needs a diff, not a port | Diff first |
| `persist` (3-tier hot/warm/cold) | Partial overlap with `cfr/ledger.js` — needs a diff | Diff first |
| `forge` | **Already consumed** — `cockpit/forge.js` explicitly built to the same v5.0.0 contract | Skip — done |
| `gui` | Spec itself says this was removed in v5.0.0 (console HTML → standalone viewer) | Skip |
| **`query`** (582 lines, CQL — causal query language) | **Real gap.** `lib/cfr/graph.js` is 195 lines: `ancestors/descendants/jobChain/highSigmaNodes/stats`. No general query layer over the causal graph exists anywhere in NEXUS. | **Port** |
| **`loader`** (423 lines, hot module loading) | **Direct named match.** `lib/version.js` roadmap lists `Phase 14: Hot Module Loader — Immune System Model`, status `pending`. This is built for exactly that contract (load patched source → wire into live runtime → register gates → emit causal event). | **Port — fulfills a named, already-planned phase** |

---

## 3. rfr2/packages/nexus (the *real* v6.0.0, 21 modules) — superset of #2, six modules genuinely new

These six exist in the v6.0.0 package but **not** in the standalone Causal-Nexus.zip, and have no equivalent anywhere in nexus-complete:

| Module | What it does | NEXUS target |
|---|---|---|
| `enforcement` (333 ln) | `RuntimeGuard` + `BoundaryIndex` — registry of 25 system invariants, continuously monitored, hard stop on violation | Complements `lib/constitutional-ai.js`'s 4 request-level axioms — this is a *runtime* tripwire layer, different scope, not a replacement |
| `version-gate` (317 ln) | Single authoritative validation pass for `.nex` artifacts before parse/migrate/hydrate | `snapshot.js` already writes NEX-SNAP/1.2 files but I found no dedicated validator for them — this slots in directly |
| `clip` (313 ln) | Bounded causal subgraph extraction, replay, stability validation (3 entry points) | Needs a real diff against `replay-engine.js` (Phase 8.6, 16/16 tests) before deciding new vs. redundant |
| `adapter-sandbox` (192 ln) | Side-effect policy enforcement — adapters declare READ_ONLY / LOCAL_ONLY / FULL at registration, immutable, nulled in replay context | **Nothing like this exists in NEXUS today** — genuinely new safety primitive |
| `context` (297 ln) | `createLiveContext()` / `createReplayContext()` — hermetic isolation between live and replay execution | Related to `clip`/`replay-engine` — same diff applies |
| `observer` (183 ln) | Typed event bus scoped per execution context; Live and Replay buses are structurally distinct instances, not flag-gated | Compare against SISO's own bus before porting — may already be covered |

---

## 4. rfr2 — already ported, don't redo

Worth stating plainly so no one re-does this work:

- **`packages/gap/liminal`** (12 detectors: code, assumption, contrastive, structural, shadow, negative-space, relational, oscillatory, existential, field, music, reversal) — **already built** as `lib/meta/liminal/index.js` (470 lines, all 12), and already wired into `request-handler.js`, `chat-logger.js`, `guardian/lib/gap-hunter.js`. `docs/liminal.spec` confirms this in NEXUS's own words.
- **`packages/codec/telemetry-reference`** — explicitly labeled "reference." This *is* the source `lib/meta/telemetry-codec/*` (adapter, drift-engine, latent-model, engines, topology, runtime, bus) was already built from.
- **`packages/lattice/topo-kernel-reference`** — same situation, source of `lib/meta/topo-kernel/*`.

None of these need porting. They're done.

---

## 5. rfr2 — needs your explicit sign-off (people-modeling category)

Same line previous sessions drew, still holds:

- **`packages/resonance`** (TypeScript) — IDL axes/modes/dynamics/store, oscillation trajectory, ASE signature, resonance scoring, feed generator/scorer, `social-module.js`, full API server. This is the deepest relational/emotional modeling layer in the whole corpus. Nothing like it exists in NEXUS.
- **`packages/irs/irs.js`** — the raw GAP/EDGE/INVERSION primitive itself (separate from the liminal detectors, which are already in).
- **`kernel-alk`'s `relational.js`** — rupture/repair detectors (8 gaslighting patterns per the spec).
- Reviving the **INVERSION-on-`user-model.js`** work from §0-A.

I'm listing these, not wiring them. They'd mean Co-pilot/user-model start modeling people's relational state from conversation content — different in kind from everything in §2–3, and worth a clear yes per item, not a bundled one.

---

## 6. Unresolved — need a diff before classifying, not guesses

- `rfr2/packages/forge/spatial-forge` (DSL compiler/grammar/emit/templates) vs. NEXUS's `emerge/` (.eg compiler, :4242) — could be redundant or could supply something emerge lacks. Not checked.
- `rfr2/packages/lattice/rheon-idea-lattice-reference` (Idea/Project/Ledger stores) vs. `idearium` (:4800) — same lineage (Rheon Idea OS), likely overlapping, not confirmed.
- `nexus-v0_53_1` as a whole — old architecture (src/modules, src/causal-nexus, separate nexus-forge with canvas). Almost certainly superseded by v0.9.8 wholesale, except the `bridge/erosmancer-os` question in §1.
- `Nexus-Chat_4_.html` — not opened. Flagging so it isn't silently skipped.

---

## Shortlist — concrete, non-redundant, no sign-off needed

1. **CQL query engine** → `lib/cfr/query.js` (new file) — no existing capability to replace, pure addition
2. **`loader.js`** → fulfills `Phase 14: Hot Module Loader`, currently `pending` on your own roadmap
3. **`version-gate.js`** → validates `.nex` files `snapshot.js` already writes, nothing currently does this
4. **`enforcement`'s BoundaryIndex/RuntimeGuard** → second invariant layer alongside `constitutional-ai.js`, different scope (runtime trip-wire vs. request-time check)
5. **`adapter-sandbox`** → new side-effect containment primitive, no current equivalent

Each of these is additive — none requires touching or replacing code that already works, and none touches the people-modeling line in §5.
