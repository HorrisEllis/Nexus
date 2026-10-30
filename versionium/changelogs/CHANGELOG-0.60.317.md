# 0.60.317 — site data, the widget kept off, the DOM map; pace between dropdowns, service type, metadata bullets

James, 2026-10-30:
> "the accessability man... need a reset site, and a history manger rebuilt into a full page, and then a cookie manager for the logins and a way to clear cookies per site and reset it. continue. fiverr still not working. we need to inject the dom mapping tool i feel like."
> "almost. more timing in between drop down menus. then we need the services, then the bullets for each tab for each catagory."

## Found
- **His machine runs 0.60.297, plus another session's unpushed `macro-elements` work.** That work is kept whole in `_archive/imports/2026-10-30-local-clear-glass`. His Fiverr test ran without DD1 (`main`, 0.60.316).
- **The yellow-on-black look on Fiverr is UserWay.** The panel's six "site's own settings" were the page's own links: the matcher read class names, and UserWay stamps its classes on everything it restyles.
- **"Element not found: [data-cg-choose="1"]".** `choose` marks the dropdown, then uses the mark after its open wait. The category's choice re-renders the section and removes the mark.

## Specced
**`clear-glass/spec/site-data.spec`:**
- **SD0:** reconcile his machine's work onto `main`.
- **SD1:** a per-site switch blocks the widget. Controls are no longer matched by class names.
- **SD2:** an undoable site reset.
- **SD3:** a cookie and login manager, with values masked.
- **SD4:** history as a full page.
- **SD5:** the DOM map is read before the fill.

**`gated-flows.spec`:**
- **GT4:** a pause between dropdowns, and the dropdown is found again when its mark is lost.
- **GT5:** service type.
- **GT6:** the metadata bullets per tab.

## Proof
- `test-substrate-spec` 3/3.
- The DAG has no dangling references and no cycles.

Spec and map only.
