'use strict';

const state = {
  home: '',
  desktopPath: '',
  drives: [],
  currentPath: '',
  currentName: '',
  parent: null,
  ancestry: [],
  folders: [],
  fileCount: 0,
  directFileBytes: 0,
  desktopFolders: [],
  tokens: { inside: 0, desktop: 0 },
  insideDone: true,
  desktopDone: true,
  reading: false,
  banner: '',
};

let navSeq = 0;
let desktopLoaded = false;
const pendingRenders = new Set();
let paintQueued = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (value) => {
    const trimmed = value.replace(/[\\/]+$/g, '');
    return (trimmed || value).toLowerCase();
  };
  return norm(a) === norm(b);
}

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const digits = value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function compareFolders(a, b) {
  const rank = (folder) => {
    if (folder.error) return 2;
    if (folder.bytes == null) return 1;
    return 0;
  };
  const byState = rank(a) - rank(b);
  if (byState !== 0) return byState;
  if (a.bytes != null && b.bytes != null && a.bytes !== b.bytes) return b.bytes - a.bytes;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

function sortFolders(list) {
  list.sort(compareFolders);
}

function knownTotal(folders) {
  return folders.reduce((sum, folder) => sum + (folder.error || folder.bytes == null ? 0 : folder.bytes), 0);
}

function maxBytes(folders) {
  return folders.reduce((max, folder) => Math.max(max, folder.error || folder.bytes == null ? 0 : folder.bytes), 0);
}

function queueRender(kind) {
  pendingRenders.add(kind);
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    const kinds = new Set(pendingRenders);
    pendingRenders.clear();
    if (kinds.has('directory')) renderDirectory();
    if (kinds.has('inside')) renderInside();
    if (kinds.has('desktop')) renderDesktop();
    if (kinds.has('chrome')) renderChrome();
  });
}

function renderChrome() {
  const crumb = document.getElementById('crumb');
  crumb.replaceChildren();
  state.ancestry.forEach((part, index) => {
    if (index > 0) crumb.append(el('span', 'sep', '›'));
    const button = el('button', 'crumb', part.name);
    button.type = 'button';
    button.title = part.path;
    button.addEventListener('click', () => openDirectory(part.path));
    crumb.append(button);
  });

  document.getElementById('up').disabled = !state.parent;
  document.title = state.currentName ? `${state.currentName} — Stark` : 'Stark File Manager';

  const status = document.getElementById('status');
  if (state.reading) status.textContent = 'Reading folder…';
  else if (!state.insideDone || !state.desktopDone) status.textContent = 'Measuring sizes…';
  else status.textContent = '';

  const banner = document.getElementById('banner');
  banner.hidden = !state.banner;
  banner.textContent = state.banner || '';
}

function renderDirectory() {
  const root = document.getElementById('directory');
  const count = state.folders.length === 1 ? '1 folder' : `${state.folders.length} folders`;
  const files = state.fileCount ? ` · ${state.fileCount} file${state.fileCount === 1 ? '' : 's'}` : '';
  document.getElementById('dir-meta').textContent = state.currentName
    ? `${state.currentName} · ${count}${files}`
    : 'col-4';

  root.replaceChildren();

  if (!state.currentPath && !state.drives.length) {
    root.append(el('p', 'pending-copy', 'Reading this computer…'));
    return;
  }

  root.append(dirCell('Home', 'Place', state.home));
  root.append(dirCell('Desktop', 'Place', state.desktopPath));
  state.drives.forEach((drive) => root.append(dirCell(drive, 'Volume', drive)));
  if (state.parent) root.append(dirCell('Up', 'Parent', state.parent));

  const folders = state.folders
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

  if (!folders.length) {
    root.append(el('p', 'empty-copy', 'No folders in this directory.'));
    return;
  }

  folders.forEach((folder) => root.append(dirCell(folder.name, 'Folder', folder.path)));
}

function dirCell(label, kind, dirPath) {
  const button = el('button', 'dir-cell');
  button.type = 'button';
  button.title = dirPath || label;
  button.disabled = !dirPath;
  if (samePath(dirPath, state.currentPath)) button.classList.add('is-current');
  button.append(el('span', 'dir-kind', kind), el('span', 'dir-name', label));
  button.addEventListener('click', () => openDirectory(dirPath));
  return button;
}

function renderInside() {
  const total = knownTotal(state.folders);
  const count = state.folders.length === 1 ? '1 folder' : `${state.folders.length} folders`;
  const size = state.folders.length && (state.insideDone || total > 0) ? ` · ${formatBytes(total)}${state.insideDone ? '' : '…'}` : '';
  document.getElementById('inside-meta').textContent = `largest to smallest · ${count}${size}`;

  const message = state.fileCount
    ? `No folders in this directory. ${state.fileCount} file${state.fileCount === 1 ? '' : 's'} sit here (${formatBytes(state.directFileBytes)}).`
    : 'No folders in this directory.';

  renderFolderGrid(document.getElementById('inside'), state.folders, message);
}

function renderDesktop() {
  if (!desktopLoaded) {
    document.getElementById('desktop-meta').textContent = 'Reading desktop…';
    const container = document.getElementById('desktop');
    container.dataset.signature = '';
    container.replaceChildren(el('p', 'empty-copy', 'Reading desktop…'));
    return;
  }

  const where = state.desktopPath || 'Desktop';
  const count = state.desktopFolders.length === 1 ? '1 folder' : `${state.desktopFolders.length} folders`;
  const here = samePath(state.currentPath, state.desktopPath) ? ' · current location' : '';
  document.getElementById('desktop-meta').textContent = `${count}${here}`;
  renderFolderGrid(document.getElementById('desktop'), state.desktopFolders, 'No folders on the desktop.');
}

function renderFolderGrid(container, folders, emptyMessage) {
  if (!folders.length) {
    container.dataset.signature = '';
    container.replaceChildren(el('p', 'empty-copy', emptyMessage));
    return;
  }

  const signature = folders.map((folder) => folder.path).join('\n');
  if (container.dataset.signature === signature) {
    folders.forEach((folder, index) => {
      const card = container.querySelector(`[data-path="${CSS.escape(folder.path)}"]`);
      if (card) paintCard(card, folder, folders, index);
    });
    return;
  }

  const scroll = container.scrollTop;
  container.dataset.signature = signature;
  container.replaceChildren();
  folders.forEach((folder, index) => {
    container.append(createCard(folder, folders, index));
  });
  container.scrollTop = scroll;
}

function createCard(folder, folders, index) {
  const card = el('article', 'folder-card');
  card.dataset.path = folder.path;

  const open = el('button', 'open-folder');
  open.type = 'button';
  open.title = folder.path;
  open.append(
    el('span', 'card-top'),
    el('span', 'card-name', folder.name),
    el('span', 'card-metrics'),
    el('span', 'bar')
  );
  open.addEventListener('click', () => openDirectory(folder.path));

  const reveal = el('button', 'reveal', 'Explorer');
  reveal.type = 'button';
  reveal.title = `Show ${folder.name} in Explorer`;
  reveal.addEventListener('click', async (event) => {
    event.stopPropagation();
    const result = await window.stark.openInExplorer(folder.path);
    if (!result.ok) {
      state.banner = result.message;
      renderChrome();
    }
  });

  card.append(open, reveal);
  paintCard(card, folder, folders, index);
  return card;
}

function paintCard(card, folder, folders, index) {
  const open = card.querySelector('.open-folder');
  const top = open.querySelector('.card-top');
  const metrics = open.querySelector('.card-metrics');
  const bar = open.querySelector('.bar');

  top.replaceChildren(el('span', 'rank', folder.bytes == null || folder.error ? '–' : String(index + 1).padStart(2, '0')));
  if (samePath(folder.path, state.currentPath)) top.append(el('span', 'here', 'Current'));

  let sizeText = 'Measuring…';
  if (folder.error) sizeText = 'Unavailable';
  else if (folder.bytes != null) sizeText = formatBytes(folder.bytes);

  const total = knownTotal(folders);
  const share = folder.bytes == null || folder.error || !total ? '—' : `${Math.round((folder.bytes / total) * 100)}%`;
  metrics.replaceChildren(el('span', 'card-size', sizeText), el('span', 'card-share', share));

  const pending = folder.bytes == null && !folder.error;
  bar.classList.toggle('is-pending', pending);
  bar.replaceChildren();
  const fill = el('span', 'bar-fill');
  if (!pending) {
    const max = maxBytes(folders);
    fill.style.width = max && folder.bytes ? `${(folder.bytes / max) * 100}%` : '0%';
  }
  bar.append(fill);

  card.classList.toggle('is-largest', index === 0 && folder.bytes > 0 && !folder.error);
  card.classList.toggle('is-here', samePath(folder.path, state.currentPath));
}

function startMeasure(kind, folders) {
  const token = ++state.tokens[kind];
  const doneKey = kind === 'inside' ? 'insideDone' : 'desktopDone';

  if (!folders.length) {
    state[doneKey] = true;
    renderChrome();
    return;
  }

  state[doneKey] = false;
  window.stark.measure({
    token,
    kind,
    folders: folders.map((folder) => ({ name: folder.name, path: folder.path })),
  });
  renderChrome();
}

async function openDirectory(dirPath, options = {}) {
  if (!dirPath) return false;
  if (!options.force && samePath(dirPath, state.currentPath) && state.currentPath) return true;

  const seq = ++navSeq;
  state.reading = true;
  state.banner = '';
  renderChrome();

  const result = await window.stark.listDirectory(dirPath);
  if (seq !== navSeq) return false;

  state.reading = false;

  if (!result.ok) {
    state.banner = result.message;
    renderChrome();
    return false;
  }

  state.currentPath = result.path;
  state.currentName = result.name;
  state.parent = result.parent;
  state.ancestry = result.ancestry;
  state.fileCount = result.fileCount;
  state.directFileBytes = result.directFileBytes;
  state.folders = result.folders.map((folder) => ({
    name: folder.name,
    path: folder.path,
    bytes: null,
    error: false,
  }));
  state.banner = '';

  queueRender('chrome');
  queueRender('directory');
  queueRender('inside');
  queueRender('desktop');
  startMeasure('inside', state.folders);
  return true;
}

async function loadDesktop() {
  if (!state.desktopPath) {
    state.desktopFolders = [];
    state.desktopDone = true;
    desktopLoaded = true;
    renderDesktop();
    return;
  }

  const result = await window.stark.listDirectory(state.desktopPath);
  if (!result.ok) {
    state.desktopFolders = [];
    state.desktopDone = true;
    desktopLoaded = true;
    state.banner = state.banner || `Desktop: ${result.message}`;
    renderDesktop();
    renderChrome();
    return;
  }

  state.desktopPath = result.path;
  desktopLoaded = true;
  state.desktopFolders = result.folders.map((folder) => ({
    name: folder.name,
    path: folder.path,
    bytes: null,
    error: false,
  }));
  renderDesktop();
  startMeasure('desktop', state.desktopFolders);
}

function goUp() {
  if (state.parent) openDirectory(state.parent);
}

async function refresh() {
  const current = state.currentPath;
  await loadDesktop();
  if (current) await openDirectory(current, { force: true });
}

async function init() {
  if (!window.stark) {
    const banner = document.getElementById('banner');
    banner.hidden = false;
    banner.textContent = 'Open this window with Electron.';
    return;
  }

  window.stark.onMeasure((payload) => {
    if (!payload || payload.token !== state.tokens[payload.kind]) return;
    const list = payload.kind === 'inside' ? state.folders : state.desktopFolders;
    const doneKey = payload.kind === 'inside' ? 'insideDone' : 'desktopDone';

    if (!payload.done) {
      const match = list.find((folder) => folder.path === payload.path);
      if (match) {
        match.bytes = payload.bytes;
        match.error = Boolean(payload.error);
      }
      sortFolders(list);
    } else {
      state[doneKey] = true;
    }

    queueRender(payload.kind === 'inside' ? 'inside' : 'desktop');
    if (payload.done) queueRender('chrome');
  });

  document.getElementById('up').addEventListener('click', goUp);
  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('explorer').addEventListener('click', async () => {
    if (!state.currentPath) return;
    const result = await window.stark.openInExplorer(state.currentPath);
    if (!result.ok) {
      state.banner = result.message;
      renderChrome();
    }
  });

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'Backspace' || (event.altKey && event.key === 'ArrowLeft')) {
      event.preventDefault();
      goUp();
    } else if (event.key === 'F5') {
      event.preventDefault();
      refresh();
    }
  });

  try {
    const info = await window.stark.bootstrap();
    state.home = info.home;
    state.desktopPath = info.desktop;
    state.drives = info.drives || [];

    loadDesktop();
    const opened = await openDirectory(info.home);
    if (!opened) {
      const fromDesktop = await openDirectory(info.desktop);
      if (!fromDesktop && state.drives[0]) await openDirectory(state.drives[0]);
    }
  } catch (error) {
    state.reading = false;
    state.banner = 'Could not read drives and the desktop.';
    renderChrome();
  }
}

init();
