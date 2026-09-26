spec:
  # ════════════════════════════════════════════════════════════════════════════
  # warp-devkit-addendum-v1.4.1.spec
  #
  # STATUS: proposed, additive, REVERTIBLE.
  # Revert = delete this file, remove the two `exactCache*` parameters from
  # warp/dispatch/index.js and the one pass-through in
  # lib/seam/adapters/warp-cascade.js. Default behaviour is unchanged either
  # way: the option is OFF unless a caller asks, per warp/dispatch/index.js's
  # own stated law — "new behavior only activates when a caller explicitly
  # asks for it."
  #
  # WHY — James, 2026-07-09: "emerge is meant to cut down 90% of tokens, warp
  # some and speed it up and compound it, if it doesn't compound yet add that."
  #
  # It did not compound. warp-build-dispatch.js's own header already said so
  # and nobody acted on it: "the exact-cache isn't populated after one success
  # ... an identical chunk has to be independently re-generated and retained 3
  # times." That is an accurate description of a cache that resets instead of
  # accumulating.
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:       warp-devkit-addendum
    version:    1.4.1
    extends:    warp-devkit@1.4.0
    author:     james-brooks
    status:     proposed
    uuid:       warp-devkit-addendum-v1-4-1-0000-2026-0709-jamesbrooks-001
    supersedes: nothing — additive only
    purpose: >
      Distinguish the exact cache (memoization of identical input) from the
      population store (evolutionary generalization across similar inputs),
      and let a caller opt into writing the exact cache on first success.

  # ── §W-1: Two mechanisms, conflated ─────────────────────────────────────────
  # Measured in warp/dispatch/index.js, not inferred:
  #   Step 1  exact-cache check   crystallizer.get(digest)
  #   Step 5  score-and-retain    population.retain(gateClass, …)
  #                               if (readyToPromote) crystallizer.set(digest, …)
  #
  # `readyToPromote` requires DEFAULT_PROMOTE_THRESHOLD (3) independent
  # successes AND fitness >= DEFAULT_FITNESS_MIN (0.7). Verified by reading
  # warp/dispatch/population.js:19-23.

  axiom_W-1:
    statement: >
      The population store and the exact cache answer different questions and
      must not share a write condition.
    population: >
      Generalization. A retained variant is reused for inputs that are SIMILAR
      to the one that produced it. Three independent successes clearing a
      fitness floor is the correct bar, because the variant will be applied to
      inputs it was never generated for. UNCHANGED.
    exact_cache: >
      Memoization. `digest` is content-addressed over the request event
      (dispatch/digest.js). A hit means the input is IDENTICAL, not similar.
      Requiring three regenerations of identical input is three times the
      tokens for one answer, and guarantees the cache can never make the next
      build cheaper than the last.
    safety_verified_not_assumed: >
      Step 4 returns {ok:false, source:'rejected'} on ANY hard axiom failure
      before step 5 is reached. Every output at the retain point is therefore
      already hard-gate validated. The exact-cache write additionally requires
      cascadeResult.ok and the same fitness floor the promotion path uses, so a
      barely-passing variant is never frozen forever.
    measured_effect: >
      Three dispatches of an identical event: 3 LLM generations before, 1 after.
      Sources: [generated, generated, generated] -> [generated, crystal, crystal].
      Costs: [_, 0, 0]. 67% of generations eliminated on identical input, and
      every subsequent identical build costs zero. That is compounding: value
      accumulates rather than resetting.

  implementation_W-1:
    file:   warp/dispatch/index.js
    params:
      exactCacheOnFirstSuccess: false   # opt-in, off by default
      exactCacheFitnessMin:     0.7     # mirrors population's DEFAULT_FITNESS_MIN
    passthrough: lib/seam/adapters/warp-cascade.js
    note: >
      exactCacheFitnessMin is PASSED, not imported from population.js, so
      warp/dispatch keeps zero coupling to population's internals.
    caught_before_shipping: >
      The first draft referenced DEFAULT_FITNESS_MIN and exactCacheOnFirstSuccess
      without either being in scope — a ReferenceError on every dispatch. Found
      by grepping the identifiers, not by reading the diff.

  # ── §W-2: idearium's cache key was both useless and unsafe ──────────────────
  # Two faults in idearium/spec-engine/warp-build-dispatch.js. Either alone
  # would have prevented compounding; together they also risked wrong output.

  axiom_W-2:
    statement: >
      A cache key must be derived from the content that determines the output,
      and from nothing else. A key that includes identity (a UUID, a timestamp)
      can never hit. A key that excludes content can hit WRONGLY.
    fault_1_never_hits: >
      seam_uuid was `${specUuid}:${chunkIdx}`, and digest =
      hash(gateSignature=seam_uuid + axioms + event content). specUuid is unique
      per spec, so an IDENTICAL chunk built in a second spec produced a
      different digest and could never hit. The fallback was worse:
      `idearium-chunk-${Date.now()}` gave every single call a unique key, so
      nothing could hit even within one spec.
    fault_2_hits_wrongly: >
      warp-cascade builds `event: { data: { seam: record.seam_id } }`, and
      seam_id here is the section TITLE. The prompt was nowhere in the digest.
      Two different chunks both titled "Purpose" would hash identically and
      could return each other's output. A wrong cache hit is worse than a miss.
    fix: >
      seam_uuid = `idearium-chunk-sha256:${sha256(prompt).slice(0,32)}`.
      Identical prompts — across specs, across runs, across machines — share one
      key; different prompts never do. Content-addressing is what makes a cache
      compound.

  # ── §W-3: The module could never be imported ────────────────────────────────
  axiom_W-3:
    statement: >
      A module with zero consumers cannot report that it is broken. Absence of
      failure is not evidence of function (§1.1).
    finding: >
      warp-build-dispatch.js does `import { pollGuardianJob } from
      './chunk-dispatch.js'`. chunk-dispatch.js defines `_pollGuardianJob`
      privately and exports only `dispatchChunkWithVerification`. The named
      import is an ESM SyntaxError at load: warp-build-dispatch.js could NEVER
      be imported. It also has ZERO consumers, so nothing ever tried, and the
      failure stayed invisible. Its header describes test results that cannot
      have come from importing this file.
    fix: >
      chunk-dispatch.js now exports `_pollGuardianJob as pollGuardianJob` —
      exposing the real poller under the name its one consumer expects, rather
      than writing a second poller. Verified: warp-build-dispatch.js now loads
      and exports createWarpChunkDispatch.

  # ── §W-4: What compounding does NOT solve ───────────────────────────────────
  axiom_W-4:
    statement: >
      Token reduction has three independent sources and they must not be
      conflated in any claim about totals.
    deterministic_generation: >
      EMERGE. Content produced from a spec by a compiler costs zero tokens.
      This is the 90% claim's only honest home. emerge/compiler/ is ~5,600 real
      lines (the "23 not implemented markers" were template literals inside
      emit.js — emerge GENERATES stubs; it is not made of them).
    memoization: >
      WARP exact cache. Identical input, zero tokens, from the second build on.
      Measured: 67% of generations on a 3-build identical sequence.
    seeding: >
      TEMPLATES. genesis.spec deterministically fills 1 of 10 spec sections
      (meta). 10%. It is a grammar, not eight markdown essays; claiming it
      seeds more would be fabrication dressed as determinism.
    honesty: >
      These multiply, they do not add, and none of them is 90% alone. State
      which mechanism a number came from, or the number means nothing.
