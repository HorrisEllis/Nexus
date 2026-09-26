spec:
  meta:
    name:        guardian.code-artifact
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    owner:       guardian
    uuid:        nexus-guardian-code-artifact-v1-0000-2026-0919-001
    author:      james-brooks
    created:     2026-09-19
    status:      Implemented
    purpose: >
      A job declares the FILE its returned code belongs in. The completion
      listener writes that code to that name and stages it. James:
      "Each job needs to list file name. Then the listener listens for the
      code and uses the file name for the artifact. And coding syntax."

  order_violation:
    law: '§8.5 — "Do not build anything, without creating a spec file first."'
    what_happened: >
      guardian/lib/code-artifact.js, the jobs.js/server.js/ncp-handler.js
      wiring and tests/modules/test-code-artifact.js were written and
      verified BEFORE this file existed. The build order was wrong. This
      spec was written afterwards, against the code that already exists,
      which makes it a description rather than a contract the build was
      held to.
    also_skipped_in_that_pass:
      - '§6.3 — not entered in docs/SPEC-REGISTRY.spec on creation (corrected in this pass).'
      - '§5.4 — no version bump; lib/version.js and package.json were left at 0.39.156 (corrected in this pass).'
      - '§5.1 — events emitted with no entry in guardian/event-taxonomy.js and none declared in guardian.spec (corrected in this pass).'
      - '§8.7 — loom component/hook/wire map, guardian.spec and phasemap history were not read before editing ncp-handler.js, jobs.js and server.js.'
    not_reverted_because: >
      §0.1 — the code is verified against real behaviour (27/27, including
      a real intake.stage() round trip). Deleting working, tested code to
      re-derive it in the right order would destroy evidence, not restore
      discipline. The violation is recorded here rather than hidden, per
      §0.3 and §17.3.

  core:
    schemas:
      - JobFileFields: "{ fileName: string|null, syntax: string|null }"
      - CodeBlock:     "{ index, info, tag, syntax, code }"
      - Capture:       "{ ok, reason?, fileName, syntax, fenceSyntax, matchedBy, blockIndex, blockCount, path, bytes, sha256, dropId, stageError? }"
    constants:
      ARTIFACT_DIR:    'data/guardian/code-artifacts/<jobId>/  (env NEXUS_CODE_ARTIFACT_DIR)'
      FENCE_RE:        '/^[ \t]*```([^\n`]*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm'

  ownership:
    law: '§17.1 — every artifact has exactly one authority.'
    writes:
      - 'guardian/lib/code-artifact.js — the ONLY writer of a code artifact file.'
      - 'lib/intake.js — the ONLY authority for staging. This module calls stage(); it never writes into the tree itself (§IP-5, arrival is not acceptance).'
    reads:
      - "guardian/lib/ncp-handler.js — the listener. Calls capture() once per completion, only when the job carries a fileName."

  contract:
    inputs:
      fileName: >
        Declared at createJob time by the requester — the only side that
        knows what file it asked for. Relative path only. Absolute paths,
        drive letters and any path that climbs out of its own directory
        are refused before any write (reason 'unsafe-filename').
      syntax: >
        Optional fence language to trust when a reply contains several
        blocks. null means infer from the file extension.
    outputs:
      file: '<ARTIFACT_DIR>/<fileName> — the picked block, verbatim.'
      drop: "lib/intake.js's real dropId, with provenance.filename = fileName."
      row: "jaa 'artifacts' gains fileName / syntax / filePath / fileSha256 / dropId; null when no fileName was declared."
    invariants:
      - 'A job with no fileName produces no artifact. Nothing is guessed. (§1.3)'
      - 'A reply whose only fenced blocks are a language other than the declared/implied one produces NO file at all — never a fallback to some other block. Writing Python into a declared .js file is the precise thing §1.2 forbids. (reason "syntax-mismatch")'
      - 'Every refusal is returned with a reason and emitted as guardian.artifact.refused. Silence is never a refusal path. (§1.2)'
      - 'capture() never throws and never fails the job. A failed capture costs one artifact, never a completion. Same non-fatal discipline as jobs.js _persistJob() and lib/gap-field.js report().'
      - "The file name is the authority on `syntax`; the fence tag is the agent's CLAIM, kept separately as `fenceSyntax`. A disagreement is real information and is never flattened. (§0.1)"
      - 'The picked block is auditable: blockIndex, blockCount and matchedBy (syntax|untagged|largest) are always reported. (§16.2, §17.5)'
    failure_modes:
      no-job:          'capture() called with no job object.'
      no-filename:     'The job never declared one. Not an error — the feature is opt-in.'
      unsafe-filename: 'Absolute, drive-lettered, or escaping its directory. Refused before any write.'
      no-code-block:   'The reply contains no non-empty fenced block.'
      syntax-mismatch: 'Fenced blocks exist but none match the declared or implied language, and none are untagged.'
      write-failed:    'fs write failed; message carried through verbatim.'
      stageError:      'The file on disk is real; intake.stage() refused or threw. Reported, never presented as staged.'

  selection:
    order: >
      Strictest first, so the choice is always explainable:
      (1) exact declared-syntax match, (2) an untagged fence when a syntax
      was wanted — unlabelled is not contradictory, (3) no syntax wanted at
      all, take the largest block. Ties within a tier go to the largest
      block, on the grounds that the substantive answer outweighs a one-line
      usage example.

  reuse:
    law: '§8.6 — reuse before build; the recursive read is a written finding.'
    found_and_reused:
      - "lib/intake.js stage() — the real, already-gated staging pipeline clear-glass/src/providers/download-capture.js already feeds. This module is a new SOURCE for it, not a second intake."
      - "clear-glass/src/ipc/bridge.js:1232's fence regex — the proven shape in this tree, made global here with the info string captured."
      - "guardian/lib/jobs.js createJob — extended with two fields rather than given a parallel creation path, the same way accountId/agentId/transport/wakeDepth were added on 2026-09-19."
    found_and_NOT_reused:
      - "guardian/lib/jobs.js _findActiveJobForProvider() — the existing artifact/job correlation. Its own comment states it is \"best-effort... not a guaranteed one\" and advises a caller needing certainty to pass jobId explicitly. Declaring the name at creation removes the guess for any job that uses it; the function is untouched and still serves the download path, which genuinely cannot know a jobId."
    name_collision_recorded:
      - "guardian/server.js:199's guardian.job.queued payload already carries `filename`. That is the INPUT file that arrived in the physical queue (the source), not the OUTPUT file a job's code belongs in. Two different real things sharing a word — recorded here rather than merged, per the same discipline already applied to ledger/gap/wire/contract in NODE-TAXONOMY.md."

  events:
    emits:
      - 'guardian.artifact.captured'
      - 'guardian.artifact.refused'

  verification:
    suite: 'tests/modules/test-code-artifact.js'
    result: '27 passed, 0 failed'
    real_not_faked: >
      One case runs a real lib/intake.js stage() against a temp
      NEXUS_INTAKE_DIR and reads the contract back, asserting
      provenance.filename and provenance.jobId. The rest assert every
      refusal path, including that syntax-mismatch writes NO file.
    regression: 'test-guardian-wake 14/0, guardian-job-persistence 4/0, guardian-command-index 9/0.'
    not_verified:
      - "No live run against a real provider tab. Every test uses constructed response text; a real agent's fence habits (indented fences inside lists, nested fences, truncated output) are unproven here."
      - "The mesh completion path is NOT wired. capture() runs in ncp-handler.js only. A mesh-delivered job that declares a fileName currently produces no artifact — a real, open gap, named rather than implied away."

  wired_2026_09_20:
    what: >
      capture() shipped wired into exactly ONE of guardian's real
      completion points (ncp-handler.js). A job that declared a fileName
      and came back through any other path produced no artifact, silently.
      Named as an open gap at ship time rather than found later; closed now.
    how: >
      onJobComplete({ job, text, bus }) is the listener, in one place
      (§10.3 — one implementation, several callers, never a second copy).
      Routed here: guardian/lib/ncp-handler.js (the NCP/userscript tab
      path), guardian/lib/provider-routing.js x2 (the ollama/mistral
      bridge polls), and guardian/server.js /wake-job-ack (a completed
      wake exchange, which now also accepts fileName/syntax in its body).
    deliberately_not_wired: >
      guardian/lib/dispatcher.js's browser-command completion. Checked
      directly rather than skipped for symmetry: its response is
      JSON.stringify(result.result) from dispatchBrowserCommand — a
      structured browser action result, not an agent's chat reply. There
      is no fenced code in it to find, so pointing a code extractor at it
      would only ever produce refusals. WIRE-011 asserts it stays unwired.
    proof: >
      WIRE-010 counts the real onJobComplete call sites per file, so a
      future edit that drops one fails the suite rather than silently
      producing no artifact. tests/modules/test-code-artifact.js 34/0.

  open:
    - "Multi-file replies: an agent asked for three files returns three fences. Today one job names one file. Whether that becomes several jobs or one job with a fileNames[] is undecided — not guessed at (§16.4, generalize after repetition)."
    - 'A fence whose info string carries a path (```js src/x.js) is parsed for its language only; the path is ignored. Whether a fence-declared path should ever outrank the job-declared one is a real question with a real §0.1 answer needed, not assumed.'
