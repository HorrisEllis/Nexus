# 0.60.507 -- the vault's key is never a plain file again (AC6); the one-place-for-accounts design corrected and widened

James, 2026-11-13, after being shown this session's first accounts design ("COS's vault" reached over HTTP): "that adds dependancy." Then,
across the conversation that followed: "what about a encrypted compartment as a database like snowflake uses." -- "okay, so use the rewind
system to take backups" -- "what about a sign in like an account? then cos' vault keeps a backup of the key?" -- "what about an encrypted
file that can use github as a backup? or windows authentication? backup codes? like rsa2048? or a keypair?" -- "i meant like login with
google, apple, github,etc. though i do want support for api keys. eitherway get it all integrated. the accounts, logins, cookies,
sessions, im tired of it"

## Corrected (AC_D1, superseded, kept whole)
"COS's vault" is still the answer, but as a library every system requires directly, in its own process. No HTTP route is on the path to
read or write an account; COS's manager gains a thin route onto the same files only for its own Accounts page and audit.

## Built (AC6)
- `cos/vault/crypto.js`: the real AES-256-GCM cipher is unchanged; `encryptWithKey`/`decryptWithKey`/`primeMasterKey` added (additive).
- `cos/vault/key-slots.js`: `createSlots`, `openSlots`, `addSlot`, `wrapRootKey`, `unwrapRootKey`, `generateRecoveryCode`. A password slot
  and a recovery-code slot wrap the real root key; any one opens it. `openSlots` tries a secret against every slot, never by a slot's
  name -- a real bug was found and fixed here before it shipped: an earlier version matched a secret to a slot by name, so a slot added
  later (a third password, a future Windows Hello slot) could never actually open the vault.
- `cos/vault/keyring.js`: `unlock({password|recoveryCode})` migrates an existing plain `master.key` into slots with no re-encryption (the
  key's bytes are unchanged), or creates a fresh vault; primes `crypto.js`'s cache so every existing call site is untouched. A keyring file
  that will not parse is refused, never silently treated as absent and overwritten.
- `cos/foundation/constants.js`: `COS_VAULT_KEYRING_FILE`.

## Mapped, not built (AC_D3-AC9, docs/2026-11-13-one-place-for-accounts-phasemap.spec)
- AC_D3: an encrypted compartment as a database (Snowflake's idea -- never-overwritten records, a key tree, sharing by key-wrap). Only
  the root-key half (AC6) is built; the per-record key tree and append-only manifest are not.
- AC_D4: a Windows Hello/DPAPI slot and a recovery-keypair slot -- documented as a future slot of the same shape, not built (needs a
  native hook outside plain Node).
- AC_D5 / AC9: backups via GitHub (the encrypted files only, never an unwrapped key) -- mapped, not built. Found answering it: Clear
  Glass's rewind engine already writes full localStorage/sessionStorage, which can hold auth tokens, to a plain JSON file on disk --
  a real, independent leak, tracked as AC9.
- AC7: fallback routing (try the next signed-in account before asking) and one shared popup for a missing credential, optional per
  provider.
- AC8: credential types -- a browser session (including "Continue with Google/Apple/GitHub" at a provider's own page, which Clear Glass
  already drives) alongside app passwords/API keys. Reading to confirm: Nexus does not become an OAuth client itself.

## Proof
`tests/modules/test-cos-vault-key-slots.test.js` KS-01..06, KR-01..07 -- 13/13 (new, registered in run-all.js).

## Not done, said
- Nothing yet calls `unlock()` at boot or anywhere in the running systems -- today's vault still uses a plain `master.key` until something does.
- The record read/write/scope/audit layer (AC1's remaining proof) is not built.
- AC2-AC5, AC7-AC9 are all still OPEN.
- In Versionium (§17.12): vtm-ac5d80cc.
