import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './lib/logger.js';
import { config } from './lib/config.js';

const app = express();

// Logger HTTP
app.use(pinoHttp({ logger }));

// Sécurité
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10kb' }));

// Routes
app.use('/health', healthRouter);

// Error handler
app.use(errorHandler);

// Démarrage du serveur
if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    logger.info(`Serveur démarré sur http://localhost:${config.port}`);
  });
}

export { app };
