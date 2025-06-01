const { ipcRenderer } = require('electron');

class FotoFusionApp {
    constructor() {
        this.photoProcessor = new PhotoProcessor();
        this.sourcePath = null;
        this.destinationPath = null;
        this.isProcessing = false;
        this.selectedStoredPresetId = null;
        
        // Ensure photoProcessor is properly initialized
        if (!this.photoProcessor.excludedPhotos) {
            this.photoProcessor.excludedPhotos = new Set();
        }
        if (!this.photoProcessor.excludedFolders) {
            this.photoProcessor.excludedFolders = new Set();
        }
        
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

        // Selection controls
        document.getElementById('selectAllPhotosBtn').addEventListener('click', () => {
            this.selectAllPhotos(true);
        });

        document.getElementById('deselectAllPhotosBtn').addEventListener('click', () => {
            this.selectAllPhotos(false);
        });

        document.getElementById('invertSelectionBtn').addEventListener('click', () => {
            this.invertPhotoSelection();
        });

        document.getElementById('selectAllFoldersBtn').addEventListener('click', () => {
            this.selectAllFolders(true);
        });

        document.getElementById('deselectAllFoldersBtn').addEventListener('click', () => {
            this.selectAllFolders(false);
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
            this.showStoredPresets();
            this.closeAllMenus();
        });

        document.getElementById('managePresetsBtn').addEventListener('click', () => {
            this.openPresetManager();
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

        document.getElementById('selectAllItemsBtn').addEventListener('click', () => {
            this.selectAllPhotos(true);
            this.selectAllFolders(true);
            this.closeAllMenus();
        });

        document.getElementById('deselectAllItemsBtn').addEventListener('click', () => {
            this.selectAllPhotos(false);
            this.selectAllFolders(false);
            this.closeAllMenus();
        });

        document.getElementById('clearExclusionsBtn').addEventListener('click', () => {
            if (this.photoProcessor && this.photoProcessor.photos.length > 0) {
                this.photoProcessor.clearExclusions();
                this.updatePhotoList(this.photoProcessor.photos);
                this.updateFolderPreview();
                this.log('All exclusions cleared', 'info');
            } else {
                this.log('No photos to clear exclusions for', 'info');
            }
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
            this.log('Support: Contact jakub.wawak@example.com for assistance', 'info');
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

        // Load preset modal
        document.getElementById('loadPresetModalCloseBtn').addEventListener('click', () => {
            this.hideModal('loadPresetModal');
        });

        document.getElementById('loadPresetModalCancelBtn').addEventListener('click', () => {
            this.hideModal('loadPresetModal');
        });

        document.getElementById('loadFromFileBtn').addEventListener('click', () => {
            this.loadPresetFromFile();
        });

        document.getElementById('loadSelectedPresetBtn').addEventListener('click', () => {
            this.loadSelectedStoredPreset();
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
                        this.showStoredPresets();
                        break;
                    case 'm':
                        e.preventDefault();
                        this.openPresetManager();
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
• Ctrl+M - Manage Presets
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

            // Initialize exclusion stats after scan
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
        
        if (photos.length === 0) {
            photoList.innerHTML = '<div class="no-photos">No photos found</div>';
            this.updateExclusionStats();
            return;
        }

        photoList.innerHTML = '';
        photos.forEach((photo, index) => {
            const item = document.createElement('div');
            const isExcluded = this.photoProcessor.isPhotoExcluded(photo.id);
            item.className = `photo-item ${isExcluded ? 'excluded' : ''}`;
            
            const sizeKB = Math.round(photo.metadata.fileSize / 1024);
            const date = new Date(photo.metadata.dateTime).toLocaleDateString();
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'photo-checkbox';
            checkbox.checked = !isExcluded;
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.togglePhotoSelection(photo.id);
            });
            
            const photoInfo = document.createElement('div');
            photoInfo.className = 'photo-info';
            photoInfo.innerHTML = `
                <div class="photo-filename">${photo.filename}</div>
                <div class="photo-metadata">
                    ${photo.metadata.camera} | ${photo.metadata.lens} | ${date} | ${sizeKB}KB
                </div>
            `;
            
            item.appendChild(checkbox);
            item.appendChild(photoInfo);
            
            // Allow clicking on the item to toggle selection
            item.addEventListener('click', (e) => {
                if (e.target === checkbox) return;
                this.togglePhotoSelection(photo.id);
            });
            
            photoList.appendChild(item);
        });
        
        this.updateExclusionStats();
    }

    updateExclusionStats() {
        if (!this.photoProcessor || !this.photoProcessor.photos) {
            return;
        }

        const stats = this.photoProcessor.getExclusionStats();
        const statsElement = document.getElementById('exclusionStats');
        
        if (statsElement) {
            statsElement.innerHTML = `
                <span class="included-count">${stats.included} included</span> • 
                <span class="excluded-count">${stats.totalExcluded} excluded</span>
            `;
        }
        
        // Update the main photo count
        const photoCount = document.getElementById('photoCount');
        if (photoCount) {
            photoCount.textContent = `${stats.total} photos (${stats.included} selected)`;
        }
        
        // Update start button state
        this.updateButtons();
    }

    togglePhotoSelection(photoId) {
        if (!photoId) {
            console.error('No photo ID provided to togglePhotoSelection');
            return;
        }

        const isExcluded = this.photoProcessor.togglePhotoExclusion(photoId);
        this.updatePhotoList(this.photoProcessor.photos);
        this.updateFolderPreview();
        
        const photo = this.photoProcessor.photos.find(p => p.id === photoId);
        if (photo) {
            this.log(`${isExcluded ? 'Excluded' : 'Included'} photo: ${photo.filename}`, 'info');
        }
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
            const isExcluded = this.photoProcessor.isFolderExcluded(folderPath);
            const excludedPhotos = photos.filter(photo => this.photoProcessor.isPhotoExcluded(photo.id));
            const includedPhotos = photos.filter(photo => !this.photoProcessor.isPhotoExcluded(photo.id));
            
            // Create folder hierarchy
            folders.forEach((folder, index) => {
                const indent = '  '.repeat(index + 1);
                const currentFolderPath = folders.slice(0, index + 1).join(require('path').sep);
                const isFolderExcluded = this.photoProcessor.isFolderExcluded(folderPath);
                
                if (index === folders.length - 1) {
                    // This is the final folder - add checkbox and stats
                    html += `
                        <div class="folder-item folder ${isFolderExcluded ? 'excluded' : ''}" 
                             data-folder-path="${folderPath}">
                            ${indent}
                            <input type="checkbox" class="folder-checkbox" 
                                   ${!isFolderExcluded ? 'checked' : ''} 
                                   data-folder-path="${folderPath}">
                            📁 ${folder}
                            <span class="folder-stats">${includedPhotos.length}/${photos.length} photos</span>
                        </div>
                    `;
                } else {
                    html += `<div class="folder-item folder">${indent}📁 ${folder}</div>`;
                }
            });
            
            // Show example files if folder is not excluded
            if (!isExcluded) {
                const filesToShow = Math.min(includedPhotos.length, 3);
                for (let i = 0; i < filesToShow; i++) {
                    const indent = '  '.repeat(folders.length + 1);
                    const photo = includedPhotos[i];
                    const isPhotoExcluded = this.photoProcessor.isPhotoExcluded(photo.id);
                    html += `
                        <div class="folder-item file ${isPhotoExcluded ? 'excluded' : ''}">
                            ${indent}📄 ${photo.filename}
                        </div>
                    `;
                }
                
                if (excludedPhotos.length > 0) {
                    const indent = '  '.repeat(folders.length + 1);
                    html += `<div class="folder-item file excluded">${indent}... and ${excludedPhotos.length} excluded photos</div>`;
                }
                
                if (includedPhotos.length > filesToShow) {
                    const indent = '  '.repeat(folders.length + 1);
                    html += `<div class="folder-item file">${indent}... and ${includedPhotos.length - filesToShow} more files</div>`;
                }
            }
        }
        
        html += '</div>';
        preview.innerHTML = html;
        
        // Add event listeners for folder selection
        preview.querySelectorAll('.folder-item[data-folder-path]').forEach(item => {
            const folderPath = item.dataset.folderPath;
            if (folderPath) {
                item.addEventListener('click', (e) => {
                    if (e.target.type === 'checkbox') return;
                    this.toggleFolderSelection(folderPath);
                });
            }
        });
        
        preview.querySelectorAll('.folder-checkbox[data-folder-path]').forEach(checkbox => {
            const folderPath = checkbox.dataset.folderPath;
            if (folderPath) {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    this.toggleFolderSelection(folderPath);
                });
            }
        });
        
        this.updateExclusionStats();
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
        
        const hasPhotos = this.photoProcessor.photos.length > 0;
        const hasIncludedPhotos = hasPhotos && this.photoProcessor.getIncludedPhotos().length > 0;
        
        scanBtn.disabled = this.isProcessing || !this.sourcePath;
        startBtn.disabled = this.isProcessing || !this.sourcePath || !this.destinationPath || !hasIncludedPhotos;
        clearBtn.disabled = this.isProcessing;
        
        // Update selection control buttons
        const selectAllPhotosBtn = document.getElementById('selectAllPhotosBtn');
        const deselectAllPhotosBtn = document.getElementById('deselectAllPhotosBtn');
        const invertSelectionBtn = document.getElementById('invertSelectionBtn');
        const selectAllFoldersBtn = document.getElementById('selectAllFoldersBtn');
        const deselectAllFoldersBtn = document.getElementById('deselectAllFoldersBtn');
        
        if (selectAllPhotosBtn) selectAllPhotosBtn.disabled = !hasPhotos || this.isProcessing;
        if (deselectAllPhotosBtn) deselectAllPhotosBtn.disabled = !hasPhotos || this.isProcessing;
        if (invertSelectionBtn) invertSelectionBtn.disabled = !hasPhotos || this.isProcessing;
        if (selectAllFoldersBtn) selectAllFoldersBtn.disabled = !hasPhotos || this.isProcessing;
        if (deselectAllFoldersBtn) deselectAllFoldersBtn.disabled = !hasPhotos || this.isProcessing;
    }

    clearAll() {
        if (this.isProcessing) return;
        
        this.sourcePath = null;
        this.destinationPath = null;
        this.selectedStoredPresetId = null;
        this.photoProcessor.photos = [];
        this.photoProcessor.folderStructure = {};
        this.photoProcessor.clearExclusions();
        
        document.getElementById('sourcePath').textContent = 'No folder selected';
        document.getElementById('destPath').textContent = 'No folder selected';
        document.getElementById('photoCount').textContent = '0 photos';
        document.getElementById('photoList').innerHTML = '<div class="no-photos">Scan for photos to see list</div>';
        document.getElementById('folderPreview').innerHTML = '<div class="no-preview">Select source and destination to preview structure</div>';
        document.getElementById('folderStructure').value = 'date';
        document.getElementById('dateFormat').value = 'YYYY/MM/DD';
        document.getElementById('folderPrefix').value = '';
        document.getElementById('preserveOriginal').checked = true;
        
        // Clear exclusion stats
        const statsElement = document.getElementById('exclusionStats');
        if (statsElement) {
            statsElement.innerHTML = '<span class="included-count">0 included</span> • <span class="excluded-count">0 excluded</span>';
        }
        
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
            preserveOriginal: document.getElementById('preserveOriginal').checked
        };

        try {
            const savedPreset = await ipcRenderer.invoke('save-preset-to-storage', preset);
            if (savedPreset) {
                this.log(`Preset saved: ${name}`, 'success');
                this.hideModal('presetModal');
            } else {
                this.log('Failed to save preset', 'error');
            }
        } catch (error) {
            this.log(`Error saving preset: ${error.message}`, 'error');
        }
    }

    async showStoredPresets() {
        this.showModal('loadPresetModal');
        
        const listContainer = document.getElementById('storedPresetsList');
        listContainer.innerHTML = '<div class="loading-presets">Loading presets...</div>';
        
        try {
            const presets = await ipcRenderer.invoke('load-presets');
            this.renderStoredPresetsList(presets);
        } catch (error) {
            listContainer.innerHTML = '<div class="loading-presets">Error loading presets</div>';
            this.log(`Error loading presets: ${error.message}`, 'error');
        }
    }

    renderStoredPresetsList(presets) {
        const listContainer = document.getElementById('storedPresetsList');
        
        if (presets.length === 0) {
            listContainer.innerHTML = `
                <div class="no-stored-presets">
                    <h4>No Saved Presets</h4>
                    <p>You haven't saved any presets yet. Create and save a preset to see it here.</p>
                    <button class="btn primary" onclick="app.hideModal('loadPresetModal')">Close</button>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        
        presets.forEach((preset, index) => {
            const item = document.createElement('div');
            item.className = 'stored-preset-item';
            item.dataset.presetId = preset.id;

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'storedPreset';
            radio.className = 'stored-preset-radio';
            radio.value = preset.id;
            radio.addEventListener('change', () => {
                this.selectStoredPreset(preset.id);
            });

            const info = document.createElement('div');
            info.className = 'stored-preset-info';

            const name = document.createElement('div');
            name.className = 'stored-preset-name';
            name.textContent = preset.name;

            const details = document.createElement('div');
            details.className = 'stored-preset-details';
            details.innerHTML = `
                ${this.getStructureDisplayName(preset.folderStructure)} • ${preset.dateFormat}
                ${preset.folderPrefix ? `• Prefix: ${preset.folderPrefix}` : ''}
            `;

            const meta = document.createElement('div');
            meta.className = 'stored-preset-meta';
            const createdDate = new Date(preset.createdAt).toLocaleDateString();
            const lastUsed = preset.lastUsed ? new Date(preset.lastUsed).toLocaleDateString() : 'Never used';
            meta.innerHTML = `Created: ${createdDate} • Last used: ${lastUsed}`;

            info.appendChild(name);
            info.appendChild(details);
            info.appendChild(meta);

            item.appendChild(radio);
            item.appendChild(info);

            item.addEventListener('click', () => {
                radio.checked = true;
                this.selectStoredPreset(preset.id);
            });

            listContainer.appendChild(item);
        });

        this.selectedStoredPresetId = null;
        this.updateLoadPresetButton();
    }

    selectStoredPreset(presetId) {
        this.selectedStoredPresetId = presetId;
        
        // Update visual selection
        document.querySelectorAll('.stored-preset-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.presetId === presetId);
        });
        
        this.updateLoadPresetButton();
    }

    updateLoadPresetButton() {
        const loadBtn = document.getElementById('loadSelectedPresetBtn');
        loadBtn.disabled = !this.selectedStoredPresetId;
    }

    async loadSelectedStoredPreset() {
        if (!this.selectedStoredPresetId) return;
        
        try {
            const presets = await ipcRenderer.invoke('load-presets');
            const preset = presets.find(p => p.id === this.selectedStoredPresetId);
            
            if (preset) {
                this.applyPreset(preset);
                
                // Update last used timestamp
                await ipcRenderer.invoke('update-preset-last-used', preset.id);
                
                this.hideModal('loadPresetModal');
                this.log(`Preset loaded: ${preset.name}`, 'success');
            } else {
                this.log('Preset not found', 'error');
            }
        } catch (error) {
            this.log(`Error loading preset: ${error.message}`, 'error');
        }
    }

    async loadPresetFromFile() {
        try {
            const preset = await ipcRenderer.invoke('load-preset');
            if (preset) {
                this.applyPreset(preset);
                this.hideModal('loadPresetModal');
                this.log(`Preset loaded from file: ${preset.name}`, 'success');
            }
        } catch (error) {
            this.log(`Error loading preset from file: ${error.message}`, 'error');
        }
    }

    applyPreset(preset) {
        document.getElementById('folderStructure').value = preset.folderStructure || 'date';
        document.getElementById('dateFormat').value = preset.dateFormat || 'YYYY/MM/DD';
        document.getElementById('folderPrefix').value = preset.folderPrefix || '';
        document.getElementById('preserveOriginal').checked = preset.preserveOriginal !== false;
        
        this.updateFolderPreview();
    }

    async openPresetManager() {
        try {
            await ipcRenderer.invoke('open-preset-manager');
        } catch (error) {
            this.log(`Error opening preset manager: ${error.message}`, 'error');
        }
    }

    showCompletionSummary(results) {
        const stats = this.photoProcessor.getExclusionStats();
        const summary = `
Copy completed successfully!

✅ ${results.success} photos copied
${results.failed > 0 ? `❌ ${results.failed} failed` : ''}
📁 ${results.foldersCopied} folders created
${stats.totalExcluded > 0 ? `🚫 ${stats.totalExcluded} photos excluded` : ''}
⏱️ Duration: ${Math.round((results.endTime - results.startTime) / 60000 * 100) / 100} minutes

Report saved to destination folder.
        `.trim();
        
        this.log(summary, 'success');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FotoFusionApp(); // Make globally available for onclick handlers
});