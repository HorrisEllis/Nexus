# Architecture (deep dive)

This is the detailed build log and technical architecture reference --
every design decision, every real vs. rebuilt piece, every test, every
known limitation, explained with full technical vocabulary. If you just
want to run the thing, read README.md instead. Come back here when you
want to know *why* something works the way it does, or you are extending
the code yourself.

---

# Emergence

A systems-thinking substrate where observation creates structure that feeds
back into observation. Execution: [WARP](../warp) — the foundation this
project is built ON, not a component inside it (see structure below).
Description: [Emerge](./emerge-language.spec).
Law: AXIOMS v3.1 (held, not vendored into this repo).

Full declaration: [`emergence.spec`](./emergence.spec).

## A structural fix worth knowing about

WARP was, until this pass, vendored as `emergence/warp/` — sitting as just
another subfolder alongside `vendor/` and `components/`. That's backwards:
WARP is the foundation this whole project is built ON, not a piece inside
it. Moved it out to be a true sibling of `emergence/`, restored the
complete original package in the process (an earlier vendoring pass had
only copied `core/`, which quietly dropped `dispatch/`, `plugins/`, and
WARP's own 43-test suite — none of that was intentional, it's just what
"only vendor core/" silently cost). Every `require()` path across every
component was updated and re-verified against the new location — see
`test/loop.test.js`, still 15/15, plus WARP's own restored suite, now
also passing (12+4+6+21 = 43 tests across its four files).

## Running it

```
node cli.js
```

Starts an interactive session — type text, press enter, see what every
component does with it. `Ctrl+C` to exit.

```
node cli.js --target-id=end-state:repair-complete --target-type=end-state --target-mass=15
```

Sets a target to pursue from the start (otherwise say `:target <id> <type>
<mass>` inside the session, or just don't set one — the field still runs,
honestly claiming no convergence).

Inside a session:
- `:history` — the real, durable chains
- `:sigma` — current divergence-since-baseline per component

**Scripting / piping:**
```
node cli.js --text="some text to observe"
echo "some text" | node cli.js --target-id=... --target-type=... --target-mass=...
```
Piped input processes one tick per line, target continuity carries across
lines automatically (the real feedback mechanism, not re-stated each time).

**Where it persists:** `./data` by default, or set `EMERGENCE_DATA_DIR`. Same
folder across runs = the loop continues where it left off — ledger, lattice,
and causal graph all survive restarts for real (see "Two more real fixes"
below).

**What to feed it:** any text — conversation transcripts, journal entries,
message logs, notes. One caveat worth knowing up front: `rupture_severity`
stays pinned regardless of input (see known gaps) — only `meaning_charge`
and `decay_score` genuinely respond to what you type right now.

## Running it over HTTP

```
PORT=7200 node server.js
```

```
POST /tick        { text, target? }   -> full tick() result
GET  /history      ?n=20               -> real durable chains
GET  /sigma                            -> divergence-since-baseline per component
GET  /logs                             -> real dispatch history per stream
GET  /patterns                          -> pattern-engine recall/prediction stats
POST /trace        { nodeId }          -> reverse causal condition mapping
GET  /events                           -> SSE stream, live tick broadcasts
POST /ideas        { text, tags?, projectId? } -> register a real idea
GET  /ideas        ?q=&projectId=&limit=        -> list or search ideas
POST /ideas/link   { fromId, toId, type }       -> real|refines|contradicts|implements|spawns edge
GET  /ideas/graph  ?projectId=                  -> the real idea lattice
```

Zero dependencies, same as everywhere else in this project — Node's
built-in `http` only.

## The loop

```
rfr2-observer  (Lens)   -- maps conditions and relations. observes, never gates.
      |
      v
feedback-loop-buffer (Signal) -- CFR's output becomes rfr2's next input window
      |
      v
cfr-creator  (Gate)     -- creates structure TOWARD an explicit target
      |                     (end-state, idea, or person -- never inferred)
      v
  +------------+-------------+--------------+
  associative-  causal-       event-
  lattice       graph         ledger          (all Record -- derived, parallel)
```

Every component wraps real, unmodified code from your `relational-field-reader`
(rfr2) codebase, vendored into `vendor/rfr2/`. One exception, stated plainly:
`sentiment-scorer.js` is new code (see below) -- nothing in rfr2 actually
produces the event it feeds.

## This was rebuilt once already

The first pass wired real modules to real modules through invented glue:
`cfr-creator` injected physics stress using a made-up formula
(`rupture*2000 + decay*800`), `associative-lattice` weighted edges by
coincidental similarity in that formula's side-effects, and `causal-graph`
called every consecutive event causal just because it came next. Individually
real code, connected by guesses. Corrected against three direct answers:

1. **CFR creates toward the end-state, idea, or person.** Rebuilt around
   `physics.js`'s real attractor/cluster mechanism -- gravitational pull
   toward an explicit target, with convergence read from the engine's own
   density detection, not a formula.
2. **Lattice resonance = shared invariants.** Rebuilt to extract a stated set
   of categorical invariants (trajectory, rupture state, decay band, target
   type, convergence classification) and weight edges by Jaccard similarity
   -- the fraction of stable structural facts two creations actually share.
3. **Causal vs. observational is determined by time between.** Rebuilt to
   measure real elapsed simulation time between creations; close in time
   degrades to a real `causal/rule` edge, far apart degrades to
   `observational` -- using the real edge-type taxonomy `causality/index.js`
   already declares, not asserted for every pair.

## Running it

```
node test/loop.test.js
```

8 tests, all passing (run repeatedly to confirm reliability against
`physics.js`'s unseeded randomness -- see known gaps).

```js
const { createEmergenceLoop } = require('./loop.js');
const loop = createEmergenceLoop({ dataDir: './data' });

const target = { id: 'end-state:repair-complete', type: 'end-state', mass: 3 };
const result = await loop.tick('some text to observe', target);
// { observation, feedbackWindowSize, created, lattice, causal, ledger }
```

`target` is optional -- omit it and the field still runs (curl noise,
entropy) but claims no convergence toward anything, which is the honest
state when there's nothing to converge toward.

## Two more real fixes, on top of the rebuild above

You asked "what can I do with this?" and I had to answer honestly: the
ledger didn't persist, and the feedback buffer wasn't actually feeding
anything back. Both fixed now, for real:

**Persistence, via a real port of `Jaa.zip`.** Checked that upload -- it's
a complete SQL database engine (dual PHP/JS, ~30 Gate files for DDL/DML/
query planning) built on the same Event/Gate/Stream/StreamLog family as
WARP. Didn't port all of it -- Emergence needs durable content-addressed
storage, not a SQL database, and building the rest before it's needed would
be exactly the complexity AXIOMS Sec0.5 warns against. Ported just
`src/Persistence/{Canonicalize,FileStore,FileRefs,Recovery}.php` to
`vendor/jaa/` -- same algorithm, translated line for line, not redesigned.
17-test suite proves it: deterministic content-addressing, real dedup, real
cross-restart durability, WAL-based crash recovery.

`event-ledger` now uses it: rfr2's real `UpgradeLedger` still does the
actual validation (unchanged), and every validated commit is *also*
written to Jaa's `FileStore`, hash-chained to the previous commit
(git-commit shaped), with a `FileRefs` pointer tracking the head.
`loop.history(n)` walks that real chain -- confirmed working from a
brand-new process that hasn't committed anything itself.

**Feedback, actually wired now.** `feedback-loop-buffer` was accumulating
observations but nothing read them back into anything -- a window that
fills, not a loop that closes. Now: `tick(text, target)` -- if you omit
`target`, the loop reuses whatever the *previous* tick was pursuing. Call
`tick(text, target)` once, then `tick(text)` repeatedly, and it keeps
pursuing that target without you restating it. Give an explicit target
again and it switches, then keeps *that* going. Verified directly: target
continuity, explicit override, and re-continuity after the override, all
three checked, not assumed.

## End-state first: reverse causal condition mapping

Forward causal classification (what `causal-graph` normally does) asks:
given two things that happened, were they causally linked going forward?
This is the inverse: given an end-state that was actually *reached*, what
conditions causally preceded it, walking **backward**?

Built on a method that already existed, unexposed: `causality/index.js`'s
own `traceToRoot()` walks backward from a node through only real
`causal/rule` edges — an `observational` edge breaks the trace (the real
store's own invariant: "observational edges are sideband annotations,
never traversed"). Wired through `causal-graph`'s gate, and combined with
`associative-lattice`'s per-node invariant lookup so the backward path
shows not just *that* two creations were causally linked, but *what
conditions* held at each step (trajectory, rupture, decay band,
convergence state).

`loop.traceEndState(nodeId)` runs it directly. More importantly: the
moment a tick's `cfr-creator` output shows **real** convergence (not just
"a target was set" — actual density crossing the threshold), `tick()`'s
return value auto-populates `endStateConditions` with this backward trace.
Nothing to separately query for — the instant an end-state is reached, what
caused it is surfaced right there.

Proven, not assumed: built a scenario with 5 creations and an artificial
9.5-tick gap between two of them (forcing an `observational`, non-causal
edge). `traceToRoot()` from the last node correctly returns only
`['creation:3', 'creation:4']` — it genuinely stops at the boundary, not
"always walks back to genesis regardless of what's in between," which
would have made this decoration instead of real filtering.

## Nine Liminal signals, plus a tenth from a different lineage

`rfr2-observer` wires **nine** real, unmodified modules from
`vendor/rfr2/liminal/`, all attached to Liminal's own real bus
(`createBus()` — a complete pub/sub implementation, no adapter needed,
unlike `RelationalModule`'s ALKModule kernel contract):

- **`oscillatory`** — real pendulum math (period, amplitude, damping —
  inlined in the source from `pendulum-swing`) applied to a rolling
  warmth signal, plus intermittent-reinforcement / love-bombing /
  approach-retreat pattern detection.
- **`relationalGaps`** — Liminal's *own* `RelationalModule` (a genuinely
  different class than `field/relational.js`'s, same name, aliased on
  import to avoid collision). Gaslighting (6 layers), manipulation
  patterns, control patterns, communication gaps.
- **`reversal`** — meaning inversions: "fine" meaning not fine,
  minimization as maximization, sarcasm.
- **`negativeSpace`** — what's systematically avoided across a rolling
  window, not just a single message.
- **`shadow`** — unspoken emotional/cognitive material.
- **`structural`** — the conversation's own implicit power geometry.
- **`existential`** — identity/meaning concentrated in a single source.
- **`contrastive`** — stated position vs. what the text is actually doing.
- **`assumption`** — load-bearing assumptions treated as fact. **Honest
  exception to everything below**: its real threshold is hardcoded
  (composite < 0.18, checked its constructor — not configurable) and
  fires on *any* unhedged declarative sentence. "The meeting is at 3pm
  tomorrow" trips it. Verified directly, not a bug — this module is
  calibrated for analytical text, not casual conversation. Treat it as a
  much weaker signal than the other eight.

The other eight verified individually: honest `null` on neutral text,
real detection on matching text, and — importantly — **independently
selective** when attached to the same bus. Tested directly: a message
with only loaded "fine" language fires `reversal` and correctly leaves
the rest `null`, not a cascade of false positives.

Test files: `test/oscillatory.test.js`, `test/relational-gaps.test.js`,
`test/reversal-negspace.test.js`, `test/shadow-etc.test.js` (13 tests
across the four files).

### The tenth signal: `affectiveField`, from a different lineage entirely

`vendor/resonance-v5.1/relational-physics.js` (`RelationalFieldAnalyzer`)
-- not from `rfr2` at all, from the separate `resonance-v5.1-patches`
upload. Self-contained, zero imports. Computes an emotional field
(`Theta`: entropy/intensity/certainty/intimacy/compassion/empathy) from
text, then finds the closest match against 16 named emotions plus
dual-pole field signatures (e.g. "grief+guilt" = `self_loss_field`).

**Two real syntax errors found and fixed in the source itself**, not
design changes: a missing `/**` comment opener before the `EmotionEngine`
class, and an unclosed `/**` comment block that silently swallowed two
constant declarations, producing `Export '_CLUSTER_THRESHOLD' is not
defined` at load time. This file had never actually been executed by
anyone before this integration -- both were basic syntax errors that a
single test run would have caught immediately. Fixed minimally (comment
syntax only, zero logic touched).

**Two real calibration findings from testing it**, both documented, not
hidden:
- It **never returns null** -- there's no abstention mechanism in the
  source. `thetaFromText()` always produces a `Theta` from defaults, and
  `analyzePoint()` always finds the nearest emotional basin to whatever
  that is. "The meeting is at 3pm tomorrow" returns `shame`, confidence
  0.66. Read this signal as "the closest emotional shape to this text's
  measured profile," not "an emotion was detected here."
- It only responds to a **narrow set of meta-linguistic marker words**
  (certainty/hedge/causal/intimacy/empathy/intensity -- six fixed regex
  lists), not common emotion vocabulary. "I am so happy and grateful for
  you" and "I am furious and this is completely broken" produce the
  *identical* default `Theta` -- neither "happy"/"grateful" nor
  "furious"/"broken" hit any of the six trigger lists. Confirmed the
  mechanism works when real trigger words are present (certainty vs.
  hedge language measurably shifts `C`) -- it just doesn't cover ordinary
  emotion words the way "emotional field" might suggest.

Test file: `test/affective-field.test.js` (4 tests, including one that
locks in the vocabulary blind spot as documented behavior -- if it ever
starts failing, the module started responding to common emotion words,
which would be worth knowing about, not silently absorbed).

## Pattern engine: recall + prediction, built on a real found primitive

Requested directly: "a pattern engine, with pattern memory." Before
building anything, that was split into three genuinely different things
it could mean — **prediction** (given the current state, what usually
follows), **recall/matching** (recognizing "this happened before" and
when), and **rule generation** (patterns compiling into new detection
logic that runs itself — `forge`'s territory, a different risk category,
flagged earlier, not touched without explicit sign-off). Prediction and
recall got built; rule generation didn't.

Checked real code first rather than inventing: `scanners/crystalball-test-suite.html`
(previously dismissed as "just a test harness") turned out to have a
genuinely reusable primitive inside it — `PredictiveEngine`, a small,
real Markov transition-frequency tracker. Its sibling `AssociationEngine`
in the same file wasn't used (overlaps with what `associative-lattice`
already does), and the file's GPGPU audio/video processors are out of
scope entirely.

`components/pattern-engine/` computes a real signature per tick
(trajectory, rupture, decay band, convergence state, and *which* of the
10 observer signals fired — richer than `associative-lattice`'s own
invariant set), then:
- **recall**: real exact-match lookup — has this exact signature occurred
  before, how many times, and where. Not fuzzy similarity — that's
  `associative-lattice`'s job, not duplicated here.
- **prediction**: given the current signature, what has historically
  followed it. Honestly `null` until a transition has genuinely repeated
  at least once — verified directly, not assumed.

Persisted differently than the append-only chains elsewhere in this
project: pattern memory is aggregate mutable state (counts, not an
immutable sequence), so it's one current-state blob via Jaa's
`FileStore`+`FileRefs`, write-through on every observation — a different,
still-real use of the same persistence primitives.

Wired into `tick()` (surfaces as `r.pattern`), the CLI (shows recall
count and prediction confidence when they fire), and the server
(`GET /patterns` for aggregate stats). 10 component tests plus a loop-level
integration test plus a server-level test — verified live: three repeats
of the same input through the real CLI correctly showed `seen 1x before`,
then `seen 2x before` with a real `100% confidence` prediction on the
third.

## Other `rfr2` packages, checked and deliberately left alone

`pat`, `ase`, `bridge-xlat`, `codec`, `forge` — all surveyed, none
integrated, each for a real, specific reason:
- **`pat`** ("canonical session record, WAL persistence, cross-species")
  — redundant with what Jaa + `event-ledger` already do, and wrong domain.
- **`ase`** (work-fingerprint tracking) — needs real behavioral telemetry
  per encounter, same class of gap as `rupture_severity`. Not fakeable.
- **`bridge-xlat`** — equine/canine species profiles. Wrong domain entirely.
- **`codec`** — the *same* latent-model math as `rupture_severity`'s
  gap, repurposed for server telemetry (request rate, latency). Needs
  real service metrics, not text.
- **`forge`** — "observed patterns → executable code... the system that
  writes itself." A self-modifying code generator. A fundamentally
  different risk category from everything else integrated here — flagged
  for a deliberate decision, not touched without one.

## `application/` and `scanners/` — fully opened and checked

Both folders were named early in this project's history and left
unopened for a long time. Now fully surveyed, all 10 files:
- **`ase-persistent-scanner.html`** — byte-identical (confirmed via
  checksum) to a file already fully decomposed earlier in this project.
- **`resonance-v3.html`** (in `application/`) — superseded by the
  resonance-v5.1 lineage already integrated (`cfr-creator`'s physics,
  and now `affectiveField`).
- **`mimi.html`** — has real `analyze`/`detect` functions, but they're a
  simpler, weaker text analyzer (basic word-frequency repetition
  detection) than what's already vendored. Redundant, not additive.
- **`the-listener.html`** — calls `fetch('https://api.anthropic.com/v1/messages', ...)`
  directly. A real, working cloud LLM integration — but it contradicts
  the "local first, cloud is never the default path" law already carried
  into `contracts/LLM_CONTRACT.js` from `ollama.js`. Flagged as a genuine
  architectural conflict requiring a deliberate decision, not silently
  wired in around the existing contract.
- **`alk-social-module.html`** — no `analyze`/`detect` logic at all, pure
  UI/posting interface.
- **`mastermind_v3.html`** — its pattern detection (`detectPatterns`) is
  entangled with MASTERMIND's own specific visualization state (`VS.sig`,
  `VS.sigma`) — a different personal-productivity tool, not cleanly
  separable.
- **`crystalball-test-suite.html`** — a test harness for pattern-detection
  engines (`AssociationEngine`, `PredictiveEngine`, `OscillationEngine`,
  etc.) conceptually overlapping with what's already integrated. A test
  suite, not production logic to extract.
- **`alk-pipeline.html`, `spatial-fractal-map.html`,
  `spatial-scanner-cosmos.html`** — minimal logic density, visualization-
  oriented (map/cosmos/pipeline), low value for extraction.

## `spatial-v1/v2` and `Associative_Lattice` — confirmed superseded, not unexplored

These are pre-`rfr2` ancestors. `rfr2` itself files `Associative_Lattice.zip`
under its own `legacy-zips/` folder (found early in this project) — `rfr2`
is their evolution, not a separate resource sitting next to them. Nothing
further to check here; this was established, not re-investigated.

## WARP's own `dispatch/` and `plugins/` — checked, no current use case

`unifiedDispatch` (exact-cache → population-seed → cascade-generate →
axiom-gate → score-and-retain → escalate-on-failure) is real, tested (part
of WARP's own 43-test suite), and valuable — but it's built for a
"generate candidate outputs, cache them, promote the best" pattern
(AlphaEvolve-style). Nothing in Emergence currently *generates* anything —
every component deterministically detects or analyzes. Wiring this in now
would be forcing infrastructure onto a problem that doesn't exist yet,
exactly the mistake corrected earlier in this project's history (real
modules connected by invented logic). The natural point this becomes
useful: if/when `LLM_CONTRACT.js` gets a real implementation and a
component starts generating candidate text, `unifiedDispatch`'s
caching/promotion layer is the right way to wire it in — not before.

## LLM request contract — a real gap, filled honestly

Checked first: `capture/rheon-engines/ollama.js` imports `KernelEvents`
from `../schema/kernel.schema.js` — that file doesn't exist anywhere in
any upload. `rheon-idea-os`'s own 4 seam contracts (CLI, UI, LATTICE,
STORAGE) have no LLM contract either. So `contracts/LLM_CONTRACT.js` is
genuinely new content, not a port — but it follows `rheon-idea-os`'s own
real seam-contract format exactly (commands with
payload/returns/errors/idempotent/timeout_ms, events, isolation, metrics,
traceability, acceptance), and its two most important isolation rules are
carried verbatim from `ollama.js`'s own stated `§LAW` comments, not
invented: *"Local first. Cloud is never the default path"* and *"If the
LLM bridge is unavailable, an offline mirror runs. Nothing silently
fails."* Timeouts (30000ms for completion, 3000ms for availability check)
match `ollama.js`'s real constants, not arbitrary numbers.

Status is honestly `draft` — no component in Emergence calls an LLM yet.
This is the contract for if/when one does. `contracts/test/llm-contract.test.js`
validates the document's own shape (8 tests) — there's no bridge
implementation yet to test real behavior against.

## What got taken from `rheon-idea-os`, and how

Per your instruction: only what's useful, rebuilt where it had to be,
everything additive. Two real pieces came out of it:

**`server.js`** — Emergence's main loop had a CLI but no HTTP interface
(unlike `feedback-loop-buffer`, which has both). `rheon-idea-os`'s real
server architecture (HTTP route → gate/tick → broadcast to live clients →
ledger) was worth taking — but it's built on `express`, an external
dependency that would break the zero-runtime-deps discipline every other
part of this project holds. Rebuilt with Node's built-in `http` only,
same as `feedback-loop-buffer/api/server.js`. SSE (`GET /events`) is
plain HTTP with `Content-Type: text/event-stream` — no library needed
there either. Verified live: real server, real `curl` calls, a real SSE
client actually receiving a broadcast tick mid-stream, not just checked
for a 200 response. 11 tests, including the SSE test, stress-tested 5x
for timing reliability.

**`components/idea-store/`** — `IdeaStore.js`'s real API (add, list,
findById, search, link, graph, edgesFor, neighbours — same
`related|refines|contradicts|implements|spawns` edge vocabulary, same
validation) is genuinely additive: it's what makes `target: {id:
'idea:x'}` a real reference instead of an arbitrary string you have to
remember. Refactored twice, not vendored — the original is JSONL-file-
backed; first rebuilt onto Jaa's content-addressed persistence, then
rebuilt again onto real WARP dispatch: `add`/`link` are real `Gate`s
with real hard `Axiom`s (`idea:text-required`, `idea:valid-edge-type`,
`idea:from-exists`, `idea:to-exists`, the last two checking *live store
state* via closures, not a cached snapshot), registered on a real
`Stream` with a real `StreamLog`. The first version was plain async
function calls with ad-hoc `throw` statements — the one component in
this whole project that wasn't actually built on the architecture
everything else was. Fixed. `loop.ideas` exposes it; `server.js` adds
`POST /ideas`, `GET /ideas`, `POST /ideas/link`, `GET /ideas/graph`.
Verified end-to-end through the real HTTP server: register an idea,
search for it, use its real id as a real tick target, watch it converge.
12 tests, including proof that a rejected mutation never corrupts state.

**Left alone:** `rheon-idea-os`'s core (Event/Gate/Stream/StreamLog) —
redundant with WARP. Its `ProjectStore` (git/file management) — out of
scope for what Emergence does. Its own CLI — Emergence already has one.

## Made consistent with Emergence's own architecture

You asked to keep going and make everything built for Emergence's actual
architecture. Audited every component against it — two real gaps found
and closed, not just described differently:

**`idea-store` wasn't a WARP Gate.** Every other component
(`rfr2-observer`, `cfr-creator`, `associative-lattice`, `causal-graph`,
`event-ledger`) is a real `Gate` on a real `Stream`. `idea-store` was
plain async function calls with ad-hoc `throw` statements — the one
component inconsistent with the rest of the project's actual
architecture, not just its description. Rebuilt: `add`/`link` are now
real `Gate`s guarded by real hard `Axiom`s (`idea:text-required`,
`idea:valid-edge-type`, `idea:from-exists`, `idea:to-exists` — the last
two check *live store state* via closures at validation time, not a
cached snapshot). Proven, not assumed: a test confirms a rejected
mutation never touches the persisted chain.

**The five core streams had no `StreamLog`.** Checked every `new
Stream(...)` call in `loop.js` — none of them passed a log, meaning the
main loop's own dispatch history (which gate claimed an event, whether
axioms passed) was invisible, contradicting AXIOMS §2.3 ("all state
observable through the bus log"). Only `feedback-loop-buffer` had one.
Added real `StreamLog`s to all five, plus `idea-store`'s. `loop.logs()`
and `GET /logs` expose it.

## A real bug, found by writing schemas, not by guessing

Building `schemas/` (real JSON Schema files checked against actual output,
not just written from memory) surfaced something serious: `loop.js`'s
`tick()` was silently dropping `health` and **all 9 real Liminal gap
signals** before they ever reached a caller — only the bare
`RelationalModule` summary (trajectory, meaning_charge, etc.) made it
through. Every component-level test for oscillatory/gaslighting/reversal/
etc. passed because they tested `rfr2-observer`'s Gate directly, never
through `tick()` itself. This means the CLI, the HTTP server, and anyone
calling `loop.tick()` had never actually shown a single gaslighting or
oscillatory detection, despite all of it being fully built and tested
underneath. Found by writing `schemas/observation.schema.json` against
what I *assumed* the shape was, then testing it against what `tick()`
*actually* returns — the drift showed up immediately.

Fixed in `loop.js` (all 9 signals + health now flatten alongside the
summary fields, not nested away, so every existing `r.observation.X`
access still works), the schema rewritten to match, a regression test
locking it in, and — because the same bug existed one layer up —
`cli.js` was also silently ignoring these fields even before the fix, so
that got fixed too. Verified through the real HTTP server as well, not
just `loop.tick()` directly.

## `schemas/` — real JSON Schema, checked against live output

6 draft-07 JSON Schema files (`target`, `observation`, `created`, `idea`,
`idea-edge`, `ledger-record`, `tick-result`) describing every real data
shape in this project. Deliberately not validated with a full JSON-Schema
library (that would be an external dependency this project doesn't take)
— instead, `schemas/test/schemas.test.js` runs the real code and checks
that every field a schema calls `required` actually exists on the real
output. That's exactly the test that caught the bug above. 8 tests.

## `contracts/LLM_CONTRACT.js` — reviewed, still accurate

Re-checked this pass: still `draft` status (nothing calls an LLM yet),
still 8/8 tests passing, nothing needed updating for the new signals —
it's an interface contract for a future integration, not tied to what
`rfr2-observer` currently detects.

## What's still sitting unused — the honest inventory

Every area that was previously "not yet opened" has now been checked.
All 9 relevant `gap/liminal` modules are wired (`code` and `music`
deliberately left out — domain-specific, not relational text). `pat`,
`ase`, `bridge-xlat`, `codec`, `forge` — checked, each left alone for a
specific real reason. `application/` and `scanners/` — fully opened, all
10 files checked, nothing additive found (see above). `spatial-v1/v2` and
`Associative_Lattice` — confirmed pre-`rfr2` ancestors, already
superseded, not unexplored. WARP's own `dispatch/`/`plugins/` — checked,
real and tested, genuinely no current use case (nothing here generates
candidate outputs yet). `resonance-v5.1-patches` — mined for real value;
`relational-physics.js` became the 10th observer signal, its two real
bugs fixed along the way.

What remains genuinely untouched, for real reasons, not just unexamined:
`capture/rheon-engines/` — a full separate real-time voice system (mic
capture, Whisper, an Ollama LLM bridge, a behavior-pattern engine, a
"personal model" that never resets) — a different-scope system that would
*feed* text into something like Emergence, not a component to fold in.
`build-tools/rheon-idea-os/`'s `ProjectStore` (git/file management) —
out of scope for what this does. `the-listener.html`'s direct cloud LLM
call — a real architectural conflict with the local-first law already in
`LLM_CONTRACT.js`, flagged for a deliberate decision. `forge`'s
self-modifying code generation — a different risk category, flagged, not
touched without explicit sign-off.

## What's genuinely proven vs. known gaps

**Proven, live, verified against real varying input:**
- `meaning_charge` and `decay_score` (from `rfr2-observer`) both respond to
  different text -- confirmed with distinct values across distinct real inputs.
- `cfr-creator`: repeated pulls toward the *same* target build real,
  measurable density over time (confirmed null -> 0.04 -> 0.12 density across
  runs); a single call or no target correctly claims nothing.
- `associative-lattice`: two similar relational states resonate at weight
  1.0 (all invariants shared); a sharp state shift drops to 0.14 (only the
  trivial invariant shared) -- verified directly, not assumed.
- `causal-graph`: dt=0.2 (close in time) -> `causal/rule`; dt=4.7 (far
  apart) -> degrades to `observational` -- both cases tested explicitly.
- `causal-graph` and `event-ledger` both commit distinct, real records per tick.

**Known gaps, stated rather than hidden:**
- `rupture_severity` in `rfr2-observer`'s output is still pinned to its
  default-derived value. Its real producer, `LatentModel`, needs multimodal
  input (face/body/voice/speech) this text-only pipeline doesn't have --
  faking it would mean inventing data, so it stays pinned.
- `cfr-creator`'s attractor position is a deterministic hash of the target's
  id, not a semantic embedding -- there's no embedding model available here.
  Convergence measures whether repeated pulls toward the same target cause
  the field to settle, which is real, just not semantic similarity.
- `physics.js`'s `field.curl` (default 0.6) is genuinely comparable to or
  larger than attractor gravity except very close to the target -- checked
  `DEFAULT_CONFIG` directly. Convergence timing is a real random-walk-until-
  capture process, not something a higher `mass` alone makes deterministic.
  Empirically: mass=3/15 ticks flaked ~1-in-6 runs; mass=15/60 ticks: 0
  failures across 15 runs. The test suite uses the latter, with the real
  cause documented in the test itself, not just a bigger number.
- `causal-graph`'s 0.5-tick causal window is a stated, tunable default, not
  a discovered constant -- whether it's the *right* window is a question for
  real data.
- `observerStream.pending` / `creatorStream.pending` (WARP's own bookkeeping)
  grow unboundedly across ticks -- fine at tested scale, needs a pruning
  strategy for a genuinely long-running process.
- `associative-lattice` and `causal-graph` are durable, fully rehydrate on
  restart, AND now use sigma-baseline snapshotting so replay cost is
  bounded. Applied this project's own real vocabulary rather than
  inventing a generic checkpoint scheme: Emerge's canonical definition
  (`emerge-language.spec`) is `sigma = divergence_from_baseline`. Every
  `snapshotInterval` commits (default 25, stated/tunable), a full-state
  BASELINE is written; restart loads it directly and replays only the real
  sigma — the chain segment since. Proven directly: 7 commits at
  `snapshotInterval=3` writes baselines at 3 and 6, `sigmaSize()` shrinks
  back to 1 instead of growing to 7, and a fresh process's next tick still
  reports the true total (nodeCount=8, edgeCount=7) — correctness held
  even though replay only touched the small sigma segment. `loop.sigma()`
  exposes current divergence size per component for inspection.

## sentiment-scorer.js -- the one piece of new (non-vendored) logic

Nothing in rfr2 actually emits `alk.verbal.analysis.sentiment` -- checked
every file in the codebase; `SpeechStateModule` and `RelationalModule` both
consume it, nothing produces it. `components/rfr2-observer/sentiment-scorer.js`
is a small, transparent, **domain-agnostic** lexicon-based scorer (negation
handling, intensifiers, rolling average) -- not tuned to any particular
subject matter. Own 8-test suite
(`components/rfr2-observer/test/sentiment-scorer.test.js`), including a test
that it scores fully generic, non-relational text correctly.

## Structure

```
warp/                           the FOUNDATION -- sibling of emergence/, not
                                 inside it. Everything below is built ON this,
                                 not around a copy of it. Full original package
                                 (core/, dispatch/, plugins/, its own 43-test
                                 suite) -- an earlier pass had only vendored
                                 core/ as an internal subfolder, which quietly
                                 dropped dispatch/, plugins/, and WARP's own
                                 tests. Fixed -- see the note at the top of
                                 this file for why that mattered.

emergence/
  vendor/rfr2/                   real, unmodified rfr2 source this project wraps
  components/
    feedback-loop-buffer/        full library + API + CLI, own README
    rfr2-observer/                wraps relational.js + sentiment-scorer.js (new)
    cfr-creator/                  wraps physics.js -- attractor/cluster based
    associative-lattice/          wraps lattice.js -- invariant/Jaccard based
    causal-graph/                 wraps causality/index.js -- dt-determined
    event-ledger/                 wraps ledger/index.js
  loop.js                        assembles all five into the running chain
  test/loop.test.js              end-to-end integration test, 15 tests
  emergence.spec                 the project itself, in Emerge
  emerge-language.spec           the base vocabulary these specs use
```
