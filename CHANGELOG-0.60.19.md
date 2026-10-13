# 0.60.19 — 2026-10-13

James: "can you delete this architecture afrom idearium? dynamic routing to profiles in clearglass, which can hook into hats. each tab can beb a compartment or different profile. that way we can use multiaccount routing. each gate can route, diagnose, and retry also, failure modes and fault taxonomy to help nexus learn, and the agents learn. look at all the phases for idearium and everythign else that should be built as a priority. … gather all of those into a list for nexus. what do you think? chatgpt?"

## The Architect page is gone from Idearium

These entry points were removed:
- Create ▾ → Architect.
- Build ▾ → Architect, and its frame.
- The welcome page's 03 · ARCHITECT pillar.
- The workshop's ARCHITECT station.

The page itself was archived to `idearium/ui/_archive/architect-0.60.18.html`, not deleted (§0.3).

Kept: each repo's **Architect tab**, its component registry. The phase planner reads it through `idearium/repo/architecture.js`, and it draws with `js/arch-canvas.js`. The coder read "this architecture" as the page in the screenshot. **To confirm.**

Four tests encoded the old decision. They now assert the removal and read the archived page: test-architect 8/8, test-synthesis-zoom-versionium 6/6, test-compartment-window 6/6, test-nexus-atlas-and-glass 10/10.

## His list, in Nexus

`cos/spec/check-catalogue.spec` already held 96 checks from his earlier "make a huge list". Section 13 adds 23 for the domains it lacked:

- **Shadow / liminal space:** expected but absent, half-states, declared but never served.
- **Negative space:** forbidden things absent (guards against regressions), unhandled branches, untested surface.
- **Ambiguity:** one reading or a question, unverifiable conditions, a coder's reading marked "to confirm".
- **Relationships:** every edge has two ends, who is affected, hat ↔ profile ↔ tab agree.
- **Problem solving and debugging:** classify before learning, reproduce then fix, hypotheses in parallel, a retry changes something.
- **Recursion:** the checker is checked, depth-bounded decomposition.
- **All coding languages:** each language's own toolchain and its own test runner.
- **Reasoning and linguistics:** a claim has a pointer, same word means the same thing.
- **Primitives:** every check names its primitive.

That makes 119 checks. Each names the code that already does part of it, or says `none`.

## The map: `docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec`

Nearly everything he asked was already mapped, much of it in his own earlier words. This map indexes those phases rather than duplicating them:

- **GT1, gates that route, diagnose and retry.** A failure is classed (transient, capability, context, spec, tool, verification) before anything learns from it, and each class takes its own path. It folds RQ2, RQ3, RQ4 and RQ24, on `fault-taxonomy.js`.
- **RT1, eligibility then preference.** This is ChatGPT's best point: hard requirements are not a score. It folds RQ6.
- **PF1, profiles ↔ hats ↔ tabs.** This is ID1, TB1 and HM0, his own map.
- **QA1, the catalogue runs.**
- **A priority order.** It is the coder's recommendation, and the call is his.
- **Drift surfaced.** The request spine's RQ9, RQ12, RQ15 and RQ21 were largely delivered by the contract work (CT0–EX0). Both maps are kept, and an addendum on the request spine says what remains.
