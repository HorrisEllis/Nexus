# 0.60.295 — the per-site Pipelines and Gates settings shown in the Site settings popup

James, 2026-10-30:
> "merge and push so i can download"

0.60.293–0.60.294 were merged, at his request, before the 102-suite regression comparison against 0.60.292 had finished. When it finished,
it found one real gap:
- **The Site settings popup** (toolbar › this site) drew only its own fixed list of groups. The per-site **Pipelines** switch (PL10) and
  the **Gates** timing never appeared.
  - Both groups are drawn now.
  - Any group the key table has that the popup's list lacks is added at the end, so a new setting can no longer be hidden this way.
  - `test-site-settings-ui` is 3/3.
- **GM-02's stand-in page** had no `insertText`, which every real Electron page has. Since 0.60.294 the driver types key by key, so the
  stand-in needed it. `test-gig-fill-menu` is 3/3.

The rest of the comparison:
- **Green again:** `test-about-and-nodes` (AN-03) and `test-template-picker`.
- **browser-shell:** failed once during the side-by-side run and passed 28/28 alone; it was load timing.
- **Failing the same way on 0.60.292 (not caused by these releases):**
  - window-frame;
  - clear-glass-accounts;
  - accounts-portal-settings;
  - node-schemas;
  - readme-generate;
  - repo-carve;
  - repo-settings-ui;
  - workshop-full.
