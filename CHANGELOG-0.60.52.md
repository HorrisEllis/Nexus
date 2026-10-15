# 0.60.52 - 2026-10-15

James: "i cant click the login on the popup for chatgpt. just chat gpt." · "most of the tool bar things dont work. and the ones that do look terrible. can you fix that?"

## ChatGPT login click
Cause (from the code): `src/providers/attention.js` bounces a provider window off a sign-in page when nobody is using it. ChatGPT is `loginOptional`, so it was bounced even while he was clicking Log in. A visible, focused window now counts as the person's. Test AF-02b: focused is left alone, visible-but-unfocused is still bounced.

## Toolbar
Cause: Settings saved `pinnedToolbarButtons` and told no window, so the main window applied pins only at load. `options:set` now sends `options:changed` to the other windows, the preload exposes `cg.options.onChange`, and `browser.js` re-applies the pins. Tests TB-01..03 check the three ends are wired.
Look: the pinned tools were bordered glass squares with mixed emoji and text glyphs. One rule in `renderer/browser.css` now: no box until hover, one size, text-presentation glyphs.

## Not proven
Neither fix was seen running. Electron is not available in the cloud box, so the live toolbar repaint and the new look are CSS and wiring checks only.
