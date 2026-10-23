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
