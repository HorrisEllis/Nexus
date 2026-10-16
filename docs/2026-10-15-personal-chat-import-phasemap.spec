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

addendum_2026_10_15_c:
  james: >-
    "no uses the dom mutator to listen for any new data from clearglass, ledger for each chat url. like it automatically logs the chats by
    provider than by url, with keyworks, etc."
  coder_correction: >-
    The coder's PI2 above planned a new page reader. That was wrong: it was built on 2026-09 (0.39.278, James: "live streams the dom mutation live to the download
    manager, that way we don't lose progress"). guardian/userscript-chat-stream.js is the page's own MutationObserver; it posts each change to /cli/downloads/ledger and
    clear-glass/src/downloads/chat-ledger.js appends it to one append-only file per chat (head: provider, chatId, url, agentId; deltas by turn, reply and thinking apart).
    PI2 is now only what that ledger lacks: an `account` and an `origin` (nexus-job | personal) on the head; keywords per chat from deterministic counting (no model); an index
    by provider then url; per-account switches in Settings; and a check, in Clear Glass, that the observer is injected on his own tabs (injection is by navigation for a tab with an agent id and a matching userscript, src/main/index.js nav.loaded: UNVERIFIED for his own tabs).
    PI1 (the importer) and PI5 (the sync) write the SAME ledger format, so an imported chat, a synced phone chat and a live one are one kind of record. A DOM observer cannot see the phone app; PI5 stands.

addendum_2026_10_15_d:
  james: >-
    "like i want to have it automatically load new chats, like have it run in the background. and log each chat, by url, one by one until it's done.
    then once thats done it logs one by one until it's caught up. only logging novel data, but each one interconnected."
  coder_reads: >-
    A crawler. For each account with the switch on, a background tab (the agent-mesh background tabs and the provider host already exist) visits that account's chat urls one at a time.
    The same DOM observer that feeds chat-ledger.js logs each one; when a chat has settled the crawler goes to the next. Two modes in one queue: BACKFILL (every chat the account has, oldest known gap first, until done),
    then CATCH-UP (a cheap look at the chat list on a timer; only chats whose last-updated changed are visited). This replaces PI5's API sync as the main path, because it uses the page as he does and no undocumented endpoint; the API stays an optional later speed-up.
  phases:
    PI5_the_crawler:
      status: PLAN + SETTINGS BUILT 0.60.55 (lib/chat-crawl-plan.js CC-01..18, lib/chat-crawl-settings.js 39 settings, Settings -> Chat capture CS-01..04); the tab-driving crawler.js is NOT built
      depends_on: [PI1_the_importer]
      files: [clear-glass/src/chats/crawler.js, lib/chat-crawl-plan.js]
      does: >-
        lib/chat-crawl-plan.js (pure, provable here): the queue per account (state: pending / visiting / logged / failed with reason / skipped-unchanged), the cursor that survives a restart, the diff between the chat list seen now and what the ledger holds (a chat is
        revisited only when its last-updated or its turn count differs), the pace (one chat at a time, a jittered wait between, a cap per hour), and the stop rules (a login wall, a captcha or a challenge page, a rate-limit message, three failures in a row: it stops, says so, and waits for him).
        clear-glass/src/chats/crawler.js (needs Electron): loads the list, loads each url in a background tab on the account's own session, scrolls until no new turns render (long chats render lazily: UNVERIFIED), waits until the ledger's `settled`, closes the tab, reports to the plan.
      proof: "plan: 200 chats, restart at 80, resumes at 80; an unchanged list visits nothing; a challenge page stops the queue; the pace never exceeds the cap. crawler: checked by him in Clear Glass on one account, ten chats."
    PI7_the_links:
      status: OPEN
      depends_on: [PI5_the_crawler, PI3b_the_measured_patterns]
      does: >-
        "Each one interconnected": every chat gets edges to the chats it relates to, from evidence only: shared keywords above a threshold, a url or file name quoted in both, adjacency in time, an explicit continuation ("as we discussed"), the same repo or component named.
        Edges go into the chat index and into the person model's lattice (it has typed edges with provenance). A link names why it exists; there are no unexplained links. "Novel only" = a turn already in the ledger is never re-logged (the ledger refuses a mismatched add and resyncs), and a chat adds a lattice node only when its keywords are not already held.
  risks:
    - "Automated visiting of his own account at volume can trip a provider's bot checks or its terms. Slow by default; a stop on any challenge; his choice per account; unverified how each provider reacts."
    - "A crawler holds the account's session in a hidden tab for hours; it never types, never sends, never clicks anything but navigation and scroll."

addendum_2026_10_15_e:
  james: >-
    "use erosmanceros, scroll slowly, using the arrow keys or something, could also make it a macro and or automation in clearglass, a good way to test them"
  coder_reads: >-
    The crawler's page work is not new code in a new place: it is a Clear Glass automation workflow (the engine in src/mesh/automation-engine.js already has navigate, wait_until, extract,
    loop, condition, delay) with ONE new step, scroll_until, that scrolls slowly through ErosmancerOS (real wheel), real arrow keys, or the page, and stops when nothing new loads. Running the reader as a
    workflow is also the test he asked for: the automation engine, ErosmancerOS input and the DOM-mutation chat ledger are all exercised by one chat. "Macro": automations already convert from macros
    (src/automation/from-macro.js); the reverse (scroll_until as a macro step) is not built, TO CONFIRM whether he wants it.
  built_0_60_56:
    - "scroll_until (automation-engine.js _scrollUntil, steps.js): via erosmancer | keys | page; small steps, a pause, done when the message count, scroll position and page height stop changing; finds the inner scroller; says which input path ran"
    - "press with input 'native': a real keystroke through the driver (sendInputEvent). ErosmancerOS has pointer, wheel and typing but no key press, so 'erosmancer' for a key is refused and said"
    - "scroll with input 'erosmancer'"
    - "workflow template 'Read one chat slowly (test)' (templates.js); 5 new settings under Reading a chat"
    - "tests/modules/test-scroll-until.test.js SU-01..SU-09"
  unverified: >-
    All of it runs in jsdom behind the browserFn hook, which has no layout and no real wheel. Not proven: that ErosmancerOS's /api/input wheel scrolls a provider's chat page; that a chat page's inner scroller is found by the
    selector walk; that arrow keys reach it (the step focuses the scroller first); which direction loads older messages on each provider. The template is the way to find out, one chat at a time.

build_order: [PI1_the_importer, PI5_the_crawler, PI3_the_intelligence_pass, PI3b_the_measured_patterns, PI7_the_links, PI2_the_listener, PI4_the_review_screen, PI6_the_firefox_script]
build_order_reason: >-
  The importer needs no Electron and can be proven here; the extraction decides whether the whole idea is worth having, so it comes before the live listener, which can only be checked in Clear Glass.

addendum_2026_10_16_f:
  james: >-
    "chatgpt the thing we talked about earlier, that indexes novel one by one" · "continu"
  coder_reads: "To confirm. 'novel' = the novelty rule, not a book: the crawler of addendum d ('only logging novel data', one chat at a time until caught up). If he meant something else (a different earlier chat), this is the wrong thing."
  built_0_60_63:
    - "clear-glass/src/chats/crawler.js: runs the plan. Reads the list (more of it while backfill is unfinished; on a timer once caught up), takes the plan's next visit, reports the result, saves the state after every visit. Three ports; no tab in it."
    - "A list read that hits a login wall, challenge or rate limit pauses the account with the reason, as a visit does. Backfill off: the chats that exist are skipped with the reason 'before capture began', then only new ones are read (plan: keepSkipped, so an exclusion removal does not revive them)."
    - "tests/modules/test-chat-crawler.test.js CR-01..09 and CR-03b: backfill to done with nothing missed, restart resume, unchanged list visits nothing, the stopping chat re-checked once, challenge stop and resume, signed-out stop, backfill off, list not fully loaded, capture off, a throwing visit listed as failed."
  not_built_needs_clear_glass: >-
    The ports: readList (a background tab on the account's own session, sidebar list, scroll to load), visit (the 'ChatGPT chats' reading workflow per chat, wait for the ledger's `settled`, read its turn count and hash), and
    where the per-account state is kept. Unverified there: that the observer is injected into a background tab, that the sidebar list is complete after scrolling, ChatGPT's current selectors.
  next: "The Clear Glass ports (PI5b), checked by him on one account, ten chats; then PI1 (the importer), which the build order puts first and which needs no Electron."

addendum_2026_10_16_g:
  james: >-
    "build it."
  coder_reads: "To confirm: 'it' = the Clear Glass side of the crawler that addendum f left unbuilt (the ports)."
  built_0_60_64:
    - "clear-glass/src/chats/ports.js: two automation workflows per account ('Chat crawler list' and 'read', made once, found by name) run through the engine with workflow setting partition = the account's own session. A step list only navigates, waits, scrolls and reads. The chat list scroll may fail and carry on (the list is then not 'complete', so backfill is not declared done); the chat read scroll may NOT fail quietly: a half-loaded chat is never filed as ok."
    - "visit files the chat into clear-glass/src/downloads/chat-ledger.js (the same ledger the live observer writes), only the turns it does not already hold word for word: a chat read twice adds nothing; a chat that grew adds only its new turns."
    - "A login wall or a captcha/challenge page is read from the page (classifyPage) and returned as a kind the plan stops on. Selectors are data per provider (PROVIDERS), chatgpt only."
    - "clear-glass/src/chats/service.js: one crawler per account key, background, refused while the account's switch is off; /cli/chats/crawl/start|stop|status in the bridge; idearium command `chat-crawl` (start and stop are personOnly)."
    - "tests/modules/test-chat-ports.test.js PT-01..07 on the REAL automation engine with a fake chat site in jsdom."
  unverified: "ChatGPT's current selectors; that the account key maps to persist:agent-<accountId> (override with --partition); that the sidebar list is complete after scrolling (the chat-list scroller); that a hidden tab on that partition stays signed in; the Settings screen has no Start button yet (CLI first)."
  next: "He runs `chat-crawl start chatgpt:<id>` on one account, ten chats (set Max backfill chats to 10), and tells me what the first failure says."

