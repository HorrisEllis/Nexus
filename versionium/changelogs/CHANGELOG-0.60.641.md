# 0.60.641: a login moves whole

James, 2026-11-23: "the login loop thats never been fixed. still happenign".

The normal jar held ChatGPT's fresh session token with a different device id and Cloudflare clearance from the jar that signed in, because the old mirror copied only the token. A login now moves as its whole set of cookies on its sites. A different login already in the profile is left alone.

Also: a provider tab is marked as the account its profile jar belongs to at startup, and the session status names the real jar.

Proof: 13 of 13 checks in real Electron on throwaway data. The cause is read from his jars by cookie name and date; it is proved only when ChatGPT opens signed in on his machine.
