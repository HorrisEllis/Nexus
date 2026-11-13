# 0.60.508 -- just enough to get it integrated (AC9): rewind's leak fixed through the vault, one env var reaches every process

James, 2026-11-13, asked how much of the accounts redesign to build now: "just enough to get it integrated."

## Built
- `cos/vault/keyring.js`: `unlockFromEnv()`. Set `COS_VAULT_PASSWORD` once -- COS's supervisor already forwards its own environment to
  every system it starts -- and any process that calls this independently derives the SAME root key, with no process calling another
  (the library design, AC_D1). Leave it unset and nothing changes: no file touched, no error, a plain `{ ok: false }` back.
- `clear-glass/src/rewind/engine.js`: the real leak found answering his earlier "use the rewind system to take backups" question --
  rewind snapshots, which can hold auth tokens, were written to a plain JSON file. Now encrypted through `cos/vault` when a password is
  set; exactly the old plain JSON when it is not (never a silent behaviour change without it). An old, already-on-disk plain snapshot
  still loads.
- A real bug, found and fixed before it shipped: the first version cached a FAILED unlock attempt forever, in-process -- so a snapshot
  taken once before `COS_VAULT_PASSWORD` happened to be set would permanently disable protection for that process's whole life. Only a
  successful unlock is now cached (the key cannot change once unlocked); a failure is retried next time, which is cheap (one env read).

## Proof
`tests/modules/test-clear-glass-rewind-vault.test.js` RV-01..04, 4/4 (new, registered in run-all.js). `test-cos-vault-key-slots` still
13/13.

## Not done, said
- Nothing else reads the vault yet -- accounts, cookies, passwords (AC1-AC5, AC7-AC8) are all still as mapped, not built.
- No UI or prompt sets `COS_VAULT_PASSWORD` for him; it is a plain environment variable he sets himself for now.
- In Versionium (§17.12): vtm-d9ec5f7e.
