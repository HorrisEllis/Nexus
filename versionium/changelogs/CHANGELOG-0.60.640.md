# 0.60.640: one cookie jar per profile

James, 2026-11-22: "Once source of truth." · 2026-11-23: "everything uses its relative profile as a source of truth" · "see this needs to use my login for chatgpt."

Provider tabs, their sign-in windows and agent tabs now run in their account's profile jar, so a login you have in Default is the login they use. No screen changed.

- **Protected:** a profile's jar cannot be cleared whole, overwritten by a saved copy, or swapped to another account. Sign-out and saved sign-ins touch only that provider's sites.
- **Nothing is lost:** a login already in the profile is left alone, and the old jars are read but never changed. `CG_ONE_JAR=0` goes back to them.

Proof: 12 of 12 checks in real Electron on a throwaway profile, using real cookie sessions and the real vault. Not yet run inside the full Clear Glass app. `clear-glass/test/session-hub.test.js` fails at the same assertion before and after this change.

Limits: downloads from a mesh background tab are no longer announced as provider artifacts while in a profile jar. Per-profile browser identity is not built.
