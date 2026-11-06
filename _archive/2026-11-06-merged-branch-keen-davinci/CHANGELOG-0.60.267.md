# 0.60.267 — Service type and the Gig metadata options

James, 2026-10-26: "also these bulllet points. can also use a macro." He sent a screenshot of the gig editor after 0.60.266. The title
and Programming & Tech › Software Development were filled. Service type and the Gig metadata options (PROGRAMMING LANGUAGE, FRONTEND
FRAMEWORK, BACKEND FRAMEWORK, EXPERTISE) were empty.

## What changed (FD2)
- **A gig file can say both.**

  ```yaml
  serviceType: AI Agents
  metadata:
    Programming language: JavaScript
    Expertise: [Automation, Scraping]
  ```

  These use Fiverr's own words. The template now asks for both.
- **The gig fill picks them.** After Category and Subcategory, it:
  1. Opens the Service type dropdown and picks the gig's choice.
  2. For each metadata group, opens its tab (by its words; the `*` is ignored).
  3. Ticks each option by the words beside its radio or checkbox. An option that is already ticked is left alone.

  A group or option the page doesn't have is said, with what it does have.
- **The macro.** The gig file is the macro: load it and fill, and every choice is replayed. For anything a gig file can't hold, the
  macro recorder (Settings › Macros) records the clicks themselves.
- **His gig files.** All nine now tick Programming language: JavaScript. Service type is left empty, because Fiverr's service types
  change with the subcategory. Fill it in with the exact words from the dropdown.

## Proof
`clear-glass/test/gig-dropdown.test.js` runs in real Electron. Each of these was chosen, and the page registered it:
- Category: Programming & Tech
- Subcategory: AI Development
- Service type: AI Agents
- The PROGRAMMING LANGUAGE tab: JavaScript
- The Expertise tab: Automation and Scraping

A "Backend framework" group the page didn't have was said. Other suites:

| Suite | Result |
|---|---|
| gig-file (9 files reload clean) | pass |
| field-query | pass |
| autofill-inline | pass |
| clear-glass-autofill | 16/16 |
| cg-agent-doors | 7/7 |
| autofill-transfer | 5/5 |

## Not checked
Fiverr's real page.
