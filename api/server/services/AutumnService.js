const { logger } = require('@librechat/data-schemas');

// ./services/AutumnService.js
// ----------------------------------------------------------------------------------
// Centralised wrapper for all interactions with UseAutumn billing API
// ----------------------------------------------------------------------------------
// This module must only be imported server‑side. Never expose the secret key to the
// client bundle!
// ----------------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// ENV / CONFIG
// -----------------------------------------------------------------------------
/*
  The following constants mirror the TypeScript version and keep the same names
  for easy comparison. Values are injected from the environment or fixed per task.

  - useAutumnKey                // Autumn secret API key (am_sk_…)
  - useAutumnApiBase                 // Base URL for all UseAutumn endpoints
  - useAutumnProductId               // Your Autumn product ID
  - useAutumnTokenCreditsFeatureId   // Feature holding the token‑credit balance
  - useAutumnHasSubscriptionFeatureId// Feature indicating a paid subscription
*/
const applyUseAutumnKey = require('../../utils/applyUseAutumnKey');

const sanitizeEnv = (value) => (typeof value === 'string' ? value.trim() : '');

applyUseAutumnKey();

const useAutumnKey = sanitizeEnv(process.env.USEAUTUMN_KEY);
const useAutumnApiBase = sanitizeEnv(process.env.USEAUTUMN_API_BASE);
const useAutumnProductId = sanitizeEnv(process.env.USEAUTUMN_PRODUCT_ID);
const useAutumnTokenCreditsFeatureId = sanitizeEnv(process.env.USEAUTUMN_TOKEN_CREDITS_FEATURE_ID);
const useAutumnHasSubscriptionFeatureId = sanitizeEnv(process.env.USEAUTUMN_HAS_SUBSCRIPTION_FEATURE_ID);
const successUrlForStripe = sanitizeEnv(process.env.SUCCESS_URL_FOR_STRIPE);
const cancelUrlForStripe = sanitizeEnv(process.env.CANCEL_URL_FOR_STRIPE);

const missingAutumnConfig = [
  ['USEAUTUMN_KEY', useAutumnKey],
  ['USEAUTUMN_API_BASE', useAutumnApiBase],
  ['USEAUTUMN_PRODUCT_ID', useAutumnProductId],
  ['USEAUTUMN_TOKEN_CREDITS_FEATURE_ID', useAutumnTokenCreditsFeatureId],
  ['USEAUTUMN_HAS_SUBSCRIPTION_FEATURE_ID', useAutumnHasSubscriptionFeatureId],
].filter(([, value]) => !value);


// -----------------------------------------------------------------------------
// Low-level HTTP helper (no external deps; works on Node and Edge runtimes)
// -----------------------------------------------------------------------------
async function requestJson(method, path, body) {
  const url = path.startsWith('http') ? path : `${useAutumnApiBase}${path}`;
  
  if (missingAutumnConfig.length > 0) {
  const missingKeys = missingAutumnConfig.map(([key]) => key).join(', ');
  throw new Error(`Missing required Autumn configuration values: ${missingKeys}`);}
  
  const headers = {
    Authorization: `Bearer ${useAutumnKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Prefer global fetch if available; otherwise use https fallback
  if (typeof fetch === 'function') {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const json = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const message = `${method} ${url} failed with ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = json ?? text;
      throw error;
    }

    return { data: json };
  }

  // Node https fallback (no node-fetch)
  const { request } = await import('node:https');
  const { URL } = await import('node:url');

  const u = new URL(url);

  const options = {
    method,
    hostname: u.hostname,
    path: `${u.pathname}${u.search}`,
    port: u.port || 443,
    headers,
  };

  const payload = body ? JSON.stringify(body) : undefined;
  if (payload) {
    options.headers['Content-Length'] = Buffer.byteLength(payload);
  }

  const raw = await new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        const json = bodyStr ? safeJsonParse(bodyStr) : null;
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(json);
        } else {
          const message = `${method} ${url} failed with ${res.statusCode}`;
          const error = new Error(message);
          error.status = res.statusCode;
          error.payload = json ?? bodyStr;
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

  return { data: raw };
}

// -----------------------------------------------------------------------------
// Client instance (shim) to mirror the TypeScript structure without autumn-js
// -----------------------------------------------------------------------------
const autumn = {
  customers: {
    async get(customerId) {
      return requestJson('GET', `/customers/${encodeURIComponent(customerId)}`);
    },
  },
  async check(payload) {
    return requestJson('POST', '/check', payload);
  },
  async track(payload) {
    return requestJson('POST', '/track', payload);
  },
  async attach(payload) {
    return requestJson('POST', '/attach', payload);
  },
};

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 250;

/**
 * Safely parse JSON without throwing
 */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Generic retry helper with exponential back‑off.
 */
async function withRetry(fn, retries = MAX_RETRIES) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) throw error;
      const delay = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Builds a predictable idempotency key so that usage events are never double‑billed.
 */
function buildIdempotencyKey(customerId) {
  const uuid = generateUuidV4();
  logger.warn({ uuid }, 'For debugging: generateUuidV4 called');
  return `track-${customerId}-${uuid}`;
}

function generateUuidV4() {
  logger.warn('For debugging: generateUuidV4 called');
  // Lightweight v4 UUID generator without external deps
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// -----------------------------------------------------------------------------
// Autumn API wrappers
// -----------------------------------------------------------------------------

/**
 * Fetch the user’s remaining token‑credit balance from Autumn.
 * @return Number of remaining credits (0 if the feature is missing).
 */
async function fetchTokenBalanceAutumn({ openidId }) {
  try {
    logger.warn('For debugging: fetchTokenBalanceAutumn called');
    // Basic input validation
    if (!openidId) {
      logger.error({ openidId }, 'fetchTokenBalanceAutumn called without openidId');
      return 0;
    }
    
    const { data } = await withRetry(() => autumn.customers.get(openidId));

    if (!data) {
      logger.warn({ openidId }, 'Autumn returned no data for customer');
      return 0;
    }

    const { features } = data;

    if (!features) {
      logger.warn({ openidId }, 'Autumn response missing features');
      return 0;
    }

    // Newer API shape: features is a map keyed by feature_id
    if (!Array.isArray(features) && typeof features === 'object') {
      const entry = features[useAutumnTokenCreditsFeatureId];

      if (typeof entry === 'undefined') {
        logger.warn(
          { openidId, featureId: useAutumnTokenCreditsFeatureId },
          'token-credits feature not found in features map',
        );
        return 0;
      }

      if (entry && typeof entry.balance !== 'undefined') {
        const numeric = Number(entry.balance);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          logger.warn(
            { openidId, featureId: useAutumnTokenCreditsFeatureId, balance: entry.balance },
            'Non-positive or invalid balance in features map',
          );
          return 0;
        }
        return numeric;
      }

      if (typeof entry === 'number') {
        const numeric = Number(entry);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          logger.warn(
            { openidId, featureId: useAutumnTokenCreditsFeatureId, balance: entry },
            'Non-positive or invalid numeric entry in features map',
          );
          return 0;
        }
        return numeric;
      }

      logger.warn(
        { openidId, featureId: useAutumnTokenCreditsFeatureId, entryType: typeof entry },
        'Unexpected entry type for token-credits feature in features map',
      );
      return 0;
    }
  } catch (err) {
    logger.error({ err, openidId }, 'Failed to fetch token balance from Autumn');
    return 0;
  }
}

/**
 * Check if the customer currently has an active subscription.
 */

async function hasSubscriptionAutumn({ openidId, email }) {
  const payload = {
    customer_id: openidId,
    feature_id: useAutumnHasSubscriptionFeatureId,
    // Include customer_data so /check can auto-create the customer if missing
    customer_data: { email, fingerprint: email },
  };

  try {
    logger.warn('For debugging: hasSubscriptionAutumn called');
    // Basic input validation
    if (!openidId) {
      logger.error({ openidId }, 'hasSubscriptionAutumn called without openidId');
      return false;
    }
    const { data } = await withRetry(() => autumn.check(payload));

    if (!data) {
      logger.warn({ openidId }, 'Autumn /check returned no data');
      return false;
    }

    if (typeof data.allowed === 'undefined') {
      logger.warn({ openidId, keys: Object.keys(data) }, 'Autumn /check missing "allowed" flag');
      return false;
    }

    // Coerce but warn on non-boolean to catch upstream shape drift
    if (typeof data.allowed !== 'boolean') {
      logger.warn(
        { openidId, allowedType: typeof data.allowed, allowed: data.allowed },
        'Autumn /check "allowed" is not boolean; coercing to Boolean',
      );
    }

    return Boolean(data.allowed);
  } catch (err) {
    logger.error({ err, openidId }, 'Failed to check subscription with Autumn');
    return false;
  }
}

/**
 * Record token usage so that Autumn decrements the customer’s balance.
 * Idempotent thanks to the key.
 */
async function recordUsageAutumn({
  openidId,
  usedTokens,
  idempotencyKey = buildIdempotencyKey(openidId),
}) {
  logger.warn('For debugging: recordUsageAutumn called');
  // Validate inputs early
  if (!openidId) {
    logger.error({ openidId }, 'recordUsageAutumn called without openidId');
    return;
  }

  const numeric = Number(usedTokens);
  if (!Number.isFinite(numeric)) {
    logger.error({ openidId, usedTokens }, 'recordUsageAutumn called with non-numeric usedTokens');
    return;
  }
  if (numeric <= 0) {
    logger.warn({ openidId, usedTokens: numeric }, 'Non-positive usedTokens; skipping usage record');
    return;
  }

  try {
    const res = await withRetry(() =>
      autumn.track({
        customer_id: openidId,
        product_id: useAutumnProductId,
        feature_id: useAutumnTokenCreditsFeatureId,
        value: numeric,
        idempotency_key: idempotencyKey,
      }),
    );

    // If the client exposes an HTTP status, flag unexpected statuses
    const status = res?.status ?? res?.data?.status;
    if (typeof status === 'number' && status >= 400) {
      logger.warn(
        { openidId, status, idempotencyKey },
        'Autumn.track responded with non-success status',
      );
    }
  } catch (err) {
    // Treat idempotency collisions as a warning (already processed)
    const httpStatus = err?.response?.status;
    if (httpStatus === 409) {
      logger.warn(
        { openidId, idempotencyKey },
        'Idempotency conflict from Autumn; assuming usage already recorded',
      );
      return;
    }

    logger.error(
      { err, openidId, idempotencyKey, usedTokens: numeric },
      'Failed to record usage with Autumn',
    );
  }
}

/**
 * Create (or attach) a subscription checkout session when the user has no credits
 * and no existing subscription. Returns the Stripe Checkout URL.
 */
async function createCheckoutAutumn({ openidId, email, fingerprint }) {
  logger.warn('For debugging: createCheckoutAutumn called');
  // Basic input validation
  if (!openidId) {
    logger.error({ openidId }, 'createCheckoutAutumn called without openidId');
    return undefined;
  }
  if (!email) {
    logger.error({ openidId }, 'createCheckoutAutumn called without email');
    return undefined;
  }
  if (!fingerprint) {
    logger.warn({ openidId }, 'createCheckoutAutumn called without fingerprint');
  }

  try {
    const checkoutOverrides = {};

    if (successUrlForStripe) {
      checkoutOverrides.success_url = successUrlForStripe;
    }

    if (cancelUrlForStripe) {
      checkoutOverrides.cancel_url = cancelUrlForStripe;
    }

    const attachPayload = {
      customer_id: openidId,
      product_id: useAutumnProductId,
      force_checkout: true,
      customer_data: {
        email,
        fingerprint,
      },
    };

    if (checkoutOverrides.success_url && checkoutOverrides.cancel_url) {
      attachPayload.checkout = checkoutOverrides;
    }

    const res = await withRetry(() => autumn.attach(attachPayload));

    const status = res?.status ?? res?.data?.status;
    if (typeof status === 'number' && status >= 400) {
      logger.warn({ openidId, status }, 'Autumn.attach returned non-success status');
    }

    const data = res?.data;
    if (!data) {
      logger.warn({ openidId }, 'Autumn.attach returned no data');
      return undefined;
    }

    const url = data.checkout_url;
    if (!url || typeof url !== 'string') {
      logger.warn(
        { openidId, keys: Object.keys(data) },
        'Autumn.attach response missing valid checkout_url',
      );
      return undefined;
    }

    return url;
  } catch (err) {
    logger.error({ err, openidId, email }, 'Failed to create checkout with Autumn');
    return undefined;
  }
}

// ----------------------------------------------------------------------------------
// NOTE: No external HTTP libraries are used. The module prefers global fetch
// and falls back to node:https, complying with the allowed dependencies policy.
// ----------------------------------------------------------------------------------

module.exports = {
  fetchTokenBalanceAutumn,
  hasSubscriptionAutumn,
  recordUsageAutumn,
  createCheckoutAutumn,
};
