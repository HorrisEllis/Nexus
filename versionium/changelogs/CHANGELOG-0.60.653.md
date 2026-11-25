# 0.60.653: the Automation tab is your pipeline screen preview, the same, and built

James, 2026-11-25: "i want the automation build the same. not stripped. but built" · "im saying the preview from the console preview was the exact one i wanted. not a version but identicle as possibel" · "okay fix the automation tab. then continue the pipeline. the pipeline and emerge are vital"

COS › **Automation** is the pipeline screen you shaped (cos/ui/run-console-preview), the same page. Only two kinds of line differ from the preview: where it reads from (COS, instead of the preview's own port), and the actions that said "acts once this screen is built", which now act:

- **Run pipeline, Pause, Continue, Cancel run, Retry from the selected step** — through COS's engine.
- **Save** (a changed pipeline is written; a new one is created), **Duplicate**, **Export .pipeline** (the pipeline as its node file).
- Everything the preview read still shows: live model calls and their text, the build and its gates, lineage, phases, components, commands, frameworks, templates, the step baseline, the terminal.

How: the preview's own server is now also COS's, at `/api/cos/view/*`: the same code, mounted in COS's manager, each answer from its owner's route. Run by itself it is still the preview. COS's contract lists the new routes and "create a pipeline".

Still "later", because nothing behind them exists yet: **Change model…** and **Open on ERAVOS canvas**.

Needs: one restart of COS (its manager reads route code when it starts).

Checked: every file parses; the moved server answered data, catalogue, phases, frameworks and templates; the page makes no request outside COS.
