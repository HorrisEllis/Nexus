# 0.60.583 — the memory line is the machine's own; COS waits on Windows less

James, 2026-11-18: "baseline deviation or the intelligence system" · "just get the system stable. nexus needs to be able to code. work better?"

## What changed
the memory line is the machine's own, and COS waits on Windows less: (1) lib/prevention.js: after a memory crisis heavy work waited a day for a fixed 25% free; his machine normally sits near 24%, so DeepSeek was held 149 times (12:53 to 15:10). The line is now this machine's usual free memory less 2σ (Welford, kept in prevention.json), never below 20% (the monitor's warning line), never above 25%; with fewer than 30 readings the fixed 25% holds. Whether a model fits stays RAID's fit rule. (2) cos/manager/duties.js: the minute snapshot's memory read never blocks COS (async, through PowerShell; wmic is gone from Windows 11, so it had read nothing); the snapshot uses last minute's reading. (3) supervisor.js: taskkill gets a 15 s limit (it had none). test-prevention 9/9 (PV-08 new; PV-07's Windows import fixed), test-cos-outlive 8/8, test-cos-hidden-windows 4/4; test-autopilot-handover 5/7, the same AH-01b and AH-04 fail before this change (checked).

## Files
- lib/prevention.js: lineFor(baseline), _observe (Welford)
- cos/manager/duties.js: perPidMemoryMBAsync; the snapshot never waits
- cos/manager/supervisor.js: taskkill limit
- tests/modules/test-prevention.test.js: PV-08; PV-07 import

## Not done
The 50 s stall's cause is still to be named by MG20's ledger lines. Systems the manager starts still die when the service kills it.
