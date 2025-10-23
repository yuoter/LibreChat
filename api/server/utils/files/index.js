const {
  loadConfigFile,
  loadConfigFiles,
  resolveConfigFilePath,
  validateFilePath,
} = require('./loadConfigFile');

const {
  processIconFile,
  processIconFiles,
  isImageFile,
  validateImageSize,
} = require('./processIconFile');

const {
  validateJSON,
  validateYAML,
  validateOpenAPISpec,
  validateActionSpec,
  validateInstructions,
  validateActionConfig,
  validateAgentConfig,
} = require('./validateConfigFile');

module.exports = {
  // File loading
  loadConfigFile,
  loadConfigFiles,
  resolveConfigFilePath,
  validateFilePath,
  // Icon processing
  processIconFile,
  processIconFiles,
  isImageFile,
  validateImageSize,
  // Validation
  validateJSON,
  validateYAML,
  validateOpenAPISpec,
  validateActionSpec,
  validateInstructions,
  validateActionConfig,
  validateAgentConfig,
};
