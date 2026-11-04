# 0.60.342 — GT6b: Fiverr's metadata dropdowns

James, 2026-11-01, filling a gig in Clear Glass: "still not doing the metadata. everything but the meta data."
Then: "i want the macros in the settings to be blocks with settings, gates between them with the delays type and everything else the gates can do"

## The cause
His screen shows a Gig metadata section with three tabs: AI ENGINE*, DELIVERY TYPE* and PROGRAMMING LANGUAGE*. AI ENGINE's choices are a
"CHOOSE ..." dropdown beside an "Other" radio button.
- **One choice seen.** The metadata filler (GT6, 0.60.320) knew a tab's choices only as checkboxes and radio buttons. On AI ENGINE it saw one
  choice, "Other", so every engine he named was reported "not offered".
- **A dropdown taken for a tab.** The tab reader also counted "CHOOSE ..." as a tab, because it is written in capitals.
- **Why no test caught it.** MD-01 to MD-06 had no dropdown tab.

## The fix (clear-glass/src/autofill/gig-fields.js, clear-glass/src/ipc/bridge.js _gigMetadata)
- **Found.** A tab's dropdown is found by what it is (a `<select>`, a combobox) or by what it shows (CHOOSE / SELECT …), never by a class name.
- **Picked as a person would.**
  - The dropdown is opened with the pointer.
  - Its options are taken as what appeared on the page.
  - The option is clicked.
  - The chip is read back, with a choice's timing.
- **A real `<select>`** still goes through the driver's choose, as Service type does.
- **Read back from the panel, never the open list.** The first version passed its gate by seeing "ChatGPT" in the still-open list, then lost
  it when the list closed. The read-back now counts only what the panel shows, not the list's own options.
- **Not offered** is said with the dropdown's own list. "Other" is never ticked for him.

## Proof
- tests/modules/test-gig-metadata-glass.test.js 7/7. MD-07 is a page shaped like his screen: Claude and ChatGPT picked and read back, Grok said
  with the list, Other untouched.
- 12 other Fiverr and dropdown suites green (fiverr-works 11/11, gated-dropdowns 6/6, choose-refind 7/7, gig-all-fields 5/5, …).

## Mapped, not built
His macros as blocks with gates between them: docs/2026-11-01-macro-blocks-phasemap.spec (MB1 the runner, MB2 the blocks UI, MB3 one gate
editor shared with pipelines).
