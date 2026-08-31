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
// Four guards, in order of how often they fire:
//   1. wheel  — swallow ticks while a selection is held (macOS trackpad
//      momentum keeps firing for ~1-2s after the gesture ends).
//   2. mousemove — swallow button-less moves while a selection is held.
//   3. restore — a mouse-mode re-arm is not interceptable from outside xterm,
//      so when the selection disappears with no user action behind it, put it
//      back from the remembered range.
//   4. snapshot — remember the last selection text so Cmd+C still copies it
//      even when the range could not be restored (content scrolled underneath).
// Guards 1 and 2 only engage while mouse tracking is on and a selection
// exists, so normal scrolling and hovering are untouched. Guards 3 and 4 both
// give up the moment the user really does move on (a mousedown or a keystroke).

const snapshots = new WeakMap();
const MODIFIERS = new Set(['Meta', 'Control', 'Shift', 'Alt', 'CapsLock']);

function isTracking(term) {
  return term.modes.mouseTrackingMode !== 'none' || term.buffer.active.type === 'alternate';
}

// Re-apply a selection xterm threw away. term.select() takes a start cell plus a
// cell count that wraps across rows, and getSelectionPosition() reports in the
// same absolute buffer coordinates, so a contiguous range round-trips exactly.
// SelectionService.setSelection() does not consult the `enabled` flag, so this
// still works while mouse tracking has the selection service disabled.
function restoreSelection(term, range) {
  const length = (range.end.y - range.start.y) * term.cols + (range.end.x - range.start.x);
  if (length <= 0) return;
  term.select(range.start.x, range.start.y, length);
}

export function protectTerminalSelection(term) {
  term.attachCustomWheelEventHandler(() => {
    if (!term.hasSelection()) return true;
    return !isTracking(term);
  });

  const state = { text: '', range: null, baseY: -1, buffer: '' };
  snapshots.set(term, state);

  // Guards the synchronous onSelectionChange that term.select() fires back at us.
  let restoring = false;

  term.onSelectionChange(() => {
    if (restoring) return;

    if (term.hasSelection()) {
      const text = term.getSelection();
      if (text) {
        state.text = text;
        state.range = term.getSelectionPosition() || null;
        state.baseY = term.buffer.active.baseY;
        state.buffer = term.buffer.active.type;
      }
      return;
    }

    // The selection just went away. A real mousedown or keystroke clears the
    // snapshot first, so anything still held here means xterm dropped it on its
    // own — SelectionService.disable() answering a mouse-mode re-arm. Put the
    // highlight back so the user can see what Cmd+C is about to copy.
    if (!state.text || !state.range) return;
    if (term.buffer.active.type !== state.buffer || term.buffer.active.baseY !== state.baseY) {
      // Content scrolled underneath us; the stored coordinates no longer point
      // at the same cells. The text snapshot still backs Cmd+C.
      return;
    }
    restoring = true;
    try { restoreSelection(term, state.range); } finally { restoring = false; }
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
