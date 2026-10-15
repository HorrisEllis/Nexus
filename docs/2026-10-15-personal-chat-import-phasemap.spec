# docs/2026-10-15-personal-chat-import-phasemap.spec
# Chats that are not Nexus's: an importer for ChatGPT exports and a listener for his personal accounts, both feeding the
# person model through the intelligence system. MAPPED 2026-10-15, before building (docs/CLAUDE.md rule 1). Nothing built.
# Registered in docs/SPEC-REGISTRY.spec. Feeds the Fiverr ledger (docs/2026-10-15-fiverr-ledger-phasemap.spec) only through evidence, never through a chat's own words.

origin:
  date: 2026-10-15
  james: >-
    "I've wanted that for the my agent chats for my personal accounts. like can we add a listener for chats outside of nexus, like if its
    not a contract, or request from nexus. settings for this. i want it to collect anything novel like a paint roller, so i can index old
    chats from chatgpt, maybe import" · "can we make a tool to import chatgpt data? i want it to save to nexus into the model of me, running
    it through the intelligence system, what do you think?"
  reading: >-
    The coder's reading (his to correct). The message was cut off after "maybe import", with part of an earlier reply pasted into it. (1) A
    listener in Clear Glass that records chats on his personal provider accounts when the chat is not a Nexus job, switched on per provider in
    Settings. (2) An importer that takes the ChatGPT data export and files the old chats. (3) Both feed the person model (copilot/lib/person-model)
    through the intelligence system. "Anything novel like a paint roller" is read as: keep the ideas and tools that are new to Nexus (an idea, a
    method, a component), not everything he ever said. TO CONFIRM: what "a paint roller" stands for (a tool he found? an idea that was
    novel?). The novelty test below is a guess until he says.

found:
  - "copilot/lib/person-model (index.js, lattice.js): typed lattice with provenance STATED / OBSERVED / INFERRED; trigger, sensitive and boundary accept STATED only; observe() requires evidence.where; noteObservation() goes to a review queue only he can promote (the same rule as idea-provenance IP-5); purge() is a real delete"
  - "clear-glass/src/page/nexus-chat.js reads a watched page's text every 2 s from the main process (no injection); clear-glass/src/downloads/artifact-chat-index.js already keeps a .response file per captured item and an index.db"
  - "Clear Glass keeps the provider's agent session (persist:ncp-<provider>) apart from the default session his own tabs use (src/cookies/session-hub.js): that difference is how a Nexus-driven tab is told from his own"
  - "no ChatGPT importer exists (grep, 2026-10-15)"

axioms_consulted:
  - "USER_AUTONOMY: his chats are his; capture is off until he turns it on, per provider. -> PI2"
  - "§0.3 nothing lost, but purge() is real: a person asking to be forgotten is not argued with. -> PI1, PI3"
  - "§1.1 evidence over memory: every filed item points at its conversation and message ids. -> PI1, PI3"
  - "§9.1 / RAID is the write authority for the system's own decisions: an import feeds the model through person-model's own door, not around it. -> PI3"

decisions:
  PI0_where_it_is_read:
    question: Extracting from years of private chats needs a model. Which one?
    coder_recommends: >-
      Local Ollama only. Sending old chats to ChatGPT, Claude or Gemini to read them would hand his history to a second company, and Nexus's own rule is
      "local by default". Deterministic steps first: parse, dedupe, group, and drop what is already in Nexus; the model sees only what survives.
    chosen: null
  PI0b_what_a_chat_may_become:
    question: What provenance does something taken from an old chat get?
    coder_recommends: >-
      OBSERVED with evidence (conversation id, message id, date), and onto the review queue. Never STATED, even though he wrote the words: the text
      is old, may be a joke, a quote or a different mood, and STATED never decays. He promotes what is still true. trigger / sensitive / boundary are never
      filed from a chat: person-model refuses them structurally, and the importer does not try.
    chosen: null
  PI0c_the_listener_default:
    coder_recommends: Off for every provider. When on, only chats on his own session, never a Nexus-driven tab, never a page he has excluded; a visible indicator on the window while it records.
    chosen: null

phases:
  PI1_the_importer:
    status: OPEN
    systems: [clear-glass, core]
    files: [lib/chat-import/chatgpt.js, lib/chat-import/index.js, idearium/cli/route-commands.js]
    depends_on: [PI0_where_it_is_read]
    does: >-
      Reads the ChatGPT export (the zip, or conversations.json / its numbered parts) and walks each conversation's message tree along the current branch (and
      keeps the other branches, marked). Output: one .node per conversation (title, dates, messages with ids), deduped by content hash so a second import adds only what is new. Runs on his
      machine; nothing leaves. A command row (`chats import <path>`) so an agent can run it too. Writes the format as found in his real export: built to the documented shape, proven on a fixture, to be checked against his file.
    proof: "a fixture export with a branch, an edit and a regenerated reply imports to the right tree; importing twice adds nothing; a malformed conversation is skipped with a reason, the rest import."

  PI2_the_listener:
    status: OPEN
    systems: [clear-glass]
    files: [clear-glass/src/page/personal-chat.js, clear-glass/renderer/settings/sections/privacy.js, clear-glass/src/options/store.js]
    depends_on: [PI1_the_importer]
    does: >-
      Per-provider switches in Settings (off by default). For a page on his own session, reads new messages as nexus-chat.js reads a page, and files them through the same node
      shape the importer makes, so an imported chat and a live one are one kind of record. A Nexus job's tab is skipped by session. A chat he marks private is never read.
    proof: "a stub page on the default session is recorded; the same page on a provider-agent session is not; with the switch off nothing is read."

  PI3_the_intelligence_pass:
    status: OPEN
    systems: [intelligence, copilot, core]
    files: [lib/chat-import/extract.js, copilot/lib/person-model/index.js, intelligence/routes.js]
    depends_on: [PI1_the_importer, PI0b_what_a_chat_may_become]
    does: >-
      The ordered pass: (1) drop what Nexus already has (ideas, notes, components, by hash then by overlap); (2) local model proposes candidates: an idea, a
      method, a tool, a recurring pattern, each with the message ids it came from; (3) person-model.observe() with evidence.where = conversation + message; (4) the review queue.
      A Nexus-side count of what was proposed, kept and dropped, so the pass can be judged.
    proof: "a fixture chat with one new idea and one already in Nexus files exactly one candidate; a sensitive remark files nothing; every filed item has evidence a reviewer can open."

  PI4_the_review_screen:
    status: OPEN
    depends_on: [PI3_the_intelligence_pass]
    does: Library -> Imported chats (search, the review queue with accept / reject / correct, a purge per conversation). Nothing reaches the person model as stated without his click.

addendum_2026_10_15_b:
  james: >-
    "or maybe even make a tamper monkey script for my firefox browser also. like noting skills, patterns, grammer, comminication patters,
    behavior patterns, good or bad, i need objective, invariants? then i want a listener, maybe a plugin? like i want it to log my chats even
    when im on my phone, like have a setting in clearglass, to create a chat listener, that listens for new chats, logs any new data, using
    the timestamp as the source of truth. what do you think? maybe per account also?"
  coder_reads: >-
    (1) A Firefox userscript as a second capture path. (2) Patterns he can rely on: measured, not guessed. (3) A listener that also gets
    phone chats. (4) The provider's timestamp as the order of record. (5) Per account. The coder's pushbacks, his to overrule: a phone chat cannot
    be seen live by anything on the desktop, only fetched after the fact; a timestamp orders records but is not a unique key; "good or bad" is a judgement
    and stays labelled inferred, while "objective" means counted.
  added_phases:
    PI5_the_sync:
      status: OPEN
      depends_on: [PI1_the_importer]
      does: >-
        For each account with the switch on, Clear Glass lists the conversations the provider holds for that account (phone chats included, because the provider holds them),
        and fetches those updated after the last sync. Key = account + conversation id + message id; order = the provider's own message time; capture time is kept apart. The
        endpoints are the provider's own page API, undocumented, so they can change without notice: UNVERIFIED here, to be checked in Clear Glass against a real session, and a failure says so rather than
        returning nothing. Fallback that always works: re-import a fresh export (PI1 dedupes).
    PI6_the_firefox_script:
      status: OPEN
      depends_on: [PI2_the_listener]
      does: A userscript (the format the Guardian userscripts already use) that posts new messages from a chat page in Firefox to Nexus on localhost, under the same per-account switches, same node shape. Works only while Firefox has the page open and Nexus is running.
    PI3b_the_measured_patterns:
      status: OPEN
      depends_on: [PI3_the_intelligence_pass]
      does: >-
        Counted features first, no model: message length, question rate, time of day, spelling and word-repeat rates, how often a request names its end state, how often he restates a
        request, topics by frequency. An INVARIANT is a feature that holds across at least N chats in at least M separate months, filed OBSERVED with the counts as evidence. A model's reading
        ("a recurring blocker", "a strength") is filed INFERRED, labelled as the model's, never as a measurement. Nothing about health, mood or history is inferred from style.

build_order: [PI1_the_importer, PI3_the_intelligence_pass, PI3b_the_measured_patterns, PI5_the_sync, PI2_the_listener, PI4_the_review_screen, PI6_the_firefox_script]
build_order_reason: >-
  The importer needs no Electron and can be proven here; the extraction decides whether the whole idea is worth having, so it comes before the live listener, which can only be checked in Clear Glass.
