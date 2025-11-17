const request = require('supertest');
const express = require('express');
const youtubeUrlMiddleware = require('../../server/middleware/youtubeMiddleware');

describe('YouTube Middleware Integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(youtubeUrlMiddleware);
    app.post('/test', (req, res) => res.json({ text: req.body.text }));
  });

  test('transforms YouTube URL in request body', async () => {
    const response = await request(app)
      .post('/test')
      .send({ text: 'Watch https://youtu.be/dQw4w9WgXcQ' })
      .expect(200);

    expect(response.body.text).toBe('Watch https://youtu.be/dQw4w9WgXcQ video_id=dQw4w9WgXcQ');
  });

  test('passes through non-YouTube content unchanged', async () => {
    const response = await request(app).post('/test').send({ text: 'Just a message' }).expect(200);
    expect(response.body.text).toBe('Just a message');
  });

  test('handles missing text field gracefully', async () => {
    const response = await request(app).post('/test').send({ other: 'data' }).expect(200);
    expect(response.body).toEqual({});
  });
});


