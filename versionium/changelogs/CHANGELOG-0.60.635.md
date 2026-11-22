# 0.60.635: a Clear Glass profile is the source of truth (AC10 slice a)

James, 2026-11-22: "i just clearglass to have one source of truth for cookies and accounts, hooked into the profiles". Asked whether Clear Glass or COS's vault
(his 2026-11-13 choice) should own them: "yes clearglass." Stands on his 2026-11-18: "the profiles are the source of truth."

## What changed
- A profile is a record: an id, one cookie jar, its accounts. An account can be in several profiles.
- The rules are in Emerge (`clear-glass/src/profiles/profiles.eg`): one account per provider in a profile, since a jar holds one sign-in per site; no account left without a profile; the default cannot be removed.
- Clear Glass's account store keeps the answer. Routes: `/profiles`, `/profiles/resolve`; a change is a person's.
- On first read every account is placed: in Default (the normal session), or in its own profile when Default already holds that provider.

## Not done (said)
**No cookie has moved.** Tabs, provider tabs and agents still use today's jars. The Profiles screen waits on his yes to a preview; the move to one jar per profile and Guardian's routing come after it.

## Proof
`eg test clear-glass/src/profiles/test/profiles.test.eg` 6/6. Clear Glass's real store on a throwaway folder: placement, the one-sign-in rule, resolve, kept on disk. The routes have not run inside Clear Glass.
