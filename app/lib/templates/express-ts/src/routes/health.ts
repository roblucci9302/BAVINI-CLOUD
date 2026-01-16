import { Router } from 'express';

const router = Router();

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
}

router.get('/', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  res.json(response);
});

export { router as healthRouter };
