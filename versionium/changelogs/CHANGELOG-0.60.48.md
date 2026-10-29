# 0.60.48 — 2026-10-15

James: "im so sick of zips" · "how will it link to github?"

## `npm run update`: the latest Nexus without a zip

James's Nexus was an unzipped download. It had no `.git`, so it logged `fatal: not a git repository`, and it was at 0.60.44 while main was at 0.60.47. Every fix meant a new zip.

A git clone of Nexus can now update itself in place with `npm run update`. The command:

1. **Refuses to run in an unzipped folder.** It prints the one command that clones Nexus instead.
2. **Fetches the latest from GitHub.**
3. **Refuses if the update would overwrite your own edits,** and names the files.
4. **Fast-forwards to the latest version.**
5. **Runs `npm install` only if the dependencies changed.**
6. **Reports the version before and after,** for example `Nexus 0.60.47 → 0.60.48`.

`npm run update -- --check` reports what would happen without changing anything.

**How it links to GitHub.** A clone remembers where it came from. Its `origin` is `https://github.com/HorrisEllis/Nexus.git`. If the repo needs a sign-in, Git for Windows opens a browser sign-in once and then remembers it.

**Your state is safe.** `data\` is never in git, so an update cannot touch it.

**Found by the test, fixed before shipping:** git's status lines were being trimmed, which cut the first character off the first file name. A clash with your own edits could go unseen.

## Proof

- test-update-script: 4/4, run against a real local origin and clone. It checks that:
  - an unzipped folder is refused with the clone command;
  - an already-current clone says so, and `--check` changes nothing;
  - an update reports the version before and after, and leaves `data/` untouched;
  - your own edits are refused by name and nothing is overwritten.
