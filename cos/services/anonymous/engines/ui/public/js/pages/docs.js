/* NexusPanel — pages/docs.js */
import { html, apiSoft, esc } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/readme');
  html('docs-body', r?.html
    ? r.html
    : '<p style="color:var(--dim)">README.md was not found next to nexus.js. ' +
      'The full reference ships with the platform — check the repository root.</p>');
}
