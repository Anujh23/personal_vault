const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods so the renderer can use a safe API
contextBridge.exposeInMainWorld('electronAPI', {
  // ----- File operations -----
  // Save ANY file type (PDF, Word, Excel, images, etc.)
  // base64Data: file content converted to base64
  // fileName:   original file name
  saveFile: (base64Data, fileName) =>
    ipcRenderer.invoke('save-file', { base64Data, fileName }),

  // Existing image-specific helpers (still work for backwards-compatibility)
  saveImage: (imageData, fileName) =>
    ipcRenderer.invoke('save-image', imageData, fileName),
  readImage: (filePath) =>
    ipcRenderer.invoke('read-image', filePath),

  // ✅ NEW: read any file (PDF, Excel, Word, etc.) so we can download it
  readFile: (filePath) =>
    ipcRenderer.invoke('read-file', filePath),

  // ----- Menu event listeners -----
  onMenuNewRecord: (callback) =>
    ipcRenderer.on('menu-new-record', callback),
  onMenuExportData: (callback) =>
    ipcRenderer.on('menu-export-data', callback),
  onMenuShowSection: (callback) =>
    ipcRenderer.on('menu-show-section', callback),
  onImportData: (callback) =>
    ipcRenderer.on('import-data', callback),

  // Remove listeners
  removeAllListeners: (channel) =>
    ipcRenderer.removeAllListeners(channel),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Platform info
  platform: process.platform,

  // ----- Local storage helper -----
  store: {
    get: (key) => {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('Error getting from store:', error);
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.error('Error setting to store:', error);
        return false;
      }
    },
    delete: (key) => {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.error('Error deleting from store:', error);
        return false;
      }
    },
    clear: () => {
      try {
        localStorage.clear();
        return true;
      } catch (error) {
        console.error('Error clearing store:', error);
        return false;
      }
    }
  }
});

// Enhanced error handling
window.addEventListener('error', (event) => {
  console.error('Renderer error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
