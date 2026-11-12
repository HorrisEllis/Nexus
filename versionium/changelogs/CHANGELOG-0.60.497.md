# 0.60.497 — an agent can propose restarting COS itself

James, 2026-11-12: "Need to be able to propose restarts."

## Found
An agent could already propose restarting a system (MG18, 0.60.337). COS itself was not a target, so work that needed COS restarted
stopped there (0.60.489 and 0.60.496 both say "not live until COS is restarted").

## Built
- `POST /api/cos/proposals { verb: "restart-cos", target: "cos", why, by: "agent:<name>" }`: held, with its reason. Nothing restarts.
- Taken by him (`cos take <id>`, or Take on the Proposals page), COS restarts itself the way an update's yes does. An agent cannot take it.
- No reason, or a target other than `cos`, is refused. A COS not started to restart itself refuses the proposal, said.
- Command: `cos propose restart cos --why <reason>`, and `cos propose restart|start|stop <system> --why <reason>` (there was a row to list and
  take proposals, none to make one).

## Proof
`tests/modules/test-cos-propose-restart.test.js` 3/3, COS's restart stood in. The real restart is proved when he takes one on his PC.
