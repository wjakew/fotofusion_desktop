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
        
        // Set default values
        document.getElementById('preserveOriginal').checked = true;
        
        this.initializeEventListeners();
        this.updateFormHints();
        this.updateButtons();
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

        // Statistics button
        document.getElementById('statsBtn').addEventListener('click', () => {
            this.showStatistics();
        });

        // Structure change
        document.getElementById('folderStructure').addEventListener('change', () => {
            this.updateFolderPreview();
            this.updateFormHints();
        });

        document.getElementById('dateFormat').addEventListener('change', () => {
            this.updateFolderPreview();
            this.updateFormHints();
        });

        document.getElementById('folderPrefix').addEventListener('input', () => {
            this.updateFolderPreview();
        });

        // Date/time range changes
        document.getElementById('startDateTime').addEventListener('change', () => {
            this.updateFolderPreview();
        });

        document.getElementById('endDateTime').addEventListener('change', () => {
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

        // Add event listener for setting camera name for unknowns
        const setUnknownCameraBtn = document.getElementById('setUnknownCameraBtn');
        if (setUnknownCameraBtn) {
            setUnknownCameraBtn.addEventListener('click', () => {
                const input = document.getElementById('unknownCameraInput');
                const feedback = document.getElementById('unknownCameraFeedback');
                const cameraName = input.value.trim();
                if (!cameraName) {
                    feedback.textContent = 'Please enter a camera name.';
                    return;
                }
                const updated = this.photoProcessor.setCameraNameForUnknown(cameraName);
                if (updated > 0) {
                    feedback.textContent = `Set camera name for ${updated} photo(s).`;
                    this.updatePhotoList(this.photoProcessor.photos);
                    this.updateFolderPreview();
                } else {
                    feedback.textContent = 'No photos updated.';
                }
            });
        }
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
            this.savePreset();
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

        // Statistics modal
        document.getElementById('statisticsModalCloseBtn').addEventListener('click', () => {
            this.hideModal('statisticsModal');
        });

        document.getElementById('statisticsModalOkBtn').addEventListener('click', () => {
            this.hideModal('statisticsModal');
        });

        document.getElementById('exportStatsBtn').addEventListener('click', () => {
            this.exportStatistics();
        });

        // Completion modal
        document.getElementById('completionModalCloseBtn').addEventListener('click', () => {
            this.hideModal('completionModal');
        });

        document.getElementById('completionModalCloseBtn2').addEventListener('click', () => {
            this.hideModal('completionModal');
        });

        document.getElementById('verifyFilesBtn').addEventListener('click', () => {
            this.verifyFiles();
        });

        document.getElementById('verifyFilesMD5Btn').addEventListener('click', () => {
            this.verifyFilesMD5();
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
            const startDateTime = document.getElementById('startDateTime').value;
            const endDateTime = document.getElementById('endDateTime').value;

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
                ${startDateTime ? `
                <div class="summary-item">
                    <span class="summary-label">Start Date/Time:</span>
                    <span class="summary-value">${startDateTime}</span>
                </div>` : ''}
                ${endDateTime ? `
                <div class="summary-item">
                    <span class="summary-label">End Date/Time:</span>
                    <span class="summary-value">${endDateTime}</span>
                </div>` : ''}
            `;
        }

        this.showModal('presetModal');
        nameInput.focus();
    }

    getStructureDisplayName(value) {
        const options = {
            'date': 'By Date (hierarchical)',
            'date-flat': 'By Date (only dates)',
            'camera': 'By Camera',
            'lens': 'By Lens',
            'date-camera': 'Date > Camera (hierarchical)',
            'date-flat-camera': 'Date > Camera (flat dates)',
            'camera-date': 'Camera > Date (hierarchical)',
            'camera-date-flat': 'Camera > Date (flat dates)'
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
            
            // Get date/time range filters
            const startDateTime = document.getElementById('startDateTime').value;
            const endDateTime = document.getElementById('endDateTime').value;

            this.log(`Starting copy with structure: ${structureType}, date format: ${dateFormat}`, 'info');

            // Log date/time filter information if provided
            if (startDateTime || endDateTime) {
                this.log(`Date/time filter applied: ${startDateTime || 'any'} to ${endDateTime || 'any'}`, 'info');
            }

            // Regenerate folder structure with current date range to ensure consistency
            // This ensures the copy process uses only photos within the selected date range
            this.photoProcessor.generateFolderStructure(structureType, prefix, dateFormat, startDateTime, endDateTime);
            this.log(`Regenerated folder structure with ${Object.keys(this.photoProcessor.folderStructure).length} folders for date range`, 'info');
            
            // Debug exclusion state before copying
            console.log('=== PRE-COPY EXCLUSION STATE ===');
            this.photoProcessor.debugExclusionState();
            
            // Validate exclusions are still valid
            this.photoProcessor.validateExclusions();
            
            console.log('=== STARTING COPY PROCESS ===');
            
            // Copy photos
            const results = await this.photoProcessor.copyPhotos(
                this.destinationPath, 
                preserveOriginal,
                (progress) => {
                    const percentage = Math.round((progress.current / progress.total) * 100);
                    if (progress.action === 'skipped') {
                        this.setProgress(percentage, `Skipping: ${progress.filename} (already exists) (${progress.current}/${progress.total})`);
                    } else {
                        this.setProgress(percentage, `Copying: ${progress.filename} (${progress.current}/${progress.total})`);
                    }
                },
                startDateTime || null,
                endDateTime || null
            );

            // Generate and save report
            const report = this.photoProcessor.generateReport(results, structureType, prefix, this.destinationPath, dateFormat);
            const reportPath = await ipcRenderer.invoke('save-report', report, this.destinationPath);

            this.log(`Copy complete! Successfully copied ${results.success} photos`, 'success');
            if (results.skipped > 0) {
                this.log(`${results.skipped} files already exist and were skipped`, 'info');
            }
            if (results.failed > 0) {
                this.log(`${results.failed} files failed to copy`, 'error');
            }
            this.log(`Report saved to: ${reportPath}`, 'info');

            this.setProgress(100, `Copy complete: ${results.success} photos copied, ${results.skipped || 0} skipped`);
            
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
        const unknownCameraSection = document.getElementById('unknownCameraSection');
        if (!photoList || !unknownCameraSection) return;
        
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

        // Check if there are any photos with 'Unknown Camera'
        const unknownCount = photos.filter(p => p.metadata.camera === 'Unknown Camera' || !p.metadata.camera).length;
        if (unknownCount > 0) {
            unknownCameraSection.style.display = '';
            document.getElementById('unknownCameraInput').value = '';
            document.getElementById('unknownCameraFeedback').textContent = `${unknownCount} photo(s) with Unknown Camera.`;
        } else {
            unknownCameraSection.style.display = 'none';
        }
    }

    updateFormHints() {
        const structureType = document.getElementById('folderStructure').value;
        const dateFormat = document.getElementById('dateFormat').value;
        const hintElement = document.getElementById('dateFormatHint');
        
        if (!hintElement) return;
        
        let hint = '';
        
        if (structureType === 'date') {
            // Hierarchical date structure
            switch (dateFormat) {
                case 'YYYY/MM/DD':
                    hint = 'Creates: 2024 → 2024-01 → 2024-01-15';
                    break;
                case 'YYYY-MM-DD':
                    hint = 'Creates: 2024-01-15 (single folder)';
                    break;
                case 'YYYY/MM':
                    hint = 'Creates: 2024 → 2024-01';
                    break;
                case 'YYYY':
                    hint = 'Creates: 2024 (year folders only)';
                    break;
                default:
                    hint = 'Creates nested folder structure by date';
            }
        } else if (structureType === 'date-flat') {
            // Flat date structure
            switch (dateFormat) {
                case 'YYYY/MM/DD':
                case 'YYYY-MM-DD':
                    hint = 'Creates: 2024-01-15 (flat date folders)';
                    break;
                case 'YYYY/MM':
                case 'YYYY-MM':
                    hint = 'Creates: 2024-01 (flat month folders)';
                    break;
                case 'YYYY':
                    hint = 'Creates: 2024 (flat year folders)';
                    break;
                case 'DD-MM-YYYY':
                    hint = 'Creates: 15-01-2024 (flat date folders)';
                    break;
                case 'MM-DD-YYYY':
                    hint = 'Creates: 01-15-2024 (flat date folders)';
                    break;
                case 'Month YYYY':
                    hint = 'Creates: January 2024 (flat month folders)';
                    break;
                case 'YYYY/Month':
                    hint = 'Creates: 2024-January (flat month folders)';
                    break;
                default:
                    hint = 'Creates single-level date folders';
            }
        } else if (structureType === 'date-camera') {
            hint = 'Creates nested: Year → Month → Day → Camera';
        } else if (structureType === 'date-flat-camera') {
            hint = 'Creates flat: Date → Camera';
        } else if (structureType === 'camera-date') {
            hint = 'Creates nested: Camera → Year → Month';
        } else if (structureType === 'camera-date-flat') {
            hint = 'Creates flat: Camera → Date';
        } else if (structureType.includes('date')) {
            hint = 'Date folders combined with camera/lens organization';
        } else {
            hint = '';
        }
        
        hintElement.textContent = hint;
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
        const startDateTime = document.getElementById('startDateTime').value || null;
        const endDateTime = document.getElementById('endDateTime').value || null;

        // Generate structure for preview with date range filtering
        const structure = this.photoProcessor.generateFolderStructure(structureType, prefix, dateFormat, startDateTime, endDateTime);
        
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
        const statsBtn = document.getElementById('statsBtn');
        
        const hasPhotos = this.photoProcessor.photos.length > 0;
        const hasIncludedPhotos = hasPhotos && this.photoProcessor.getIncludedPhotos().length > 0;
        
        scanBtn.disabled = this.isProcessing || !this.sourcePath;
        startBtn.disabled = this.isProcessing || !this.sourcePath || !this.destinationPath || !hasIncludedPhotos;
        clearBtn.disabled = this.isProcessing;
        statsBtn.disabled = this.isProcessing || !hasPhotos;
        
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
        document.getElementById('startDateTime').value = '';
        document.getElementById('endDateTime').value = '';
        
        // Clear exclusion stats
        const statsElement = document.getElementById('exclusionStats');
        if (statsElement) {
            statsElement.innerHTML = '<span class="included-count">0 included</span> • <span class="excluded-count">0 excluded</span>';
        }
        
        this.setProgress(0, 'Ready to start');
        this.updateButtons();
        this.updateFormHints();
        this.log('Project cleared - Ready for new organization', 'info');
    }

    savePreset() {
        const presetName = document.getElementById('presetNameInput').value.trim();
        if (!presetName) {
            this.log('Please enter a preset name', 'error');
            return;
        }

        const preset = {
            name: presetName,
            folderStructure: document.getElementById('folderStructure').value,
            dateFormat: document.getElementById('dateFormat').value,
            folderPrefix: document.getElementById('folderPrefix').value.trim(),
            preserveOriginal: document.getElementById('preserveOriginal').checked,
            destinationPath: this.destinationPath || null,
            startDateTime: document.getElementById('startDateTime').value || null,
            endDateTime: document.getElementById('endDateTime').value || null
        };

        this.savePresetToStorage(preset);
        this.log(`Preset "${presetName}" saved successfully`, 'success');
        this.hideModal('presetModal');
    }

    applyPreset(preset) {
        document.getElementById('folderStructure').value = preset.folderStructure || 'date';
        document.getElementById('dateFormat').value = preset.dateFormat || 'YYYY/MM/DD';
        document.getElementById('folderPrefix').value = preset.folderPrefix || '';
        document.getElementById('preserveOriginal').checked = preset.preserveOriginal !== false;
        
        // Apply destination path if it exists and is valid
        if (preset.destinationPath) {
            const fs = require('fs');
            try {
                if (fs.existsSync(preset.destinationPath)) {
                    this.destinationPath = preset.destinationPath;
                    document.getElementById('destPath').textContent = preset.destinationPath;
                    this.log(`Preset destination applied: ${preset.destinationPath}`, 'info');
                } else {
                    this.log(`Preset destination folder no longer exists: ${preset.destinationPath}`, 'warning');
                }
            } catch (error) {
                this.log(`Error checking preset destination: ${error.message}`, 'warning');
            }
        }
        
        // Apply date/time settings if they exist
        if (preset.startDateTime) {
            document.getElementById('startDateTime').value = preset.startDateTime;
        } else {
            document.getElementById('startDateTime').value = '';
        }
        
        if (preset.endDateTime) {
            document.getElementById('endDateTime').value = preset.endDateTime;
        } else {
            document.getElementById('endDateTime').value = '';
        }
        
        this.updateFolderPreview();
        this.updateFormHints();
        this.updateButtons();
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
                ${preset.destinationPath ? `• Dest: ${preset.destinationPath}` : ''}
            `;

            const meta = document.createElement('div');
            meta.className = 'stored-preset-meta';
            const createdDate = new Date(preset.createdAt).toLocaleDateString();
            const lastUsed = preset.lastUsed ? new Date(preset.lastUsed).toLocaleDateString() : 'Never used';
            
            // Check if destination folder exists
            let folderStatus = '';
            if (preset.destinationPath) {
                const fs = require('fs');
                try {
                    if (fs.existsSync(preset.destinationPath)) {
                        folderStatus = ' • <span style="color: #27ae60;">✓ Folder exists</span>';
                    } else {
                        folderStatus = ' • <span style="color: #e74c3c;">✗ Folder missing</span>';
                    }
                } catch (error) {
                    folderStatus = ' • <span style="color: #f39c12;">? Folder check failed</span>';
                }
            }
            
            meta.innerHTML = `Created: ${createdDate} • Last used: ${lastUsed}${folderStatus}`;

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

    async openPresetManager() {
        try {
            await ipcRenderer.invoke('open-preset-manager');
        } catch (error) {
            this.log(`Error opening preset manager: ${error.message}`, 'error');
        }
    }

    showStatistics() {
        console.log('showStatistics called'); // Debug log
        
        if (!this.photoProcessor || this.photoProcessor.photos.length === 0) {
            this.log('No photos available for statistics. Please scan photos first.', 'error');
            return;
        }

        console.log('Opening statistics modal'); // Debug log
        this.showModal('statisticsModal');
        this.renderStatistics();
    }

    async renderStatistics() {
        console.log('renderStatistics called'); // Debug log
        const content = document.getElementById('statisticsContent');
        
        if (!content) {
            console.error('statisticsContent element not found');
            return;
        }
        
        content.innerHTML = '<div class="loading-stats">Calculating statistics...</div>';
        
        try {
            // Add small delay to show loading
            await new Promise(resolve => setTimeout(resolve, 100));
            
            console.log('Calculating statistics for', this.photoProcessor.photos.length, 'photos'); // Debug log
            const stats = this.photoProcessor.calculateStatistics();
            
            if (!stats) {
                content.innerHTML = '<div class="loading-stats">No statistics available</div>';
                return;
            }

            console.log('Generated statistics:', stats); // Debug log
            content.innerHTML = this.generateStatisticsHTML(stats);
        } catch (error) {
            console.error('Error calculating statistics:', error);
            content.innerHTML = '<div class="loading-stats">Error calculating statistics</div>';
        }
    }

    generateStatisticsHTML(stats) {
        return `
            <div class="stats-overview">
                <h3>📊 Collection Overview</h3>
                <div class="stats-overview-grid">
                    <div class="stats-highlight">
                        <span class="stats-highlight-value">${stats.overview.totalPhotos}</span>
                        <span class="stats-highlight-label">Total Photos</span>
                    </div>
                    <div class="stats-highlight">
                        <span class="stats-highlight-value">${stats.overview.includedPhotos}</span>
                        <span class="stats-highlight-label">Selected for Copy</span>
                    </div>
                    <div class="stats-highlight">
                        <span class="stats-highlight-value">${stats.overview.totalSizeMB} MB</span>
                        <span class="stats-highlight-label">Total Size</span>
                    </div>
                    <div class="stats-highlight">
                        <span class="stats-highlight-value">${stats.overview.timeSpanDays}</span>
                        <span class="stats-highlight-label">Days Span</span>
                    </div>
                </div>
                ${stats.dateRange ? `
                <div class="stats-date-range">
                    <span class="stats-date-range-start">${stats.dateRange.oldest.toLocaleDateString()}</span>
                    <span class="stats-date-range-separator">to</span>
                    <span class="stats-date-range-end">${stats.dateRange.newest.toLocaleDateString()}</span>
                </div>
                ` : ''}
            </div>

            <div class="stats-container">
                <div class="stats-section">
                    <h4>📷 Cameras Used</h4>
                    ${this.generateStatsBarChart(stats.cameras)}
                </div>

                <div class="stats-section">
                    <h4>🔍 Lenses Used</h4>
                    ${this.generateStatsBarChart(stats.lenses)}
                </div>

                <div class="stats-section">
                    <h4>🎯 Aperture Settings</h4>
                    ${this.generateStatsBarChart(stats.apertures)}
                </div>

                <div class="stats-section">
                    <h4>📊 ISO Values</h4>
                    ${this.generateStatsBarChart(stats.isoValues)}
                </div>

                <div class="stats-section">
                    <h4>⚡ Shutter Speeds</h4>
                    ${this.generateStatsBarChart(stats.shutterSpeeds)}
                </div>

                <div class="stats-section">
                    <h4>📏 Focal Lengths</h4>
                    ${this.generateStatsBarChart(stats.focalLengths)}
                </div>

                <div class="stats-section">
                    <h4>💾 File Sizes</h4>
                    <div class="stats-grid">
                        <div class="stats-item">
                            <span class="stats-label">Average:</span>
                            <span class="stats-value">${stats.fileSizes.average} MB</span>
                        </div>
                        <div class="stats-item">
                            <span class="stats-label">Median:</span>
                            <span class="stats-value">${stats.fileSizes.median} MB</span>
                        </div>
                        <div class="stats-item">
                            <span class="stats-label">Smallest:</span>
                            <span class="stats-value">${stats.fileSizes.smallest} MB</span>
                        </div>
                        <div class="stats-item">
                            <span class="stats-label">Largest:</span>
                            <span class="stats-value">${stats.fileSizes.largest} MB</span>
                        </div>
                    </div>
                </div>

                <div class="stats-section">
                    <h4>📅 Monthly Distribution</h4>
                    ${stats.dateRange ? this.generateStatsBarChart(stats.dateRange.monthlyDistribution) : '<div class="stats-item">No date information available</div>'}
                </div>

                <div class="stats-section">
                    <h4>📁 File Formats</h4>
                    ${this.generateStatsBarChart(stats.fileFormats)}
                </div>

                <div class="stats-section">
                    <h4>📐 Aspect Ratios</h4>
                    ${this.generateStatsBarChart(stats.aspectRatios)}
                </div>

                <div class="stats-section">
                    <h4>🌍 Location Data</h4>
                    ${this.generateLocationStats(stats.locations)}
                </div>
            </div>
        `;
    }

    generateStatsBarChart(statsData) {
        if (!statsData || !statsData.items || statsData.items.length === 0) {
            return '<div class="stats-item">No data available</div>';
        }

        return `
            <div class="stats-bar-container">
                ${statsData.items.map(item => `
                    <div class="stats-bar-item">
                        <div class="stats-bar-label" title="${item.label}">${item.label}</div>
                        <div class="stats-bar">
                            <div class="stats-bar-fill" style="width: ${item.barWidth}%"></div>
                        </div>
                        <div class="stats-bar-count">${item.count}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    generateLocationStats(locationData) {
        if (!locationData) {
            return '<div class="stats-item">No location data available</div>';
        }

        let html = `
            <div class="stats-grid">
                <div class="stats-item">
                    <span class="stats-label">With GPS:</span>
                    <span class="stats-value">${locationData.totalWithLocation}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-label">Without GPS:</span>
                    <span class="stats-value">${locationData.totalWithoutLocation}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-label">GPS Coverage:</span>
                    <span class="stats-value">${locationData.percentageWithLocation}%</span>
                </div>
            </div>
        `;

        if (locationData.topLocations.length > 0) {
            html += '<div style="margin-top: 12px;"><strong>Top Locations:</strong></div>';
            locationData.topLocations.forEach(([name, data]) => {
                html += `
                    <div class="stats-location-item">
                        <div class="stats-location-name">${name} (${data.count} photos)</div>
                        <div class="stats-location-coords">${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}</div>
                    </div>
                `;
            });
        }

        return html;
    }

    async exportStatistics() {
        if (!this.photoProcessor || this.photoProcessor.photos.length === 0) {
            this.log('No statistics to export', 'error');
            return;
        }

        try {
            const stats = this.photoProcessor.calculateStatistics();
            const report = this.generateStatisticsReport(stats);
            
            const result = await ipcRenderer.invoke('save-report', report, this.destinationPath || process.cwd());
            if (result) {
                this.log(`Statistics exported to: ${result}`, 'success');
            }
        } catch (error) {
            this.log(`Error exporting statistics: ${error.message}`, 'error');
        }
    }

    generateStatisticsReport(stats) {
        const date = new Date().toLocaleString();
        
        return `# Photo Collection Statistics Report
Generated: ${date}

## Overview
- **Total Photos:** ${stats.overview.totalPhotos}
- **Selected for Copy:** ${stats.overview.includedPhotos}
- **Excluded:** ${stats.overview.excludedPhotos}
- **Total Size:** ${stats.overview.totalSizeMB} MB
- **Average Size:** ${stats.overview.avgSizeMB} MB
- **Time Span:** ${stats.overview.timeSpanDays} days
${stats.dateRange ? `- **Date Range:** ${stats.dateRange.oldest.toLocaleDateString()} to ${stats.dateRange.newest.toLocaleDateString()}` : ''}

## Camera Equipment

### Cameras Used
${stats.cameras.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}

### Lenses Used
${stats.lenses.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}

## Camera Settings

### Aperture Settings
${stats.apertures.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}

### ISO Values
${stats.isoValues.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}

### Shutter Speeds
${stats.shutterSpeeds.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}

### Focal Lengths
${stats.focalLengths.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}

## File Information

### File Sizes
- **Average:** ${stats.fileSizes.average} MB
- **Median:** ${stats.fileSizes.median} MB
- **Smallest:** ${stats.fileSizes.smallest} MB
- **Largest:** ${stats.fileSizes.largest} MB

### File Formats
${stats.fileFormats.items.map(item => `- **${item.label}:** ${item.count} files (${item.percentage}%)`).join('\n')}

### Aspect Ratios
${stats.aspectRatios.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}

## Location Data
- **Photos with GPS:** ${stats.locations.totalWithLocation}
- **Photos without GPS:** ${stats.locations.totalWithoutLocation}
- **GPS Coverage:** ${stats.locations.percentageWithLocation}%

${stats.locations.topLocations.length > 0 ? `### Top Locations
${stats.locations.topLocations.map(([name, data]) => `- **${name}:** ${data.count} photos (${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)})`).join('\n')}` : ''}

${stats.dateRange && stats.dateRange.monthlyDistribution ? `## Monthly Distribution
${stats.dateRange.monthlyDistribution.items.map(item => `- **${item.label}:** ${item.count} photos (${item.percentage}%)`).join('\n')}` : ''}

---
*Report generated by FotoFusion v1.0.3*
        `;
    }

    showCompletionSummary(results) {
        const statsDiv = document.getElementById('completionStats');
        
        const startTime = new Date(results.startTime).toLocaleString();
        const endTime = new Date(results.endTime).toLocaleString();
        const duration = (results.endTime - results.startTime) / 1000;
        const durationText = duration > 60 ? 
            `${Math.floor(duration / 60)} minutes ${Math.round(duration % 60)} seconds` : 
            `${Math.round(duration)} seconds`;
            
        // Calculate bytes per second
        const totalBytes = results.success * 5242880; // Assuming 5MB per photo average
        const bytesPerSecond = Math.round(totalBytes / duration);
        const mbPerSecond = (bytesPerSecond / (1024 * 1024)).toFixed(2);
        
        // Calculate percentages for better visualization
        const successRate = results.totalPhotos > 0 ? 
            Math.round((results.success / results.includedPhotos) * 100) : 0;
        const excludedRate = results.totalPhotos > 0 ?
            Math.round((results.excludedPhotos / results.totalPhotos) * 100) : 0;
        
        let summaryHtml = `
            <div class="summary-container">
                <div class="summary-section">
                    <h4>Copy Summary</h4>
                    <div class="stats-row">
                        <div class="stats-item">
                            <div class="stats-value">${results.success}</div>
                            <div class="stats-label">Photos Copied</div>
                        </div>
                        <div class="stats-item ${results.skipped > 0 ? 'info' : ''}">
                            <div class="stats-value">${results.skipped || 0}</div>
                            <div class="stats-label">Skipped (Exist)</div>
                        </div>
                        <div class="stats-item ${results.failed > 0 ? 'warning' : ''}">
                            <div class="stats-value">${results.failed}</div>
                            <div class="stats-label">Failed</div>
                        </div>
                        <div class="stats-item">
                            <div class="stats-value">${results.foldersCopied}</div>
                            <div class="stats-label">Folders Created</div>
                        </div>
                    </div>
                    <div class="stats-detail">Success Rate: ${successRate}% of selected photos</div>
                    <div class="stats-detail">Excluded: ${results.excludedPhotos} photos (${excludedRate}% of total)</div>
                </div>
                
                <div class="summary-section">
                    <h4>Performance</h4>
                    <div class="stats-row">
                        <div class="stats-item">
                            <div class="stats-value">${durationText}</div>
                            <div class="stats-label">Duration</div>
                        </div>
                        <div class="stats-item">
                            <div class="stats-value">${mbPerSecond}</div>
                            <div class="stats-label">MB/s</div>
                        </div>
                        <div class="stats-item">
                            <div class="stats-value">${Math.round(results.success / (duration / 60) * 100) / 100}</div>
                            <div class="stats-label">Photos/min</div>
                        </div>
                    </div>
                    <div class="stats-detail">Started: ${startTime}</div>
                    <div class="stats-detail">Completed: ${endTime}</div>
                </div>
            </div>
        `;

        // Add skipped files section if any files were skipped
        if (results.skippedFiles && results.skippedFiles.length > 0) {
            summaryHtml += `
                <div class="summary-section skipped-section">
                    <h4>Skipped Files (Already Exist)</h4>
                    <div class="skipped-files-list">
                        <ul>
                            ${results.skippedFiles.slice(0, 10).map(file => 
                                `<li title="${file.destination}">${file.filename}</li>`
                            ).join('')}
                            ${results.skippedFiles.length > 10 ? 
                                `<li class="more-items">...and ${results.skippedFiles.length - 10} more</li>` : 
                                ''}
                        </ul>
                    </div>
                    <div class="stats-detail">These files already exist in the destination and were not copied</div>
                </div>
            `;
        }

        // Add date/time filter information if it was used
        if (results.dateTimeFilter && (results.dateTimeFilter.startDateTime || results.dateTimeFilter.endDateTime)) {
            let filterText = '';
            
            if (results.dateTimeFilter.startDateTime) {
                filterText += `<div class="stats-detail">Start: ${new Date(results.dateTimeFilter.startDateTime).toLocaleString()}</div>`;
            } else {
                filterText += `<div class="stats-detail">Start: Any</div>`;
            }
            
            if (results.dateTimeFilter.endDateTime) {
                filterText += `<div class="stats-detail">End: ${new Date(results.dateTimeFilter.endDateTime).toLocaleString()}</div>`;
            } else {
                filterText += `<div class="stats-detail">End: Any</div>`;
            }
            
            summaryHtml += `
                <div class="summary-section date-filter-section">
                    <h4>Date/Time Filter</h4>
                    ${filterText}
                    <div class="stats-detail">Only photos within this time range were processed</div>
                </div>
            `;
        }
        
        statsDiv.innerHTML = summaryHtml;
        
        // Show the modal
        document.getElementById('completionModal').classList.add('active');
    }

    async verifyFiles() {
        if (!this.destinationPath) {
            this.log('No destination folder selected', 'error');
            return;
        }

        this.setProgress(0, 'Starting verification...');
        this.isProcessing = true;
        this.updateButtons();

        try {
            const verificationDiv = document.getElementById('verificationStatus');
            verificationDiv.innerHTML = '<div class="verifying">Verifying files, please wait...</div>';
            verificationDiv.style.display = 'block';
            
            // Get date/time range filters (same as used for copying)
            const startDateTime = document.getElementById('startDateTime').value;
            const endDateTime = document.getElementById('endDateTime').value;

            // Verify files
            const results = await this.photoProcessor.verifyFilesCopy(
                this.destinationPath,
                (progress) => {
                    const percentage = Math.round((progress.current / progress.total) * 100);
                    this.setProgress(percentage, `Verifying: ${progress.filename} (${progress.current}/${progress.total})`);
                },
                startDateTime || null,
                endDateTime || null
            );

            // Calculate duration
            const durationSeconds = Math.round((results.endTime - results.startTime) / 1000);
            
            // Show verification results
            const resultHTML = `
                <div class="verification-results">
                    <h4>${results.verified === results.total ? '✅ Verification Successful' : '⚠️ Verification Issues Found'}</h4>
                    
                    <div class="stats-grid">
                        <div class="stats-item">
                            <span class="stats-label">Files Verified:</span>
                            <span class="stats-value">${results.verified}/${results.total}</span>
                        </div>
                        <div class="stats-item">
                            <span class="stats-label">Size Match:</span>
                            <span class="stats-value">${results.sizeMatch}</span>
                        </div>
                        ${results.sizeMismatch > 0 ? `
                        <div class="stats-item warning">
                            <span class="stats-label">Size Mismatch:</span>
                            <span class="stats-value">${results.sizeMismatch}</span>
                        </div>` : ''}
                        ${results.missing > 0 ? `
                        <div class="stats-item warning">
                            <span class="stats-label">Missing Files:</span>
                            <span class="stats-value">${results.missing}</span>
                        </div>` : ''}
                        <div class="stats-item">
                            <span class="stats-label">Duration:</span>
                            <span class="stats-value">${durationSeconds} seconds</span>
                        </div>
                    </div>
                    
                    ${results.errors.length > 0 ? `
                    <div class="verification-errors">
                        <h5>Issues (${results.errors.length}):</h5>
                        <ul class="error-list">
                            ${results.errors.slice(0, 5).map(error => `
                                <li>
                                    <span class="error-file">${path.basename(error.file)}</span>
                                    <span class="error-message">${error.error}</span>
                                </li>
                            `).join('')}
                            ${results.errors.length > 5 ? `<li>... and ${results.errors.length - 5} more issues</li>` : ''}
                        </ul>
                    </div>
                    ` : ''}
                </div>
            `;
            
            verificationDiv.innerHTML = resultHTML;
            this.setProgress(100, 'Verification complete');
            
        } catch (error) {
            console.error('Verification error:', error);
            document.getElementById('verificationStatus').innerHTML = `
                <div class="verification-error">
                    Error during verification: ${error.message || error}
                </div>
            `;
        } finally {
            this.isProcessing = false;
            this.updateButtons();
        }
    }

    async verifyFilesMD5() {
        if (!this.destinationPath) {
            this.log('No destination folder selected', 'error');
            return;
        }

        this.setProgress(0, 'Starting MD5 verification...');
        this.isProcessing = true;
        this.updateButtons();

        try {
            const verificationDiv = document.getElementById('verificationStatus');
            verificationDiv.innerHTML = this.createMD5VerificationUI();
            verificationDiv.style.display = 'block';
            
            // Get date/time range filters (same as used for copying)
            const startDateTime = document.getElementById('startDateTime').value;
            const endDateTime = document.getElementById('endDateTime').value;

            // Update UI elements
            const currentFileElement = document.getElementById('md5-current-file');
            const progressBarElement = document.getElementById('md5-progress-bar');
            const phaseElement = document.getElementById('md5-phase');
            const statsElements = {
                processed: document.getElementById('md5-processed'),
                verified: document.getElementById('md5-verified'),
                failed: document.getElementById('md5-failed')
            };

            let currentStats = { processed: 0, verified: 0, failed: 0 };

            // Verify files with MD5
            const results = await this.photoProcessor.verifyFilesMD5(
                this.destinationPath,
                (progress) => {
                    const percentage = Math.round((progress.current / progress.total) * 100);
                    
                    // Update progress bar
                    progressBarElement.style.width = `${percentage}%`;
                    
                    // Update current file
                    currentFileElement.textContent = progress.filename;
                    
                    // Update phase description
                    let phaseText = '';
                    switch (progress.phase) {
                        case 'checking_file':
                            phaseText = '🔍 Checking file existence...';
                            break;
                        case 'calculating_source_md5':
                            phaseText = '🔢 Calculating source MD5...';
                            break;
                        case 'calculating_target_md5':
                            phaseText = '🔢 Calculating target MD5...';
                            break;
                        case 'md5_match':
                            phaseText = '✅ MD5 verified successfully!';
                            break;
                        case 'md5_mismatch':
                            phaseText = '❌ MD5 mismatch detected!';
                            break;
                        case 'file_missing':
                            phaseText = '🔍 File missing at destination!';
                            break;
                        case 'size_mismatch':
                            phaseText = '📏 File size mismatch detected!';
                            break;
                        case 'error':
                            phaseText = '⚠️ Verification error occurred!';
                            break;
                        default:
                            phaseText = '⚙️ Processing...';
                    }
                    phaseElement.textContent = phaseText;
                    
                    // Update main progress
                    this.setProgress(percentage, `MD5 Verification: ${progress.filename} (${progress.current}/${progress.total})`);
                    
                    // Update live stats (estimate based on progress)
                    const estimatedProcessed = progress.current;
                    statsElements.processed.textContent = estimatedProcessed;
                    
                    // Update verified/failed counts if available in progress
                    if (progress.verified !== undefined) {
                        statsElements.verified.textContent = progress.verified;
                    }
                    if (progress.failed !== undefined) {
                        statsElements.failed.textContent = progress.failed;
                    }
                },
                startDateTime || null,
                endDateTime || null
            );

            // Calculate duration
            const durationSeconds = Math.round((results.endTime - results.startTime) / 1000);
            const durationText = durationSeconds > 60 ? 
                `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s` : 
                `${durationSeconds}s`;
            
            // Show final verification results
            const resultHTML = this.createMD5ResultsHTML(results, durationText);
            verificationDiv.innerHTML = resultHTML;
            this.setProgress(100, 'MD5 verification complete');
            
        } catch (error) {
            console.error('MD5 Verification error:', error);
            document.getElementById('verificationStatus').innerHTML = `
                <div class="verification-error">
                    <h4>❌ MD5 Verification Failed</h4>
                    <p>Error during MD5 verification: ${error.message || error}</p>
                </div>
            `;
        } finally {
            this.isProcessing = false;
            this.updateButtons();
        }
    }

    createMD5VerificationUI() {
        return `
            <div class="md5-verification-container">
                <div class="md5-header">
                    <h4>🔐 MD5 Hash Verification</h4>
                    <div class="md5-description">Performing cryptographic verification of file integrity</div>
                </div>
                
                <div class="md5-progress-section">
                    <div class="md5-current-file-container">
                        <div class="md5-current-file-label">Current File:</div>
                        <div class="md5-current-file" id="md5-current-file">Initializing...</div>
                    </div>
                    
                    <div class="md5-progress-bar-container">
                        <div class="md5-progress-bar-track">
                            <div class="md5-progress-bar" id="md5-progress-bar"></div>
                        </div>
                    </div>
                    
                    <div class="md5-phase" id="md5-phase">🚀 Starting verification...</div>
                </div>
                
                <div class="md5-stats-section">
                    <div class="md5-stat-item">
                        <div class="md5-stat-value" id="md5-processed">0</div>
                        <div class="md5-stat-label">Processed</div>
                    </div>
                    <div class="md5-stat-item">
                        <div class="md5-stat-value" id="md5-verified">0</div>
                        <div class="md5-stat-label">Verified</div>
                    </div>
                    <div class="md5-stat-item">
                        <div class="md5-stat-value" id="md5-failed">0</div>
                        <div class="md5-stat-label">Failed</div>
                    </div>
                </div>
            </div>
        `;
    }

    createMD5ResultsHTML(results, durationText) {
        const successRate = results.total > 0 ? Math.round((results.verified / results.total) * 100) : 0;
        const isFullyVerified = results.verified === results.total && results.failed === 0;
        
        return `
            <div class="md5-results-container">
                <div class="md5-results-header">
                    <h4>${isFullyVerified ? '✅ MD5 Verification Successful' : '⚠️ MD5 Verification Issues Found'}</h4>
                    <div class="md5-success-rate ${isFullyVerified ? 'success' : 'warning'}">
                        ${successRate}% Success Rate
                    </div>
                </div>
                
                <div class="md5-results-grid">
                    <div class="md5-result-item">
                        <div class="md5-result-icon">📊</div>
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.verified}/${results.total}</div>
                            <div class="md5-result-label">Files Verified</div>
                        </div>
                    </div>
                    
                    <div class="md5-result-item">
                        <div class="md5-result-icon">✅</div>
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.md5Match}</div>
                            <div class="md5-result-label">MD5 Match</div>
                        </div>
                    </div>
                    
                    ${results.md5Mismatch > 0 ? `
                    <div class="md5-result-item warning">
                        <div class="md5-result-icon">❌</div>
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.md5Mismatch}</div>
                            <div class="md5-result-label">MD5 Mismatch</div>
                        </div>
                    </div>` : ''}
                    
                    <div class="md5-result-item">
                        <div class="md5-result-icon">📏</div>
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.sizeMatch}</div>
                            <div class="md5-result-label">Size Match</div>
                        </div>
                    </div>
                    
                    ${results.sizeMismatch > 0 ? `
                    <div class="md5-result-item warning">
                        <div class="md5-result-icon">⚠️</div>
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.sizeMismatch}</div>
                            <div class="md5-result-label">Size Mismatch</div>
                        </div>
                    </div>` : ''}
                    
                    ${results.missing > 0 ? `
                    <div class="md5-result-item error">
                        <div class="md5-result-icon">🔍</div>
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.missing}</div>
                            <div class="md5-result-label">Missing Files</div>
                        </div>
                    </div>` : ''}
                    
                    <div class="md5-result-item">
                        <div class="md5-result-icon">⏱️</div>
                        <div class="md5-result-content">
                            <div class="md5-result-value">${durationText}</div>
                            <div class="md5-result-label">Duration</div>
                        </div>
                    </div>
                </div>
                
                ${results.errors.length > 0 ? `
                <div class="md5-errors-section">
                    <h5>🚨 Issues Found (${results.errors.length}):</h5>
                    <div class="md5-error-list">
                        ${results.errors.slice(0, 5).map(error => `
                            <div class="md5-error-item">
                                <div class="md5-error-file">📄 ${error.file.split(/[/\\]/).pop()}</div>
                                <div class="md5-error-message">${error.error}</div>
                            </div>
                        `).join('')}
                        ${results.errors.length > 5 ? `
                        <div class="md5-error-item more">
                            <div class="md5-error-message">... and ${results.errors.length - 5} more issues</div>
                        </div>` : ''}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    savePresetToStorage(preset) {
        try {
            ipcRenderer.invoke('save-preset-to-storage', preset)
                .then(savedPreset => {
                    if (savedPreset) {
                        this.log(`Preset "${preset.name}" saved successfully`, 'success');
                    } else {
                        this.log('Failed to save preset', 'error');
                    }
                })
                .catch(error => {
                    this.log(`Error saving preset: ${error.message}`, 'error');
                });
        } catch (error) {
            this.log(`Error saving preset: ${error.message}`, 'error');
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FotoFusionApp(); // Make globally available for onclick handlers
});
