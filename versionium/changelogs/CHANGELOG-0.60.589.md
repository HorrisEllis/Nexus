# 0.60.589 — Open UI in a Clear Glass compartment; gates open for a run

James, 2026-11-18: "Okay build it." (the Open button) · "Wouldn't it be better if we can set gates to open instead of pass, so we can have the whole pipeline debugged at once?" · "I need to be able to open idearium. I can't without opening Firefox"

## What changed
Open UI, and gates open: (1) a system that declares its UI (runtime.process.ui { kind: html, path }) is opened in its own Clear Glass compartment (window.open, agentId compartment:<name>): route POST /api/cos/systems/:name/open-ui, command `open <system>`, then the Open UI button on its card in COS Overview; Idearium declares its UI first. When Clear Glass does not answer, that is said with what to do. (2) A run with gates open (`pipeline-run <id> open`, `pipeline-resume <run> [redo] open`, body { gates: "open" }) records each failing step as the verdict it would have been ("gate open — would stop here: …") and runs the steps after it; it ends "debugged", never ok; a resume keeps its gates; the steps see {{vars.gates}}. Idearium's build takes { gates: "open" }: its test-first gate records that it would have stopped and goes on to the coders. test-pipeline-waits-for-a-system 8/8 (PW-08 new); test-plan-code-run-attention 48/48; test-cos-console 11/12 and test-cos-console-tab 3/4: CC-09 and CT1-04 (driven in Clear Glass) fail the same with the committed code (checked), the machine's, not this change's.

## Files
- cos/manager/server.js (open-ui route), cos/manager/cli.js (open; pipeline-run/resume open), cos/manager/supervisor.js (view carries ui), cos/ui/overview/page.js (Open UI button)
- cos/automation/pipeline.js (gates open, run status debugged), cos/automation/routes.js
- idearium/api/index.js (_phaseBuild gates: test-first recorded, not stopping), idearium/compartment.json (its ui)
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-08

## Not done
COS and Idearium load it at their next restart. The NM1 pipeline's build step passes {{vars.gates}} once its body is updated.
