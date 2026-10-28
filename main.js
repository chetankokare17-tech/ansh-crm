'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const settings = require('./src/settings');
const tally = require('./src/tally');
const { RetryPolicy } = require('./src/retry');
const { saveRaw } = require('./src/debug');

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=6144');

// Only one app instance at a time.
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null; let cfg; let dataDir; let lastSync = null; let companies = [];
const retry = new RetryPolicy();

function send(ch, payload) { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); }

async function refreshStatus() {
  send('status', { state: 'checking' });
  const r = await tally.checkConnection(cfg.tallyUrl, { timeoutMs: cfg.timeoutMs });
  if (r.ok) {
    retry.onSuccess(); companies = r.companies; lastSync = new Date().toISOString();
    const pick = tally.pickCompany(cfg.company, r.companies, r.current);
    send('status', { state: 'connected', companies: r.companies, company: pick.company, error: pick.error, lastSync });
  } else {
    if (r.rawBody) saveRaw(dataDir, r.rawBody);
    const p = retry.onFailure(refreshStatus);
    send('status', { state: 'offline', message: r.message, raw: r.raw, lastSync,
      retryInSec: p.retry ? p.delayMs / 1000 : 0, gaveUp: !p.retry, attempt: retry.failures });
  }
}

function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 800, title: 'Amfico MIS',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', refreshStatus);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  dataDir = app.getPath('userData'); cfg = settings.load(dataDir);
  ipcMain.handle('settings:get', () => cfg);
  ipcMain.handle('settings:save', (_e, s) => { cfg = settings.save(dataDir, s); retry.reset(); refreshStatus(); return cfg; });
  // Manual Refresh resets the retry counter.
  ipcMain.handle('tally:refresh', () => { retry.reset(); return refreshStatus(); });
  createWindow();
});
app.on('window-all-closed', () => { retry.cancel(); app.quit(); });
