import { EModelEndpoint, agentsEndpointSchema } from 'librechat-data-provider';
import type { TCustomConfig, TAgentsEndpoint } from 'librechat-data-provider';
import logger from '~/config/winston';

/**
 * Sets up the Agents configuration from the config (`librechat.yaml`) file.
 * If no agents config is defined, uses the provided defaults or parses empty object.
 *
 * @param config - The loaded custom configuration.
 * @param [defaultConfig] - Default configuration from getConfigDefaults.
 * @returns The Agents endpoint configuration.
 */
export function agentsConfigSetup(
  config: Partial<TCustomConfig>,
  defaultConfig?: Partial<TAgentsEndpoint>,
): Partial<TAgentsEndpoint> {
  const agentsConfig = config?.endpoints?.[EModelEndpoint.agents];

  if (!agentsConfig) {
    logger.info('[agentsConfigSetup] No agents config found in librechat.yaml, using defaults');
    return defaultConfig || agentsEndpointSchema.parse({});
  }

  logger.info('[agentsConfigSetup] Parsing agents configuration from librechat.yaml');
  const parsedConfig = agentsEndpointSchema.parse(agentsConfig);

  if (parsedConfig.agentsAdminObjectId) {
    logger.info(
      `[agentsConfigSetup] agentsAdminObjectId detected: ${parsedConfig.agentsAdminObjectId}`,
    );
    logger.info(
      '[agentsConfigSetup] Agent Builder panel will be restricted to the specified user ObjectId',
    );
  } else {
    logger.info('[agentsConfigSetup] agentsAdminObjectId not set');
    logger.info(
      '[agentsConfigSetup] Agent Builder panel will be available to all users with CREATE permission',
    );
  }

  if (parsedConfig.disableBuilder) {
    logger.info('[agentsConfigSetup] Agent Builder is disabled for all users (disableBuilder: true)');
  }

  return parsedConfig;
}
