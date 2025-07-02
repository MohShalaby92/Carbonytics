import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import Database from './config/database';
import { config } from './config/config';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Import routes
import authRoutes from './routes/auth';
import organizationRoutes from './routes/organizations';
import calculationRoutes from './routes/calculations';
import reportRoutes from './routes/reports';
import emissionCategoryRoutes from './routes/emissionCategories';
import emissionFactorRoutes from './routes/emissionFactors';
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
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Rate limiting
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

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression middleware
    this.app.use(compression() as any);

    // Logging middleware
    if (config.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

      this.app.use('/api/csv', csvRoutes);

    // Trust proxy (for rate limiting and security)
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // Health check
    this.app.use('/api/emission-categories', emissionCategoryRoutes);
    this.app.use('/api/emission-factors', emissionFactorRoutes);
    this.app.use('/api/calculations', calculationRoutes);
    this.app.use('/api/reports', reportRoutes);
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/organizations', organizationRoutes);
    this.app.use('/api/calculations', calculationRoutes);
    this.app.use('/api/emission-factors', emissionFactorRoutes);
    this.app.use('/api/reports', reportRoutes);

    // API info
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'Carbonytics API v1.0.0',
        documentation: '/api/docs',
        endpoints: {
          auth: '/api/auth',
          organizations: '/api/organizations',
          calculations: '/api/calculations',
          emissionFactors: '/api/emission-factors',
          reports: '/api/reports',
        },
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFound);

    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to databases
      await this.database.connectMongoDB();
      await this.database.connectRedis();

      // Start server
      this.app.listen(config.PORT, () => {
        console.log(`🚀 Server running on port ${config.PORT}`);
        console.log(`📊 Environment: ${config.NODE_ENV}`);
        console.log(`🌐 API URL: http://localhost:${config.PORT}/api`);
      });

      // Graceful shutdown
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

// Start server
const server = new Server();
server.start();

export default server;
