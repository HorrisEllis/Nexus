# NEXUS — Start Here

## 1. Install dependencies (once)
```
npm install
```

## 2. Boot order (each in its own terminal)

```
node bridge/nexus-bridge.js     ← terminal 1  (port 9999)
node cortex/boot.js             ← terminal 2  (port 3748)
node guardian/server.js         ← terminal 3  (port 7820)
node emerge-ide.js              ← terminal 4  (port 4242)
```

Or start core three together:
```
npm run start:core
```

## 3. URLs

| What | URL |
|------|-----|
| Emerge IDE | http://localhost:4242 |
| Cortex | http://localhost:3748 |
| Cockpit | http://localhost:7820/cockpit |
| Bridge | http://localhost:9999/bridge/health |

## 4. CLI

```
node cli/nexus.js help
node cli/nexus.js status
node cli/nexus.js /guardian --help
node cli/nexus.js /cockpit help
```

Or `npm link` once → then just `nexus status`

## 5. Userscripts (for AI providers)

Install in Tampermonkey:
- `guardian/userscript-chatgpt.js` on chatgpt.com  
- `guardian/userscript-claude.js` on claude.ai

Then visit https://127.0.0.1:7821/ once and accept the self-signed cert.

## 6. Ollama (local AI)

```
ollama serve
ollama pull qwen2.5-coder:1.5b
```
