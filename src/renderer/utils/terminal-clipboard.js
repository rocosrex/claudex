// Terminal clipboard hardening shared by all terminal surfaces.
//
// xterm.js drops the active selection whenever data flagged as user input is
// sent to the pty (SelectionService → onUserInput → clearSelection), and it
// also drops it whenever the mouse protocol is (re)set (CoreMouseService fires
// onProtocolChange on every assignment, and Terminal answers it with
// SelectionService.disable()).
//
// TUIs make both fire constantly. Claude Code opens with
// `CSI ?1049h ?1000h ?1002h ?1003h ?1006h`, so it runs in the alternate buffer
// with any-motion tracking: every wheel tick and every bare mouse move becomes
// a pty report, and it re-emits the whole mouse-mode block on resize/paste.
// The result is that a selection made over Claude Code output dies before the
// user reaches Cmd+C, and the copy is a silent no-op.
//
// Three guards, in order of how often they fire:
//   1. wheel  — swallow ticks while a selection is held (macOS trackpad
//      momentum keeps firing for ~1-2s after the gesture ends).
//   2. mousemove — swallow button-less moves while a selection is held.
//   3. snapshot — remember the last selection text so Cmd+C still copies it
//      if something we cannot intercept (a mouse-mode re-arm on resize) wipes
//      the selection anyway.
// Guards 1 and 2 only engage while mouse tracking is on and a selection
// exists, so normal scrolling and hovering are untouched.

const snapshots = new WeakMap();
const MODIFIERS = new Set(['Meta', 'Control', 'Shift', 'Alt', 'CapsLock']);

function isTracking(term) {
  return term.modes.mouseTrackingMode !== 'none' || term.buffer.active.type === 'alternate';
}

export function protectTerminalSelection(term) {
  term.attachCustomWheelEventHandler(() => {
    if (!term.hasSelection()) return true;
    return !isTracking(term);
  });

  const state = { text: '' };
  snapshots.set(term, state);
  term.onSelectionChange(() => {
    const text = term.getSelection();
    if (text) state.text = text;
  });

  // Listen on the host so the handlers run before the ones xterm attaches to
  // its own root element.
  const host = (term.element && term.element.parentElement) || term.element;
  if (!host) return;

  host.addEventListener('mousemove', (e) => {
    if (e.buttons) return; // a drag is a deliberate interaction, let it through
    if (term.hasSelection() && isTracking(term)) e.stopPropagation();
  }, true);

  // A click or a keystroke is the user deliberately moving on: let the stale
  // selection text go with it so Cmd+C can never resurrect it.
  host.addEventListener('mousedown', () => { state.text = ''; }, true);
  host.addEventListener('keydown', (e) => {
    // A modifier on its own is not "moving on" — and Cmd+C always arrives as a
    // bare Meta keydown first, so treating it as one would drop the snapshot a
    // keystroke before the copy asks for it.
    if (MODIFIERS.has(e.key)) return;
    if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyC' || (e.key && e.key.toLowerCase() === 'c'))) return;
    state.text = '';
  }, true);
}

// Write the selection to the clipboard directly on Cmd+C instead of relying on
// the native copy-event chain (which depends on focus and a still-live
// selection at event time). Returns true if something was copied.
export function copyTerminalSelection(term) {
  const state = snapshots.get(term);
  const text = (term.hasSelection() && term.getSelection()) || (state && state.text) || '';
  if (!text) return false;
  navigator.clipboard.writeText(text).catch(() => {});
  return true;
}
