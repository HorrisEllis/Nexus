# docs/2026-10-31-fixes-phasemap.spec — small fixes found mid-work, each phased before its code (his rule: "anything new, spec, any changes,
# fixes, or additions is phased only"). A fix to a file no spec module owns names the file; the module comes with SE4's drafts.

origin: >-
  James, 2026-10-31, after the coder found a test writing into the real data/ folder: "okay, since it's small." Under his rule of the same
  day: "how about anything new, spec, any changes, fixes, or additions is phased only."

status: "OPEN"

phases:
  FX1_component_ledger_stays_in_the_sandbox:
    status: OPEN
    depends_on: []
    files: [lib/component-ledger.js, tests/modules/test-test-sandbox.test.js]
    does: >-
      lib/component-ledger.js read NEXUS_DATA_ROOT when loaded without calling lib/test-sandbox.js ensure() (every other store resolver
      does), so a test that registers a component (test-mutation-contract) wrote data/ledger/test/... into the real tree. It calls ensure()
      first, as lib/chat-logger.js and lib/component-store.js do.
    proof: "test-mutation-contract run leaves the tree clean (git status); a test asserts the ledger root is under the sandbox in a test process"
  FX2_one_release_command:
    status: OPEN
    depends_on: []
    files: [scripts/release.js, tests/modules/test-release-tool.test.js, tests/modules/run-all.js]
    does: >-
      His "make any tools that help you speed any of this up" (2026-10-31): one command for what every release repeats by hand —
      bump-version.py with his quoted line, VERSION, the changelog into versionium/changelogs, every touched map's .phase and .graph files
      regenerated (twice on 2026-10-31 they were left out of the commit), the named tests run (a red one stops the release), everything staged
      except data/** (his rule), one commit with the session's trailers, push with tracking. --dry-run says each step and writes nothing.
    proof: "a dry run on a fixture tree names each step; a run with a failing test stops before the commit; data/ never staged"
  FX3_tests_that_still_write_real_data:
    status: OPEN
    depends_on: [FX1_component_ledger_stays_in_the_sandbox]
    files: [cortex/self-heal/failure-mode-forensics.js, lib/local-vector-index.js, lib/test-sandbox.js, tests/modules/test-test-sandbox.test.js]
    does: >-
      Found 2026-10-31 after the 0.60.326 release's test runs (a partial run-all among them): data/vector-index/index.json changed and three
      failure_mode nodes were written to cortex/data/nodes/failure_mode by failure-mode-forensics.js — the same leak class as FX1. Restored
      and removed by hand (nothing committed); the writers that resolve their path without test-sandbox ensure() are to be found and fixed,
      and test-test-sandbox given a check that a full run leaves git status clean.
    proof: "a full run-all leaves no change under any data/ folder"
