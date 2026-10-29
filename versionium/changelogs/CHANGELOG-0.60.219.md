# 0.60.219 — what is running, and what just happened (SP5)

James, 2026-10-23: "Also need a processes screen for background tabs and activity."

Owned by: clear-glass/spec/site-profile.spec MOD-SP-PROCESSES (dated addendum) · map docs/2026-10-23-site-profile-processes-phasemap.spec SP5.
This is the backend. The screen is SP6, the next release; until then the backend is reached through the `glass processes` and
`glass activity` commands.

## What stands on what
- **Electron's own process numbers.** `app.getAppMetrics()` is the same source the diagnostic module already reports. It is joined to every
  page by its OS process id, so a row says which tab it is.
- **Main's own maps of windows and background tabs**, and its `closeBackgroundTab`.
- **The SISO bus.** Every system already emits its events there. One subscriber feeds the activity, as page attention already does.

## Built
- **`src/processes/index.js`.**
  - **`list()`**: one row per process, with its pages under it. Each row gives:
    - the kind: a site's tab, a background tab (named, with its memory), a provider tab, a Clear Glass window, the GPU, the browser;
    - memory and CPU, heaviest first;
    - the totals.

    If the numbers are unavailable, the rows still list, and the reason is given.
  - **`end(page)`** is his alone (decision SP_D3).
    - A background tab is closed.
    - A site's page has its process ended. The tab shows the crash, and a reload starts it again.
    - A Clear Glass window is refused; it is closed from its own window.
    - A page already gone is said as such.
  - **The activity**: the last 500 things that happened, in memory only, newest first, filtered by kind or site. It records:
    - pages loading;
    - background tabs opening and closing, and who closed them;
    - what the driver did to a page (not its reads);
    - his macro runs, including a site's macros run on load;
    - workflow runs;
    - downloads;
    - captured errors.
- **Doors.**
  - IPC `processes:list`, `processes:end`, `activity:recent`, and `ClearGlass.processes` in the preload.
  - `GET /cli/processes` and `GET /cli/activity`. An agent can read both. `POST /cli/processes/end` answers 403.
  - Commands `glass processes`, `glass activity`, and `site` (0.60.215 left out the `site` row).

## Found on the way, closed by his axioms
- `/cli/site-profile` and `/cli/invoke` could change the settings that limit agents: "agents may drive", "mesh", "Guardian listens /
  captures", and the network route. So an agent could lift a limit he had set on it.
- Those keys are now his alone, decided by USER_AUTONOMY and §5.2 (no side door). They change from Site settings in the window. Any other
  caller is refused, with the reason. The person's IPC channels for site settings are denied to agents by name, and so is
  `processes:end`.

## Proof
- `test-processes`: 4/4.
  - PR-01, the activity:
    - kinds and filters;
    - the last 500;
    - one line per bus event;
    - a driver read not logged.
  - PR-02, the list: a background tab with its memory; the window as the window; the GPU and browser processes; the numbers unavailable,
    said.
  - PR-03, ending a process:
    - an agent refused;
    - his close of a background tab, recorded as "by person";
    - a page gone → 404;
    - a Clear Glass window → 409;
    - a site's renderer ended.
  - PR-04: the denials and the command rows; a limit key refused to the CLI and to an agent, allowed to the person.
