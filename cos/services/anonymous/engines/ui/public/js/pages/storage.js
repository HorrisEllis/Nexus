/* NexusPanel — pages/storage.js */
import { $, html, api, apiSoft, act, esc, stats, emptyRow, iconBtn, toast } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/storage');
  const buckets = r?.buckets || [];

  html('storage-stats', stats([
    { label: 'Buckets',  val: buckets.length, cls: '' },
    { label: 'Objects',  val: buckets.reduce((a, b) => a + (b.objects || 0), 0), cls: '' },
    { label: 'Endpoint', val: ':9100', cls: 'b' },
  ]));

  html('buckets-table', buckets.length
    ? buckets.map(b =>
        '<tr><td class="num">' + esc(b.bucket) + '</td>' +
        '<td class="num">' + esc(b.objects || 0) + '</td>' +
        '<td><span class="badge info">' + esc(b.access || 'private') + '</span></td>' +
        '<td>' + iconBtn('trash', "panel.deleteBucket('" + esc(b.bucket) + "')", 'Delete bucket') + '</td></tr>'
      ).join('')
    : emptyRow(4, 'No buckets yet', 'Create one to start storing objects over the S3-compatible API.'));
}

window.panel = window.panel || {};

window.panel.createBucket = async () => {
  const name = ($('bucket-name')?.value || '').trim();
  if (!name) { toast('Enter a bucket name', 'err'); return; }
  const ok = await act('Bucket created', () => api('/ui/storage/bucket', {
    method: 'POST', body: { bucket: name, access: $('bucket-access')?.value || 'private' },
  }));
  if (ok) init();
};

window.panel.deleteBucket = async name => {
  if (!confirm('Delete bucket ' + name + ' and everything in it?')) return;
  const ok = await act('Bucket deleted', () =>
    api('/storage/' + encodeURIComponent(name), {
      method: 'DELETE', headers: { 'x-tenant-id': 'default' },
    }));
  if (ok) init();
};
