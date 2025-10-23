const { ResourceType } = require('librechat-data-provider');
const { canAccessResource } = require('./canAccessResource');
const { getAgent } = require('~/models/Agent');
const { getDefaultObjectId } = require('~/server/services/DefaultAgents');
const { logger } = require('@librechat/data-schemas');

/**
 * Agent ID resolver function
 * Resolves custom agent ID (e.g., "agent_abc123") to MongoDB ObjectId
 *
 * @param {string} agentCustomId - Custom agent ID from route parameter
 * @returns {Promise<Object|null>} Agent document with _id field, or null if not found
 */
const resolveAgentId = async (agentCustomId) => {
  return await getAgent({ id: agentCustomId });
};

/**
 * Agent-specific middleware factory that creates middleware to check agent access permissions.
 * This middleware extends the generic canAccessResource to handle agent custom ID resolution.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.requiredPermission - The permission bit required (1=view, 2=edit, 4=delete, 8=share)
 * @param {string} [options.resourceIdParam='id'] - The name of the route parameter containing the agent custom ID
 * @returns {Function} Express middleware function
 *
 * @example
 * // Basic usage for viewing agents
 * router.get('/agents/:id',
 *   canAccessAgentResource({ requiredPermission: 1 }),
 *   getAgent
 * );
 *
 * @example
 * // Custom resource ID parameter and edit permission
 * router.patch('/agents/:agent_id',
 *   canAccessAgentResource({
 *     requiredPermission: 2,
 *     resourceIdParam: 'agent_id'
 *   }),
 *   updateAgent
 * );
 */
const canAccessAgentResource = (options) => {
  const { requiredPermission, resourceIdParam = 'id' } = options;

  if (!requiredPermission || typeof requiredPermission !== 'number') {
    throw new Error('canAccessAgentResource: requiredPermission is required and must be a number');
  }

  // Create a custom middleware that checks for default agents first
  return async (req, res, next) => {
    try {
      const agentCustomId = req.params[resourceIdParam];

      if (!agentCustomId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `${resourceIdParam} is required`,
        });
      }

      // Check if this is a default agent
      const agent = await getAgent({ id: agentCustomId });

      if (!agent) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'agent not found',
        });
      }

      const defaultObjectId = getDefaultObjectId();
      const isDefaultAgent = agent.author.toString() === defaultObjectId;

      if (isDefaultAgent) {
        // Default agents are accessible to all authenticated users for VIEW/USE permissions
        // But not for EDIT/DELETE operations
        const isReadOnlyPermission =
          requiredPermission === 1 || // VIEW
          requiredPermission === 16; // USE

        if (isReadOnlyPermission) {
          logger.debug(
            `[canAccessAgentResource] Granting access to default agent ${agentCustomId}`,
            {
              user: req.user?.id,
              permission: requiredPermission,
            },
          );

          // Grant access and set context
          req.resourceAccess = {
            resourceType: ResourceType.AGENT,
            resourceId: agent._id,
            customResourceId: agentCustomId,
            permission: requiredPermission,
            userId: req.user.id,
            resourceInfo: agent,
            isDefaultAgent: true,
          };

          req.isDefaultAgent = true;
          req.defaultAgent = agent;

          return next();
        } else {
          // Prevent modification of default agents
          logger.warn(
            `[canAccessAgentResource] Attempt to modify default agent ${agentCustomId} blocked`,
            {
              user: req.user?.id,
              permission: requiredPermission,
            },
          );

          return res.status(403).json({
            error: 'Forbidden',
            message: 'Default agents cannot be modified or deleted',
          });
        }
      }

      // Not a default agent, use normal permission check
      return canAccessResource({
        resourceType: ResourceType.AGENT,
        requiredPermission,
        resourceIdParam,
        idResolver: resolveAgentId,
      })(req, res, next);
    } catch (error) {
      logger.error('[canAccessAgentResource] Error checking agent access:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to check agent access',
      });
    }
  };
};

module.exports = {
  canAccessAgentResource,
};
