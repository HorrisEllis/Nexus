# 0.60.58 - 2026-10-15

James: "have a simple step by step guide for making a macro on a webpage, and have a optional toast for macro recording when you press the hotkey"

- **Settings › Macros** opens with a seven-step guide (open the page, Record, do it slowly, Stop, check the steps, save and test, optional key). It is open while there are no macros.
- **Toast switch:** "Toast when the record hotkey is used" (`macroRecordToast`, on by default). When on, Alt+Shift+R shows a toast on start and on stop. Off: the co-pilot chat still notes it.
- **Hotkey stop now saves a macro.** Before, stopping by hotkey only said "save it in Settings"; there was no editor to save from. Now the recording becomes a macro with its recorded name, and its `.macro` file is already on disk.
- Proof: `clear-glass/test/macros-guide.test.js` MG-01..03. Unverified: the hotkey path in real Clear Glass.
