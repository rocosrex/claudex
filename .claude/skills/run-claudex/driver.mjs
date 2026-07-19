// Playwright _electron driver for Claudex (macOS, real display — no xvfb).
//
// Two modes:
//   interactive:  node driver.mjs
//   batch:        printf 'launch\nrc 0\nmenu\n' | node driver.mjs --batch
//
// Batch mode runs commands strictly in order. Do NOT pipe into the interactive
// REPL — readline does not await async handlers, so piped lines interleave.
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/claudex-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

let app = null;
let page = null;

const need = () => { if (!page) { console.log('ERROR: launch first'); return false; } return true; };

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    if (!fs.existsSync(electronBin)) return console.log('ERROR: electron binary missing — run `npm install` in', APP_DIR);
    app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], cwd: APP_DIR, timeout: 60_000 });
    page = await app.firstWindow();
    page.on('pageerror', e => console.log('PAGEERROR:', e.message));
    page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
    // Wait for real readiness, not a blind sleep.
    try {
      await page.waitForSelector('.sidebar-project-item', { timeout: 30_000 });
      console.log('launched. sidebar ready,', (await page.$$('.sidebar-project-item')).length, 'projects.');
    } catch {
      console.log('launched, but .sidebar-project-item never appeared (empty DB? still loading?)');
    }
  },

  async ss(name) {
    if (!need()) return;
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  // --- sidebar / project rows -------------------------------------------
  async projects() {
    if (!need()) return;
    const r = await page.evaluate(() =>
      [...document.querySelectorAll('.sidebar-project-item')]
        .map((el, i) => `${i}: ${el.innerText.replace(/\s+/g, ' ').trim()}`));
    console.log(r.length ? r.join('\n') : '(no project rows)');
  },

  // Right-click project row N. Real MouseEvent — the app listens for 'contextmenu'.
  async rc(idxStr) {
    if (!need()) return;
    const idx = parseInt(idxStr || '0', 10);
    console.log('rc', idx, '→', await page.evaluate((i) => {
      document.querySelector('.sidebar-context-menu')?.remove();
      const el = document.querySelectorAll('.sidebar-project-item')[i];
      if (!el) return `NOT_FOUND (only ${document.querySelectorAll('.sidebar-project-item').length} rows)`;
      const b = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: Math.round(b.left + b.width / 2),
        clientY: Math.round(b.top + b.height / 2),
      }));
      return 'dispatched on: ' + el.innerText.replace(/\s+/g, ' ').trim();
    }, idx));
  },

  // --- context menu ------------------------------------------------------
  async menu() {
    if (!need()) return;
    const r = await page.evaluate(() => {
      const m = document.querySelector('.sidebar-context-menu');
      if (!m) return null;
      return [...m.children].map(c => c.className.includes('separator') ? '  ---' : '  • ' + c.textContent.trim()).join('\n');
    });
    console.log(r === null ? 'NO MENU OPEN' : 'MENU:\n' + r);
  },

  // Click a context-menu item by substring of its label.
  // WARNING: this really executes it. "Delete Project" really deletes.
  async mi(text) {
    if (!need()) return;
    console.log('mi', JSON.stringify(text), '→', await page.evaluate((t) => {
      const m = document.querySelector('.sidebar-context-menu');
      if (!m) return 'NO MENU OPEN';
      const el = [...m.querySelectorAll('.sidebar-context-menu-item')].find(e => e.textContent.includes(t));
      if (!el) return 'ITEM NOT FOUND';
      el.click();
      return 'clicked: ' + el.textContent.trim();
    }, text));
  },

  // --- generic -----------------------------------------------------------
  async click(sel) {
    if (!need()) return;
    console.log('click', sel, '→', await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel));
  },

  async wait(sel) {
    if (!need()) return;
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async sleep(ms) { await new Promise(r => setTimeout(r, parseInt(ms || '500', 10))); },

  // Use .toast — NOT [class*="toast"], which also matches .toast-container
  // and double-reports every message.
  async toast() {
    if (!need()) return;
    console.log(await page.evaluate(() =>
      [...document.querySelectorAll('.toast')].map(e => e.innerText.trim()).join(' | ') || '(no toast)'));
  },

  async text(sel) {
    if (!need()) return;
    console.log(await page.evaluate(s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', sel || null));
  },

  async eval(expr) {
    if (!need()) return;
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log('  window:', w.url());
  },

  async quit() { if (app) await app.close().catch(() => {}); app = null; page = null; console.log('closed'); },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

async function run(line) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const [cmd, ...rest] = t.split(/\s+/);
  const fn = COMMANDS[cmd];
  if (!fn) return console.log('unknown:', cmd, '— try: help');
  try { await fn(rest.join(' ')); } catch (e) { console.log('ERROR:', e.message); }
}

if (process.argv.includes('--batch')) {
  const input = fs.readFileSync(0, 'utf8');
  for (const line of input.split('\n')) await run(line);   // strictly sequential
  await COMMANDS.quit();
  process.exit(0);
} else {
  // Electron steals stdin; read the raw fd instead.
  const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
  const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });
  rl.on('line', async l => { await run(l); if (l.trim() === 'quit') { rl.close(); process.exit(0); } rl.prompt(); });
  rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });
  console.log('claudex driver — "help" for commands, "launch" to start');
  rl.prompt();
}
