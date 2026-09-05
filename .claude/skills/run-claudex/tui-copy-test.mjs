// Regression test for copying text that a mouse-tracking TUI selects itself.
//
//   node .claude/skills/run-claudex/tui-copy-test.mjs [label]
//
// Claude Code's fullscreen mode owns the mouse: a plain drag becomes an in-app
// selection that Claude Code copies on release — with pbcopy locally and with
// OSC 52 over SSH. xterm never has a selection of its own in that flow, so
// (1) OSC 52 writes were silently ignored, (2) Cmd+C had nothing to copy, and
// (3) a drag whose pointer left the terminal was clamped to the edge row by
// xterm, so the TUI copied a blank line. On top of that the "Mouse" toolbar
// toggle gives the user a way out: with reporting off the TUI never gets the
// mouse and plain drag selects in xterm like a normal terminal.
//
// This drives the real app against fake-tui.py — alternate buffer + SGR mouse
// tracking, logging every byte it receives — and reads the real clipboard
// back with pbpaste. It runs with a Finder-like environment (no TERM_PROGRAM,
// minimal PATH) because that is what the packaged app gets.
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const BIN = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const FAKE_TUI = path.join(import.meta.dirname, 'fake-tui.py');
const SHOTS = process.env.SCREENSHOT_DIR || '/tmp/claudex-shots';
const LABEL = process.argv[2] || 'tui-copy';
fs.mkdirSync(SHOTS, { recursive: true });

const MARKER = 'FAKE-TUI-MARKER'; // fake-tui.py's default; never typed, so the shell echo line cannot match it
const SENTINEL = 'SENTINEL-CLIPBOARD-UNTOUCHED-' + Date.now();
const LOG = path.join(os.tmpdir(), `claudex-tui-${Date.now()}.log`);
const MOUSE_FLAG_KEY = 'terminal-mouse-reporting-disabled';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${LABEL}]`, ...a);
const pb = () => execSync('pbpaste').toString();
const setClip = (text) => execSync('pbcopy', { input: text });

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

if (!fs.existsSync(BIN)) {
  console.error('electron binary missing — run `npm install` in', APP_DIR);
  process.exit(2);
}

// What Claudex.app gets when launched from Finder: no TERM_PROGRAM, bare PATH.
const env = {
  HOME: process.env.HOME, USER: process.env.USER, LOGNAME: process.env.LOGNAME || process.env.USER,
  SHELL: process.env.SHELL || '/bin/zsh', TMPDIR: process.env.TMPDIR, LANG: process.env.LANG || 'en_US.UTF-8',
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
};

const savedClipboard = pb();
const app = await electron.launch({ executablePath: BIN, args: [APP_DIR], cwd: APP_DIR, env, timeout: 60_000 });
const page = await app.firstWindow();
page.on('pageerror', e => log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') log('CONSOLE ERROR:', m.text()); });

const state = () => page.evaluate(() => {
  const sel = document.querySelector('.xterm-selection');
  return {
    selRects: sel ? sel.children.length : -1,
    mouseEventsOn: !!document.querySelector('.xterm.enable-mouse-events'),
  };
});

const findRow = async (text, timeout = 8000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const box = await page.evaluate((m) => {
      const row = [...document.querySelectorAll('.xterm-rows > div')].find(d => (d.textContent || '').includes(m));
      if (!row) return null;
      const b = row.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, text);
    if (box) return box;
    await sleep(250);
  }
  throw new Error(`row containing ${JSON.stringify(text)} never rendered`);
};

const typeCmd = async (cmd) => { await page.keyboard.type(cmd); await page.keyboard.press('Enter'); };
const focusTerminal = async () => { await page.click('.terminal-container'); await sleep(150); };

// SGR mouse reports the stand-in TUI received: ESC [ < code ; col ; row (M|m)
const parseLog = () => {
  if (!fs.existsSync(LOG)) return [];
  const s = fs.readFileSync(LOG, 'latin1');
  return [...s.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g)]
    .map(m => ({ code: +m[1], col: +m[2], row: +m[3], release: m[4] === 'm' }));
};

const dragRow = async (box, fromX, toX, { pointerY } = {}) => {
  const y = pointerY ?? box.y + box.h / 2;
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 12 });
  await page.mouse.up();
  await sleep(300);
};

try {
  await page.waitForSelector('.sidebar-project-item', { timeout: 30_000 });
  await page.click('.btn-toggle-bottom-panel');
  await sleep(400);
  await page.click('.btn-new-terminal');
  await page.waitForSelector('.xterm-rows', { timeout: 15_000 });
  await sleep(1800);

  // 1. OSC 52 — what Claude Code emits over SSH (and alongside pbcopy locally).
  setClip(SENTINEL);
  await typeCmd(`printf '\\033]52;c;%s\\a' "$(printf 'OSC52-E2E' | base64)"`);
  await sleep(900);
  check('OSC 52 from the pty lands on the system clipboard', pb() === 'OSC52-E2E', JSON.stringify(pb().slice(0, 60)));

  // 2. Plain drag inside a mouse-tracking TUI, then Cmd+C.
  await typeCmd(`python3 ${FAKE_TUI} --log ${LOG}`);
  const box = await findRow(MARKER);
  check('stand-in TUI enabled mouse tracking', (await state()).mouseEventsOn);

  setClip(SENTINEL);
  await dragRow(box, box.x + 3, box.x + box.w * 0.5);
  check('plain drag is consumed by the TUI (no xterm selection)', (await state()).selRects === 0);
  await page.screenshot({ path: path.join(SHOTS, `${LABEL}-tui-drag.png`) });
  await page.keyboard.press('Meta+c');
  await sleep(700);
  check('Cmd+C after a TUI drag copies the dragged cells', pb() === MARKER, JSON.stringify(pb().slice(0, 60)));

  // 3. Drag that leaves the terminal: the TUI must get the release at the last
  //    in-bounds cell, not clamped to the edge (col 1 here).
  fs.writeFileSync(LOG, '');
  const y = box.y + box.h / 2;
  await page.mouse.move(box.x + 3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.4, y, { steps: 8 });
  await page.mouse.move(box.x - 220, y, { steps: 8 });   // out to the left, over the sidebar
  await page.mouse.up();
  await sleep(500);
  const reports = parseLog();
  const rel = reports.filter(r => r.release).at(-1);
  const lastMotion = reports.filter(r => !r.release).at(-1);
  check('release outside the terminal is reported at the last in-bounds cell',
    !!rel && !!lastMotion && rel.col > 1 && rel.col === lastMotion.col,
    JSON.stringify({ release: rel, lastMotion, reports: reports.length }));

  await page.keyboard.type('q');
  await sleep(600);

  // 4. The "Mouse" toolbar toggle: reporting off = plain terminal behaviour.
  const toggle = await page.$('.btn-mouse-toggle');
  check('mouse reporting toggle is in the terminal toolbar', !!toggle);
  if (toggle) {
    await toggle.click();
    await sleep(200);
    const label = await page.$eval('.btn-mouse-toggle', b => b.textContent.trim());
    check('toggle shows reporting is off', /off/i.test(label), label);

    await focusTerminal();
    await typeCmd(`python3 ${FAKE_TUI}`);
    const box2 = await findRow(MARKER);
    check('with reporting off the TUI mouse request is swallowed', !(await state()).mouseEventsOn);

    setClip(SENTINEL);
    await dragRow(box2, box2.x + 3, box2.x + box2.w * 0.5);
    check('plain drag now creates an xterm selection', (await state()).selRects > 0);
    await page.screenshot({ path: path.join(SHOTS, `${LABEL}-mouse-off-drag.png`) });
    await page.keyboard.press('Meta+c');
    await sleep(700);
    check('Cmd+C copies the xterm selection', pb().includes(MARKER), JSON.stringify(pb().slice(0, 60)));

    await page.click('.btn-mouse-toggle');
    await sleep(500);
    check('turning reporting back on re-arms the TUI mouse tracking', (await state()).mouseEventsOn);

    await focusTerminal();
    await page.keyboard.type('q');
    await sleep(300);
  }
} catch (e) {
  check('test ran to completion', false, e.message);
  try { await page.screenshot({ path: path.join(SHOTS, `${LABEL}-error.png`) }); } catch { /* window may be gone */ }
} finally {
  // Never leave the dev profile with reporting switched off.
  await page.evaluate((k) => localStorage.removeItem(k), MOUSE_FLAG_KEY).catch(() => {});
  await app.close().catch(() => {});
  try { setClip(savedClipboard); } catch { /* clipboard restore is best effort */ }
  try { fs.unlinkSync(LOG); } catch { /* may not exist */ }
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${LABEL}: ${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
