import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ApiResponse } from '../types';

/**
 * Access token is held in memory only (never localStorage) to reduce XSS exposure.
 * The refresh token lives in an httpOnly cookie set by the backend and is sent
 * automatically via `withCredentials`. On reload, the session is rehydrated by
 * calling /auth/refresh (the cookie survives; the in-memory access token does not).
 */
let accessToken: string | null = null;

class ApiService {
  private api: AxiosInstance;
  private refreshing: Promise<string | null> | null = null;

  constructor() {
    const baseURL = import.meta.env.VITE_API_URL || '/api';

    this.api = axios.create({
      baseURL,
      timeout: 15000,
      withCredentials: true, // send/receive the httpOnly refresh cookie
      headers: { 'Content-Type': 'application/json' },
    });

    this.setupInterceptors();
  }

  setAccessToken(token: string | null) {
    accessToken = token;
  }
  getAccessToken() {
    return accessToken;
  }

  private setupInterceptors() {
    this.api.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response: AxiosResponse<ApiResponse<any>>) => response,
      async (error) => {
        const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
        const url = original?.url || '';
        const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/register');

        if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
          original._retry = true;
          const newToken = await this.refresh();
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            return this.api.request(original);
          }
          // Refresh failed — session is over.
          accessToken = null;
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /** Exchange the refresh cookie for a fresh access token. Single-flight. */
  async refresh(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      try {
        const response = await this.api.post<ApiResponse<{ accessToken: string }>>(
          '/auth/refresh'
        );
        const token = response.data?.data?.accessToken ?? null;
        accessToken = token;
        return token;
      } catch {
        accessToken = null;
        return null;
      } finally {
        this.refreshing = null;
      }
    })();

    return this.refreshing;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch {
      /* ignore */
    } finally {
      accessToken = null;
    }
  }

  async get<T>(url: string, config?: any): Promise<ApiResponse<T>> {
    const response = await this.api.get<ApiResponse<T>>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.api.post<ApiResponse<T>>(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.api.put<ApiResponse<T>>(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.api.patch<ApiResponse<T>>(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.api.delete<ApiResponse<T>>(url);
    return response.data;
  }

  async uploadFile<T>(
    url: string,
    file: File,
    progressCallback?: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.api.post<ApiResponse<T>>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressCallback && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          progressCallback(progress);
        }
      },
    });

    return response.data;
  }
}

export const apiService = new ApiService();
