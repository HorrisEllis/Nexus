# 0.39.319 — 2026-10-05

James: "okay now the spine. lets continue the phases for emerge." · "no. i want warp 2"

EM0 is done (emerge map 1.7.14).

- `emergence/` — his upload (emergence-6, Emergence 0.1.0) brought in whole beside `emerge/`, without its `.git`. It runs on Nexus's `warp/`.
- `warp/core/StreamLog.js` — Nexus's copy had renamed `gateClaimed`/`eventType` to `claimed`/`type` (2026-09-11), and Emergence reads the old names. Both names are now kept, so neither caller breaks.
- `tests/modules/test-emergence-and-warp-suites.test.js` (registered in run-all) runs Emergence's own 155 and WARP's own 43 inside Nexus: 198 pass. The upload itself runs 155, not the 157 the map said.
- `docs/emerge-copies-divergence.md` covers both differences. Nothing is merged; the calls are his.
  - **Emerge language:** `emerge/emerge.spec` 1.0.0 against the upload's `emerge-language.spec` 2.0.0. Of the terms both define, 6 are identical and 224 are defined differently; 339 are in Nexus only and 98 in the upload only.
  - **RFR2:** the two trees share only `causality/index.js`, which has the same logic (Nexus 5.0.2 CommonJS, upload 5.0.0 ES modules). The other 17 and 19 files are different halves.
- Not yet: emergence in loom. EV0 adds it to loom's systems.
