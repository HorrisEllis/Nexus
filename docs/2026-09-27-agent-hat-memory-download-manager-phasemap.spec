spec:
  meta:
    name:     agent-hat-memory-download-manager
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.267 · 0.39.268 · 0.39.269
    uuid:     nexus-agent-hat-memory-phasemap-v1-0000-2026-0927-jamesbrooks-001
    owner:    copilot.adversarial · copilot.intuition · copilot.lib.activity-recall · lib.agent-providers ·
              lib.agent-memory · idearium.agent-suite · idearium.api · guardian.userscripts · guardian.lib.jobs ·
              ollama.lib.dispatch · lib.vector-memory · lib.extract-code · lib.seam.queue · loom.maps.agent-memory
    status:   built (0.39.267–269) — every phase below; open items in open_items
    origin: >
      James, 2026-09-27, with a 26-minute boot log and the 0.39.266 tree: "i have no idea what ollama is doing." ·
      "what is ollama doing?" · "look at copilot" · "i want to be able to talk to copilot and ask what its been up
      to. agents tab in idearium is meant to build chunks, entire code bases. the agent hat is meant to be agnostic,
      ollama/guardian/copilot." Then, with screenshots of a "music maker" spec whose files were all 0 b, ChatGPT's
      A/B chooser and Chat Glass's captured reply: "ollama is supposed to have persistent memory, same with the agents
      using the models ... everything is supposed to persist with agents. using the download manager. nexus is meant
      to be able to build nexus from scratch ... guardian isn't capturing the code from chatgpt." · "look at
      clearglass download manager" · "you patch it. make sure you follow the axioms".

  # ── Drift, stated (§12.5, §0.0) ───────────────────────────────────────────
  drift: >
    Phases O1–O3, H1–H6, G1–G5 and M1–M5 were written BEFORE this map existed, delivered as 0.39.267/268/269 diffs.
    The axiom reminder ("make sure you follow the axioms") came after. They are recorded here as built-before-mapped,
    not back-dated. X1 (this map, the loom map, spec addenda, SPEC-REGISTRY, version, run-all) is the axioms pass and
    was done after. docs/CLAUDE.md rule 1 was not followed for O–M; rule 3 (registry with wires) was missed until X1.

  # ── What exists (read, not recalled — §8.6) ───────────────────────────────
  exists:
    - >-
      copilot/adversarial.js — self-test every 60 s: 5 hostile prompts through pingBoth (intuition + Ollama analysis)
      plus one status cross-check = 6 Ollama generations per run.
    - >-
      lib/ollama-activity.js (0.39.266) — every Ollama call logged (data/ollama/activity.jsonl); nothing read it back.
    - >-
      clear-glass/src/downloads/ — the download manager: store.js (JAA cg_downloads list; Guardian replies filed by
      asking agent via guardian/lib/response-sink.js → POST :7702/cli/downloads, pending queue when closed) and
      artifact-chat-index.js (COS compartment; raw .response files = source of truth, JAA index over them).
    - >-
      lib/chat-logger.js — chat_log + JSONL, semantic re-injection via lib/vector-memory.js when it runs.
    - >-
      lib/repo-agent.js + lib/repo-hat.js — the Agent tab wears the repo hat on ollama / copilot / a guardian agent.
    - >-
      idearium/spec-engine → warp-build-dispatch → idearium/agent-suite buildChunkWithAgent — chunk builds.
    - >-
      lib/agent-intent-contract.js — RAID acknowledge() gate, agent-centric.
    - >-
      lib/registry-harness.js + loom registry (0.39.266).
  missing:
    - >-
      M1 Ollama's work was invisible and wasteful: 100% of 162 calls in the log were the self-test; the model never idled
      long enough to unload.
    - >-
      M2 intuition crashed on "what is X / find X" (ROUTE_RE group 3) and on every blueprint answer (_getBP undefined).
    - >-
      M3 vector-memory's health check POSTed /api/tags (GET-only) → ollama:✗ every boot, TF-IDF forever.
    - >-
      M4 copilot could not say what it had been doing.
    - >-
      M5 chunk builds wore no hat, had no copilot option, used the 7b fallback; four provider lists disagreed;
      WARP dropped perplexity/copilot.
    - >-
      M6 RAID's intent check asked "does ANY hat naming this agent allow it", not "does the worn hat".
    - >-
      M7 guardian read replies with innerText: rendered code blocks lost their ``` fences → "no fenced code block
      found" → every code chunk failed → 0 b files. A code-less reply was retried as "connection interrupted".
    - >-
      M8 ChatGPT's A/B chooser left an injected job unsent in the composer.
    - >-
      M9 only Guardian wrote to the download manager; nothing read it back as agent context.
    - >-
      M10 new components not in loom; lib/extract-code had no export hook; copilot/server no import hook.

  invariants:
    I1: >-
      memory is never generated — every recalled line names a recorded exchange or a real file (§1.1).
    I2: >-
      one write authority per record (§10.1): Guardian records Guardian's replies; lib/agent-memory.js records
        everything else through the SAME response-sink + chat index, never a parallel store.
    I3: >-
      memory never blocks an answer: a failed recall or record is reported and the call proceeds (§1.2).
    I4: >-
      WARP's cache key is the chunk's contract alone — hat and memory travel beside the prompt, not in it.
    I5: >-
      an unreachable copilot resolves to nothing sent, never to a silent default (§1.2).
    I6: >-
      an agentId on a guardian job files the reply; it must not change tab routing or pre-checks.

  phases:
    - id: O1
      name: self-test — 1 Ollama call per run, every 10 min, reset in finally
      status: built-before-mapped (0.39.267)
      files: [copilot/adversarial.js]
      closes: [M1]
    - id: O2
      name: intuition — ROUTE_RE group 3, _getBP lazy loader
      status: built-before-mapped (0.39.267)
      files: [copilot/intuition.js]
      closes: [M2]
    - id: O3
      name: vector-memory health check GET /api/tags + embed model check
      status: built-before-mapped (0.39.267)
      files: [lib/vector-memory.js]
      closes: [M3]
    - id: H1
      name: activity recall — intuition intent + GET /api/activity
      status: built-before-mapped (0.39.267)
      files: [copilot/lib/activity-recall.js, copilot/intuition.js, copilot/server.js]
      closes: [M4]
    - id: H2
      name: one provider list
      status: built-before-mapped (0.39.267)
      files: [lib/agent-providers.js, lib/repo-agent.js, lib/seam/adapters/warp-cascade.js, idearium/ui/js/app.js]
      closes: [M5]
    - id: H3
      name: builds wear the hat (repo hat, else the_builder) on the repo's switch; copilot resolves first
      status: built-before-mapped (0.39.267)
      files: [idearium/agent-suite/index.js, idearium/api/index.js, idearium/spec-engine/warp-build-dispatch.js,
              idearium/spec-engine/index.js]
      closes: [M5]
    - id: H4
      name: RAID reads the worn hat
      status: built-before-mapped (0.39.267)
      files: [lib/agent-intent-contract.js, cortex/core/raid/contract-intake.js]
      closes: [M6]
    - id: G1
      name: _replyText — fences put back in all five userscripts
      status: built-before-mapped (0.39.268)
      files: [guardian/userscript-chatgpt.js, -claude, -gemini, -deepseek, -perplexity]
      closes: [M7]
    - id: G2
      name: extractCode accepts the rendered-label form
      status: built-before-mapped (0.39.268)
      files: [lib/extract-code.js]
      closes: [M7]
    - id: G3
      name: A/B chooser wait
      status: built-before-mapped (0.39.268)
      files: [guardian/userscript-chatgpt.js]
      closes: [M8]
    - id: G4
      name: honest retry wording for a code-less reply
      status: built-before-mapped (0.39.268)
      files: [lib/seam/queue.js]
      closes: [M7]
    - id: G5
      name: builds use DEFAULT_MODEL; no Eravos mods in New Spec
      status: built-before-mapped (0.39.268)
      files: [idearium/agent-suite/index.js, idearium/api/index.js, idearium/ui/js/app.js]
      closes: [M5]
    - id: M1
      name: lib/agent-memory.js — record() through response-sink + chat index + chat-logger; recall()
      status: built-before-mapped (0.39.269)
      files: [lib/agent-memory.js]
      closes: [M9]
    - id: M2
      name: the ollama bridge records every real job
      status: built-before-mapped (0.39.269)
      files: [ollama/routes/jobs.js, ollama/lib/dispatch.js]
      closes: [M9]
    - id: M3
      name: copilot recalls and files (memoryAgent, not agentId — I6)
      status: built-before-mapped (0.39.269)
      files: [copilot/lifeline.js, copilot/analysis.js, copilot/server.js]
      closes: [M9]
    - id: M4
      name: the Agent tab's 'memory' block; every backend sends agentId + compartmentId
      status: built-before-mapped (0.39.269)
      files: [lib/repo-agent.js, lib/repo-prompt-blocks.js]
      closes: [M9]
    - id: M5
      name: chunk builds recall (siblings = finished files); guardian gets agentId, hatInPrompt, fileName
      status: built-before-mapped (0.39.269)
      files: [idearium/api/index.js, idearium/agent-suite/index.js, idearium/spec-engine/warp-build-dispatch.js,
              guardian/lib/jobs.js, guardian/server.js]
      closes: [M9]
    - id: X1
      name: axioms pass — this map; loom/maps/agent-memory-map.js (+ extract-code export, copilot/server import);
            UUID headers; addenda (copilot, idearium, guardian, ollama, clear-glass, loom, cortex specs);
            SPEC-REGISTRY; lib/version.js 0.39.269; run-all; one nexus.zip without data/**
      status: built
      files: [docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec, loom/maps/agent-memory-map.js,
              loom/bootstrap.js, docs/SPEC-REGISTRY.spec, lib/version.js, package.json, tests/modules/run-all.js]
      closes: [M10]
      depends_on: [O1, O2, O3, H1, H2, H3, H4, G1, G2, G3, G4, G5, M1, M2, M3, M4, M5]

  proof:
    - >-
      tests/modules/test-agent-hat-agnostic.test.js 15/15 · tests/modules/test-agent-memory.test.js 9/9 (both registered).
    - >-
      the 80 existing test files touching the changed modules, run on 0.39.268 and on 0.39.269: no new failures;
      14 fail identically on both (named in CHANGELOG-0.39.269.md).
    - >-
      loom/bootstrap.js on fresh copies of the 0.39.266 zip: 0.39.268 vs 0.39.269 — the map declares 3 components,
      6 hooks, 14 wires; unresolved registry wires 112 → 104; every new component wired both ways.
    - >-
      _replyText checked in real Chromium against ChatGPT's code-block markup.

  open_items:
    - >-
      nothing here has run against James's live services (Ollama, ChatGPT tabs, Clear Glass); fakes only.
    - >-
      ChatGPT's A/B markers ("I prefer this response", "Which response do you prefer?") are text matches, not a
      verified selector — if ChatGPT renames them, the wait does not trigger (the job then fails at the no-reply limit).
    - >-
      copilot's global hat switch (self-model.setCurrentAgent) still sets the agent to the hat's baseAgent; wearing a
      hat on a chosen backend there needs a per-request backend parameter (the repo-agent.js limit).
    - >-
      loom bootstrap exits 1 on 0.39.266/268/269 alike: ~2,560 unique-id rejections from re-declaring what the shipped
      registry.json already holds, and ~104 real missing endpoints — pre-existing, not introduced here.
    - >-
      NEXT (James's order): phasemap phases built by agents against live Nexus — Versionium backup of the touched
      files, then apply live; RAID later. Starts from the registry cards the phase touches, with this memory.
