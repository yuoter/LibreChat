const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { resolveConfigFilePath } = require('./loadConfigFile');

/**
 * Validates that a file is an image
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} True if file is an image
 */
async function isImageFile(filePath) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
  const ext = path.extname(filePath).toLowerCase();
  return imageExtensions.includes(ext);
}

/**
 * Validates image file size
 * @param {string} filePath - Path to the file
 * @param {number} [maxSizeMB=5] - Maximum file size in MB
 * @returns {Promise<void>}
 * @throws {Error} If file is too large
 */
async function validateImageSize(filePath, maxSizeMB = 5) {
  const stats = await fs.stat(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);

  if (fileSizeMB > maxSizeMB) {
    throw new Error(
      `Image file too large: ${fileSizeMB.toFixed(2)}MB (max: ${maxSizeMB}MB)`,
    );
  }
}

/**
 * Processes an icon file for a default agent and uploads it to the configured storage
 *
 * @param {string} iconPath - Path to the icon file (relative or absolute)
 * @param {string} agentId - ID of the agent (used for naming the file)
 * @param {string} [userId='000000000000000000000000'] - User ID for avatar processing
 * @returns {Promise<{filepath: string, source: string}>} Avatar object with filepath and source
 * @throws {Error} If file processing fails
 */
async function processIconFile(iconPath, agentId, userId = '000000000000000000000000') {
  const startTime = Date.now();
  logger.debug('[processIconFile] Processing icon file', {
    iconPath,
    agentId,
    userId,
  });

  try {
    // Resolve file path
    const resolvedPath = resolveConfigFilePath(iconPath);
    logger.debug('[processIconFile] Resolved icon path', {
      original: iconPath,
      resolved: resolvedPath,
    });

    // Validate file exists
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      throw new Error(`Icon file not found: ${resolvedPath}`);
    }

    // Validate it's an image
    const isImage = await isImageFile(resolvedPath);
    if (!isImage) {
      throw new Error(
        `Invalid icon file format: ${path.extname(resolvedPath)}. Must be an image file.`,
      );
    }

    // Validate file size
    await validateImageSize(resolvedPath);

    // Read the image file
    const imageBuffer = await fs.readFile(resolvedPath);
    logger.debug('[processIconFile] Read icon file', {
      size: imageBuffer.length,
    });

    // Get the appropriate storage strategy for avatars
    const fileStrategy = await getFileStrategy('avatar');
    logger.debug('[processIconFile] Using file strategy', {
      strategy: fileStrategy,
    });

    const { processAvatar } = getStrategyFunctions(fileStrategy);

    if (!processAvatar) {
      throw new Error(`Storage strategy ${fileStrategy} does not support avatar processing`);
    }

    // Process and resize the avatar using existing avatar processing
    const resizedBuffer = await resizeAvatar({
      userId: agentId, // Use agentId as userId for avatar processing
      input: imageBuffer,
    });

    logger.debug('[processIconFile] Resized icon', {
      originalSize: imageBuffer.length,
      resizedSize: resizedBuffer.length,
    });

    // Generate a unique filename
    const ext = path.extname(resolvedPath);
    const filename = `agent-${agentId}-${uuidv4()}${ext}`;

    // Upload the processed avatar using the appropriate strategy
    const result = await processAvatar({
      userId: agentId,
      buffer: resizedBuffer,
      fileName: filename,
    });

    const duration = Date.now() - startTime;
    logger.info('[processIconFile] Successfully processed and uploaded icon', {
      agentId,
      filename,
      strategy: fileStrategy,
      duration: `${duration}ms`,
      result,
    });

    // Return avatar object compatible with agent schema
    return {
      filepath: result.filepath || result.url || filename,
      source: result.source || fileStrategy,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('[processIconFile] Failed to process icon file', {
      iconPath,
      agentId,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    throw new Error(`Failed to process icon file ${iconPath}: ${error.message}`);
  }
}

/**
 * Processes multiple icon files in parallel
 * @param {Array<{iconPath: string, agentId: string}>} icons - Array of icon definitions
 * @returns {Promise<Array<{filepath: string, source: string}>>} Array of avatar objects
 */
async function processIconFiles(icons) {
  logger.debug('[processIconFiles] Processing multiple icon files', {
    count: icons.length,
  });

  try {
    const promises = icons.map((icon) =>
      processIconFile(icon.iconPath, icon.agentId).catch((error) => {
        logger.error('[processIconFiles] Failed to process icon', {
          iconPath: icon.iconPath,
          agentId: icon.agentId,
          error: error.message,
        });
        throw error;
      }),
    );

    const results = await Promise.all(promises);

    logger.info('[processIconFiles] Successfully processed all icons', {
      count: results.length,
    });

    return results;
  } catch (error) {
    logger.error('[processIconFiles] Failed to process icon files', {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  processIconFile,
  processIconFiles,
  isImageFile,
  validateImageSize,
};
