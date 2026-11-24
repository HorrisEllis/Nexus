# 0.60.639: accounts, logins and passwords in one place

James, 2026-11-23: "I like the old settings. just need the accounts, logins, cookies, and repition consolidated." · "accounts are per cookie/login, which are per per site. like firefox."

- **Accounts, logins & cookies** (was Providers & accounts) now holds profiles, every login and saved passwords. The old Settings layout is otherwise kept.
- **One account per login per site**, with a stable id. Google and YouTube are one account, as are ChatGPT and OpenAI, Proton's two domains, and Facebook and Messenger. Existing provider account ids are kept.
- **Repetition removed:** the Profiles page, Saved passwords in Privacy, the Per site pointers in Guardian and ClearDriver, and the second set of listener decay controls.
- **Import** lists your profiles as destinations, and its tags no longer cover the folder path.

Proof: `eg test` 8/8; the real Settings page and store on a throwaway copy, including sign-out, a new profile and stable ids. Not run inside the Clear Glass app. The privacy page's test could not run here (a missing test dependency), and GS-05 needs a Clear Glass window, which does not open under the driver on this PC.

Not built yet: the one-jar cookie move, the identity check, fingerprints per profile, intent routing to ids, nexus:// in the browser, and passwords in the chip.
