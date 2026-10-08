# 0.39.358 — 2026-10-06

James (his screenshot: the spec workshop opened from nexus/core, one blank Purpose section): "where are the quick spec templates and the photoshop template start screen"

## Why you didn't see it
The picker from 0.39.357 is the workshop's start page. But I had only made a **promoted idea** go through it. Opening the workshop **from a repo** went straight into the writer. nexus/core has no `.spec` file, so the writer had nothing to show and opened a blank Purpose. The picker was reachable only through the SPEC WORKSHOP name at the top left, and nothing said so.

## Now
- **A repo with no `.spec`** opens the picker with that repo as START FROM. Pick genesis, a quick-spec template, or + CUSTOM / MANUAL, then CREATE. The spec is made for that repo, and saving writes its `.spec` there.
- **A repo that has a `.spec`,** and a library document, still open straight into the writer, because there's something to edit.
- **+ NEW SPEC** is now in the bar while you're writing. It opens the picker.
- The document now says **NO .SPEC IN ITS REPO YET — SAVE WRITES ONE** instead of the misleading "NOT IN A REPO YET".

## Proof
- **`test-template-picker` 3/3.** TP-03 is extended, in Clear Glass against the real router:
  - `?from=repo:` for a repo with no spec shows the picker, with REPO set as START FROM
  - genesis plus CREATE gives a workshop on that repo from genesis, and the note reads right
  - + NEW SPEC goes back to the picker
- **`test-workshop-full` 10/10.**

## Versions
- idearium 4.33.1 (PATCH)
