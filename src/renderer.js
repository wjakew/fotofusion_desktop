const { ipcRenderer } = require('electron');

// Inline SVG icons for the folder preview tree
const ICON_FOLDER = '<svg class="tree-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2l1.6 1.5H13A1.5 1.5 0 0 1 14.5 5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12v-8.5z"/></svg>';
const ICON_FILE = '<svg class="tree-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M4 1.5h5L12.5 5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z"/><path d="M9 1.5V5h3.5"/></svg>';

class FotoFusionApp {
    constructor() {
        this.photoProcessor = new PhotoProcessor();
        this.sourcePath = null;
        this.destinationPath = null;
        this.isProcessing = false;
        this.selectedStoredPresetId = null;

        // Thumbnail pipeline: object-URL cache + small concurrency queue
        this.thumbCache = new Map();       // photoId -> { url, rotation } | null
        this.thumbPending = new Map();     // photoId -> Promise
        this.thumbQueueActive = 0;
        this.thumbQueueWaiting = [];
        this.thumbObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                this.thumbObserver.unobserve(entry.target);
                this.loadThumbnailInto(entry.target);
            }
        }, { rootMargin: '400px' });

        // View state
        this.viewMode = localStorage.getItem('ff.viewMode') === 'list' ? 'list' : 'grid';
        this.previewDirty = false;

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
        this.applyViewMode();
        this.updateFormHints();
        this.updateButtons();
        this.log('Application started', 'info');

        // Gate enter animations so app launch itself doesn't animate
        setTimeout(() => document.body.classList.add('ready'), 150);

        // First-run welcome tour
        this.onboarding = new OnboardingTour();
        this.onboarding.maybeShowFirstRun();
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

        // Workspace tabs
        document.getElementById('tabPhotosBtn').addEventListener('click', () => {
            this.switchTab('photos');
        });

        document.getElementById('tabPreviewBtn').addEventListener('click', () => {
            this.switchTab('preview');
        });

        // Grid / list view toggle
        document.getElementById('viewGridBtn').addEventListener('click', () => {
            this.setViewMode('grid');
        });

        document.getElementById('viewListBtn').addEventListener('click', () => {
            this.setViewMode('list');
        });

        // Log drawer
        document.getElementById('logToggleBtn').addEventListener('click', () => {
            this.toggleLogDrawer();
        });

        document.getElementById('logCloseBtn').addEventListener('click', () => {
            this.toggleLogDrawer(false);
        });

        // Rail preset shortcuts
        document.getElementById('railSavePresetBtn').addEventListener('click', () => {
            this.showPresetModal('save');
        });

        document.getElementById('railLoadPresetBtn').addEventListener('click', () => {
            this.showStoredPresets();
        });

        document.getElementById('railManagePresetsBtn').addEventListener('click', () => {
            this.openPresetManager();
        });

        // Scroll-edge treatment: shadow under tabs / above action bar while scrollable content is cut off
        const activeScroller = () => document.querySelector('.tab-panel.active #photoList, .tab-panel.active #folderPreview');
        this.updateScrollEdges = () => {
            const scroller = activeScroller();
            const tabs = document.getElementById('workspaceTabs');
            const bar = document.getElementById('actionBar');
            if (!scroller) return;
            tabs.classList.toggle('scrolled', scroller.scrollTop > 0);
            bar.classList.toggle('is-scrollable', scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 1);
        };
        document.getElementById('photoList').addEventListener('scroll', this.updateScrollEdges, { passive: true });
        document.getElementById('folderPreview').addEventListener('scroll', this.updateScrollEdges, { passive: true });

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

        document.getElementById('tabPhotosMenuBtn').addEventListener('click', () => {
            this.switchTab('photos');
            this.closeAllMenus();
        });

        document.getElementById('tabPreviewMenuBtn').addEventListener('click', () => {
            this.switchTab('preview');
            this.closeAllMenus();
        });

        document.getElementById('toggleViewMenuBtn').addEventListener('click', () => {
            this.setViewMode(this.viewMode === 'grid' ? 'list' : 'grid');
            this.closeAllMenus();
        });

        document.getElementById('toggleLogBtn').addEventListener('click', () => {
            this.toggleLogDrawer();
            this.closeAllMenus();
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

        document.getElementById('showTourBtn').addEventListener('click', () => {
            this.closeAllMenus();
            this.onboarding.open();
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

        // ESC: close menus first, then modals, then the log drawer
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.querySelector('.menu-item.active')) {
                this.closeAllMenus();
            } else if (document.querySelector('.modal.active')) {
                this.hideAllModals();
            } else if (document.getElementById('logDrawer').classList.contains('open')) {
                this.toggleLogDrawer(false);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey && (e.key === 'g' || e.key === 'G')) {
                    e.preventDefault();
                    this.setViewMode(this.viewMode === 'grid' ? 'list' : 'grid');
                    return;
                }
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
                    case 'l':
                        e.preventDefault();
                        this.toggleLogDrawer();
                        break;
                    case '1':
                        e.preventDefault();
                        this.switchTab('photos');
                        break;
                    case '2':
                        e.preventDefault();
                        this.switchTab('preview');
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

    switchTab(tab) {
        const isPhotos = tab === 'photos';
        document.getElementById('tabPhotosBtn').classList.toggle('active', isPhotos);
        document.getElementById('tabPreviewBtn').classList.toggle('active', !isPhotos);
        document.getElementById('photosTab').classList.toggle('active', isPhotos);
        document.getElementById('previewTab').classList.toggle('active', !isPhotos);

        // Preview regeneration was skipped while the tab was hidden — catch up now
        if (!isPhotos && this.previewDirty) {
            this.updateFolderPreview();
        }
        if (this.updateScrollEdges) this.updateScrollEdges();
    }

    setViewMode(mode) {
        this.viewMode = mode === 'list' ? 'list' : 'grid';
        localStorage.setItem('ff.viewMode', this.viewMode);
        this.applyViewMode();
        this.updatePhotoList(this.photoProcessor.photos);
    }

    applyViewMode() {
        const isGrid = this.viewMode === 'grid';
        document.getElementById('photoList').classList.toggle('view-grid', isGrid);
        document.getElementById('viewGridBtn').classList.toggle('active', isGrid);
        document.getElementById('viewListBtn').classList.toggle('active', !isGrid);
    }

    toggleLogDrawer(force) {
        const drawer = document.getElementById('logDrawer');
        const open = typeof force === 'boolean' ? force : !drawer.classList.contains('open');
        drawer.classList.toggle('open', open);
        if (open) {
            document.getElementById('logToggleBtn').classList.remove('has-error');
            const logContainer = document.getElementById('logContainer');
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    setProcessing(processing) {
        this.isProcessing = processing;
        document.body.classList.toggle('processing', processing);
        this.updateButtons();
    }

    // --- Thumbnail pipeline -------------------------------------------------

    runThumbTask(task) {
        // Small concurrency limiter so a long scroll doesn't fire hundreds of file reads
        return new Promise((resolve) => {
            const run = async () => {
                this.thumbQueueActive++;
                try {
                    resolve(await task());
                } catch {
                    resolve(null);
                } finally {
                    this.thumbQueueActive--;
                    const next = this.thumbQueueWaiting.shift();
                    if (next) next();
                }
            };
            if (this.thumbQueueActive < 4) {
                run();
            } else {
                this.thumbQueueWaiting.push(run);
            }
        });
    }

    getThumbnail(photo) {
        if (this.thumbCache.has(photo.id)) return Promise.resolve(this.thumbCache.get(photo.id));
        if (this.thumbPending.has(photo.id)) return this.thumbPending.get(photo.id);

        const promise = this.runThumbTask(async () => {
            let entry = null;
            try {
                const buf = await exifr.thumbnail(photo.path);
                if (buf && buf.length) {
                    const url = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
                    let rotation = 0;
                    try {
                        const rot = await exifr.rotation(photo.path);
                        if (rot && rot.deg) rotation = rot.deg;
                    } catch { /* orientation is best-effort */ }
                    entry = { url, rotation };
                }
            } catch { /* no embedded preview (some CR3/ARW) — placeholder stays */ }
            this.thumbCache.set(photo.id, entry);
            this.thumbPending.delete(photo.id);
            return entry;
        });
        this.thumbPending.set(photo.id, promise);
        return promise;
    }

    async loadThumbnailInto(card) {
        const photo = this.photoProcessor.photos.find(p => p.id === card.dataset.photoId);
        if (!photo) return;
        const entry = await this.getThumbnail(photo);
        if (!entry || !card.isConnected) return;
        const img = card.querySelector('img');
        if (!img) return;
        if (entry.rotation === 90 || entry.rotation === 180 || entry.rotation === 270) {
            img.classList.add(`rot-${entry.rotation}`);
        }
        img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
        img.src = entry.url;
    }

    revokeThumbnails() {
        for (const entry of this.thumbCache.values()) {
            if (entry && entry.url) URL.revokeObjectURL(entry.url);
        }
        this.thumbCache.clear();
        this.thumbPending.clear();
        this.thumbQueueWaiting.length = 0;
        this.thumbObserver.disconnect();
    }

    // --- Modals -------------------------------------------------------------

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('closing');
        modal.classList.add('active');
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal.classList.contains('active')) return;
        modal.classList.remove('active');
        modal.classList.add('closing');
        setTimeout(() => modal.classList.remove('closing'), 150);
    }

    hideAllModals() {
        document.querySelectorAll('.modal.active').forEach(modal => {
            this.hideModal(modal.id);
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
• Ctrl+L - Toggle Log
• Ctrl+1 / Ctrl+2 - Photos / Preview Tab
• Ctrl+Shift+G - Grid / List View
• F5 - Refresh Preview
• ESC - Close Menus/Modals/Log
        `.trim();

        this.log(shortcuts, 'info');
        this.toggleLogDrawer(true);
    }

    async selectFolder(type) {
        try {
            const folderPath = await ipcRenderer.invoke('select-folder', type);
            if (folderPath) {
                if (type === 'source') {
                    this.sourcePath = folderPath;
                    const el = document.getElementById('sourcePath');
                    el.textContent = folderPath;
                    el.classList.remove('empty');
                    el.title = folderPath;
                    document.getElementById('scanBtn').disabled = false;
                    this.log(`Source folder selected: ${folderPath}`, 'info');
                } else {
                    this.destinationPath = folderPath;
                    const el = document.getElementById('destPath');
                    el.textContent = folderPath;
                    el.classList.remove('empty');
                    el.title = folderPath;
                    this.log(`Destination folder selected: ${folderPath}`, 'info');
                }
                this.updateFolderPreview();
                this.updateButtons();
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
        this.setProcessing(true);
        this.revokeThumbnails();
        this.switchTab('photos');

        try {
            // Get current settings for destination checking
            const structureType = document.getElementById('folderStructure').value;
            const prefix = document.getElementById('folderPrefix').value.trim();
            const dateFormat = document.getElementById('dateFormat').value;

            const photos = await this.photoProcessor.scanFolder(
                this.sourcePath,
                (progress) => {
                    const percentage = Math.round((progress.current / progress.total) * 100);
                    this.setProgress(percentage, `Scanning: ${progress.filename} (${progress.current}/${progress.total})`);
                },
                this.destinationPath, // Pass destination path for existence checking
                structureType,
                prefix,
                dateFormat
            );

            // Initialize exclusion stats after scan
            this.updatePhotoList(photos);
            this.updateFolderPreview();
            // Count unique photo names for UI display
            const uniquePhotoCount = this.photoProcessor.getUniquePhotoCount(photos);

            // Count existing photos for logging
            const existingPhotos = photos.filter(p => p.existsInDestination).length;
            const logMessage = existingPhotos > 0
                ? `Scan complete: Found ${uniquePhotoCount} photos (${photos.length} files), ${existingPhotos} already exist in destination`
                : `Scan complete: Found ${uniquePhotoCount} photos (${photos.length} files)`;

            this.log(logMessage, 'success');
            this.setProgress(100, `Scan complete: ${uniquePhotoCount} photos found`);

            // Rail quick stats: file count + total size
            const totalBytes = photos.reduce((sum, p) => sum + (p.metadata.fileSize || 0), 0);
            const totalGB = totalBytes / (1024 * 1024 * 1024);
            const sizeText = totalGB >= 1 ? `${totalGB.toFixed(1)} GB` : `${Math.round(totalBytes / (1024 * 1024))} MB`;
            document.getElementById('sourceStats').textContent = `${photos.length} files · ${sizeText}`;

            if (photos.length > 0 && this.destinationPath) {
                document.getElementById('startCopyBtn').disabled = false;
            }
        } catch (error) {
            this.log(`Error scanning photos: ${error.message}`, 'error');
            this.setProgress(0, 'Scan failed');
        } finally {
            this.setProcessing(false);
        }
    }

    async startCopyProcess() {
        if (!this.sourcePath || !this.destinationPath || this.photoProcessor.photos.length === 0) {
            this.log('Please select folders and scan for photos first', 'error');
            return;
        }

        this.setProgress(0, 'Starting copy process...');
        this.setProcessing(true);

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
            this.setProcessing(false);
        }
    }

    updatePhotoList(photos) {
        const photoList = document.getElementById('photoList');
        const unknownCameraSection = document.getElementById('unknownCameraSection');
        if (!photoList || !unknownCameraSection) return;

        this.thumbObserver.disconnect();

        if (photos.length === 0) {
            photoList.innerHTML = `
                <div class="no-photos">
                    <h4>No photos yet</h4>
                    <p>Choose a source folder in the left rail, then press Scan to find your photos.</p>
                </div>
            `;
            this.updateExclusionStats();
            this.updateTabCount();
            return;
        }

        photoList.innerHTML = '';
        const isGrid = this.viewMode === 'grid';
        photos.forEach((photo) => {
            const item = isGrid ? this.buildPhotoCard(photo) : this.buildPhotoListItem(photo);
            photoList.appendChild(item);
        });

        this.updateExclusionStats();
        this.updateTabCount();
        if (this.updateScrollEdges) this.updateScrollEdges();

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

    buildPhotoListItem(photo) {
        const item = document.createElement('div');
        const isExcluded = this.photoProcessor.isPhotoExcluded(photo.id);
        const existsInDest = photo.existsInDestination || false;

        let photoClasses = 'photo-item';
        if (isExcluded) photoClasses += ' excluded';
        if (existsInDest) photoClasses += ' exists-in-destination';

        item.className = photoClasses;
        item.dataset.photoId = photo.id;

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

        const existsIndicator = existsInDest ? ' ✓' : '';
        const metadataText = existsInDest
            ? `${photo.metadata.camera} | ${photo.metadata.lens} | ${date} | ${sizeKB}KB | Already exists`
            : `${photo.metadata.camera} | ${photo.metadata.lens} | ${date} | ${sizeKB}KB`;

        photoInfo.innerHTML = `
            <div class="photo-filename">${photo.filename}${existsIndicator}</div>
            <div class="photo-metadata">
                ${metadataText}
            </div>
        `;

        item.appendChild(checkbox);
        item.appendChild(photoInfo);

        // Allow clicking on the item to toggle selection
        item.addEventListener('click', (e) => {
            if (e.target === checkbox) return;
            this.togglePhotoSelection(photo.id);
        });

        return item;
    }

    buildPhotoCard(photo) {
        const card = document.createElement('div');
        const isExcluded = this.photoProcessor.isPhotoExcluded(photo.id);
        const existsInDest = photo.existsInDestination || false;

        card.className = `photo-card${isExcluded ? ' excluded' : ''}${existsInDest ? ' exists-in-destination' : ''}`;
        card.dataset.photoId = photo.id;
        card.title = `${photo.filename}\n${photo.metadata.camera} · ${photo.metadata.lens}${existsInDest ? '\nAlready exists in destination' : ''}`;

        const ext = (photo.filename.split('.').pop() || '').toUpperCase();
        card.innerHTML = `
            <div class="card-placeholder">${ext}</div>
            <img alt="" draggable="false">
            <div class="card-name">${photo.filename}</div>
            <label class="card-check"><input type="checkbox" ${isExcluded ? '' : 'checked'}></label>
            ${existsInDest ? '<span class="card-badge" title="Already exists in destination"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg></span>' : ''}
        `;

        const checkbox = card.querySelector('.card-check input');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this.togglePhotoSelection(photo.id);
        });
        card.querySelector('.card-check').addEventListener('click', (e) => e.stopPropagation());

        card.addEventListener('click', () => {
            this.togglePhotoSelection(photo.id);
        });

        // Cached thumbnails apply immediately; the rest lazy-load on scroll
        const cached = this.thumbCache.get(photo.id);
        if (cached) {
            const img = card.querySelector('img');
            if (cached.rotation === 90 || cached.rotation === 180 || cached.rotation === 270) {
                img.classList.add(`rot-${cached.rotation}`);
            }
            img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
            img.src = cached.url;
        } else if (cached === undefined) {
            this.thumbObserver.observe(card);
        }

        return card;
    }

    updateTabCount() {
        const el = document.getElementById('tabPhotosCount');
        if (!el) return;
        const count = this.photoProcessor.photos.length;
        el.textContent = count > 0 ? ` ${count}` : '';
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

        // In-place update — avoids rebuilding (and re-loading) the whole list per click
        const el = document.querySelector(`#photoList [data-photo-id="${photoId}"]`);
        if (el) {
            el.classList.toggle('excluded', isExcluded);
            const checkbox = el.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = !isExcluded;
        }
        this.updateExclusionStats();
        this.updateFolderPreview();

        const photo = this.photoProcessor.photos.find(p => p.id === photoId);
        if (photo) {
            this.log(`${isExcluded ? 'Excluded' : 'Included'} photo: ${photo.filename}`, 'info');
        }
    }

    selectAllPhotos(select) {
        if (!this.photoProcessor || this.photoProcessor.photos.length === 0) {
            return;
        }

        for (const photo of this.photoProcessor.photos) {
            if (select && this.photoProcessor.isPhotoExcluded(photo.id)) {
                // Include photo (remove from exclusion)
                this.photoProcessor.togglePhotoExclusion(photo.id);
            } else if (!select && !this.photoProcessor.isPhotoExcluded(photo.id)) {
                // Exclude photo (add to exclusion)
                this.photoProcessor.togglePhotoExclusion(photo.id);
            }
        }

        this.updatePhotoList(this.photoProcessor.photos);
        this.updateFolderPreview();

        const action = select ? 'included' : 'excluded';
        this.log(`All photos ${action}`, 'info');
    }

    invertPhotoSelection() {
        if (!this.photoProcessor || this.photoProcessor.photos.length === 0) {
            return;
        }

        for (const photo of this.photoProcessor.photos) {
            this.photoProcessor.togglePhotoExclusion(photo.id);
        }

        this.updatePhotoList(this.photoProcessor.photos);
        this.updateFolderPreview();
        this.log('Photo selection inverted', 'info');
    }

    selectAllFolders(select) {
        if (!this.photoProcessor || Object.keys(this.photoProcessor.folderStructure).length === 0) {
            return;
        }

        for (const folderPath of Object.keys(this.photoProcessor.folderStructure)) {
            const isCurrentlyExcluded = this.photoProcessor.isFolderExcluded(folderPath);

            if (select && isCurrentlyExcluded) {
                // Include folder (remove from exclusion)
                this.photoProcessor.toggleFolderExclusion(folderPath);
            } else if (!select && !isCurrentlyExcluded) {
                // Exclude folder (add to exclusion)
                this.photoProcessor.toggleFolderExclusion(folderPath);
            }
        }

        this.updateFolderPreview();

        const action = select ? 'included' : 'excluded';
        this.log(`All folders ${action}`, 'info');
    }

    toggleFolderSelection(folderPath) {
        if (!folderPath || !this.photoProcessor) {
            console.error('No folder path provided or photoProcessor not available');
            return;
        }

        const isExcluded = this.photoProcessor.toggleFolderExclusion(folderPath);
        this.updateFolderPreview();

        const action = isExcluded ? 'excluded' : 'included';
        this.log(`Folder ${action}: ${folderPath}`, 'info');
    }

    updateFolderPreview() {
        const preview = document.getElementById('folderPreview');

        if (!this.sourcePath || !this.destinationPath || this.photoProcessor.photos.length === 0) {
            preview.innerHTML = `
                <div class="no-preview">
                    <h4>Nothing to preview</h4>
                    <p>Select source and destination folders, then scan — the destination folder structure will appear here.</p>
                </div>
            `;
            this.previewDirty = false;
            return;
        }

        // Skip the expensive DOM rebuild while the Preview tab is hidden;
        // switchTab() catches up when the tab becomes visible again.
        if (!document.getElementById('previewTab').classList.contains('active')) {
            this.previewDirty = true;
            this.updateExclusionStats();
            return;
        }
        this.previewDirty = false;

        const structureType = document.getElementById('folderStructure').value;
        const prefix = document.getElementById('folderPrefix').value.trim();
        const dateFormat = document.getElementById('dateFormat').value;
        const startDateTime = document.getElementById('startDateTime').value || null;
        const endDateTime = document.getElementById('endDateTime').value || null;

        // Generate structure for preview with date range filtering
        const structure = this.photoProcessor.generateFolderStructure(structureType, prefix, dateFormat, startDateTime, endDateTime);
        
        let html = '<div class="folder-tree">';
        html += `<div class="folder-item folder">${ICON_FOLDER} ${this.destinationPath}</div>`;
        
        for (const [folderPath, photos] of Object.entries(structure)) {
            const folders = folderPath.split(require('path').sep);
            const isExcluded = this.photoProcessor.isFolderExcluded(folderPath);
            const excludedPhotos = photos.filter(photo => this.photoProcessor.isPhotoExcluded(photo.id));
            const includedPhotos = photos.filter(photo => !this.photoProcessor.isPhotoExcluded(photo.id));

            // Count unique photo names for display
            const uniqueIncludedCount = this.photoProcessor.getUniquePhotoCount(includedPhotos);
            const uniqueTotalCount = this.photoProcessor.getUniquePhotoCount(photos);

            // Count existing photos in this folder
            const existingPhotos = photos.filter(photo => photo.existsInDestination && !this.photoProcessor.isPhotoExcluded(photo.id));
            const existingCount = this.photoProcessor.getUniquePhotoCount(existingPhotos);

            // Create folder hierarchy
            folders.forEach((folder, index) => {
                const indent = '  '.repeat(index + 1);
                const currentFolderPath = folders.slice(0, index + 1).join(require('path').sep);
                const isFolderExcluded = this.photoProcessor.isFolderExcluded(folderPath);

                if (index === folders.length - 1) {
                    // This is the final folder - add checkbox and stats with existence info
                    const hasExistingPhotos = existingCount > 0;
                    const existingIndicator = hasExistingPhotos ? ' ✓' : '';
                    const folderClasses = `folder ${isFolderExcluded ? 'excluded' : ''} ${hasExistingPhotos ? 'has-existing' : ''}`;

                    let statsText = `${uniqueIncludedCount}/${uniqueTotalCount} photos`;
                    if (hasExistingPhotos) {
                        statsText += ` (${existingCount} exist)`;
                    }

                    html += `
                        <div class="folder-item ${folderClasses}"
                             data-folder-path="${folderPath}">
                            ${indent}
                            <input type="checkbox" class="folder-checkbox"
                                   ${!isFolderExcluded ? 'checked' : ''}
                                   data-folder-path="${folderPath}">
                            ${ICON_FOLDER} ${folder}${existingIndicator}
                            <span class="folder-stats">${statsText}</span>
                        </div>
                    `;
                } else {
                    html += `<div class="folder-item folder">${indent}${ICON_FOLDER} ${folder}</div>`;
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
                            ${indent}${ICON_FILE} ${photo.filename}
                        </div>
                    `;
                }
                
                if (excludedPhotos.length > 0) {
                    const indent = '  '.repeat(folders.length + 1);
                    const uniqueExcludedCount = this.photoProcessor.getUniquePhotoCount(excludedPhotos);
                    html += `<div class="folder-item file excluded">${indent}... and ${uniqueExcludedCount} excluded photos</div>`;
                }
                
                if (includedPhotos.length > filesToShow) {
                    const indent = '  '.repeat(folders.length + 1);
                    const remainingUniqueCount = uniqueIncludedCount - Math.min(filesToShow, uniqueIncludedCount);
                    if (remainingUniqueCount > 0) {
                        html += `<div class="folder-item file">${indent}... and ${remainingUniqueCount} more photos</div>`;
                    }
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

        // Errors shouldn't disappear silently into a closed drawer
        if (type === 'error' && !document.getElementById('logDrawer').classList.contains('open')) {
            document.getElementById('logToggleBtn').classList.add('has-error');
        }
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

        // Action-bar status summary — always answers "where am I / what's next?"
        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) {
            if (this.isProcessing) {
                statusSummary.textContent = 'Working…';
            } else if (!this.sourcePath) {
                statusSummary.textContent = 'Select a source folder to begin';
            } else if (!hasPhotos) {
                statusSummary.textContent = this.destinationPath
                    ? 'Ready to scan'
                    : 'Ready to scan · select a destination to enable copying';
            } else {
                const stats = this.photoProcessor.getExclusionStats();
                let text = `${stats.total} photos · ${stats.included} selected`;
                if (stats.totalExcluded > 0) text += ` · ${stats.totalExcluded} excluded`;
                if (!this.destinationPath) text += ' · select a destination to copy';
                statusSummary.textContent = text;
            }
        }

        // Explain WHY Start Copy is disabled instead of leaving a dead button
        if (startBtn.disabled && !this.isProcessing) {
            if (!this.sourcePath) {
                startBtn.title = 'Select a source folder first';
            } else if (!this.destinationPath) {
                startBtn.title = 'Select a destination folder first';
            } else if (!hasPhotos) {
                startBtn.title = 'Scan for photos first';
            } else {
                startBtn.title = 'No photos selected — include at least one photo';
            }
        } else {
            startBtn.title = '';
        }

        // Destination quick stats (folder count from the last generated structure)
        const destStats = document.getElementById('destStats');
        if (destStats) {
            const folderCount = Object.keys(this.photoProcessor.folderStructure || {}).length;
            destStats.textContent = hasPhotos && folderCount > 0
                ? `${folderCount} folder${folderCount === 1 ? '' : 's'} will be created`
                : '';
        }
    }

    clearAll() {
        if (this.isProcessing) return;
        
        this.sourcePath = null;
        this.destinationPath = null;
        this.selectedStoredPresetId = null;
        this.photoProcessor.photos = [];
        this.photoProcessor.folderStructure = {};
        this.photoProcessor.clearExclusions();
        this.revokeThumbnails();
        this.previewDirty = false;

        const sourcePathEl = document.getElementById('sourcePath');
        sourcePathEl.textContent = 'No folder selected';
        sourcePathEl.classList.add('empty');
        sourcePathEl.title = '';
        const destPathEl = document.getElementById('destPath');
        destPathEl.textContent = 'No folder selected';
        destPathEl.classList.add('empty');
        destPathEl.title = '';
        document.getElementById('sourceStats').textContent = '';
        document.getElementById('destStats').textContent = '';
        document.getElementById('photoCount').textContent = '0 photos';
        document.getElementById('unknownCameraSection').style.display = 'none';
        document.getElementById('photoList').innerHTML = `
            <div class="no-photos">
                <h4>No photos yet</h4>
                <p>Choose a source folder in the left rail, then press Scan to find your photos.</p>
            </div>
        `;
        document.getElementById('folderPreview').innerHTML = `
            <div class="no-preview">
                <h4>Nothing to preview</h4>
                <p>Select source and destination folders, then scan — the destination folder structure will appear here.</p>
            </div>
        `;
        this.updateTabCount();
        this.switchTab('photos');
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
                        folderStatus = ' • <span class="status-ok">Folder exists</span>';
                    } else {
                        folderStatus = ' • <span class="status-err">Folder missing</span>';
                    }
                } catch (error) {
                    folderStatus = ' • <span class="status-warn">Folder check failed</span>';
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
                <h3>Collection Overview</h3>
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
                    <h4>Cameras</h4>
                    ${this.generateStatsBarChart(stats.cameras)}
                </div>

                <div class="stats-section">
                    <h4>Lenses</h4>
                    ${this.generateStatsBarChart(stats.lenses)}
                </div>

                <div class="stats-section">
                    <h4>Apertures</h4>
                    ${this.generateStatsBarChart(stats.apertures)}
                </div>

                <div class="stats-section">
                    <h4>ISO</h4>
                    ${this.generateStatsBarChart(stats.isoValues)}
                </div>

                <div class="stats-section">
                    <h4>Shutter Speeds</h4>
                    ${this.generateStatsBarChart(stats.shutterSpeeds)}
                </div>

                <div class="stats-section">
                    <h4>Focal Lengths</h4>
                    ${this.generateStatsBarChart(stats.focalLengths)}
                </div>

                <div class="stats-section">
                    <h4>File Sizes</h4>
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
                    <h4>Monthly Distribution</h4>
                    ${stats.dateRange ? this.generateStatsBarChart(stats.dateRange.monthlyDistribution) : '<div class="stats-item">No date information available</div>'}
                </div>

                <div class="stats-section">
                    <h4>File Formats</h4>
                    ${this.generateStatsBarChart(stats.fileFormats)}
                </div>

                <div class="stats-section">
                    <h4>Aspect Ratios</h4>
                    ${this.generateStatsBarChart(stats.aspectRatios)}
                </div>

                <div class="stats-section">
                    <h4>Locations</h4>
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
        this.showModal('completionModal');
    }

    async verifyFiles() {
        if (!this.destinationPath) {
            this.log('No destination folder selected', 'error');
            return;
        }

        this.setProgress(0, 'Starting verification...');
        this.setProcessing(true);

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
                    <h4 class="${results.verified === results.total ? 'status-ok' : 'status-warn'}">${results.verified === results.total ? 'Verification successful' : 'Verification issues found'}</h4>
                    
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

            // Auto-scroll to verification results
            this.scrollToVerificationResults();
            
        } catch (error) {
            console.error('Verification error:', error);
            document.getElementById('verificationStatus').innerHTML = `
                <div class="verification-error">
                    Error during verification: ${error.message || error}
                </div>
            `;
        } finally {
            this.setProcessing(false);
        }
    }

    async verifyFilesMD5() {
        if (!this.destinationPath) {
            this.log('No destination folder selected', 'error');
            return;
        }

        this.setProgress(0, 'Starting MD5 verification...');
        this.setProcessing(true);

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
                            phaseText = 'Checking file existence...';
                            break;
                        case 'calculating_source_md5':
                            phaseText = 'Calculating source MD5...';
                            break;
                        case 'calculating_target_md5':
                            phaseText = 'Calculating target MD5...';
                            break;
                        case 'md5_match':
                            phaseText = 'MD5 verified successfully!';
                            break;
                        case 'md5_mismatch':
                            phaseText = 'MD5 mismatch detected!';
                            break;
                        case 'file_missing':
                            phaseText = 'File missing at destination!';
                            break;
                        case 'size_mismatch':
                            phaseText = 'File size mismatch detected!';
                            break;
                        case 'error':
                            phaseText = 'Verification error occurred!';
                            break;
                        default:
                            phaseText = 'Processing...';
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

            // Auto-scroll to verification results
            this.scrollToVerificationResults();
            
        } catch (error) {
            console.error('MD5 Verification error:', error);
            document.getElementById('verificationStatus').innerHTML = `
                <div class="verification-error">
                    <h4>MD5 Verification Failed</h4>
                    <p>Error during MD5 verification: ${error.message || error}</p>
                </div>
            `;
        } finally {
            this.setProcessing(false);
        }
    }

    createMD5VerificationUI() {
        return `
            <div class="md5-verification-container">
                <div class="md5-header">
                    <h4>MD5 Hash Verification</h4>
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

                    <div class="md5-phase" id="md5-phase">Starting verification...</div>
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
                    <h4>${isFullyVerified ? 'MD5 Verification Successful' : 'MD5 Verification Issues Found'}</h4>
                    <div class="md5-success-rate ${isFullyVerified ? 'success' : 'warning'}">
                        ${successRate}% Success Rate
                    </div>
                </div>

                <div class="md5-results-grid">
                    <div class="md5-result-item">
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.verified}/${results.total}</div>
                            <div class="md5-result-label">Files Verified</div>
                        </div>
                    </div>

                    <div class="md5-result-item">
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.md5Match}</div>
                            <div class="md5-result-label">MD5 Match</div>
                        </div>
                    </div>

                    ${results.md5Mismatch > 0 ? `
                    <div class="md5-result-item warning">
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.md5Mismatch}</div>
                            <div class="md5-result-label">MD5 Mismatch</div>
                        </div>
                    </div>` : ''}

                    <div class="md5-result-item">
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.sizeMatch}</div>
                            <div class="md5-result-label">Size Match</div>
                        </div>
                    </div>

                    ${results.sizeMismatch > 0 ? `
                    <div class="md5-result-item warning">
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.sizeMismatch}</div>
                            <div class="md5-result-label">Size Mismatch</div>
                        </div>
                    </div>` : ''}

                    ${results.missing > 0 ? `
                    <div class="md5-result-item error">
                        <div class="md5-result-content">
                            <div class="md5-result-value">${results.missing}</div>
                            <div class="md5-result-label">Missing Files</div>
                        </div>
                    </div>` : ''}

                    <div class="md5-result-item">
                        <div class="md5-result-content">
                            <div class="md5-result-value">${durationText}</div>
                            <div class="md5-result-label">Duration</div>
                        </div>
                    </div>
                </div>

                ${results.errors.length > 0 ? `
                <div class="md5-errors-section">
                    <h5>Issues Found (${results.errors.length}):</h5>
                    <div class="md5-error-list">
                        ${results.errors.slice(0, 5).map(error => `
                            <div class="md5-error-item">
                                <div class="md5-error-file">${error.file.split(/[/\\]/).pop()}</div>
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

    scrollToVerificationResults() {
        // Auto-scroll to verification results in the completion modal
        setTimeout(() => {
            const verificationDiv = document.getElementById('verificationStatus');
            const completionModal = document.getElementById('completionModal');

            if (verificationDiv && completionModal && completionModal.classList.contains('active')) {
                const modalBody = completionModal.querySelector('.modal-body');

                if (modalBody) {
                    // Scroll the modal body to bring verification results into view
                    const verificationTop = verificationDiv.offsetTop - modalBody.offsetTop;
                    modalBody.scrollTo({
                        top: verificationTop - 20, // Add some padding
                        behavior: 'smooth'
                    });

                    // Add a subtle highlight animation to draw attention
                    verificationDiv.style.animation = 'verification-highlight 2s ease-out';
                    setTimeout(() => {
                        verificationDiv.style.animation = '';
                    }, 2000);
                }
            }
        }, 100); // Small delay to ensure DOM is updated
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
