const { ipcRenderer } = require('electron');

class FotoFusionApp {
    constructor() {
        this.photoProcessor = new PhotoProcessor();
        this.sourcePath = null;
        this.destinationPath = null;
        this.isProcessing = false;
        
        this.initializeEventListeners();
        this.log('Application started', 'info');
    }

    initializeEventListeners() {
        // Window controls
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            ipcRenderer.send('window-minimize');
        });

        document.getElementById('maximizeBtn').addEventListener('click', () => {
            ipcRenderer.send('window-maximize');
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            ipcRenderer.send('window-close');
        });

        // Menu system
        this.initializeMenuSystem();

        // Folder selection
        document.getElementById('selectSourceBtn').addEventListener('click', () => {
            this.selectFolder('source');
        });

        document.getElementById('selectDestBtn').addEventListener('click', () => {
            this.selectFolder('destination');
        });

        // Actions
        document.getElementById('scanBtn').addEventListener('click', () => {
            this.scanForPhotos();
        });

        document.getElementById('startCopyBtn').addEventListener('click', () => {
            this.startCopyProcess();
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearAll();
        });

        // Structure change
        document.getElementById('folderStructure').addEventListener('change', () => {
            this.updateFolderPreview();
        });

        document.getElementById('dateFormat').addEventListener('change', () => {
            this.updateFolderPreview();
        });

        document.getElementById('folderPrefix').addEventListener('input', () => {
            this.updateFolderPreview();
        });

        // Modal event listeners
        this.initializeModalSystem();

        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-item')) {
                this.closeAllMenus();
            }
        });
    }

    initializeMenuSystem() {
        // File menu
        document.getElementById('fileMenu').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu('fileMenu');
        });

        document.getElementById('newProjectBtn').addEventListener('click', () => {
            this.clearAll();
            this.closeAllMenus();
        });

        document.getElementById('exitBtn').addEventListener('click', () => {
            ipcRenderer.send('window-close');
        });

        // Presets menu
        document.getElementById('presetsMenu').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu('presetsMenu');
        });

        document.getElementById('savePresetMenuBtn').addEventListener('click', () => {
            this.showPresetModal('save');
            this.closeAllMenus();
        });

        document.getElementById('loadPresetMenuBtn').addEventListener('click', () => {
            this.loadPreset();
            this.closeAllMenus();
        });

        document.getElementById('managePresetsBtn').addEventListener('click', () => {
            this.log('Preset management feature coming soon!', 'info');
            this.closeAllMenus();
        });

        // View menu
        document.getElementById('viewMenu').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu('viewMenu');
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.updateFolderPreview();
            this.closeAllMenus();
        });

        document.getElementById('expandAllBtn').addEventListener('click', () => {
            this.log('Expand all feature coming soon!', 'info');
            this.closeAllMenus();
        });

        document.getElementById('collapseAllBtn').addEventListener('click', () => {
            this.log('Collapse all feature coming soon!', 'info');
            this.closeAllMenus();
        });

        // Help menu
        document.getElementById('helpMenu').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu('helpMenu');
        });

        document.getElementById('aboutBtn').addEventListener('click', () => {
            this.showModal('aboutModal');
            this.closeAllMenus();
        });

        document.getElementById('shortcutsBtn').addEventListener('click', () => {
            this.showKeyboardShortcuts();
            this.closeAllMenus();
        });

        document.getElementById('supportBtn').addEventListener('click', () => {
            this.log('Support: Contact kubawawak@gmail.com for assistance', 'info');
            this.closeAllMenus();
        });
    }

    initializeModalSystem() {
        // Preset modal
        document.getElementById('modalCloseBtn').addEventListener('click', () => {
            this.hideModal('presetModal');
        });

        document.getElementById('modalCancelBtn').addEventListener('click', () => {
            this.hideModal('presetModal');
        });

        document.getElementById('modalSaveBtn').addEventListener('click', () => {
            this.savePresetFromModal();
        });

        // About modal
        document.getElementById('aboutModalCloseBtn').addEventListener('click', () => {
            this.hideModal('aboutModal');
        });

        document.getElementById('aboutModalOkBtn').addEventListener('click', () => {
            this.hideModal('aboutModal');
        });

        // Close modals when clicking backdrop
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
                this.closeAllMenus();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'n':
                        e.preventDefault();
                        this.clearAll();
                        break;
                    case 's':
                        e.preventDefault();
                        this.showPresetModal('save');
                        break;
                    case 'o':
                        e.preventDefault();
                        this.loadPreset();
                        break;
                    case 'r':
                        e.preventDefault();
                        if (this.sourcePath && !this.isProcessing) {
                            this.scanForPhotos();
                        }
                        break;
                }
            } else if (e.key === 'F5') {
                e.preventDefault();
                this.updateFolderPreview();
            }
        });
    }

    toggleMenu(menuId) {
        const menu = document.getElementById(menuId);
        const isActive = menu.classList.contains('active');
        
        this.closeAllMenus();
        
        if (!isActive) {
            menu.classList.add('active');
        }
    }

    closeAllMenus() {
        document.querySelectorAll('.menu-item').forEach(menu => {
            menu.classList.remove('active');
        });
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    showPresetModal(mode = 'save') {
        const modal = document.getElementById('presetModal');
        const title = document.getElementById('modalTitle');
        const saveBtn = document.getElementById('modalSaveBtn');
        const nameInput = document.getElementById('presetNameInput');
        const summary = document.getElementById('presetSummary');

        if (mode === 'save') {
            title.textContent = 'Save Preset';
            saveBtn.textContent = 'Save';
            nameInput.value = '';
            nameInput.placeholder = 'Enter preset name';
            
            // Generate preset summary
            const structureType = document.getElementById('folderStructure').value;
            const dateFormat = document.getElementById('dateFormat').value;
            const prefix = document.getElementById('folderPrefix').value;
            const preserveOriginal = document.getElementById('preserveOriginal').checked;

            summary.innerHTML = `
                <h4>Preset Summary</h4>
                <div class="summary-item">
                    <span class="summary-label">Folder Structure:</span>
                    <span class="summary-value">${this.getStructureDisplayName(structureType)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Date Format:</span>
                    <span class="summary-value">${dateFormat}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Prefix:</span>
                    <span class="summary-value">${prefix || 'None'}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Preserve Filenames:</span>
                    <span class="summary-value">${preserveOriginal ? 'Yes' : 'No'}</span>
                </div>
            `;
        }

        this.showModal('presetModal');
        nameInput.focus();
    }

    getStructureDisplayName(value) {
        const options = {
            'date': 'By Date',
            'camera': 'By Camera',
            'lens': 'By Lens',
            'date-camera': 'Date > Camera',
            'camera-date': 'Camera > Date'
        };
        return options[value] || value;
    }

    showKeyboardShortcuts() {
        const shortcuts = `
Keyboard Shortcuts:
• Ctrl+N - New Project (Clear All)
• Ctrl+S - Save Preset
• Ctrl+O - Load Preset  
• Ctrl+R - Rescan Photos
• F5 - Refresh Preview
• ESC - Close Menus/Modals
        `.trim();
        
        this.log(shortcuts, 'info');
    }

    async selectFolder(type) {
        try {
            const folderPath = await ipcRenderer.invoke('select-folder', type);
            if (folderPath) {
                if (type === 'source') {
                    this.sourcePath = folderPath;
                    document.getElementById('sourcePath').textContent = folderPath;
                    document.getElementById('scanBtn').disabled = false;
                    this.log(`Source folder selected: ${folderPath}`, 'info');
                } else {
                    this.destinationPath = folderPath;
                    document.getElementById('destPath').textContent = folderPath;
                    this.log(`Destination folder selected: ${folderPath}`, 'info');
                }
                this.updateFolderPreview();
            }
        } catch (error) {
            this.log(`Error selecting folder: ${error.message}`, 'error');
        }
    }

    async scanForPhotos() {
        if (!this.sourcePath) {
            this.log('Please select a source folder first', 'error');
            return;
        }

        this.setProgress(0, 'Scanning for photos...');
        this.isProcessing = true;
        this.updateButtons();

        try {
            const photos = await this.photoProcessor.scanFolder(this.sourcePath, (progress) => {
                const percentage = Math.round((progress.current / progress.total) * 100);
                this.setProgress(percentage, `Scanning: ${progress.filename} (${progress.current}/${progress.total})`);
            });

            this.updatePhotoList(photos);
            this.updateFolderPreview();
            this.log(`Scan complete: Found ${photos.length} photos`, 'success');
            this.setProgress(100, `Scan complete: ${photos.length} photos found`);
            
            if (photos.length > 0 && this.destinationPath) {
                document.getElementById('startCopyBtn').disabled = false;
            }
        } catch (error) {
            this.log(`Error scanning photos: ${error.message}`, 'error');
            this.setProgress(0, 'Scan failed');
        } finally {
            this.isProcessing = false;
            this.updateButtons();
        }
    }

    async startCopyProcess() {
        if (!this.sourcePath || !this.destinationPath || this.photoProcessor.photos.length === 0) {
            this.log('Please select folders and scan for photos first', 'error');
            return;
        }

        this.setProgress(0, 'Starting copy process...');
        this.isProcessing = true;
        this.updateButtons();

        try {
            const structureType = document.getElementById('folderStructure').value;
            const prefix = document.getElementById('folderPrefix').value.trim();
            const preserveOriginal = document.getElementById('preserveOriginal').checked;
            const dateFormat = document.getElementById('dateFormat').value;

            this.log(`Starting copy with structure: ${structureType}, date format: ${dateFormat}`, 'info');
            
            // Generate folder structure
            this.photoProcessor.generateFolderStructure(structureType, prefix, dateFormat);
            
            // Copy photos
            const results = await this.photoProcessor.copyPhotos(
                this.destinationPath, 
                preserveOriginal,
                (progress) => {
                    const percentage = Math.round((progress.current / progress.total) * 100);
                    this.setProgress(percentage, `Copying: ${progress.filename} (${progress.current}/${progress.total})`);
                }
            );

            // Generate and save report
            const report = this.photoProcessor.generateReport(results, structureType, prefix, this.destinationPath, dateFormat);
            const reportPath = await ipcRenderer.invoke('save-report', report, this.destinationPath);

            this.log(`Copy complete! Successfully copied ${results.success} photos`, 'success');
            if (results.failed > 0) {
                this.log(`${results.failed} files failed to copy`, 'error');
            }
            this.log(`Report saved to: ${reportPath}`, 'info');

            this.setProgress(100, `Copy complete: ${results.success} photos copied`);
            
            // Show completion summary
            this.showCompletionSummary(results);
        } catch (error) {
            this.log(`Error during copy process: ${error.message}`, 'error');
            this.setProgress(0, 'Copy failed');
        } finally {
            this.isProcessing = false;
            this.updateButtons();
        }
    }

    updatePhotoList(photos) {
        const photoList = document.getElementById('photoList');
        const photoCount = document.getElementById('photoCount');
        
        photoCount.textContent = `${photos.length} photos`;
        
        if (photos.length === 0) {
            photoList.innerHTML = '<div class="no-photos">No photos found</div>';
            return;
        }

        photoList.innerHTML = '';
        photos.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'photo-item';
            
            const sizeKB = Math.round(photo.metadata.fileSize / 1024);
            const date = new Date(photo.metadata.dateTime).toLocaleDateString();
            
            item.innerHTML = `
                <div style="font-weight: 600;">${photo.filename}</div>
                <div style="font-size: 11px; color: #666;">
                    ${photo.metadata.camera} | ${photo.metadata.lens} | ${date} | ${sizeKB}KB
                </div>
            `;
            
            photoList.appendChild(item);
        });
    }

    updateFolderPreview() {
        const preview = document.getElementById('folderPreview');
        
        if (!this.sourcePath || !this.destinationPath || this.photoProcessor.photos.length === 0) {
            preview.innerHTML = '<div class="no-preview">Select source and destination, then scan for photos to preview structure</div>';
            return;
        }

        const structureType = document.getElementById('folderStructure').value;
        const prefix = document.getElementById('folderPrefix').value.trim();
        const dateFormat = document.getElementById('dateFormat').value;
        
        // Generate structure for preview
        const structure = this.photoProcessor.generateFolderStructure(structureType, prefix, dateFormat);
        
        let html = '<div class="folder-tree">';
        html += `<div class="folder-item folder">📁 ${this.destinationPath}</div>`;
        
        for (const [folderPath, photos] of Object.entries(structure)) {
            const folders = folderPath.split(require('path').sep);
            let currentPath = '';
            
            folders.forEach((folder, index) => {
                const indent = '  '.repeat(index + 1);
                html += `<div class="folder-item folder">${indent}📁 ${folder}</div>`;
            });
            
            // Show first few files as examples
            const filesToShow = Math.min(photos.length, 3);
            for (let i = 0; i < filesToShow; i++) {
                const indent = '  '.repeat(folders.length + 1);
                html += `<div class="folder-item file">${indent}📄 ${photos[i].filename}</div>`;
            }
            
            if (photos.length > filesToShow) {
                const indent = '  '.repeat(folders.length + 1);
                html += `<div class="folder-item file">${indent}... and ${photos.length - filesToShow} more files</div>`;
            }
        }
        
        html += '</div>';
        preview.innerHTML = html;
    }

    setProgress(percentage, text) {
        document.getElementById('progressFill').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = text;
    }

    log(message, type = 'info') {
        const logContainer = document.getElementById('logContainer');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    updateButtons() {
        const scanBtn = document.getElementById('scanBtn');
        const startBtn = document.getElementById('startCopyBtn');
        const clearBtn = document.getElementById('clearBtn');
        
        scanBtn.disabled = this.isProcessing || !this.sourcePath;
        startBtn.disabled = this.isProcessing || !this.sourcePath || !this.destinationPath || this.photoProcessor.photos.length === 0;
        clearBtn.disabled = this.isProcessing;
    }

    clearAll() {
        if (this.isProcessing) return;
        
        this.sourcePath = null;
        this.destinationPath = null;
        this.photoProcessor.photos = [];
        this.photoProcessor.folderStructure = {};
        
        document.getElementById('sourcePath').textContent = 'No folder selected';
        document.getElementById('destPath').textContent = 'No folder selected';
        document.getElementById('photoCount').textContent = '0 photos';
        document.getElementById('photoList').innerHTML = '<div class="no-photos">Scan for photos to see list</div>';
        document.getElementById('folderPreview').innerHTML = '<div class="no-preview">Select source and destination to preview structure</div>';
        document.getElementById('folderStructure').value = 'date';
        document.getElementById('dateFormat').value = 'YYYY/MM/DD';
        document.getElementById('folderPrefix').value = '';
        document.getElementById('preserveOriginal').checked = true;
        
        this.setProgress(0, 'Ready to start');
        this.updateButtons();
        this.log('Project cleared - Ready for new organization', 'info');
    }

    async savePresetFromModal() {
        const name = document.getElementById('presetNameInput').value.trim();
        if (!name) {
            this.log('Please enter a preset name', 'error');
            return;
        }

        const preset = {
            name: name,
            folderStructure: document.getElementById('folderStructure').value,
            dateFormat: document.getElementById('dateFormat').value,
            folderPrefix: document.getElementById('folderPrefix').value,
            preserveOriginal: document.getElementById('preserveOriginal').checked,
            createdAt: new Date().toISOString()
        };

        try {
            const savedPath = await ipcRenderer.invoke('save-preset', preset);
            if (savedPath) {
                this.log(`Preset saved: ${name}`, 'success');
                this.hideModal('presetModal');
            }
        } catch (error) {
            this.log(`Error saving preset: ${error.message}`, 'error');
        }
    }

    async loadPreset() {
        try {
            const preset = await ipcRenderer.invoke('load-preset');
            if (preset) {
                document.getElementById('folderStructure').value = preset.folderStructure || 'date';
                document.getElementById('dateFormat').value = preset.dateFormat || 'YYYY/MM/DD';
                document.getElementById('folderPrefix').value = preset.folderPrefix || '';
                document.getElementById('preserveOriginal').checked = preset.preserveOriginal !== false;
                
                this.updateFolderPreview();
                this.log(`Preset loaded: ${preset.name}`, 'success');
            }
        } catch (error) {
            this.log(`Error loading preset: ${error.message}`, 'error');
        }
    }

    showCompletionSummary(results) {
        const summary = `
Copy completed successfully!

✅ ${results.success} photos copied
${results.failed > 0 ? `❌ ${results.failed} failed` : ''}
📁 ${results.foldersCopied} folders created
⏱️ Duration: ${Math.round((results.endTime - results.startTime) / 60000 * 100) / 100} minutes

Report saved to destination folder.
        `.trim();
        
        this.log(summary, 'success');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FotoFusionApp();
});