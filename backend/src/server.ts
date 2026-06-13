import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import Database from './config/database';
import { config } from './config/config';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Routes
import authRoutes from './routes/auth';
import organizationRoutes from './routes/organizations';
import calculationRoutes from './routes/calculations';
import reportRoutes from './routes/reports';
import emissionCategoryRoutes from './routes/emissionCategories';
import emissionFactorRoutes from './routes/emissionFactors';
import supplierRoutes from './routes/suppliers';
import csvRoutes from './routes/csv';

class Server {
  public app: express.Application;
  private database: Database;

  constructor() {
    this.app = express();
    this.database = Database.getInstance();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Trust the first proxy hop so rate limiting and secure cookies see the real
    // client IP / protocol. Must be set BEFORE the rate limiter is registered.
    this.app.set('trust proxy', 1);

    // Security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS — credentials enabled so the refresh cookie can be sent cross-origin.
    this.app.use(
      cors({
        origin: config.CLIENT_URL,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    // Global API rate limit
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW,
      max: config.RATE_LIMIT_MAX,
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    // Body & cookie parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Compression
    this.app.use(compression() as any);

    // Request logging
    this.app.use(morgan(config.NODE_ENV === 'development' ? 'dev' : 'combined'));
  }

  private initializeRoutes(): void {
    // Stricter limiter for credential endpoints (brute-force protection).
    const authLimiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW,
      max: config.AUTH_RATE_LIMIT_MAX,
      message: {
        success: false,
        message: 'Too many authentication attempts, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
    });

    // Health check
    this.app.get('/health', (_req, res) => {
      res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
      });
    });

    // API routes (each mounted exactly once)
    this.app.use('/api/auth', authLimiter, authRoutes);
    this.app.use('/api/organizations', organizationRoutes);
    this.app.use('/api/calculations', calculationRoutes);
    this.app.use('/api/reports', reportRoutes);
    this.app.use('/api/emission-categories', emissionCategoryRoutes);
    this.app.use('/api/emission-factors', emissionFactorRoutes);
    this.app.use('/api/suppliers', supplierRoutes);
    this.app.use('/api/csv', csvRoutes);

    // API info
    this.app.get('/api', (_req, res) => {
      res.json({
        success: true,
        message: 'Carbonytics API v1.0.0',
        endpoints: {
          auth: '/api/auth',
          organizations: '/api/organizations',
          calculations: '/api/calculations',
          emissionCategories: '/api/emission-categories',
          emissionFactors: '/api/emission-factors',
          reports: '/api/reports',
          csv: '/api/csv',
        },
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(notFound);
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      await this.database.connectMongoDB();
      await this.database.connectRedis();

      this.app.listen(config.PORT, () => {
        console.log(`🚀 Server running on port ${config.PORT}`);
        console.log(`📊 Environment: ${config.NODE_ENV}`);
        console.log(`🌐 API URL: http://localhost:${config.PORT}/api`);
      });

      this.setupGracefulShutdown();
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT'];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
        try {
          await this.database.disconnect();
          console.log('✅ Server shutdown complete');
          process.exit(0);
        } catch (error) {
          console.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });
  }
}

const server = new Server();
server.start();

export default server;
