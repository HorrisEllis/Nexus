// cos/runtime/register.mjs — installs resolve-hook.mjs (node --import).
// module.register exists from Node 20.6; on an older Node the run proceeds
// without the ESM fallback (CommonJS still resolves through NODE_PATH).
import * as mod from 'node:module';

if (typeof mod.register === 'function') mod.register('./resolve-hook.mjs', import.meta.url);
