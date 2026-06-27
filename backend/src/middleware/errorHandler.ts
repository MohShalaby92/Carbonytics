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

  // Always log server-side errors (5xx) so the real cause is never lost — even in
  // production, where it is NOT returned to the client (see below). In development
  // log everything with the stack for debugging.
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', error.stack);
  } else if (statusCode >= 500) {
    console.error(`[${statusCode}] ${req.method} ${req.originalUrl}:`, error.message);
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

  // Mongoose / MongoDB duplicate key error (driver name is 'MongoServerError')
  if ((error.name === 'MongoServerError' || error.name === 'MongoError') && (error as any).code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value';
    const keyValue = (error as any).keyValue || {};
    const field = Object.keys(keyValue)[0] || 'field';
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
      const field = (err as any).param || 'unknown';
      if (!acc[field]) acc[field] = [];
      acc[field].push(err.msg);
      return acc;
    }, {} as Record<string, string[]>);
  }

  // Never leak raw internal error text on an unexpected 5xx in production — those
  // messages can expose internals (DB/driver strings, programming errors). Send a
  // generic message; the real one was logged above. Controlled 4xx errors (set via
  // ApiResponseUtil/explicit statusCode) keep their user-facing message.
  const clientMessage =
    statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message;

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    ...(Object.keys(errors).length > 0 && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};
