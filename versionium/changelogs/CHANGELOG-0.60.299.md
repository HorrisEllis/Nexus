# 0.60.299 — PF1: the .portfolio node, and per-site portfolio support

James, 2026-10-30: **"make a .portfolio node, all nodes are physical files in the backend. import and export. and add per site support. same with the macros, and pipeline. i also want macros for the ui not just per sire."**

## What was built (PF1 + the per-site keys)
- **`clear-glass/src/autofill/portfolio.js`** — the `.portfolio` node. `PortfolioStore` keeps your portfolios in JAA (`cg_portfolio`): name, headline, bio, skills, and project items (title, role, description, skills, link, date). `exportNode` / `parsePortfolio` / `importNode` carry it as one **`clearglass.portfolio/1`** file — a physical file you can read, edit, and re-import. An import merges **by id, newer wins**, and an item with no title is refused, never half-stored.
- **`lib/node-schemas/schema.portfolio`** — registers the node type (like `schema.macro`, `schema.pipeline`).
- **Per-site:** `portfolio.enabled` + `portfolio.id` in site-settings (the Portfolio group now shows in the Site Settings popup), with a `portfolioFor(url)` reader — mirroring Autofill. Macros (`macros.enabled`/`autoRun`) and pipelines (`pipelines.enabled`) already had per-site support.

## Sovereignty (§5.15)
A portfolio is your autofill/seller **content**, so the `.portfolio` node lives with Clear Glass autofill — like `.gig`/`.autofill`, not with automation (`lib/automation-nodes.js` owns `.macro`/`.pipeline`).

## Reuse (rule 2)
`transfer.js`'s export/import pattern, `AutofillStore`'s JAA rows, the site-settings machinery. Nothing new invented beside them.

## Proof (headless)
`test-portfolio-node.test.js` 8/8 (create, validate, export, import round-trip, upsert-by-id newer-wins, bad file, bare profile, update/remove); `test-site-profile` 3/3; `test-site-settings-ui` 3/3 (the panel renders the Portfolio group).

## Remaining (mapped — `docs/2026-10-30-portfolio-node-per-site-ui-macros-phasemap.spec`)
PF3 (fill the Fiverr My Portfolio page from the node + the seller profile from your profile — page detection confirmed live), UM1 (UI macros — grounding first), and the routes + command + Portfolio UI (import/export buttons, the per-site picker).
