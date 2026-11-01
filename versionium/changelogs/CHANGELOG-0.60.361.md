# 0.60.361 — CP6b: RAID approves what COS does by rule

James, 2026-11-01: "cos backend, and hooking into idearium and raid. cos resource manager per compartment"

## Where it stood
COS already had a resource manager for each compartment (CP6a, 0.60.356):
- caps (heap, resident limit, CPU priority), set by layer and read back from the OS;
- an account of the memory and CPU each one used;
- under the memory halt floor, a proposal held for him.

But what COS did by rule, such as restarting a compartment over its resident limit, never asked RAID. His axioms make RAID the only write authority for the system's own decisions (§9.1, §5.2).

## Now
A restart by rule asks RAID first, through `lib/raid-port.js` `approveTool('cos', 'cos.restart <name>', …)`.
- **RAID approves:** a `raid-approved` line goes on COS's ledger, then the restart.
- **RAID refuses, or does not answer:** nothing is restarted, and a `raid-refused` line gives RAID's reason. The port fails closed, so no answer counts as a no.
- **Proposals held for him are not gated.** Taking or dropping one is his act (USER_AUTONOMY).

## Still open
- **The rest of CP6:** RAID balancing load across compartments, plus networks and storage.
- **The Idearium half of his ask, CP9:** a compartment made in COS becoming a repo in Idearium, and back. It depends on CP1, the machine and its door. COS's host has no compartment create, nest or destroy events yet for Idearium to follow, so CP1 comes first.

## Proof
tests/modules/test-cos-resources.test.js passes 7/7. Two of those tests are new:
- **CR-06:** approved → restarted, with the approval on the ledger.
- **CR-07:** refused or unreachable → not restarted, with the reason on the ledger.
