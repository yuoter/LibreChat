const { syncDefaultAgents, syncAgent, syncActions, cleanupRemovedAgents, getDefaultObjectId } =
  require('./sync');
const { createLogger } = require('./logger');
const {
  calculateHash,
  calculateAgentConfigHash,
  calculateActionMetadataHash,
  hashesEqual,
  generateActionId,
} = require('./hashUtils');

module.exports = {
  // Main sync function
  syncDefaultAgents,

  // Individual sync functions
  syncAgent,
  syncActions,
  cleanupRemovedAgents,

  // Utilities
  getDefaultObjectId,
  createLogger,

  // Hash utilities
  calculateHash,
  calculateAgentConfigHash,
  calculateActionMetadataHash,
  hashesEqual,
  generateActionId,
};
