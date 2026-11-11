#!/usr/bin/env node
// Regenerates the README screenshots in docs/images from a running local stack.
// Usage:  node scripts/readme-screenshots.mjs
// Env:    BASE_URL (default http://localhost:8080), BROWSER (path to Edge or Chrome),
//         DEMO_EMAIL, DEMO_PASSWORD (default: the local demo account from createDemoUser.ts)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const EMAIL = process.env.DEMO_EMAIL || 'demo@carbonytics.com';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo!2026Pass';
const OUT = join(process.cwd(), 'docs', 'images');
const WIDTH = 1440;
const HEIGHT = 900;

const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browserPath = candidates.find((p) => existsSync(p));
if (!browserPath) throw new Error('No Chrome or Edge found. Set BROWSER to its executable path.');

const profile = mkdtempSync(join(tmpdir(), 'carbonytics-shots-'));
const browser = spawn(browserPath, [
  '--headless=new',
  // Port 0 lets the browser pick a free port, so the script never attaches to another browser and its cookies.
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const [port, browserPath] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return { pageUrl: page.webSocketDebuggerUrl, browserUrl: `ws://127.0.0.1:${port}${browserPath}` };
    } catch {}
    await sleep(200);
  }
  throw new Error('Browser did not expose a DevTools page');
}

// browser.kill() stops only the launcher on Windows, so the whole browser is closed over CDP instead.
async function closeBrowser(url) {
  const bws = new WebSocket(url);
  await new Promise((r) => bws.addEventListener('open', r, { once: true }));
  bws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  await sleep(500);
}

const { pageUrl, browserUrl } = await connect();
const ws = new WebSocket(pageUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

async function waitFor(expression, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

// Settled means the document is loaded, no spinner or skeleton is visible, and fonts are ready.
const settled = `document.readyState === 'complete'
  && !document.querySelector('.animate-spin, .animate-pulse')
  && document.fonts.status === 'loaded'`;

async function open(path) {
  await send('Page.navigate', { url: BASE_URL + path });
  await waitFor(`location.pathname === ${JSON.stringify(path)}`);
  await waitFor(settled);
  await sleep(1200); // chart entry animations
}

async function shot(name, { fullHeight = HEIGHT } = {}) {
  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(400);
  const height = Math.min(fullHeight, await evaluate('document.documentElement.scrollHeight'));
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: WIDTH, height, scale: 1 },
  });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`wrote docs/images/${name}.png (${WIDTH}x${height})`);
}

async function click(selector, text) {
  const found = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}));
    el?.click();
    return Boolean(el);
  })()`);
  if (!found) throw new Error(`No ${selector} starting with "${text}"`);
  await waitFor(settled);
  await sleep(1500);
}

async function setTheme(theme) {
  await evaluate(`localStorage.setItem('carbonytics-theme', '${theme}')`);
}

async function signIn() {
  await open('/login');
  await evaluate(`(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [id, value] of [['email', ${JSON.stringify(EMAIL)}], ['password', ${JSON.stringify(PASSWORD)}]]) {
      const el = document.getElementById(id);
      set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(`location.pathname === '/dashboard'`);
}

try {
  mkdirSync(OUT, { recursive: true });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

  await open('/login');
  await setTheme('light');
  await open('/login');
  await shot('sign-in');

  await signIn();
  await open('/dashboard');
  await click('button', 'Year');
  await shot('dashboard');
  await shot('dashboard-full', { fullHeight: 1800 });
  await open('/calculations');
  await click('button', 'Purchased Electricity');
  await shot('calculator');
  await open('/compliance');
  await shot('compliance-reports');
  await open('/import-export');
  await shot('import-export');

  await setTheme('dark');
  await open('/dashboard');
  await click('button', 'Year');
  await shot('dashboard-dark');
} finally {
  ws.close();
  try { await closeBrowser(browserUrl); } catch {}
  browser.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
