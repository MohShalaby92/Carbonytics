import request from 'supertest';
import express from 'express';

describe('Health Check', () => {
  const app = express();
  
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV
    });
  });

  it('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy',
      environment: 'test'
    });
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptime).toBeDefined();
  });

  it('should respond quickly', async () => {
    const start = Date.now();
    await request(app).get('/health');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(100);
  });
});