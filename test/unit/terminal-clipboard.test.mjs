// Unit tests for the pure helpers behind terminal copy handling.
// Run: npm test  (node --test test/unit/)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isClipboardShortcut,
  parseSgrMouseReport,
  reduceTuiDrag,
  extractRangeText,
  decodeOsc52,
} from '../../src/renderer/utils/terminal-clipboard.js';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// --- isClipboardShortcut -----------------------------------------------------

test('Cmd+C typed with a Korean input source (key "ㅊ", code KeyC) is still copy', () => {
  assert.equal(isClipboardShortcut({ metaKey: true, key: 'ㅊ', code: 'KeyC' }), 'copy');
});

test('Cmd+C / Cmd+V are recognised by key as well as by code', () => {
  assert.equal(isClipboardShortcut({ metaKey: true, key: 'c', code: 'KeyC' }), 'copy');
  assert.equal(isClipboardShortcut({ metaKey: true, key: 'c' }), 'copy');
  assert.equal(isClipboardShortcut({ metaKey: true, key: 'v', code: 'KeyV' }), 'paste');
  assert.equal(isClipboardShortcut({ metaKey: true, key: 'ㅍ', code: 'KeyV' }), 'paste');
});

test('Ctrl+C and a bare c are not clipboard shortcuts (they must reach the pty)', () => {
  assert.equal(isClipboardShortcut({ ctrlKey: true, key: 'c', code: 'KeyC' }), null);
  assert.equal(isClipboardShortcut({ key: 'c', code: 'KeyC' }), null);
  assert.equal(isClipboardShortcut({ metaKey: true, key: 'x', code: 'KeyX' }), null);
});

// --- parseSgrMouseReport -----------------------------------------------------

test('parseSgrMouseReport decodes press, drag, release and hover reports', () => {
  assert.deepEqual(parseSgrMouseReport('\x1b[<0;10;20M'),
    { button: 0, motion: false, wheel: false, col: 10, row: 20, release: false });
  assert.deepEqual(parseSgrMouseReport('\x1b[<32;12;20M'),
    { button: 0, motion: true, wheel: false, col: 12, row: 20, release: false });
  assert.deepEqual(parseSgrMouseReport('\x1b[<0;40;20m'),
    { button: 0, motion: false, wheel: false, col: 40, row: 20, release: true });
  assert.deepEqual(parseSgrMouseReport('\x1b[<35;50;10M'),
    { button: 3, motion: true, wheel: false, col: 50, row: 10, release: false });
  assert.deepEqual(parseSgrMouseReport('\x1b[<64;5;6M'),
    { button: 0, motion: false, wheel: true, col: 5, row: 6, release: false });
});

test('parseSgrMouseReport ignores keyboard input and other escape sequences', () => {
  assert.equal(parseSgrMouseReport('hello'), null);
  assert.equal(parseSgrMouseReport('\x1b[A'), null);
  assert.equal(parseSgrMouseReport('\x1b[<0;10;20'), null);
});

// --- reduceTuiDrag -----------------------------------------------------------

const press = (col, row) => parseSgrMouseReport(`\x1b[<0;${col};${row}M`);
const drag = (col, row) => parseSgrMouseReport(`\x1b[<32;${col};${row}M`);
const release = (col, row) => parseSgrMouseReport(`\x1b[<0;${col};${row}m`);
const hover = (col, row) => parseSgrMouseReport(`\x1b[<35;${col};${row}M`);

test('a press starts a drag anchored at the pressed cell', () => {
  const s = reduceTuiDrag(null, press(10, 5));
  assert.deepEqual(s, { anchor: { col: 10, row: 5 }, head: { col: 10, row: 5 }, dragging: true, done: false });
});

test('drag reports move the head; the release finishes the range', () => {
  let s = reduceTuiDrag(null, press(10, 5));
  s = reduceTuiDrag(s, drag(20, 5));
  assert.deepEqual(s.head, { col: 20, row: 5 });
  assert.equal(s.dragging, true);
  s = reduceTuiDrag(s, release(25, 6));
  assert.deepEqual(s, { anchor: { col: 10, row: 5 }, head: { col: 25, row: 6 }, dragging: false, done: true });
});

test('hover and wheel reports never change a finished or active range', () => {
  let s = reduceTuiDrag(null, press(10, 5));
  s = reduceTuiDrag(s, release(20, 5));
  const after = reduceTuiDrag(s, hover(3, 1));
  assert.deepEqual(after, s);
  const active = reduceTuiDrag(reduceTuiDrag(null, press(1, 1)), hover(9, 9));
  assert.deepEqual(active.head, { col: 1, row: 1 });
});

test('a new press replaces the previous range', () => {
  let s = reduceTuiDrag(null, press(10, 5));
  s = reduceTuiDrag(s, release(20, 5));
  s = reduceTuiDrag(s, press(2, 2));
  assert.deepEqual(s, { anchor: { col: 2, row: 2 }, head: { col: 2, row: 2 }, dragging: true, done: false });
});

test('a release with no press in flight is ignored', () => {
  assert.equal(reduceTuiDrag(null, release(5, 5)), null);
});

// --- extractRangeText --------------------------------------------------------

function fakeTerm(lines, viewportY = 0) {
  return {
    buffer: {
      active: {
        viewportY,
        getLine(y) {
          const text = lines[y];
          if (text === undefined) return undefined;
          return {
            translateToString(trimRight, start = 0, end = text.length) {
              const slice = text.slice(start, end);
              return trimRight ? slice.replace(/\s+$/, '') : slice;
            },
          };
        },
      },
    },
  };
}

test('extractRangeText copies the cells between anchor and head inclusive (1-based SGR coords)', () => {
  const term = fakeTerm(['  hello world  ', 'second line', '', 'fourth']);
  assert.equal(extractRangeText(term, { anchor: { col: 3, row: 1 }, head: { col: 7, row: 1 } }), 'hello');
});

test('extractRangeText spans rows, trims trailing blanks and keeps empty rows', () => {
  const term = fakeTerm(['  hello world  ', 'second line', '', 'fourth']);
  assert.equal(
    extractRangeText(term, { anchor: { col: 1, row: 1 }, head: { col: 2, row: 4 } }),
    '  hello world\nsecond line\n\nfo',
  );
});

test('extractRangeText normalises a backwards drag', () => {
  const term = fakeTerm(['  hello world  ', 'second line']);
  assert.equal(
    extractRangeText(term, { anchor: { col: 9, row: 2 }, head: { col: 3, row: 1 } }),
    'hello world\nsecond li',
  );
});

test('extractRangeText reads viewport rows relative to the scrolled buffer', () => {
  const term = fakeTerm(['old scrollback', 'visible one', 'visible two'], 1);
  assert.equal(extractRangeText(term, { anchor: { col: 1, row: 1 }, head: { col: 11, row: 1 } }), 'visible one');
});

test('extractRangeText returns an empty string for a range of missing rows', () => {
  const term = fakeTerm(['only']);
  assert.equal(extractRangeText(term, { anchor: { col: 1, row: 5 }, head: { col: 3, row: 6 } }), '');
});

// --- decodeOsc52 -------------------------------------------------------------

test('decodeOsc52 decodes a clipboard write into text', () => {
  assert.deepEqual(decodeOsc52('c;' + b64('OSC52-TEST')), { selection: 'c', text: 'OSC52-TEST' });
});

test('decodeOsc52 handles UTF-8 payloads', () => {
  assert.deepEqual(decodeOsc52('c;' + b64('한글 테스트 ✓')), { selection: 'c', text: '한글 테스트 ✓' });
});

test('decodeOsc52 defaults an empty selection list to the clipboard', () => {
  assert.deepEqual(decodeOsc52(';' + b64('x')), { selection: 'c', text: 'x' });
});

test('decodeOsc52 refuses clipboard queries and malformed payloads', () => {
  assert.equal(decodeOsc52('c;?'), null);
  assert.equal(decodeOsc52('c;'), null);
  assert.equal(decodeOsc52('c;!!!not-base64!!!'), null);
  assert.equal(decodeOsc52('no-separator'), null);
});
