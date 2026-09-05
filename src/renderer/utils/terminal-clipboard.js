// Terminal clipboard hardening shared by all terminal surfaces.
//
// Two different things break copying inside a mouse-tracking TUI, and this
// module deals with both.
//
// A. xterm's own selection dies behind the user's back. xterm drops the active
//    selection whenever data flagged as user input is sent to the pty
//    (SelectionService → onUserInput → clearSelection), and whenever the mouse
//    protocol is (re)set (CoreMouseService fires onProtocolChange on every
//    assignment, and Terminal answers it with SelectionService.disable()).
//    Claude Code opens with `CSI ?1049h ?1000h ?1002h ?1003h ?1006h`, so it
//    runs in the alternate buffer with any-motion tracking: every wheel tick
//    and every bare mouse move becomes a pty report, and it re-emits the whole
//    mouse-mode block on click/resize/paste. An Option+drag selection therefore
//    dies before the user reaches Cmd+C. Guards 1-4 below keep it alive.
//
// B. The TUI selects the text itself. Claude Code's fullscreen mode treats a
//    plain drag as an in-app selection: it paints its own highlight and copies
//    on release — with pbcopy locally, with OSC 52 over SSH. xterm never has a
//    selection in that flow, so Cmd+C had nothing to copy, OSC 52 was ignored,
//    and when the pointer left the terminal mid-drag xterm clamped the report
//    to the edge cell, so the TUI selected — and copied — a blank line.
//    Guards 5-7 make Cmd+C copy what the TUI highlighted, honour OSC 52, and
//    keep the drag inside the terminal.
//
// Guards, in order of how often they fire:
//   1. wheel  — swallow ticks while a selection is held (macOS trackpad
//      momentum keeps firing for ~1-2s after the gesture ends).
//   2. mousemove — swallow button-less moves while a selection is held.
//   3. restore — a mouse-mode re-arm is not interceptable from outside xterm,
//      so when the selection disappears with no user action behind it, put it
//      back from the remembered range.
//   4. snapshot — remember the last selection text so Cmd+C still copies it
//      even when the range could not be restored (content scrolled underneath).
//   5. TUI drag range — follow the SGR mouse reports xterm sends to the pty
//      (they are exactly what the TUI sees) and remember the dragged cells so
//      Cmd+C can copy them straight out of the buffer.
//   6. drag containment — while the button is down inside a tracking TUI,
//      moves that leave the terminal are dropped, and a release outside is
//      replayed at the last in-bounds position instead of the clamped edge.
//   7. OSC 52 — clipboard writes from the pty land on the system clipboard
//      (through the main process, so window focus does not matter). Queries
//      are never answered.
// Guards 1 and 2 only engage while mouse tracking is on and a selection
// exists, so normal scrolling and hovering are untouched. Guards 3-5 give up
// the moment the user really does move on (a mousedown or a keystroke).

import { isMouseReportingDisabled } from './terminal-mouse-mode.js';

const snapshots = new WeakMap();
const MODIFIERS = new Set(['Meta', 'Control', 'Shift', 'Alt', 'CapsLock']);

// --- pure helpers (unit-tested) --------------------------------------------

// Cmd+C / Cmd+V, matched by physical key as well as by character: with a
// Korean input source active, Cmd+C arrives with key "ㅊ" but code "KeyC".
export function isClipboardShortcut(e) {
  if (!e || !e.metaKey) return null;
  const code = e.code || '';
  const key = (e.key || '').toLowerCase();
  if (code === 'KeyC' || key === 'c') return 'copy';
  if (code === 'KeyV' || key === 'v') return 'paste';
  return null;
}

// ESC [ < code ; col ; row (M|m)  — the SGR (1006) mouse report format.
const SGR_ONE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;
const SGR_ALL = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

function reportFromMatch(m) {
  const code = Number(m[1]);
  return {
    button: code & 3,
    motion: (code & 32) !== 0,
    wheel: (code & 64) !== 0,
    col: Number(m[2]),
    row: Number(m[3]),
    release: m[4] === 'm',
  };
}

export function parseSgrMouseReport(data) {
  const m = SGR_ONE.exec(data);
  return m ? reportFromMatch(m) : null;
}

// State machine over mouse reports: a primary-button press anchors a range,
// drags move its head, the release finishes it. Hover, wheel and other
// buttons are ignored. Coordinates are 1-based, as in the reports.
export function reduceTuiDrag(state, report) {
  if (!report || report.wheel) return state;
  if (report.release) {
    if (!state || !state.dragging) return state;
    return { anchor: state.anchor, head: { col: report.col, row: report.row }, dragging: false, done: true };
  }
  if (report.button !== 0) return state;
  if (report.motion) {
    if (!state || !state.dragging) return state;
    return { ...state, head: { col: report.col, row: report.row } };
  }
  const cell = { col: report.col, row: report.row };
  return { anchor: cell, head: { ...cell }, dragging: true, done: false };
}

// Text of the viewport cells between anchor and head (inclusive), read
// straight from the buffer the way xterm's own selection would.
export function extractRangeText(term, range) {
  const buf = term.buffer.active;
  let a = range.anchor;
  let b = range.head;
  if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
  const lines = [];
  for (let row = a.row; row <= b.row; row++) {
    const line = buf.getLine(buf.viewportY + row - 1);
    if (!line) continue;
    const start = row === a.row ? a.col - 1 : 0;
    const end = row === b.row ? b.col : undefined;
    lines.push(line.translateToString(true, start, end));
  }
  return lines.join('\n');
}

// OSC 52 payload after the "52;" — `Pc ; Pd` with Pd base64 or "?" (query).
export function decodeOsc52(data) {
  const sep = data.indexOf(';');
  if (sep < 0) return null;
  const selection = data.slice(0, sep) || 'c';
  const payload = data.slice(sep + 1);
  if (!payload || payload === '?') return null;
  let bytes;
  try {
    const bin = atob(payload);
    bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
  return { selection, text: new TextDecoder('utf-8').decode(bytes) };
}

// --- clipboard plumbing ------------------------------------------------------

// Main-process write: works even when the renderer document is not focused,
// which is the normal case for data arriving from the pty.
function writeClipboardViaMain(text) {
  const api = typeof window !== 'undefined' && window.api && window.api.clipboard;
  if (api && typeof api.writeText === 'function') {
    api.writeText(text);
    return true;
  }
  return false;
}

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

function screenElementOf(term) {
  return (term.element && term.element.querySelector('.xterm-screen')) || term.element;
}

function pointInside(el, x, y) {
  const r = el.getBoundingClientRect();
  return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
}

export function protectTerminalSelection(term) {
  term.attachCustomWheelEventHandler(() => {
    // Guard 1: keep a held selection alive through trackpad momentum.
    if (term.hasSelection()) return !isTracking(term);
    // With reporting off, a full-screen TUI would otherwise get the wheel as
    // arrow keys (xterm's alt-buffer fallback); that moves Claude Code's
    // cursor and history, so swallow it — PgUp/PgDn still scroll the app.
    if (isMouseReportingDisabled() && term.buffer.active.type === 'alternate') return false;
    return true;
  });

  const state = { text: '', range: null, baseY: -1, buffer: '', tui: null };
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

  // Guard 5: the mouse reports xterm hands to the pty are exactly what the TUI
  // acts on, so following them reproduces the TUI's own selection range.
  term.onData((data) => {
    if (data.charCodeAt(0) !== 0x1b) return;
    for (const m of data.matchAll(SGR_ALL)) state.tui = reduceTuiDrag(state.tui, reportFromMatch(m));
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
  host.addEventListener('mousedown', (e) => {
    state.text = '';
    state.tui = null;
    beginTuiDrag(term, e);
  }, true);
  host.addEventListener('keydown', (e) => {
    // A modifier on its own is not "moving on" — and Cmd+C always arrives as a
    // bare Meta keydown first, so treating it as one would drop the snapshot a
    // keystroke before the copy asks for it.
    if (MODIFIERS.has(e.key)) return;
    if (isClipboardShortcut(e) === 'copy') return;
    state.text = '';
    state.tui = null;
  }, true);
}

// Guard 6: keep a TUI drag inside the terminal. xterm reports mouse positions
// clamped to the screen, so a pointer that wanders off the terminal makes the
// TUI extend its selection to the edge row/column. Drop those moves, and when
// the button comes up outside, replay the release at the last in-bounds spot
// so the TUI (and its copy-on-release) end where the user last saw the
// highlight. xterm's own document listeners still see the replayed mouseup,
// so its drag bookkeeping ends normally.
function beginTuiDrag(term, e) {
  if (e.button !== 0 || e.altKey || !e.isTrusted) return;
  if (term.modes.mouseTrackingMode === 'none') return;
  const screen = screenElementOf(term);
  if (!screen) return;
  const doc = screen.ownerDocument;
  let last = { x: e.clientX, y: e.clientY };

  const finish = () => {
    doc.removeEventListener('mousemove', onMove, true);
    doc.removeEventListener('mouseup', onUp, true);
  };
  const onMove = (ev) => {
    if (!ev.isTrusted) return;
    if (!(ev.buttons & 1)) { finish(); return; }
    if (pointInside(screen, ev.clientX, ev.clientY)) {
      last = { x: ev.clientX, y: ev.clientY };
    } else {
      ev.stopPropagation();
    }
  };
  const onUp = (ev) => {
    if (!ev.isTrusted) return;
    finish();
    if (pointInside(screen, ev.clientX, ev.clientY)) return;
    ev.stopPropagation();
    screen.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, cancelable: true, view: doc.defaultView,
      clientX: last.x, clientY: last.y, button: 0, buttons: 0,
    }));
  };
  doc.addEventListener('mousemove', onMove, true);
  doc.addEventListener('mouseup', onUp, true);
}

// Guard 7: OSC 52 clipboard writes from the pty.
export function installOsc52Clipboard(term) {
  return term.parser.registerOscHandler(52, (data) => {
    const decoded = decodeOsc52(data);
    if (decoded && decoded.text) {
      if (!writeClipboardViaMain(decoded.text) && typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(decoded.text).catch(() => {});
      }
    }
    return true; // consumed; a query ("?") is deliberately left unanswered
  });
}

// Write the selection to the clipboard directly on Cmd+C instead of relying on
// the native copy-event chain (which depends on focus and a still-live
// selection at event time). Falls back to the snapshot of a selection xterm
// dropped, then to the cells a TUI drag covered. Returns true if something
// was copied.
export function copyTerminalSelection(term) {
  const state = snapshots.get(term);
  let text = (term.hasSelection() && term.getSelection()) || (state && state.text) || '';
  if (!text && state && state.tui) text = extractRangeText(term, state.tui);
  if (!text) return false;
  navigator.clipboard.writeText(text).catch(() => {});
  return true;
}
