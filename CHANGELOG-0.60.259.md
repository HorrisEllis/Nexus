# 0.60.259 — Eight gigs from the proof, and his autofill node

James, 2026-10-26: "can you, using the proof of competency doc. make me a bunch of high leverage gig files. and as much of an autofill node
as possible. i need money. the autofill underneath the inputs."

The coder's reading, to confirm: "the autofill underneath the inputs" means the values that go into the form's inputs: a profile filled
as far as the facts allow.

## The gigs
Eight `.gig` files are in `clear-glass/docs/gigs/`. Load each in Settings → Autofill → Fiverr gigs → Load a gig file…, then use Fill the
gig editor. Each claims only what `docs/PROOF-OF-COMPETENCY.md` can point at.

| File | Gig | Prices |
|---|---|---|
| `ai-agent-workflow-automation.gig` | AI agent workflows (Claude, ChatGPT, Gemini, local) | $60 / $180 / $450 |
| `local-ai-ollama-setup.gig` | Private local AI with Ollama | $40 / $100 / $250 |
| `browser-automation-autofill.gig` | Browser automation and form filling | $40 / $120 / $300 |
| `software-spec-architecture.gig` | Technical spec and build plan for an app idea | $50 / $160 / $380 |
| `bug-fix-root-cause.gig` | Root-cause bug fixing in JavaScript and Node.js | $35 / $90 / $220 |
| `test-suite-qa.gig` | Automated tests | $50 / $150 / $350 |
| `electron-desktop-app.gig` | Electron desktop apps | $120 / $320 / $700 |
| `ai-coding-assistant-setup.gig` | Claude Code and AI coding setup | $60 / $150 / $350 |

They sit beside `nodejs-automation-scraping.gig`.

Each one has:
- a title of 80 characters or fewer;
- 5 tags;
- a description of about 800 characters, under the 1,200 limit;
- three packages;
- 3 FAQs;
- the same 5 buyer questions, built on his "how will you check that it is done".

The prices are the coder's starting suggestion for a new seller, and his to set.

## The autofill node
`james-brooks-freelance.autofill` was handed to him and **not committed**, because it holds his email. It holds:
- **The profile:** name, email, Portland OR, US, headline, summary, skills, languages, remote, GitHub.
- **Two templates:** a proposal and a cover letter.
- **The last gig:** the agent gig.

Load it in Settings → Autofill → Import a file…. Re-importing it into empty stores gives 1 profile and the gig, with nothing refused.

Not guessed, and listed in the file to fill in: phone, hourly rate, years of experience, hours per week, the Fiverr and Upwork profile URLs,
portfolio, and LinkedIn.

## Proof
`clear-glass/test/gig-file.test.js`: every shipped gig loads with no warning and saves back to itself.
