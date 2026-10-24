spec:
  meta:
    name:     github-context-and-agent-settings
    version:  1.0.0
    date:     2026-10-24
    release:  "0.60.233 (mapped)"
    uuid:     nexus-github-context-agent-settings-phasemap-v1-0000-2026-1024-jamesbrooks-001
    owner:    "idearium (repo settings, the global defaults, the agent's brief) · lib (repo-git, repo-agent, agent-providers)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-24: "what about using github a a injection method for giving context? I want all aspects of the eagents per repo,
      customizable in the settings in the repo. Then i want comeplete provider specific tools, settings, hats, etc. the defaults per repo
      in the global settings in idearium. like for you, i want to be able to upload the gitbhu" · then: "like paste the link. for chatgpt,
      claude, and deepseek if its suppoted." · "also yes i want github to be able to sync per compartment."
    axioms: "docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §4.3 security/privacy, §0.3 nothing lost, §1.2 nothing silent, §5.2/§9.1 RAID decides; docs/CLAUDE.md: backend → route → command → UI; a dependency graph before every phase"
    reading_of_his_words: >-
      The coder's reading, to confirm: (1) each compartment (repo) syncs to its OWN GitHub repo; (2) "GitHub as an injection method" =
      the agent is given the repo's GitHub link, which it reads through its own GitHub integration, instead of Nexus pasting files
      ("like paste the link"); Claude and ChatGPT read a link, DeepSeek has no official GitHub reading, so for DeepSeek the method falls
      back to the pasted context, said; (3) every agent setting is set per repo, with its default in Idearium's global Settings, and each
      value shows where it comes from; (4) each provider has its own tools, settings and hat, globally and per repo.
      "like for you, i want to be able to upload the gitbhu" read as: what Claude Code gets in a session (the repo, with CLAUDE.md as
      its brief) is what every agent gets — the compartment pushed to GitHub with a brief at its root. To confirm.

  research_2026_10_24:
    claude: "Claude.ai reads a pasted GitHub repo URL (chat: + → Add from GitHub; projects: knowledge + → GitHub); private repos need the GitHub app; files on one branch only, no commits/PRs; all plans. support.claude.com/en/articles/10167454"
    chatgpt: "ChatGPT's GitHub app reads authorised repos live; the person picks the repos on GitHub; availability depends on plan and surface (Plus may only have it in Deep Research / Agent). help.openai.com/en/articles/11145903"
    deepseek: "no official GitHub repo reading found in DeepSeek chat — fall back to pasted context"
    gemini_vs_deepseek_code: "SWE-bench Verified tie 80.6% (Gemini 3.1 Pro, DeepSeek V4-Pro); DeepSeek slightly ahead on SWE-bench Pro and LiveCodeBench, Gemini on Terminal-Bench; DeepSeek far cheaper; mostly self-reported"

  exists:
    git: "lib/repo-git.js — status, remote, commit, push, pull (fast-forward), clone, SSH keygen; idearium/api repo.git.{status,remote,commit,push,pull,keygen} with the compartment's SSH key (cos/ci/keys.js) or git_token secret, never in a response"
    agent_settings: "lib/repo-agent.js repo_agent_settings (per repo: provider/backend, …); settingsFrom for linked repos; idearium/ui/settings.html tabs agent · prompt · hat · env · system per repo"
    global_default: "idearium config repos.default_provider (repo-agent setDefaultProviderSource) — the ONLY setting with a global default today; config layers schema → idearium.config.json → runtime"
    providers: "lib/agent-providers.js — one list and one route per provider (ollama, claude-code, guardian browser providers)"
    hats: "lib/hat-forge.js (base agent + scoped tools + persona, as data); lib/repo-hat.js (the per-repo hat)"
    inject: "lib/repo-inject.js (.inject nodes: agent output into the compartment) — the OUTBOUND direction; the agent's INBOUND context is its brief (repo-agent)"

  decisions:
    GC0a_one_github_repo_per_compartment:
      status: "DECIDED 2026-10-24 by his words: \"yes i want github to be able to sync per compartment.\""
    GC0b_link_first_paste_fallback:
      status: "DECIDED by his words (\"like paste the link. for chatgpt, claude, and deepseek if its suppoted\") and the research: link for Claude and ChatGPT; DeepSeek gets the pasted context (no official GitHub reading), said on the run"
    GC0c_private_by_default:
      status: "DECIDED by his axioms (§4.3 cybersecurity-grade privacy): a repo Nexus creates on GitHub is private unless he makes it public; the token stays a compartment secret, never in a response or a log"
    GC0d_layers:
      status: "DECIDED by his axioms (§8.6): every agent setting resolves schema default → his global default (idearium config) → the repo's own value, the same layering idearium config already uses; one resolver, each value says where it came from"

  phases:
    GH1_a_compartment_gets_its_github_repo:
      status: OPEN
      depends_on: [GC0a_one_github_repo_per_compartment, GC0c_private_by_default]
      files: [lib/repo-github.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/repo-settings.js]
      does: >-
        lib/repo-github.js: create the compartment's GitHub repo through GitHub's REST API with the compartment's git_token (private,
        named after the repo unless he names it), set it as the remote (repo-git remote), first commit + push (repo-git). Linking an
        existing GitHub repo is the same path without the create. Route repo.github.{link,create}; row `repo github <repo> [create|link
        <url>]`; Settings › repo › GitHub shows the link, the visibility and the last push.
      proof: "with a fake GitHub API and a bare local remote: create → private repo, remote set, first push lands; link → remote set; no token → refused with what to set; the token never appears in a response"
    GH2_the_context_brief_at_the_root:
      status: OPEN
      depends_on: [GH1_a_compartment_gets_its_github_repo]
      files: [lib/repo-github.js, lib/context-atlas.js, lib/repo-notes.js]
      does: >-
        On each sync, the compartment's brief is written at the repo root as AGENTS.md (and CLAUDE.md pointing to it): what the repo is,
        its spec, its open phases and decisions, his notes, the rules its agent works under — composed from what Nexus already holds
        (context-atlas, repo-notes, the phasemap) — so an agent opening the link starts where a Claude Code session starts.
      proof: "the brief is generated from a fixture repo's spec/notes/phases; it is regenerated, never hand-merged; a secret never enters it"
    GH3_sync_per_compartment:
      status: OPEN
      depends_on: [GH2_the_context_brief_at_the_root, AS1_one_resolver_global_then_repo]
      files: [lib/repo-github.js, lib/repo-agent.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/repo-settings.js]
      does: >-
        A per-repo setting github.sync = off | manual | on-change (default from global): on-change commits and pushes after an accepted
        inject or a finished build (the points where the compartment's files change), with the brief refreshed; a push that fails (auth,
        diverged) is said on the repo and in the activity log, never retried silently. Pull is fast-forward only (repo-git), on request.
      proof: "an accepted inject on an on-change repo produces one commit and a push to the bare remote; off does nothing; a diverged remote is reported, not forced"
    GH4_the_link_as_an_injection_method:
      status: OPEN
      depends_on: [GH3_sync_per_compartment, AS2_each_provider_its_own_profile]
      files: [lib/repo-agent.js, lib/agent-providers.js]
      does: >-
        A per-repo, per-provider setting context.method = brief (pasted, today's) | github-link: for a provider whose profile says it reads
        GitHub (Claude, ChatGPT), the brief sent is the repo's GitHub link + branch + "read AGENTS.md first", after a sync so the link is
        current; a provider that cannot (DeepSeek) gets the pasted brief and the run says why. The person still connects the provider's
        GitHub app once (theirs to do, on their account).
      proof: "claude/chatgpt with github-link get the link brief (no file bodies); deepseek gets the pasted brief with the reason; an unsynced repo is synced first or refused"
    AS1_one_resolver_global_then_repo:
      status: OPEN
      depends_on: [GC0d_layers]
      files: [lib/agent-settings.js, lib/repo-agent.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/settings.html]
      does: >-
        One resolver for every agent setting (provider, model, tools, hat, prompt blocks, limits, context method, github.*): schema default
        → his global default (idearium config, Settings › Global › Agents) → the repo's own value (repo_agent_settings). Each value says
        where it came from; "reset to default" removes the repo's value. repos.default_provider becomes one key of it.
      proof: "a global default shows on every repo without its own value; a repo value wins and says 'this repo'; reset falls back; existing repo_agent_settings read unchanged"
    AS2_each_provider_its_own_profile:
      status: OPEN
      depends_on: [AS1_one_resolver_global_then_repo]
      files: [lib/agent-settings.js, lib/agent-providers.js, lib/hat-forge.js, idearium/ui/settings.html]
      does: >-
        A provider profile per provider (claude, chatgpt, deepseek, gemini, ollama, claude-code…): its tools (scoped like a hat), its
        settings (model, context size, timeouts, what it may run), its hat (hat-forge), and what it can read (github-link yes/no) —
        globally, overridable per repo, through AS1. The agent's run uses the profile of the provider that answers.
      proof: "a global ollama context size and a repo override resolve per repo; a provider's hat scopes its tools; the run row names the profile used"

    GH5_a_github_agent_tool:
      status: OPEN
      depends_on: [GH1_a_compartment_gets_its_github_repo]
      files: [lib/agent-tools/tools/nexus/github.js, lib/agent-tools/index.js, lib/repo-github.js, idearium/cli/route-commands.js]
      james: '"maybe have a github  agent tool?" (2026-10-24)'
      does: >-
        An agent tool `github` over the same doors as the person (repo-github.js and the repo.git.* routes, through nexus.command):
        status, link, create, sync (commit + push), pull, the repo's link for a provider. Writes go through the repo's own setting
        (github.sync) and RAID as every write does (§5.2); the token is never an argument or an answer. No GitHub write a person
        could not make from the repo's Settings.
      proof: "the tool lists in the catalogue; status/link/sync run through the routes against a bare remote; a sync on a repo with github.sync off is refused with why"
    GH6_send_a_requested_file:
      status: OPEN
      depends_on: [GH5_a_github_agent_tool]
      files: [lib/agent-tools/tools/nexus/send-file.js, lib/repo-agent.js, guardian/lib/dispatcher.js]
      james: '"and a tool to upload a rewquested file." (2026-10-24)'
      does: >-
        The coder's reading, to confirm: when an agent asks for a file it was not given ("send me src/x.js"), the file is delivered
        to it — as a GitHub link to that file when the provider reads links (GH4), else uploaded into the provider's chat as an
        attachment (Clear Glass's file input path, clear-glass/src/automation/dom.js DataTransfer), else pasted. Only files inside the
        repo's compartment; a request outside it is refused and said (§4.3).
      proof: "a request for a repo file is answered with its link (claude), an attachment (a provider without links), or pasted; a path outside the compartment is refused"

  build_order: "AS1 (everything else reads settings through it) → GH1 → GH5 → GH2 → AS2 → GH3 → GH4 → GH6. Each phase lands backend → route → command → UI."
  verification_here: "No GitHub writes from tests: a fake GitHub API and a bare local git remote; the UI driven in Clear Glass (glass.js)."
