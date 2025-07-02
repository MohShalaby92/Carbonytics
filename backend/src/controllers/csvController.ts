import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { CSVService } from '../services/csvService';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { config } from '../config/config';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = config.UPLOAD_PATH;
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype === 'text/csv' || 
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE, // 10MB
  },
});

export const validateCSVFile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  if (!req.file) {
    return ApiResponseUtil.error(res, 'No file uploaded', 400);
  }

  try {
    const csvService = new CSVService();
    const validation = await csvService.validateCSV(req.file.path);

    // Clean up uploaded file after validation
    setTimeout(() => {
      try {
        if (fs.existsSync(req.file!.path)) {
          fs.unlinkSync(req.file!.path);
        }
      } catch (error) {
        console.error('Error cleaning up validation file:', error);
      }
    }, 1000);

    ApiResponseUtil.success(res, {
      fileName: req.file.originalname,
      validation,
    }, 'File validation completed');

  } catch (error) {
    // Clean up file on error
    try {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up file after validation error:', cleanupError);
    }

    console.error('CSV validation failed:', error);
    ApiResponseUtil.error(res, 'File validation failed', 500);
  }
});

export const importCSVFile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  if (!req.file) {
    return ApiResponseUtil.error(res, 'No file uploaded', 400);
  }

  try {
    const csvService = new CSVService();
    
    // First validate the file
    const validation = await csvService.validateCSV(req.file.path);
    
    if (!validation.valid) {
      // Clean up file
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up invalid file:', cleanupError);
      }
      
      return ApiResponseUtil.error(res, 'File validation failed', 400, {
        errors: validation.errors,
      });
    }

    // Import the data
    const importResult = await csvService.importCalculations(
      req.file.path,
      req.user.id,
      req.user.organizationId
    );

    // Clean up uploaded file
    setTimeout(() => {
      try {
        if (fs.existsSync(req.file!.path)) {
          fs.unlinkSync(req.file!.path);
        }
      } catch (error) {
        console.error('Error cleaning up import file:', error);
      }
    }, 1000);

    const message = importResult.failed > 0 
      ? `Import completed with ${importResult.failed} errors`
      : 'Import completed successfully';

    ApiResponseUtil.success(res, {
      fileName: req.file.originalname,
      result: importResult,
    }, message);

  } catch (error) {
    // Clean up file on error
    try {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up file after import error:', cleanupError);
    }

    console.error('CSV import failed:', error);
    ApiResponseUtil.error(res, 'Import failed', 500);
  }
});

export const getImportTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  try {
    const csvService = new CSVService();
    const fileName = await csvService.exportTemplate();
    const filePath = path.join(process.cwd(), 'uploads', fileName);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    return res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending template file:', err);
        ApiResponseUtil.error(res, 'Failed to download template', 500);
      } else {
        // Clean up file after sending
        setTimeout(() => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupError) {
            console.error('Error cleaning up template file:', cleanupError);
          }
        }, 5000);
      }
    });

  } catch (error) {
    console.error('Template generation failed:', error);
    ApiResponseUtil.error(res, 'Template generation failed', 500);
  }
});

export const exportCalculationsCSV = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  try {
    const { startDate, endDate, scopes, categories } = req.query;
    
    const filters = {
      startDate: startDate as string,
      endDate: endDate as string,
      scopes: scopes ? (scopes as string).split(',').map(Number) : undefined,
      categories: categories ? (categories as string).split(',') : undefined,
    };

    const csvService = new CSVService();
    const fileName = await csvService.exportCalculations(req.user.organizationId, filters);
    const filePath = path.join(process.cwd(), 'uploads', fileName);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    return res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending export file:', err);
        ApiResponseUtil.error(res, 'Failed to download export', 500);
      } else {
        // Clean up file after sending
        setTimeout(() => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupError) {
            console.error('Error cleaning up export file:', cleanupError);
          }
        }, 5000);
      }
    });

  } catch (error) {
    console.error('CSV export failed:', error);
    ApiResponseUtil.error(res, 'Export failed', 500);
  }
});
