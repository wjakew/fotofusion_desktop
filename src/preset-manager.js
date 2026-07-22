// Preset Manager overlay — full CRUD surface for stored presets.
// Lives inside the main window as a standard .modal; FotoFusionApp owns the
// instance and opens it via app.presetManager.open().
// (renderer.js already declares ipcRenderer in this shared scope)
const pmIpc = require('electron').ipcRenderer;

const PM_ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.3 2.1l2.6 2.6L5.2 13.4l-3.2.6.6-3.2 8.7-8.7z"/></svg>';
const PM_ICON_COPY = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';
const PM_ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M5.5 4.5v-2h5v2M4 4.5l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-9M6.5 7.5v4M9.5 7.5v4"/></svg>';
const PM_ICON_GEAR = '<svg width="48" height="48" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/></svg>';

class PresetManagerOverlay {
    constructor(app) {
        this.app = app;
        this.presets = [];
        this.searchTerm = '';
        this.editingId = null;     // preset id being edited, null = creating
        this.confirmingId = null;  // preset id with the inline delete confirm open
        this.statusTimer = null;

        this.el = {
            modal: document.getElementById('presetManagerModal'),
            title: document.getElementById('pmTitle'),
            count: document.getElementById('pmCount'),
            backBtn: document.getElementById('pmBackBtn'),
            closeBtn: document.getElementById('pmCloseBtn'),
            listView: document.getElementById('pmListView'),
            editView: document.getElementById('pmEditView'),
            search: document.getElementById('pmSearch'),
            list: document.getElementById('pmList'),
            listFooter: document.getElementById('pmListFooter'),
            editFooter: document.getElementById('pmEditFooter'),
            status: document.getElementById('pmStatus'),
            editHint: document.getElementById('pmEditHint'),
            importBtn: document.getElementById('pmImportBtn'),
            exportAllBtn: document.getElementById('pmExportAllBtn'),
            newBtn: document.getElementById('pmNewBtn'),
            cancelBtn: document.getElementById('pmEditCancelBtn'),
            saveBtn: document.getElementById('pmEditSaveBtn'),
            name: document.getElementById('pmName'),
            nameHint: document.getElementById('pmNameHint'),
            structure: document.getElementById('pmStructure'),
            dateFormat: document.getElementById('pmDateFormat'),
            prefix: document.getElementById('pmPrefix'),
            preserve: document.getElementById('pmPreserve'),
            destPath: document.getElementById('pmDestPath'),
            destChooseBtn: document.getElementById('pmDestChooseBtn'),
            destClearBtn: document.getElementById('pmDestClearBtn'),
            start: document.getElementById('pmStart'),
            end: document.getElementById('pmEnd')
        };

        this.destinationPath = null; // editor state

        this.populateSelectsFromSettingsPanel();
        this.initializeEventListeners();
    }

    // The settings panel already holds the canonical option lists — clone them
    // instead of duplicating 17 <option> tags
    populateSelectsFromSettingsPanel() {
        for (const [sourceId, target] of [['folderStructure', this.el.structure], ['dateFormat', this.el.dateFormat]]) {
            const source = document.getElementById(sourceId);
            for (const opt of source.options) {
                target.appendChild(new Option(opt.textContent, opt.value));
            }
        }
    }

    initializeEventListeners() {
        this.el.closeBtn.addEventListener('click', () => this.app.hideModal('presetManagerModal'));
        this.el.backBtn.addEventListener('click', () => this.showList());
        this.el.cancelBtn.addEventListener('click', () => this.showList());
        this.el.newBtn.addEventListener('click', () => this.showEditor(null));
        this.el.saveBtn.addEventListener('click', () => this.save());
        this.el.importBtn.addEventListener('click', () => this.import());
        this.el.exportAllBtn.addEventListener('click', () => this.exportAll());

        this.el.search.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.renderList();
        });

        this.el.name.addEventListener('input', () => {
            this.el.nameHint.textContent = '';
        });

        this.el.destChooseBtn.addEventListener('click', async () => {
            const folderPath = await pmIpc.invoke('select-folder', 'destination');
            if (folderPath) {
                this.destinationPath = folderPath;
                this.renderDestPath();
            }
        });

        this.el.destClearBtn.addEventListener('click', () => {
            this.destinationPath = null;
            this.renderDestPath();
        });
    }

    // --- Open / view switching ---------------------------------------------

    async open() {
        this.searchTerm = '';
        this.el.search.value = '';
        this.confirmingId = null;
        this.switchView('list', { animate: false });
        await this.loadPresets();
        this.renderList({ stagger: true });
        this.app.showModal('presetManagerModal');
        this.el.search.focus();
    }

    // Returns true when Esc was consumed (renderer's Esc chain checks this
    // before closing the modal outright)
    handleEscape() {
        if (!this.el.modal.classList.contains('active')) return false;
        if (this.confirmingId) {
            this.confirmingId = null;
            this.renderList();
            return true;
        }
        if (!this.el.editView.hidden) {
            this.showList();
            return true;
        }
        return false;
    }

    switchView(view, { animate = true } = {}) {
        const isList = view === 'list';
        this.el.listView.hidden = !isList;
        this.el.editView.hidden = isList;
        this.el.listFooter.hidden = !isList;
        this.el.editFooter.hidden = isList;
        this.el.backBtn.hidden = isList;
        if (isList) {
            this.el.title.textContent = 'Presets';
            this.updateCount();
        } else {
            this.el.count.textContent = '';
        }

        if (animate) {
            const incoming = isList ? this.el.listView : this.el.editView;
            incoming.classList.remove('entering');
            void incoming.offsetWidth; // restart the animation
            incoming.classList.add('entering');
            incoming.addEventListener('animationend', () => incoming.classList.remove('entering'), { once: true });
        }
    }

    async showList() {
        this.switchView('list');
        await this.loadPresets();
        this.renderList();
        this.el.search.focus();
    }

    showEditor(preset) {
        this.editingId = preset ? preset.id : null;
        this.el.title.textContent = preset ? 'Edit Preset' : 'New Preset';
        this.el.nameHint.textContent = '';

        if (preset) {
            this.el.name.value = preset.name;
            this.el.structure.value = preset.folderStructure || 'date';
            this.el.dateFormat.value = preset.dateFormat || 'YYYY/MM/DD';
            this.el.prefix.value = preset.folderPrefix || '';
            this.el.preserve.checked = preset.preserveOriginal !== false;
            this.destinationPath = preset.destinationPath || null;
            this.el.start.value = preset.startDateTime || '';
            this.el.end.value = preset.endDateTime || '';
            this.el.editHint.textContent = '';
            this.el.editHint.classList.remove('visible');
        } else {
            // Pre-fill from the current settings panel — a new preset usually
            // captures the setup you just dialed in
            this.el.name.value = '';
            this.el.structure.value = document.getElementById('folderStructure').value;
            this.el.dateFormat.value = document.getElementById('dateFormat').value;
            this.el.prefix.value = document.getElementById('folderPrefix').value;
            this.el.preserve.checked = document.getElementById('preserveOriginal').checked;
            this.destinationPath = this.app.destinationPath || null;
            this.el.start.value = document.getElementById('startDateTime').value || '';
            this.el.end.value = document.getElementById('endDateTime').value || '';
            this.el.editHint.textContent = 'Pre-filled from your current setup';
            this.el.editHint.classList.add('visible');
        }

        this.renderDestPath();
        this.switchView('editor');
        this.el.name.focus();
    }

    renderDestPath() {
        const has = !!this.destinationPath;
        this.el.destPath.textContent = has ? this.destinationPath : 'No folder set';
        this.el.destPath.classList.toggle('empty', !has);
        this.el.destClearBtn.hidden = !has;
    }

    // --- Data ---------------------------------------------------------------

    async loadPresets() {
        try {
            this.presets = await pmIpc.invoke('load-presets');
        } catch (error) {
            this.presets = [];
            this.app.log(`Error loading presets: ${error.message}`, 'error');
        }
    }

    getFiltered() {
        const term = this.searchTerm.toLowerCase().trim();
        if (!term) return [...this.presets];
        return this.presets.filter(preset =>
            preset.name.toLowerCase().includes(term) ||
            preset.folderStructure.toLowerCase().includes(term) ||
            preset.dateFormat.toLowerCase().includes(term) ||
            (preset.folderPrefix && preset.folderPrefix.toLowerCase().includes(term))
        );
    }

    // --- List rendering -----------------------------------------------------

    updateCount() {
        const count = this.presets.length;
        this.el.count.textContent = count > 0 ? `${count} preset${count !== 1 ? 's' : ''}` : '';
    }

    renderList({ stagger = false } = {}) {
        const list = this.el.list;
        list.innerHTML = '';
        list.classList.toggle('animate-in', stagger);
        this.updateCount();

        if (this.presets.length === 0) {
            this.renderEmptyState();
            return;
        }

        const filtered = this.getFiltered();
        if (filtered.length === 0) {
            const noMatch = document.createElement('div');
            noMatch.className = 'pm-no-match';
            noMatch.textContent = 'No presets match your search';
            list.appendChild(noMatch);
            return;
        }

        filtered.forEach((preset, index) => {
            list.appendChild(this.createRow(preset, index));
        });
    }

    renderEmptyState() {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
            ${PM_ICON_GEAR}
            <h3>No presets yet</h3>
            <p>Save your current setup as a preset, or create one from scratch — it captures folder structure, date format, and more.</p>
        `;
        const cta = document.createElement('button');
        cta.className = 'btn success';
        cta.textContent = 'New Preset';
        cta.addEventListener('click', () => this.showEditor(null));
        empty.appendChild(cta);
        this.el.list.appendChild(empty);
    }

    createRow(preset, index) {
        const row = document.createElement('div');
        row.className = 'pm-row';
        row.style.setProperty('--i', Math.min(index, 10));
        row.dataset.presetId = preset.id;

        if (this.confirmingId === preset.id) {
            this.buildConfirmContent(row, preset);
            return row;
        }

        const main = document.createElement('div');
        main.className = 'pm-row-main';

        const name = document.createElement('div');
        name.className = 'pm-row-name';
        name.textContent = preset.name;

        const summary = document.createElement('div');
        summary.className = 'pm-row-summary';
        const parts = [this.app.getStructureDisplayName(preset.folderStructure), preset.dateFormat];
        if (preset.folderPrefix) parts.push(`Prefix “${preset.folderPrefix}”`);
        summary.textContent = parts.join(' · ');

        const meta = document.createElement('div');
        meta.className = 'pm-row-meta';
        meta.innerHTML = `Last used ${this.formatRelative(preset.lastUsed)}${this.folderBadge(preset)}`;

        main.appendChild(name);
        main.appendChild(summary);
        main.appendChild(meta);
        main.addEventListener('click', () => this.showEditor(preset));

        const actions = document.createElement('div');
        actions.className = 'pm-row-actions';

        const useBtn = document.createElement('button');
        useBtn.className = 'pm-use-btn';
        useBtn.textContent = 'Use';
        useBtn.title = 'Apply this preset to the current setup';
        useBtn.addEventListener('click', () => this.use(preset));

        const editBtn = this.iconButton(PM_ICON_EDIT, 'Edit preset', () => this.showEditor(preset));
        const dupBtn = this.iconButton(PM_ICON_COPY, 'Duplicate preset', () => this.duplicate(preset));
        const delBtn = this.iconButton(PM_ICON_TRASH, 'Delete preset', () => {
            this.confirmingId = preset.id;
            this.renderList();
            // Move focus to the confirm's Cancel so Esc/Enter stay in context
            const cancel = this.el.list.querySelector('.pm-confirm-actions .btn.secondary');
            if (cancel) cancel.focus();
        });
        delBtn.classList.add('pm-delete');

        actions.appendChild(useBtn);
        actions.appendChild(editBtn);
        actions.appendChild(dupBtn);
        actions.appendChild(delBtn);

        row.appendChild(main);
        row.appendChild(actions);
        return row;
    }

    buildConfirmContent(row, preset) {
        row.classList.add('confirming');

        const text = document.createElement('div');
        text.className = 'pm-confirm-text';
        text.textContent = `Delete “${preset.name}”?`;

        const actions = document.createElement('div');
        actions.className = 'pm-confirm-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            this.confirmingId = null;
            this.renderList();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => this.confirmDelete(row, preset));

        actions.appendChild(cancelBtn);
        actions.appendChild(deleteBtn);
        row.appendChild(text);
        row.appendChild(actions);
    }

    async confirmDelete(row, preset) {
        this.confirmingId = null;
        row.classList.add('leaving');

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const finish = async () => {
            await pmIpc.invoke('delete-preset', preset.id);
            await this.loadPresets();
            this.renderList();
            this.app.log(`Preset deleted: ${preset.name}`, 'info');
        };
        if (reduceMotion) {
            finish();
        } else {
            row.addEventListener('animationend', finish, { once: true });
        }
    }

    // --- Row helpers --------------------------------------------------------

    iconButton(svg, title, onClick) {
        const btn = document.createElement('button');
        btn.className = 'pm-icon-btn';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.innerHTML = svg;
        btn.addEventListener('click', onClick);
        return btn;
    }

    folderBadge(preset) {
        if (!preset.destinationPath) return '';
        try {
            const fs = require('fs');
            return fs.existsSync(preset.destinationPath)
                ? ' · <span class="status-ok">Folder exists</span>'
                : ' · <span class="status-err">Folder missing</span>';
        } catch {
            return ' · <span class="status-warn">Folder check failed</span>';
        }
    }

    formatRelative(dateStr) {
        if (!dateStr) return 'never';
        const date = new Date(dateStr);
        if (isNaN(date)) return 'never';
        const days = Math.floor((Date.now() - date.getTime()) / 86400000);
        if (days <= 0) return 'today';
        if (days === 1) return 'yesterday';
        if (days < 30) return `${days} days ago`;
        if (days < 365) {
            const months = Math.floor(days / 30);
            return `${months} month${months !== 1 ? 's' : ''} ago`;
        }
        const years = Math.floor(days / 365);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    }

    // --- Actions ------------------------------------------------------------

    async use(preset) {
        this.app.applyPreset(preset);
        await pmIpc.invoke('update-preset-last-used', preset.id);
        this.app.hideModal('presetManagerModal');
        this.app.log(`Preset applied: ${preset.name}`, 'success');
    }

    async save() {
        const name = this.el.name.value.trim();
        if (!name) {
            this.el.nameHint.textContent = 'Please enter a preset name';
            this.el.name.focus();
            return;
        }
        // Guard against silently overwriting a different preset with the same name
        const clash = this.presets.find(p =>
            p.name.toLowerCase() === name.toLowerCase() && p.id !== this.editingId
        );
        if (clash) {
            this.el.nameHint.textContent = 'A preset with this name already exists';
            this.el.name.focus();
            return;
        }

        const preset = {
            name,
            folderStructure: this.el.structure.value,
            dateFormat: this.el.dateFormat.value,
            folderPrefix: this.el.prefix.value.trim(),
            preserveOriginal: this.el.preserve.checked,
            destinationPath: this.destinationPath,
            startDateTime: this.el.start.value || null,
            endDateTime: this.el.end.value || null
        };
        if (this.editingId) preset.id = this.editingId;

        const saved = await pmIpc.invoke('save-preset-to-storage', preset);
        if (saved) {
            this.app.log(`Preset ${this.editingId ? 'updated' : 'created'}: ${name}`, 'success');
            this.editingId = null;
            await this.showList();
        } else {
            this.el.nameHint.textContent = 'Could not save the preset — see the log for details';
        }
    }

    async duplicate(preset) {
        const copy = { ...preset, name: `${preset.name} (Copy)` };
        delete copy.id;
        delete copy.createdAt;
        delete copy.lastUsed;
        delete copy.importedAt;

        const saved = await pmIpc.invoke('save-preset-to-storage', copy);
        if (saved) {
            await this.loadPresets();
            this.renderList();
            this.app.log(`Preset duplicated: ${copy.name}`, 'info');
        }
    }

    async exportAll() {
        if (this.presets.length === 0) {
            this.setStatus('No presets to export');
            return;
        }
        const presetIds = this.presets.map(p => p.id);
        const filePath = await pmIpc.invoke('export-presets', presetIds);
        if (filePath) {
            this.setStatus(`Exported ${presetIds.length} preset${presetIds.length !== 1 ? 's' : ''}`);
            this.app.log(`Exported ${presetIds.length} preset(s) to ${filePath}`, 'success');
        }
    }

    async import() {
        const result = await pmIpc.invoke('import-presets');
        if (!result) return;

        if (result.success) {
            await this.loadPresets();
            this.renderList();
            const parts = [`Imported ${result.imported}`];
            if (result.skipped > 0) parts.push(`skipped ${result.skipped} duplicate${result.skipped !== 1 ? 's' : ''}`);
            this.setStatus(parts.join(' · '));
            this.app.log(`Preset import: ${result.imported} imported, ${result.skipped} skipped`, 'success');
        } else {
            this.setStatus('Import failed');
            this.app.log(`Preset import failed: ${result.error}`, 'error');
        }
    }

    // Transient, non-blocking feedback in the footer — replaces alert()
    setStatus(text) {
        clearTimeout(this.statusTimer);
        this.el.status.textContent = text;
        this.el.status.classList.add('visible');
        this.statusTimer = setTimeout(() => {
            this.el.status.classList.remove('visible');
        }, 4000);
    }
}
