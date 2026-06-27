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

    // 2. Import emission factors from Excel (OPTIONAL enrichment).
    // Basic factors are already seeded above; the spreadsheet import is extra.
    // If the data file isn't present, warn and continue rather than failing the seed.
    try {
      logger.info('📈 Importing emission factors from spreadsheet (optional)...');
      await importService.importEmissionFactors();
    } catch (importError) {
      logger.warn(
        '⚠️  Skipping spreadsheet factor import (data file missing or unreadable). ' +
          'Basic factors from seedBasicData are still in place.',
        importError
      );
    }

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
