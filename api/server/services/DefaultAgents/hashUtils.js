const crypto = require('crypto');
const { createLogger } = require('./logger');

const logger = createLogger('HashUtils');

/**
 * Calculates a SHA256 hash of an object
 * Used for detecting changes in agent and action configurations
 *
 * @param {object} data - The data to hash
 * @returns {string} The SHA256 hash as a hex string
 */
function calculateHash(data) {
  try {
    // Sort keys to ensure consistent hashing
    const sortedData = sortObject(data);

    // Convert to JSON string
    const jsonString = JSON.stringify(sortedData);

    // Calculate SHA256 hash
    const hash = crypto.createHash('sha256').update(jsonString).digest('hex');

    logger.debug('Calculated hash', {
      dataKeys: Object.keys(data),
      hash: hash.substring(0, 16) + '...', // Log partial hash for debugging
    });

    return hash;
  } catch (error) {
    logger.error('Failed to calculate hash', error, {
      dataKeys: data ? Object.keys(data) : 'undefined',
    });
    throw new Error(`Hash calculation failed: ${error.message}`);
  }
}

/**
 * Recursively sorts object keys for consistent hashing
 * @param {any} obj - The object to sort
 * @returns {any} The sorted object
 */
function sortObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObject(obj[key]);
  }

  return sorted;
}

/**
 * Calculates a hash for an agent configuration
 * Includes all relevant fields that should trigger an update when changed
 *
 * @param {object} agentConfig - The agent configuration
 * @param {string} [instructions] - The loaded instructions (if from file)
 * @param {object} [avatar] - The avatar object (if from file)
 * @returns {string} The configuration hash
 */
function calculateAgentConfigHash(agentConfig, instructions, avatar) {
  const hashData = {
    id: agentConfig.id,
    name: agentConfig.name,
    description: agentConfig.description,
    instructions: instructions || agentConfig.instructions,
    provider: agentConfig.provider,
    model: agentConfig.model,
    category: agentConfig.category,
    model_parameters: agentConfig.model_parameters,
    recursion_limit: agentConfig.recursion_limit,
    tools: agentConfig.tools,
    tool_resources: agentConfig.tool_resources,
    // Include avatar filepath if present (to detect icon changes)
    avatar_filepath: avatar?.filepath || agentConfig.icon,
  };

  // Note: We don't include actions here as they're tracked separately
  // This allows actions to be updated independently of the agent

  return calculateHash(hashData);
}

/**
 * Calculates a hash for action metadata
 * Used to detect changes in actions that should trigger agent version update
 *
 * @param {Array} actions - Array of action configurations
 * @returns {string} The actions metadata hash
 */
function calculateActionMetadataHash(actions) {
  if (!actions || actions.length === 0) {
    return '';
  }

  // Create a simplified representation of actions for hashing
  const actionData = actions.map((action) => ({
    domain: action.domain,
    // Include spec hash if available (to detect spec changes)
    spec_hash: action.spec ? calculateHash({ spec: action.spec }) : null,
    auth_type: action.auth?.type,
  }));

  return calculateHash(actionData);
}

/**
 * Compares two hashes
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @returns {boolean} True if hashes are equal
 */
function hashesEqual(hash1, hash2) {
  return hash1 === hash2;
}

/**
 * Generates a unique hash for an action
 * @param {string} domain - The action domain
 * @param {string} agentId - The agent ID
 * @returns {string} The action hash
 */
function generateActionId(domain, agentId) {
  // Use domain and agentId to create a unique action ID
  return `${domain}_${agentId}`;
}

module.exports = {
  calculateHash,
  sortObject,
  calculateAgentConfigHash,
  calculateActionMetadataHash,
  hashesEqual,
  generateActionId,
};
