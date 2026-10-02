# 0.39.295 — 2026-10-02

James: "I hate that ui you made. The spacial void is its own page. all of it needs to be isolated, in its own pages. i was describing the pipeline when i told you that, from idearium. current state of nexus.zip is the old one, take the spacial void ad completely rebuild it for the new nexus, non of it will connect to the new one. keep the style, thats what i want most. like steal everything you can from it. no boilerplate, or copy paste. i thought maybe we replace, ideas, and brain storm. Just have the spacial void, with a slider that moves from: normal, creative, outside the box, novel, outlier. then moves another switch from the opposit side: stable, shaky, risky, dangerous, unstable. with those linked togethe"
James: "the ideas come from me though not agents"
James: "lets do it. anything else from nexus"

## The Spatial Void, rebuilt
The old Void came from Nexus v0.54 (`Current_State_of_Nexus.zip`). It was read, then rebuilt for the new Nexus; nothing was copied.

**Its own page.** The Void runs in its own window (`idearium/ui/void.html`), the first station of the pipeline. The old style comes with it:
- the near-black field with stars that breathe and leave faint trails;
- **THE VOID** in wide-tracked Bebas Neue with a slow glow, DM Mono for the working text, Space Grotesk for the body;
- the v4 palette, with your words in cyan and the agent's in magenta;
- sharp 2px corners, thin glowing borders, wide-spaced uppercase buttons.

The three fonts ship inside Nexus (SIL Open Font License), so it works offline.

**The two dials.**
- **Creativity:** normal → creative → outside the box → novel → outlier.
- **Stability:** stable → shaky → risky → dangerous → unstable, running from the opposite side.
- **Linked**, they move together: normal with stable, outlier with unstable. **Unlink** them (⌖) and each moves on its own. The gap between them is the tension, drawn as the line joining the two handles, calm when linked and straining red as they pull apart.

**The ideas are yours.** The Void never writes an idea. It answers yours with an **echo**: questions, angles and checks, shown beside the idea, never inside it.
- **TAKE** a line, and you say what you keep from it in your own words. Only those words go into the idea.
- Creativity sets how far the echo pushes. Stability sets how hard it checks against what's real: what can be built today, and what's already in your repos and library.

**The voices are the old Nexus's engines, rebuilt:**
- **EROSMANCER:** cross-domain transfer and reverse-engineering from end-states. It runs **D20**, which rolls a field and maps one of its mechanisms onto your idea, and **REVERSE**, which takes your idea at its furthest and walks it back to now.
- **HOSTILE TRUTH:** stress-tests, looking for single points of failure.
- **DELTA RISK:** maps how one failure cascades into the next.
- **UNIFIED:** where the two dials meet.

**The field.**
- Every idea keeps the dials it was born at. Born wild but held steady glows magenta; born plain on unsteady ground glows orange.
- Ideas you work on glow brighter. Ones you leave alone fade and drift outward.
- Filters: wild · steady, unsteady, fading, sparks.
- Drag an idea to place it. Drag one onto another to **collide** them, and the Void says how they fit and clash. It never invents a third idea.

**→ SPEC** grounds the idea at "stable", whatever the dials say, then opens the spec workshop.

**It replaces Ideas and Brainstorm.**
- **Create** now holds **The Void** and the spec workshop. Welcome's main button is **Enter the Void**.
- Every idea is in the Void, and so is every unpromoted brainstorm spark. **MAKE IT AN IDEA** turns a spark into an idea.
- The old views and their data stay (§0.3).

**API and CLI.**
- **API:** `/api/void/*`. Echoes are stored in the JAA table `idearium_void_echoes`, and an idea can carry its `void` dials and place.
- **CLI:** `idearium void [list | add | echo | collide | take]`.

## The spec workshop
Its page was the wrong thing. It will be rebuilt as its own page in the Void's style (SW2, next). Its engine stays.

## Found while building
- **Hold first meant "this dial stays".** In the browser, that let go of the dial you moved and dragged the other one along, which surprised. A hold now simply unlinks the two.
- **The idea you opened vanished.** It shared a CSS class name with the side panel and took on the panel's styles. Found in the browser, not by a test, and fixed.
- **Ideas were too faint among the stars.** They're now larger, with a slow halo, and your brightest ones are named.

## Proof
- `tests/modules/test-spatial-void.test.js`: 6/6. It covers:
  - the linked and unlinked dials;
  - that every prompt says the idea is yours and forbids a new one;
  - that an echo never changes the idea, and taking adds only your words;
  - collide, the grounding gate and sparks becoming ideas;
  - that a failed agent stores nothing;
  - the fonts, the page and the nav.
- **Chromium against the real server, with a stand-in agent:**
  - seven ideas and a spark in the field;
  - dials linked, then unlinked to tension +3;
  - an idea spoken, then answered by ECHO and D20;
  - a line taken and rewritten before it went in;
  - no console errors, on wide and narrow windows.
