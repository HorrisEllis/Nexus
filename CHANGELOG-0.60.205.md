# 0.60.205 — what his run log showed (SD21)

James, 2026-10-22, with his 0.60.201 run log: "show me idearium improvements that would help the most from the phases" · "the log
fixes also. start them"

Map: docs/2026-10-10-idearium-solid-phasemap.spec SD21_what_his_run_log_showed (DAG checked, no problems).

## The six fixes
1. **The background probe checks that its model fits first** (copilot/adversarial.js).
   - Memory was fine when each probe started. Then the probe's own qwen2.5-coder:7b load drove it critical:
     - 00:25:29 critical, probe done at 00:26:32;
     - 00:35:29 critical, done at 00:36:37;
     - 00:45:40 critical, done at 00:46:26.
   - The probe now runs the same per-model check the build uses (`fitsModel`). If the model won't fit, the probe is deferred and
     says why. If Ollama doesn't answer, the check is skipped, and the existing memory-level check still applies.
2. **A build's job doesn't wait at a sign-in page** (guardian/server.js, guardian/lib/provider-login.js).
   - In his run, the SP5 build reached Claude, and Claude's tab opened on its sign-in page. The job sat there 295 s before the build
     moved on to DeepSeek, which wrote the file in 8 s.
   - Now, behind a sign-in wall, a build's job (session `…-phrun-…`) or background work fails at once with the wall as its reason, and
     the build moves to the next agent.
   - A job a person is waiting on still waits for the sign-in.
3. **The "absent" line says what each item is** (lib/shadow.js).
   - The log line read "lib/title.js, a-test-that-proves-title-as-the-spec-sta", which looks like two missing files.
   - The second item is an unmet condition of the phase. The coder first misread it as a sentence being treated as a file. The code
     showed otherwise: the proof was right, and the line was unclear.
   - Each item now reads as `file …`, `event …` or `condition …`.
4. **Proof history no longer grows the spec** (idearium/repo/proof-run.js).
   - Each file in a repo's store becomes a chunk of the repo's spec, and every proof run added a new timestamped history file there.
     His Looking Glass spec grew from 35 chunks to 65 in one evening.
   - The report and `latest.json` keep their single names and are overwritten. The per-run history goes to the disk only; every
     outcome is also a row in the phase-run log.
5. **No "which file?" job when the phase asked for one file** (lib/repo-inject.js).
   - After each Gemini reply, a second job asked which file the code went in, and each one waited out the 15 s gap.
   - Now, when the building phase asked for exactly one file and the reply has one code block with no path, in a language that fits
     that file, the block goes to that file and no agent is asked.
   - A block in another language (YAML for a .js file), or two blocks with no path, are still asked about.
6. **The Nexus sync pauses when memory runs low** (idearium/repo/nexus-self.js, idearium/api/index.js).
   - The first sync on a fresh folder rewrote all 4,609 files: 141 s and about 30 MB of repo copies. Memory went into pressure partway
     through, because memory was checked once, before the first system.
   - Memory is now checked before each system, and the systems left over sync on the next round.
   - The boot log now gives the real first-sync delay: 60 s, not the 20 s it printed.

## Proof
- tests/modules/test-log-fixes.test.js 6/6 (LF-01 to LF-06). LF-05 runs through the real repo layer.
- tests/modules/test-proof-run.test.js 7/7. PR-05 was updated to the new rule: the store gets the report and `latest.json`, and the run
  file is on disk.
- No change in shadow 16/16, shadow-space 5/5, check-catalogue 7/7, starved-machine 5/5, refusal-sendback 4/4, nexus-self (30, 5 and
  4), adversarial 20 + 3, or inject-screen 14/14.

## Not fixed yet
- **The Claude tab flapping.** While signed out, the tab reconnected about every 9 s for over an hour (`§FLAPPING`). The log doesn't
  show why. Fix 2 removes the build's waiting job from it, but the reconnecting itself is still there.
- **`raid-contract-…` repos made by the officiator.** There are fewer since 0.60.203 stopped the loop.
