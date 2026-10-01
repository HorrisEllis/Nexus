# 0.39.290 — 2026-10-01

James: "my goal is to build these, eventually. im, the idea guy"
James: "years, dude. these are from the last 6 months."
James: "lets fucking do it. need a way to import these and convert them."

## The spec library
Drop a zip of specs and each document becomes an idea with its spec. It's on the Welcome screen as **Import specs**, at `idearium spec-library import <zip>` in the CLI, and at `PUT /api/spec-library/import` in the API.

**Reading the zip** (`lib/spec-library.js`):
- Every file is read once.
- A file that appears in several places becomes one document, which remembers every place it was found.
- Zips inside the zip are opened, two levels deep.
- A program (`.exe`, `.dll`, `.ps1` and so on) is listed as skipped and never read.
- A folder with a `package.json` or `requirements.txt` is one project, not dozens of loose files.
- Each document is sorted by its own name and title into **nexus**, **product**, **personal** or **diagram**. A RHEON spec stays a RHEON spec even if it arrived inside a zip named "nexus-…".
- Word documents are read for their text. Each document's title comes from its first heading or first lines, or from the `name:` line in a native `.spec` file.

**Converting** (`convert`):
- Each document is split by its own structure: Markdown `##` headings, `#` headings, Nexus's `# BLOCK N —` banners, or the whole document as one section.
- The text itself is never rewritten.

**Importing** (`idearium/lib/spec-library-import.js`):
- Every spec, Word document and project becomes an idea, tagged spec-library plus its group and kind, and linked to its spec.
- PDFs, pages, diagrams, schemas and code are kept in the library, with no idea of their own.
- The zip is kept whole, and every original file's bytes are kept.
- A table, `idearium_spec_library`, indexes the library. Importing again adds only what's new; a document already there gains any new places it was found.
- Everything stays on this machine.

**Your real zip:**
- 468 files read: 150 unique, 186 duplicates folded, 1 program refused.
- By group: 85 nexus, 43 product, 8 personal, 14 diagrams.
- Every section's text matches the original exactly.

## Faster spec import
- **Before:** `importSpec` loaded and re-saved the whole manifest for every section, three times over. A 112-section spec rewrote its manifest about 300 times. The library took more than 110 s for its first 87 documents.
- **Now:** the sections are filled in memory and saved once, the same way the file ingest works. All 150 documents import in **8.6 s**. The chunk files are unchanged: same header, same "imported block" tag, agent `import`.

## Fixed
- **Duplicate headings lost content:** in the chunker (`lib/chunker`), two sections with the same heading (say, `## Overview` twice) used to share one key, and the second silently replaced the first. Each now keeps its own.

## Mapped
- **SW1, the spec workshop**, quoted in James's words. It covers:
  - the spec builder, by hand or AI-assisted;
  - the spatial void (RHEON VOID v2 in his library is the design source);
  - an ambition dial;
  - open loops, outside-the-box questions and what-ifs;
  - a d20 cross-domain roll;
  - a reverse causal chain ("a workbench that automatically clears off");
  - inspiration from his own work.

  James stays the idea generator: a suggestion lands on the idea, and only goes into a spec when he takes it.

## Found, not changed
- `tests/modules/spec-import.test.mjs` fails on the code before this change too. It expects an older version of the spec importer. The suite doesn't run it and it isn't listed as a known gap.

Tests: `tests/modules/test-spec-library.test.js` 8/8. Thirty spec-engine and chunker suites are unchanged.
