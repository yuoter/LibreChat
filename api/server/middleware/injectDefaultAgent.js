const { logger } = require('@librechat/data-schemas');
const { getAgent } = require('~/models/Agent');

/**
 * Middleware to inject default agent for USER role when no agent is specified.
 * CRITICAL: Only applies to users with role 'USER', never to ADMIN or other roles.
 * MUST run AFTER requireJwtAuth to ensure req.user is populated.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
const injectDefaultAgent = async (req, res, next) => {
  try {
    const { endpoint, agent_id } = req.body;

    // Only inject if agents endpoint AND no agent specified
    if (endpoint === 'agents' && !agent_id) {
      // CRITICAL: Validate authentication data exists
      // This middleware runs AFTER requireJwtAuth, so req.user MUST be present
      // If not, something went wrong and we must reject the request
      if (!req.user || !req.user.role) {
        logger.error(
          '[injectDefaultAgent] Authentication data missing - req.user or req.user.role is undefined',
        );
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const userRole = req.user.role;

      // CRITICAL: Only apply default agent to USER role, never to ADMIN
      if (userRole !== 'USER') {
        return next();
      }

      // Safe to use optional chaining for config objects that may not be configured
      const agentConfig = req.app.locals.appConfig?.endpoints?.agents;
      if (!agentConfig?.enabled || !agentConfig?.defaultAgent) {
        return next();
      }

      const defaultAgentId = agentConfig.defaultAgent;

      // Validate agent exists before injecting
      const agentExists = await getAgent({ id: defaultAgentId });
      if (agentExists) {
        req.body.agent_id = defaultAgentId;
        logger.debug(
          `[injectDefaultAgent] Injected default agent ${defaultAgentId} for user ${req.user.id}`,
        );
      } else {
        logger.warn(`[injectDefaultAgent] Default agent ${defaultAgentId} not found in database`);
      }
    }

    next();
  } catch (error) {
    logger.error('[injectDefaultAgent] Error in middleware:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process agent configuration',
    });
  }
};

module.exports = injectDefaultAgent;
