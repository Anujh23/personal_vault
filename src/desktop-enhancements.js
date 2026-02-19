// Desktop Application Enhancement

class DesktopDataManager extends DataManager {
    constructor() {
        super();
        this.isElectron = typeof window !== 'undefined' && window.electronAPI;
        this.setupElectronFeatures();
    }

    setupElectronFeatures() {
        try {
            if (!this.isElectron) return;

            console.log('🖥️ Desktop mode detected, enabling advanced features...');

            // Setup menu event listeners
            window.electronAPI.onMenuNewRecord(() => {
                if (this.currentTable) {
                    this.showRecordForm();
                } else {
                    this.showSection('personal_info');
                    setTimeout(() => this.showRecordForm(), 100);
                }
            });

            window.electronAPI.onMenuExportData(() => {
                this.exportDataDesktop();
            });

            window.electronAPI.onMenuShowSection((event, section) => {
                this.showSection(section);
            });

            window.electronAPI.onImportData((event, data) => {
                this.importDataDesktop(data);
            });

            console.log('✅ Desktop features enabled');
        } catch (error) {
            console.error('❌ Desktop setup error:', error);
            console.log('📱 Falling back to web mode');
        }
    }

    // helper to convert ArrayBuffer -> base64 string
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    async saveUploadedFiles(recordId) {
        if (!this.isElectron) {
            return super.saveUploadedFiles(recordId);
        }

        const filesData = this.sampleData.files || [];

        for (const file of this.uploadedFiles) {
            try {
                let result;

                if (file.type.startsWith('image/')) {
                    // Images: keep existing image handler
                    result = await window.electronAPI.saveImage(file.dataUrl, file.name);
                } else {
                    // Other files (PDF, Word, Excel, etc.)
                    const arrayBuffer = await file.arrayBuffer();
                    const base64Data = this.arrayBufferToBase64(arrayBuffer);
                    result = await window.electronAPI.saveFile(base64Data, file.name);
                }

                if (result && result.success) {
                    const fileRecord = {
                        id: this.generateId(),
                        record_id: recordId,
                        record_type: this.currentTable,
                        file_name: file.name,
                        file_path: result.filePath, // Local file path
                        file_size: result.size || file.size,
                        mime_type: file.type,
                        upload_date: new Date().toISOString(),
                        is_local: true // Flag for local files
                    };

                    filesData.push(fileRecord);
                    console.log('💾 File saved locally:', result.filePath);
                } else {
                    console.error('❌ Failed to save file', result && result.error);
                }
            } catch (error) {
                console.error('❌ Error saving file:', error);
            }
        }

        this.sampleData.files = filesData;
        this.saveDataToLocal('files', filesData);
    }

    // Download any saved file (image or other type)
    async downloadFile(fileRecord) {
        if (!this.isElectron || !fileRecord.is_local) {
            this.showToast('File not available to download', 'info');
            return;
        }

        const res = await window.electronAPI.readFile(fileRecord.file_path);
        if (res && res.success) {
            const binary = atob(res.base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

            const blob = new Blob([bytes], { type: fileRecord.mime_type || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileRecord.file_name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } else {
            this.showToast('Unable to read file', 'error');
        }
    }

    async exportDataDesktop() {
        try {
            const data = this.currentTable ?
                this.sampleData[this.currentTable] :
                this.sampleData;

            const fileName = this.currentTable ?
                `${this.currentTable}_export_${new Date().toISOString().split('T')[0]}.json` :
                `dashboard_complete_backup_${new Date().toISOString().split('T')[0]}.json`;

            const result = await window.electronAPI.saveFile(
                JSON.stringify(data, null, 2),
                fileName
            );

            if (result.success) {
                this.showToast(`Data exported to: ${result.filePath}`, 'success');
            } else {
                this.showToast('Export cancelled', 'info');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Error exporting data', 'error');
        }
    }

    importDataDesktop(jsonData) {
        try {
            const importedData = JSON.parse(jsonData);

            if (this.currentTable && Array.isArray(importedData)) {
                this.sampleData[this.currentTable] = importedData;
                this.saveDataToLocal(this.currentTable, importedData);
                this.showToast(`Imported ${importedData.length} records`, 'success');
            } else if (typeof importedData === 'object') {
                Object.keys(importedData).forEach(tableName => {
                    if (this.tables[tableName] && Array.isArray(importedData[tableName])) {
                        this.sampleData[tableName] = importedData[tableName];
                        this.saveDataToLocal(tableName, importedData[tableName]);
                    }
                });
                this.showToast('Data imported successfully!', 'success');
            }

            this.loadTableData(this.currentTable);
            this.updateDashboardStats();
        } catch (error) {
            this.showToast('Error importing data: Invalid file format', 'error');
            console.error('Import error:', error);
        }
    }

    saveDataToLocal(key, data) {
        if (this.isElectron) {
            return window.electronAPI.store.set(`dashboard_${key}`, data);
        } else {
            localStorage.setItem(`dashboard_${key}`, JSON.stringify(data));
            return true;
        }
    }

    loadDataFromLocal(key) {
        if (this.isElectron) {
            return window.electronAPI.store.get(`dashboard_${key}`);
        } else {
            const data = localStorage.getItem(`dashboard_${key}`);
            return data ? JSON.parse(data) : null;
        }
    }

    initializeData() {
        console.log('📊 Initializing data for desktop app...');

        Object.keys(this.tables).forEach(tableName => {
            const storedData = this.loadDataFromLocal(tableName);
            if (storedData) {
                this.sampleData[tableName] = storedData;
            }
        });

        console.log('✅ Desktop data initialization complete');
    }

    saveRecord() {
        const form = document.getElementById('recordForm');
        if (!form) return;

        const formData = new FormData(form);
        const record = {};

        for (let [key, value] of formData.entries()) {
            record[key] = value;
        }

        if (this.isEditMode && this.editingRecord) {
            record.id = this.editingRecord.id;
            record.updated_on = new Date().toISOString();
        } else {
            record.id = this.generateId();
            record.created_on = new Date().toISOString();
        }

        const tableData = this.sampleData[this.currentTable] || [];

        if (this.isEditMode) {
            const index = tableData.findIndex(r => r.id === record.id);
            if (index !== -1) {
                tableData[index] = record;
            }
        } else {
            tableData.push(record);
        }

        this.sampleData[this.currentTable] = tableData;
        this.saveDataToLocal(this.currentTable, tableData);

        if (this.uploadedFiles.length > 0) {
            this.saveUploadedFiles(record.id);

            // ✅ Refresh the files list right after saving
            this.uploadedFiles = (this.sampleData.files || []).filter(
                f => f.record_id === record.id && f.record_type === this.currentTable
            );
            this.loadTableData(this.currentTable); // re-render the table so the new file shows
        }

        this.showToast(
            this.isEditMode ? 'Record updated successfully!' : 'Record saved successfully!',
            'success'
        );

        this.closeModal();
        this.updateDashboardStats();
    }

    async previewFileFixed(fileId) {
        const file = this.uploadedFiles.find(f => f.id == fileId);
        if (!file) {
            const filesData = this.sampleData.files || [];
            const localFile = filesData.find(f => f.id == fileId);

            if (localFile && localFile.is_local && this.isElectron) {
                try {
                    const result = await window.electronAPI.readImage(localFile.file_path);
                    if (result.success) {
                        this.showFilePreviewModal({
                            ...localFile,
                            dataUrl: result.data
                        });
                        return;
                    }
                } catch (error) {
                    console.error('Error reading local file:', error);
                }
            }

            this.showToast('File not found for preview', 'error');
            return;
        }

        if (file.type.startsWith('image/')) {
            if (file.previewReady && file.dataUrl) {
                this.showFilePreviewModal(file);
            } else {
                this.showToast('Image preview is being prepared...', 'info');
            }
        } else {
            this.showToast('Preview not available for this file type', 'info');
        }
    }

    updateBranding() {
        super.updateBranding();

        if (this.isElectron) {
            const welcomeSubtitle = document.querySelector('.welcome-subtitle');
            if (welcomeSubtitle) {
                welcomeSubtitle.innerHTML += ' <small style="color: #4CAF50;">(Desktop App)</small>';
            }
        }
    }

    showToast(message, type = 'info') {
        super.showToast(message, type);
        if (this.isElectron) {
            console.log(`🖥️ [Desktop] ${message}`);
        }
    }
}

// Replace the original initialization with desktop-enhanced version
if (typeof window !== 'undefined') {
    const app = new DesktopDataManager();
}



// ================================================
// DESKTOP AUTHENTICATION SUPPORT
// ================================================

if (typeof window !== 'undefined' && window.electronAPI) {
    console.log('🖥️ Desktop mode detected - authentication enabled');
}
