# 0.60.32 — 2026-10-14

James: "also multiaccount routing in clearglass, each tab can be a different profile?" · "yes we need to get it all working."

The design is his, from the phase map (PF1): "dynamic routing to profiles in clearglass, which can hook into hats. each tab can beb a compartment or different profile. that way we can use multiaccount routing."

## What changed

Before, each provider had one tab. A job for another account switched that tab's sign-in, so accounts took turns: with three Claude accounts, three hats still waited on one tab.

Now each account gets its own tab:

- **The provider's own tab** runs one account, as before. It's the session Clear Glass mirrors to your normal tabs, and it switches accounts as before when needed.
- **A job routed to another account** goes to that account's own tab. The route comes from a hat rule, an intent or repo rule, or the fallback chain. The tab runs in its own browser storage (`persist:ncp-<provider>~<account>`), signed in from the encrypted vault. Its cookies are never mixed with another account's or shown in your normal tabs.
- **Each account has its own dispatch lane:** one job at a time per account, with accounts running in parallel.
- **When the account's tab isn't open,** Guardian asks Clear Glass to open it, and the job waits for it. If it can't be opened (for example, no saved sign-in), the job fails and says why.
- **When a profile tab hits its usage limit,** only that account rests. The fallback chain moves on as before.

The path a job takes is hat → account → tab. `GUARDIAN_PROFILE_TABS=0` turns profile tabs off and restores the single-tab behaviour.

## Found while grounding it, fixed

Three assumptions that a provider has exactly one tab would each have broken a second tab:
- whichever tab connected last took every job for its provider;
- the provider's status (readiness, usage limit, current chat) came from whichever tab connected last;
- a disconnect from any one tab requeued every in-flight job for the provider.

Also fixed:
- **A completion freed the wrong slot.** It freed the slot of the provider named in its message, not the slot the job held. This affected both the pool bridge and job retry.
- **A bug in this change, caught by its own proof test before it shipped.** After the job payload moved into one shared builder, a log line still referenced the old variable. Every dispatch to the provider tab threw after the job was sent, which let a second job go out beside it.

## Where to see it

- Idearium: Settings → Routing → Accounts. The card now lists each provider's tabs: whether each is busy or idle, and which are at their limit.
- `idearium accounts profiles`
- `GET /api/accounts/profiles` (Idearium and Guardian).
- `POST /api/accounts/route` (Guardian) now also returns the lane.
- Clear Glass `:7702`: `POST /providers/:id/profile {accountId}`, `GET /providers/:id/profiles`.

## Proof

**test-profile-tabs 7/7.** It runs a real NCP server with live SSE tabs, the real dispatcher and real account routing:
- Hat builder goes to acct-a in the provider's own tab, and hat critic goes to acct-b in its own profile tab.
- Both are in flight at once.
- A second critic job waits only for the first critic job.
- No job ever lands in another account's tab.
- With profile tabs off, the old one-tab behaviour holds.

Guardian suites are unchanged:
- back-and-forth 18/18;
- stack-sim 11/11;
- account-fallback 7/7;
- run-ready 10/10;
- economy 5/5;
- ncp-hostile 5/5;
- ncp-handler 7/7;
- retry 52/52;
- mesh-client 13/14 (the same failure on main).

## Not done

- **Resumed chats.** A repo agent's resumed chat belongs to the account that started it. A different account's tab can't open it. This was already true when switching accounts on one tab (since 0.60.2). The fix is to key chats by account; it isn't built.
- **Refreshed sign-ins.** A profile tab keeps its refreshed sign-in in its own browser storage. It isn't written back to the vault.
- **Not yet run live.** The Clear Glass half is tested with stand-ins, not driven live on your machine. That's the next proof.
- **Not built:** compartments as profiles (TB1/HM0), and CK-241 (a check that hat, profile and tab agree).
