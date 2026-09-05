// "Mouse reporting off" — the escape hatch for TUIs that take over the mouse.
//
// Claude Code, vim, tmux and friends ask the terminal for mouse tracking
// (DECSET 1000/1002/1003 plus the 1006 SGR encoding). Once that is on, a plain
// drag is delivered to the program instead of selecting text in xterm, and the
// program decides what — if anything — reaches the clipboard. When that goes
// wrong the user has no way to just grab the text on screen.
//
// With reporting disabled, this guard swallows those requests before xterm
// applies them, switches tracking off if a program already had it, and puts
// everything back the moment reporting is re-enabled. The result is an
// ordinary terminal: drag selects, Cmd+C copies, the TUI never sees the mouse.
//
// The flag is global (one toolbar toggle, every terminal) and persisted, and
// every open terminal registers itself here so a toggle applies live.

const STORAGE_KEY = 'terminal-mouse-reporting-disabled';

// DECSET parameters that request mouse tracking or pick its encoding.
const MOUSE_MODES = new Set([9, 1000, 1001, 1002, 1003, 1005, 1006, 1015, 1016]);

let disabled = null; // lazily read from localStorage
const listeners = new Set();
const guards = new Set();

function readFlag() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function classifyDecsetParams(params) {
  const mouse = [];
  const other = [];
  for (const p of params) {
    const n = Array.isArray(p) ? p[0] : p;
    (MOUSE_MODES.has(n) ? mouse : other).push(n);
  }
  return { mouse, other };
}

export function isMouseReportingDisabled() {
  if (disabled === null) disabled = readFlag();
  return disabled;
}

export function setMouseReportingDisabled(value) {
  const next = !!value;
  if (next === isMouseReportingDisabled()) return;
  disabled = next;
  try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* private mode etc. */ }
  for (const guard of [...guards]) applyToGuard(guard, next);
  for (const cb of [...listeners]) cb(next);
}

export function toggleMouseReporting() {
  setMouseReportingDisabled(!isMouseReportingDisabled());
  return isMouseReportingDisabled();
}

export function onMouseReportingChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// The DECSET parameters xterm currently has active for a given tracking mode.
function modesFromTracking(mode) {
  switch (mode) {
    case 'x10': return [9];
    case 'vt200': return [1000];
    case 'drag': return [1000, 1002];
    case 'any': return [1000, 1002, 1003];
    default: return [];
  }
}

const resetSequence = (modes) => [...modes].sort((a, b) => b - a).map((m) => `\x1b[?${m}l`).join('');
const setSequence = (modes) => [...modes].map((m) => `\x1b[?${m}h`).join('');

function applyToGuard(guard, disabledNow) {
  const { term } = guard;
  if (!term.element || !term.element.isConnected) {
    guards.delete(guard);
    return;
  }
  if (disabledNow) {
    const active = modesFromTracking(term.modes.mouseTrackingMode);
    if (active.length === 0) return;
    for (const m of active) guard.swallowed.add(m);
    term.write(resetSequence(active));
  } else if (guard.swallowed.size > 0) {
    term.write(setSequence(guard.swallowed));
    guard.swallowed.clear();
  }
}

export function installMouseReportingGuard(term) {
  const guard = { term, swallowed: new Set() };
  guards.add(guard);

  term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
    if (!isMouseReportingDisabled()) return false;
    const { mouse, other } = classifyDecsetParams(params);
    if (mouse.length === 0) return false;
    for (const m of mouse) guard.swallowed.add(m);
    if (other.length === 0) return true; // fully swallowed
    // Mixed request (e.g. ?1049;1000h): let xterm apply all of it, then take
    // the mouse part back. Deferred because the parser is mid-sequence.
    setTimeout(() => { if (isMouseReportingDisabled()) term.write(resetSequence(mouse)); }, 0);
    return false;
  });

  term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
    // The program turned a mode off itself — nothing to restore later.
    for (const m of classifyDecsetParams(params).mouse) guard.swallowed.delete(m);
    return false;
  });

  return guard;
}

export function mouseReportingStatusText(off) {
  return off
    ? 'Mouse reporting off: drag selects text, Cmd+C copies'
    : 'Mouse reporting on: TUIs get the mouse again';
}

// Toolbar button shared by every terminal surface.
const BTN_ON = 'btn-mouse-toggle text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300';
const BTN_OFF = 'btn-mouse-toggle text-xs px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white';

export function renderMouseToggleButton(btn) {
  if (!btn) return;
  const off = isMouseReportingDisabled();
  btn.textContent = off ? '🖱 Mouse off' : '🖱 Mouse';
  btn.className = off ? BTN_OFF : BTN_ON;
  btn.title = off
    ? 'Mouse reporting is OFF: TUIs never see the mouse, drag selects text, Cmd+C copies. Click to give the mouse back to TUIs.'
    : 'Mouse reporting is ON: TUIs such as Claude Code get the mouse. Click to turn it off when selecting or copying text fails.';
}
