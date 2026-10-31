# 0.60.333 — the .portfolio node import button (upload a portfolio into the settings page)

James, 2026-10-30: **"No md. Nodes you can upload and import to the settings page."**

The `.portfolio` node + its format already existed (PF1, 0.60.299). This adds the door and the UI so you can actually upload one — no markdown.

## What was built
- **Bridge** (`clear-glass/src/ipc/bridge.js`): a lazy `_portfolioStore()` (JAA `cg_portfolio`) + IPC `portfolio:list/get/import/export/create/delete`, and `/cli/portfolio[/export,/import]` so agents get it too (your order of delivery: backend → route → command → UI).
- **Preload**: `cg.portfolio.*`.
- **Settings UI** (`settings/sections/autofill.js`): a **Portfolio** pane — **Import a file…** (reads a `.portfolio`, upserts by id, newer wins), **Export**, and the list with Delete. It mirrors the proven `.autofill` transfer pane.

So the 5 `.gig` nodes load under Fiverr gigs → Load a gig file…, and the `.portfolio` node loads here.

## Reuse
`portfolio.importNode`/`exportNode` (PF1), the transfer-pane pattern (AT1), the JAA store. Nothing new invented beside them.

## Proof
`test-portfolio-node` 8/8 (store import/export round-trip, upsert newer-wins, a bad file refused). The three edited files pass `node --check`. The UI is verified live on your machine (Electron).

## Remaining in this phase
The per-site portfolio picker, and a `route-commands` row so `nexus.command` lists it.
