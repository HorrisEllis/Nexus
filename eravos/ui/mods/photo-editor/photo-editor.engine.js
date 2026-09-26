/* ═══════════════════════════════════════════════════════════
   MOD: PHOTO EDITOR  v1.0.0
   id: eravos.photo-editor

   Raster image editor. Holds the loaded image + params; the
   canvas element and file/drag UI live in mod-factory.js
   buildUI, which calls back into these pure helpers so the
   filter/crop/export logic has exactly one implementation.
   ═══════════════════════════════════════════════════════════ */

window.PhotoEditorEngine = (() => {
'use strict';

function mount(instanceId, sBus, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    brightness: 1, contrast: 1, saturation: 1, hue: 0,
    blur: 0, grayscale: 0, invert: 0, sepia: 0,
  };

  let _image = null; /* HTMLImageElement, natural size preserved */

  function filterString(p = _params) {
    return [
      `brightness(${p.brightness})`,
      `contrast(${p.contrast})`,
      `saturate(${p.saturation})`,
      `hue-rotate(${p.hue}deg)`,
      `blur(${p.blur}px)`,
      `grayscale(${p.grayscale})`,
      `invert(${p.invert})`,
      `sepia(${p.sepia})`,
    ].join(' ');
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { _image = img; sBus.publish('org:image_loaded', { w: img.naturalWidth, h: img.naturalHeight }); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  function draw(canvas) {
    if (!_image) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = _image.naturalWidth;
    canvas.height = _image.naturalHeight;
    ctx.filter = filterString();
    ctx.drawImage(_image, 0, 0);
    ctx.filter = 'none';
  }

  /* Crop to a rect given in canvas pixel coords, replacing the working image */
  function applyCrop(canvas, rect) {
    const x = Math.max(0, Math.round(rect.x)), y = Math.max(0, Math.round(rect.y));
    const w = Math.max(1, Math.round(rect.w)), h = Math.max(1, Math.round(rect.h));
    const src = document.createElement('canvas');
    src.width = canvas.width; src.height = canvas.height;
    src.getContext('2d').drawImage(canvas, 0, 0);

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);

    const img = new Image();
    return new Promise(resolve => {
      img.onload = () => { _image = img; sBus.publish('org:image_loaded', { w, h }); resolve(img); };
      img.src = out.toDataURL('image/png');
    });
  }

  function exportPNG(canvas, filename = 'eravos-photo-export.png') {
    /* Bake current filter into the exported pixels, not just the on-screen preview */
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const octx = out.getContext('2d');
    octx.filter = filterString();
    octx.drawImage(_image, 0, 0, out.width, out.height);

    const url = out.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();

    gBus.publish('photo:exported', { instanceId, filename, w: out.width, h: out.height });
    sBus.publish('org:exported', { filename });
  }

  function _updateParam(key, val) {
    if (key in _params) _params[key] = val;
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => _updateParam(key, value)),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.photo-editor',
    label:    'Photo Editor',
    provides: ['capability.image_edit', 'capability.image_export'],
    requires: [],
    permissions: ['filesystem_read', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'photo.hook.exported', direction: 'out', event_type: 'photo:exported', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    loadFile, draw, applyCrop, exportPNG, filterString,
    get image()  { return _image; },
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
