/**
 * YouTube URL processing utilities
 * - extractVideoId: Extracts the 11-character YouTube video ID from supported URL formats
 * - findYouTubeUrls: Detects YouTube URLs in free-form text
 * - processYouTubeUrls: Replaces detected URLs with `video_id=<id>` occurrences
 */

/**
 * Extracts a YouTube video ID (11 chars) from a supported YouTube URL.
 * Returns null if the URL is not a supported YouTube URL or the ID cannot be found.
 *
 * Security characteristics:
 * - Uses bounded quantifiers `{11}` to avoid unbounded matching
 * - Explicit character classes `[a-zA-Z0-9_-]` prevent wildcard matches
 * - Terminators `(?:[&\\s\\n]|$)` ensure early exit and avoid overmatching
 *
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})(?:[&\s\n]|$)/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?\s\n]|$)/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})(?:[?\s\n]|$)/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[?\s\n]|$)/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})(?:[?\s\n]|$)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Finds all YouTube URLs in a given text. Returns an empty array if none found.
 *
 * @param {string} text
 * @returns {string[]}
 */
function findYouTubeUrls(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const globalPattern =
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s]*/g;
  return text.match(globalPattern) || [];
}

/**
 * Replaces YouTube URLs in `text` with `video_id=<id>`.
 * Optionally logs debug info if `logger` is provided and `DEBUG_YOUTUBE=true`.
 *
 * @param {string} text
 * @param {{debug: Function}=} logger
 * @returns {string}
 */
function processYouTubeUrls(text, logger = null) {
  if (typeof text !== 'string' || text.length === 0) {
    return text;
  }

  const urls = findYouTubeUrls(text);
  let processedText = text;

  for (const url of urls) {
    const videoId = extractVideoId(url);
    if (videoId) {
      //processedText = processedText.replace(url, `video_id=${videoId}`);
      processedText = processedText.replace(url, url + ' ' + `video_id=${videoId}`);
      if (logger && process.env.DEBUG_YOUTUBE === 'true') {
        logger.debug(`[YouTube Processor] Extracted video_id: ${videoId} from URL: ${url}`);
      }
    }
  }

  return processedText;
}

module.exports = { processYouTubeUrls, extractVideoId, findYouTubeUrls };


