# 0.39.318 — 2026-10-05

James: "maybe fork it, for me." · "and had it back."

- `warp/` forked to 1.5.0: Nexus's 1.4.0 plus the two additions in James's 1.5.0 upload (emergence-6): `firstSuccessPromotionPolicy` in `dispatch/population.js`, and a top-level `index.js` so `require('warp')` works. `README.md`, `CHANGELOG.md` and `package.json` added from the upload. MANIFEST is now 1.5.0.
- Nothing removed. Nexus's copy keeps what the upload lacks: Stream's ring cap, deregister, onAny, tail, since, seq and SSE; StreamLog's levels, seq and sample(); the larger dispatch and cascade.
- Tests: warp's core 12, digest-regression 4, v1.1.0 6 and v1.4 21 pass, plus warp-compounding 6, nexstore-types 4 and atlas-and-glass 9. `warp/test/dispatch.test.js` fails before and after this change because it needs `siso_ref/`, which is not in the repo.
