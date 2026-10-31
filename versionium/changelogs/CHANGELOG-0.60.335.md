# 0.60.335 — skip buttons (AC7) and his agents for the Void and the Workshop (AC5)

James, 2026-10-31:
> "also its too back and fourth lke we are. I also want skip buttons which will autofill generic/default values in each step of the pipeline."
> "and also the idearium settings, so i can change the agemnts for the spacial void and spec workshop."

## Built

- **AC7, skip:**
  - **In the Spec Workshop,** a SKIP button fills every empty section with a generic first line for its kind (purpose, scope, constraints,
    interfaces, acceptance, build order…). Each line is marked `(default)`, and his text is never touched.
  - **In the pipeline,** the plan step has "SKIP — PLAN FROM THE SPEC NOW": the no-agent plan, one phase per section, without waiting for
    an agent.
  - **For agents and Copilot:** `POST /api/workshop/:id/skip` and the `workshop skip <id>` row.
  - The Void's slider defaults (normal, stable) are ready; their button comes with the Void's rebuild (AC6).
- **AC5, his agent per page:**
  - **In the settings:** Settings › Routing & fallback › **Page agents** chooses the agent for the Spatial Void and for the Spec
    Workshop (a provider and an optional model), or "learned" (Copilot's router picks, as before).
  - **How it applies:** his choice is tried first, and the router's next comes after it if it is down.
  - **For agents:** `GET/POST /api/settings/page-agents` and the `page-agents` row.

## Proof

- `tests/modules/test-skip-and-page-agents.test.js` **4/4**:
  - only empty sections are filled, each marked;
  - the plan and Void defaults;
  - his choice goes first for its page only, and "learned" undoes it;
  - a bad page or provider is refused;
  - the route, button and rows are wired.
- **Not yet driven in Clear Glass.** The screens are checked by the wiring test only. This is said here, not hidden.

## Next in this map

AC1–AC3 (the control panel), AC4 (each phase's folder), AC6 (the Void on his toolkit, once he confirms).
