# 0.60.184 — 2026-10-21 — Your own lists: the ad blocker and Snowflake import files, folders and host lists

James, 2026-10-21, after 0.60.183: "Needs filters. you'll be able to import folders and host lists. Same with the Snowflake plugin."

The ask is his. The coder's part: the reading below (to confirm), the code.

## Reading (to confirm)
- **"Needs filters"**: the ad blocker takes your own lists, not only its catalogue. A list can be a filter file, a whole folder of them,
  a hosts file, a plain list of domains, or a list's web address that keeps itself updated.
- **"Same with the Snowflake plugin"**: a host list (or a folder of them) becomes the sites that always go through Snowflake.

## Built
- **Ad blocker: your own lists (AB5).**
  - **Kinds:** a filter file, a folder of them, a hosts file, a plain domain list, or a list's web address.
  - **Format:** each file's format is detected. In a domain list, `example.com` blocks the site and every sub-domain. A line in it that is
    not a host is skipped and counted, never read as a different kind of rule.
  - **Folders:** read two levels deep, list-like files only (.txt .list .hosts .conf .rules .abp, or no extension). Anything else, such as
    an image, is named as skipped.
  - **Each import is a list of its own** in the Ad Blocker's page, with its switch, its rule count, Update (re-reads the file or fetches
    the address) and ×.
  - **A copy is kept,** so moving or deleting the original loses nothing; Update then says the original is gone.
  - **On the page:** "Import file…", "Import folder…", and "Subscribe to a list by its address".
  - **Command:** `idearium adblock import <file|folder|url>` and `adblock remove <id>`. Agents can subscribe or import too; your
    hand-written filters stay yours.
- **Snowflake: host lists (SF8).**
  - **Import:** a hosts file, a domain list, `||host^` lines or URLs, or a folder of them. Each file becomes one list.
  - **Routing:** every site on it goes through Snowflake, or Direct or Blocked if you choose. Its sub-domains go the same way.
  - **Your rules come first.** A site you already routed another way is left as it was and named in the message; an import never
    overwrites your rule.
  - **Fail closed:** while Snowflake is off, those sites don't load.
  - **Where:**
    - the Snowflake plugin's page (click it in the 🧩 panel): the transport's state, the lists with their site counts, Import file/folder,
      Add a site, ×;
    - Settings → Network → Routing, which shows each list as one row with "Remove list";
    - `idearium net import <file|folder> [--via transport|direct|block]`, `net lists`, `net unlist <name>`. Changing routes stays yours,
      as `net add` already is.
- **Files into a plugin's page (BS16).** A plugin's page can now take files. The system picker opens in Clear Glass's main process, and the
  plugin sees only the paths you chose. The ad blocker and Snowflake now list "Files" in their permissions.

## Measured
- `test-adblock` 13/13. ABK-12 imports a folder holding a filter list, a hosts file, a domain list, an image and a too-deep folder, giving
  three lists and two named skips. It also covers update re-reading, a gone original keeping its copy, remove, and subscribing by address.
  ABK-13 covers the page.
- `test-snowflake` 10/10. SFW-11:
  - your direct rule for a host is kept;
  - importing twice adds nothing twice;
  - a sub-domain of a listed site goes through Snowflake;
  - a list is removed as one;
  - the plugin's page writes the same table;
  - `net import` is person-only.
- `test-browser-shell` 18/18. BST-16, in Clear Glass: "Import folder…" opens the picker and sends only the chosen paths; Add sends its text.
- The specs compile at full depth, the DAG is clean, loom has the new parts and wires.
- Neighbouring suites are unchanged: cg-network-ui 4/4, net-routes 24/24, compartment-downloads 6/6. cli-route-commands has its one
  earlier failure (CL-07 needs Guardian running).

## Not done, said
- Not run in a real Electron window here: the system picker and Settings → Network's import buttons still need trying in your window.
- One import is capped at 5,000 sites, because each is a condition in the window's proxy script. The rest are counted and said.
