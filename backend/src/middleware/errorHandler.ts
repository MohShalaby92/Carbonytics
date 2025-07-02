import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'express-validator';
import mongoose from 'mongoose';

interface CustomError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let errors: Record<string, string[]> = {};

  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', error.stack);
  }

  // Mongoose validation error
  if (error.name === 'ValidationError' && error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.keys(error.errors).reduce((acc, key) => {
      acc[key] = [error.errors[key].message];
      return acc;
    }, {} as Record<string, string[]>);
  }

  // Mongoose duplicate key error
  if (error.name === 'MongoError' && (error as any).code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value';
    const field = Object.keys((error as any).keyValue)[0];
    errors[field] = [`${field} already exists`];
  }

  // Mongoose cast error (invalid ObjectId)
  if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Express validation errors
  if (Array.isArray((error as any).array)) {
    statusCode = 400;
    message = 'Validation Error';
    const validationErrors = (error as any).array() as ValidationError[];
    errors = validationErrors.reduce((acc, err) => {
      const field = err.param || 'unknown';
      if (!acc[field]) acc[field] = [];
      acc[field].push(err.msg);
      return acc;
    }, {} as Record<string, string[]>);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(Object.keys(errors).length > 0 && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};
