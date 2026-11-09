# 0.60.465 — one Automation tab: Pipelines, Hub and Deployments off the rail

James, 2026-11-09: "Okay now automation and pipelines have 2 tabs for some reason… Deployments? Hub? What is this noise? There's supposed to be one
fucking tab. Why are you adding three tabs to do the same thing? You're just fucking adding noise, pissing me off." · "Yeah. It should all exist in
one tab."

The coder's fault, said: each backend piece of 0.60.445–0.60.455 was given a page of its own, against his one way in.

## Changed
- `cos/manager/contract.json`: the pages pipelines (PC1's read-only boxes), hub (OC8a) and deployments (OC4a) are `nav: none`.
  - Each keeps `navBefore` and the reason.
  - Their pages, routes and commands stay: agents, the CLI and ERAVOS use them, and a page still opens by its address (§0.3).
- Preview, not built: `cos/ui/automation/preview/one-tab.html` / `one-tab.png`. Automation as the one tab:
  - the Hub becomes one status line (which parts of automation answer);
  - Deployments become Runs (where each ran: COS or a system; take, refuse, recall there);
  - the Pipelines boxes are gone (the canvas is ERAVOS's);
  - Start at boot lives only in Settings (it was in Automation › Supervision too).

## Proof
- test-cos-hub: 7/7.
- test-pipeline-box: 6/6.
- test-cos-deploy: 5/5.
- test-cos-ui: 6/6.
- test-cos-console: 11/11.
