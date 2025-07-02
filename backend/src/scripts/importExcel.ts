import { program } from 'commander';
import mongoose from 'mongoose';
import { config } from '../config/config';
import { ExcelParserService } from '../services/excelParserService';
import { logger } from '../utils/logger';

program
  .description('Import emission data from Excel file')
  .argument('<file>', 'Excel file path')
  .option('-c, --clear', 'Clear existing data before import')
  .action(async (file: string, options: { clear?: boolean }) => {
    try {
      await mongoose.connect(config.MONGODB_URI);
      logger.info('Connected to database');

      if (options.clear) {
        const { EmissionCategory } = await import('../models/EmissionCategory');
        const { EmissionFactor } = await import('../models/EmissionFactor');
        
        await EmissionCategory.deleteMany({});
        await EmissionFactor.deleteMany({});
        logger.info('Cleared existing data');
      }

      const parser = new ExcelParserService();
      const results = await parser.parseAndImportExcel(file);
      
      logger.info('Import Results:', results);
      
    } catch (error) {
      logger.error('Import failed:', error);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
      process.exit(0);
    }
  });

if (require.main === module) {
  program.parse();
}

export { ExcelParserService };
