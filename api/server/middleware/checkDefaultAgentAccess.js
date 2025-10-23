const { logger } = require('@librechat/data-schemas');
const { getAgent } = require('~/models/Agent');
const { getDefaultObjectId } = require('~/server/services/DefaultAgents');

/**
 * Middleware to check if an agent is a default agent and automatically grant access
 * Default agents should be accessible to all authenticated users
 *
 * This middleware should be used BEFORE permission checks for agent routes
 * If the agent is a default agent, it sets req.isDefaultAgent = true
 * which can be used by subsequent middleware to bypass normal permission checks
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function checkDefaultAgentAccess(req, res, next) {
  try {
    const agentId = req.params.id || req.params.agent_id || req.body.agent_id;

    if (!agentId) {
      // No agent ID to check, continue normally
      return next();
    }

    const defaultObjectId = getDefaultObjectId();

    logger.debug('[checkDefaultAgentAccess] Checking if agent is default', {
      agentId,
      defaultObjectId,
    });

    // Check if this agent is a default agent
    const agent = await getAgent({ id: agentId });

    if (!agent) {
      logger.debug('[checkDefaultAgentAccess] Agent not found', { agentId });
      // Agent doesn't exist, let the controller handle it
      return next();
    }

    // Check if agent author is the default object ID
    const isDefaultAgent = agent.author.toString() === defaultObjectId;

    if (isDefaultAgent) {
      logger.debug('[checkDefaultAgentAccess] Agent is a default agent, granting access', {
        agentId,
        agentName: agent.name,
      });

      // Mark this request as accessing a default agent
      req.isDefaultAgent = true;
      req.defaultAgent = agent;

      // Automatically grant VIEW permission for default agents
      // This allows the permission middleware to pass
      req.hasDefaultAgentAccess = true;
    } else {
      logger.debug('[checkDefaultAgentAccess] Agent is not a default agent', {
        agentId,
        author: agent.author.toString(),
      });
    }

    next();
  } catch (error) {
    logger.error('[checkDefaultAgentAccess] Error checking default agent access', {
      error: error.message,
      stack: error.stack,
      agentId: req.params.id || req.params.agent_id,
    });

    // Don't fail the request, just continue with normal permission checks
    next();
  }
}

/**
 * Middleware to prevent editing/deleting default agents
 * Should be used on UPDATE and DELETE routes
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function preventDefaultAgentModification(req, res, next) {
  if (req.isDefaultAgent) {
    logger.warn('[preventDefaultAgentModification] Attempt to modify default agent blocked', {
      agentId: req.params.id || req.params.agent_id,
      user: req.user?.id,
      method: req.method,
    });

    return res.status(403).json({
      error: 'Cannot modify default agents',
      message: 'Default agents defined in configuration cannot be edited or deleted through the API',
    });
  }

  next();
}

module.exports = {
  checkDefaultAgentAccess,
  preventDefaultAgentModification,
};
