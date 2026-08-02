const request = require('supertest');
const express = require('express');
const { authLimiter } = require('../../src/middleware/rateLimit');

// The limiters are skipped whenever NODE_ENV === 'test' (see rateLimit.js) so
// the rest of the suite can hit auth endpoints freely - this test briefly
// flips NODE_ENV to prove the limiter itself actually blocks past its cap.
describe('authLimiter', () => {
  it('returns 429 once the request cap is exceeded', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = express();
      app.get('/x', authLimiter, (req, res) => res.json({ ok: true }));

      let lastStatus;
      for(let i = 0; i < 21; i++) {
        const res = await request(app).get('/x');
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
