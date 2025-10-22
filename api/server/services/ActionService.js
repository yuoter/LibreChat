const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { nanoid } = require('nanoid');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { GraphEvents, sleep } = require('@librechat/agents');
const {
  sendEvent,
  encryptV2,
  decryptV2,
  logAxiosError,
  refreshAccessToken,
} = require('@librechat/api');
const {
  Time,
  CacheKeys,
  StepTypes,
  Constants,
  AuthTypeEnum,
  actionDelimiter,
  isImageVisionTool,
  actionDomainSeparator,
  extractEnvVariable,
} = require('librechat-data-provider');
const { findToken, updateToken, createToken } = require('~/models');
const { getActions, deleteActions, updateAction } = require('~/models/Action');
const { deleteAssistant } = require('~/models/Assistant');
const { getFlowStateManager } = require('~/config');
const { getLogStores } = require('~/cache');

const JWT_SECRET = process.env.JWT_SECRET;
const toolNameRegex = /^[a-zA-Z0-9_-]+$/;
const replaceSeparatorRegex = new RegExp(actionDomainSeparator, 'g');

// In-memory cache for default actions
let defaultActionsCache = null;
let defaultActionsCacheTimestamp = 0;
const DEFAULT_ACTIONS_CACHE_TTL = Time.TEN_MINUTES; // Cache for 10 minutes

/**
 * Validates tool name against regex pattern and updates if necessary.
 * @param {object} params - The parameters for the function.
 * @param {object} params.req - Express Request.
 * @param {FunctionTool} params.tool - The tool object.
 * @param {string} params.assistant_id - The assistant ID
 * @returns {object|null} - Updated tool object or null if invalid and not an action.
 */
const validateAndUpdateTool = async ({ req, tool, assistant_id }) => {
  let actions;
  if (isImageVisionTool(tool)) {
    return null;
  }
  if (!toolNameRegex.test(tool.function.name)) {
    const [functionName, domain] = tool.function.name.split(actionDelimiter);
    actions = await getActions({ assistant_id, user: req.user.id }, true);
    const matchingActions = actions.filter((action) => {
      const metadata = action.metadata;
      return metadata && metadata.domain === domain;
    });
    const action = matchingActions[0];
    if (!action) {
      return null;
    }

    const parsedDomain = await domainParser(domain, true);

    if (!parsedDomain) {
      return null;
    }

    tool.function.name = `${functionName}${actionDelimiter}${parsedDomain}`;
  }
  return tool;
};

/**
 * Encodes or decodes a domain name to/from base64, or replacing periods with a custom separator.
 *
 * Necessary due to `[a-zA-Z0-9_-]*` Regex Validation, limited to a 64-character maximum.
 *
 * @param {string} domain - The domain name to encode/decode.
 * @param {boolean} inverse - False to decode from base64, true to encode to base64.
 * @returns {Promise<string>} Encoded or decoded domain string.
 */
async function domainParser(domain, inverse = false) {
  if (!domain) {
    return;
  }
  const domainsCache = getLogStores(CacheKeys.ENCODED_DOMAINS);
  const cachedDomain = await domainsCache.get(domain);
  if (inverse && cachedDomain) {
    return domain;
  }

  if (inverse && domain.length <= Constants.ENCODED_DOMAIN_LENGTH) {
    return domain.replace(/\./g, actionDomainSeparator);
  }

  if (inverse) {
    const modifiedDomain = Buffer.from(domain).toString('base64');
    const key = modifiedDomain.substring(0, Constants.ENCODED_DOMAIN_LENGTH);
    await domainsCache.set(key, modifiedDomain);
    return key;
  }

  if (!cachedDomain) {
    return domain.replace(replaceSeparatorRegex, '.');
  }

  try {
    return Buffer.from(cachedDomain, 'base64').toString('utf-8');
  } catch (error) {
    logger.error(`Failed to parse domain (possibly not base64): ${domain}`, error);
    return domain;
  }
}

/**
 * Loads action sets based on the user and assistant ID.
 *
 * @param {Object} searchParams - The parameters for loading action sets.
 * @param {string} searchParams.user - The user identifier.
 * @param {string} [searchParams.agent_id]- The agent identifier.
 * @param {string} [searchParams.assistant_id]- The assistant identifier.
 * @returns {Promise<Action[] | null>} A promise that resolves to an array of actions or `null` if no match.
 */
async function loadActionSets(searchParams) {
  return await getActions(searchParams, true);
}

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {string} params.userId
 * @param {ServerResponse} params.res
 * @param {Action} params.action - The action set. Necessary for decrypting authentication values.
 * @param {ActionRequest} params.requestBuilder - The ActionRequest builder class to execute the API call.
 * @param {string | undefined} [params.name] - The name of the tool.
 * @param {string | undefined} [params.description] - The description for the tool.
 * @param {import('zod').ZodTypeAny | undefined} [params.zodSchema] - The Zod schema for tool input validation/definition
 * @param {{ oauth_client_id?: string; oauth_client_secret?: string; }} params.encrypted - The encrypted values for the action.
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createActionTool({
  userId,
  res,
  action,
  requestBuilder,
  zodSchema,
  name,
  description,
  encrypted,
}) {
  /** @type {(toolInput: Object | string, config: GraphRunnableConfig) => Promise<unknown>} */
  const _call = async (toolInput, config) => {
    try {
      /** @type {import('librechat-data-provider').ActionMetadataRuntime} */
      const metadata = action.metadata;
      const executor = requestBuilder.createExecutor();
      const preparedExecutor = executor.setParams(toolInput ?? {});

      if (metadata.auth && metadata.auth.type !== AuthTypeEnum.None) {
        try {
          if (metadata.auth.type === AuthTypeEnum.OAuth && metadata.auth.authorization_url) {
            const action_id = action.action_id;
            const identifier = `${userId}:${action.action_id}`;
            const requestLogin = async () => {
              const { args: _args, stepId, ...toolCall } = config.toolCall ?? {};
              if (!stepId) {
                throw new Error('Tool call is missing stepId');
              }
              const statePayload = {
                nonce: nanoid(),
                user: userId,
                action_id,
              };

              const stateToken = jwt.sign(statePayload, JWT_SECRET, { expiresIn: '10m' });
              try {
                const redirectUri = `${process.env.DOMAIN_CLIENT}/api/actions/${action_id}/oauth/callback`;
                const params = new URLSearchParams({
                  client_id: metadata.oauth_client_id,
                  scope: metadata.auth.scope,
                  redirect_uri: redirectUri,
                  access_type: 'offline',
                  response_type: 'code',
                  state: stateToken,
                });

                const authURL = `${metadata.auth.authorization_url}?${params.toString()}`;
                /** @type {{ id: string; delta: AgentToolCallDelta }} */
                const data = {
                  id: stepId,
                  delta: {
                    type: StepTypes.TOOL_CALLS,
                    tool_calls: [{ ...toolCall, args: '' }],
                    auth: authURL,
                    expires_at: Date.now() + Time.TWO_MINUTES,
                  },
                };
                const flowsCache = getLogStores(CacheKeys.FLOWS);
                const flowManager = getFlowStateManager(flowsCache);
                await flowManager.createFlowWithHandler(
                  `${identifier}:oauth_login:${config.metadata.thread_id}:${config.metadata.run_id}`,
                  'oauth_login',
                  async () => {
                    sendEvent(res, { event: GraphEvents.ON_RUN_STEP_DELTA, data });
                    logger.debug('Sent OAuth login request to client', { action_id, identifier });
                    return true;
                  },
                  config?.signal,
                );
                logger.debug('Waiting for OAuth Authorization response', { action_id, identifier });
                const result = await flowManager.createFlow(
                  identifier,
                  'oauth',
                  {
                    state: stateToken,
                    userId: userId,
                    client_url: metadata.auth.client_url,
                    redirect_uri: `${process.env.DOMAIN_SERVER}/api/actions/${action_id}/oauth/callback`,
                    token_exchange_method: metadata.auth.token_exchange_method,
                    /** Encrypted values */
                    encrypted_oauth_client_id: encrypted.oauth_client_id,
                    encrypted_oauth_client_secret: encrypted.oauth_client_secret,
                  },
                  config?.signal,
                );
                logger.debug('Received OAuth Authorization response', { action_id, identifier });
                data.delta.auth = undefined;
                data.delta.expires_at = undefined;
                sendEvent(res, { event: GraphEvents.ON_RUN_STEP_DELTA, data });
                await sleep(3000);
                metadata.oauth_access_token = result.access_token;
                metadata.oauth_refresh_token = result.refresh_token;
                const expiresAt = new Date(Date.now() + result.expires_in * 1000);
                metadata.oauth_token_expires_at = expiresAt.toISOString();
              } catch (error) {
                const errorMessage = 'Failed to authenticate OAuth tool';
                logger.error(errorMessage, error);
                throw new Error(errorMessage);
              }
            };

            const tokenPromises = [];
            tokenPromises.push(findToken({ userId, type: 'oauth', identifier }));
            tokenPromises.push(
              findToken({
                userId,
                type: 'oauth_refresh',
                identifier: `${identifier}:refresh`,
              }),
            );
            const [tokenData, refreshTokenData] = await Promise.all(tokenPromises);

            if (tokenData) {
              // Valid token exists, add it to metadata for setAuth
              metadata.oauth_access_token = await decryptV2(tokenData.token);
              if (refreshTokenData) {
                metadata.oauth_refresh_token = await decryptV2(refreshTokenData.token);
              }
              metadata.oauth_token_expires_at = tokenData.expiresAt.toISOString();
            } else if (!refreshTokenData) {
              // No tokens exist, need to authenticate
              await requestLogin();
            } else if (refreshTokenData) {
              // Refresh token is still valid, use it to get new access token
              try {
                const refresh_token = await decryptV2(refreshTokenData.token);
                const refreshTokens = async () =>
                  await refreshAccessToken(
                    {
                      userId,
                      identifier,
                      refresh_token,
                      client_url: metadata.auth.client_url,
                      encrypted_oauth_client_id: encrypted.oauth_client_id,
                      token_exchange_method: metadata.auth.token_exchange_method,
                      encrypted_oauth_client_secret: encrypted.oauth_client_secret,
                    },
                    {
                      findToken,
                      updateToken,
                      createToken,
                    },
                  );
                const flowsCache = getLogStores(CacheKeys.FLOWS);
                const flowManager = getFlowStateManager(flowsCache);
                const refreshData = await flowManager.createFlowWithHandler(
                  `${identifier}:refresh`,
                  'oauth_refresh',
                  refreshTokens,
                  config?.signal,
                );
                metadata.oauth_access_token = refreshData.access_token;
                if (refreshData.refresh_token) {
                  metadata.oauth_refresh_token = refreshData.refresh_token;
                }
                const expiresAt = new Date(Date.now() + refreshData.expires_in * 1000);
                metadata.oauth_token_expires_at = expiresAt.toISOString();
              } catch (error) {
                logger.error('Failed to refresh token, requesting new login:', error);
                await requestLogin();
              }
            } else {
              await requestLogin();
            }
          }

          await preparedExecutor.setAuth(metadata);
        } catch (error) {
          if (
            error.message.includes('No access token found') ||
            error.message.includes('Access token is expired')
          ) {
            throw error;
          }
          throw new Error(`Authentication failed: ${error.message}`);
        }
      }

      const response = await preparedExecutor.execute();

      if (typeof response.data === 'object') {
        return JSON.stringify(response.data);
      }
      return response.data;
    } catch (error) {
      const message = `API call to ${action.metadata.domain} failed:`;
      return logAxiosError({ message, error });
    }
  };

  if (name) {
    return tool(_call, {
      name: name.replace(replaceSeparatorRegex, '_'),
      description: description || '',
      schema: zodSchema,
    });
  }

  return {
    _call,
  };
}

/**
 * Encrypts a sensitive value.
 * @param {string} value
 * @returns {Promise<string>}
 */
async function encryptSensitiveValue(value) {
  // Encode API key to handle special characters like ":"
  const encodedValue = encodeURIComponent(value);
  return await encryptV2(encodedValue);
}

/**
 * Decrypts a sensitive value.
 * @param {string} value
 * @returns {Promise<string>}
 */
async function decryptSensitiveValue(value) {
  const decryptedValue = await decryptV2(value);
  return decodeURIComponent(decryptedValue);
}

/**
 * Encrypts sensitive metadata values for an action.
 *
 * @param {ActionMetadata} metadata - The action metadata to encrypt.
 * @returns {Promise<ActionMetadata>} The updated action metadata with encrypted values.
 */
async function encryptMetadata(metadata) {
  const encryptedMetadata = { ...metadata };

  // ServiceHttp
  if (metadata.auth && metadata.auth.type === AuthTypeEnum.ServiceHttp) {
    if (metadata.api_key) {
      encryptedMetadata.api_key = await encryptSensitiveValue(metadata.api_key);
    }
  }

  // OAuth
  else if (metadata.auth && metadata.auth.type === AuthTypeEnum.OAuth) {
    if (metadata.oauth_client_id) {
      encryptedMetadata.oauth_client_id = await encryptSensitiveValue(metadata.oauth_client_id);
    }
    if (metadata.oauth_client_secret) {
      encryptedMetadata.oauth_client_secret = await encryptSensitiveValue(
        metadata.oauth_client_secret,
      );
    }
  }

  return encryptedMetadata;
}

/**
 * Decrypts sensitive metadata values for an action.
 *
 * @param {ActionMetadata} metadata - The action metadata to decrypt.
 * @returns {Promise<ActionMetadata>} The updated action metadata with decrypted values.
 */
async function decryptMetadata(metadata) {
  const decryptedMetadata = { ...metadata };

  // ServiceHttp
  if (metadata.auth && metadata.auth.type === AuthTypeEnum.ServiceHttp) {
    if (metadata.api_key) {
      decryptedMetadata.api_key = await decryptSensitiveValue(metadata.api_key);
    }
  }

  // OAuth
  else if (metadata.auth && metadata.auth.type === AuthTypeEnum.OAuth) {
    if (metadata.oauth_client_id) {
      decryptedMetadata.oauth_client_id = await decryptSensitiveValue(metadata.oauth_client_id);
    }
    if (metadata.oauth_client_secret) {
      decryptedMetadata.oauth_client_secret = await decryptSensitiveValue(
        metadata.oauth_client_secret,
      );
    }
  }

  return decryptedMetadata;
}

/**
 * Deletes an action and its corresponding assistant.
 * @param {Object} params - The parameters for the function.
 * @param {OpenAIClient} params.req - The Express Request object.
 * @param {string} params.assistant_id - The ID of the assistant.
 */
const deleteAssistantActions = async ({ req, assistant_id }) => {
  try {
    await deleteActions({ assistant_id, user: req.user.id });
    await deleteAssistant({ assistant_id, user: req.user.id });
  } catch (error) {
    const message = 'Trouble deleting Assistant Actions for Assistant ID: ' + assistant_id;
    logger.error(message, error);
    throw new Error(message);
  }
};

/**
 * Fetches OpenAPI specification from a URL.
 *
 * @param {string} url - The URL to fetch the OpenAPI spec from.
 * @returns {Promise<string>} The OpenAPI spec as a string.
 */
async function fetchOpenAPISpec(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        Accept: 'application/json, application/yaml, text/yaml',
      },
    });
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  } catch (error) {
    logger.error(`Failed to fetch OpenAPI spec from ${url}`, error);
    throw new Error(`Failed to fetch OpenAPI spec from ${url}: ${error.message}`);
  }
}

/**
 * Loads default actions from the application configuration.
 *
 * @param {Object} appConfig - The application configuration object.
 * @returns {Promise<Array<Object>>} Array of default action configurations.
 */
async function loadDefaultActionsFromConfig(appConfig) {
  const defaultActions = appConfig?.actions?.defaults;
  if (!defaultActions || !Array.isArray(defaultActions)) {
    return [];
  }

  const processedActions = [];

  for (const actionConfig of defaultActions) {
    try {
      // Validate required fields
      if (!actionConfig.name || !actionConfig.domain) {
        logger.warn('Skipping default action: missing name or domain', { actionConfig });
        continue;
      }

      // Get OpenAPI spec from URL or inline
      let rawSpec;
      if (actionConfig.openapi_spec_url) {
        rawSpec = await fetchOpenAPISpec(actionConfig.openapi_spec_url);
      } else if (actionConfig.openapi_spec) {
        rawSpec = typeof actionConfig.openapi_spec === 'string'
          ? actionConfig.openapi_spec
          : JSON.stringify(actionConfig.openapi_spec);
      } else {
        logger.warn('Skipping default action: missing openapi_spec or openapi_spec_url', {
          name: actionConfig.name,
        });
        continue;
      }

      // Process auth configuration
      const auth = actionConfig.auth || { type: 'none' };
      let apiKey;
      let oauthClientId;
      let oauthClientSecret;

      if (auth.type === 'service_http' && auth.api_key) {
        // Extract environment variable if present
        apiKey = extractEnvVariable(auth.api_key);
      } else if (auth.type === 'oauth') {
        if (auth.oauth_client_id) {
          oauthClientId = extractEnvVariable(auth.oauth_client_id);
        }
        if (auth.oauth_client_secret) {
          oauthClientSecret = extractEnvVariable(auth.oauth_client_secret);
        }
      }

      // Build action object
      const action = {
        name: actionConfig.name,
        domain: actionConfig.domain,
        description: actionConfig.description,
        metadata: {
          domain: actionConfig.domain,
          raw_spec: rawSpec,
          auth: {
            type: auth.type || 'none',
            authorization_type: auth.authorization_type,
            custom_auth_header: auth.custom_auth_header,
            authorization_content_type: auth.authorization_content_type,
            authorization_url: auth.authorization_url,
            client_url: auth.client_url,
            scope: auth.scope,
            token_exchange_method: auth.token_exchange_method || null,
          },
          privacy_policy_url: actionConfig.privacy_policy_url,
        },
      };

      // Add sensitive fields
      if (apiKey) {
        action.metadata.api_key = apiKey;
      }
      if (oauthClientId) {
        action.metadata.oauth_client_id = oauthClientId;
      }
      if (oauthClientSecret) {
        action.metadata.oauth_client_secret = oauthClientSecret;
      }

      processedActions.push(action);
    } catch (error) {
      logger.error(`Error processing default action ${actionConfig.name}`, error);
    }
  }

  return processedActions;
}

/**
 * Generates a hash of the default actions configuration for change detection.
 *
 * @param {Array<Object>} defaultActions - Array of default action configurations.
 * @returns {string} SHA256 hash of the configuration.
 */
function hashDefaultActionsConfig(defaultActions) {
  if (!defaultActions || defaultActions.length === 0) {
    return '';
  }
  const configString = JSON.stringify(defaultActions);
  return crypto.createHash('sha256').update(configString).digest('hex');
}

/**
 * Seeds or updates default actions in the database.
 * Uses a special system user ID for default actions.
 *
 * @param {Object} appConfig - The application configuration object.
 * @returns {Promise<void>}
 */
async function seedDefaultActions(appConfig) {
  const SYSTEM_USER_ID = 'system_default_actions';

  try {
    const defaultActions = await loadDefaultActionsFromConfig(appConfig);

    if (defaultActions.length === 0) {
      logger.info('No default actions configured in librechat.yaml');
      return;
    }

    // Calculate hash of current configuration
    const currentHash = hashDefaultActionsConfig(appConfig?.actions?.defaults);

    // Check if we have a stored hash from previous seed
    const hashCache = getLogStores(CacheKeys.CONFIG_STORE);
    const storedHash = await hashCache.get('default_actions_hash');

    if (storedHash === currentHash) {
      logger.info('Default actions configuration unchanged, skipping seed');
      return;
    }

    logger.info(`Seeding ${defaultActions.length} default actions into database...`);

    for (const action of defaultActions) {
      try {
        // Encrypt sensitive metadata
        const encryptedMetadata = await encryptMetadata(action.metadata);

        // Create or update the action
        const actionData = {
          user: SYSTEM_USER_ID,
          action_id: `default_${action.domain}`,
          type: 'default_action',
          metadata: encryptedMetadata,
        };

        await updateAction(
          { action_id: actionData.action_id, user: SYSTEM_USER_ID },
          actionData,
        );

        logger.info(`Seeded default action: ${action.name} (${action.domain})`);
      } catch (error) {
        logger.error(`Failed to seed default action ${action.name}`, error);
      }
    }

    // Store the hash for future comparisons
    await hashCache.set('default_actions_hash', currentHash);

    // Clear the in-memory caches to force reload
    clearDefaultActionsCache();

    // Also clear the processed action cache in ToolService
    // Require here to avoid circular dependency
    const { clearProcessedActionCache } = require('./ToolService');
    clearProcessedActionCache();

    logger.info('Default actions seeding completed');
  } catch (error) {
    logger.error('Error seeding default actions', error);
  }
}

/**
 * Clears the in-memory cache for default actions.
 */
function clearDefaultActionsCache() {
  defaultActionsCache = null;
  defaultActionsCacheTimestamp = 0;
  logger.debug('Default actions cache cleared');
}

/**
 * Loads default actions from the database with caching.
 * Default actions are identified by the system user ID.
 * Results are cached in memory for 10 minutes to avoid repeated DB queries and OpenAPI parsing.
 *
 * @returns {Promise<Action[] | null>} A promise that resolves to an array of default actions.
 */
async function loadDefaultActionSets() {
  const SYSTEM_USER_ID = 'system_default_actions';

  // Check if cache is still valid
  const now = Date.now();
  if (defaultActionsCache && now - defaultActionsCacheTimestamp < DEFAULT_ACTIONS_CACHE_TTL) {
    logger.debug('Returning cached default actions');
    return defaultActionsCache;
  }

  // Load from database
  logger.debug('Loading default actions from database');
  const actions = await getActions({ user: SYSTEM_USER_ID }, true);

  // Update cache
  defaultActionsCache = actions;
  defaultActionsCacheTimestamp = now;

  return actions;
}

module.exports = {
  deleteAssistantActions,
  validateAndUpdateTool,
  createActionTool,
  encryptMetadata,
  decryptMetadata,
  loadActionSets,
  domainParser,
  seedDefaultActions,
  loadDefaultActionSets,
  clearDefaultActionsCache,
};
