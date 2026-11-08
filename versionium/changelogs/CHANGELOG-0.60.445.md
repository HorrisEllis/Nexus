# 0.60.445 — OC4a: deploy to any system

James, 2026-11-08: "Also the automation is to deploy agents to systems." · "can we do that? 0c4? then back to emerge. how long will that take?"

## What it does
- **Deploy from COS** a task, an agent or a pipeline to any system COS knows. Use the cockpit's **Deployments** page, `cos deploy`, or POST /api/cos/deploy.
- **Every deployment is a COS proposal.** It uses the same kind of proposal as Add system (SC4), not a second mechanism.
  - His own deployment is taken in the same click.
  - An agent's waits for him in Proposals. Nothing runs until he takes it.
- **A task runs on its target system.** A task is a call to one of that system's own routes (`"<METHOD> <path>"`, e.g. `GET /health`).
  - COS calls it on the system's own address, through its door, never its files.
  - The deployment ends **done** or **failed**, with the status and the start of the reply. A system that is down fails with its error.
- **An agent or pipeline deployment** is recorded, with "no runner yet (OC4b)". Their runners are next: a hat handed to copilot, a pipeline to Clear Glass.
- **Recall** stops a deployment that is still taken or running. Only a person or a rule can recall one.
- **Every step is on COS's ledger:** held, taken, deployed, done or failed, recalled.

## Where it lives (sovereignty)
- **COS's own folder:** `cos/manager/deploy.js`, the page in `cos/ui/deployments/`.
- **COS's own contract:** its routes and page are declared there, as COS's registry.
- **No Loom, no central registry.**

## Proof
tests/modules/test-cos-deploy.test.js: 5/5.
- His task runs on a stand-in system's route; every step is on the ledger.
- An agent's deployment is held until it is taken.
- Refusals are said:
  - an undeclared system: 404;
  - a task that is not a route call: 400;
  - a system that is down: failed with ECONNREFUSED;
  - a 500 from the system: failed with its status.
- Agent and pipeline deployments are recorded, not run.
- DP-05 drives the Deployments page in Clear Glass through the real cockpit and manager.

Phase OC4 is expanded (not rewritten): OC4a is done, OC4b is open. Both are logged in the phase ledger.
