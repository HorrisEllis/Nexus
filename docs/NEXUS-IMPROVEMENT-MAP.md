# NEXUS — Combined Improvement Map
**39 ideas from two brainstorming rounds, merged down to 30 distinct ones,
grouped by leverage — how much each one changes the cost of everything
else, not how impressive it sounds.** Every entry has two parts: a plain
explanation of what it actually does, and a **Maps to:** line for the
engineering reference. The plain version should make sense with zero
background. The map line is what you'd hand to whoever builds it.

---

## Tier 1 — Ideas that make every future idea cheaper

These don't add a feature. They change what it costs to add the *next* one.

**1. Teach the system to write its own summary of a working session**, instead
of someone reading the whole conversation and writing it down by hand.
*Maps to: liminal's assumption/structural detectors + the query engine +
module-builder's `map()`, run over a transcript instead of a description.*

**2. Build one standing check that compares what a system's documentation
says it does against what it actually does** — automatically, every time it
starts up — instead of someone manually comparing the two, which is how
every mismatch this session got found.
*Maps to: `spec-drift.js` extended to diff `spec.handshake.components`
against the real `registry-components.js` exports, per system, on boot.*

**3. Put that check on the visual map as something you drag on and wire up**,
so you see a simple "this part's fine / this part's drifted" light instead
of reading a report.
*Maps to: an eravos organism wrapping #2, using the existing
`organism.spawn`/`wire.connect`.*

**4. Have the system build its own checking tools**, using the same
idea-to-feature pipeline it already has, instead of someone coding them by
hand.
*Maps to: `module-builder.js`'s map→spec→QC→build loop, applied to build
#1 through #3.*

**5. Keep a running list of every idea that doesn't get built**, so a year
from now it's something you can look back through and ask "is any of this
possible now," instead of it disappearing into an old conversation.
*Maps to: every what-if idea logged to JAA with a real UUID, same pattern
as gap-loop's `pending[]` residue.*

---

## Tier 2 — Ideas that stop the system from quietly fighting itself

Two systems that already exist, solving the same kind of problem twice,
without anyone deciding that on purpose.

**6. Merge the two separate trust systems** — one decides which AI provider
to route a job to, the other decides whether to trust an outside system —
into one, since underneath they're the same kind of decision.
*Maps to: RAID's constraint-then-fitness scoring unified with kern-v2's
continuous sigma/regime trust decay.*

**7. Let any AI assistant use NEXUS's features directly** — including the
one you're talking to right now — the same way the command line already
can, instead of writing custom integration code for every new tool that
wants in.
*Maps to: expose the component registry as an MCP server, extending "CLI
= UI = API" to "= MCP."*

**8. Let people who each run their own copy of this system discover and use
each other's compatible features automatically** — the way two different
email providers can just email each other without special setup.
*Maps to: the foreign-system handshake's capability-negotiation step,
extended from system-to-system to person-to-person federation.*

**9. If two people's personal assistants are ever allowed to talk to each
other, build it so they can only ask for things both sides actually
support** — privacy built into how it works, not promised in a policy
someone has to remember to enforce.
*Maps to: the same capability-negotiation step bounding assistant-to-
assistant requests by construction.*

**10. Treat the personal version of this system and a future social platform
as the same thing at different zoom levels** — logging into the platform
just turns on your own slice of the system you already have, instead of
maintaining two codebases forever.
*Maps to: `user-model.js` / `affect.js` / the idea-lattice ported 1:1 as a
platform account's backing state.*

---

## Tier 3 — Ideas that let the system notice its own patterns

Right now almost everything is a snapshot — open or closed, synced or
drifted. These turn snapshots into trends.

**11. Notice when something's been "in progress" for a long time with no
real movement** — the same way you'd notice a stalled project — instead of
it sitting there quietly forever with nobody checking.
*Maps to: the content-resonance trajectory model (deepening/dissolving),
applied to a feature's own status history over time.*

**12. Let the system watch its own pace of getting things done and notice
when it's speeding up, slowing down, or stuck** — the same shape as
recognizing any growth curve — so a slowdown is visible before it's obvious.
*Maps to: the sigma/delta-based trend-classifier template, applied to
features-shipped-per-week.*

**13. Let the routing system notice when it's stopped getting better at
picking the right tool for a job**, instead of quietly plateauing with
nobody watching the curve.
*Maps to: same trend-classifier template, applied to RAID's own
routing-success-rate over time.*

**14. Let the system check its documentation against its own code on a
schedule, automatically**, instead of waiting for someone to do an audit
by hand — which is the only reason last session's mismatches got found.
*Maps to: architect's spec builder running the trend-classifier against
its own drift history.*

**15. Track whether a recurring bug is getting worse or whether the fixes
are actually sticking**, instead of a flat open/closed status that can't
tell those two situations apart.
*Maps to: the content-resonance trajectory model, applied to diagnostic's
recurring gap entries.*

**16. Tell apart an idea that's quietly getting more useful over time from
one that's going nowhere** — the same way a growing post can be told apart
from one nobody's reading anymore.
*Maps to: same trajectory model, applied to ideas in the idea-tracking
system as if they were posts.*

---

## Tier 4 — Ideas that make something new and useful, once

The actual features. Valuable, but each one only pays for itself once,
not for everything after it.

**17. Use someone's own past writing to notice if a new piece doesn't match
their usual style anymore** — useful for proving you wrote something,
noticing if an account's been taken over, or catching writing that's
pretending to be a person but isn't.
*Maps to: the content-signature engine's identity-scale drift detection,
evidence-and-confidence framed, never a bare verdict.*

**18. Let someone learn to read facial expressions and body language from
real, labeled examples**, instead of just guessing what an expression means.
*Maps to: the expression engine (real facial-action-unit taxonomy) +
video-tracking module, used to teach general patterns — not to analyze any
specific identifiable person in the source footage.*

**19. Let a camera quietly reflect your own mood back into the system in
real time** — the same idea as a mood ring — instead of having to type out
how you're feeling.
*Maps to: the 34-point face/hand/pose tracking bridge, already wired to
drive the system's own internal "field" state.*

**20. Make sure every command works and autocompletes the same way no
matter which part of the system you're talking to**, instead of some parts
being more finished than others.
*Maps to: closing the remaining component-registration gaps (diagnostic,
idearium) so the existing autocomplete engine has full coverage.*

**21. Let the assistant get more cautious on its own after it's been wrong
or confused recently**, instead of being equally confident all the time
regardless of how the last few exchanges went.
*Maps to: the assistant's own internal state gating how much it's allowed
to do without checking in first.*

**22. Let the assistant notice out loud when it keeps being surprised by the
same thing about you, and ask you about it directly**, instead of quietly
filing it away and never mentioning it.
*Maps to: a flagged "this doesn't fit my model of you" signal triggering a
real question in conversation, not just a stored note.*

**23. Let "what's trending" exist as something you can watch move on a
visual canvas in real time**, instead of only as numbers in a report.
*Maps to: the content-resonance trajectory view, wired in as a canvas
element.*

**24. Use the same pattern-detection built for reading relationships to
instead watch for fake accounts and coordinated pile-ons** — same engine,
pointed at protecting the platform instead of reading the people on it.
This is the version with no privacy question attached at all.
*Maps to: the full behavior-detector kernel, applied to platform-integrity
signals instead of interpersonal ones.*

**25. Notice when an account suddenly starts writing in a completely
different way, and flag it quietly to that person only**, in case it's
been taken over by someone else.
*Maps to: identity-scale signature drift as an account-security flag,
visible only to the account holder, never public.*

**26. On purpose, sometimes show someone a connection different from their
usual taste**, instead of only ever showing more of the same — so the
platform doesn't quietly narrow what people see by default.
*Maps to: the compatibility-matching feature deliberately surfacing
"different wavelength" results occasionally, labeled as such.*

**27. Have the assistant be the one who gently raises a concerning pattern
in a conversation, in its own voice**, instead of a cold automated warning
appearing with no one to ask follow-up questions of.
*Maps to: the private relational-pattern signal delivered conversationally
by the assistant, which also updates its own internal state since it's now
holding something delicate.*

---

## Tier 5 — Ideas that make things safer without changing what they do

Hardening. Nothing here is a new capability — these reduce how badly
something can fail.

**28. Test risky decisions in a safe practice copy of the system before
actually doing them**, starting with the smallest, lowest-stakes part of
the system as a trial run.
*Maps to: the clone-state/simulate/compare cluster (clip/context/
adapter-sandbox), piloted on the trust-relay's circuit-breaker decisions.*

**29. Let a feature that's failed and been rolled back several times start
flagging itself for a person to look at**, instead of being silently
retried forever in the background.
*Maps to: hot-load rollback cycles accumulating a strain score; chronic-
strain modules flagged for human review instead of endless auto-retry.*

**30. Let a repeated task get smarter about retrying** — trying something
different on the third attempt instead of doing the exact same thing again
and hoping it works this time.
*Maps to: a per-job state score changing the retry prompt strategy on
each attempt instead of repeating it unchanged.*

---

## What didn't make the list

Both rounds had a point where ideas stopped pointing at something real in
the codebase and started just reusing words from earlier ideas on systems
that don't have the right shape for them — a routing decision doesn't have
an "audience," a hook registry doesn't have a "mood." Those got cut rather
than padded in. The full reasoning for what got cut is in the two
source documents.
