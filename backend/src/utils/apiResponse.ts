import { Response } from 'express';
import { ApiResponse } from '../types';

export class ApiResponseUtil {
  static success<T>(res: Response, data?: T, message?: string, statusCode: number = 200): void {
    const response: ApiResponse<T> = {
      success: true,
      ...(data !== undefined && { data }),
      ...(message && { message }),
    };

    res.status(statusCode).json(response);
  }

  static error(res: Response, message: string, statusCode: number = 400, errors?: Record<string, string[]>): void {
    const response: ApiResponse = {
      success: false,
      message,
      ...(errors && { errors }),
    };

    res.status(statusCode).json(response);
  }

  static paginated<T>(
    res: Response,
    data: T[],
    page: number,
    limit: number,
    total: number,
    message?: string
  ): void {
    const response: ApiResponse<T[]> = {
      success: true,
      data,
      ...(message && { message }),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };

    res.status(200).json(response);
  }
}
