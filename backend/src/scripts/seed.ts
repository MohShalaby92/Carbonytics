import mongoose from 'mongoose';
import { config } from '../config/config';
import { DataImportService } from '../services/dataImportService';
import { seedBasicData } from './seedBasicData';
import { logger } from '../utils/logger';

async function seedDatabase() {
  try {
    logger.info('🌱 Starting database seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    logger.info('✅ Connected to MongoDB');

    const importService = new DataImportService();

    // 1. Seed basic emission categories from classification
    logger.info('📊 Seeding emission categories...');
    await seedBasicData();

    // 2. Import emission factors from Excel
    logger.info('📈 Importing emission factors...');
    await importService.importEmissionFactors();

    logger.info('✅ Database seeding completed successfully!');
    
  } catch (error) {
    logger.error('❌ Database seeding failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedDatabase };
