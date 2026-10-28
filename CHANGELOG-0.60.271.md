# 0.60.271 — Fiverr dropdowns at a person's pace, with the human mouse

James, 2026-10-28: "it needs delays in between the dropdown menu. like drop down and then click. Also should use electrons digital input and mouse curve from erosmanceros to simulate a human mouse" · "The fiver."

- `clear-glass/src/driver/index.js` `_choose`: open → wait 0.6–1.1 s → read the options → wait 0.3–0.65 s → click → settle 0.5–0.9 s. Each is a random span and can be set per step (`openWait`, `pickWait`, `settleWait`, in ms, `[min, max]`) — so his macro node `fiverr-gig-choose-delivery.macro` can slow or speed it.
- Pointer `via: 'auto'` (the default): ErosmancerOS's curve when Eros is wired and answering; otherwise Electron's own input along the native curved path. The result says which, and why when it fell back (`viaWhy`).
- Proof: `tests/modules/test-fiverr-pace.test.js` 2/2 (the order and the waits; the Eros → Electron fallback said); `test-fiverr-works` 11/11.
