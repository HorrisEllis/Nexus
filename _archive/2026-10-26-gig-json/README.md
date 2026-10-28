# Archived 2026-10-26 (0.60.256 AT4)

James, 2026-10-26: "fix it so its .gig not .gig.json."

`nodejs-automation-scraping.gig.json` was shipped in `clear-glass/docs/gigs/` beside `nodejs-automation-scraping.gig`, holding the same gig
(parseGig reads both to the same object, checked before the move). It was the only `.gig.json` Clear Glass gave him. It is kept here as a
true duplicate (§0.3). A `.gig.json` he already has still loads; Clear Glass writes only `.gig`.
