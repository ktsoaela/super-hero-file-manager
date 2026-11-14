const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (handler) => {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('stark', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  volumes: () => ipcRenderer.invoke('volumes'),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
  openInExplorer: (dirPath) => ipcRenderer.invoke('open-in-explorer', dirPath),
  previewFolder: (dirPath) => ipcRenderer.invoke('preview-folder', dirPath),
  thumbnail: (filePath, size) => ipcRenderer.invoke('thumbnail', filePath, size),
  readText: (filePath) => ipcRenderer.invoke('read-text', filePath),
  subtitles: (filePath) => ipcRenderer.invoke('subtitles', filePath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  fileUrl: (filePath) => `stark-file://f/${encodeURIComponent(filePath)}`,
  startTransfer: (payload) => ipcRenderer.invoke('transfer-start', payload),
  cancelTransfer: () => ipcRenderer.invoke('transfer-cancel'),
  onTransfer: subscribe('transfer-progress'),
  probeLocks: (paths) => ipcRenderer.invoke('probe-locks', paths),
  statPaths: (paths) => ipcRenderer.invoke('stat-paths', paths),
  search: (root, query) => ipcRenderer.invoke('search', { root, query }),
  cancelSearch: () => ipcRenderer.invoke('search-cancel'),
  onSearch: subscribe('search-results'),
  shellRun: (payload) => ipcRenderer.invoke('shell-run', payload),
  shellCancel: () => ipcRenderer.invoke('shell-cancel'),
  onShell: subscribe('shell-output'),
  showInFolder: (target) => ipcRenderer.invoke('show-in-folder', target),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  rename: (target, name) => ipcRenderer.invoke('rename', target, name),
  trash: (target) => ipcRenderer.invoke('trash', target),
  measure: (payload) => ipcRenderer.send('measure-start', payload),
  onMeasure: subscribe('measure-progress'),
});
