# docs/2026-11-26-talk-to-nexus-phasemap.spec — talking to Copilot from COS, to assist, debug the pipeline and take direction; his framework
# as agent tools; Guardian's tools and the tool forge as data, never hardcoded; fewer tabs, no dropdown.
# author: james-brooks (the ideas and the direction are his; the coder wrote this origin from his words, 2026-11-26)
meta:
  status: "MAPPED 2026-11-26. Nothing built. Every phase is read against what exists first (his: always use what Nexus has)."
  james: >-
    "like i hate the drop down and there is too much tabs and no way to talk to nexus. like the console tab is gone. i need to be able to talk
    to copilot and have him assist in helping, or debugging the pipeline. aslo can give direction. like what about my framework being agent
    tools each. also guardian agent tools and the tool forge should not be hardcoded." · "please map this, then get the pipeline working. its
    vital."
  found: >-
    The coder's census, 2026-11-26: COS's Console tab (SC11, 0.60.398: every system's output with the command line) still exists as
    cos/ui/console and its stream (cos.console in cos/ui/shell/page.js); the tab is no longer in COS's navigation. The command line is a hidden
    dialog (Ctrl+`, cos/ui/shell/console.js). Copilot runs on :3750 (UI-as-tools, diagnose and repair, intent routing: v0.12-v0.13). PC29
    (Copilot orchestrates Nexus) is OPEN. His framework as agent tools is in docs/2026-11-21-the-decomposer-phasemap.spec ("each section a
    tool"). The door into the pipeline (Looking Glass as a layer to talk to Nexus) is docs/2026-11-26-the-door-phasemap.spec.

phases:
  TN1_talk_to_copilot_on_the_canvas:
    status: OPEN
    depends_on: [PC29_copilot_orchestrates_nexus]
    files: [cos/ui/automation/index.html, copilot/routes/pipeline-assist.js]
    does: >-
      A line to Copilot on the pipeline canvas itself, not another tab: he asks or directs, Copilot answers with what the run shows (the node,
      its gate, its context, its failure mode) and can act through the pipeline (grow a branch, resume, redo a node, propose a phase), each act a
      node on the canvas under the request (PC31). Asked "why did this stop", Copilot reads the node's ledger by id (RQ2) and says it.
    proof: "from the canvas he asks why a node failed; Copilot names the node, the gate's reason and the next way, and a direction he gives becomes a grown node"
  TN2_fewer_tabs_no_dropdown:
    status: OPEN
    depends_on: []
    files: [cos/ui/shell/index.html, cos/ui/automation/index.html]
    does: >-
      COS's screens folded to the few he uses, with the Console back where he sees it; the pipeline picker is not a dropdown (the pipelines are
      a list on the canvas's side, the run picked by clicking it). His preview first (preview-before-build), then built.
    proof: "a live-data preview he said yes to, then the same screens built"
  TN3_his_framework_as_agent_tools:
    status: OPEN
    depends_on: []
    files: [intelligence/framework-tools.eg, intelligence/test/framework-tools.test.eg]
    does: >-
      Each section of his framework (docs/innovation-toolkit*.md) is an agent tool, declared as data (name, the question it asks, what it
      takes, what it gives, its edge cases), so Copilot, the pipeline's nodes and any agent call it by name; expands the decomposer's
      "each section a tool" (docs/2026-11-21-the-decomposer-phasemap.spec).
    proof: "a node of a pipeline calls one framework section by name and its answer is kept on the node"
  TN4_tools_and_the_forge_are_data:
    status: OPEN
    depends_on: []
    files: [guardian/tools/registry.json, guardian/lib/tool-registry.eg]
    does: >-
      Guardian's agent tools and the tool forge are rows, not code: each tool is declared (name, intent, inputs, the command or route it runs,
      its gate), read at use, editable by him and added to by the forge, never a list written into a .js file. The forge writes a tool as a row
      the registry reads at once (§5.16: each system's registry its own).
    proof: "a tool added as a row is offered to an agent without a restart; no tool name is written in Guardian's code"
  TN5_lineage_shows_file_changes:
    status: OPEN
    depends_on: [RQ2_one_ledger_by_id]
    files: [cos/ui/automation/index.html, cortex/core/raid/id-ledger.eg]
    james: '"lineage file change" (2026-11-26, on the canvas''s Lineage and Changes tabs)'
    does: >-
      Each node's lineage names the files it changed (path, before and after hashes, the diff), read from the id ledger (RQ2), so walking the
      lineage from the request to the end state is also walking every file change, and any one can be replayed or reversed. His reading of
      "lineage file change" is his to confirm: the file changes inside the lineage (this), or a Lineage tab that is the Changes tab.
    proof: "from a node, the lineage lists the files that node changed, each with its diff, and reverting one is a node of its own"
  TN6_a_hat_per_pipeline:
    status: OPEN
    depends_on: [TN1_talk_to_copilot_on_the_canvas, TN3_his_framework_as_agent_tools]
    files: [copilot/hats/registry.json, copilot/lib/hat.eg]
    james: '"also terminal should be copilot. maybe a hat per pipeline?" (2026-11-26)'
    does: >-
      The canvas's Terminal tab is Copilot (TN1). Copilot wears a hat per pipeline: a hat is data (the pipeline it serves, its intent, the
      framework sections and tools it reaches for, what it watches for, how it speaks), picked by the pipeline he is on, editable by him, never
      hardcoded (TN4). The same Copilot, a different hat on each pipeline.
    proof: "on the build pipeline Copilot answers as its hat says (its tools, its watch-list); a hat edited as a row changes the next answer"
order: "TN2 (his preview) and TN1 first (talking to Nexus, the Terminal tab becoming Copilot); TN3, TN4 beside them; TN5 after RQ2; TN6 after TN1 and TN3."
