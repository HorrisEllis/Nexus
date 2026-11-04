# 0.60.319 — the service type (GT5)

James, 2026-10-30:
> "almost. more timing in between drop down menus. then we need the services, then the bullets for each tab for each catagory."

The timing was 0.60.318. This is "the services".

## Built (MOD-GT5)

- **The service type is a gig part.** The gig file has `serviceType`, as the page words it, for example `"AI Chatbot"`.
  - `parseGig` keeps it, and also reads `service_type`.
  - It shows in the gig's parts and in the template.
  - The chip menu offers it, and an edit there changes it.
- **The fill finds it after the subcategory.** Fiverr shows "Service type" once the subcategory holds. The section is found by its heading,
  never by a class name. It comes in two shapes:
  - a **dropdown** (SELECT A SERVICE TYPE), chosen with the gated `choose` from 0.60.318;
  - **radio buttons**, clicked on their label with the pointer, as a hand would.

  Either way the choice is read back under a choice gate (8 s, 3 tries).
- **It never guesses.**
  - A service type the page does not offer is refused, with the options it does offer.
  - If the gig has none but the page asks for one, the part says so and lists the page's options. It waits up to 3 s for the section when
    this fill has just chosen the subcategory.

## Proof

- `tests/modules/test-service-type-glass.test.js`: **5/5**. The bridge's real fill drives the real driver on a live fixture page in Clear
  Glass's engine. The section appears 1 s after the subcategory, as a dropdown in one run and as radios in another. The tests cover
  dropdown chosen, radio ticked, refused with the page's options, and left and said.
- FO-01 and GF-02 now expect the new part in the Overview's list. 16 neighbouring suites are green.

## Open

- **GT6:** the metadata bullets per tab ("the bullets for each tab for each catagory"). It is next.
- **Not yet confirmed on Fiverr itself:** that its Service type section reads as either shape. The test page is modelled on his
  screenshots.
- **FO-02 is intermittent.** It failed once in 21 runs on this branch (category, subcategory, tags on the live Overview fixture). It
  did not fail again in 20 reruns, so its message was not caught. Whether 0.60.318's pacing or a race in the fixture causes it is still to
  trace.
- **Not recorded in Versionium from this sandbox.** The boot sync records it on his machine (§17.12).
