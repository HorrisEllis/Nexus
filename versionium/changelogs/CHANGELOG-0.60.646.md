# 0.60.646: everything from Firefox, one profile

James, 2026-11-24: "this needs to be built, importing all of it from firefox." · "can you have it import the autofill and password from firefox also? into the plugin and autofill, and chip." · "yes one profile for all of clearglass, unless i add another one, then it switched to that profile, can also be per tab"

**Import from Firefox** (Settings → Import) now brings everything:
- **Saved passwords** go into the Password Manager, and the chip under a sign-in field offers them. A login Clear Glass already has is left as it is. If the Firefox profile has a primary password, the page asks for it once and never keeps it.
- **History**: each visit with its own date, newest first (Clear Glass keeps 5,000).
- **Addresses** become autofill profiles. Saved cards stay in Firefox.
- Cookies, bookmarks and the user agent, as before.

The page shows the profile Firefox opens, with its other profiles behind a link, and imports into one of your Clear Glass profiles. The stray "null" under the results is gone.

**Profiles:** a profile whose account was deleted can now be removed (the old rule still counted the deleted account).

Checked on James's Firefox, counting only: all 26 saved logins decrypt; 5,000 visits; 2 addresses. Not yet checked inside Clear Glass itself.
