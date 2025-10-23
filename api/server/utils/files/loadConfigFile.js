const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { logger } = require('@librechat/data-schemas');

/**
 * Resolves a file path relative to the config directory or as an absolute path
 * @param {string} filePath - The file path to resolve
 * @returns {string} The resolved absolute file path
 */
function resolveConfigFilePath(filePath) {
  // If it's already absolute, return it
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  // Otherwise, resolve relative to the project root or config directory
  const configDir = process.env.CONFIG_PATH
    ? path.dirname(path.resolve(process.env.CONFIG_PATH))
    : process.cwd();

  return path.resolve(configDir, filePath);
}

/**
 * Validates that a file path is safe and doesn't attempt path traversal
 * @param {string} filePath - The file path to validate
 * @param {string} baseDir - The base directory to check against
 * @throws {Error} If path traversal is detected
 */
function validateFilePath(filePath, baseDir) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);

  // If filePath is absolute, allow it (for absolute paths specified in config)
  if (path.isAbsolute(filePath)) {
    return; // Allow absolute paths
  }

  // For relative paths, ensure they don't escape the base directory
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error(
      `Path traversal detected: ${filePath} attempts to access files outside base directory`,
    );
  }
}

/**
 * Loads a configuration file from the filesystem
 * Supports text, YAML, and JSON files
 *
 * @param {string} filePath - Relative or absolute path to the file
 * @param {string} [fileType='auto'] - Type of file: 'text', 'yaml', 'json', 'binary', or 'auto' (default)
 * @returns {Promise<string|Buffer|object>} The file contents
 * @throws {Error} If file cannot be read or parsed
 */
async function loadConfigFile(filePath, fileType = 'auto') {
  const startTime = Date.now();
  logger.debug('[loadConfigFile] Loading configuration file', {
    filePath,
    fileType,
  });

  try {
    // Resolve the file path
    const resolvedPath = resolveConfigFilePath(filePath);
    logger.debug('[loadConfigFile] Resolved file path', {
      original: filePath,
      resolved: resolvedPath,
    });

    // Validate path (only for relative paths)
    if (!path.isAbsolute(filePath)) {
      const configDir = process.env.CONFIG_PATH
        ? path.dirname(path.resolve(process.env.CONFIG_PATH))
        : process.cwd();
      validateFilePath(resolvedPath, configDir);
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    // Auto-detect file type from extension if not specified
    let detectedType = fileType;
    if (fileType === 'auto') {
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') {
        detectedType = 'yaml';
      } else if (ext === '.json') {
        detectedType = 'json';
      } else if (ext === '.txt' || ext === '.md') {
        detectedType = 'text';
      } else {
        detectedType = 'text'; // Default to text
      }
      logger.debug('[loadConfigFile] Auto-detected file type', {
        extension: ext,
        detectedType,
      });
    }

    // Read file based on type
    let content;
    if (detectedType === 'binary') {
      content = await fs.readFile(resolvedPath);
      logger.debug('[loadConfigFile] Loaded binary file', {
        size: content.length,
      });
    } else {
      const fileContent = await fs.readFile(resolvedPath, 'utf-8');

      if (detectedType === 'yaml') {
        content = yaml.load(fileContent);
        logger.debug('[loadConfigFile] Parsed YAML file');
      } else if (detectedType === 'json') {
        content = JSON.parse(fileContent);
        logger.debug('[loadConfigFile] Parsed JSON file');
      } else {
        content = fileContent;
        logger.debug('[loadConfigFile] Loaded text file', {
          length: content.length,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[loadConfigFile] Successfully loaded configuration file', {
      filePath,
      type: detectedType,
      duration: `${duration}ms`,
    });

    return content;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('[loadConfigFile] Failed to load configuration file', {
      filePath,
      fileType,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    throw new Error(`Failed to load config file ${filePath}: ${error.message}`);
  }
}

/**
 * Loads multiple configuration files in parallel
 * @param {Array<{path: string, type?: string}>} files - Array of file definitions
 * @returns {Promise<Array>} Array of loaded file contents
 */
async function loadConfigFiles(files) {
  logger.debug('[loadConfigFiles] Loading multiple configuration files', {
    count: files.length,
  });

  try {
    const promises = files.map((file) =>
      loadConfigFile(file.path, file.type).catch((error) => {
        logger.error('[loadConfigFiles] Failed to load file', {
          path: file.path,
          error: error.message,
        });
        throw error;
      }),
    );

    const results = await Promise.all(promises);

    logger.info('[loadConfigFiles] Successfully loaded all files', {
      count: results.length,
    });

    return results;
  } catch (error) {
    logger.error('[loadConfigFiles] Failed to load configuration files', {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  loadConfigFile,
  loadConfigFiles,
  resolveConfigFilePath,
  validateFilePath,
};
