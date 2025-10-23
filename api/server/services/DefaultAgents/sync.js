const { createLogger } = require('./logger');
const {
  calculateAgentConfigHash,
  calculateActionMetadataHash,
  hashesEqual,
  generateActionId,
} = require('./hashUtils');
const {
  loadConfigFile,
  processIconFile,
  validateActionSpec,
  validateInstructions,
  validateAgentConfig,
} = require('~/server/utils/files');
const { createAgent, updateAgent, getAgent, deleteAgent } = require('~/models/Agent');
const { updateAction, deleteAction, getActions } = require('~/models/Action');
const { encryptMetadata } = require('~/server/services/ActionService');

const logger = createLogger('DefaultAgentsSync');

/**
 * Gets the default actions object ID from environment
 * @returns {string} The default object ID
 */
function getDefaultObjectId() {
  return process.env.DEFAULT_ACTIONS_OBJECT_ID || '000000000000000000000000';
}

/**
 * Loads file-based content for an agent configuration
 * @param {object} agentConfig - The agent configuration
 * @returns {Promise<{instructions?: string, avatar?: object}>}
 */
async function loadAgentFileContent(agentConfig) {
  const result = {};

  // Load instructions from file if specified
  if (agentConfig.instructionsFile) {
    logger.debug('Loading instructions from file', {
      agentId: agentConfig.id,
      file: agentConfig.instructionsFile,
    });

    try {
      result.instructions = await loadConfigFile(agentConfig.instructionsFile, 'text');

      // Validate instructions
      const validation = validateInstructions(result.instructions);
      if (!validation.valid) {
        throw new Error(`Invalid instructions: ${validation.error}`);
      }

      logger.debug('Loaded and validated instructions', {
        agentId: agentConfig.id,
        length: result.instructions.length,
      });
    } catch (error) {
      logger.error('Failed to load instructions file', error, {
        agentId: agentConfig.id,
        file: agentConfig.instructionsFile,
      });
      throw error;
    }
  } else if (agentConfig.instructions) {
    result.instructions = agentConfig.instructions;

    // Validate inline instructions
    const validation = validateInstructions(result.instructions);
    if (!validation.valid) {
      throw new Error(`Invalid inline instructions: ${validation.error}`);
    }
  }

  // Process icon file if specified
  if (agentConfig.iconFile) {
    logger.debug('Processing icon file', {
      agentId: agentConfig.id,
      file: agentConfig.iconFile,
    });

    try {
      result.avatar = await processIconFile(agentConfig.iconFile, agentConfig.id);

      logger.debug('Processed icon file', {
        agentId: agentConfig.id,
        avatar: result.avatar,
      });
    } catch (error) {
      logger.error('Failed to process icon file', error, {
        agentId: agentConfig.id,
        file: agentConfig.iconFile,
      });
      throw error;
    }
  } else if (agentConfig.icon) {
    // Use inline icon data
    result.avatar = {
      filepath: agentConfig.icon,
      source: 'inline',
    };
  }

  return result;
}

/**
 * Loads and validates action spec from file or inline
 * @param {object} actionConfig - The action configuration
 * @param {string} agentId - The agent ID (for logging)
 * @returns {Promise<string>} The loaded spec
 */
async function loadActionSpec(actionConfig, agentId) {
  let spec;

  if (actionConfig.specFile) {
    logger.debug('Loading action spec from file', {
      agentId,
      domain: actionConfig.domain,
      file: actionConfig.specFile,
    });

    try {
      const content = await loadConfigFile(actionConfig.specFile, 'auto');

      // If it's an object (parsed YAML/JSON), convert to string
      if (typeof content === 'object') {
        spec = JSON.stringify(content);
      } else {
        spec = content;
      }

      // Validate the spec
      const validation = validateActionSpec(spec);
      if (!validation.valid) {
        throw new Error(`Invalid action spec: ${validation.error}`);
      }

      logger.debug('Loaded and validated action spec', {
        agentId,
        domain: actionConfig.domain,
        format: validation.format,
      });
    } catch (error) {
      logger.error('Failed to load action spec file', error, {
        agentId,
        domain: actionConfig.domain,
        file: actionConfig.specFile,
      });
      throw error;
    }
  } else if (actionConfig.spec) {
    spec = actionConfig.spec;

    // Validate inline spec
    const validation = validateActionSpec(spec);
    if (!validation.valid) {
      throw new Error(`Invalid inline action spec: ${validation.error}`);
    }

    logger.debug('Validated inline action spec', {
      agentId,
      domain: actionConfig.domain,
    });
  } else {
    throw new Error(`Action ${actionConfig.domain} must have either spec or specFile`);
  }

  return spec;
}

/**
 * Creates or updates actions for an agent
 * @param {string} agentId - The agent ID
 * @param {Array} actionsConfig - Array of action configurations
 * @param {string} defaultObjectId - The default object ID
 * @returns {Promise<Array>} Array of created/updated actions
 */
async function syncActions(agentId, actionsConfig, defaultObjectId) {
  if (!actionsConfig || actionsConfig.length === 0) {
    logger.debug('No actions to sync for agent', { agentId });
    return [];
  }

  logger.info('Syncing actions for agent', {
    agentId,
    actionCount: actionsConfig.length,
  });

  const syncedActions = [];

  for (const actionConfig of actionsConfig) {
    try {
      logger.debug('Processing action', {
        agentId,
        domain: actionConfig.domain,
      });

      // Load and validate spec
      const spec = await loadActionSpec(actionConfig, agentId);

      // Generate action ID
      const actionId = generateActionId(actionConfig.domain, agentId);

      // Prepare metadata
      const metadata = {
        domain: actionConfig.domain,
        raw_spec: spec,
      };

      if (actionConfig.privacy_policy_url) {
        metadata.privacy_policy_url = actionConfig.privacy_policy_url;
      }

      // Add auth configuration
      if (actionConfig.auth) {
        Object.assign(metadata, actionConfig.auth);
      }

      // Encrypt sensitive metadata
      const encryptedMetadata = encryptMetadata(metadata);

      // Prepare action data
      const actionData = {
        action_id: actionId,
        user: defaultObjectId,
        agent_id: agentId,
        type: 'action_prototype',
        metadata: encryptedMetadata,
      };

      // Create or update action
      const action = await updateAction(actionData);

      logger.info('Synced action', {
        agentId,
        actionId,
        domain: actionConfig.domain,
      });

      syncedActions.push(action);
    } catch (error) {
      logger.error('Failed to sync action', error, {
        agentId,
        domain: actionConfig.domain,
      });
      throw error;
    }
  }

  logger.info('Completed syncing actions for agent', {
    agentId,
    syncedCount: syncedActions.length,
  });

  return syncedActions;
}

/**
 * Creates a new default agent
 * @param {object} agentConfig - The agent configuration
 * @param {string} instructions - The agent instructions
 * @param {object} avatar - The agent avatar
 * @param {string} defaultObjectId - The default object ID
 * @returns {Promise<object>} The created agent
 */
async function createDefaultAgent(agentConfig, instructions, avatar, defaultObjectId) {
  logger.info('Creating new default agent', {
    agentId: agentConfig.id,
    name: agentConfig.name,
  });

  try {
    const agentData = {
      id: agentConfig.id,
      name: agentConfig.name,
      description: agentConfig.description,
      instructions,
      avatar,
      provider: agentConfig.provider,
      model: agentConfig.model,
      author: defaultObjectId,
      category: agentConfig.category || 'general',
      model_parameters: agentConfig.model_parameters,
      recursion_limit: agentConfig.recursion_limit,
      tools: agentConfig.tools || [],
      actions: [], // Will be populated after actions are created
      tool_resources: agentConfig.tool_resources,
    };

    // Calculate config hash and store in version
    const configHash = calculateAgentConfigHash(agentConfig, instructions, avatar);

    // Create the agent
    const agent = await createAgent({
      ...agentData,
      // Store config hash in the first version
      version_metadata: { configHash },
    });

    logger.info('Created default agent', {
      agentId: agent.id,
      name: agent.name,
      _id: agent._id,
    });

    return agent;
  } catch (error) {
    logger.error('Failed to create default agent', error, {
      agentId: agentConfig.id,
    });
    throw error;
  }
}

/**
 * Updates an existing default agent
 * @param {object} existingAgent - The existing agent from database
 * @param {object} agentConfig - The new agent configuration
 * @param {string} instructions - The new instructions
 * @param {object} avatar - The new avatar
 * @returns {Promise<object>} The updated agent
 */
async function updateDefaultAgent(existingAgent, agentConfig, instructions, avatar) {
  logger.info('Updating existing default agent', {
    agentId: agentConfig.id,
    name: agentConfig.name,
  });

  try {
    const agentData = {
      name: agentConfig.name,
      description: agentConfig.description,
      instructions,
      avatar,
      provider: agentConfig.provider,
      model: agentConfig.model,
      category: agentConfig.category || 'general',
      model_parameters: agentConfig.model_parameters,
      recursion_limit: agentConfig.recursion_limit,
      tools: agentConfig.tools || [],
      tool_resources: agentConfig.tool_resources,
    };

    // Calculate config hash
    const configHash = calculateAgentConfigHash(agentConfig, instructions, avatar);

    // Update the agent
    const updatedAgent = await updateAgent(
      { id: existingAgent.id },
      {
        ...agentData,
        version_metadata: { configHash },
      },
      defaultObjectId,
    );

    logger.info('Updated default agent', {
      agentId: updatedAgent.id,
      name: updatedAgent.name,
    });

    return updatedAgent;
  } catch (error) {
    logger.error('Failed to update default agent', error, {
      agentId: agentConfig.id,
    });
    throw error;
  }
}

/**
 * Syncs a single default agent
 * @param {object} agentConfig - The agent configuration from librechat.yaml
 * @param {string} defaultObjectId - The default object ID
 * @returns {Promise<object>} The synced agent
 */
async function syncAgent(agentConfig, defaultObjectId) {
  const startTime = Date.now();
  logger.info('Starting agent sync', {
    agentId: agentConfig.id,
    name: agentConfig.name,
  });

  try {
    // Validate agent configuration
    const validation = validateAgentConfig(agentConfig);
    if (!validation.valid) {
      throw new Error(`Invalid agent configuration: ${validation.errors.join(', ')}`);
    }

    // Load file-based content
    const { instructions, avatar } = await loadAgentFileContent(agentConfig);

    // Calculate config hash for change detection
    const newConfigHash = calculateAgentConfigHash(agentConfig, instructions, avatar);

    // Check if agent already exists
    const existingAgent = await getAgent({ id: agentConfig.id, author: defaultObjectId });

    let agent;
    let isNew = false;

    if (existingAgent) {
      // Check if update is needed using hash comparison
      const lastVersion = existingAgent.versions?.[existingAgent.versions.length - 1];
      const existingHash = lastVersion?.version_metadata?.configHash;

      if (existingHash && hashesEqual(existingHash, newConfigHash)) {
        logger.info('Agent configuration unchanged, skipping update', {
          agentId: agentConfig.id,
        });
        agent = existingAgent;
      } else {
        logger.info('Agent configuration changed, updating', {
          agentId: agentConfig.id,
          existingHash: existingHash?.substring(0, 8),
          newHash: newConfigHash.substring(0, 8),
        });
        agent = await updateDefaultAgent(existingAgent, agentConfig, instructions, avatar);
      }
    } else {
      logger.info('Agent does not exist, creating new', {
        agentId: agentConfig.id,
      });
      agent = await createDefaultAgent(agentConfig, instructions, avatar, defaultObjectId);
      isNew = true;
    }

    // Sync actions
    const actions = await syncActions(agentConfig.id, agentConfig.actions, defaultObjectId);

    // Update agent's actions array with action IDs
    if (actions.length > 0) {
      const actionIds = actions.map((action) => action.action_id);
      logger.debug('Updating agent with action IDs', {
        agentId: agent.id,
        actionIds,
      });

      // Update the agent with action IDs
      agent = await updateAgent(
        { id: agent.id },
        { actions: actionIds },
        defaultObjectId,
      );
    }

    const duration = Date.now() - startTime;
    logger.info('Agent sync completed', {
      agentId: agent.id,
      name: agent.name,
      isNew,
      actionCount: actions.length,
      duration: `${duration}ms`,
    });

    return agent;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Agent sync failed', error, {
      agentId: agentConfig.id,
      duration: `${duration}ms`,
    });
    throw error;
  }
}

/**
 * Cleans up default agents that were removed from configuration
 * @param {Array<string>} configuredAgentIds - Array of agent IDs from config
 * @param {string} defaultObjectId - The default object ID
 * @returns {Promise<number>} Number of agents removed
 */
async function cleanupRemovedAgents(configuredAgentIds, defaultObjectId) {
  logger.info('Checking for removed default agents', {
    configuredCount: configuredAgentIds.length,
  });

  try {
    // Find all default agents in database
    const Agent = require('~/models/Agent');
    const allDefaultAgents = await Agent.find({ author: defaultObjectId });

    logger.debug('Found default agents in database', {
      count: allDefaultAgents.length,
    });

    // Identify removed agents
    const removedAgents = allDefaultAgents.filter(
      (agent) => !configuredAgentIds.includes(agent.id),
    );

    if (removedAgents.length === 0) {
      logger.info('No agents to remove');
      return 0;
    }

    logger.info('Removing default agents no longer in configuration', {
      count: removedAgents.length,
      agentIds: removedAgents.map((a) => a.id),
    });

    for (const agent of removedAgents) {
      try {
        logger.debug('Deleting agent', {
          agentId: agent.id,
          name: agent.name,
        });

        // Delete associated actions
        if (agent.actions && agent.actions.length > 0) {
          logger.debug('Deleting agent actions', {
            agentId: agent.id,
            actionCount: agent.actions.length,
          });

          for (const actionId of agent.actions) {
            await deleteAction({ action_id: actionId, user: defaultObjectId });
          }
        }

        // Delete the agent
        await deleteAgent({ id: agent.id, author: defaultObjectId });

        logger.info('Deleted agent', {
          agentId: agent.id,
          name: agent.name,
        });
      } catch (error) {
        logger.error('Failed to delete agent', error, {
          agentId: agent.id,
        });
        // Continue with other agents even if one fails
      }
    }

    logger.info('Cleanup completed', {
      removedCount: removedAgents.length,
    });

    return removedAgents.length;
  } catch (error) {
    logger.error('Cleanup failed', error);
    throw error;
  }
}

/**
 * Main synchronization function
 * Syncs all default agents from configuration to database
 *
 * @param {object} config - The parsed librechat.yaml configuration
 * @returns {Promise<{success: boolean, syncedCount: number, removedCount: number, errors: Array}>}
 */
async function syncDefaultAgents(config) {
  const syncStart = Date.now();
  logger.info('=== Starting Default Agents Synchronization ===');

  const defaultObjectId = getDefaultObjectId();
  logger.info('Using default object ID', { defaultObjectId });

  const results = {
    success: true,
    syncedCount: 0,
    removedCount: 0,
    errors: [],
  };

  try {
    // Extract default agents configuration
    const defaultAgents = config?.endpoints?.agents?.defaultAgents;

    if (!defaultAgents || !Array.isArray(defaultAgents) || defaultAgents.length === 0) {
      logger.info('No default agents configured, skipping sync');
      return results;
    }

    logger.info('Found default agents in configuration', {
      count: defaultAgents.length,
    });

    // Sync each agent
    const syncedAgents = [];
    for (const agentConfig of defaultAgents) {
      try {
        const agent = await syncAgent(agentConfig, defaultObjectId);
        syncedAgents.push(agent);
        results.syncedCount++;
      } catch (error) {
        logger.error('Failed to sync agent', error, {
          agentId: agentConfig.id,
        });
        results.errors.push({
          agentId: agentConfig.id,
          error: error.message,
        });
        results.success = false;
        // Continue with other agents
      }
    }

    // Cleanup removed agents
    const configuredAgentIds = defaultAgents.map((a) => a.id);
    const removedCount = await cleanupRemovedAgents(configuredAgentIds, defaultObjectId);
    results.removedCount = removedCount;

    const syncDuration = Date.now() - syncStart;
    logger.info('=== Default Agents Synchronization Completed ===', {
      syncedCount: results.syncedCount,
      removedCount: results.removedCount,
      errorCount: results.errors.length,
      duration: `${syncDuration}ms`,
      success: results.success,
    });

    return results;
  } catch (error) {
    const syncDuration = Date.now() - syncStart;
    logger.error('=== Default Agents Synchronization Failed ===', error, {
      duration: `${syncDuration}ms`,
    });

    results.success = false;
    results.errors.push({
      type: 'sync_failure',
      error: error.message,
    });

    return results;
  }
}

module.exports = {
  syncDefaultAgents,
  syncAgent,
  syncActions,
  cleanupRemovedAgents,
  getDefaultObjectId,
};
