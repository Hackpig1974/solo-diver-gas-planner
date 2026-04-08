const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');

const VERSION = '1.0.0';
const APP_ICON = path.join(__dirname, 'assets', 'icons', 'app_icon.ico');

// Load SDI data tables once at startup and make them available globally
global.SDI_TABLE1 = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'sdi_table_GDT.json'), 'utf8')
);
global.SDI_TABLE3 = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'sdi_table_RNT.json'), 'utf8')
);

// GitHub configuration for update checking
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OWNER = 'Hackpig1974';
const GITHUB_REPO = 'solo-diver-gas-planner';

// Version comparison utility
function isNewerVersion(remote, local) {
  try {
    const r = remote.split('.').map(Number);
    const l = local.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((r[i] || 0) > (l[i] || 0)) return true;
      if ((r[i] || 0) < (l[i] || 0)) return false;
    }
    return false;
  } catch {
    return false;
  }
}

// Update check handler
function checkForUpdate() {
  return new Promise((resolve) => {
    const urlPath = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const url = new URL(urlPath);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'electron-app',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const tag = (data.tag_name || '').replace(/^v/, '');
          
          if (tag && isNewerVersion(tag, VERSION)) {
            resolve({ 
              hasUpdate: true, 
              version: tag,
              url: data.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
            });
          } else {
            resolve({ hasUpdate: false, version: null, url: null });
          }
        } catch {
          resolve({ hasUpdate: false, version: null, url: null });
        }
      });
    });

    req.on('error', () => resolve({ hasUpdate: false, version: null, url: null }));
    req.on('timeout', () => { 
      req.destroy(); 
      resolve({ hasUpdate: false, version: null, url: null }); 
    });
    req.end();
  });
}

function createWindow() {
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  const win = new BrowserWindow({
    width: Math.min(1600, Math.floor(width * 0.9)),
    height: Math.min(1000, Math.floor(height * 0.9)),
    minWidth: 900,
    minHeight: 800,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');
  win.webContents.on('did-finish-load', async () => {
    try {
      const contentSize = await win.webContents.executeJavaScript(`
        ({
          width: Math.ceil((document.querySelector('.container')?.getBoundingClientRect().width || document.documentElement.scrollWidth) + 40),
          height: Math.ceil(document.documentElement.scrollHeight)
        })
      `);
      const targetWidth = Math.min(width, Math.max(900, contentSize.width));
      const targetHeight = Math.min(height, Math.max(800, contentSize.height + 20));
      win.setContentSize(targetWidth, targetHeight);
      win.center();
    } catch (error) {
      win.center();
    }
  });
  win.once('ready-to-show', () => {
    win.show();
  });

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reset',
          accelerator: 'Ctrl+R',
          click: () => {
            win.webContents.executeJavaScript('reset();');
          }
        },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: async () => {
            const updateCheck = await checkForUpdate();
            
            let detail = `Version ${VERSION}\n\nDeveloped by Damon Downing, 2026\n\nCopyright © 2026 Damon Downing\nLicense: GPL-3.0`;
            
            if (updateCheck.hasUpdate) {
              detail += `\n\n🔔 New version available: v${updateCheck.version}\nClick OK to view release notes.`;
            }
            
            const result = dialog.showMessageBoxSync(win, {
              type: 'info',
              title: 'About Solo Dive Gas Planner',
              message: 'Solo Dive Gas Planner - SDI RDP',
              detail: detail,
              buttons: updateCheck.hasUpdate ? ['View Release', 'Close'] : ['Close']
            });
            
            if (updateCheck.hasUpdate && result === 0) {
              shell.openExternal(updateCheck.url);
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// IPC handlers for update system
ipcMain.handle('check-for-update', () => checkForUpdate());
ipcMain.handle('get-app-version', () => VERSION);
ipcMain.handle('get-sdi-data', () => ({
  TABLE1: global.SDI_TABLE1,
  TABLE3: global.SDI_TABLE3
}));
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
