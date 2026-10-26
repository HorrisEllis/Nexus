<!-- Kept as he uploaded it, 2026-10-24, with: "This is a few days old. But does this help. A project that had auto built 5 phases". What Nexus did with it: CHANGELOG-0.60.226.md. -->
# Error report: looking-glass-bundle-v0_4

Checked 2026-10-22 against `looking-glass-bundle-v0_4.zip` (Node v22.22.2).
No code was changed. This report only records what was found.

## Test run

- `node --test tests/*.test.js`: 6 of 6 pass.
- `node --test tests/`: fails with `MODULE_NOT_FOUND` (Node treats the directory as a module path). Use the glob.
- No `.git` folder is in the zip, so history could not be checked.

## Errors

### E1. `lib/core_ideas.js` does not match the spec (high)
- `SPEC.spec` `core_ideas:` (line 46) defines `ui_is_typed_data` (2.1) and `layers_are_a_runtime_operation` (2.2), plus what follows.
- The module returns a generic invented list: Transparency, Interoperability, Security, Usability, Scalability, Reliability, Efficiency, Adaptability, Collaboration, Privacy, Accessibility, Performance.
- None of those words (except "transparent" in an unrelated sense) come from the spec.
- `tests/sp1-core-ideas.test.js` only checks for a non-empty array of strings, so it cannot catch this.
- `spec/core_ideas.` says empty array on missing config; the code has no such path.

### E2. Proof report says READY on a check that proves nothing (high)
- `proof/PROOF-REPORT.md` and `.nexus/proof-runs/latest.json` have one condition: "a test that proves title as the spec states it".
- The check kind is `file` and only confirms `lib/title.js` exists. It never runs the test.
- The report footer says "Every line above was checked by running it, not by reading it", which is untrue for this run.

### E3. `lib/title.js` has no real spec behind it (medium)
- It only trims a string.
- The SP5 spec text in `SPEC-phasemap.spec` is the SP1 text with the name swapped, citing the same §1.1 and §12.1.

### E4. Mixed module formats (medium)
- `lib/title.js` and `tests/sp5-title.test.js` use ESM (`export` / `import`); every other file uses CommonJS.
- There is no `package.json`. It works on Node 22 only through automatic module detection and will fail on older Node.

### E5. Stray and duplicate files (medium)
- `Gemini said`: pasted plan JSON, not part of the project.
- `Gemini said tests/sp5-title.test.js`: identical duplicate of `tests/sp5-title.test.js`.
- Extensionless leftovers: `lib/open_questions.`, `lib/smallest_slice.`, `spec/core_ideas.`, `tests/sp1-core-ideas.`, `tests/sp3-open-questions.`.
  - `lib/smallest_slice.` is an older, weaker version of `lib/smallest_slice.js`.
  - `lib/open_questions.` is a stub that differs from `lib/open_questions.js`.
- Duplicate specs: `SPEC-phasemap.spec` exists at the root and in `spec/`; `looking-glass-bundle-v0_4.spec` sits beside the bundle folder; `spec/lib/` repeats `open_questions.spec` and `smallest_slice.spec`.
- `README.md` points to `SPEC.md`, which does not exist (the file is `SPEC.spec`).

### E6. Rust and schema side is stubs, and scene fails its own schema (medium)
- No `Cargo.toml` (and no `package.json`): none of the Rust can build.
- `apps/lg-shell/src/main.rs` only prints a line.
- `crates/lg-render/src/rect.rs`: `render_rect` returns a string, not a render.
- `crates/lg-core/src/element.rs`: `Element` is a name wrapper.
- `crates/lg-core/src/schema.rs`: `validate_schema` is a brace counter, not a validator. The check `depth == 0 && byte != last byte` is pointless.
- `scenes/rect.json` uses `dimensions`, but `schemas/element.schema.json` requires `id`, `type`, `label`, `position`, `size`. The scene fails its own schema.
- `tests/sp4-dag.test.js` only checks that both files parse as JSON, so it misses this.

### E7. Minor (low)
- `lib/format.js` is not real YAML (no nesting or lists).
- `stringifyYaml` quotes any string containing a dot.
- `tests/sp0-format.test.js` does not check a round trip.
- Specs say error paths return an empty array; the code never does this.

## Verified fine
- `lib/smallest_slice.js`: input validation is sound.
- `lib/open_questions.js`: matches the PHASEMAP open questions.

## Suggested fix order
1. Rewrite `lib/core_ideas.js` from the actual `SPEC.spec` sections, and make its test check those names.
2. Make the proof check run the tests instead of checking file existence.
3. Delete the stray files listed in E5; fix the README link.
4. Add `package.json` and `Cargo.toml`; pick one module format.
5. Fix `scenes/rect.json` or the schema, and make `sp4-dag` validate against the schema.
