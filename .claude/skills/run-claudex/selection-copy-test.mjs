// Regression test for terminal selection + Cmd+C inside a mouse-tracking TUI.
//
//   node .claude/skills/run-claudex/selection-copy-test.mjs [label]
//
// Quit Claudex.app first — main.js takes no single-instance lock.
//
// Why this exists: an isolated xterm harness passed this fix twice while the
// real app still failed. Synthetic events cannot reproduce what actually
// breaks it — Cmd+C arrives as a bare `Meta` keydown *then* `c`, and only
// Playwright's real input produces trusted events with correct modifier state.
// So this drives the shipping app: real Option+drag, real mouse move, real
// Cmd+C, and it reads the real system clipboard back with pbpaste.
//
// It stands in for Claude Code with a python one-liner that does the same two
// things Claude Code does: enter the alternate buffer with any-motion mouse
// tracking (?1049h ?1000h ?1002h ?1003h ?1006h), and re-emit that mouse-mode
// block once a second the way Claude Code re-emits it on every click, resize
// and large paste.
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const BIN = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const SHOTS = process.env.SCREENSHOT_DIR || '/tmp/claudex-shots';
const LABEL = process.argv[2] || 'selection-copy';
fs.mkdirSync(SHOTS, { recursive: true });

const MARKER = 'MARKER-ALPHA-BRAVO-CHARLIE-DELTA-ECHO-FOXTROT';
const SENTINEL = 'SENTINEL-CLIPBOARD-UNTOUCHED-' + Date.now();
const TUI = `python3 -c "import sys,time;w=sys.stdout.write;w('\\x1b[?1049h\\x1b[?1000h\\x1b[?1002h\\x1b[?1003h\\x1b[?1006h');w('${MARKER}\\r\\n');sys.stdout.flush();[(w('\\x1b[?1000h\\x1b[?1002h\\x1b[?1003h\\x1b[?1006h'),sys.stdout.flush(),time.sleep(1)) for _ in range(300)]"`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${LABEL}]`, ...a);

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

if (!fs.existsSync(BIN)) {
  console.error('electron binary missing — run `npm install` in', APP_DIR);
  process.exit(2);
}

const app = await electron.launch({ executablePath: BIN, args: [APP_DIR], cwd: APP_DIR, timeout: 60_000 });
const page = await app.firstWindow();
page.on('pageerror', e => log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') log('CONSOLE ERROR:', m.text()); });

// Selection rectangles live in .xterm-selection; counting them is the only
// outside-in way to see whether the highlight is actually on screen.
const state = () => page.evaluate(() => {
  const sel = document.querySelector('.xterm-selection');
  return {
    selRects: sel ? sel.children.length : -1,
    mouseEventsOn: !!document.querySelector('.xterm.enable-mouse-events'),
    writes: window.__probe ? window.__probe.writes : [],
    errors: window.__probe ? window.__probe.errors : [],
  };
});

try {
  await page.waitForSelector('.sidebar-project-item', { timeout: 30_000 });
  await page.click('.btn-toggle-bottom-panel');
  await sleep(400);
  await page.click('.btn-new-terminal');
  await page.waitForSelector('.xterm-rows', { timeout: 15_000 });
  await sleep(1200);

  // Observe the clipboard write without stubbing the real one out.
  await page.evaluate(() => {
    window.__probe = { writes: [], errors: [] };
    const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (t) => {
      window.__probe.writes.push(String(t).slice(0, 60));
      return orig(t).catch(e => { window.__probe.errors.push(String(e)); throw e; });
    };
  });

  await page.keyboard.type(TUI);
  await page.keyboard.press('Enter');
  await sleep(2500);
  check('TUI enabled mouse tracking', (await state()).mouseEventsOn);

  const box = await page.evaluate((m) => {
    const row = [...document.querySelectorAll('.xterm-rows > div')].find(d => (d.textContent || '').includes(m));
    if (!row) return null;
    const b = row.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }, MARKER);
  if (!box) throw new Error('marker row never rendered — the TUI stand-in did not run');

  execSync('pbcopy', { input: SENTINEL });

  // Option+drag: plain drag goes to the TUI, ⌥ forces a local selection.
  const y = box.y + box.h / 2;
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await sleep(250);
  await page.screenshot({ path: path.join(SHOTS, `${LABEL}-selected.png`) });
  check('Option+drag created a selection', (await state()).selRects > 0);

  // The two things that wipe it: a button-less move under ?1003, and the
  // once-a-second mouse-mode re-arm. Wait long enough to take at least one.
  await page.mouse.move(box.x + 340, y + 2);
  await page.mouse.move(box.x + 360, y + 3);
  await sleep(1800);
  const afterRearm = await state();
  await page.screenshot({ path: path.join(SHOTS, `${LABEL}-after-rearm.png`) });
  check('highlight survives a mouse move and a mouse-mode re-arm', afterRearm.selRects > 0,
    `selRects=${afterRearm.selRects}`);

  await page.keyboard.press('Meta+c');
  await sleep(700);
  const afterCopy = await state();
  check('Cmd+C reached the clipboard API', afterCopy.writes.length > 0,
    afterCopy.errors.length ? `errors=${JSON.stringify(afterCopy.errors)}` : '');

  const copied = execSync('pbpaste').toString();
  check('system clipboard holds the selected text', copied.includes(MARKER.slice(0, 20)) && !copied.includes('SENTINEL'),
    JSON.stringify(copied.slice(0, 60)));
} catch (e) {
  check('test ran to completion', false, e.message);
  try { await page.screenshot({ path: path.join(SHOTS, `${LABEL}-error.png`) }); } catch { /* window may be gone */ }
} finally {
  await app.close().catch(() => {});
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${LABEL}: ${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
