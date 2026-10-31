# 0.60.336 — COS's UI, floating above the event bus (MG18, MG29)

James, 2026-10-31:
> "okay. lets build cos ui. floating, above the event bus. all of the phases, build it. do not make this ugly, cluttered, cheap, or lazy"

Before this, he was offered three options: (a) as mapped, (b) on the ERAVOS canvas, (c) as mapped but data-first, so Looking Glass can host
it later (the coder's recommendation). His "okay" is read as (c): every page declares what it reads and does in the manager's contract.

## Built

**Open it:** run `node cos/ui/serve.js` while COS's manager runs, then open `http://127.0.0.1:7797/`.

- **The shell** (`cos/ui/shell/`). A floating rail and top bar sit over a live drawing of the event bus.
  - The bus has one lane per system. Every event the manager announces travels its lane as a pulse, coloured by what happened. Nothing is
    drawn that did not happen.
  - The top bar shows the manager, host CPU, and memory against the supervisor's halt floor, plus Go to (⌘K).
  - Each page runs in its own frame. The shell holds the one event stream and relays to each page only the events it declares.
- **Overview.** One card per system, sorted so what needs him comes first.
  - Every number is the supervisor's, with the time it was read. Memory the OS did not report says "not read" and why, never 0.
  - Acts: start, stop, restart, reset the circuit, boot core, boot all, stop all. Each is named before it runs, then ledgered with
    `by = person`.
- **Ledger.** Live, newest first, filtered by system, kind and text.
- **Proposals.** Agents' held acts (MG-006). Take runs one as his act; Drop closes it. If the target changed since the agent asked, that is
  shown before Take.
- **Automation.** The supervisor's policy as a form: boot set, restart backoff, circuit, memory floors, idle. Each value says whether it is
  the default or was set. Macros wait on MG7, and the page says so.
- **Each system's cockpit (MG29).** Tabs: Overview, Logs (its own output, live), Events (its component ledger), API (its contract), Data
  (the store, read-only), Files (its data tree), Tests (the real runner, filtered to it). Snapshot says it is not built and names CS1 and
  MG3. Each tab is its own folder in its own shadow root.
- **Planned.** Every screen whose backend is not built, with its phase and what it waits on. None is shown in the rail before it works.
- **COS's manager:**
  - its contract (`cos/manager/contract.json`, served at `GET /api/cos/contract`);
  - the event stream (`GET /api/cos/events`);
  - usage, read back from the OS;
  - each system's last 400 output lines;
  - proposals: an agent holds one, a person takes or drops it, and every step is ledgered.
- **The cockpit server** (`cos/ui/serve.js`, 127.0.0.1:7797).
  - It forwards only the routes the contract lists.
  - It refuses a write from any other origin, so no website can restart a system through it.
- **The theme** is Idearium's, forked (MG_D11): palettes, accent and fonts, with a test that names any token that drifts.
- **Rows** for agents: `cos proposals`, `cos take|drop` (person only), `cos logs`, `cos usage`, `cos policy`.

## Proof

- `tests/modules/test-cos-ui.test.js` **6/6**:
  - the server's gates, including a foreign-origin write refused;
  - the contract is complete;
  - the stream carries each ledger line and each state change;
  - proposals: an agent cannot take one, and a dropped stop does not run;
  - logs and usage;
  - in Clear Glass: a restart from a card, confirmed, lands on the ledger with `by = person`, and an undeclared call is refused and shown
    on the page.
- `tests/modules/test-cos-ui-theme.test.js` **3/3**.
- Every page was driven in Clear Glass against real processes under COS's manager, with no page error.

## His vision, said mid-build (recorded, not built)

James: "why not make each isolated html page also a compartment? this will be a full meta control panel, reploymet, cli interface for the
round table, be able to address specific agents, oarchastration pipeline workflow and cli interface. like this needs to be fully, built,
deploy agents to systems, have them do tasks, jobs, map them to each system like a drone. / completely dynamic canvas? eravos? completely
fluid and dynamic and changes with use, like emergence"

Recorded as MG_D17 in `docs/2026-10-24-cos-manager-phasemap.spec`. It is mapped next, on top of this base and on what other sessions are
building now (the agents' control panel AC1–AC7, orchestrator automation AE3–AE4), not beside it.

## Versionium

This sandbox cannot reach his Versionium. On his machine, the boot sync records this release.
