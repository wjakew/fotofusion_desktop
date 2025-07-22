const PhotoProcessor = require('./src/photoProcessor.js');

async function testCR3Handling() {
    console.log('=== CR3 File Testing Suite ===');
    console.log('Testing CR3 file handling improvements...\n');
    
    const processor = new PhotoProcessor();
    
    // Test with a sample CR3 file path
    const testFilePath = process.argv[2];
    
    if (!testFilePath) {
        console.log('Usage: node test_cr3.js <path_to_cr3_file>');
        console.log('Please provide a path to a CR3 file for testing.');
        return;
    }

    if (!testFilePath.toLowerCase().endsWith('.cr3')) {
        console.log('Warning: The provided file does not have a .CR3 extension.');
        console.log('File extension:', testFilePath.split('.').pop());
        console.log('Please ensure you are testing with a Canon CR3 raw file.\n');
    }
    
    try {
        console.log(`Testing metadata extraction for: ${testFilePath}`);
        console.log('File size:', (await require('fs').promises.stat(testFilePath)).size, 'bytes\n');

        console.log('Attempting metadata extraction...');
        const startTime = Date.now();
        const metadata = await processor.extractMetadata(testFilePath);
        const endTime = Date.now();
        
        console.log('\n=== Extracted Metadata ===');
        console.log('Processing time:', endTime - startTime, 'ms\n');

        // Basic metadata
        console.log('Basic Information:');
        console.log('----------------');
        console.log('Camera:', metadata.camera);
        console.log('Lens:', metadata.lens);
        console.log('Date/Time:', metadata.dateTime);
        console.log('File Size:', formatFileSize(metadata.fileSize));
        console.log('Dimensions:', metadata.width ? `${metadata.width}x${metadata.height}` : 'Unknown');
        
        // Technical metadata
        console.log('\nTechnical Information:');
        console.log('-------------------');
        console.log('ISO:', metadata.iso || 'Unknown');
        console.log('Focal Length:', metadata.focalLength ? `${metadata.focalLength}mm` : 'Unknown');
        console.log('Aperture:', metadata.aperture ? `f/${metadata.aperture}` : 'Unknown');
        console.log('Exposure Time:', metadata.exposureTime || 'Unknown');
        console.log('Flash:', metadata.flash || 'Unknown');
        console.log('Orientation:', metadata.orientation || 'Unknown');

        // Raw metadata (if available)
        if (metadata.rawMetadata) {
            console.log('\nRaw Metadata Fields:');
            console.log('------------------');
            const fields = Object.keys(metadata.rawMetadata);
            console.log('Available fields:', fields.length);
            fields.sort().forEach(field => {
                const value = metadata.rawMetadata[field];
                if (value !== undefined && value !== null) {
                    console.log(`${field}:`, value);
                }
            });
        }
        
        // Validation results
        console.log('\n=== Validation Results ===');
        validateMetadata(metadata);
        
    } catch (error) {
        console.error('\n❌ Error testing CR3 file:', error);
        console.error('Stack trace:', error.stack);
    }
}

function validateMetadata(metadata) {
    const checks = [
        {
            field: 'camera',
            test: () => metadata.camera !== 'Unknown Camera',
            message: 'Camera name extracted successfully',
            warning: 'Camera name could not be extracted'
        },
        {
            field: 'lens',
            test: () => metadata.lens !== 'Unknown Lens',
            message: 'Lens information extracted successfully',
            warning: 'Lens information could not be extracted'
        },
        {
            field: 'iso',
            test: () => metadata.iso !== null,
            message: 'ISO value extracted successfully',
            warning: 'ISO value could not be extracted'
        },
        {
            field: 'focalLength',
            test: () => metadata.focalLength !== null,
            message: 'Focal length extracted successfully',
            warning: 'Focal length could not be extracted'
        },
        {
            field: 'aperture',
            test: () => metadata.aperture !== null,
            message: 'Aperture value extracted successfully',
            warning: 'Aperture value could not be extracted'
        },
        {
            field: 'exposureTime',
            test: () => metadata.exposureTime !== null,
            message: 'Exposure time extracted successfully',
            warning: 'Exposure time could not be extracted'
        },
        {
            field: 'dimensions',
            test: () => metadata.width !== null && metadata.height !== null,
            message: 'Image dimensions extracted successfully',
            warning: 'Image dimensions could not be extracted'
        }
    ];

    let passedChecks = 0;
    let totalChecks = checks.length;

    checks.forEach(check => {
        const passed = check.test();
        if (passed) {
            console.log(`✅ ${check.message}`);
            passedChecks++;
        } else {
            console.log(`⚠️  ${check.warning}`);
        }
    });

    const successRate = (passedChecks / totalChecks) * 100;
    console.log(`\nOverall Success Rate: ${successRate.toFixed(1)}% (${passedChecks}/${totalChecks} checks passed)`);
}

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Run the test
testCR3Handling(); 