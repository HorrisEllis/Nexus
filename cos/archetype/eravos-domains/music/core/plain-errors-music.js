/* Music domain wording for PlainErrors (P11.2 · gate E): the sharper, music-specific sentence wins over the generic one. */
(function () {
  'use strict';
  const P = window.PlainErrors; if (!P) return;
  P.register((f, c) => {
    const m = String(f.message || ''), who = c.subject;
    if (/microphone permission denied/i.test(m)) return { text: 'ERAVOS isn’t allowed to use the microphone.', hint: 'Allow it in the browser’s site settings (the icon left of the address bar), then press record again.' };
    if (f.fault_class === 'RUNTIME_001' && /^MIDI/i.test(m)) return { text: 'Your MIDI controller couldn’t be used.', hint: 'Close other music apps (Windows lets only one app use a MIDI device), plug it in before opening ERAVOS, then press Connect MIDI.' };
    if (/MIDI out/i.test(m)) return { text: 'Couldn’t send to your MIDI device.', hint: 'Check it is still plugged in, then press Connect MIDI again.' };
    if (/bad MIDI/i.test(m)) return { text: 'That .mid file couldn’t be read — it may be damaged.', hint: 'Export it again from the program that made it.' };
    if (/not an ERAVOS project|project file is not JSON|workspace version/i.test(m)) return { text: 'That file isn’t an ERAVOS project.', hint: 'Projects end in .eravos.json — use Session → Save to make one.' };
    if (/(not mounted|target .* gone|unmounted|cue target)/i.test(m)) return { text: `${who ? who + ': a' : 'A'} track points at a tool that isn’t on the canvas any more.`, hint: 'Pick another instrument in that track’s header.' };
    if (/AudioWorklet unavailable/i.test(m)) return { text: `${who || 'An effect'} is running in a simpler mode in this browser.`, hint: 'It still works; one or two options are off. Chrome and Edge run everything.' };
    if (/no audio loaded/i.test(m)) return { text: `${who || 'This tool'} has no sound loaded yet.`, hint: 'Drop an audio file on it, or send a clip to it.' };
    if (/max 8 lanes/i.test(m)) return { text: 'Automation holds up to 8 lanes.', hint: 'Remove one to add another.' };
    if (/^(generate|print): (target )?sequencer not mounted/i.test(m)) return { text: 'Add a Sequencer first — that’s where it writes the pattern.' };
    if (/energy target gone/i.test(m)) return { text: 'The tool the energy fader was moving is gone — skipped.', level: 'quiet' };
    if (/nothing analysed yet/i.test(m)) return { text: 'Analyse something first — drop or play a sound into it.' };
    if (/^preset .* not found/i.test(m)) return { text: 'That preset isn’t there any more.', level: 'quiet' };
    return null;
  });
})();
