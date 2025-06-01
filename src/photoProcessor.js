const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const exifr = require('exifr');

class PhotoProcessor {
    constructor() {
        this.supportedFormats = [
            '*.jpg', '*.jpeg', '*.png', '*.tiff', '*.tif',
            '*.raw', '*.cr2', '*.cr3', '*.nef', '*.arw', 
            '*.orf', '*.rw2', '*.pef', '*.srw', '*.raf',
            '*.dng', '*.3fr', '*.ari', '*.bay', '*.crw',
            '*.dcr', '*.erf', '*.fff', '*.iiq', '*.k25',
            '*.kdc', '*.mdc', '*.mos', '*.mrw', '*.nrw',
            '*.ptx', '*.r3d', '*.rwl', '*.sr2', '*.srf',
            '*.x3f'
        ];
        this.photos = [];
        this.folderStructure = {};
        this.excludedPhotos = new Set(); // Track excluded individual photos
        this.excludedFolders = new Set(); // Track excluded folders
    }

    async scanFolder(folderPath, onProgress = null) {
        this.photos = [];
        this.excludedPhotos.clear();
        this.excludedFolders.clear();
        this.folderStructure = {};
        
        const patterns = this.supportedFormats.map(format => 
            path.join(folderPath, '**', format).replace(/\\/g, '/')
        );

        let allFiles = [];
        for (const pattern of patterns) {
            const files = glob.sync(pattern, { nocase: true });
            allFiles = allFiles.concat(files);
        }

        // Remove duplicates
        allFiles = [...new Set(allFiles)];

        for (let i = 0; i < allFiles.length; i++) {
            const filePath = allFiles[i];
            try {
                const metadata = await this.extractMetadata(filePath);
                const photo = {
                    id: `photo_${Date.now()}_${i}`, // More unique ID generation
                    path: filePath,
                    filename: path.basename(filePath),
                    metadata: metadata,
                    size: (await fs.stat(filePath)).size
                };
                this.photos.push(photo);

                if (onProgress) {
                    onProgress({
                        current: i + 1,
                        total: allFiles.length,
                        filename: path.basename(filePath)
                    });
                }
            } catch (error) {
                console.error(`Error processing ${filePath}:`, error);
            }
        }

        return this.photos;
    }

    // Exclusion management methods
    togglePhotoExclusion(photoId) {
        if (this.excludedPhotos.has(photoId)) {
            this.excludedPhotos.delete(photoId);
            return false; // Not excluded
        } else {
            this.excludedPhotos.add(photoId);
            return true; // Excluded
        }
    }

    toggleFolderExclusion(folderPath) {
        if (!folderPath) {
            console.error('toggleFolderExclusion called with empty folderPath');
            return false;
        }
        
        // Normalize path separators to ensure consistency
        const normalizedPath = folderPath.split(path.sep).join('/');
        
        if (!this.folderStructure[folderPath] && !this.folderStructure[normalizedPath]) {
            console.error(`toggleFolderExclusion: folder "${folderPath}" not found in structure`);
            console.log('Available folders:', Object.keys(this.folderStructure));
            return false;
        }
        
        // Use the path that actually exists in the structure
        const actualPath = this.folderStructure[folderPath] ? folderPath : normalizedPath;
        
        if (this.excludedFolders.has(actualPath)) {
            this.excludedFolders.delete(actualPath);
            console.log(`Folder included: ${actualPath}`);
            return false; // Not excluded
        } else {
            this.excludedFolders.add(actualPath);
            console.log(`Folder excluded: ${actualPath}`);
            console.log('Current excluded folders:', Array.from(this.excludedFolders));
            return true; // Excluded
        }
    }

    isFolderExcluded(folderPath) {
        if (!folderPath) return false;
        
        // Check both original path and normalized path
        const normalizedPath = folderPath.split(path.sep).join('/');
        return this.excludedFolders.has(folderPath) || this.excludedFolders.has(normalizedPath);
    }

    isPhotoExcluded(photoId) {
        return this.excludedPhotos.has(photoId);
    }

    isFolderExcluded(folderPath) {
        return this.excludedFolders.has(folderPath);
    }

    getIncludedPhotos() {
        return this.photos.filter(photo => {
            // Check if photo is individually excluded
            if (this.excludedPhotos.has(photo.id)) {
                return false;
            }
            
            // Check if photo's folder is excluded
            const folderPath = this.getPhotoFolderPath(photo);
            return !this.excludedFolders.has(folderPath);
        });
    }

    getPhotoFolderPath(photo) {
        // Find which folder this photo belongs to
        for (const [folderPath, photos] of Object.entries(this.folderStructure)) {
            if (photos.some(p => p.id === photo.id)) {
                return folderPath;
            }
        }
        return null;
    }

    getExclusionStats() {
        const totalPhotos = this.photos.length;
        const excludedByPhoto = this.excludedPhotos.size;
        
        let excludedByFolder = 0;
        for (const [folderPath, photos] of Object.entries(this.folderStructure)) {
            if (this.excludedFolders.has(folderPath)) {
                // Only count photos not already individually excluded
                excludedByFolder += photos.filter(photo => !this.excludedPhotos.has(photo.id)).length;
            }
        }
        
        const totalExcluded = excludedByPhoto + excludedByFolder;
        const included = Math.max(0, totalPhotos - totalExcluded);
        
        return {
            total: totalPhotos,
            included: included,
            excludedByPhoto: excludedByPhoto,
            excludedByFolder: excludedByFolder,
            totalExcluded: totalExcluded,
            excludedFolders: this.excludedFolders.size
        };
    }

    // Debug method to check exclusion state
    debugExclusionState() {
        console.log('=== Exclusion State Debug ===');
        console.log('Excluded Photos:', Array.from(this.excludedPhotos));
        console.log('Excluded Folders:', Array.from(this.excludedFolders));
        console.log('Total Photos:', this.photos.length);
        console.log('Folder Structure Keys:', Object.keys(this.folderStructure));
        
        const stats = this.getExclusionStats();
        console.log('Exclusion Stats:', stats);
        console.log('=============================');
    }

    // Verify that folder exclusions are properly tracked
    validateExclusions() {
        // Ensure excluded folders actually exist in the structure
        for (const excludedFolder of this.excludedFolders) {
            if (!this.folderStructure[excludedFolder]) {
                console.warn(`Excluded folder "${excludedFolder}" not found in current structure`);
                this.excludedFolders.delete(excludedFolder);
            }
        }
        
        // Clean up excluded photos that no longer exist
        const currentPhotoIds = new Set(this.photos.map(p => p.id));
        for (const excludedPhotoId of this.excludedPhotos) {
            if (!currentPhotoIds.has(excludedPhotoId)) {
                console.warn(`Excluded photo "${excludedPhotoId}" not found in current photos`);
                this.excludedPhotos.delete(excludedPhotoId);
            }
        }
    }

    clearExclusions() {
        this.excludedPhotos.clear();
        this.excludedFolders.clear();
    }

    // Initialize exclusion tracking when creating folder structure
    initializeExclusions() {
        if (!this.excludedPhotos) this.excludedPhotos = new Set();
        if (!this.excludedFolders) this.excludedFolders = new Set();
    }

    async extractMetadata(filePath) {
        try {
            const metadata = await exifr.parse(filePath, {
                pick: [
                    'Make', 'Model', 'DateTime', 'DateTimeOriginal', 'CreateDate',
                    'LensModel', 'LensMake', 'FocalLength', 'FNumber', 'ISO',
                    'ExposureTime', 'WhiteBalance', 'Flash', 'Orientation'
                ]
            });

            const stats = await fs.stat(filePath);
            
            return {
                camera: this.getCameraName(metadata),
                lens: this.getLensName(metadata),
                dateTime: this.getDateTime(metadata, stats),
                iso: metadata?.ISO || null,
                focalLength: metadata?.FocalLength || null,
                aperture: metadata?.FNumber || null,
                exposureTime: metadata?.ExposureTime || null,
                flash: metadata?.Flash || null,
                orientation: metadata?.Orientation || null,
                fileSize: stats.size,
                lastModified: stats.mtime
            };
        } catch (error) {
            const stats = await fs.stat(filePath);
            return {
                camera: 'Unknown Camera',
                lens: 'Unknown Lens',
                dateTime: stats.mtime,
                iso: null,
                focalLength: null,
                aperture: null,
                exposureTime: null,
                flash: null,
                orientation: null,
                fileSize: stats.size,
                lastModified: stats.mtime
            };
        }
    }

    getCameraName(metadata) {
        if (!metadata) return 'Unknown Camera';
        
        const make = metadata.Make?.trim() || '';
        const model = metadata.Model?.trim() || '';
        
        if (!make && !model) return 'Unknown Camera';
        if (!make) return model;
        if (!model) return make;
        
        // Remove redundant make from model
        if (model.toLowerCase().includes(make.toLowerCase())) {
            return model;
        }
        
        return `${make} ${model}`;
    }

    getLensName(metadata) {
        if (!metadata) return 'Unknown Lens';
        
        const lensModel = metadata.LensModel?.trim() || '';
        const lensMake = metadata.LensMake?.trim() || '';
        
        if (!lensModel && !lensMake) return 'Unknown Lens';
        if (!lensMake) return lensModel;
        if (!lensModel) return lensMake;
        
        if (lensModel.toLowerCase().includes(lensMake.toLowerCase())) {
            return lensModel;
        }
        
        return `${lensMake} ${lensModel}`;
    }

    getDateTime(metadata, stats) {
        // Priority order for date extraction
        const dateFields = ['DateTimeOriginal', 'CreateDate', 'DateTime'];
        
        for (const field of dateFields) {
            if (metadata && metadata[field]) {
                return new Date(metadata[field]);
            }
        }
        
        // Fallback to file modification time
        return stats.mtime;
    }

    generateFolderStructure(structureType, prefix = '', dateFormat = 'YYYY/MM/DD') {
        this.initializeExclusions();
        
        // Store current exclusions before regenerating structure
        const currentExcludedFolders = new Set(this.excludedFolders);
        
        // Generate new folder structure
        this.folderStructure = {};
        
        for (const photo of this.photos) {
            const folderPath = this.generateFolderPath(photo, structureType, prefix, dateFormat);
            
            if (!this.folderStructure[folderPath]) {
                this.folderStructure[folderPath] = [];
            }
            
            this.folderStructure[folderPath].push(photo);
        }
        
        // Validate and clean up exclusions after structure regeneration
        this.validateExclusions();
        
        console.log(`Generated folder structure with ${Object.keys(this.folderStructure).length} folders`);
        console.log(`Preserved ${this.excludedFolders.size} excluded folders`);
        
        return this.folderStructure;
    }

    generateFolderPath(photo, structureType, prefix = '', dateFormat = 'YYYY/MM/DD') {
        const date = new Date(photo.metadata.dateTime);
        const camera = this.sanitizeFolderName(photo.metadata.camera);
        const lens = this.sanitizeFolderName(photo.metadata.lens);
        
        let folderPath = '';
        
        switch (structureType) {
            case 'date':
                folderPath = this.formatDateFolder(date, dateFormat);
                break;
            case 'date-flat':
                folderPath = this.formatDateFolderFlat(date, dateFormat);
                break;
            case 'camera':
                folderPath = camera;
                break;
            case 'lens':
                folderPath = lens;
                break;
            case 'date-camera':
                folderPath = path.join(this.formatDateFolder(date, dateFormat), camera);
                break;
            case 'date-flat-camera':
                folderPath = path.join(this.formatDateFolderFlat(date, dateFormat), camera);
                break;
            case 'camera-date':
                folderPath = path.join(camera, this.formatDateFolder(date, dateFormat));
                break;
            case 'camera-date-flat':
                folderPath = path.join(camera, this.formatDateFolderFlat(date, dateFormat));
                break;
            default:
                folderPath = this.formatDateFolder(date, dateFormat);
        }
        
        if (prefix) {
            const parts = folderPath.split(path.sep);
            parts[parts.length - 1] = `${prefix}_${parts[parts.length - 1]}`;
            folderPath = parts.join(path.sep);
        }
        
        return folderPath;
    }

    formatDateFolderFlat(date, dateFormat) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthName = monthNames[date.getMonth()];
        
        switch (dateFormat) {
            case 'YYYY/MM/DD':
            case 'YYYY-MM-DD':
                return `${year}-${month}-${day}`;
            case 'YYYY/MM':
            case 'YYYY-MM':
                return `${year}-${month}`;
            case 'YYYY':
                return String(year);
            case 'DD-MM-YYYY':
                return `${day}-${month}-${year}`;
            case 'MM-DD-YYYY':
                return `${month}-${day}-${year}`;
            case 'Month YYYY':
                return `${monthName} ${year}`;
            case 'YYYY/Month':
                return `${year}-${monthName}`;
            default:
                return `${year}-${month}-${day}`;
        }
    }

    formatDateFolder(date, dateFormat) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthName = monthNames[date.getMonth()];
        
        switch (dateFormat) {
            case 'YYYY/MM/DD':
                return path.join(String(year), year + '-' + month, year + '-' + month + '-' + day);
            case 'YYYY-MM-DD':
                return year + '-' + month + '-' + day;
            case 'YYYY/MM':
                return path.join(String(year), year + '-' + month);
            case 'YYYY-MM':
                return year + '-' + month;
            case 'YYYY':
                return String(year);
            case 'DD-MM-YYYY':
                return day + '-' + month + '-' + year;
            case 'MM-DD-YYYY':
                return month + '-' + day + '-' + year;
            case 'Month YYYY':
                return monthName + ' ' + year;
            case 'YYYY/Month':
                return path.join(String(year), monthName);
            default:
                return path.join(String(year), year + '-' + month, year + '-' + month + '-' + day);
        }
    }

    sanitizeFolderName(name) {
        return name
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    async copyPhotos(destinationRoot, preserveOriginal = true, onProgress = null) {
        const includedPhotos = this.getIncludedPhotos();
        const results = {
            success: 0,
            failed: 0,
            errors: [],
            foldersCopied: 0,
            totalPhotos: this.photos.length,
            includedPhotos: includedPhotos.length,
            excludedPhotos: this.photos.length - includedPhotos.length,
            startTime: new Date(),
            endTime: null
        };

        let processedCount = 0;
        const totalFiles = includedPhotos.length;

        // Create folder structure only for included photos
        const includedFolderStructure = {};
        console.log('=== PROCESSING FOLDER EXCLUSIONS ===');
        
        for (const [folderPath, photos] of Object.entries(this.folderStructure)) {
            const normalizedPath = folderPath.split(path.sep).join('/');
            const isExcluded = this.excludedFolders.has(folderPath) || this.excludedFolders.has(normalizedPath);
            
            console.log(`Checking folder: "${folderPath}"`);
            console.log(`  Normalized: "${normalizedPath}"`);
            console.log(`  Is excluded: ${isExcluded}`);
            
            // Skip entirely excluded folders
            if (isExcluded) {
                console.log(`  -> SKIPPING excluded folder: ${folderPath}`);
                continue;
            }
            
            // Filter out individually excluded photos from this folder
            const includedPhotosInFolder = photos.filter(photo => 
                !this.excludedPhotos.has(photo.id)
            );
            
            // Only include folder if it has photos to copy
            if (includedPhotosInFolder.length > 0) {
                includedFolderStructure[folderPath] = includedPhotosInFolder;
                console.log(`  -> INCLUDING folder: ${folderPath} with ${includedPhotosInFolder.length} photos`);
            } else {
                console.log(`  -> SKIPPING empty folder: ${folderPath}`);
            }
        }

        results.foldersCopied = Object.keys(includedFolderStructure).length;
        console.log(`Total folders to copy: ${results.foldersCopied}`);
        console.log(`Excluded folders: ${Array.from(this.excludedFolders)}`);

        for (const [folderPath, photos] of Object.entries(includedFolderStructure)) {
            const targetFolder = path.join(destinationRoot, folderPath);
            
            try {
                await fs.mkdir(targetFolder, { recursive: true });
                console.log(`Created folder: ${targetFolder}`);
                
                for (const photo of photos) {
                    try {
                        const filename = preserveOriginal ? 
                            photo.filename : 
                            this.generateNewFilename(photo, processedCount);
                        
                        const targetPath = path.join(targetFolder, filename);
                        await fs.copyFile(photo.path, targetPath);
                        
                        results.success++;
                        processedCount++;
                        
                        if (onProgress) {
                            onProgress({
                                current: processedCount,
                                total: totalFiles,
                                filename: photo.filename,
                                targetPath: targetPath,
                                action: 'copying'
                            });
                        }
                    } catch (error) {
                        results.failed++;
                        results.errors.push({
                            file: photo.path,
                            error: error.message
                        });
                        processedCount++;
                    }
                }
            } catch (error) {
                results.errors.push({
                    folder: folderPath,
                    error: error.message
                });
            }
        }

        results.endTime = new Date();
        return results;
    }

    generateNewFilename(photo, index) {
        const ext = path.extname(photo.filename);
        const date = new Date(photo.metadata.dateTime);
        const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const camera = this.sanitizeFolderName(photo.metadata.camera).substring(0, 10);
        
        return `${timestamp}_${camera}_${String(index + 1).padStart(4, '0')}${ext}`;
    }

    generateReport(results, structureType, prefix, destinationPath, dateFormat) {
        const duration = results.endTime - results.startTime;
        const durationMinutes = Math.round(duration / 60000 * 100) / 100;
        const exclusionStats = this.getExclusionStats();

        let report = `# FotoFusion Copy Report\n\n`;
        report += `**Generated:** ${new Date().toLocaleString()}\n`;
        report += `**Duration:** ${durationMinutes} minutes\n\n`;

        report += `## Summary\n\n`;
        report += `- **Total Photos Found:** ${results.totalPhotos}\n`;
        report += `- **Photos Included:** ${results.includedPhotos}\n`;
        report += `- **Photos Excluded:** ${results.excludedPhotos}\n`;
        report += `- **Successfully Copied:** ${results.success}\n`;
        report += `- **Failed:** ${results.failed}\n`;
        report += `- **Folders Created:** ${results.foldersCopied}\n`;
        report += `- **Structure Type:** ${structureType}\n`;
        report += `- **Date Format:** ${dateFormat}\n`;
        if (prefix) report += `- **Prefix:** ${prefix}\n`;
        report += `- **Destination:** ${destinationPath}\n\n`;

        if (exclusionStats.totalExcluded > 0) {
            report += `## Exclusions\n\n`;
            report += `- **Individual Photos Excluded:** ${exclusionStats.excludedByPhoto}\n`;
            report += `- **Photos Excluded by Folder:** ${exclusionStats.excludedByFolder}\n`;
            report += `- **Folders Excluded:** ${exclusionStats.excludedFolders}\n`;
            
            if (this.excludedFolders.size > 0) {
                report += `\n**Excluded Folders:**\n`;
                for (const folderPath of this.excludedFolders) {
                    const folderPhotos = this.folderStructure[folderPath] || [];
                    report += `- ${folderPath} (${folderPhotos.length} photos)\n`;
                }
            }
            report += `\n`;
        }

        if (results.success > 0) {
            report += `## Copied Folder Structure\n\n`;
            for (const [folderPath, photos] of Object.entries(this.folderStructure)) {
                if (this.excludedFolders.has(folderPath)) {
                    continue; // Skip excluded folders in the report
                }
                
                const includedPhotos = photos.filter(photo => !this.excludedPhotos.has(photo.id));
                if (includedPhotos.length === 0) continue;
                
                report += `### ${folderPath}\n`;
                report += `${includedPhotos.length} photos copied\n\n`;
                
                for (const photo of includedPhotos.slice(0, 10)) { // Limit to first 10 files
                    report += `- ${photo.filename}\n`;
                }
                
                if (includedPhotos.length > 10) {
                    report += `- ... and ${includedPhotos.length - 10} more files\n`;
                }
                report += `\n`;
            }
        }

        if (results.errors.length > 0) {
            report += `## Errors\n\n`;
            for (const error of results.errors) {
                if (error.file) {
                    report += `- **File:** ${error.file}\n  **Error:** ${error.error}\n\n`;
                } else if (error.folder) {
                    report += `- **Folder:** ${error.folder}\n  **Error:** ${error.error}\n\n`;
                }
            }
        }

        report += `## Statistics\n\n`;
        const includedPhotos = this.getIncludedPhotos();
        const cameras = [...new Set(includedPhotos.map(p => p.metadata.camera))];
        const lenses = [...new Set(includedPhotos.map(p => p.metadata.lens))];
        
        report += `- **Unique Cameras (copied):** ${cameras.length}\n`;
        for (const camera of cameras) {
            const count = includedPhotos.filter(p => p.metadata.camera === camera).length;
            report += `  - ${camera}: ${count} photos\n`;
        }
        
        report += `\n- **Unique Lenses (copied):** ${lenses.length}\n`;
        for (const lens of lenses) {
            const count = includedPhotos.filter(p => p.metadata.lens === lens).length;
            report += `  - ${lens}: ${count} photos\n`;
        }

        const totalSize = includedPhotos.reduce((sum, photo) => sum + photo.metadata.fileSize, 0);
        const sizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
        report += `\n- **Total Size (copied):** ${sizeGB} GB\n`;

        return report;
    }
}

// Make available globally
window.PhotoProcessor = PhotoProcessor;