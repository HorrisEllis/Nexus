# docs/2026-11-14-idea-hub-phasemap.spec — one hub for his ideas, notes and conversations: said once, kept forever, built from.
# The ideas and the calls are James's; the reading of them, the cut into phases and the order are the coder's, said where they are.

origin: >-
  James, 2026-11-14: "im going to lose this idea. I have no central hub for this. my notes, ideas, or anything besides notion." ·
  "i only express this once if i can i hate repitition." · "i need a hub. open loops was meant to track my open loops. adhd toolkit to
  account for my deficits" · "okay. need to build it." · "like idearium/cos is meant to help with all of this. thats one lens of nexus. cos
  to hold all of my ideas. idearium to build them. versionium to back them up. ai to back and fourth with and orchastrate the system." ·
  "i want this expierence in nexus that i can type in, have it logged … then i want persistence across agents, using copilot, like continue
  a conversation in chatgpt, while injecting relevant context, and giving it access to query prior conversation" · "i hate dependancy, on
  something that could leave at any minute." · "i hate losing data, and ideas. its always been a fear, because of how much i regress sometimes"
  Shown with: HorrisEllis/Perspect preview/app/idea.html (an idea and everything built on it; each piece keeps its author; forks).
  Interim hub until this is built: the "Idea Hub" doc (2026-11-14), one row per idea in his words.

status: "MAPPED 2026-11-14. Nothing built by this map yet."

stands_on: >-
  Read 2026-11-14 (reuse before build, §8.6):
  - Idearium already captures his ideas: THE SPATIAL VOID (idearium/ui/void.html, /api/void; his rule there: "the ideas come from me though
    not agents") and /api/ideas (idea.list, idea.create).
  - Guardian already logs every provider chat, one versioned transcript per chat (guardian/lib/chat-transcripts.js, 0.39.254: "i want nexus
    to help remember. persistent memory for ai agents.").
  - Cortex already recalls, ranked (cortex/push-recall.js: lexical, recency, failure lanes).
  - Guardian already dispatches to any provider; copilot is the mind.
  - Versionium already snapshots (Idearium's snapshot path, every build).
  - Open Loops v0.2 and OPEN-LOOPS-SPEC.md were already sent on 2026-11-01 (_archive/imports/2026-11-01-uploads/, map
    docs/2026-11-01-build-from-cos-phasemap.spec) and again on 2026-11-14 — the repetition he hates is the gap this map closes: Nexus held
    them and could not show him that it did.

readings_to_confirm:
  - "\"cos to hold all of my ideas\": read as COS holding the compartment (the hub is a compartment like any system: its data, its wall, its limits), and Idearium's Void as where he writes. Not COS's UI as a notes app."
  - "\"type in like i am now\": read as a chat-shaped journal — his entries, and an AI's replies when he asks for one, both kept as nodes."
  - "MASTERMIND as \"the hub\" (his, earlier) and Nexus as this lens: read as one store with two surfaces. The store is Nexus's (sovereign, versioned); MASTERMIND's vault keeps what he marks private (the ledgers). To confirm which owns what."

decisions:
  IH_D1_said_once:
    status: DECIDED 2026-11-14 (his)
    chosen: "Anything he says, writes or sends is kept once, as a node, and found again by search. Nothing he gives is asked for twice: before asking, the hub is searched."
    by: "his, 2026-11-14: \"i only express this once if i can i hate repitition.\""
    by_the_axioms: "§0.3 (information is never lost), §8.6 (reuse before build)"
  IH_D2_memory_is_his_agents_are_swappable:
    status: DECIDED 2026-11-14 (his)
    chosen: "The record lives in Nexus, not in any provider. Any agent can continue any thread: Cortex recalls what is relevant, the prompt carries it, Guardian dispatches; an agent can also query the record itself."
    by: "his, 2026-11-14: \"i hate dependancy, on something that could leave at any minute.\""
  IH_D3_authorship_kept:
    status: DECIDED 2026-11-14 (his, from Perspect's idea.html)
    chosen: "Every piece of an idea keeps its author and its time; ideas fork; nothing is merged without the trail. This is also his evidence of authorship (he asked for acknowledgement and IP)."
    by: "his, 2026-11-14: \"I want acknowledgement and ip if im inventing something novel.\""

phases:
  IH1_journal_in_the_void:
    depends_on: []
    does: "He types entries in the Void (chat-shaped); each is a node (author, time, text, tags), versioned, never edited in place; an AI reply only when he asks, stored as its own node with its provider named."
    files: [idearium/ui/void.html, idearium/lib/void.js, idearium/api/index.js]
    gate: "An entry written, Idearium restarted, the entry read back unchanged with its author and time; an edit makes a new version, the old one still readable."
  IH2_backed_up:
    depends_on: [IH1_journal_in_the_void]
    does: "Every journal node goes to Versionium as a change (only the change); a restore brings back any day."
    files: [idearium/api/index.js, versionium/]
    gate: "The journal's data folder deleted, restored from Versionium, every entry back."
  IH3_import_once:
    depends_on: [IH1_journal_in_the_void]
    does: "One door brings in what already exists: the Idea Hub doc's table, a Claude or ChatGPT data export, Notion pages, Open Loops' loops, Guardian's transcripts. Each item keeps its source and date; duplicates are recognised, not doubled."
    files: [idearium/lib/void.js, idearium/api/index.js]
    gate: "The same export imported twice gives no duplicates; every imported item names where it came from."
  IH4_continue_anywhere:
    depends_on: [IH1_journal_in_the_void, IH3_import_once]
    does: "From any entry or transcript: 'continue in <provider>'. Cortex recalls the relevant past, the prompt carries it (shown to him before it is sent), Guardian dispatches; the reply lands back in the journal."
    files: [idearium/api/index.js, cortex/push-recall.js, guardian/server.js]
    gate: "A thread started with one provider continued with another; the second reply shows it used the recalled context; both turns in the journal."
  IH5_agents_can_look_back:
    depends_on: [IH4_continue_anywhere]
    does: "A memory.recall tool (Open Loops spec §17) any agent can call through copilot: search his record by words, date, idea or person, read-only."
    files: [copilot/tool-runtime.js, cortex/push-recall.js]
    gate: "An agent asked about a past idea answers from the record with the entry's date; a query outside his record returns nothing, not a guess."
  IH6_ideas_to_builds:
    depends_on: [IH1_journal_in_the_void]
    does: "Any entry can become an idea (/api/ideas), an idea a spec, a spec a build in Idearium — each step linked back to the words it came from, with forks (Perspect's idea chain)."
    files: [idearium/api/index.js, idearium/ui/void.html]
    gate: "An entry turned into an idea, then a spec; the spec names the entry it came from, and the entry shows what was built on it."

explicitly_not_decided:
  - "Where the private ledgers live: MASTERMIND's vault, a private repo, or both (he asked about a private repo, 2026-11-14)."
  - "Open Loops and the ADHD Toolkit as their own compartments under COS, or folded in. Their kernel's port :7820 is Guardian's; one must move."
  - "The paper spec of his agentic system (Gemini's suggestion) — to be photographed and imported by IH3 before anything is designed from memory."
  - "Overlap to settle before IH1 is built (his rule: phases expand, they are not written again): the ledger's covers finds V2_void_engine and V8_the_void_sets_the_end_state (docs/2026-10-02-spatial-void-phasemap.spec) and SD6_an_idea_logged_asked_expanded (docs/2026-10-10-idearium-solid-phasemap.spec) on idearium/lib/void.js. IH1 may be an expansion of SD6 rather than a new phase; read SD6 first."
