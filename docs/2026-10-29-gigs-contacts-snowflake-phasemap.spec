# Gigs, contacts, Snowflake in macros (2026-10-29)

origin: >-
  James, 2026-10-29: "update the gig files. also capturing the contact info for job applications. also snowflake plugin support to macros and
  automation. / maybe a calander or add google or apple calender?" · and, answering which picker to rebuild: "Guardian picker."
  Before it, his priority (2026-10-28): "stop. fiverr is the most important. that and job applications, 0logging contact info from
  applications/businesses you apply for".

status: "AP1–AP4 and SN1 BUILT 0.60.281; CAL0 and GP0 open (his)"

## Grounded (read from the code, 2026-10-29)
- The gig files (clear-glass/docs/gigs/*.gig, format clearglass.gig/1, src/autofill/gig.js) give each package a name, description, delivery
  days, revisions and price, and nothing for Fiverr's package rows. His Scope & Pricing screenshot shows rows like Number of APIs
  integrated, Number of Triggers / Actions, Number of Platform/Tools Integrated, Data Syncing and Conditional Logic. They differ by
  subcategory. Delivery days of 8, 9 and 12 are in some gigs; Fiverr's real delivery list cannot be read from here (403), so a value it lacks
  fails with the real list named (the gated choose, 0.60.280).
- Correction, said: the coder had told him job applications "build on clear-glass/src/jobs/intake.js". That file is Guardian's job queue.
  Applications are lib/opportunity/ (sources, scoring, stages, store, answers, drafting, apply → READY, his submit), served by Copilot
  (copilot/routes/opportunity.js, /api/opportunity/*), with the CLI lib/cli/opportunity.js and the agent tool nexus.opportunity.tool.
  It has no screen. Its profile's `contact` is his own details, as the applicant; nothing records the employer's or client's contact.
- Snowflake is the plugin clear-glass/plugins/snowflake ("Open link with Snowflake", NP11/NP12) over the core transport,
  clear-glass/src/net/service.js (routes per site, start, stop, a circuit check; /cli/net/*). Macros and workflows cannot reach it.

decisions:
  AP_D1_rows_from_the_gig_not_code:
    chosen: >-
      Each package may carry features: { "<row label as Fiverr shows it>": value }. The fill finds the row on the page and uses the gated
      choose (a dropdown row) or check (a checkbox row: yes/no), so the rows come from the gig file, never from code. A row on the page with
      no value in the gig is listed back, so he can add it.
    by_the_axioms: "§5.13 syntax is not architecture (data, not code); §1.2 the rows not filled are said; his 0.60.280 words: 'this is the nodes in the settings, not hardcoded'"
  AP_D2_contacts_are_the_opportunity_systems:
    chosen: "contacts live with the opportunities they belong to (lib/opportunity, its own jaa table), served by Copilot's /api/opportunity/contacts; Clear Glass reaches them only through that route"
    by_the_axioms: "§5.15 one owner (the opportunity pipeline owns applications); §8.6 reuse (its store, ledger, routes, tool)"
  AP_D3_capture_only_what_the_page_shows:
    chosen: "from the job page: mailto/tel links, e-mail addresses and phone numbers in the text, the company and the page; never guessed. Each captured contact says where it came from (page | hand)."
    by_the_axioms: "§0.1 evidence; the NC0 evidence rule (discovered vs declared)"
  AP_D4_contacts_recorded_in_the_opportunity_ledger:
    chosen: >-
      A contact is a data row, not a change to code, settings or a node: each add, edit, archive and restore is a line in the opportunity
      ledger (store.js ledger), as every opportunity action already is, and it is not sent to Versionium. The coder's reading of §17.12
      ("every change and every version") as covering what is built and configured, not each record a system keeps — to confirm.
    by_the_axioms: "§17.12 (read as above, to confirm); §5.15 the opportunity system owns its records and its ledger; §0.3 archived, never deleted"
  SN_D1_one_service_handed_in:
    chosen: >-
      The step logic is clear-glass/src/net/step.js, pure; the bridge hands it core's own service, transport, bridge set-up and circuit fetch,
      and gives the driver netStep. No second copy of the routing table or the transport; refused while the Snowflake plugin is not active.
    by_the_axioms: "§8.6 reuse; §5.15 one owner (src/net); §1.2 a refusal is said"

phases:
  AP1_gig_features:
    status: DONE 0.60.281
    depends_on: [AP_D1_rows_from_the_gig_not_code, KB4_gates_on_macro_steps, FG5_fiverr_gig_flow]
    files: [clear-glass/src/autofill/gig.js, clear-glass/src/ipc/bridge.js, clear-glass/docs/gigs]
    does: >-
      features per package in the gig format (validated: a label, and a value or yes/no); the fill reads the Scope & Pricing rows and applies
      each feature in its tier's column; rows it did not fill are listed in the result. The AI Development gigs carry the rows from his
      screenshot (values are the coder's drafts from each package's own description, to confirm). The other gigs get features: {} and the
      fill lists the rows it found for them.
  AP2_contacts_backend:
    status: DONE 0.60.281
    depends_on: [AP_D2_contacts_are_the_opportunity_systems, AP_D3_capture_only_what_the_page_shows]
    files: [lib/opportunity/contacts.js, lib/opportunity/store.js, lib/opportunity/index.js]
    does: >-
      A contact: who (company), contact name, role, email, phone, site, the date, the job (opportunity id and title), status (from the
      opportunity's stage, or his), source (page | hand). Captured when an opportunity's page is read (capture, prepare), added and edited by
      hand, archived not deleted.
  AP3_contacts_route_command_tool:
    status: DONE 0.60.281
    depends_on: [AP2_contacts_backend]
    files: [copilot/routes/opportunity.js, idearium/cli/route-commands.js, lib/agent-tools/tools/opportunity/opportunity.js, lib/cli/opportunity.js]
    does: "GET/POST /api/opportunity/contacts, PUT /api/opportunity/contacts/:id, POST /api/opportunity/contacts/:id/archive; the command `opp contacts`; the agent tool's contacts action"
  AP4_applications_screen:
    status: DONE 0.60.281
    depends_on: [AP3_contacts_route_command_tool]
    files: [clear-glass/renderer/settings/sections/applications.js, clear-glass/renderer/settings/sections/applications.css, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js]
    does: "Clear Glass Settings › Applications: the applications by stage, and the contacts (add by hand, edit, archive), through Copilot's routes only"
  SN1_snowflake_in_macros_and_workflows:
    status: DONE 0.60.281
    depends_on: [NP12_plugin_split, KB5_keys_in_macros_and_automation]
    files: [clear-glass/src/driver/index.js, lib/agent-tools/tools/browser/browser-action.js, lib/automation/steps.js, lib/automation/engine.js]
    does: >-
      A step `network` (macros) and a browser action "Network (Snowflake)" (workflows): route this site (or a given one) through Snowflake,
      put it back, start or stop the transport, wait until it is ready, check the circuit. Refused and said when the Snowflake plugin is off.
  CAL0_calendar:
    status: "OPEN — his question, answered with a recommendation; his call"
    depends_on: []
    files: []
    does: "a calendar for gig deadlines, interviews and follow-ups: Nexus's own first, then Google or Apple. To decide with him."
  GP0_guardian_picker_rebuild:
    status: "OPEN — named by him ('Guardian picker.'); what is wrong with it today, to ask"
    depends_on: []
    files: [clear-glass/renderer/guardian-picker.js]
    does: "rebuild the Guardian picker (clear-glass/renderer/guardian-picker.js); the scope comes from what he says is wrong with it"

## ADDENDUM 2026-10-29 (0.60.281) — built
- AP1: gig.js `_features`, driver `checkAt` / `rowLabels`, bridge `_gigFeatures`; ai-agent-workflow-automation.gig with his five rows (draft
  values, to confirm), `features: {}` elsewhere. test-gig-features 3/3.
- AP2–AP4: lib/opportunity/contacts.js (T.contacts), captured in capture() and prepare(); Copilot routes, `opp contacts` / `opp contact`, the
  agent tool's contacts actions, lib/cli/opportunity.js; Settings › Applications through `applications:call` (an allowlist). test-opportunity-contacts 6/6.
- SN1: src/net/step.js; driver `net`; browser_action `network`; workflow browser step "Network (Snowflake)". test-snowflake-steps 4/4.
- Still his: CAL0 (the recommendation stands: Nexus's own calendar first, with an .ics feed Google and Apple subscribe to; two-way sync
  later) and GP0 (what is wrong with the Guardian picker today).

## ADDENDUM 2026-10-29 (0.60.282) — SN1: the step turns Snowflake on
James, 2026-10-29, after 0.60.281 refused when the plugin was off: "can 't you have it turn on the snowflake?"
- Supersedes SN1's "refused when the Snowflake plugin is off" (kept above, §0.3). A step turns the plugin on (as plugins:enable does, kept
  on after a restart) and says pluginTurnedOn; routing a site starts the transport (a routed site is blocked while it is off) and says
  startedTransport. turnOn: false / start: false keep the old behaviour. Two readings of his words, both done — the coder's, to confirm.
- His next words, "what about combining the", were cut off: asked.
