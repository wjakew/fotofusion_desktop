const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let presetManagerWindow = null;

// Preset storage path
const userDataPath = app.getPath('userData');
const presetsPath = path.join(userDataPath, 'presets.json');

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

function createPresetManagerWindow() {
  if (presetManagerWindow) {
    presetManagerWindow.focus();
    return;
  }

  presetManagerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  presetManagerWindow.loadFile(path.join(__dirname, 'preset-manager.html'));

  presetManagerWindow.once('ready-to-show', () => {
    presetManagerWindow.show();
  });

  presetManagerWindow.on('closed', () => {
    presetManagerWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  // Perform any cleanup if needed
  if (mainWindow) {
    mainWindow.destroy();
  }
  if (presetManagerWindow) {
    presetManagerWindow.destroy();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Preset storage functions
async function loadPresets() {
  try {
    const data = await fs.readFile(presetsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist or is corrupted, return empty array
    return [];
  }
}

async function savePresets(presets) {
  try {
    await fs.writeFile(presetsPath, JSON.stringify(presets, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving presets:', error);
    return false;
  }
}

// IPC handlers
ipcMain.handle('select-folder', async (event, type) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: type === 'source' ? 'Select Source Folder' : 'Select Destination Folder'
  });
  
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-preset-to-storage', async (event, preset) => {
  try {
    const presets = await loadPresets();
    
    // Add unique ID and timestamp
    preset.id = Date.now().toString();
    preset.createdAt = new Date().toISOString();
    preset.lastUsed = new Date().toISOString();
    
    // Check for duplicate names
    const existingIndex = presets.findIndex(p => p.name === preset.name);
    if (existingIndex >= 0) {
      // Update existing preset
      preset.id = presets[existingIndex].id;
      preset.createdAt = presets[existingIndex].createdAt;
      presets[existingIndex] = preset;
    } else {
      // Add new preset
      presets.push(preset);
    }
    
    const success = await savePresets(presets);
    return success ? preset : null;
  } catch (error) {
    console.error('Error saving preset to storage:', error);
    return null;
  }
});

ipcMain.handle('load-presets', async () => {
  return await loadPresets();
});

ipcMain.handle('delete-preset', async (event, presetId) => {
  try {
    const presets = await loadPresets();
    const filteredPresets = presets.filter(p => p.id !== presetId);
    return await savePresets(filteredPresets);
  } catch (error) {
    console.error('Error deleting preset:', error);
    return false;
  }
});

ipcMain.handle('update-preset-last-used', async (event, presetId) => {
  try {
    const presets = await loadPresets();
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      preset.lastUsed = new Date().toISOString();
      await savePresets(presets);
    }
    return true;
  } catch (error) {
    console.error('Error updating preset last used:', error);
    return false;
  }
});

ipcMain.handle('export-presets', async (event, presetIds) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'fotofusion-presets.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    
    if (!result.canceled) {
      const allPresets = await loadPresets();
      const presetsToExport = allPresets.filter(p => presetIds.includes(p.id));
      
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        presets: presetsToExport
      };
      
      await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2));
      return result.filePath;
    }
    return null;
  } catch (error) {
    console.error('Error exporting presets:', error);
    return null;
  }
});

ipcMain.handle('import-presets', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    
    if (!result.canceled) {
      const data = await fs.readFile(result.filePaths[0], 'utf8');
      const importData = JSON.parse(data);
      
      if (!importData.presets || !Array.isArray(importData.presets)) {
        throw new Error('Invalid preset file format');
      }
      
      const existingPresets = await loadPresets();
      let importedCount = 0;
      let skippedCount = 0;
      
      for (const preset of importData.presets) {
        // Check if preset with same name already exists
        const existingIndex = existingPresets.findIndex(p => p.name === preset.name);
        
        if (existingIndex >= 0) {
          skippedCount++;
        } else {
          // Generate new ID for imported preset
          preset.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          preset.importedAt = new Date().toISOString();
          existingPresets.push(preset);
          importedCount++;
        }
      }
      
      await savePresets(existingPresets);
      
      return {
        success: true,
        imported: importedCount,
        skipped: skippedCount,
        total: importData.presets.length
      };
    }
    return null;
  } catch (error) {
    console.error('Error importing presets:', error);
    return { success: false, error: error.message };
  }
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

ipcMain.handle('open-preset-manager', () => {
  createPresetManagerWindow();
});

// Window controls
ipcMain.on('window-minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.on('window-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window.close();
});