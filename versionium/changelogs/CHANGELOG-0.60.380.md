# CHANGELOG 0.60.380 — COS's console: the bell, configuration per system, add a system, the command line, one Intelligence (SC1–SC6)

James, 2026-11-02: "Okay. Push. Also have a notification bell for update, system status,  notications"

James, 2026-11-02: "There shouldn't be two intelligence. Intelligence consumer and intelligence should not be two separate things. It'll be using
the .spec. Also needs to be an add system in the proposal section, or just in the general homepage. Need the system cli. Need configuration for
each system. Hooks into the config for each miniworld, set ram, cpu and network limits. Percent or gbs. Ports and network settings. All the
settings like idearium has for the repos. All relevant configuration settings"

"Push" first: 0.60.376–0.60.378 merged to main as PR #229 (COS 0.4.0 built by the cos-app workflow from it).

## The bell (SC1)
- A bell in COS's top bar, with the unread count. Its panel has four tabs: All, Updates, Systems, Notices. Mark all read clears them.
- Kept until read: before this a notice was a toast that vanished.
- **Updates:** GitHub has a newer Nexus (told once per version; clicking opens the update tool), and what an update did.
- **Systems:** a crash, an open circuit, a refused start, a system over its memory or CPU limit, a missed health check, RAID refusing a rule.
- **Notices:** an agent's proposal waiting, a system added.
- `cos/manager/notices.js`; GET /api/cos/notices, POST /api/cos/notices/read; the event cos.notice; the row `cos notices`.

## Configuration for each system (SC2)
- A Configuration tab on every system in COS, laid out like Idearium's repo settings: categories on the left (General, Resources,
  Network, Start, Environment, Wall), one pane at a time.
- **Units are his choice:**
  - memory heap and limit as "25%" of the host, "2GB" or "1536MB";
  - CPU limit as "50%" or "2 cores";
  - bandwidth as "100Mbps", "10MB/s" or a percent.
- **Every setting says where it came from** (declared, his, default, discovered) **and when and how it applies:**
  - memory heap: enforced at the next start;
  - memory limit: watched, warn or restart;
  - priority: enforced and read back from the OS;
  - CPU limit: watched;
  - port: next start, through the env var the system reads, found in its own config.js;
  - listen address: passed as HOST and COS_BIND, applied only if the system reads one (unknown);
  - env vars: next start;
  - autostart, boot phase, on demand: next boot;
  - restart on crash: now;
  - wall mode: next start.
- **Recorded but NOT enforced** (said in red): a bandwidth limit and an outbound rule. Node cannot cap a process's network; that needs the
  Windows service's job objects or a firewall rule (CE5).
- **Layers:** the system's own declaration, then his overrides in COS's data (`systems.json`). COS never writes into a system's folder to
  configure it. Reset returns the declared value.
- **Records:** every change is a ledger line before it applies, and recorded in Versionium.
- **Applied by the supervisor** through one hook: `adjust(decl)` at spawn, boot and crash.
- **Code and routes:** `cos/manager/system-config.js`; GET/PATCH /api/cos/systems/:name/config, POST …/config/clear; the row `cos config`.

## Add a system (SC4)
- **Add system** on the homepage (Overview) and in Proposals: name, folder, command, port, health path.
- **His add** is taken at once: COS writes `<folder>/compartment.json` (the system's own declaration, by his act) and lists the system. Nothing
  starts until he starts it.
- **An agent's add** is held as a proposal for him.
- **Refused, said:** a name or folder already declared, a missing folder or entry, a port another system has.
- `cos/manager/add-system.js`; POST /api/cos/systems.

## The system CLI (SC3)
- **A command line in COS's window:** the terminal button, or Ctrl+`.
  - Verbs: `ps`, `start|stop|restart <system>`, `boot`, `logs`, `config <system> [key=value …]`, `caps`, `usage`, `notices`, `proposals`,
    `take`, `drop`, `add`, `help`.
  - It runs COS's own table in its manager, so it works with every other system down.
  - An agent's act is refused there (it proposes).
- `cos/manager/cli.js`; GET/POST /api/cos/cli; the row `cos cli`.

## One Intelligence (SC6)
- intelligence/server.js starts its queue consumer in its own process. The second declaration (intelligence-consumer) is retired, kept
  under runtime.retiredProcesses.
- COS supervises, caps, configures and restarts one Intelligence; the update restarts one kernel for intelligence/.
- "It'll be using the .spec" is read as: one system, described by its one spec (intelligence/spec/intelligence.spec gains
  MOD-INTELLIGENCE-CONSUMER). To confirm.

## Found while building, fixed
- `cos/ui/serve.js` checked a write's origin against the port it was asked for. A cockpit started on port 0 refused every write; it now
  checks the port it listens on.
- Ctrl+K (Go to) and Ctrl+` never reached the shell while a page's frame had focus. Pages now pass them up.
- Clear Glass's driver: `keyboard.press('Control+`')` sent one key literally named "Control+`", and Enter did not submit a form. Both are
  fixed in `clear-glass/src/driver/glass.js` (modifiers; Enter carries "\r").
- The first Clear Glass shots showed:
  - the console and the bell's panel still on screen when hidden;
  - `ps` printing [object Object];
  - the page title under the manager's pill.

  All three are fixed.
- Two tests counted 14 declared processes in the real tree. With intelligence-consumer retired it is 13; SV-08 and CW-01 now say why.

## Proof
- test-cos-console 9/9 (new):
  - CC-01: units;
  - CC-02: layers and how each applies, the port's env var discovered, network said not enforced, an agent and a bad unit refused;
  - CC-03: a real process on his port with his env var, autostart off skipped, restart never leaves it down;
  - CC-04: the bell;
  - CC-05: the CLI;
  - CC-06: add a system;
  - CC-07: one Intelligence;
  - CC-08: wired;
  - CC-09: the bell, the CLI, Configuration and Add system driven in Clear Glass.
- Also green: test-cos-supervisor 8/8, test-cos-resources 7/7, test-cos-ui 6/6, test-cos-ui-starts 3/3, test-cos-updates 7/7,
  test-cos-app-window 9/9, test-nexus-update 13/13, test-boot-phases 8/8, test-system-tunnel 7/7.
- Failing as before this change: test-cos-walls CW-05 (Electron as root in this sandbox), CT-07, CL-07, SB-06/08 (identical on main).
- Readings to confirm: "miniworld" as each system's compartment, and "It'll be using the .spec".
