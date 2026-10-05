# 0.39.335 — 2026-10-05

James: "why are the agents still not using the context. fix it. actualy fix it. do not hand it back until you. wasting my fucking tokens"

The retrieval from SB32–SB34 was correct. It read an index that **wasn't there** when the agent asked. Mapped first as SB35 in `docs/2026-10-05-build-from-the-spec-phasemap.spec`, from his boot log, before any code was written.

## What his log showed
1. **12:24:31, Ctrl+C.** Every service printed `[jaa] SIGINT received — flushing`, except idearium, which was mid nexus-self sync. `guardian/jaa-store.js` waits 1.5 s before flushing a table and **restarts that wait on every write**. The sync writes `idearium_repos` about once a second for its whole run, so the table never reached disk while the sync ran.
2. **The next boot** printed `Loaded 4 rows — idearium_repos`. No repo was still marked as a nexus repo, so every system logged `created` and core was re-ingested from nothing.
3. **12:26:07, his question to core's agent.** Core's 2,235 source files were still being written (done 12:26:08) and its pipeline had not run (READY 12:26:25). No `indexes/cards.json` existed, so the agent got `context: none — no index to read`, and a 3b model was told to run the pipeline itself.
4. **Repo rows that lost `materializeDir`** resolved to `data/projects/<uuid>`. The log wrote architect, diagnostic, eravos and intelligence there, while their index can sit in `nexus-self/repos/<uuid>`.

## Fixed at each cause
- **The store** (`guardian/jaa-store.js`, guardian 3.19.2) flushes a dirty table at most **5 s** after it first became dirty, however often it is written. The variable is `JAA_FLUSH_MAX_WAIT_MS`. A burst still becomes one write.
- **nexus-self**
  - It writes the repo rows to disk after each system (`flushTables()`, new in `idearium/lib/db.js`).
  - A repo whose nexus mark was lost is found by its name and updated in place, never ingested a second time.
  - `syncing(uuid)` is the running sync for a repo.
- **Every agent send** goes through `_ensureIndexed`. That covers the Agent tab, the prompt preview, late-reply adopt, the phase build and its review, and the file build's repo context. For each send it:
  1. waits for that repo's running sync;
  2. reads the directory that **holds** `indexes/cards.json`;
  3. when the sources are on disk and no index exists, runs the same import pipeline as `POST /reindex` and re-grounds the persona.

  Two sends at once share one run. The agent is never told to index its own repo.

## Proof
- `tests/modules/test-agent-index-ready.test.js`, **4/4**:
  - **IA-01:** a table written every 200 ms is on disk within the max wait.
  - **IA-02:** a repo stripped of its nexus mark is `updated` with the same uuid, and no second `nexus/core` appears.
  - **IA-03:** through the real API server, a repo with sources and **no index** is indexed when its agent is asked, and the prompt carries `src/upload.js` / `src/retry.js` and `function backoff`.
  - **IA-04:** a row without `materializeDir` reads the index in `nexus-self/repos/<uuid>`, the send's context is `search` with `retry.js`, and no second index is built.
- **Against the code before this fix:** IA-01 and IA-02 fail, and the run stops before the API checks.
- **Also green:**

  | Suite | Result |
  |---|---|
  | agent-context-always | 5/5 |
  | repo-chunks-tool | 11/11 |
  | nexus-self-incremental | 5/5 |
  | nexus-self-and-cos-run | 30/30 |
  | nexus-self-visible | 4/4 |
  | composed-prompt | 20/20 |
  | build-context | 15/15 |
  | agent-memory | 9/9 |
  | build-from-the-spec | 5/5 |
  | version-sync | 30/30 |
  | system-registry | 9/9 |
  | system-record-discipline | 9/9 |
  | the JAA store suites | 53 + 1 + 7 + 5 + 8 |

## Also in this release
- **Merged main** (0.39.327) into the branch. The branch's 0.39.308–314 are renumbered **0.39.328–334**, and each changelog says which number it had.
- **Fixed two YAML errors from main:** unquoted colons in phasemap status lines.
- **NV-004** now reads the Delete guard where 0.39.330 moved it (`repo-settings.js`).
- **CP-101** now expects `context-card`, which SB34 renders for every kind.
- **Loom**
  - The registry was regenerated from scratch. Nothing of main's was lost: 2,876→2,888 components, 2,919→2,936 hooks, 3,190→3,220 wires, with 7,705 `registeredAt` kept.
  - New wire: `idearium.api → idearium.repo.nexus-self` (`_ensureIndexed`).

## For James
After pulling, the first boot still re-syncs whatever the last stop lost. After that, a Ctrl+C mid-sync costs at most 5 s of writes, and a question asked during a sync waits for the index instead of going out blind.
