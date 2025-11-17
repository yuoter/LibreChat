const { processYouTubeUrls } = require('../utils/youtubeProcessor');
const { logger } = require('~/config');

/**
 * Middleware to process YouTube URLs in incoming requests.
 * - Transforms req.body.text if present
 * - Transforms each message.content in req.body.messages if present
 * - Fail-safe: any error results in pass-through without transformation
 */
function youtubeUrlMiddleware(req, _res, next) {
  try {
    let didProcess = false;

    if (req.body && typeof req.body.text === 'string') {
      const originalText = req.body.text;
      const processed = processYouTubeUrls(originalText, logger);
      if (processed !== originalText) {
        req.body.text = processed;
        didProcess = true;
      }
    }

    if (req.body && Array.isArray(req.body.messages)) {
      req.body.messages = req.body.messages.map((msg) => {
        if (msg && typeof msg.content === 'string' && msg.content.length > 0) {
          const processed = processYouTubeUrls(msg.content, logger);
          if (processed !== msg.content) {
            didProcess = true;
            return { ...msg, content: processed };
          }
        }
        return msg;
      });
    }

    if (didProcess && process.env.DEBUG_YOUTUBE === 'true') {
      logger.debug('[YouTube Middleware] Message processed', {
        endpoint: req.path,
      });
    }
  } catch (error) {
    logger.error('[YouTube Middleware] Error processing URLs:', error);
    // Fail-safe: continue request processing
  } finally {
    next();
  }
}

module.exports = youtubeUrlMiddleware;
