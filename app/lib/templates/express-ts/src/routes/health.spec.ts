import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('GET /health', () => {
  it('retourne status ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('inclut un timestamp', async () => {
    const response = await request(app).get('/health');

    expect(response.body.timestamp).toBeDefined();
    expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
  });

  it('inclut le uptime', async () => {
    const response = await request(app).get('/health');

    expect(response.body.uptime).toBeDefined();
    expect(typeof response.body.uptime).toBe('number');
    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
  });
});
