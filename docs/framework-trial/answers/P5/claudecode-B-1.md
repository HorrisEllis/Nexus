**Goal.** At the minimum, an agent finishes a known task (log in, submit a form, read the result) on a site it has used before, and it notices when it has failed. The better version keeps working after the site changes its layout, with no human help. The best version learns a new site from a single run and repairs itself after site changes, all on a laptop with a small local model.

**Constraints**
- Fixed: no budget, consumer CPU and RAM, no say over how the sites are built, sites can change at any time, CAPTCHAs and bot detection exist, and site terms of service apply.
- Can be changed: "no vision" (the accessibility tree is a structured view of the page, not pixels), model size (a small model only needs to rank a few candidates), and the speed of a headless browser (it can block images and fonts).

**What stays true however a site changes**
- **Users need to see the controls.** Every working form has a label or a placeholder, and an input with a role and a name. Sites redesign their CSS and IDs, but they rarely change the words users read.
- **The browser's own signals.** The accessibility tree, the DOM, network requests and responses, URL changes and cookies are all available through the Chrome DevTools Protocol at no cost.
- **Success can be checked.** It shows up as a URL change, a 2xx/3xx form POST, a session cookie being set, or text such as "Welcome" or "Order #" appearing.

**What has to be in place, and what is missing today**
- **Finding elements.** The agent must find elements by meaning, not by selector. Today's scripts depend on CSS paths and XPath.
- **Checking each step.** The agent needs a pass or fail after every step. Today agents act and assume it worked.
- **Remembering.** Once a working action sequence is found, it should be stored and replayed. Today every run starts over with a model.
- **Noticing change.** Today agents only learn a site changed when something breaks.
- **What tends to be missing altogether.** Explicit failure signals, a record of what the page looked like last time (so changes can be compared), handling for silent rejections (the form submits but nothing happens), and a rule for when to stop and ask a human instead of guessing.

**Two approaches**
- **A. A model drives every step.** At each step, an LLM reads the pruned accessibility tree and picks the next action. This adapts to anything, but it is slow on a CPU, costs the same every run, and gives different results on different runs.
- **B. Compile once, replay, repair locally.** The first time, a small model (or a person) maps the task's intent to elements found by role and label, for example `textbox "Email"` and `button /sign in|log in/i`. That mapping is saved as a recipe, and each step carries an assertion that checks it worked. Later runs replay the recipe with no model and use fuzzy matching on role, label and nearby text. The model is called only for the one step whose match fails or whose assertion fails, and only to choose among about 10 candidate elements. The repaired step is then saved. This runs on Playwright or plain CDP with a 3–8B model through Ollama.

**The choice: B.** It is deterministic in normal running, so it is cheap and repeatable, and it adapts only where something changed.

**Where B is weakest**
- **It assumes labels survive a redesign.** They may not, for example after icon-only buttons or a language change.
  - Fix: fall back to the network layer. Record the form POST's endpoint and field names, which change less often than the page. Also store several clues for each element (role, label, placeholder, name attribute, surrounding text) and require most of them to match.
- **A step can succeed on the wrong element.** The assertion after each step catches this, and the run stops instead of carrying on.
- **CAPTCHAs, two-factor logins and bot detection.** These cannot be solved for free, so they are handed to a person who completes the step in the open browser. Reusing the saved session cookie keeps these hand-offs rare.
- **Canvas-only or shadow-DOM-heavy sites.** The tree can be thin. Report the site as unsupported rather than guessing.

**What this rests on, and what would prove it wrong**
- **The claim:** visible text and form semantics change less often than layout. It rests on accessibility law and plain usability pressure. **It is wrong if:** recipes fail on most sites within weeks even with fuzzy matching. Measure the repair rate per site per month.
- **The claim:** a small local model can pick the right element from about 10 candidates. **It is wrong if:** its accuracy on a labelled set is below about 90%.
- **The claim:** network and URL checks catch silent failures. **It is wrong if:** single-page-app sites report success on the client side with no request.
