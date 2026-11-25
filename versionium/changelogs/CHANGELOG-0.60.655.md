# 0.60.655: COS can stop what it starts

James, 2026-11-25: "you need to fix it so cos can shut it down. like that needs to be solved." · "this is meant to be autonomous." · "shouldn't models be run in thier own processes? that we can control in cos ui?"

Each model already runs in its own process (one engine per model, listed in COS as `model-…`). What was broken: after COS restarted, the engines it had started kept running but COS no longer held them, so nothing but Task Manager could stop them; and Cancel on a pipeline run left its build running.

- **COS adopts what answers on a declared port.** When a model's engine is asked for and its port already answers, COS takes that process as its own instead of starting a second copy; every minute it also adopts any declared system that answers with no process held. An adopted engine is stopped, idled out (after 10 idle minutes) and counted like any other.
- **COS ends strays.** A program a declaration runs (the model engine) running with no declaration holding it is ended, and the ledger says so (`stray-ended`).
- **Cancel ends the step's whole process tree**, the build it started included; so does a step's time limit (before, only the step's own process ended and the build it started ran on).

Needs: a restart of COS (its manager reads this code when it starts).

Not proven yet, said: the supervisor's tests fail as many on the old code as on the new right now, because the PC had 0.4 GB of memory free and those tests read the real free memory (a flaw of the tests; they are rerun when memory is free). The script runner, the pipeline and the supervisor parse; nothing else was changed.
