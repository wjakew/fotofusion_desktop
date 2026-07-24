const fs = require('fs/promises');
const path = require('path');

/**
 * Electron Builder hook: remove AppleDouble sidecar files from macOS app bundles.
 *
 * Building from exFAT/non-APFS volumes can create `._*` files while copying app
 * resources. If those files remain in the `.app`, macOS code signing resource
 * validation can fail and Gatekeeper may report the app as damaged.
 */
module.exports = async function cleanMacAppleDouble(context) {
  const platformName = context.electronPlatformName || context.packager?.platform?.nodeName;

  if (platformName !== 'darwin') {
    return;
  }

  const appOutDir = context.appOutDir;
  if (!appOutDir) {
    return;
  }

  const removed = await removeAppleDoubleFiles(appOutDir);

  if (removed > 0) {
    console.log(`[mac-clean] Removed ${removed} AppleDouble file${removed === 1 ? '' : 's'} from ${appOutDir}`);
  }
};

async function removeAppleDoubleFiles(root) {
  let removed = 0;

  async function walk(currentPath) {
    let entries;

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.name.startsWith('._')) {
        await fs.rm(entryPath, { force: true, recursive: true });
        removed += 1;
        continue;
      }

      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await walk(entryPath);
      }
    }
  }

  await walk(root);
  return removed;
}
