const { contextBridge, ipcRenderer } = require('electron');

// Expose update system API to renderer (safe - controlled IPC)
contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSdiData: () => ipcRenderer.invoke('get-sdi-data'),
  openReleaseUrl: (url) => ipcRenderer.send('open-release-url', url),
  reportContentSize: (size) => ipcRenderer.send('report-content-size', size),
  onResetRequested: (callback) => {
    ipcRenderer.removeAllListeners('reset-app');
    ipcRenderer.on('reset-app', callback);
  }
});
