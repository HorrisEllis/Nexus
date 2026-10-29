# 0.60.281 — the gig's package rows, the contacts behind job applications, Snowflake in macros and workflows

James, 2026-10-29: "update the gig files. also capturing the contact info for job applications. also snowflake plugin support to macros and
automation. maybe a calander or add google or apple calender?"

Said with a screenshot of the gig "build an agent workflow that automates your repetitive work" at Scope & Pricing. Its rows: "Number of
APIs integrated", "Number of Triggers / Actions", "Number of Platform/Tools Integrated", "Data Syncing" and "Conditional Logic". Mid-turn,
asked which picker to rebuild: "Guardian picker."

Mapped first: `docs/2026-10-29-gigs-contacts-snowflake-phasemap.spec` (AP1–AP4, SN1, CAL0, GP0), checked by `lib/phase-dag.js`.

## AP1 — a gig's package rows
- A package may carry `features: { "<row label as the page shows it>": value }` (`clear-glass/src/autofill/gig.js`):
  - a number or text is picked in that tier's column and row, then read back;
  - yes/no ticks or clears the row's checkbox.
  The rows differ by subcategory, so they are the gig's data, never code.
- The fill (`_gigFeatures`, run by `_gigFill` on the pricing page) uses:
  - the driver's `choose` and `readChoice`;
  - a new `checkAt`: it clicks only when the box is in the wrong state, then reads it back;
  - a new `rowLabels`: the page's rows the gig does not name are listed back, so he can add them.

  A value the menu lacks fails with the reason. Nothing is guessed.
- `ai-agent-workflow-automation.gig` carries his five rows. Their values are the coder's draft, **to confirm**:

  | Tier | APIs | Triggers / actions | Platforms | Data syncing | Conditional logic |
  |---|---|---|---|---|---|
  | Basic | 1 | 3 | 1 | no | no |
  | Standard | 2 | 4 | 2 | yes | yes |
  | Premium | 4 | 10 | 4 | yes | yes |

  The other gigs carry `features: {}`. The template has the line.
- **Caught by the test:** `rowLabels` missed the first row, because its top edge touches the header. It now compares each label's centre.

## AP2–AP4 — the contacts behind job applications
- **The record.** `lib/opportunity/contacts.js`, in a new table `opportunity_contacts`. A contact holds company, name, role, email, phone,
  site, LinkedIn, the job (id and title), status and source (`page` or `hand`).
- **Captured when a job page is read** (`capture`, `prepare`). It takes:
  - mailto and tel links;
  - emails and phones in the page text.

  It never takes no-reply addresses, dates, prices or image names.
- **The rules:**
  - one row per person per job;
  - a capture fills only empty fields and never overwrites his edit;
  - archived, never deleted (§0.3);
  - each add, edit and archive is a line in the opportunity ledger;
  - with no status of his, a contact shows the job's stage.
- **The doors:**
  - Copilot serves `GET|POST /api/opportunity/contacts`, `PUT /:id` and `POST /:id/archive`. `by` is the route's, never the body's.
  - Commands `opp contacts` and `opp contact add|edit|archive|restore`, run through Copilot.
  - `lib/cli/opportunity.js contacts | contact …`.
  - The agent tool's `contacts`, `contact_add`, `contact_edit` and `contact_archive`.
- **Clear Glass Settings › Applications.** It shows the contacts (search, show archived, add, edit, archive or restore, copy an email) and
  the jobs, with each job's stage and how many contacts it has.
  - It reaches them only through Copilot, by an allowlisted proxy (`applications:call` → `_opportunityCall`, §5.15).
  - When Copilot is down, it says so.

## SN1 — Snowflake as a step
- `clear-glass/src/net/step.js` does one of the following:
  - **route:** this tab's site, or a given one, goes through the transport;
  - **unroute:** removes only the rule a step made;
  - **start**, **wait** (starts the transport if it is off, then waits until it is ready), **check** (is it Tor?), **stop** and
    **status**.

  It works on core's own service and transport.
- **Doors in:**
  - the driver's `net` action;
  - `browser_action network` (macro steps);
  - a workflow's browser step "Network (Snowflake)".
- **Refused, and said:**
  - when the Snowflake plugin is off;
  - a site already routed another way is left as it is.

## Not built
- **CAL0 calendar.** This is his call. The recommendation is in the map.
- **GP0 Guardian picker.** What is wrong with it is asked.

## Proof
- New tests:
  - `test-gig-features` 3/3 (GF-02 and GF-03 in Clear Glass);
  - `test-opportunity-contacts` 6/6 (OC-06 drives Settings › Applications in Clear Glass);
  - `test-snowflake-steps` 4/4.
- `test-build-surface` BS7-04 fails on the base too: Ollama is down in the sandbox. It is not this release's.
