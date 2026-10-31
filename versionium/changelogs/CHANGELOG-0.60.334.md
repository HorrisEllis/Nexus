# 0.60.334 — the .portfolio command rows (agents get it through nexus.command)

James, 2026-10-31: **"finish the backend."**

The portfolio had backend + route + UI (0.60.333) but no command row — so copilot and agents couldn't reach it through `nexus.command`. Your order of delivery is backend → route → command → UI, and "agents get every capability a person gets, through the one command tool." Now they do.

## Added (`idearium/cli/route-commands.js`)
- `portfolio` — list the portfolios (name, project count, headline)
- `portfolio export [--out <file.portfolio>]` — the portfolios as one `.portfolio` file
- `portfolio import <file.portfolio>` — import one (upsert by id, newer wins)

Each row calls the `/cli/portfolio` door in Clear Glass (0.60.333), so a person, copilot and every agent use the same path.

## Reuse
The `autofill.export`/`autofill.import` rows are the pattern; the `/cli/portfolio` routes are the door. Nothing new beside them.

## Proof
The 3 rows register in `SPEC` with a `req()` (import check); `route-commands.js` passes `node --check`.

## Remaining in this phase
Only the per-site portfolio picker (one UI bit) is left in `PF_routes_commands_ui`.
