# docs/2026-11-26-clear-glass-engine-phasemap.spec — ChatGPT fixed completely in Clear Glass; Electron kept current by a pipeline; ChatGPT (and
# any web model) as an engine of the model server; the duplicate Connections setting removed.
# author: james-brooks (the ideas and the direction are his; the coder wrote this origin from his words, 2026-11-26)
meta:
  status: "MAPPED 2026-11-26. Nothing built."
  james: >-
    "also electron in clearglass is outdated is that what is causing issues? if so, can you add a pipleline? look at guardian. what about making
    it an engine for the model server. chatgpt needs to be fixed. like completely. it loads the login page. i tried a new profile. now im testing
    snowflake. if that doesn't work, its clearglass. my bet is electron. also this setting in the settings is redundant."
  found: >-
    The coder's census, 2026-11-26: Electron 42.11.6 installed (package.json ^42.5.0). Clear Glass sets each profile's user agent itself
    (clear-glass/src/contexts/manager.js:60, :241, :253; google-signin.js swaps it for Google's sign-in). The coder's reading, unconfirmed: a user
    agent naming one Chrome while the engine's client hints (navigator.userAgentData, Sec-CH-UA) name Electron 42's Chromium is the mismatch a
    bot check reads, and a new profile keeps it, as he saw. ChatGPT's login is clear-glass/src/accounts/login-portal.js (chatgpt.com/auth/login),
    its chats chats/ports.js. The Connections page (Clear Glass settings) keeps its own copy of every system's port, which COS's registry holds.

phases:
  CGE1_why_chatgpt_shows_the_login_page:
    status: OPEN
    depends_on: []
    files: [clear-glass/src/contexts/fingerprint-check.eg, clear-glass/src/contexts/test/fingerprint-check.test.eg]
    does: >-
      A check Clear Glass runs on any page, deterministic: the user agent string, the client hints (brands and full version list), the engine's
      own Chromium version, and the platform, side by side; a mismatch between them is named with which one lies. Run on chatgpt.com in his
      profile, it says whether the login loop is the browser (mismatch, old engine) or the account, before anything is changed.
    examples:
      - 'mismatch({ ua_chrome: "131", hints_chrome: "146", engine: "146" }) == ["ua_chrome"]'
      - 'mismatch({ ua_chrome: "146", hints_chrome: "146", engine: "146" }) == []'
    proof: "the check run on chatgpt.com in his profile names the mismatch, or none; the fix follows what it names"
  CGE2_electron_kept_current_by_a_pipeline:
    status: OPEN
    depends_on: [CGE1_why_chatgpt_shows_the_login_page]
    files: [cos/pipeline/pipelines/electron-current.pipeline, guardian/tools/registry.json]
    does: >-
      A pipeline (Guardian's dependency work, as a tool row, TN4) that reads the newest stable Electron, upgrades Clear Glass on a branch, runs
      its own checks (the window opens, sign-in pages load, CGE1 says no mismatch), and lands only when they pass; every step a node, reversible.
    proof: "Electron moved to the current stable by the pipeline, with CGE1 clean on chatgpt.com"
  CGE3_web_models_as_engines:
    status: OPEN
    depends_on: [CGE1_why_chatgpt_shows_the_login_page, SR2_engines_beneath_the_supervisor]
    files: [inference/engines/web-chat.eg, clear-glass/src/chats/ports.js]
    does: >-
      ChatGPT (then any web chat Clear Glass drives) is an engine of the model server, beside llama-server: a job sent to it is typed into his
      signed-in chat by Clear Glass and the answer read back, so the ladder and Copilot's intent routing (CA5: "chatgpt=optimal-900tok-chunked")
      can ask it like any model, its limits and costs said.
    proof: "a build's gap asked of the ChatGPT engine is answered through Clear Glass and kept in the build's rows like a local model's"
    expanded_2026_11_26: >-
      His words, after ChatGPT's sign-in worked again: "only if it works. all of them." Every provider Clear Glass's login portal knows
      (claude, chatgpt, gemini, perplexity, mistral, deepseek, grok, meta: accounts/login-portal.js) is an engine, and each counts only
      once it works: a live probe (one short ask, answered and read back) passes before the ladder or Copilot may use it, and a provider
      whose probe fails is said as down with the reason, never guessed at.
  CGE4_one_place_for_the_ports:
    status: OPEN
    depends_on: []
    files: [clear-glass/src/settings/connections.js, cos/manager/registry.js]
    does: >-
      Clear Glass reads where each system lives from COS's system registry, by route; the Connections page with its own copy of every port
      is removed (his: "this setting in the settings is redundant"), with what it showed (reachable or not) moved to COS's systems list.
    proof: "a port changed in COS is the one Clear Glass uses, with no setting of its own"
  CGE5_sign_in_buttons_like_app_passwords:
    status: OPEN
    depends_on: [CGE3_web_models_as_engines, TN4_tools_and_the_forge_are_data]
    files: [inference/providers.json, clear-glass/src/accounts/login-portal.js, cos/ui/models/index.html]
    james: '"with login to agent buttons in the model server like theyre app passwords that link straight to the login for the agents to login for guardian. like how the login with chatgpt, claude like its the login portals like app passwords but with the standard provider login" (2026-11-26)'
    does: >-
      In the model server's screen, one row per provider and account, like app passwords: its state (signed in, signed out, its probe's
      last answer) and a Sign in button that opens Clear Glass's login portal straight at that provider's standard login page. He signs in
      there as he normally would (nothing submits a form for him); the session is kept in the vault and shared, so Guardian's agents and the
      model server's engines use it. The providers and their login pages are rows (inference/providers.json), not a list in code (TN4).
    proof: "from the model server's screen he signs in to Claude by its button; the row turns signed in, its probe answers, and a Guardian agent's ask goes through that session"
order: "CGE1 first (it says what to fix); CGE2 if the engine is the cause; CGE3 after it, every provider proven by its probe; CGE5 with CGE3; CGE4 any time."
