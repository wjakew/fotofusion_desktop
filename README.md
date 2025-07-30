# FotoFusion

![logo.png](/assets/logo.png)

FotoFusion is a professional photo organization tool that helps photographers efficiently manage and organize their photo collections. It provides a user-friendly interface for organizing photos based on various criteria such as date, camera, and lens information.

![src1](/readme_resources/src1.png)

## Features

- **Flexible Organization Options**
  - Organize by date (hierarchical or flat structure)
  - Organize by camera model
  - Organize by lens
  - Combined organization (Date > Camera or Camera > Date)
  - Customizable date formats
  - Optional folder prefixes
  - Original filename preservation option

- **Smart Photo Management**
  - Support for RAW and JPEG formats (including CR3, CR2, NEF, ARW, and more)
  - Enhanced CR3 file support with comprehensive metadata extraction
  - Metadata-based organization
  - Batch processing capabilities
  - Preview folder structure before copying
  - Selective folder inclusion/exclusion
  - Completion statistics and verification

- **Preset System**
  - Save organization settings as presets
  - Load presets from file or stored configurations
  - Manage and organize multiple presets

- **User-Friendly Interface**
  - Modern and intuitive design
  - Real-time progress tracking
  - Detailed operation logs
  - Customizable folder structure preview

![src2](/readme_resources/src2.png)

## Installation

1. Download the latest release for your operating system from the releases page
2. Extract the downloaded archive
3. Run the FotoFusion application

## Usage

### Basic Workflow

1. **Select Source**
   - Click "Select Source Folder" to choose the folder containing your photos
   - The application will display the number of compatible photos found

2. **Choose Destination**
   - Click "Select Destination Folder" to specify where organized photos should be copied
   - Ensure sufficient disk space is available

3. **Configure Organization**
   - Choose your preferred folder structure
   - Select date format (if applicable)
   - Add optional folder prefix
   - Toggle original filename preservation

4. **Preview and Adjust**
   - Review the proposed folder structure in the preview panel
   - Include/exclude specific folders as needed
   - Use the photo list to select/deselect specific images

5. **Execute**
   - Click "Start Copy Process" to begin organization
   - Monitor progress in real-time
   - Review the log for detailed operation information
   - View completion statistics when finished
   - Verify files were copied correctly with the verification tool

### Using Presets

1. **Save Preset**
   - Configure your organization settings
   - Click File > Presets > Save Preset
   - Enter a name for your preset
   - Click Save

2. **Load Preset**
   - Click File > Presets > Load Preset
   - Select a saved preset or import from file
   - Click Load Selected

## Keyboard Shortcuts

- **General**
  - `Ctrl/Cmd + N`: New Project
  - `Ctrl/Cmd + R`: Refresh Preview
  - `Ctrl/Cmd + A`: Select All Items
  - `Ctrl/Cmd + D`: Deselect All Items
  - `Ctrl/Cmd + Q`: Exit Application

## System Requirements

- Operating System: Windows 10/11, macOS 10.15+, or Linux
- Minimum 4GB RAM
- Sufficient disk space for photo copying
- Graphics: Basic display adapter

## Troubleshooting

### Common Issues

1. **Photos Not Detected**
   - Verify file formats are supported
   - Check folder permissions
   - Ensure metadata is accessible

2. **CR3 Files Show "Unknown Camera"**
   - Ensure you're using the latest version of FotoFusion
   - CR3 files now have enhanced support with multiple fallback methods
   - Check that the CR3 files contain valid metadata
   - Try refreshing the folder scan if metadata extraction fails

3. **Copy Process Slow**
   - Check available disk space
   - Verify disk health
   - Consider reducing batch size

4. **Preset Loading Fails**
   - Verify preset file format
   - Check file permissions
   - Try recreating the preset

## Contributing

We welcome contributions to FotoFusion! Please read our contributing guidelines before submitting pull requests.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For support, please:
- Submit issues through our issue tracker
- Contact support at [kubawawak@gmail.com](mailto:kubawawak@gmail.com)

## Credits

Created by Jakub Wawak

---

*Version 1.0.3* 