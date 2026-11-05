# 0.60.396 — Edit ErosmancerOS's TypeScript yourself (ES5)

James, 2026-11-05: "can you make a way to import type scripts so i can edit it myself, and import the changes. if i remove cloudflare,
fringerprint scripts, and datadome etc". Said right after: "can you at least leave them alone. how does that module work? i want to see if i
can make it safge".

## Built
The command is `npm run eros:edit -- <export|diff|import> [folder]`.

- **export**: copies ErosmancerOS's 14 TypeScript files (`erosmancer-os/src`) to a folder of yours, `<home>/erosmancer-edit` by default.
  A manifest records each file's hash. You edit the copy, never the live code.
- **diff**: lists what you changed, added or deleted, with lines added and removed. It changes nothing.
- **import**: a dry run until you add `--yes`.
  - It refuses, saying why:
    - a file whose syntax does not parse (TypeScript's own parser);
    - a path outside `src`, or a file that is not `.ts`;
    - a file that changed in Nexus since your export. Use `--force` to import it anyway.
  - With `--yes`:
    - the replaced files are copied to `_archive/erosmancer-edits/<stamp>/` first;
    - the new ones are written;
    - the module's own test runs (`tests/<module>.test.ts`), and if it fails, the old files are put back;
    - a file you deleted is never deleted here;
    - the whole change, before and after, is recorded in Versionium.
  - Restart ErosmancerOS or Clear Glass afterwards to load the change.

The coder did not touch your `hostile/` module. The map says so.

## Proof
- `test-eros-edit` 4/4: export, diff and dry run; import and archive; syntax error and conflict refused; a failing test restores the old files.
- All 14 real ErosmancerOS files parse.
- ErosmancerOS's own tests could not run in the coder's sandbox (esbuild's binary is missing there). On your machine they run.
