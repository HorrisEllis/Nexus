/* NexusPanel — pages/apikeys.js */
import { $, html, api, esc, toast } from '../core.js';

export async function init() { /* keys are write-only; nothing to list */ }

window.panel = window.panel || {};
window.panel.createApiKey = async () => {
  const label = ($('key-label')?.value || '').trim();
  if (!label) { toast('Give the key a label', 'err'); return; }
  const scopes = Array.from($('key-scopes')?.selectedOptions || []).map(o => o.value);
  try {
    const r = await api('/auth/apikey', { method: 'POST', body: { label, scopes } });
    if (r?.key) {
      $('key-result').textContent = r.key;
      $('key-note').style.display = '';
      toast('Copy this key now — it is shown once');
    } else {
      toast('The auth engine did not return a key', 'err');
    }
  } catch (e) { toast('Could not create key — ' + e.message, 'err'); }
};
