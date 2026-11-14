const { app, BrowserWindow, ipcMain, shell, Menu, protocol, net, nativeImage, clipboard } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { measureFolders } = require('./folder-size');
const preview = require('./preview');
const media = require('./media');
const { allow, isAllowed } = require('./access');
const { readVolumes } = require('./volumes');
const { startTransfer, cancelTransfer } = require('./transfer');
const { searchTree } = require('./search');
const { runShell, stopShell } = require('./shell');

const jobs = { inside: 0, rail: 0 };
const ROOT = path.join(__dirname, '..');
const OUT_DIR = app.isPackaged ? path.join(process.resourcesPath, 'out') : path.join(ROOT, 'out');
const ICON = path.join(ROOT, 'build', 'icon.png');
const LOCK_PROBE_LIMIT = 600;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'stark-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

let mainWindow = null;
let lastVolumes = [];

async function volumes() {
  lastVolumes = await readVolumes();
  return lastVolumes;
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
  if (typeof input !== 'string' || !path.isAbsolute(input)) return null;
  return path.resolve(input);
}

function explain(error) {
  if (!error || error.code === 'ENOENT') return 'That folder no longer exists.';
  if (error.code === 'EPERM' || error.code === 'EACCES') return 'This folder is locked.';
  if (['ENOTCONN', 'EHOSTDOWN', 'ENETUNREACH', 'EIO', 'UNKNOWN'].includes(error.code)) return 'That volume is disconnected.';
  return 'This folder could not be opened.';
}

/** A file is "locked" when another process holds it or we lack permission to read it. */
async function probeLocked(file) {
  let handle;
  try {
    handle = await fs.open(file, 'r');
    return false;
  } catch (error) {
    return Boolean(error && ['EBUSY', 'EPERM', 'EACCES'].includes(error.code));
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function listDirectory(dirPath) {
  const resolved = assertAbsolute(dirPath);
  if (!resolved) return { ok: false, message: 'Choose a folder path.' };

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) return { ok: false, message: 'That path is not a folder.' };

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const folders = [];
    const fileNames = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(resolved, entry.name);
      if (entry.isDirectory()) folders.push({ name: entry.name, path: full });
      else if (entry.isFile()) fileNames.push({ name: entry.name, path: full });
    }

    const files = [];
    for (let index = 0; index < fileNames.length; index += 64) {
      const slice = fileNames.slice(index, index + 64);
      const infos = await Promise.all(
        slice.map(async (f) => {
          try {
            const s = await fs.stat(f.path);
            const { kind, ext } = preview.classify(f.name);
            return {
              ...f,
              size: s.size,
              modified: s.mtimeMs,
              kind,
              ext,
              readonly: (s.mode & 0o200) === 0,
              locked: false,
            };
          } catch (error) {
            const { kind, ext } = preview.classify(f.name);
            return { ...f, size: null, modified: 0, kind, ext, readonly: false, locked: true };
          }
        })
      );
      files.push(...infos);
    }

    for (const f of folders) allow(f.path);
    for (const f of files) allow(f.path);

    const parent = path.dirname(resolved);
    return {
      ok: true,
      path: resolved,
      name: path.basename(resolved) || resolved,
      parent: parent !== resolved ? parent : null,
      ancestry: ancestry(resolved),
      folders,
      files,
      fileCount: files.length,
      directFileBytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
    };
  } catch (error) {
    console.error('list-directory', error.code || error);
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
  protocol.handle('stark-file', media.handleFileRequest);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#050607',
    title: 'Super Hero File Manager',
    icon: fsSync.existsSync(ICON) ? nativeImage.createFromPath(ICON) : undefined,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#050607', symbolColor: '#8b959c', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      plugins: true,
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
    if (level >= 2 && !/THREE\.Clock/.test(message)) console.error(`[renderer] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(page.split('#')[0].replace(/index\.html$/, ''))) event.preventDefault();
  });

  mainWindow.loadURL(page).catch((error) => {
    console.error('loadURL', page, error);
  });
}

app.setName('Super Hero File Manager');
app.setAppUserModelId('com.superhero.filemanager');
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

function known(name, fallback) {
  try {
    return app.getPath(name);
  } catch {
    return fallback;
  }
}

ipcMain.handle('bootstrap', () => {
  const home = os.homedir();
  const desktop = known('desktop', path.join(home, 'Desktop'));
  const common = [
    { name: 'Desktop', path: desktop },
    { name: 'Documents', path: known('documents', path.join(home, 'Documents')) },
    { name: 'Downloads', path: known('downloads', path.join(home, 'Downloads')) },
    { name: 'Pictures', path: known('pictures', path.join(home, 'Pictures')) },
    { name: 'Videos', path: known('videos', path.join(home, 'Videos')) },
    { name: 'Music', path: known('music', path.join(home, 'Music')) },
  ].filter((c) => fsSync.existsSync(c.path));
  return { home, desktop, common, drives: [] };
});

/** Lock checks run after a listing is on screen so opening a folder never waits on them. */
ipcMain.handle('probe-locks', async (_event, paths) => {
  if (!Array.isArray(paths)) return [];
  const list = paths.filter(isAllowed).slice(0, LOCK_PROBE_LIMIT);
  const locked = [];
  for (let i = 0; i < list.length; i += 32) {
    const slice = list.slice(i, i + 32);
    const flags = await Promise.all(slice.map(probeLocked));
    flags.forEach((flag, j) => flag && locked.push(slice[j]));
  }
  return locked;
});

/** Pinned items: confirm they still exist and make them readable by the stage. */
ipcMain.handle('stat-paths', async (_event, paths) => {
  if (!Array.isArray(paths)) return [];
  return Promise.all(
    paths.slice(0, 200).map(async (p) => {
      const resolved = assertAbsolute(p);
      if (!resolved) return { path: p, exists: false };
      try {
        const s = await fs.stat(resolved);
        allow(resolved);
        const { kind, ext } = preview.classify(path.basename(resolved));
        return {
          path: resolved,
          exists: true,
          type: s.isDirectory() ? 'dir' : 'file',
          name: path.basename(resolved) || resolved,
          size: s.isDirectory() ? null : s.size,
          modified: s.mtimeMs,
          kind,
          ext,
        };
      } catch (error) {
        return { path: resolved, exists: false, locked: Boolean(error && ['EPERM', 'EACCES'].includes(error.code)) };
      }
    })
  );
});

let searchJob = 0;
ipcMain.handle('search', (event, payload) => {
  const id = ++searchJob;
  const root = assertAbsolute(payload?.root);
  const query = String(payload?.query || '').trim();
  if (!root || query.length < 2) return { ok: false };
  const sender = event.sender;
  const isActive = () => id === searchJob && !sender.isDestroyed();
  searchTree(root, query, isActive, (batch, done, scanned) => {
    for (const item of batch) allow(item.path);
    if (isActive()) sender.send('search-results', { id, batch, done, scanned });
  });
  return { ok: true, id };
});
ipcMain.handle('search-cancel', () => {
  searchJob += 1;
  return true;
});

ipcMain.handle('shell-run', (event, payload) => {
  const sender = event.sender;
  return runShell({
    id: payload?.id,
    command: payload?.command,
    cwd: payload?.cwd,
    onEvent: (message) => {
      if (!sender.isDestroyed()) sender.send('shell-output', message);
    },
  });
});
ipcMain.handle('shell-cancel', () => {
  stopShell();
  return true;
});

ipcMain.handle('show-in-folder', (_event, target) => {
  if (!isAllowed(target)) return { ok: false, message: 'That item is not available.' };
  shell.showItemInFolder(target);
  return { ok: true };
});

ipcMain.handle('copy-text', (_event, text) => {
  clipboard.writeText(String(text || '').slice(0, 4096));
  return { ok: true };
});

const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]|^\.+$|[ .]$/;
ipcMain.handle('rename', async (_event, target, newName) => {
  if (!isAllowed(target)) return { ok: false, message: 'That item is not available.' };
  const name = String(newName || '').trim();
  if (!name || name.length > 240 || BAD_NAME.test(name)) return { ok: false, message: 'That name is not allowed.' };
  const source = path.resolve(target);
  const destination = path.join(path.dirname(source), name);
  if (destination === source) return { ok: true, path: destination };
  // A case-only rename targets the same file on Windows, so only check for clashes otherwise.
  const caseOnly = destination.toLowerCase() === source.toLowerCase();
  try {
    if (!caseOnly && fsSync.existsSync(destination)) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    await fs.rename(source, destination);
    allow(destination);
    return { ok: true, path: destination };
  } catch (error) {
    if (error.code === 'EEXIST') return { ok: false, message: 'Something with that name already exists.' };
    if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) return { ok: false, message: 'It is locked or in use.' };
    return { ok: false, message: 'Rename failed.' };
  }
});

ipcMain.handle('trash', async (_event, target) => {
  if (!isAllowed(target)) return { ok: false, message: 'That item is not available.' };
  try {
    await shell.trashItem(target);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not move it to the Recycle Bin (it may be locked).' };
  }
});
ipcMain.handle('volumes', () => volumes());
ipcMain.handle('list-directory', (_event, dirPath) => listDirectory(dirPath));
ipcMain.handle('preview-folder', (_event, dirPath) => preview.previewFolder(dirPath));
ipcMain.handle('thumbnail', (_event, filePath, size) => preview.thumbnail(filePath, size));
ipcMain.handle('read-text', (_event, filePath) => media.readText(filePath));
ipcMain.handle('subtitles', (_event, filePath) => media.subtitlesFor(filePath));

ipcMain.handle('open-file', async (_event, filePath) => {
  if (!isAllowed(filePath)) return { ok: false, message: 'That file is not available.' };
  const error = await shell.openPath(filePath);
  return error ? { ok: false, message: 'No app could open that file.' } : { ok: true };
});

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

ipcMain.handle('transfer-start', async (event, payload) => {
  const sources = Array.isArray(payload?.sources) ? payload.sources.filter(isAllowed).map((p) => path.resolve(p)) : [];
  if (!sources.length) return { ok: false, message: 'Nothing to transfer.' };

  if (!lastVolumes.length) await volumes();
  const volume = lastVolumes.find((v) => v.id === payload?.volumeId);
  if (!volume) return { ok: false, message: 'That volume is not available.' };
  if (!volume.connected) return { ok: false, message: 'That volume is disconnected.' };

  const sender = event.sender;
  return startTransfer({ sources, volume: volume.path, label: volume.label || volume.id }, (message) => {
    if (!sender.isDestroyed()) sender.send('transfer-progress', message);
  });
});
ipcMain.handle('transfer-cancel', () => cancelTransfer());

ipcMain.on('measure-start', (event, payload) => {
  const kind = payload && payload.kind;
  const token = payload && payload.token;
  const folders = payload && payload.folders;

  if ((kind !== 'inside' && kind !== 'rail') || typeof token !== 'number' || !Array.isArray(folders)) return;

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
