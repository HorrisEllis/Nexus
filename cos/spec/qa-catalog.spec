# Test, attack and QA catalog — a spec (idearium workshop form)
spec:
  name: Test, attack and QA catalog
  owner: cos (the torture chamber's stations, cos/spec/torture-chamber.spec) · every system it tests
  status: converted 2026-10-10 from Markdown (no .md files) — content unchanged
  james: find all useful tests, debugging, hostile attacking, red teaming, and qa, qc, and anything else for nexus
sections:
  - id: purpose
    title: Purpose
    body: |
      James, 2026-10-10: "what if you look at all coding languages, all technical domains, strategy domains, linguistics, systems thinking, meta cognition, strategy, everything else relevant, future past, online everywhere, cross domain, recursively, fractally, objectively, and find all useful tests, debugging, hostile attacking, red teaming, and qa, qc, and anything else for nexus and stand by."

      Every method below is named for what it would find **in Nexus**, with where it applies and whether Nexus has it. "Have" means a test in the tree does it today; "partial" means some of it; "none" means nothing does. Built from the tree on 2026-10-10 (0.56.0), not from memory of it.
  - id: where_nexus_stands
    title: Where Nexus stands
    body: |
      - **Test files:** 552 in `tests/modules`, 30 in `tests/`, 26 Clear Glass probes in `tests/probe`, 73 elsewhere (loom, cos, emerge…).
      - **The runner:** `tests/modules/run-all.js` runs 489 of them. Last full run: **5,605 checks passing, 45 failing** (30 known gaps in `tests/known-gaps.yaml`, the rest failing on the base commit too or passing alone).
      - **Kinds that exist:** example-based unit and integration tests, live-wired module tests, Clear Glass page probes, some concurrency and race checks (93 files mention it), replay (29), invariants (32), hostile and adversarial cases (43).
      - **Kinds that don't:**
        - property-based testing (0);
        - fuzzing (0);
        - mutation testing (0 — the 27 hits for "mutation" are DOM mutations);
        - load and soak testing (0);
        - accessibility (1);
        - visual regression (0);
        - code coverage (no tool);
        - continuous integration (no `.github/workflows`).
  - id: found_while_writing_this_verified_high_severity
    title: Found while writing this — verified, high severity
    body: |
      **Cross-origin control of guardian from any website.** Guardian answers every request with `Access-Control-Allow-Origin: *` and parses a `text/plain` body as JSON. A `text/plain` POST is a "simple" request, so the browser sends it with no preflight.

      Proven live on this tree. A request carrying `Origin: https://evil.example` and `Content-Type: text/plain`:
      - to `POST /api/copilot/prompt` was processed. With a tab connected, it would have dispatched to his ChatGPT or Claude account, and the page could read the reply;
      - to `POST /cli/exec` returned 200.

      Any page open in any browser on his machine can do this.

      **Fix (small):**
      - refuse a request whose `Origin` is not Nexus's own (localhost UIs, Clear Glass, the userscripts' provider hosts);
      - require `Content-Type: application/json` on writes, which forces a preflight;
      - drop `*`;
      - give `/cli/exec` a local token.

      **Same class, not yet verified:** Idearium (`:4800`, "auth — disabled (internal-only)") sends no `Access-Control-Allow-Origin` header, so a page can't read its answers. But it may still execute a simple POST (a CSRF). The same check applies to every service on localhost.
  - id: 1_correctness_of_code
    title: 1. Correctness of code
    body: |
      | Method | What it would find in Nexus | Where | Status |
      |---|---|---|---|
      | Property-based testing (QuickCheck, Hypothesis, fast-check) | Invariants over generated inputs: the phasemap parser and spec-document round-trip any text (CRLF, BOM, unicode); versionium's full copy plus deltas rebuilds every version; `classify()` never maps a "no tab" sentence to login (HP22 was found by hand) | `loom/scanners/phasemap-map.js`, `lib/spec-document.js`, `versionium/lib/files.js`, `lib/pipeline-routing.js` | none |
      | Model-based or state-machine testing | Random event sequences against the job lifecycle. Invariants: a typed prompt is never sent twice, terminal stays terminal, a cancelled job is never sent. HP14–HP16 were found by simulation; this finds the next ones by itself | `guardian/lib/dispatcher.js`, `gate-trail.js`, `job-retry.js`, `ask.js` | partial (fixed sequences) |
      | Exhaustive model checking (TLA+, or a small JS state explorer) | Every interleaving of retry, timeout, disconnect, cancel and economy hold, for one job and two tabs | the guardian lifecycle | none |
      | Differential testing | Two implementations of one thing disagreeing: CFR sigma vs RFR2 sigma, CFR delta vs RFR2 delta, the three branch mechanisms (SN0), loom's wires vs Idearium's computed code graph | `intelligence/cfr`, `intelligence/rfr2`, `cos/playground`, `cos/workspace`, `loom` | none |
      | Metamorphic testing | Relations that must hold when the input changes: a reworded prompt keeps the same route class; chunk(A+B) ⊇ chunk(A) ∪ chunk(B); renaming a spec block keeps its dependents' staleness | `copilot/lib/reword.js`, `lib/chunker`, `lib/spec-document.js` | none |
      | Fuzzing (coverage-guided or grammar-based) | Malformed input that crashes or hangs a parser: NCP messages, HTTP bodies (`readRawBody` reset the socket — found this week by hand), YAML specs, `.nex` files, zip imports | `guardian/lib/ncp-handler.js`, `versionium/lib/http-utils.js`, `rfr2/version-gate`, `lib/zip-ingest.js` | none |
      | Mutation testing (Stryker, PIT) | Tests that would still pass with the code broken — the test of the tests. A homemade version: flip one operator or condition in a module, run its tests, report survivors | every module with tests | none |
      | Golden / approval tests | Unreviewed changes to generated artefacts: the system template, atlases, the-path, CHANGELOG shape | `idearium/spec-engine/templates`, `lib/atlas-generate.js` | partial |
      | Static analysis | Type errors (`tsc --checkJs` with JSDoc, no rewrite needed), unused exports, dead code, unreachable branches | the whole tree | none |
      | Architecture fitness functions | The axioms as executable rules. AX-010: no cross-system `require()` into another system's data. SYSTEM_OWNS_ITS_OWN, THE_STACK: every system has a contract, a registry, an event taxonomy. File-size budgets (`idearium/api/index.js` is 8,100 lines) | `docs/architecture-spec`, the AXIOMS | partial (loom scanners) |
      | Dependency-cycle and layering checks | require/import cycles; a library that reaches into a service | the computed code graph | none |
  - id: 2_systems_distributed_and_runtime
    title: 2. Systems, distributed and runtime
    body: |
      | Method | What it would find in Nexus | Status |
      |---|---|---|
      | Deterministic simulation testing (FoundationDB, TigerBeetle) | The strongest single method for Nexus. Run guardian, copilot and Idearium in one process on a seeded scheduler with fake time and the fake tab, then replay any failure exactly. RFR2's logical clock and the Ollama tape are the foundations | partial (`tests/sim/fake-tab.js` runs the real stack, not seeded) |
      | Chaos engineering | Kill guardian, copilot, versionium or a tab mid-job. Does the job end with a reason, and is anything sent twice or lost? | partial (by hand this week) |
      | Fault injection | Latency, ECONNRESET, partial writes, a full disk, a slow Ollama, a 413. Each must come back as a sentence, never a hang | partial |
      | Jepsen-style consistency | Under crashes and partitions: does the ledger agree with the data folder (sovereign-node P22)? Does versionium's commit agree with its file record? Do node indexes agree with node files? | none |
      | Crash consistency | Power loss mid-write: JAA tables, `checkpoints.json`, job files, the economy ledger | none |
      | Idempotency | The same request twice: commit, stage, restore, cancel, record | partial |
      | Load, soak and leak testing | 24 hours of jobs: memory (ring buffers, ledgers, timers not unref'd), file growth, the economy ledger's size | none |
      | Clock tests | Wall-clock jumps and timezone changes against logical time; gap windows and economy limits across midnight | none |
      | Backpressure | 100 background chunks plus a person's message (SD3); queue depth bounds | partial |
  - id: 3_models_and_agents
    title: 3. Models and agents
    body: |
      | Method | What it would find in Nexus | Status |
      |---|---|---|
      | Eval suites per job kind | Golden tasks (chat, build chunk, spec block, review) scored per agent and model size; the learned order checked against them | none |
      | Model-size sweep | "Working for any size model llm": the same tasks at 0.6B, 1.5B, 3B, 7B and browser agents; where each breaks and why | none |
      | Provider canaries | One tiny job per provider a day. Selector drift on claude.ai is detected before he hits it (HP11 was a page change) | none |
      | Hallucination checks | An answer citing a file, symbol or route that doesn't exist, checked against the repo index and the contracts | none |
      | Tool-use correctness | Tool calls with wrong arguments, out-of-scope tools, the repeated-error cap (CT6) | partial |
      | Calibration (Brier score, reliability curves) | Does the adversarial gate's confidence (SD10) mean anything? A 0.8 should be right about 80% of the time | none |
      | Inter-rater agreement (Cohen's kappa) | Two adversaries judging the same output: if they disagree at chance level, the gate is noise | none |
      | Prompt regression | A change to a prompt block re-runs the eval suite before it's kept | none |
      | Determinism and replay | Seeded Ollama runs from the tape reproduce exactly | partial (tape + replay env) |
      | Cost and token budgets | A job's tokens against its economy limit; denial of wallet | partial (economy) |
  - id: 4_security_and_red_teaming
    title: 4. Security and red teaming
    body: |
      | Attack | Where in Nexus | Status |
      |---|---|---|
      | **Cross-origin / CSRF against localhost services** | guardian (verified above), Idearium, copilot, cortex, versionium; any page can POST to 127.0.0.1 | found today |
      | Indirect prompt injection | Instructions hidden in a repo file, a web page, a chat transcript, a spec block or an import, read by an agent with write tools | none |
      | Tool-scope escalation | An agent reaching a tool outside its hat's scope, or `nexus.command` used to reach a write the scope forbids | partial |
      | Path traversal | Repo file tools, versionium restore paths, desktop share, archive import (`zip-ingest` guards `..`) | partial |
      | SSRF | Agents or tools fetching URLs and reaching 127.0.0.1 services from inside | none |
      | Command and argument injection | `/cli/exec` command strings built from text (agent-suite builds `--prompt "${...}"`), cos/qemu argument building | none |
      | Secrets in logs and ledgers | Tokens, cookies or account details written to event_log, chat_log, the Ollama tape or job files | none |
      | Supply chain | noVNC loaded from jsDelivr at runtime with no integrity hash; npm dependencies | none |
      | Denial of service | Large bodies (now 413), ReDoS in classification regexes, YAML anchor bombs, a flood of jobs | partial |
      | VM boundary | What the desktop VM can reach on the host (9p share, network before the cut, QMP) | partial (testenv cuts the NIC) |
      | Userscript trust | `GM_xmlhttpRequest` to localhost from provider pages; a provider page's own script talking to guardian | none |

      **Red-team method:** a standing adversary role. An agent with the attacker's goal ("send a prompt from a web page", "make an agent delete a file it shouldn't") runs against the stack in the sandbox each release. Every success becomes a regression test.
  - id: 5_interface_qa_clear_glass_never_playwright
    title: 5. Interface QA (Clear Glass, never Playwright)
    body: |
      | Method | What it would find | Status |
      |---|---|---|
      | Page probes | Real page, real API, real versionium (21 checks in `idearium-one-surface-glass.js`) | have (26 probes) |
      | Visual regression | Screenshot diffs per release (the Plan with 1,000 rows, the vanished work surface) | none |
      | Accessibility | Keyboard-only use, focus order, contrast, labels | none (1 file) |
      | Cognitive-load budget | "this is getting ovoerwhelming": a count of distinct items and actions per screen, held to a budget | none |
      | Heuristic review (Nielsen's ten) | System status visible, errors that say how to recover, recognition over recall | none |
      | Responsive and zoom | Narrow windows, 200% zoom, the repo box with long names | none |
  - id: 6_data_and_knowledge
    title: 6. Data and knowledge
    body: |
      | Method | What it would find | Status |
      |---|---|---|
      | Schema validation of every node | Every `<system>/data/nodes/<type>/*` against its schema | partial (node-schemas) |
      | Referential integrity | Ledger vs data folder (P22), node index vs node files, catalog vs stores (DS1) | none |
      | Migration tests | Each system moving home (DS2): the warning shim reads zero over a full run | none |
      | Backup and restore drills | Restore a snapshot into a compartment (SN1) and check it against the original | partial (restore verifies against disk) |
      | Provenance completeness | Every generated thing names its sources (SD7, SD12) | none |
      | Retention and compaction | Ledgers bounded; compaction keeps what history must keep | partial (table compactor) |
  - id: 7_systems_thinking_strategy_linguistics_metacognit
    title: 7. Systems thinking, strategy, linguistics, metacognition — as tests
    body: |
      | Method | Applied to Nexus | Status |
      |---|---|---|
      | Pre-mortem (Klein) | Before each release: "it's a month from now and this failed — why?" Written down, each answer a test | none |
      | FMEA (failure mode and effects analysis) | Each component: how it fails, the effect, how it's detected, severity × likelihood × detectability. Cortex already has `failure_mode` nodes to hold it | partial |
      | STPA (systems-theoretic process analysis) | The control loops: routing → dispatch → outcome → learned order; retry → backoff; economy → gap. Unsafe control actions are the failures we hit (retrying a typed prompt, a breaker opened by a wrong class) | none |
      | HAZOP guidewords | Each interaction × {no, more, less, reverse, early, late, other than}. "Late reply" → HP15. "More retries" → HP14. "Other than" (wrong gate) → HP13 | none |
      | Feedback-loop audit (Meadows) | Reinforcing loops that run away (retries, background builds) and balancing loops that should stop them (breakers, budgets); delays (timeouts) as stocks and flows | none |
      | Cynefin | Which domain a failure is in (clear, complicated, complex, chaotic). Maps onto the CFR regimes stable, resonant, turbulent, chaotic (CB1) | none |
      | Goodhart checks | A metric that becomes a target stops measuring: learned-order scores, sigma, deviation %, test counts | none |
      | Chesterton's fence | Before archiving: why it was built, who uses it (the declutter did this by hand) | partial |
      | Five whys / causal trace | Every failure to its root; the CFR trace (AW0) makes it a query | partial |
      | Double-loop learning (Argyris) | Does Nexus change its rules (the learned order, the gate's bar), not only its actions? Test that a run of failures changes a policy, said | none |
      | Linguistic ambiguity check | One word, two meanings ("delta": versionium's file delta vs RFR2's kinematic delta; "snapshot"; "compartment"); one meaning, two words. A controlled vocabulary for the five kinds and five verbs (SD12) | none |
      | Plain-language check | Every user-facing error has the who, the where and the fix, in his voice; no jargon without a gloss | partial (HP12–HP22) |
      | Mechanism design | Can an agent game the gate or the learned order (always high confidence, short safe answers)? Incentives tested like an attacker would | none |
  - id: 8_process_and_quality_control
    title: 8. Process and quality control
    body: |
      | Method | What it would find | Status |
      |---|---|---|
      | Continuous integration | The full suite on every push — today it runs only when someone runs it | none |
      | Flake tracking | The same test failing then passing (workshop-full and repo-expand under load this week). Measured, never quarantined | none |
      | Coverage (c8, built into Node) | Code no test reaches, per system | none |
      | Known-gaps ratchet | New failures fail the run; fixed gaps must be retired | have |
      | Spec ↔ code drift | Declared vs served routes (loom: 114), phases marked open but built (VM1, found today) | partial |
      | Bisect automation | The commit that broke a test, found automatically | none |
      | Release checklist as a test | Version bumped, changelog in his voice, loom regenerated, data not committed | partial |
  - id: recommended_order_highest_leverage_first
    title: Recommended order — highest leverage first
    body: |
      1. **The localhost security floor.** Check `Origin`, require JSON on writes, no `*`, a token on `/cli/exec`, for every service. Verified exposure; a small fix.
      2. **Continuous integration.** Every push runs the suite, so nothing depends on someone remembering.
      3. **Deterministic simulation of the stack.** The fake tab plus a seeded scheduler, fake time and replay. It would have found all ten of this week's guardian bugs on its own.
      4. **Model-based testing of the job lifecycle,** with property-based tests on the parsers. These find the bugs nobody wrote a case for.
      5. **Provider canaries and the model-size eval sweep.** "Any size model": measured daily, not assumed.
      6. **Mutation testing,** to find out how much the 5,605 checks actually protect.
      7. **Calibration of the adversarial gate (SD10),** before anything trusts its confidence.
      8. **STPA and HAZOP over the control loops,** once. It's cheap, and it names the next failures before they happen.
