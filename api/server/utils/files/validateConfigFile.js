const yaml = require('js-yaml');
const { logger } = require('@librechat/data-schemas');

/**
 * Validates that a string is valid JSON
 * @param {string} content - The content to validate
 * @returns {{valid: boolean, error?: string, parsed?: object}}
 */
function validateJSON(content) {
  try {
    const parsed = JSON.parse(content);
    return { valid: true, parsed };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JSON: ${error.message}`,
    };
  }
}

/**
 * Validates that a string is valid YAML
 * @param {string} content - The content to validate
 * @returns {{valid: boolean, error?: string, parsed?: object}}
 */
function validateYAML(content) {
  try {
    const parsed = yaml.load(content);
    return { valid: true, parsed };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid YAML: ${error.message}`,
    };
  }
}

/**
 * Validates that an object is a valid OpenAPI specification
 * Performs basic structure validation
 * @param {object} spec - The OpenAPI spec to validate
 * @returns {{valid: boolean, error?: string, version?: string}}
 */
function validateOpenAPISpec(spec) {
  try {
    // Check if it's an object
    if (!spec || typeof spec !== 'object') {
      return {
        valid: false,
        error: 'OpenAPI spec must be an object',
      };
    }

    // Check for OpenAPI version
    const version = spec.openapi || spec.swagger;
    if (!version) {
      return {
        valid: false,
        error: 'Missing openapi or swagger version field',
      };
    }

    // Check for required fields
    if (!spec.info) {
      return {
        valid: false,
        error: 'Missing required field: info',
      };
    }

    if (!spec.paths && !spec.components) {
      return {
        valid: false,
        error: 'Spec must have either paths or components',
      };
    }

    logger.debug('[validateOpenAPISpec] OpenAPI spec is valid', {
      version,
      title: spec.info?.title,
    });

    return {
      valid: true,
      version,
    };
  } catch (error) {
    return {
      valid: false,
      error: `OpenAPI validation error: ${error.message}`,
    };
  }
}

/**
 * Validates an action specification (can be YAML or JSON string)
 * @param {string} specContent - The spec content as a string
 * @param {string} [format='auto'] - The format: 'yaml', 'json', or 'auto'
 * @returns {{valid: boolean, error?: string, parsed?: object}}
 */
function validateActionSpec(specContent, format = 'auto') {
  logger.debug('[validateActionSpec] Validating action spec', {
    format,
    contentLength: specContent?.length,
  });

  try {
    let parsed;
    let detectedFormat = format;

    if (format === 'auto') {
      // Try YAML first (more permissive)
      const yamlResult = validateYAML(specContent);
      if (yamlResult.valid) {
        parsed = yamlResult.parsed;
        detectedFormat = 'yaml';
      } else {
        // Try JSON
        const jsonResult = validateJSON(specContent);
        if (jsonResult.valid) {
          parsed = jsonResult.parsed;
          detectedFormat = 'json';
        } else {
          return {
            valid: false,
            error: `Invalid spec format. YAML error: ${yamlResult.error}. JSON error: ${jsonResult.error}`,
          };
        }
      }
    } else if (format === 'yaml') {
      const yamlResult = validateYAML(specContent);
      if (!yamlResult.valid) {
        return yamlResult;
      }
      parsed = yamlResult.parsed;
    } else if (format === 'json') {
      const jsonResult = validateJSON(specContent);
      if (!jsonResult.valid) {
        return jsonResult;
      }
      parsed = jsonResult.parsed;
    } else {
      return {
        valid: false,
        error: `Unknown format: ${format}`,
      };
    }

    // Validate as OpenAPI spec
    const openAPIResult = validateOpenAPISpec(parsed);
    if (!openAPIResult.valid) {
      return openAPIResult;
    }

    logger.info('[validateActionSpec] Action spec is valid', {
      format: detectedFormat,
      version: openAPIResult.version,
    });

    return {
      valid: true,
      parsed,
      format: detectedFormat,
    };
  } catch (error) {
    logger.error('[validateActionSpec] Validation error', {
      error: error.message,
      stack: error.stack,
    });

    return {
      valid: false,
      error: `Validation error: ${error.message}`,
    };
  }
}

/**
 * Validates agent instructions
 * @param {string} instructions - The instructions text
 * @param {number} [maxLength=10000] - Maximum length in characters
 * @returns {{valid: boolean, error?: string}}
 */
function validateInstructions(instructions, maxLength = 10000) {
  if (typeof instructions !== 'string') {
    return {
      valid: false,
      error: 'Instructions must be a string',
    };
  }

  if (instructions.trim().length === 0) {
    return {
      valid: false,
      error: 'Instructions cannot be empty',
    };
  }

  if (instructions.length > maxLength) {
    return {
      valid: false,
      error: `Instructions too long: ${instructions.length} characters (max: ${maxLength})`,
    };
  }

  return { valid: true };
}

/**
 * Validates a complete action configuration
 * @param {object} actionConfig - The action configuration object
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateActionConfig(actionConfig) {
  const errors = [];

  // Check required fields
  if (!actionConfig.domain) {
    errors.push('Missing required field: domain');
  }

  // Must have either spec or specFile
  if (!actionConfig.spec && !actionConfig.specFile) {
    errors.push('Action must have either spec or specFile');
  }

  // If auth is provided, validate its structure
  if (actionConfig.auth) {
    if (!actionConfig.auth.type) {
      errors.push('Auth configuration must have a type');
    }

    const validAuthTypes = ['service_http', 'oauth', 'none'];
    if (actionConfig.auth.type && !validAuthTypes.includes(actionConfig.auth.type)) {
      errors.push(`Invalid auth type: ${actionConfig.auth.type}`);
    }

    // Validate OAuth config
    if (actionConfig.auth.type === 'oauth') {
      if (!actionConfig.auth.client_url) {
        errors.push('OAuth auth requires client_url');
      }
      if (!actionConfig.auth.authorization_url) {
        errors.push('OAuth auth requires authorization_url');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a complete default agent configuration
 * @param {object} agentConfig - The agent configuration object
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateAgentConfig(agentConfig) {
  const errors = [];

  // Check required fields
  const requiredFields = ['id', 'name', 'provider', 'model'];
  for (const field of requiredFields) {
    if (!agentConfig[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Must have either instructions or instructionsFile
  if (!agentConfig.instructions && !agentConfig.instructionsFile) {
    errors.push('Agent must have either instructions or instructionsFile');
  }

  // Validate actions if present
  if (agentConfig.actions && Array.isArray(agentConfig.actions)) {
    agentConfig.actions.forEach((action, index) => {
      const actionValidation = validateActionConfig(action);
      if (!actionValidation.valid) {
        errors.push(`Action ${index}: ${actionValidation.errors.join(', ')}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateJSON,
  validateYAML,
  validateOpenAPISpec,
  validateActionSpec,
  validateInstructions,
  validateActionConfig,
  validateAgentConfig,
};
