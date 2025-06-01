const { ipcRenderer } = require('electron');

class PresetManager {
    constructor() {
        this.presets = [];
        this.selectedPresets = new Set();
        this.currentPreset = null;
        this.filteredPresets = [];
        
        this.initializeEventListeners();
        this.loadPresets();
    }

    initializeEventListeners() {
        // Window controls
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            ipcRenderer.send('window-minimize');
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            ipcRenderer.send('window-close');
        });

        // Toolbar buttons
        document.getElementById('newPresetBtn').addEventListener('click', () => {
            this.createNewPreset();
        });

        document.getElementById('duplicateBtn').addEventListener('click', () => {
            this.duplicatePreset();
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            this.deleteSelectedPresets();
        });

        document.getElementById('selectAllBtn').addEventListener('click', () => {
            this.selectAll();
        });

        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            this.deselectAll();
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterPresets(e.target.value);
        });

        // Detail actions
        document.getElementById('usePresetBtn').addEventListener('click', () => {
            this.usePreset();
        });

        document.getElementById('editPresetBtn').addEventListener('click', () => {
            this.editPreset();
        });

        document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
            this.deleteCurrentPreset();
        });

        // Import/Export
        document.getElementById('exportSelectedBtn').addEventListener('click', () => {
            this.exportSelected();
        });

        document.getElementById('exportAllBtn').addEventListener('click', () => {
            this.exportAll();
        });

        document.getElementById('importBtn').addEventListener('click', () => {
            this.importPresets();
        });

        document.getElementById('createFirstPresetBtn').addEventListener('click', () => {
            this.createNewPreset();
        });
    }

    async loadPresets() {
        try {
            this.presets = await ipcRenderer.invoke('load-presets');
            this.filteredPresets = [...this.presets];
            this.updateUI();
        } catch (error) {
            console.error('Error loading presets:', error);
        }
    }

    filterPresets(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        
        if (!term) {
            this.filteredPresets = [...this.presets];
        } else {
            this.filteredPresets = this.presets.filter(preset => 
                preset.name.toLowerCase().includes(term) ||
                preset.folderStructure.toLowerCase().includes(term) ||
                preset.dateFormat.toLowerCase().includes(term) ||
                (preset.folderPrefix && preset.folderPrefix.toLowerCase().includes(term))
            );
        }
        
        this.renderPresetList();
        this.updateSelectionInfo();
    }

    updateUI() {
        this.renderPresetList();
        this.updatePresetCount();
        this.updateSelectionInfo();
        this.updateButtons();
        
        if (this.presets.length === 0) {
            this.showEmptyState();
        } else {
            this.hideEmptyState();
        }
    }

    renderPresetList() {
        const listContainer = document.getElementById('presetList');
        
        if (this.filteredPresets.length === 0) {
            if (this.presets.length === 0) {
                this.showEmptyState();
            } else {
                listContainer.innerHTML = '<div class="no-preset-selected">No presets match your search</div>';
            }
            return;
        }

        listContainer.innerHTML = '';
        
        this.filteredPresets.forEach(preset => {
            const item = this.createPresetItem(preset);
            listContainer.appendChild(item);
        });
    }

    createPresetItem(preset) {
        const item = document.createElement('div');
        item.className = `preset-item ${this.currentPreset?.id === preset.id ? 'selected' : ''}`;
        item.dataset.presetId = preset.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'preset-checkbox';
        checkbox.checked = this.selectedPresets.has(preset.id);
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this.togglePresetSelection(preset.id);
        });

        const content = document.createElement('div');
        content.className = 'preset-item-content';

        const name = document.createElement('div');
        name.className = 'preset-name';
        name.textContent = preset.name;

        const details = document.createElement('div');
        details.className = 'preset-details';
        details.innerHTML = `
            ${this.getStructureDisplayName(preset.folderStructure)} • ${preset.dateFormat}
            ${preset.folderPrefix ? `• Prefix: ${preset.folderPrefix}` : ''}
        `;

        const meta = document.createElement('div');
        meta.className = 'preset-meta';
        const createdDate = new Date(preset.createdAt).toLocaleDateString();
        const lastUsedDate = preset.lastUsed ? new Date(preset.lastUsed).toLocaleDateString() : 'Never';
        meta.innerHTML = `Created: ${createdDate} • Last used: ${lastUsedDate}`;

        content.appendChild(name);
        content.appendChild(details);
        content.appendChild(meta);

        item.appendChild(checkbox);
        item.appendChild(content);

        item.addEventListener('click', () => {
            this.selectPreset(preset);
        });

        return item;
    }

    selectPreset(preset) {
        this.currentPreset = preset;
        this.updatePresetSelection();
        this.showPresetDetails(preset);
    }

    updatePresetSelection() {
        document.querySelectorAll('.preset-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.presetId === this.currentPreset?.id);
        });
    }

    togglePresetSelection(presetId) {
        if (this.selectedPresets.has(presetId)) {
            this.selectedPresets.delete(presetId);
        } else {
            this.selectedPresets.add(presetId);
        }
        
        this.updateSelectionInfo();
        this.updateButtons();
    }

    selectAll() {
        this.selectedPresets.clear();
        this.filteredPresets.forEach(preset => {
            this.selectedPresets.add(preset.id);
        });
        
        document.querySelectorAll('.preset-checkbox').forEach(checkbox => {
            checkbox.checked = true;
        });
        
        this.updateSelectionInfo();
        this.updateButtons();
    }

    deselectAll() {
        this.selectedPresets.clear();
        
        document.querySelectorAll('.preset-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        this.updateSelectionInfo();
        this.updateButtons();
    }

    updateSelectionInfo() {
        const count = this.selectedPresets.size;
        document.getElementById('selectionInfo').textContent = `${count} selected`;
    }

    updatePresetCount() {
        const count = this.presets.length;
        document.getElementById('presetCount').textContent = `${count} preset${count !== 1 ? 's' : ''}`;
    }

    updateButtons() {
        const hasSelection = this.selectedPresets.size > 0;
        const hasCurrent = this.currentPreset !== null;
        
        document.getElementById('duplicateBtn').disabled = !hasCurrent;
        document.getElementById('deleteBtn').disabled = !hasSelection;
        document.getElementById('exportSelectedBtn').disabled = !hasSelection;
        
        const detailActions = document.getElementById('detailActions');
        detailActions.style.display = hasCurrent ? 'flex' : 'none';
    }

    showPresetDetails(preset) {
        const detailContent = document.getElementById('detailContent');
        const detailTitle = document.getElementById('detailTitle');
        
        detailTitle.textContent = preset.name;
        
        detailContent.innerHTML = `
            <div class="detail-section">
                <h4>Organization Settings</h4>
                <div class="detail-property">
                    <span class="detail-label">Folder Structure:</span>
                    <span class="detail-value">${this.getStructureDisplayName(preset.folderStructure)}</span>
                </div>
                <div class="detail-property">
                    <span class="detail-label">Date Format:</span>
                    <span class="detail-value">${preset.dateFormat}</span>
                </div>
                <div class="detail-property">
                    <span class="detail-label">Folder Prefix:</span>
                    <span class="detail-value">${preset.folderPrefix || 'None'}</span>
                </div>
                <div class="detail-property">
                    <span class="detail-label">Preserve Filenames:</span>
                    <span class="detail-value">${preset.preserveOriginal ? 'Yes' : 'No'}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4>Metadata</h4>
                <div class="detail-property">
                    <span class="detail-label">Created:</span>
                    <span class="detail-value">${new Date(preset.createdAt).toLocaleString()}</span>
                </div>
                <div class="detail-property">
                    <span class="detail-label">Last Used:</span>
                    <span class="detail-value">${preset.lastUsed ? new Date(preset.lastUsed).toLocaleString() : 'Never'}</span>
                </div>
                ${preset.importedAt ? `
                <div class="detail-property">
                    <span class="detail-label">Imported:</span>
                    <span class="detail-value">${new Date(preset.importedAt).toLocaleString()}</span>
                </div>
                ` : ''}
            </div>
        `;
        
        this.updateButtons();
    }

    showEmptyState() {
        document.getElementById('presetList').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚙️</div>
                <h3>No Presets Found</h3>
                <p>Create your first preset to get started with quick photo organization setups.</p>
                <button class="btn primary" onclick="presetManager.createNewPreset()">Create First Preset</button>
            </div>
        `;
    }

    hideEmptyState() {
        // Empty state will be removed when renderPresetList is called
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

    async createNewPreset() {
        // This would open a preset creation dialog
        // For now, let's create a sample preset
        const newPreset = {
            name: `New Preset ${this.presets.length + 1}`,
            folderStructure: 'date',
            dateFormat: 'YYYY/MM/DD',
            folderPrefix: '',
            preserveOriginal: true
        };
        
        const savedPreset = await ipcRenderer.invoke('save-preset-to-storage', newPreset);
        if (savedPreset) {
            await this.loadPresets();
            this.selectPreset(savedPreset);
        }
    }

    async duplicatePreset() {
        if (!this.currentPreset) return;
        
        const duplicatedPreset = {
            ...this.currentPreset,
            name: `${this.currentPreset.name} (Copy)`
        };
        
        delete duplicatedPreset.id;
        delete duplicatedPreset.createdAt;
        delete duplicatedPreset.lastUsed;
        delete duplicatedPreset.importedAt;
        
        const savedPreset = await ipcRenderer.invoke('save-preset-to-storage', duplicatedPreset);
        if (savedPreset) {
            await this.loadPresets();
            this.selectPreset(savedPreset);
        }
    }

    async deleteSelectedPresets() {
        if (this.selectedPresets.size === 0) return;
        
        const confirmed = confirm(`Are you sure you want to delete ${this.selectedPresets.size} preset(s)?`);
        if (!confirmed) return;
        
        for (const presetId of this.selectedPresets) {
            await ipcRenderer.invoke('delete-preset', presetId);
        }
        
        this.selectedPresets.clear();
        if (this.currentPreset && this.selectedPresets.has(this.currentPreset.id)) {
            this.currentPreset = null;
        }
        
        await this.loadPresets();
    }

    async deleteCurrentPreset() {
        if (!this.currentPreset) return;
        
        const confirmed = confirm(`Are you sure you want to delete "${this.currentPreset.name}"?`);
        if (!confirmed) return;
        
        await ipcRenderer.invoke('delete-preset', this.currentPreset.id);
        this.currentPreset = null;
        await this.loadPresets();
    }

    async usePreset() {
        if (!this.currentPreset) return;
        
        // Update last used timestamp
        await ipcRenderer.invoke('update-preset-last-used', this.currentPreset.id);
        
        // Send preset data to main window (you'll need to implement this communication)
        window.close();
    }

    editPreset() {
        if (!this.currentPreset) return;
        
        // This would open a preset editing dialog
        alert('Preset editing feature coming soon!');
    }

    async exportSelected() {
        if (this.selectedPresets.size === 0) return;
        
        const presetIds = Array.from(this.selectedPresets);
        const filePath = await ipcRenderer.invoke('export-presets', presetIds);
        
        if (filePath) {
            alert(`Exported ${presetIds.length} preset(s) to ${filePath}`);
        }
    }

    async exportAll() {
        if (this.presets.length === 0) return;
        
        const presetIds = this.presets.map(p => p.id);
        const filePath = await ipcRenderer.invoke('export-presets', presetIds);
        
        if (filePath) {
            alert(`Exported all ${presetIds.length} preset(s) to ${filePath}`);
        }
    }

    async importPresets() {
        const result = await ipcRenderer.invoke('import-presets');
        
        if (result) {
            if (result.success) {
                await this.loadPresets();
                alert(`Import completed!\nImported: ${result.imported}\nSkipped (duplicates): ${result.skipped}\nTotal: ${result.total}`);
            } else {
                alert(`Import failed: ${result.error}`);
            }
        }
    }
}

// Initialize preset manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.presetManager = new PresetManager();
});