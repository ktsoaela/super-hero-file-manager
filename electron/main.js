const { app, BrowserWindow, ipcMain, shell, Menu, protocol, net } = require('electron');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { measureFolders } = require('./folder-size');

const jobs = { inside: 0, desktop: 0 };
const OUT_DIR = path.join(__dirname, '..', 'out');
const HIDDEN_NAMES = new Set(['system volume information', 'config.msi', 'recovery']);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow = null;

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) {
          reject(error);
          return;
        }
        resolve(stdout || '');
      }
    );
  });
}

async function readSystemRoots() {
  const home = os.homedir();
  const fallback = {
    home,
    desktop: path.join(home, 'Desktop'),
    drives: process.platform === 'win32' ? ['C:\\'] : ['/'],
  };

  if (process.platform !== 'win32') return fallback;

  try {
    const stdout = await runPowerShell(
      [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        "$desktop = [Environment]::GetFolderPath('Desktop')",
        "Write-Output ('DESKTOP=' + $desktop)",
        "Get-CimInstance Win32_LogicalDisk | ForEach-Object { Write-Output ('DRIVE=' + $_.DeviceID) }",
      ].join('; ')
    );

    let desktop = '';
    const drives = [];

    for (const line of stdout.split(/\r?\n/)) {
      if (line.startsWith('DESKTOP=')) desktop = line.slice('DESKTOP='.length).trim();
      if (line.startsWith('DRIVE=')) {
        const id = line.slice('DRIVE='.length).trim().toUpperCase();
        if (/^[A-Z]:$/.test(id)) drives.push(`${id}\\`);
      }
    }

    return {
      home,
      desktop: desktop || fallback.desktop,
      drives: drives.length ? drives : fallback.drives,
    };
  } catch (error) {
    console.error('bootstrap', error);
    return fallback;
  }
}

function ancestry(dirPath) {
  const chain = [];
  let current = path.resolve(dirPath);
  const guard = new Set();

  while (!guard.has(current.toLowerCase())) {
    guard.add(current.toLowerCase());
    const base = path.basename(current);
    chain.unshift({ name: base || current, path: current });
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return chain;
}

function assertAbsolute(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    return null;
  }
  return path.resolve(input);
}

function explain(error) {
  if (!error || error.code === 'ENOENT') return 'That folder no longer exists.';
  if (error.code === 'EPERM' || error.code === 'EACCES') return 'This folder is not accessible.';
  return 'This folder could not be opened.';
}

async function listDirectory(dirPath) {
  const resolved = assertAbsolute(dirPath);
  if (!resolved) return { ok: false, message: 'Choose a folder path.' };

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) return { ok: false, message: 'That path is not a folder.' };

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const folders = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue;
      const full = path.join(resolved, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) folders.push({ name: entry.name, path: full });
      else if (entry.isFile()) files.push(full);
    }

    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

    let directFileBytes = 0;
    for (let index = 0; index < files.length; index += 64) {
      const slice = files.slice(index, index + 64);
      const sizes = await Promise.all(
        slice.map((file) => fs.lstat(file).then((item) => (item.isFile() ? item.size : 0)).catch(() => 0))
      );
      for (const size of sizes) directFileBytes += size;
    }

    const parent = path.dirname(resolved);

    return {
      ok: true,
      path: resolved,
      name: path.basename(resolved) || resolved,
      parent: parent !== resolved ? parent : null,
      ancestry: ancestry(resolved),
      folders,
      fileCount: files.length,
      directFileBytes,
    };
  } catch (error) {
    console.error('list-directory', error);
    return { ok: false, message: explain(error) };
  }
}

function serveExport() {
  protocol.handle('app', (request) => {
    let relative = decodeURIComponent(new URL(request.url).pathname);
    if (relative === '/' || relative === '') relative = '/index.html';
    const target = path.normalize(path.join(OUT_DIR, relative));
    if (!target.startsWith(OUT_DIR + path.sep) && target !== OUT_DIR) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#050607',
    title: 'Stark File Manager',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#050607', symbolColor: '#8b959c', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const page = process.env.STARK_RENDERER_URL || 'app://stark/index.html';

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('did-fail-load', code, description, url);
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('preload-error', preloadPath, error);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('render-process-gone', details);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('loaded', page);
  });

  mainWindow.loadURL(page).catch((error) => {
    console.error('loadURL', page, error);
  });
}

app.setName('Stark File Manager');
app.setAppUserModelId('com.stark.filemanager');
Menu.setApplicationMenu(null);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    serveExport();
    createWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

ipcMain.handle('bootstrap', () => readSystemRoots());
ipcMain.handle('list-directory', (_event, dirPath) => listDirectory(dirPath));

ipcMain.handle('open-in-explorer', async (_event, dirPath) => {
  const resolved = assertAbsolute(dirPath);
  if (!resolved) return { ok: false, message: 'Choose a folder path.' };

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) return { ok: false, message: 'That path is not a folder.' };
    const error = await shell.openPath(resolved);
    if (error) return { ok: false, message: 'Explorer could not open that folder.' };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
});

ipcMain.on('measure-start', (event, payload) => {
  const kind = payload && payload.kind;
  const token = payload && payload.token;
  const folders = payload && payload.folders;

  if ((kind !== 'inside' && kind !== 'desktop') || typeof token !== 'number' || !Array.isArray(folders)) {
    return;
  }

  const safeFolders = folders
    .filter((folder) => folder && typeof folder.path === 'string' && path.isAbsolute(folder.path))
    .slice(0, 5000)
    .map((folder) => ({ name: String(folder.name || ''), path: path.resolve(folder.path) }));

  const job = ++jobs[kind];
  const isActive = () => jobs[kind] === job && !event.sender.isDestroyed();

  const send = (message) => {
    if (!isActive()) return;
    event.sender.send('measure-progress', message);
  };

  if (!safeFolders.length) {
    send({ token, kind, done: true });
    return;
  }

  measureFolders(safeFolders, isActive, (result) => {
    send({ token, kind, path: result.path, bytes: result.bytes, error: result.error, done: false });
  })
    .then(() => send({ token, kind, done: true }))
    .catch((error) => {
      console.error('measure', error);
      send({ token, kind, done: true });
    });
});
