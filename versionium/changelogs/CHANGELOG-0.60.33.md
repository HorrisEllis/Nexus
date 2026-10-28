# 0.60.33 — 2026-10-14

James: "now what? does that make it more stalbe?" · then: "yes start QA1"

The coder's answer to the first question:
- GT1 and RT1 add stability.
- PF1 adds capacity.
- The live run on his machine is the real proof.
- QA1 is next because it guards what already works. He has named that fear before: "im scared of regression."

## QA1, first cut: the check catalogue runs

`cos/spec/check-catalogue.spec` lists 119 checks, but nothing loaded it. A contract gate could name only three of them. Now:

- **`lib/check-catalogue.js`** loads the catalogue. It answers, for every check, what it is and whether Nexus can run it. It runs the checks that have a runner. A check without a runner is reported as "could not check". It never passes.
- **Three runners** (`lib/checks/`):

| check | what it guards | how |
|---|---|---|
| CK-230 expected but absent | a step that said what it would produce actually produced it | reads `lib/shadow.js`, which now remembers each settled shadow |
| CK-233 forbidden things absent | nothing that was removed comes back | `cos/spec/deny-list.spec`, plus a repo's own `.nexus/deny.yaml` |
| CK-248 the language's own toolchain | every file passes its own language's parser | node, tsc, python, bash, JSON, YAML, gofmt, gcc/g++ |

  CK-248 never counts a file as passing when its tool is missing; it says the tool is missing.
- **The deny list** holds three things you asked to stay gone, each with your words:
  - the "compartment · …" label (0.60.11);
  - Playwright (0.59.0);
  - links to the removed Architect page (0.60.19). Until now this one had no guard at all.

  The two one-off guard tests still run, and they agree with CK-233.
- **Contract gates:** a contract condition `{ check: CK-233 }` (or CK-230 or CK-248) runs the check. A check with no runner is "unverifiable", which GT1 treats as a question for you, not a retry.

## First real runs on Nexus

- **CK-233:** clean, in 0.6 s.
- **CK-248:** 2,489 files in 6 languages, all clean, in 77 s. The files were JS 2,309, JSON 152, TS 19, YAML 6, Python 2, shell 1.

## Where to see it

- Idearium: Settings → **Checks**. Every check is listed by family, and the runnable ones have a Run button.
- `idearium checks list [--runnable]` and `idearium checks run CK-233 [--repo=<uuid>] [--path=dir]`.
- `GET /api/checks` and `POST /api/checks/:id/run`.

## Proof

test-check-catalogue 7/7:
- The map's proof: CK-230 passes on a settled shadow and fails on an open one. It also fails when a settled shadow is missing something, and reports "unverifiable" when no shadow was declared.
- Each planted forbidden thing is found at its file and line. Comments and archived files aren't counted as hits.
- A planted syntax error in each of 8 languages is caught by that language's own tool. Valid files pass. A missing tool is reported.

These suites are unchanged:
- contract-gates 20/20;
- contract-adapters 18/18;
- contract-phase-build 8/8;
- chunked-phase-build 15/15;
- shadow 16/16;
- shadow-space 5/5;
- atlas-and-glass 10/10;
- no-compartment-label 1/1.

CT0 (the contract that checks the contract evaluator itself) was re-run after the evaluator changed: all 5 gates passed.

## Not done

These checks from the catalogue's section 13 are next. All are deterministic, and each is one runner file:
- CK-231 half-states;
- CK-234 unhandled branches;
- CK-235 untested surface;
- CK-237 free-sentence conditions;
- CK-239 dangling edges;
- CK-245 a retry changes something.

Also not done: RQ18's test and attack intents. CK-248 doesn't read `docs/*.spec`: those are YAML with markdown addenda, not one language.
