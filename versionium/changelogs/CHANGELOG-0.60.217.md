# 0.60.217 — the Site Settings screens, by feature (SP3)

James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
Cleardriver, agentmesh and guardian setting."

Owned by: clear-glass/spec/site-profile.spec MOD-SP-UI (dated addendum) · map docs/2026-10-23-site-profile-processes-phasemap.spec SP3.

## What stands on what
- **One builder for both screens:** `renderer/site-profile-groups.js` (and its `.css`). Every control comes from the key table that
  validates the values (0.60.215), so a key added there gets its control with no screen change.
- **It reads and writes through `ClearGlass.siteProfile`**, the same resolver the features read (0.60.216).

## The toolbar's Site Settings popup
- It shows this tab's own site, as nine groups: Autofill, Macros, Workflows, Passwords & account, Network, Resume, ClearDriver,
  Co-pilot & agent mesh, Guardian.
- A change is written at once.
- Each row says where its value comes from:
  - **this site**, with ↺ to go back;
  - **Settings**, when it follows the global option;
  - **default**.
- A refused value shows the reason on its row and changes nothing. For example, a navigation timeout of 5 ms: "between 1000 and 300000".
- The Network row is the site's route (Direct, Through Snowflake, Blocked). Choosing one writes the site's network rule.
- Id fields offer what exists: autofill profiles, accounts, macros, agents.
- "All sites…" opens Settings › Sites. The popup used to list every site's raw stored values. That list was already in Settings › Sites, so
  nothing is lost.

## Settings › Sites
- The Edit dialog has the same groups under **Features**. Changes wait for Save. A refused value keeps the dialog open, with the reason.
- The site list's chips show the feature settings, for example "driver.allowed: off".
- Feature keys are no longer repeated under "Other stored values".

## Proof
- `test-site-settings-ui`: 3/3, driven in Clear Glass. The page's calls reach the real resolver, store and network service.
  - SU-01, the popup:
    - nine groups;
    - set → "this site", ↺ → "default";
    - an out-of-range value refused, with the reason;
    - Snowflake as the site's one rule;
    - the autofill profiles offered.
  - SU-02, Settings › Sites:
    - nothing written before Save, written on Save;
    - only the plugin's key listed as another stored value.
  - SU-03: a page that isn't a website says so.
- `test-browser-shell`: 28/28. BST-03 keeps the shell's stylesheets last, so the new stylesheet loads before them; its rules are scoped
  to the popup and the groups.
- Suites that load Settings and fail do so exactly as on the commit before this one: `clear-glass-library-ui`,
  `clear-glass-screen-qa-ui`, `test-cg-accounts-portal-settings`, `test-cg-settings-ui-files`, `test-compartment-window`,
  `test-repo-settings-ui`, `test-test-first` (TF-04). `test-test-first` failed a second check once in one run and not on reruns.
