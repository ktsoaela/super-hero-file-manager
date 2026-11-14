const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stark', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
  openInExplorer: (dirPath) => ipcRenderer.invoke('open-in-explorer', dirPath),
  measure: (payload) => ipcRenderer.send('measure-start', payload),
  onMeasure: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('measure-progress', listener);
    return () => ipcRenderer.removeListener('measure-progress', listener);
  },
});
