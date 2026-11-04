# 0.60.313 — dropdown gates need time, the fill reports its dropdowns, choose gets its fields

James, 2026-10-30:
> "wheich needs more timing for the gates for the drop down menus. also the autofill clip should include the drop downs. also the macro editor needs to have the fields to change all of this. like element text, target text or menu number, in relation to the drop down menu items."

## Grounded
- **The gate's wait is fixed:** `settle()` waits 2500 ms, with a 400 ms settle and one retry. Fiverr loads the subcategory list late, so that isn't always enough.
- **The fill's report is wrong.** `leftToCopy` is computed before the page's own parts run, so the title is reported as both filled and left. The dropdowns it chooses go into a list Copilot never prints.
- **The macro editor has no form for `choose`.**

## Specced (`clear-glass/spec/gated-flows.spec`), phases GT1–GT3
- **GT1:** gate timing per part. Choice gates wait longer, the subcategory waits for the category, and retries grow.
- **GT2:** the fill counts each part once, and Copilot names the dropdowns.
- **GT3:** `choose` gets its fields in the macro editor: dropdown text, element, option or menu number, pick method and timing.

"The autofill clip" is read as Copilot's fill run, to confirm. AF6 already puts the chip on dropdowns.

## Asked: is Emerge ready to code Nexus in?
Not yet, and checked by running it:
- A compiled `.eg` file exports nothing to JavaScript.
- By design, it has no network, timers or async.

**The next step:** a host bridge that lets a component's hooks be called from JavaScript. Then Nexus's pure logic (gates, policies, matching) can be written in Emerge first.

Spec and map only.
