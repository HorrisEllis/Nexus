# 0.39.305 — 2026-10-05

James: "here is an example of an idea i was trying to get built. like it needs to use the templates as default."
James: "like nexus needs to be able to build itself from the spec."
James: "nexus needs to be able to build itself from within also. i havce hundreds of specs i want built. that why i had the resuable architecture"

## What the DAW spec showed
James's `i want to make a daw for my girl` spec came back as boilerplate. Three faults combined:

1. **It was a bare repo.** Saving a workshop with no repo created a spec with no template, described as "bare repo: i want to make a daw for my girl". The standing templates (axioms, architecture, schemas, checklists) were written so every spec would start from them, but they never reached this path.
2. **His words never reached the agents.** "i want to make a edm song for my girl" was saved as a file. The agents writing each section saw only the title.
3. **The prompt made the model echo.** It said "a NEXUS component spec", listed comp_id, seam_id and contract_id, cited "AXIOMS-v1.0, §1.2, §2.1", and pasted every earlier section in full. The small model copied the meta block into every section, one level deeper each time, until the registry section was 64 KB of repeats. Failure modes and integration came back empty.

## Templates are the default frame (SB1)
- **Every new document spec is framed by the standing templates.** The default set is axioms, architecture, schemas and checklists, set by the `specs.default_templates` setting.
- **What a frame does:** each section the templates cover is given its template's text as the shape to fill for this one project. The section stays the agent's to write.
- **Meta and purpose are never framed.** A template's meta describes the template, and the purpose is his.
- **Existing paths keep their meaning.** A template named explicitly still seeds its text verbatim, and `templateIds: []` still means none.
- **A bad setting is reported, not hidden:** an unknown template name in the setting is listed on the spec.

## His words seed the spec (SB2)
- **The workshop's sections become the spec's on every save.** They're kept on the spec for every section's agent.
- **They fill the sections they name:** the purpose comes from his idea and purpose, verbatim, written by "author".
- **An agent's section is never overwritten.** A section he wrote is updated when his words change.
- **A new repo from the workshop is described by his first words,** not "bare repo: …".

## The section prompt is domain agnostic (SB3)
- **What it gives the agent:** the thing being specified in its author's words, its frame, and short, bounded excerpts of what's already written, with an instruction never to copy them.
- **What it leaves out:** internal IDs and "NEXUS component".
- **The section descriptions changed too.** In `blocks.yaml`, meta, purpose, axioms, schema, api and events no longer mention comp_id, JAA or AXIOMS-v1.0.

## Mapped
`docs/2026-10-05-build-from-the-spec-phasemap.spec`:
- **SB4:** check the templates against every real kernel.
- **SB5:** Nexus rebuilds one of its own systems from its spec in a COS branch, proven by that system's own tests (ollama-bridge first).
- **SB6:** his hundreds of specs as one resumable, reuse-first queue under the economy.
- **SB7:** file-tree templates chosen by what the idea is about (Eravos's mods for a music idea).

## Wired
- **Spec engine:** `idearium/spec-engine/index.js` (`_framesFor`, `setAuthorWords`, the new prompt) and `blocks.yaml`.
- **Settings:** the `specs.default_templates` key in `idearium/lib/config-core.cjs`.
- **Repo layer and API:** `idearium/repo/index.js` (ingest takes a description) and `idearium/api/index.js` (`workshop.save`).
- **Loom:** `loom/maps/one-idearium-map.js` gains the save → engine wire and the engine → spec-digest wire.
- **Versions:** Idearium 4.27.0. The spec addendum is in `idearium/spec/idearium.spec`, and the map is registered.

## Proof
`tests/modules/test-build-from-the-spec.test.js`: **4/4**:
- the frames;
- his words, including that an agent's section is kept;
- the DAW case, a prompt carrying his words and the frame with no IDs, no echo and nothing pasted whole;
- the real router's workshop save.

**Updated:** `test-file-tree-plan` now checks that a document section still gets the document prompt rather than the old wording.

**Unchanged:** the spec workshop, spec library, phase proof, build-verify, prove-loop, codegen, component store and settings suites all pass. `test-config-governance` fails 7 of 10 with or without this change.
