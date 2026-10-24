**End-state.** Minimal: an agent completes a named task (log in, submit a form, extract a result) on a known site and *knows* whether it worked. Optimal: the same task survives redesigns with no human edit, and failures are caught and repaired. Exceptional: the agent learns a new site from one run and shares that learning so the next run is cheap and needs no model at all.

**Constraints.** $0 budget: wall. Consumer hardware, so only small local models: wall. No vision: chosen, so treat it as a wall. Sites change without notice: wall. Sites not built for agents: wall. CAPTCHAs and bot detection: partly a wall; the honest answer is to hand off to a human. Brittle selectors: obstacle. Model unreliability: obstacle, because the model can be kept off the critical path.

**Invariants.** Browsers must expose the DOM and the accessibility tree; laws and assistive tech depend on them. Forms still need labels, input types, `name`/`autocomplete` attributes and submit semantics. Network requests and responses can be observed. Users find things by meaning ("Email", "Sign in"), not by CSS paths. A successful action produces a checkable state change: a URL, a cookie, new text, an HTTP status.

**Backward from the end-state.** We need four things. (a) A compact, meaning-based view of the page. (b) Locators that survive markup changes. (c) A deterministic check after every step. (d) A repair path that is cheap. The gaps today: agents act on raw HTML or pixels; locators are positional; success is assumed rather than checked; repair means a human.

**Negative space.** Silent failures are the real enemy: a click that does nothing, a form that resets, an error banner the agent never reads. Also missing: a memory of what worked on each site, and any signal that the site has changed.

**Options.**
A. *An LLM reads the pruned DOM on every step.* It is flexible, but slow on local hardware, it varies from run to run, and nothing in it is learned.
B. *Compiled recipes with semantic locators.* Each task is a stored script whose steps use role, accessible name and label, with ranked fallbacks (label, then placeholder, then autocomplete, then nearby text). Every step has a postcondition. The model is called only when a locator or postcondition fails. It then sees a small slice of the accessibility tree, proposes a new locator, and the recipe is patched and versioned.
C. *Replay the site's network API directly.* It is fastest, but tokens, CSRF and signatures make it fragile.

**Choice.** B, with C used opportunistically for reading results when the response is plain JSON.

**Attack.** The weakest assumption is that the accessibility tree is meaningful. Many sites ship unlabeled `div` soup. Repair: compute names the way a screen reader does (label, aria, text, title, placeholder) and add structural fingerprints (form shape, input order and type). Second failure: a postcondition passes falsely. Repair: require two independent signals (DOM text and a network status). Third: the model proposes a wrong locator. Repair: dry-run it on a cached snapshot before trying it live, and fall back to a human after N failures. Fourth: bot walls. These are out of scope; the agent stops and says why. Fifth: credentials. Keep them in a local vault, filled by `autocomplete` type, and never pass them to the model.

**Answer and its basis.** The design is a headless browser (Playwright or CDP, which are free) driving accessibility-tree recipes, with checked postconditions, a small local model used only to repair, and a versioned per-site recipe store. The claims rest on three things: accessibility semantics are stable because they serve legal and user needs; checked postconditions turn silent failures into loud ones; and the model, called rarely, fits on consumer hardware.

**What would prove it wrong.** The design fails if, across tracked sites, recipes break more often than about weekly; if repairs succeed in under ~70% of cases; if false-pass postconditions appear; or if most target sites lack accessible names. Any of these would argue for options A or C.
