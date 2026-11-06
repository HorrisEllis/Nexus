# 0.60.257 — AF1: the active autofill profile (the "no profile 'null'" fix) + one-field match

James, 2026-10-26, running Nexus live: "need to have a autofill ui for relevant pages. like firefox has, like a autofill button where it shows under the input" · (the live bug this also fixes) copilot autofill — **"Did not fill: no autofill profile 'null'"**.

Found by dogfounding: copilot's "fill this in for me" failed because there was no *active-profile* concept. With no picker and no default, the fill path passed `null` and matched nothing. AF1 is the backend both the Firefox-style inline chip (AF3) and copilot/agents need — built first, his order of delivery.

## What was built (REUSE, not new — rule 2)
`matchFields`, the profile store, and the fill path already existed. AF1 adds the resolution + single-field match they all share:
- **`store.activeProfile()`** — the profile marked default, else the sole one, else the first (listProfiles order). It **never returns null**: no profile is a clean `{ ok:false, reason:'no-profile' }` the UI acts on (offer "create a profile"), not a null lookup that throws downstream.
- **`store.setDefault(id)`** — persists the chosen default as a JAA row (`cg_autofill_default`), replayed on reopen; an unknown id is refused loudly (§1.2).
- **`matcher.matchOne(field, profile, opts)`** — the `fieldType` + value for ONE focused input (the inline chip needs exactly this). It runs `matchFields` over a one-element array, so the learned-map / autocomplete / name / id / label / placeholder precedence and the template+length rules are byte-identical to a full-page fill. A non-fillable field, or a profile with nothing for it, is a clean `null` — never a throw for an ordinary field.

## Proof (headless, no Electron)
`tests/modules/test-autofill-active.test.js` 6/6:
- no profiles → `no-profile` named, never null;
- one profile → active by fallback (not flagged default);
- several, none default → the first listed;
- `setDefault` wins over first, survives reopen, refuses an unknown id;
- `matchOne` returns one match for a fillable field, a clean null for a submit/empty one, and null (not a throw) with no profile.

## Map
`docs/2026-10-26-inline-autofill-ui-phasemap.spec` (AF1, DAG `depends_on: []`).

## Remaining (his machine — this container has no Electron)
AF2 (route + command: `/cli/autofill/fill` defaults `profileId` to the active profile — the copilot/agent null fix end-to-end; one-field fill by selector), AF3 (the inline chip anchored under the input), AF4 (settings toggle + default picker). All Clear Glass UI, verified live.
