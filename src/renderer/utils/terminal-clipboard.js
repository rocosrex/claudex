// Terminal clipboard hardening shared by all terminal surfaces.
//
// xterm.js clears the active selection whenever data flagged as user input
// is sent to the pty (SelectionService → onUserInput → clearSelection).
// Wheel events become such input in two states: with mouse tracking on
// (Claude Code) a tick turns into an SGR mouse report, and in the alt
// buffer (tmux, vim, less) it turns into arrow-key sequences. macOS
// trackpads keep emitting momentum ticks for ~1-2s after the gesture ends,
// so a tick landing between mouse-up and Cmd+C silently wipes the
// selection and the copy becomes a no-op, leaving stale clipboard content.

// Swallow wheel events while a selection is held, but only in the states
// where the wheel would turn into pty input. Local scrollback scrolling in
// the normal buffer is unaffected.
export function protectTerminalSelection(term) {
  term.attachCustomWheelEventHandler(() => {
    if (!term.hasSelection()) return true;
    const tracking = term.modes.mouseTrackingMode !== 'none';
    const altBuffer = term.buffer.active.type === 'alternate';
    return !(tracking || altBuffer);
  });
}

// Write the selection to the clipboard directly on Cmd+C instead of relying
// on the native copy-event chain (which depends on focus and a still-live
// selection at event time). Returns true if something was copied.
export function copyTerminalSelection(term) {
  if (!term.hasSelection()) return false;
  navigator.clipboard.writeText(term.getSelection()).catch(() => {});
  return true;
}
