# 0.39.330 — 2026-10-05

_Released on branch claude/nexus-idearium-overview-yoguem as 0.39.310; main used 0.39.308–0.39.327 for other work meanwhile, so it is renumbered 0.39.330 on merging main. Comments in the code that say §0.39.310 refer to this release._

James: "Clearglass can be used to verify, lifeline can ask other agents. Adversarial agents. Use the confidence score. Can reuse any component in nexus, from loom or the component registery. What do you think?"
James: "Like each repo has a model of the user. Using the intelligence system to understand gaps in communication, ledger for past context. Then each passing test, verified component, gets fed into the primitive field. Make sure you add this to the idearium atlas. Like I want provinance."
James: "Integrating the debug and intelligence system with the desktop envirement. Which is supposed to use debian for each test envirement also the settings tab needs to be cleaned up. Like the desktop envirement settings are shown at all times. Those need to be hidden or show when you clikc the button. Also the iframes. Needs to be rebuilt cleaner and more organized. With catagories of options like github. Not in a long list. In tabs."

## Mapped first
`docs/2026-10-05-verified-primitives-phasemap.spec` lays out the whole loop bottom-up, each phase on what already exists:

| Phase | What | Built on |
|---|---|---|
| VP1 | One confidence score per component, **from evidence only** | `lib/build-verify.js`, `idearium/repo/proof-run.js`, Clear Glass, `lib/agent-build-learning.js` |
| VP2 | Other agents try to break it through lifeline; a finding counts only when it reproduces as a check | `copilot/lifeline.js`, `lib/agent-council.js`, `meta/adversary-suite.js` |
| VP3 | Each repo's lens on the **one** model of James: communication gaps, the session ledger | `copilot/lib/person-model`, `copilot/lib/user-model.js`, `intelligence/gap/hunter.js`, `lib/repo-hat-memory.js` |
| VP4 | The primitive field: the component store tiered draft → proven → crystal | `lib/component-store.js`; the entry gate of the emerge map's CX0 / CL1 / MR8 |
| VP5 | Provenance for every primitive | the store's component.json, `.component` nodes |
| VP6 | Debug and intelligence in the Debian desktop VM | `cos/testenv`, `lib/cos-debug-report.js`, `lib/gap-field.js` |

Found while mapping:
- **Lifeline's confidence scores how a reply is worded, not whether it's right.** It's not an input to VP1.
- **"Primitive field" isn't in the code under that name.** It is the already-mapped CX0 / CL1 / MR8, so it isn't mapped twice.
- **Debian is already the test-VM base.** `cos/testenv` uses it whenever QEMU and the base image exist, and says when it fell back to the process sandbox.

## Built: the Settings tab, in categories (VP7)
The repo's Settings tab was one long column, and it embedded the **whole settings console** in an iframe beneath sections that were already shown inline, so the prompt blocks appeared twice.

Now it has **categories on the left and one pane at a time**, like GitHub's settings:

| Group | Categories |
|---|---|
| Repository | General · Files & danger zone |
| Agent | Agent · Prompt · Hat & tools |
| Environment | Environment · Desktop |

- **Desktop settings** (the VM's state, ports, branch and stop) are hidden until **show desktop settings** is clicked, and unloaded again on **hide**.
- **Environment options** sit behind **show options (N)**. Unsaved edits keep them open.
- **No whole-console iframe.** A view that lives only in the console opens alone (`settings.html?tab=…&single=1`: no console nav, no tab strip), and only when its button or category asks.
- **Prompt blocks render once,** under Prompt.
- **The chosen category is remembered** in this browser.
- **Nothing is lost:** ⚙ settings console still opens the full console.

The code is in `idearium/ui/js/repo-settings.js` (the renderer moved from `app.js`).

## The idearium atlas
The new section covers what a build agent is sent, the Settings categories, the mapped verified-primitives loop, and **where provenance lives today**: for a built file, for a decision, for a connection. It has 239 references, none dead (`test-nexus-atlas-refs`).

## Loom
`loom/maps/verified-primitives-map.js` maps `repo-settings.js`'s real edges: page globals into `app.js`, `agent-blocks.js` and `repo-environment.js`; HTTP into `idearium/api`; and `app.js` calling it. `app.js` and `agent-blocks.js` had no hooks at all, because nothing statically requires a page script. Their boundary hooks are declared here.

The registry was regenerated from scratch: nothing lost against the base, five new wires for this map, and no rejections from it. Entries that didn't change keep their original `registeredAt`, which cut the diff from about 11,000 to about 3,400 lines (new entries and renumbered scanner wires).

## Proof
- `test-repo-settings-ui` **7/7** in Chromium via Playwright: one pane at a time; no iframe until asked; desktop settings hidden, shown, hidden; environment options behind the button; prompt blocks once; the category remembered; no page errors. Playwright isn't a project dependency: without it the browser checks are **skipped and said**, never passed.
- `test-nexus-atlas-refs` 51/51.
- Also green: version-sync 30/30, test-build-context 15/15, test-guardian-job-correlation 120/120 (it pins the Settings tab's agent section), composed-prompt 20/20, repo-agent 35/35, repo-agent-provider 67/67, agent-memory 9/9, build-from-the-spec 5/5.

## Open questions for James
- **VP1/VP4:** what confidence counts as "proven"? The proposal is 0.8. And how many independent passes make a crystal? The proposal is 3, WARP's own rule.
- **VP3:** may the repo lens's hypotheses about you show in Settings → Agent, or only in copilot's person model?
- **VP6:** should every test environment be the Debian VM even when the first setup takes 10–40 minutes, or should tests use the process sandbox until it's set up?
