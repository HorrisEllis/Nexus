# Agents and accounts — made in the spec workshop (idearium)
# Written 2026-10-10 from docs/2026-10-10-idearium-solid-phasemap.spec SD4 SD5 SD8 · docs/2026-10-10-idearium-access-phasemap.spec
# IA5 · and James's "we need to get deepseek userscript, and gemini". To be opened in the workshop (nexus/guardian →
# guardian/spec) and built through Idearium. Decisions as choices [A] [B] [C] [custom], recommendation marked; "chosen:" open.
spec:
  name: Agents and accounts
  ambition: 2 — creative
  source: "maps: idearium-solid SD4 SD5 SD8 · idearium-access IA5 · his 2026-10-10 request for the DeepSeek and Gemini userscripts"
  owner: guardian (agents, userscripts, dispatch, economy guard) · clear-glass (sign-ins per account, the tabs) · core (lib/account-registry.js, lib/economy)
  status: specced 2026-10-10, not built
  james: >-
    "what about .hat files. and .agent files in guardian for each model?" · "need account fallback for fallback routing and
    token limits" · "then we could accounts per hat/repo?" · "we need to get deepseek userscript, and gemini"
sections:
  - id: purpose
    title: Purpose
    body: |
      Every model Nexus drives is one agent in guardian, with its accounts, and every agent works as well as ChatGPT and
      Claude do today. When an account hits its limit, the job moves to the next account before it moves to another agent.
      A repo or a hat can say which accounts its agents use.

      Evidence today (2026-10-10):
        userscript   lines   version   — ChatGPT 3,164 v10.12.1 · Claude 3,305 v10.12.1 · DeepSeek 1,288 v10.10.1 ·
                                          Gemini 1,256 v10.10.1 · Perplexity 1,246 v10.9.1
        All five send "accepted" and complete jobs; the three smaller ones lack what 10.11–10.12 added to ChatGPT/Claude
        (to be listed exactly by the parity diff, step 1). None of the three has been run live in this work.
        A model's self is spread over five places (provider node, selector map, .agent_model hypotheses, economy policy,
        account registry). The economy counts per provider; accounts are per provider; nothing joins them.

  - id: primitives
    title: Primitives
    body: |
      agent        (thing)    guardian/data/nodes/agent/<model>.agent — references (not copies) to its provider node, selector
                              map, limits, accounts, health, what it has learned. invariant: one per model; guardian owns it
      account      (thing)    a slot of lib/account-registry.js {provider, label, accountId} whose sign-in Clear Glass holds
                              (login-portal partition persist:mesh-<provider>-<accountId>). invariant: no password in guardian
      binding      (rule)     repo or hat → ordered accounts per provider. invariant: Idearium stores the binding only
      usage        (thing)    economy rows per account (today per provider). invariant: limits learned per account
      userscript   (thing)    the per-provider script; one shared core + a per-site adapter (selectors, send, read reply)
      parity check (rule)     a provider script passes the guardian stack simulation (test-guardian-stack-sim) and one live job

  - id: axioms
    title: Axioms
    body: |
      AX1  Guardian is the source of truth for agents (dispatch-ladder.js already says so); Idearium never holds an agent's self.
      AX2  Clear Glass owns sign-ins (his 2026-09-23 call). Guardian and Idearium hold references only.
      AX3  A job moves account before it moves agent, and every move is said (HP21's hold message pattern).
      AX4  An agent is "working" only after a live job through its tab — the simulation proves the protocol, not the site.
      AX5  Nothing makes automated jobs look human (the economy page's "not included, on purpose").

  - id: schema
    title: Schema
    body: |
      guardian/data/nodes/agent/<model>.agent    { model, provider, accounts[], selectors, limits, health, learned }
      lib/economy/ledger.js rows                  + accountId
      idearium repo settings                      + accounts: { <provider>: [accountId, …] }  (and the same on a hat)
      guardian/userscripts/core.js (new)          the shared NCP core every provider script includes at build time

      choices — how the three smaller userscripts reach parity:
        [A] port the 10.11–10.12 changes into each, from a diff against ChatGPT's  ← recommended (smallest change, ships soonest)
        [B] one shared core + thin per-site adapters, built into each script — no more drift, a bigger change
        [C] B, but only after A ships (parity now, the refactor next)
        [custom] ____
      chosen: open

  - id: api
    title: API
    body: |
      GET  /api/agents                       → each .agent with its accounts and health (guardian)
      GET  /api/agents/:model                → one
      POST /api/repos/:uuid/accounts         { provider, order: [accountId…] } (Idearium; binding only)
      Commands: idearium agents · agent <model> · repo accounts <repo> <provider> <accountId…>
      Userscripts: unchanged NCP; versions bumped with parity

  - id: integration
    title: Integration
    body: |
      - dispatch: pick the binding's first account whose tab is open and under its learned limit; at the limit, the next account (said); all held → next agent
      - economy: usage and learned limits keyed by account; the settings console shows them per account
      - Clear Glass: login-portal makes the account's partition; agent-mesh spawns a tab per account
      - SD8: an agent can screenshot and re-pick a provider tab's reply selector through the field (FN1 commands exist now)
      - the torture chamber: provider canaries (one tiny job per provider per day) as a station

      choices — when a repo has no binding:
        [A] the provider's accounts in the order they were added  ← recommended (today's behaviour, now per account)
        [B] the account with the most headroom right now
        [C] ask the person the first time, remember the answer
        [custom] ____
      chosen: open

  - id: failure_modes
    title: Failure modes
    body: |
      F1  A selector drifts on one site (Gemini, DeepSeek change their DOM often). → canaries + SD8 re-pick; the job says which gate failed.
      F2  Two accounts in one browser session cross-sign. → one partition per account (already the mesh's design); verified live.
      F3  Limits per account unknown at first. → start from the provider's learned limit; learn per account from real stops.
      F4  A provider's terms on automated use. → AX5; quiet hours and limits stay.

  - id: build_order
    title: Build order
    body: |
      1  P1  parity diff: list exactly what DeepSeek, Gemini and Perplexity lack versus ChatGPT 10.12.1
      2  P2  port it (choice above); each passes test-guardian-stack-sim with MODE=smart for its provider
      3  P3  one live job per provider in Clear Glass (needs him: the tab open and signed in)
      4  SD4 .agent per model in guardian
      5  SD5 usage and limits per account; fallback account → account → agent
      6  IA5 bindings per repo and hat
      7  SD8 an agent re-picks a drifted selector through the field

  - id: tests
    title: Tests
    body: |
      T1  each provider script passes the stack simulation's lifecycle (accepted → delivered → chunk → complete; error gates named)
      T2  the parity diff list is empty after P2 (a test reads the feature markers in each script)
      T3  account A at its cap → the job lands on account B's tab, said; both held → the next agent, said
      T4  a repo bound to [B, A] uses B first
      T5  live: one job each through DeepSeek and Gemini in Clear Glass, reply read (his machine)

  - id: registry
    title: Registry
    body: |
      guardian.agent-nodes (guardian/lib/agent-nodes.js) · guardian.account-dispatch (in dispatch-ladder) · core.economy (per account)
      · the userscripts (guardian/userscript-*.js, versions in lib/version.js userscripts) — wired into loom with consumers.
