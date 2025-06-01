const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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

// IPC handlers
ipcMain.handle('select-folder', async (event, type) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: type === 'source' ? 'Select Source Folder' : 'Select Destination Folder'
  });
  
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-preset', async (event, preset) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${preset.name}.json`,
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });
  
  if (!result.canceled) {
    await fs.writeFile(result.filePath, JSON.stringify(preset, null, 2));
    return result.filePath;
  }
  return null;
});

ipcMain.handle('load-preset', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });
  
  if (!result.canceled) {
    const data = await fs.readFile(result.filePaths[0], 'utf8');
    return JSON.parse(data);
  }
  return null;
});

ipcMain.handle('save-report', async (event, report, destinationPath) => {
  const reportPath = path.join(destinationPath, 'fotofusion-report.md');
  await fs.writeFile(reportPath, report);
  return reportPath;
});

// Window controls
ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow.close();
});