const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stark', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
  openInExplorer: (dirPath) => ipcRenderer.invoke('open-in-explorer', dirPath),
  previewFolder: (dirPath) => ipcRenderer.invoke('preview-folder', dirPath),
  thumbnail: (filePath) => ipcRenderer.invoke('thumbnail', filePath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  measure: (payload) => ipcRenderer.send('measure-start', payload),
  onMeasure: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('measure-progress', listener);
    return () => ipcRenderer.removeListener('measure-progress', listener);
  },
});
