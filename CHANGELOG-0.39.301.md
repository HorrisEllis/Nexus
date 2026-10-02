# 0.39.301 — 2026-10-02

James: "I just want it to write gigs for me. Not automate talking or posting. Just write the gigs for me."
James: "No. I want ClearGlass to use autofill."
James: "like anything you can do, enterprise grade code, highest leverage, to help with the jobs or earn money."

## Clear Glass writes your Fiverr gigs (3.23.0)
**Settings › Autofill & answers › Fiverr gigs.**
1. **Describe the gig.** Pick your profile and say in one line what the gig offers.
2. **Write the gig.** The co-pilot writes the whole gig: title, category, search tags, description, three packages (name, what's delivered, days, revisions, price), FAQ, and the questions a buyer answers before work starts.
3. **It only uses what your profile says.** It never invents clients, reviews, years or results; with an empty profile it claims no experience at all.
4. **Fiverr's limits are held:** title 80 characters, description 1,200, 5 tags of up to 20, package names 35, package descriptions 100, prices from $5. Anything cut or fixed is shown in yellow, never silently. Every box shows its count against the limit.
5. **Edit, then copy.** Every part has its own **Copy** button, and **Copy everything** takes the whole gig.
6. **Fill the gig editor in a tab** (only when you ask):
   - open the step of Fiverr's editor you want filled;
   - **Preview** shows which box takes which part;
   - **Fill** types it in.

   It only types into boxes. **It never saves, posts or publishes**; you check the page and save it on Fiverr yourself. Matches it is unsure of (only a placeholder to go on) are left for you. Fiverr's own dropdowns and its description box may be custom widgets; those parts are listed as "still to copy", one click away.

## Wired
- **Code:** `clear-glass/src/autofill/gig.js`. It's pure: the prompt, parsing and limits, the parts, field matching, preview and fill.
- **Doors:**
  - IPC: `autofill:gig`, `autofill:gig:detect`, `autofill:gig:fill`;
  - REST: `POST /cli/autofill/gig`, `/gig/detect`, `/gig/fill`;
  - all in the preload and the interaction contract.
- **Registry:** the three gig doors, plus `autofill:proposal` and `autofill:readPage`. Both shipped in 0.39.265 and were never registered until now.
- **Nodes:** regenerated. All of Clear Glass's capability and command nodes were stale at 3.17.0; they're now 3.23.0, with the five new ones.
- **Event contract:** `autofill.gig.drafted` and `autofill.gig.filled` are emitted, declared in the registry, and documented in `clear-glass/src/event-taxonomy.js`, which validates against the shared pattern.
- **Loom:** `gig.js` and `proposal.js` mapped. Rebuilt from an empty registry: 2747 components, rejections unchanged at the baseline 10 / 109.
- **Docs:** a dated addendum in `clear-glass.spec` (component count 104 → 109) and a section in the Clear Glass atlas.

## Proof
- `tests/modules/clear-glass-gig.test.js`: **7/7**, covering:
  - the prompt;
  - every limit and every reported cut;
  - refusals;
  - the parts in order;
  - matching by evidence, with repeated boxes taken in page order and dropdowns and buttons never touched;
  - the fill (value-only, nothing clicked or submitted, unsure matches left for you, the rest listed to copy);
  - the wiring end to end.
- Clear Glass's neighbouring suites still pass: autofill 16/16, library 45/45, screen answers 26/26, agent surface 16/16. Version sync passes 30/30, and so do atlas refs and dangling hooks.
- **The panel rendered in Chromium** on the real settings page, with a stand-in for Electron's bridge returning a gig parsed by the real `gig.js`: 19 parts, each editable and copyable, no page errors from this code.
- **Not proven here:** Fiverr's live gig editor, which only exists on your machine. The preview is how you check it there, and whatever it can't match stays one click away to copy.
