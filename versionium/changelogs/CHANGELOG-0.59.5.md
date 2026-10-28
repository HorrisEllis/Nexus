# 0.59.5 — 2026-10-10

James: "All I'm going to do. Is open this chat in clearglass. Then you should be able to talk to nexus right now."

## Open the chat in Clear Glass, and the agent in it can use Nexus

No picker and no listener to set up (`clear-glass/src/page/nexus-chat.js`). On a chat page Clear Glass watches (option `nexusChat.urls`, by default Claude Code on the web, `https://claude.ai/code`):

- **Reading:** Clear Glass reads the page's text every 2 seconds, from its own process. Nothing is injected into the page.
- **Running:** a line starting with `nexus> ` that has stayed the same for two reads (so the reply is finished) runs as a Nexus command through the one command tool.
- **Answering:** the result is typed into the page's message box and sent, so the agent reads it as the next message and can carry on. It also shows in the co-pilot panel.

Guard rails, because anything printed on that page can reach the machine:
- What's on the page when it opens never runs, so a reload doesn't replay old commands.
- Each line runs once, and at most 6 commands a minute per page.
- Only read commands, plus `dump` (an idea into the Void), run here. Anything that changes Nexus is refused with how to allow it: a listener you set yourself (⦿ LISTEN → Run Nexus commands).
- Commands only you may run are refused everywhere.
- The typed answer never starts with `nexus>`, so it can't run itself.

`tests/modules/test-nexus-chat.test.js` 5/5. The page scripts that read the lines and type the answer ran for real in Clear Glass's engine.

## Not proven yet

Claude Code's web page itself hasn't been tried; the message box and Enter-to-send are found generically (the lowest visible text box). If the answer isn't typed in, Clear Glass says so (`nexus.chat.reply.failed`) and the answer is still in the co-pilot panel.
