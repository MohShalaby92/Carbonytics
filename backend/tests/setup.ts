// Mock Redis for tests
jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      flushAll: jest.fn(),
      on: jest.fn(),
    })),
  }));
  
  // Mock external APIs
  jest.mock('axios');
  
  // Setup test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.JWT_EXPIRE = '24h';
  process.env.RATE_LIMIT_WINDOW = '900000';
  process.env.RATE_LIMIT_MAX = '1000';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/carbonytics_test';
  
  // Increase timeout for database operations
  jest.setTimeout(30000);
  