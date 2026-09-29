spec:
  meta:
    name:     provider-economy
    version:  1.0.0
    date:     2026-09-29
    release:  "0.39.280 (base) → 0.39.281"
    uuid:     nexus-provider-economy-phasemap-v1-0000-2026-0929-jamesbrooks-001
    owner:    "lib.economy · guardian.lib.dispatcher · lib.seam.adapters.warp-cascade · lib.repo-inject · idearium.ui.settings · clear-glass.mesh.automation-engine · clear-glass.renderer.settings.eros"
    status:   "mapped; every phase open; built bottom-up, one at a time, each proven before the next"
    axioms:   "docs/AXIOMS-v3.1.md — §3.1, §3.3, §3.4, §0.3, §8.6 (reuse), §10.1 (one write authority), §10.2 (projections derived), §16.5 (delete before you add → here: add only where nothing exists), §17.5 (provenance)"
    origin: >
      James, 2026-09-29: "What if we have economy tags for each provider. With staging branches. Like id love an
      extensive configurable options for this. What about using the tokenizer and graphs to learn token constraints.
      Can we enforce have the jobs types using ErosmancerOS, and enforce the semantic randomizer. What about injecting a
      random question or something. Like I want it look as close to me typing it as possible, at least with the
      providers. I got soft signed out of ChatGPT." Asked two questions: official API providers — "Not now". Scope —
      "Economy tags + limits, Staging per economy, Learned token limits, ErosmancerOS job types, Smart economy like
      dynamically evolving and learning routing. Wha about having a huge editor for the ErosmancerOS? Only if it these
      are additive."

  # ── Scope, stated (§0.0) ─────────────────────────────────────────────────────
  excluded: >
    Not built, and said to James before mapping: making provider-chat jobs look like a person typing (human-timed
    typing forced on every provider job, a mandatory semantic randomizer, injected decoy questions). Their purpose is to
    get past ChatGPT's / Claude's automated-use detection — the likely cause of the soft sign-out — against those
    providers' terms, with James's own account as the thing at risk. What already exists is left exactly as it is (the
    optional 'reword' prompt block, off by default; guardian/lib/eros-typist.js, the fallback typist since 0.39.265);
    nothing here extends either. What this map does instead for the sign-outs: per-provider rate limits and quiet
    hours (EC0–EC2, EC6), so automated load on a browser account is bounded and visible.

  # ── What exists (read, not recalled — §8.6) ──────────────────────────────────
  exists:
    - "lib/agent-providers.js — the one provider list (copilot, ollama, guardian/userscript-<name>.js)."
    - "guardian/lib/jobs.js createJob + guardian/lib/dispatcher.js — every browser-provider job passes the dispatcher (pendingQueue, dispatch pool, completion watch, requeue); no limits, no usage ledger."
    - "lib/seam/adapters/warp-cascade.js providersFor — build routing: a chosen provider only (0.39.280 BS13); with none, RAID's pick then ollama → chatgpt → claude. Nothing learns from outcomes."
    - "lib/code-edit.js stage()/promote() + lib/repo-inject.js 'staged' (0.39.279 S1) — a change on repo-<uuid>@staging, promoted all-or-nothing. fromReply() applies agent code by the repo's inject mode only."
    - "guardian job records (prompt, response, status, attempts, timestamps), lib/agent-memory.js — the raw material for token and outcome learning; no tokenizer for prose (lib/code-intel/text.js tokenizes identifiers)."
    - "Clear Glass: the workflow editor (renderer/settings/sections/automation.js, src/automation/steps.js, executor src/mesh/automation-engine.js _browserStep) and the macro step builder (sections/macros.js, erosmancer steps); Settings → ErosmancerOS (sections/eros.js: health, connect, behaviour profile, routing level, hostile state, adaptive patterns)."
    - "ErosmancerOS REST (erosmancer/erosmancer-os/src/api/server.ts): /api/tabs, /api/nodes, /api/execute, /api/input, /api/replay/frames, /api/replay/:frameId, /api/adaptive/patterns … — no UI in Clear Glass for tabs, nodes, a command console or replay."

  invariants:
    I1: "Sovereignty of choice (BS13): an economy limit never silently swaps a provider someone chose. At a limit the job waits, stops, or goes to a fallback the PERSON configured — and says which."
    I2: "Additive only (James): nothing existing is replaced or copied. The dispatcher, cascade, inject path, editors and Eros page each gain one call or one view."
    I3: "One write authority (§10.1): lib/economy/ledger.js is the only writer of usage records; everything else reads."
    I4: "Projections are derived (§10.2): learned token limits and routing scores are computed from the ledger on read; nothing stores a score."
    I5: "Provenance (§17.5): every usage record names the job, provider, job type, tokens (estimated, and how), outcome and time; every routing choice names the scores it used."
    I6: "No evasion features (see excluded)."

  phases:
    EC0_policy_model:
      layer: foundation
      status: "DONE 2026-09-29 (0.39.281) — proof: tests/modules/test-economy.test.js EC0-*"
      depends_on: []
      files:
        - "lib/economy/policy.js"
      does: >-
        The economy's configuration and its defaults: tiers (local · free · subscription · metered); per provider {tier,
        enabled, limits {jobsPerHour, jobsPerDay, tokensPerDay, concurrent, minGapMs}, quietHours [from,to], onLimit
        (wait | stop | fallback:<provider>)}; per job type (build, chat, plan, manage, heal, wake, automation) {tiers
        allowed, prefer}; stageTiers (output from these tiers is staged, EC5); router {explore}. normalize() bounds
        every value and names what it dropped. Defaults are conservative for browser accounts. Pure.
      proof: "tests/modules/test-economy.test.js EC0-*"

    EC1_usage_ledger:
      layer: foundation
      status: "DONE 2026-09-29 (0.39.281) — proof: tests/modules/test-economy.test.js EC1-*"
      depends_on: []
      files:
        - "lib/economy/ledger.js"
      does: >-
        The one writer (I3): record({provider, jobType, jobId, tokensIn, tokensOut, ms, outcome}) appends a line to
        <data>/economy/usage-YYYY-MM-DD.jsonl (outcome: ok | failed | truncated | timeout | login | refused); window
        reads (count, tokens, last) and records(since) for the learners. Test sandbox honoured.
      proof: "tests/modules/test-economy.test.js EC1-*"

    EC2_gate:
      layer: library
      status: "DONE 2026-09-29 (0.39.281) — proof: tests/modules/test-economy.test.js EC2-*"
      depends_on: [EC0, EC1]
      files:
        - "lib/economy/gate.js"
      does: >-
        decide({provider, jobType, estTokens}, {policy, usage, now}) → allow | wait {ms, reason} | stop {reason} |
        fallback {provider, reason}. Every limit checked (disabled, tier not allowed for the job type, quiet hours,
        min gap, per hour, per day, tokens per day, concurrency). Pure.
      proof: "tests/modules/test-economy.test.js EC2-*"

    EC3_token_constraints:
      layer: library
      status: "DONE 2026-09-29 (0.39.281) — proof: tests/modules/test-economy.test.js EC3-*"
      depends_on: [EC1]
      files:
        - "lib/economy/tokens.js"
      does: >-
        estimate(text) — a prose/code token estimate (said to be an estimate: word pieces + punctuation + code
        density, no vendor tokenizer bundled). learn(records) per provider (and model) — the largest input that came back
        ok, the smallest that came back truncated/failed, p50/p95 of ok inputs, a safe limit between them, with how many
        records it rests on; series() for the graphs (input tokens vs outcome). split(text, limit) — paragraph/fence-aware
        chunks under a limit.
      proof: "tests/modules/test-economy.test.js EC3-*"

    EC4_learning_router:
      layer: library
      status: "DONE 2026-09-29 (0.39.281) — proof: tests/modules/test-economy.test.js EC4-*"
      depends_on: [EC0, EC1, EC3]
      files:
        - "lib/economy/router.js"
      does: >-
        "Smart economy". scores(records, policy) per (jobType, provider): success (Beta posterior from ok vs
        failed/truncated/timeout/login), median latency, tier cost weight, token fit (EC3). choose(jobType, candidates,
        {policy, records, rand}) — Thompson sampling over the success posterior weighted by cost and latency, with the
        policy's exploration setting; only among providers the gate allows (EC2). Used only when nobody chose a provider
        (I1). Returns the choice with the scores behind it (I5). Evolves as the ledger grows; nothing stored (I4).
      proof: "tests/modules/test-economy.test.js EC4-*"

    EC5_staging_by_economy:
      layer: library
      status: OPEN
      depends_on: [EC0]
      files:
        - "lib/repo-inject.js (fromReply: stageFor option)"
        - "lib/repo-agent.js (passes the answering provider's tier)"
      does: >-
        When the provider that wrote a reply is in the policy's stageTiers, fromReply stages its code (lib/code-edit.js
        stage(), a Versionium commit on repo-<uuid>@staging, causedBy economy:<tier>:<provider>) instead of applying it;
        promote is the existing POST code/promote. A repo in review mode is unchanged (proposals already wait).
      proof: "tests/modules/test-economy.test.js EC5-*"

    EC6_guardian_enforcement:
      layer: api
      status: OPEN
      depends_on: [EC1, EC2, EC3]
      files:
        - "guardian/lib/dispatcher.js"
        - "guardian/server.js"
      does: >-
        The dispatcher asks the gate before sending a browser-provider job: wait → the job stays queued with the reason
        and is retried when the wait ends; stop → failed with the reason; fallback → re-routed to the configured
        provider, said on the job and the bus. Every completion, failure, timeout and login wall is recorded in the
        ledger (tokens estimated by EC3). Routes: GET/POST /api/economy (policy), GET /api/economy/usage,
        GET /api/economy/limits (EC3), GET /api/economy/routing (EC4).
      proof: "tests/modules/test-economy-guardian.test.js"

    EC7_router_in_builds:
      layer: api
      status: OPEN
      depends_on: [EC4]
      files:
        - "lib/seam/adapters/warp-cascade.js"
      does: >-
        providersFor with no chosen provider: the learning router's order (allowed providers only) instead of the fixed
        chain, when the economy has at least a minimum of records; otherwise the chain as before (said in the record).
      proof: "tests/modules/test-warp-cascade-provider-fallback.js unchanged + EC7 cases"

    EC8_economy_console:
      layer: ui
      status: OPEN
      depends_on: [EC6]
      files:
        - "idearium/ui/settings.html (Economy page)"
        - "idearium/api/index.js (proxy to guardian /api/economy*)"
      does: >-
        The settings console gains an Economy page: every provider's tier, limits, quiet hours and on-limit action; job
        types and their allowed tiers; stage tiers; router exploration — all editable, saved to guardian. Live usage
        against each limit, the learned token limits as graphs (input tokens by outcome), and the router's scores.
      proof: "tests/probe/economy-console-chromium.js"

    EC9_input_path_in_editors:
      layer: ui
      status: OPEN
      depends_on: []
      files:
        - "clear-glass/src/automation/steps.js"
        - "clear-glass/src/mesh/automation-engine.js"
      does: >-
        "Job types using ErosmancerOS", additively: a browser step's click / type / hover can take input path
        'erosmancer' (the real input path, POST /api/input through Clear Glass's wire) instead of in-page events — for
        pages that ignore synthetic events. Default unchanged (page). Said in the step's result which path ran.
      proof: "tests/modules/test-economy.test.js EC9-* (executor with a fake wire)"

    EC10_eros_workbench:
      layer: ui
      status: OPEN
      depends_on: []
      files:
        - "clear-glass/renderer/settings/sections/eros.js"
      does: >-
        "A huge editor for ErosmancerOS", additively: the ErosmancerOS page gains the views it lacks — its tabs (attach
        / detach), the node registry (search, inspect), a command console (one /api/execute against a tab, the result
        shown), replay frames (list, replay one) — over the existing /eros/* proxy. Behaviour-profile and hostile
        settings stay as they are; nothing new tunes detection avoidance (I6).
      proof: "tests/modules/test-eros-workbench.test.js (section renders against a fake wire)"

    EC11_release:
      layer: automation
      status: OPEN
      depends_on: [EC5, EC6, EC7, EC8, EC9, EC10]
      files:
        - "lib/version.js"
        - "CHANGELOG-0.39.281.md"
      does: "Versions, atlases, specs, loom map, registry, tests registered, regression against 0.39.280."
      proof: "the full suite against 0.39.280"
