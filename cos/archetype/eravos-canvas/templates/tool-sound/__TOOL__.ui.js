/* __ID__ UI — the window. Only view.* : state in, view.emit('<ui_hook>') out. No engine access. */
OrganismFactory.reg('__ID__', function (view) {
  const UI = view.ui, h = UI.h;
  view.root.append(
    h('div', { class: 'org-row', style: { justifyContent: 'space-between' } }, [UI.Button({ label: 'Poke', onClick: () => view.emit('poke', {}) }).el, UI.presetBar(view)]),
    UI.paramPanel(view, null, { size: 34 }),
    UI.hint('Template tool: replace this window with yours. Keep it to view.* only.'),
  );
});
