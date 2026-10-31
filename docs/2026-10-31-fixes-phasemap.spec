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
