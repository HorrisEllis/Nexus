# docs/2026-10-15-macro-node-recording-phasemap.spec
# Macro recording as a live .macro node file, and the chat-listener process expressed as macros + automations.
# MAPPED before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec. Follows 0.60.56 (scroll_until, chat-read template).

origin:
  date: 2026-10-15
  james: >-
    "this is wrong... needs to start recording a macro node file. i was saying the whole process of the chat listener.. like expand the automation and macros."
    (about the Settings -> Macros "Record a macro" dialog, after: "use erosmanceros, scroll slowly, using the arrow keys or something, could also make it a macro and or automation in clearglass, a good way to test them")
  reading: >-
    The coder's reading (his to correct; marked to confirm). (1) Pressing Record must create the .macro node file at once and grow it as
    events arrive, not hold events in the page until Stop. (2) The earlier ask was never only about a scroll step: the whole chat-listener
    process (list chats, open one, scroll and read, hand to the ledger) should be built from macros and automations, so it is testable
    and editable in the screens he already has. The coder wrongly read the first message as one scroll step.

axioms_consulted:
  - "§0.3 nothing lost: events survive navigation, reload, a closed dialog. Cancel keeps a draft node. -> MR1, MR3"
  - "§1.2 nothing fails silently: a drain that fails is counted and shown. -> MR1"
  - "§8.6 reuse: recordingToSteps, macroNode, saveNode, scroll_until, chat-read already exist; this extends them. -> all"
  - "Passwords never stored: password fields become {{password}} (existing rule in recording.js). -> MR2"

decisions:
  MR0_where_the_file_lives:
    question: Where does the live node file go?
    coder_recommends: The existing Clear Glass node library folder (saveNode dir), file name from the macro name, rewritten in place on each flush.
    chosen: null
    to_confirm: James's reading of "macro node file" as the .macro envelope of automation/nodes.js.

phases:
  MR1_live_node:
    status: BUILT-0.60.57-unverified-in-electron
    files: [clear-glass/src/macros/recorder-script.js, clear-glass/src/macros/live-recording.js, clear-glass/src/ipc/bridge.js]
    does: >-
      recordStart creates the .macro file immediately (0 steps), installs a queue-based page script, polls the queue, listens for
      navigation and reinstalls after it, and rewrites the file on every flush. recordStop drains once more and finalises.
    proof: "tests/modules (jsdom + fake webContents): file exists before any event; grows; survives a simulated navigation; final steps equal file steps."
  MR2_richer_events:
    status: BUILT-0.60.57
    files: [clear-glass/src/macros/recording.js]
    does: "scroll (collapsed per scroller, last position wins), arrow/Page/Home/End/Space as driver pressKey steps, waits between slow gaps, navigation."
    proof: "unit tests on recordingToSteps."
  MR3_dialog:
    status: BUILT-0.60.57-unverified-in-electron
    files: [clear-glass/renderer/settings/sections/macros.js]
    does: "Start disables once recording; live counter and file path; Cancel keeps the draft; Stop opens the step editor."
  MR3b_guide_and_hotkey_toast:
    status: BUILT-0.60.58
    james: "have a simple step by step guide for making a macro on a webpage, and have a optional toast for macro recording when you press the hotkey"
    files: [clear-glass/renderer/settings/sections/macros.js, clear-glass/renderer/browser.js, clear-glass/src/options/store.js]
    does: "Seven-step guide at the top of Settings > Macros; macroRecordToast option (default on); the cg.macroRecord hotkey toasts start/stop and, on stop, saves the recording as a macro."
    proof: "clear-glass/test/macros-guide.test.js MG-01..03 (jsdom). The hotkey path itself is unverified (needs real Clear Glass)."
  MR4_listener_as_nodes:
    status: OPEN
    does: "Per-provider recorded nodes: list chats, open chat, scroll and read; crawler hands each chat to the chat-read workflow."
  MR5_role_tags:
    status: OPEN
    does: "Tag recorded steps with roles (list / open / read) so a crawl can pick them."
  MR6_macro_to_automation:
    status: OPEN
    does: "Offer 'make an automation from this macro' from the finished recording."

# ═══ ADDENDUM 2026-10-15 (b) — macros as the control plane of Clear Glass (MAPPED, nothing below is built) ═══
addendum_b:
  james: >-
    "also macros able to bind to hotkey. also the search engine tool. virtual mouse input. option to record mouse input, steps, website events,
    schedule, like interconnect to the rest of clearglass, also agent jobs, like sending them at a scheduled time, trigger, conditions, like when a
    site loads, to x. like if thens. like brainos, idearium like make it powerful. semantic tree, autofill, templates, portfolio. have guardian picker
    included for picking elements. rememebr that this browser is ours so we can do an immense amount more than chrome. can use the clearglass cli, apis
    to collect data, send them to a system like the intelligence system, i was thinking for stock or investment, including a cuasal field to track
    trajectory, screen recording, screenshots, can we expand clearglass to support magnet links for p2p applications, using snowflake to protect from
    being tracked for user safety? tasks. like mesh clearglass spec."
  reading: >-
    The coder's reading (his to correct). One direction, not ten asks: a macro/automation becomes a node that can be bound (hotkey), triggered
    (site load, schedule, condition), fed by any Clear Glass capability (search engine tool, semantic tree, autofill, picker, screenshots, screen
    recording, CLI, APIs) and wired into Nexus (agent jobs, BrainOS, Idearium, the intelligence system). The magnet/p2p item is a separate system
    that shares only the "our browser" premise. "mesh clearglass spec" is read as: map it into the existing mesh/Clear Glass specs and loom.
  grounding_found_2026_10_15_to_verify_before_build:
    exists: ["clear-glass/src/shortcuts/registry.js (hotkeys)", "clear-glass/src/mesh/automation-engine.js (triggers incl. page-load; if/then steps)",
             "clear-glass/src/page/semantic-tree.js", "lib/agent-tools/tools/clear-glass/search-engine.js", "clear-glass/src/page/attention.js (picking)",
             "ErosmancerOS /api/input (virtual pointer)", "desktopCapturer use in bookmarks/browser.js and speech/engine.js",
             "docs/nexus-uri-clearglass-mesh-integration.spec, docs/clear-glass.spec, docs/clear-glass-toolkit.spec"]
    absent: ["any torrent/magnet handler", "any Snowflake/Tor transport", "a screen-recording feature (only capture code in two files)"]
  decisions:
    MR7_hotkeys_scope:
      question: Hotkeys only while a Clear Glass window is focused, or global (OS-wide, even when another app is on top)?
      coder_recommends: In-window first (reuse shortcuts/registry.js, no OS permission, no collisions). Global is a later opt-in per macro.
      chosen: null
    MR12_p2p_scope:
      question: What does "protect from being tracked" have to mean?
      coder_says: >-
        Snowflake is Tor's censorship-circumvention transport: it hides THAT you use Tor, and its traffic exits through Tor. It does not make BitTorrent
        anonymous. Tor does not carry BitTorrent UDP/DHT, and torrent clients leak the real IP through the peer protocol, trackers and DHT unless every
        one of those paths is forced through the proxy. Tor's own guidance is not to torrent over Tor. Pretending otherwise would give a false sense of
        safety, which is the opposite of the goal.
      options:
        A: "Magnet handler + downloads only, over a plain connection, with a visible 'your IP is public to peers' notice. Honest, small."
        B: "A, plus a proxy-or-VPN requirement: refuse to start a swarm unless a proxy is set (SOCKS5/VPN), with a leak test that fails closed. Real protection, depends on the user's proxy."
        C: "Snowflake for browsing and for tracker/metadata fetches only, never the peer traffic. Gives censorship resistance for the web, not torrent anonymity."
      coder_recommends: "B, with C as an optional browsing mode. Not 'Snowflake for torrents'."
      chosen: null
    MR13_finance_field:
      question: "Stock / investment data collection with a causal field for trajectory: what is the intelligence system asked to do?"
      coder_says: >-
        Collecting public API data and storing it is plain. A causal field means stated hypotheses (X moves Y, with a lag and a sign) that the data
        confirms or refutes over time. It will not predict prices; markets are noisy and a model that looks right on history usually isn't. Build it as
        a hypothesis tracker with out-of-sample scoring and a hard 'no advice, no trades' boundary, not as a forecaster.
      chosen: null

phases:
  MR7_bind_and_trigger:
    status: OPEN
    depends_on: [MR1_live_node]
    does: "A node (macro or automation) gets bindings: hotkey (shortcuts/registry), schedule, URL-pattern site load, condition (if/then on page state), agent-job dispatch at a time. One table of bindings, one dispatcher."
  MR8_virtual_mouse_record:
    status: OPEN
    does: "Recorder option: capture pointer path/clicks/wheel as coordinates (and element-relative offsets); replay through ErosmancerOS /api/input. Off by default; DOM selectors stay primary."
  MR9_page_event_record:
    status: OPEN
    does: "Option to record website events (network response arrival, DOM appearance, title/URL change) as wait_for/condition steps, not just user actions."
  MR10_capabilities_as_steps:
    status: OPEN
    does: "Steps for: search-engine tool, semantic-tree read, autofill fill, guardian picker (pick an element while recording -> selector step), screenshot, screen recording, Clear Glass CLI call, HTTP API collect."
  MR11_into_nexus:
    status: OPEN
    does: "A step/sink that hands collected data to BrainOS, Idearium or the intelligence system through the existing contract gates (provenance stated/observed/inferred), and a step that sends an agent job."
  MR12_magnet_p2p:
    status: BLOCKED-ON-MR12_p2p_scope
    does: "magnet: protocol handler in Clear Glass; engine and network posture per his choice. Leak test is a gate, fail closed."
  MR13_hypothesis_tracker:
    status: BLOCKED-ON-MR13_finance_field
    does: "API collectors -> intelligence system; hypothesis records with lag/sign; out-of-sample score; no advice."
  MR14_tasks_and_mesh_spec:
    status: OPEN
    does: "Tasks as nodes; addendum to docs/nexus-uri-clearglass-mesh-integration.spec and docs/clear-glass.spec; loom wiring for every item."

## ADDENDUM 2026-10-25 (0.60.251, AD2) — recording and create/delete reachable outside the window
James, 2026-10-25: "… autofill and macros working fully, including with the agents and copilot."
- `POST /cli/macros`, `DELETE /cli/macros/:name`, `POST /cli/macros/record/start|stop` and `GET /cli/macros/record/status` call the same
  bridge methods as the IPC `macros:*` handlers (`_macroWrite`, `_macroRecord`). One LiveRecorder is shared, so the MR1 `.macro` node is
  written the same way whoever starts the recording.
- New co-pilot tools: `macro.*`. Its words "record a macro called …" and "stop recording" drive the recorder before any model.
- New rows: `macro list|show|run|record|stop`.
- Runs by agents still go through Guardian + RAID (0.60.69, unchanged).
