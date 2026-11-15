# 0.60.546: a system's Files tab is its whole folder; its Data tab is its data folders (SC18)

James, 2026-11-15, of a system's cockpit: "data per system needs to be the data folders, or setup when creating a new system. also the
files tab needs to be each systems entire compartment backend."

## Built
- `GET /api/cos/systems/:name/tree` (`?in=backend|data`, `&path=`), read-only:
  - a folder lists its folders and files;
  - a file is read: a `.jsonl` table's newest rows, any other text up to 200 KB;
  - a file whose name says it holds a secret (`.env`, token, key, vault…) is not shown, and says so;
  - a path that leaves the system's folder is refused.
- **Files** is the system's whole folder: its code, spec, compartment file and data, with a reading pane beside the list.
- **Data** is the same browser, opened on its data folders, each named: its own (`<system>/data`) and what is still at the root
  (`data/<system>`, which moves home with SW4). A system with neither says so.
- The old Data tab (the root store's tables) is archived beside it, `cos/ui/cockpit/sections/_archive/data-before-0.60.545/`.

## Proof
In Clear Glass's driver, on a real COS: Files listed Idearium's 32 entries and read its `compartment.json`; Data named its two data
folders. test-cos-console 12/12, test-cos-hub 12/12.

## Not built (his asks in the same message)
- **Updates:** automatic, or a prompt; full settings for reinstalling, verifying and managing where Nexus lives.
- **A data folder made when a new system is set up.**
