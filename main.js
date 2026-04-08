const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const packageJson = require('./package.json');

const VERSION = packageJson.version;
const APP_ICON = path.join(__dirname, 'assets', 'icons', 'app_icon.ico');
const ENABLE_DEVTOOLS = process.env.SOLO_DIVER_DEVTOOLS === '1';

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
const RELEASE_URL_PREFIX = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

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
        Accept: 'application/vnd.github+json'
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
              url: data.html_url || `${RELEASE_URL_PREFIX}/latest`
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

function isAllowedReleaseUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' &&
      parsedUrl.hostname === 'github.com' &&
      parsedUrl.pathname.startsWith(`/${GITHUB_OWNER}/${GITHUB_REPO}/releases`);
  } catch {
    return false;
  }
}

function openReleaseUrl(url) {
  const safeUrl = isAllowedReleaseUrl(url) ? url : `${RELEASE_URL_PREFIX}/latest`;
  shell.openExternal(safeUrl);
}

function createWindow() {
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(1600, Math.floor(width * 0.9)),
    height: Math.min(1100, Math.floor(height * 0.95)),
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

  if (ENABLE_DEVTOOLS) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.center();
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
            win.webContents.send('reset-app');
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
              detail += `\n\nNew version available: v${updateCheck.version}\nClick OK to view release notes.`;
            }

            const result = dialog.showMessageBoxSync(win, {
              type: 'info',
              title: 'About Solo Dive Gas Planner',
              message: 'Solo Dive Gas Planner - SDI RDP',
              detail,
              buttons: updateCheck.hasUpdate ? ['View Release', 'Close'] : ['Close']
            });

            if (updateCheck.hasUpdate && result === 0) {
              openReleaseUrl(updateCheck.url);
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

ipcMain.on('report-content-size', (event, size) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !size) {
    return;
  }

  const { screen } = require('electron');
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const reportedWidth = Number(size.width);
  const reportedHeight = Number(size.height);

  if (!Number.isFinite(reportedWidth) || !Number.isFinite(reportedHeight)) {
    return;
  }

  const targetWidth = Math.min(screenWidth, Math.max(900, Math.ceil(reportedWidth)));
  const targetHeight = Math.min(screenHeight, Math.max(800, Math.ceil(reportedHeight)));
  win.setContentSize(targetWidth, targetHeight);
  win.center();
});

ipcMain.handle('check-for-update', () => checkForUpdate());
ipcMain.handle('get-app-version', () => VERSION);
ipcMain.handle('get-sdi-data', () => ({
  TABLE1: global.SDI_TABLE1,
  TABLE3: global.SDI_TABLE3
}));
ipcMain.on('open-release-url', (event, url) => {
  openReleaseUrl(url);
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
