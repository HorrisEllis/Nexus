'use strict';
/**
 * clear-glass/src/automation/from-macro.js — a saved macro, as workflow steps.
 * component_id: cg.automation.from-macro
 *
 * §0.39.265 — a recorded macro is a fixed list of browser_action calls; a
 * workflow can loop, branch, read the page and run on a schedule. This turns
 * one into the other so a recording can grow: navigate/click/type/hover/
 * scroll/wait/wait_for/eval/screenshot/back/forward/reload map to browser,
 * wait_until and delay steps; the macro's {{name}} slots become {{vars.name}}
 * (with the macro's params as the workflow's variables). Steps with no
 * workflow equivalent (Erosmancer node ids, toasts …) are kept as a log step
 * saying so, never silently dropped.
 */

const slots = (v) => (typeof v === 'string' ? v.replace(/\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g, (m, n) => (['vars', 'steps', 'last', 'item', 'index', 'trigger', 'now', 'memory', 'workflow'].includes(n) ? m : `{{vars.${n}}}`)) : v);

function macroToSteps(macro, { page = 'auto' } = {}) {
  const out = [];
  const warn = [];
  for (const [i, s] of (macro.steps || []).entries()) {
    const d = (s && s.data && typeof s.data === 'object') ? s.data : { value: s && s.data };
    const b = (cfg) => out.push({ type: 'browser', config: { page, ...cfg } });
    if (s && s.engine === 'erosmancer') { warn.push(i + 1); out.push({ type: 'log', config: { message: `macro step ${i + 1} (Erosmancer ${s.action}) has no workflow equivalent — replace it with a browser step` } }); continue; }
    switch (s && s.action) {
      case 'navigate': b({ action: 'navigate', url: slots(d.url || d.value || '') }); break;
      case 'click': d.selector ? b({ action: 'dom_click', selector: slots(d.selector) }) : b({ action: 'click', selector: '' }); break;
      case 'type':
        if (d.text === '\n') b({ action: 'press', key: 'Enter', selector: slots(d.selector || '') });
        else if (d.selector) b({ action: 'fill', selector: slots(d.selector), value: slots(d.text ?? '') });
        else b({ action: 'type', value: slots(d.text ?? '') });
        break;
      case 'hover': b({ action: 'hover', selector: slots(d.selector || '') }); break;
      case 'scroll': d.selector ? b({ action: 'scroll_to', selector: slots(d.selector) }) : b({ action: 'scroll', deltaY: d.deltaY || 600 }); break;
      case 'wait': out.push({ type: 'delay', config: { ms: parseInt(d.ms, 10) || 1000 } }); break;
      case 'wait_for': out.push({ type: 'wait_until', config: { page, kind: 'present', selector: slots(d.selector || ''), timeoutMs: parseInt(d.timeout, 10) || 10000 } }); break;
      case 'eval': b({ action: 'eval', code: slots(d.code || d.value || '') }); break;
      case 'screenshot': b({ action: 'screenshot' }); break;
      case 'back': case 'forward': case 'reload': b({ action: s.action }); break;
      default: warn.push(i + 1); out.push({ type: 'log', config: { message: `macro step ${i + 1} (${(s && s.action) || '?'}) has no workflow equivalent — replace it with a browser step` } });
    }
  }
  return { steps: out, warnings: warn };
}

/** macroToWorkflow(macro) -> { name, description, vars, steps } ready for engine.create() */
function macroToWorkflow(macro, opts = {}) {
  const { steps, warnings } = macroToSteps(macro, opts);
  const vars = Object.fromEntries((macro.params || []).map(p => [p, '']));
  return {
    name: opts.name || `${macro.name} (workflow)`,
    description: `Made from the macro “${macro.name}”${macro.urlPattern ? ` (for ${macro.urlPattern})` : ''}.${warnings.length ? ` Steps ${warnings.join(', ')} need replacing.` : ''}`,
    vars, steps: [{ type: 'trigger', config: {} }, ...steps], warnings,
  };
}

module.exports = { macroToSteps, macroToWorkflow };
