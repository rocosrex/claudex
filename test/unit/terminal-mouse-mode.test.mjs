// Unit tests for the "mouse reporting off" escape hatch.
// Run: npm test  (node --test test/unit/)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDecsetParams,
  isMouseReportingDisabled,
  setMouseReportingDisabled,
  onMouseReportingChange,
  installMouseReportingGuard,
} from '../../src/renderer/utils/terminal-mouse-mode.js';

// The module persists the flag in localStorage; give it an in-memory one.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeTerm(mouseTrackingMode = 'none') {
  const handlers = [];
  const term = {
    writes: [],
    modes: { mouseTrackingMode },
    element: { isConnected: true },
    parser: {
      registerCsiHandler(id, cb) {
        handlers.push({ id, cb });
        return { dispose() {} };
      },
    },
    write(data) { term.writes.push(data); },
  };
  term.csi = (final, params) => {
    const h = handlers.find((x) => x.id.final === final && x.id.prefix === '?');
    assert.ok(h, `no CSI ? ${final} handler registered`);
    return h.cb(params);
  };
  return term;
}

test.beforeEach(() => {
  store.clear();
  setMouseReportingDisabled(false);
});

// --- classifyDecsetParams ----------------------------------------------------

test('classifyDecsetParams separates mouse modes from everything else', () => {
  assert.deepEqual(classifyDecsetParams([1000]), { mouse: [1000], other: [] });
  assert.deepEqual(classifyDecsetParams([1049]), { mouse: [], other: [1049] });
  assert.deepEqual(classifyDecsetParams([1000, 1002, 1003, 1006, 1049, 2004]),
    { mouse: [1000, 1002, 1003, 1006], other: [1049, 2004] });
});

// --- flag + subscription -----------------------------------------------------

test('the flag defaults to off, persists, and notifies subscribers', () => {
  assert.equal(isMouseReportingDisabled(), false);
  const seen = [];
  const off = onMouseReportingChange((v) => seen.push(v));
  setMouseReportingDisabled(true);
  assert.equal(isMouseReportingDisabled(), true);
  assert.equal(store.get('terminal-mouse-reporting-disabled'), '1');
  off();
  setMouseReportingDisabled(false);
  assert.deepEqual(seen, [true]);
});

// --- installMouseReportingGuard ---------------------------------------------

test('with reporting enabled, mouse-mode requests pass through untouched', () => {
  const term = fakeTerm();
  installMouseReportingGuard(term);
  assert.equal(term.csi('h', [1000]), false);
  assert.equal(term.csi('h', [1049]), false);
  assert.deepEqual(term.writes, []);
});

test('with reporting disabled, pure mouse-mode requests are swallowed', () => {
  setMouseReportingDisabled(true);
  const term = fakeTerm();
  installMouseReportingGuard(term);
  assert.equal(term.csi('h', [1000]), true);
  assert.equal(term.csi('h', [1003]), true);
  assert.equal(term.csi('h', [1049]), false, 'alt-screen must still pass');
});

test('a mixed request passes through and tracking is switched back off afterwards', async () => {
  setMouseReportingDisabled(true);
  const term = fakeTerm();
  installMouseReportingGuard(term);
  assert.equal(term.csi('h', [1049, 1000]), false);
  await tick();
  assert.ok(term.writes.some((w) => w.includes('\x1b[?1000l')), `expected a 1000l reset, got ${JSON.stringify(term.writes)}`);
});

test('turning reporting back on restores the modes that were swallowed', () => {
  setMouseReportingDisabled(true);
  const term = fakeTerm();
  installMouseReportingGuard(term);
  term.csi('h', [1000]);
  term.csi('h', [1002]);
  term.csi('h', [1006]);
  setMouseReportingDisabled(false);
  assert.deepEqual(term.writes, ['\x1b[?1000h\x1b[?1002h\x1b[?1006h']);
});

test('a mode the app itself reset is not restored later', () => {
  setMouseReportingDisabled(true);
  const term = fakeTerm();
  installMouseReportingGuard(term);
  term.csi('h', [1000]);
  term.csi('h', [1003]);
  assert.equal(term.csi('l', [1003]), false, 'resets pass through');
  setMouseReportingDisabled(false);
  assert.deepEqual(term.writes, ['\x1b[?1000h']);
});

test('disabling while a TUI already tracks the mouse switches tracking off and remembers it', () => {
  const term = fakeTerm('any');
  installMouseReportingGuard(term);
  setMouseReportingDisabled(true);
  assert.deepEqual(term.writes, ['\x1b[?1003l\x1b[?1002l\x1b[?1000l']);
  term.modes.mouseTrackingMode = 'none';
  setMouseReportingDisabled(false);
  assert.deepEqual(term.writes.at(-1), '\x1b[?1000h\x1b[?1002h\x1b[?1003h');
});

test('terminals whose element left the DOM are dropped from the guard set', () => {
  const gone = fakeTerm('any');
  installMouseReportingGuard(gone);
  gone.element.isConnected = false;
  setMouseReportingDisabled(true);
  assert.deepEqual(gone.writes, []);
});
