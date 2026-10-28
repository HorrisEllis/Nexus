# 0.60.234 — 2026-10-24

James: "I'm not sure what Sentinel is, dude. Is that, like, tell me, I don't think that got mixed in to this project." · then: "Yeah archive it."

## What Sentinel was

His plan from 2026-07-24 (`docs/nexus-sentinel.spec`, which quotes him three times) for one diagnostic-and-repair authority, merging the four
diagnostic surfaces that disagreed at the time.
- **Built:** only phase S1. That is `sentinel/interaction-contract.json`, whose routes were declared and never served, and `cli/sentinel.js`,
  about 350 lines reading faults from the local store.
- **Where its job went:** the diagnostic system does it now. Diagnostic is one of his 15, and the healer joined it in 0.60.136.

## Archived

Moved with `git mv` to `_archive/2026-10-24-not-systems/sentinel/`:
- the folder;
- `cli/sentinel.js`;
- `tests/modules/test-sentinel-cli.js`, taken out of both run-all lists with a note there;
- test-adversarial-sim's AS-004 to AS-006, which tested that CLI.

`docs/nexus-sentinel.spec` stays as the record of the plan, with an addendum naming `diagnostic/` as its successor. Nothing is parked now.

## Found and fixed

test-sovereign-systems SV-08 used sentinel as its sovereign example. 0.60.230 broke it, and it was not run then. It is the second test that
change broke, after CT-03/04. The example is now components.

## Proof

- test-sovereign-systems 8/8;
- test-adversarial-sim 17/17 (the three moved cases are kept in the archive);
- test-registry-draft 6/6;
- test-node-lattice 4/4, test-drawbridge-registry 8/8, test-system-registry 9/9.
- test-cos-compartment-template 7/8: CT-07, as at 0.60.229.
