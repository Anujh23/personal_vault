const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable live reload for development
if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'dashboard.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.platform === 'darwin') app.dock.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Record',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-new-record')
        },
        {
          label: 'Import Data',
          accelerator: 'CmdOrCtrl+I',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled && result.filePaths.length > 0) {
              try {
                const data = fs.readFileSync(result.filePaths[0], 'utf8');
                mainWindow.webContents.send('import-data', data);
              } catch (error) {
                console.error('Error reading file:', error);
              }
            }
          }
        },
        {
          label: 'Export Data',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu-export-data')
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Data',
      submenu: [
        { label: 'Personal Info', click: () => mainWindow.webContents.send('menu-show-section', 'personal_info') },
        { label: 'Family Members', click: () => mainWindow.webContents.send('menu-show-section', 'family_members') },
        { label: 'Properties',     click: () => mainWindow.webContents.send('menu-show-section', 'properties') },
        { label: 'Assets',         click: () => mainWindow.webContents.send('menu-show-section', 'assets') },
        { label: 'Banking',        click: () => mainWindow.webContents.send('menu-show-section', 'banking_details') },
        { label: 'Investments',    click: () => mainWindow.webContents.send('menu-show-section', 'stocks') }
      ]
    },
    { label: 'Window', submenu: [ { role: 'minimize' }, { role: 'close' } ] },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Personal Dashboard',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Personal Dashboard',
              message: 'Personal Dashboard v1.0.0',
              detail: 'A comprehensive personal data management application.'
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Handlers ----------

// 1. Existing: export JSON with Save dialog
ipcMain.handle('save-file', async (event, data, fileName) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (!result.canceled) {
      fs.writeFileSync(result.filePath, data);
      return { success: true, filePath: result.filePath };
    }
    return { success: false };
  } catch (error) {
    console.error('Error saving file:', error);
    return { success: false, error: error.message };
  }
});

// 2. NEW: save ANY uploaded file (PDF, Word, Excel, etc.) silently to app data
ipcMain.handle('save-uploaded-file', async (event, { base64Data, fileName }) => {
  try {
    const uploadsDir = path.join(app.getPath('userData'), 'uploaded_files');
    await fs.promises.mkdir(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}_${path.basename(fileName).replace(/[^\w.-]/g, '_')}`;
    const fullPath = path.join(uploadsDir, safeName);

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.promises.writeFile(fullPath, buffer);

    return { success: true, filePath: fullPath, size: buffer.length };
  } catch (error) {
    console.error('Error saving uploaded file:', error);
    return { success: false, error: error.message };
  }
});

// 3. NEW: read back an uploaded file as base64 for downloading
ipcMain.handle('read-uploaded-file', async (event, filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return { success: true, base64: buffer.toString('base64'), size: buffer.length };
  } catch (error) {
    console.error('Error reading uploaded file:', error);
    return { success: false, error: error.message };
  }
});

// 4. Existing: image save & read
ipcMain.handle('save-image', async (event, imageData, fileName) => {
  try {
    const imagesDir = path.join(app.getPath('userData'), 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const uniqueFileName = `${Date.now()}_${fileName}`;
    const filePath = path.join(imagesDir, uniqueFileName);

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    return { success: true, filePath, fileName: uniqueFileName };
  } catch (error) {
    console.error('Error saving image:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-image', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const mimeType = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return { success: true, data: `data:${mimeType};base64,${base64}` };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    console.error('Error reading image:', error);
    return { success: false, error: error.message };
  }
});

// ---------- App lifecycle ----------

app.whenReady().then(createWindow);

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event) => event.preventDefault());
});

app.setAsDefaultProtocolClient('personal-dashboard');
