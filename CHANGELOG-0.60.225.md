# 0.60.225 — 2026-10-23 — JA1: the job-application autofill learns per site

James, 2026-10-23 (after the gig-work email): "for clearglass, job applications/autofill. look clearglass" · "make sure it works
for these" — micro1, AfterQuery, RemoExperts, Turing, Mercor; boards OpenTrain / aitraining.jobs / aitrainer.work.

## Verified first (§0.1, evidence over memory)
The job-application pipeline already exists and is real:
- `lib/opportunity/apply.js` fills a real application in Clear Glass and **stops before submit** (his rule);
- the matcher (`clear-glass/src/autofill/matcher.js`) already covers name, email, phone, LinkedIn, **GitHub**, portfolio, cover
  letter, desired salary, hourly rate, years of experience, sponsorship, remote, pronouns, website;
- `fromPage` browser-capture turns any job page into an opportunity (`kindForHost` → job), and `apply.js` defaults to "you submit".
So these platforms already work **generically**. (Their ATS slugs / feeds couldn't be wired from here — the container has no network
to those sites — and real forms need his login in Clear Glass; that test is his to run.)

## The real gap, and the fix (JA1)
`matchFields` matched **only by pattern** and never learned — so a field a specific platform labels oddly (micro1's "Your code
profile", say) was missed **every time**. The element-picker learn-loop that fixes this was mapped (GA2–GA5) but only for the Fiverr
gig editor and still OPEN.
- **`matchFields` now consults a per-site learned map** (`{ fieldKey → fieldType }`) **before** its patterns. A human pick is the
  highest authority (`source: 'learned'`, high confidence). Kept **pure**: the caller passes `learned`.
- **`fieldKeysOf(field)`** returns a field's stable identities (id, name, label, aria-label, placeholder), lowercased and de-duped,
  so the picker's save path and the matcher agree on what identifies a field.
- **`detectFields` / `fillFields`** forward `learned` (the IPC layer, which holds the store, loads it per origin — JA2).

## Proof
`tests/modules/test-autofill-learned.test.js` — JA 4/4: a pattern-missed field fills from a learned entry (JA-01); a learned pick
**overrides** a pattern (human correction wins, JA-02); no learned map → unchanged (JA-03); `fieldKeysOf` identities (JA-04).

## Files
- `clear-glass/src/autofill/matcher.js` — learned consult, `fieldKeysOf`, forwarded through detect/fill.
- `tests/modules/test-autofill-learned.test.js`, `run-all.js`; `lib/version.js`, `package.json` — 0.60.225.

## Open next (the learn-loop, extended off Fiverr to general job applications)
- **JA2** — a picked field saves to site-settings (`autofill.field.<key>`) under the application's origin (reuse `selector-assign`).
- **JA3** — on a miss, the element picker pops up (reuse `renderer/selector-check.js`).
- **JA4** — the UI, and the IPC loads `learned` from site-settings on fill.
- **A real Clear Glass fill** on one live listing (RemoExperts or micro1 — plain SWE forms, not assessment-gated) — his login, his machine.

---

> **0.60.225 was used twice.** The entry above is main's (the JA line, Clear Glass autofill). The entry below is from `claude/sleepy-gates-9lc085` (the SL line), built in parallel under the same number and merged in 0.60.233. Neither was renumbered (§0.3): both are kept here, as they shipped.

---

# 0.60.225 — 2026-10-23

James: "confused"

Sent with a screenshot of the Code tab: `RF2_shared_data_directory_is_the_root_of_the_crash` shown **DONE** under runs
(`changed: —`) and **FAILED** in Tasks (`contract-incomplete — gate phase is FAILED`), and the response file in which Gemini
answered "spec/RF2-shared-data-directory-crash.spec" when asked where its code block belonged.

## Why (traced, §0.1)

- RF2 is not a phase. It sits under `root_findings:` in
  `docs/2026-09-05-observability-sovereignty-and-agent-mesh-phasemap.spec`, and the map says of that block: "Not phases — these are
  the confirmed, evidence-backed facts every phase below cites back to."
- Its fix already shipped: DF1 moved guardian off cortex's store, and DL3 (0.60.208) points `guardian/config.js` at
  `lib/data-home.js`. Your boot log shows it working: "guardian brought 5 file(s) home".
- loom's phasemap parser (`loom/scanners/phasemap-map.js`) took anything shaped like `XX1_name:` as a phase. It marked only
  `decisions:` entries (CV6), so RF2 showed as pending work.
- The build sent it to Gemini. Gemini read `guardian/config.js` and `lib/data-home.js`, had nothing to change, and wrote a spec. The
  gate failed it because nothing it named was delivered. The run card's DONE means only that the agent's steps finished; the
  phase's verdict is the gate's FAILED.

## Built (NF1)

- `loom/scanners/phasemap-map.js`: an entry under `root_findings:` is `kind: 'finding'`. It is still listed, so no counts change.
  Nexus's maps hold 8 such entries, all in the 09-05 map.
- `idearium/repo/roadmap.js` carries the kind to the phases manager.
- `lib/phase-dag.js` holds a finding as closed (`status: finding`). It is never open and never queued, and it never blocks a phase
  that cites it. `lib/build-queue.js` does not count it as a phase.
- `idearium/api/index.js` `_phaseBuild` refuses a decision or a finding with 409 `NOT_A_PHASE`. `anyway` does not override this:
  `anyway` overrides an open dependency, and this refusal is about what the entry is.
- `idearium/ui/js/phases.js` labels the card "finding".

## Not changed, said

- Other non-`phases:` sections that hold `XX1_` keys (`traps:`, `blockers:`, `found_while_reading:` and others) are left as they
  are. Some of them hold real phases (FR6 was built from `found_while_reading:`), and they were not measured one by one (§16.4).
- The failed RF2 task stays in the Tasks panel as the record. Retry now returns NOT_A_PHASE instead of sending another job.

## Proof

- `tests/modules/test-root-findings-not-phases.test.js` 5/5. It covers the parser, the roadmap, the DAG, the real 09-05 map, and
  the wiring in the build and the card.
- Unchanged: phase-dag 8/8, phase-census 6/6, verify-first 10/10, loom-phasemap 8/8, loom-phasemap-status 14/14.
