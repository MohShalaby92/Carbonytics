export default async function globalSetup() {
    // For MVP testing, we'll use a simple approach without MongoDB Memory Server

    process.env.MONGODB_URI = 'mongodb://localhost:27017/carbonytics_test';
    
    console.log('🧪 Test environment setup complete');
  }
  