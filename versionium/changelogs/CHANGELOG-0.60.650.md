# 0.60.650: COS's supervisor owns the model engines

James, 2026-11-24: "can you hook that into cos superviser?"

Until now the bridge started each model's engine itself and left it running, and nothing in Nexus could stop one: after a restart, two copies of the 3b held 3.8 of the card's 4 GB and Windows would not let anything but COS's own account end them. Now:

- **The model server declares its engines**: one process per model that is on, written from its settings into its own declaration (`inference/inference.cos`, this PC's paths, never committed). Each is started on demand, with a health check on its own port.
- **COS's supervisor runs them** like every other process: started when a model is asked for, its idle clock reset on each use, stopped after 10 idle minutes, restarted after a crash, stopped with COS. They show in COS's systems list as `model-…`.
- **COS reads new declarations while it runs**: `POST /api/cos/systems/rescan` adds a process a system declared since COS started (it starts nothing, and never touches a running one).
- **The bridge asks COS** to start an engine and never starts one of its own.

Checked: the supervisor's tests (8 of 9 pass, one new: a rescan adds a process live and starts nothing; SV-04 is an existing flaky test that also fails without this change, 1 run in 3); the model server's tests (11 pass); the bridge's tests pass. Needs: a restart of COS so its manager runs this code.
