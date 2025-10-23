const { logger: baseLogger } = require('@librechat/data-schemas');

/**
 * Creates a logger instance with a specific context
 * @param {string} context - The context/module name for the logger
 * @returns {object} Logger instance with debug, info, warn, and error methods
 */
function createLogger(context) {
  return {
    /**
     * Log debug message (only if DEBUG_LOGGING is enabled)
     * @param {string} message - The message to log
     * @param {object} [data] - Additional data to log
     */
    debug: (message, data) => {
      if (process.env.DEBUG_LOGGING === 'true') {
        baseLogger.debug(`[${context}] ${message}`, data || {});
      }
    },

    /**
     * Log info message
     * @param {string} message - The message to log
     * @param {object} [data] - Additional data to log
     */
    info: (message, data) => {
      baseLogger.info(`[${context}] ${message}`, data || {});
    },

    /**
     * Log warning message
     * @param {string} message - The message to log
     * @param {object} [data] - Additional data to log
     */
    warn: (message, data) => {
      baseLogger.warn(`[${context}] ${message}`, data || {});
    },

    /**
     * Log error message
     * @param {string} message - The message to log
     * @param {Error} [error] - The error object
     * @param {object} [data] - Additional data to log
     */
    error: (message, error, data) => {
      const errorData = {
        ...(data || {}),
      };

      if (error) {
        errorData.error = error.message;
        errorData.stack = error.stack;
      }

      baseLogger.error(`[${context}] ${message}`, errorData);
    },
  };
}

module.exports = { createLogger };
