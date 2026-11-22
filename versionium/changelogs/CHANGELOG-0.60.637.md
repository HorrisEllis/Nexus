# 0.60.637: the Profiles screen, and his accounts back

James, 2026-11-22: "i just clearglass to have one source of truth for cookies and accounts, hooked into the profiles" · "okay profiles are in clearglass. no coupline" · "Yes, build it".

- **Profiles screen** in Clear Glass Settings: create, rename, make default, delete, add and remove accounts. Tabs and agents have not moved onto profile jars yet (slice c), so there is no Open button.
- **The wipe of 2026-11-20:** a test opened the real store because it moved only HOME while Windows uses APPDATA, then saved its defaults over it. A test can no longer open the real store, and a store that was never read can no longer save over what is on disk.
- **Restored:** 8 accounts, 1 listener, 2 shortcuts, from the last record before the wipe, after a backup. The other settings that write removed are not restored.
- **The coder's fault, kept on record:** running an account test on 2026-11-22 repeated the same hole and added 11 test accounts to the real store. The restore removed them.

Proof: the wipe replayed on a throwaway store; the two tests that reached the real store run with its files unchanged; every action on the real Settings page against a throwaway copy of the accounts. Not run inside the Clear Glass app, because its window does not open under the driver on this PC.
