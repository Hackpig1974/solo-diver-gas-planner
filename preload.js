const { contextBridge, ipcRenderer } = require('electron');

// Expose update system API to renderer (safe - controlled IPC)
contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSdiData: () => ipcRenderer.invoke('get-sdi-data'),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
