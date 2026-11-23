# 0.60.638: every login in a profile

James, 2026-11-22: "Now all of the rest of them. You know... like an actual browser." · "I didn’t say account providers. I said logins."

Clear Glass Settings, Profiles: each profile now has a **Logins** list, like a browser's. It shows every site signed in through that profile's cookie jar and every saved password, with a sign-out for each site.

Proof: `eg test` 7/7; the real Settings page and login code on an in-memory copy of the cookie names (no values), including a sign-out; the real cookie jar was not written. Not run inside the Clear Glass app, because its window does not open under the driver on this PC.

Limits: sign-in is judged from cookie names. Only passwords already in the vault are listed.
