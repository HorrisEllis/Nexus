# Uploads, 2026-10-31 — kept whole (§0.3)

James sent these into a session whose files vanish when it ends, with: "this might be helpful, move to the relevant system and dir, if
not, move to docs." Where each went:

| Received as | Went to | sha256 as received |
|---|---|---|
| `looking-glass-bundle-v0_4.zip` | Kept whole here (his Looking Glass project as Idearium held it on 2026-10-19: SPEC.spec, its phasemaps, EDITOR.md, lib/ and tests built by the pipeline, the Rust crates, proof runs). Its readable docs, which are newer than `docs/looking-glass/`, are copied to `docs/looking-glass/v0_4/` (README, PHASEMAP, EDITOR, the SP5 proof report). Its .spec files stay inside the zip so Nexus's spec census and DAG do not take his project's phases for Nexus's own. | `50b15827f64ab525ec108d519f01234234b0f5c4666c4fb56ba88f7d314cc3fd` |
| `looking-glass-bundle.zip` (2026-10-14) | **Not kept: a true duplicate.** Its three files, SPEC.md, PHASEMAP.md and README.md, are byte-identical to `docs/looking-glass/` (checked with cmp). | `b85b6e2cfb8aa040b266dc72d7fd120bf10d4b7248d26541c35536bd12ac09bd` |
| `Glass_Engine.md` | `docs/2026-10-31-glass-engine-notes.md`, verbatim (it spans several systems) | `e3d6ba631f8f7ededed48da2b6c1a81d99604f39d73b886317451462e0549693` |
| `Glass_Engine` | `clear-glass/docs/2026-10-31-glass-engine-list.md`, verbatim (every item is Clear Glass's) | `d7cdd2a299d081056fca9e0a77ce8f6e66ac37d74fad00a4a4c23e9482b78af2` |

Found inside the v0.4 bundle, said: files with a truncated name (`spec/core_ideas.`, `lib/smallest_slice.`, `lib/open_questions.`,
`tests/sp1-core-ideas.`, `tests/sp3-open-questions.`) and two named after a chat reply (`Gemini said`,
`Gemini said tests/sp5-title.test.js`). They are the pipeline misreads 0.60.226 recorded from his error report on 2026-10-24
(idearium/repo/proof-run.js), kept as evidence.
