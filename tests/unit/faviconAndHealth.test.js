const request = require('supertest');
const app = require('../../src/app');

describe('Root & System Endpoints', () => {
  it('GET /favicon.ico returns 204 No Content with caching headers', async () => {
    const res = await request(app).get('/favicon.ico');
    expect(res.statusCode).toEqual(204);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.text).toBe('');
  });

  it('GET /health returns 200 OK with system status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Court Booking API is running');
  });

  it('GET /unknown-route returns 404 Route Not Found JSON', async () => {
    const res = await request(app).get('/some-nonexistent-route-xyz');
    expect(res.statusCode).toEqual(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Route not found');
  });
});
