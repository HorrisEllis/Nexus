# 0.60.334 — the agents' control panel, each phase its folder, his agents for the Void and the Workshop, skip buttons (specced, mapped)

James, 2026-10-31:
> "can we have a full control panel for the agents intents, and everything they touch in idearium? in the repos specific setting."
> "do it. also find the phases with the code tab. consolidating the ideas and notes tab, what if we put each phase is a pretermined
> folder/location of the target directory and also the idearium settings, so i can change the agemnts for the spacial void and spec
> workshop. like spacial void needs to be better, maybe use my framework. also its too back and fourth lke we are. I also want skip buttons
> which will autofill generic/default values in each step of the pipeline."

## Found

- **The Code tab and Ideas+Notes are already mapped in his words of 2026-10-19** (`docs/2026-10-19-idearium-control-phasemap.spec`). These
  phases are all open:
  - CT0–CT1: the Code tab, with fewer, wider tabs;
  - IM1: Ideas and Notes as one;
  - IM2: promote an idea to a phase;
  - PC1: phase controls;
  - TB1: one toolbox.
- **The older Code tab map (CT1–CT9) is done.**
- **Most of the agents' records exist; nothing groups or controls them.** Idearium already serves, per repo, the agent's tool events,
  history, gate, routes and late replies.
- **The Void and the Workshop don't let him choose an agent.** They ask Copilot's router, which picks from its learned policy.

## Specced (`idearium/spec/agent-control.spec`, full depth) and mapped (AC1–AC7)

- **AC1–AC3, the control panel:**
  - each intent, with everything it touched (files with diffs, routes, commands, systems, hand-offs, specs, phases);
  - the controls: pause, stop, allow or deny, approve writes, roll back;
  - command rows and the repo's Settings › Agents › Control panel.
- **AC4, each phase has its target folder:** a write outside the folder is refused unless the phase names that file.
- **AC5, his agent per page:** one for the Void and one for the Workshop, tried first; a fallback is said.
- **AC6, the Void on his Innovation Toolkit:** the sliders choose the methods, and each echo names the method it used. Whether this is the
  "framework" he meant is to confirm (AC_D1).
- **AC7, skip buttons:** every pipeline step fills its defaults, and each filled value is marked as a default.

**Order:** AC7 and AC5 first, because they cut the back and forth at once. Then the panel.

**Proof:**
- `test-substrate-spec` 3/3.
- No new DAG problems.
- The 7 phase graphs have no new crossings.
