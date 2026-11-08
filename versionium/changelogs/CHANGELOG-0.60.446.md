# 0.60.446 — Fiverr gig autofill, as a userscript

James, 2026-11-08: "I need the automation. I’ve gone to do the fiverr post over and over. I need help with this. I have no one." · "Nexus is to
remove as much effort, beyond thinking as possible."

- **`clear-glass/userscripts/fiverr-gig-autofill.user.js`:** a Tampermonkey userscript for any browser. It needs no Clear Glass, no Nexus and no
  local model, because his PC is down and his all-in-one has 8 GB. On Fiverr's gig editor it shows a panel:
  - the three gigs, to choose from;
  - the page it recognises;
  - "Fill this page".
- **What it fills:**
  - Overview: the title and the 5 tags.
  - Scope & Pricing: each package's name, description and price.
  - Description & FAQ: the description.
- **What it leaves to him:** every dropdown (category, delivery time, revisions) and every FAQ or question row becomes a chip. He clicks a box,
  then the chip; a dropdown's chip copies what to pick.
- **What it never does:** press Save, Continue or Publish. That is his 0.39.301 rule.
- **The rules are Clear Glass's own,** from his screenshots: a page is known by its words, a box by the words of its section, and the pricing
  boxes by their placeholders.
- **Checked:** in Clear Glass's engine (Electron, via `glass.js`, never Playwright), on mock pages built from those facts. Every text part filled
  correctly, a box clicked and then a chip filled it, and no page button was pressed. Fiverr blocks this sandbox, so the live check is his.
- **Also:** three tags in `docs/fiverr/gig-drafts.md` were over Fiverr's 20-character limit and are shortened.
