# 0.59.4 — 2026-10-10

James: "No I mean just using the capture. Like open the chat url. In general. Use the listener to have you use a command."

## A listener that runs Nexus commands

Open any page in Clear Glass: a chat (ChatGPT, Claude, a Claude Code session) or anything else. Put a Guardian listener (the picker's **⦿ LISTEN**) on the element where replies appear, and choose the new link target **Run Nexus commands**.

From then on, every command line the listener hears runs. A command line is one of:
- a line starting with `nexus> `, for example `nexus> census`;
- a fenced `nexus` code block, each line one command;
- a line starting with lowercase `idearium <command>`, which runs only when it names a real command, so ordinary sentences that start with "Idearium …" are left alone.

How it runs:
- **Same rules as every agent:** commands go through the one command tool (`lib/listener-commands.js` over `nexus.command`), so commands only the person may run (approving, passwords, stopping a system) are refused with the reason.
- **Once each per listener:** a reply that's still streaming, heard many times, runs its command once.
- **Results are visible:** they appear in Clear Glass's co-pilot panel (`⌘ nexus> census …`) and are recorded in the ledger.

`tests/modules/test-listener-commands.test.js` 4/4, including a refused command through the real tool.

## Fixed along the way

- **Commands to another system:** the command tool dropped the request body when a command was meant for another system, and couldn't reach Clear Glass at all. Both are fixed, so `field`, `picks` and similar commands work for agents too.
- **Missing event declarations:** three Clear Glass events are now declared, including `autofill.gig.to-idearium`, which 0.59.3 shipped without.

## Not yet

- **Answers back into the page:** a result isn't typed back into the page it came from, so a chat agent doesn't see the answer by itself yet. That's the next step if wanted: the result as the next message.
