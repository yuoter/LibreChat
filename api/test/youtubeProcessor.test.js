const { processYouTubeUrls, extractVideoId, findYouTubeUrls } = require('../server/utils/youtubeProcessor');

describe('YouTube Processor', () => {
  describe('extractVideoId', () => {
    test('extracts from standard watch URL', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=2WcbPcGrQZU&t=345s')).toBe('2WcbPcGrQZU');
    });

    test('extracts from youtu.be short URL', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ?si=BESlAZiWiLZQufay')).toBe('dQw4w9WgXcQ');
    });

    test('extracts from shorts URL', () => {
      expect(extractVideoId('https://www.youtube.com/shorts/abc123-_DEF')).toBe('abc123-_DEF');
    });

    test('extracts from embed URL', () => {
      expect(extractVideoId('https://www.youtube.com/embed/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    });

    test('extracts from live URL', () => {
      expect(extractVideoId('https://www.youtube.com/live/xYz_123-ABC?app=desktop')).toBe('xYz_123-ABC');
    });

    test('returns null for invalid URL', () => {
      expect(extractVideoId('https://example.com/notayoutube')).toBeNull();
    });

    test('handles URL at end of string', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('findYouTubeUrls', () => {
    test('finds multiple urls', () => {
      const input =
        'first https://youtu.be/dQw4w9WgXcQ and second https://www.youtube.com/watch?v=2WcbPcGrQZU';
      const urls = findYouTubeUrls(input);
      expect(urls.length).toBe(2);
    });

    test('returns empty for no urls', () => {
      expect(findYouTubeUrls('nothing here')).toEqual([]);
    });
  });

  describe('processYouTubeUrls', () => {
    test('replaces single URL in message', () => {
      const input = 'Check this out: https://www.youtube.com/watch?v=2WcbPcGrQZU&t=345s';
      const expected =
        'Check this out: https://www.youtube.com/watch?v=2WcbPcGrQZU&t=345s video_id=2WcbPcGrQZU';
      expect(processYouTubeUrls(input)).toBe(expected);
    });

    test('replaces multiple URLs in message', () => {
      const input =
        'First: https://youtu.be/dQw4w9WgXcQ and second: https://www.youtube.com/shorts/abc123-_DEF';
      const expected =
        'First: https://youtu.be/dQw4w9WgXcQ video_id=dQw4w9WgXcQ and second: https://www.youtube.com/shorts/abc123-_DEF video_id=abc123-_DEF';
      expect(processYouTubeUrls(input)).toBe(expected);
    });

    test('handles message with no URLs', () => {
      const input = 'Just a regular message';
      expect(processYouTubeUrls(input)).toBe(input);
    });

    test('handles newlines correctly', () => {
      const input = 'Line 1\nhttps://youtu.be/dQw4w9WgXcQ\nLine 2';
      const expected = 'Line 1\nhttps://youtu.be/dQw4w9WgXcQ video_id=dQw4w9WgXcQ\nLine 2';
      expect(processYouTubeUrls(input)).toBe(expected);
    });
  });

  describe('ReDoS Protection', () => {
    test('handles malicious nested patterns efficiently', () => {
      const malicious = 'https://youtube.com/watch?v=' + 'a'.repeat(10000);
      const start = Date.now();
      processYouTubeUrls(malicious);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    test('handles repeated special characters', () => {
      const malicious = 'https://youtube.com/watch?v=' + '&'.repeat(10000);
      expect(() => processYouTubeUrls(malicious)).not.toThrow();
    });
  });

  describe('Code Injection Protection', () => {
    test('does not execute JavaScript in URL', () => {
      const injection = 'https://youtube.com/watch?v=<script>alert("xss")</script>';
      const result = processYouTubeUrls(injection);
      expect(result).toBe(injection);
    });

    test('handles SQL-like patterns safely', () => {
      const injection = "'; DROP TABLE users; --";
      expect(processYouTubeUrls(injection)).toBe(injection);
    });
  });
});
