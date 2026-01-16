/**
 * Base HTTP Client.
 *
 * Shared HTTP client logic for API services (GitHub, Netlify, etc.).
 * Provides common request methods and error handling.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('HttpClient');

export interface HttpClientConfig {
  baseUrl: string;
  token: string;
  tokenHeader?: 'Bearer' | 'token';
  additionalHeaders?: Record<string, string>;
  serviceName: string;
}

export interface ApiError {
  message?: string;
  error?: string;
  error_description?: string;
}

export class BaseHttpClient {
  protected readonly token: string;
  protected readonly baseUrl: string;
  protected readonly serviceName: string;
  private readonly tokenHeader: string;
  private readonly additionalHeaders: Record<string, string>;

  constructor(config: HttpClientConfig) {
    if (!config.token) {
      throw new Error(`${config.serviceName} token is required`);
    }

    this.token = config.token;
    this.baseUrl = config.baseUrl;
    this.serviceName = config.serviceName;
    this.tokenHeader = config.tokenHeader || 'Bearer';
    this.additionalHeaders = config.additionalHeaders || {};
  }

  protected async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `${this.tokenHeader} ${this.token}`,
        'Content-Type': 'application/json',
        ...this.additionalHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as ApiError;
      const message = error.message || error.error_description || error.error;
      throw new Error(message || `${this.serviceName} API error: ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async validateToken(): Promise<boolean> {
    try {
      await this.get('/user');

      return true;
    } catch (error) {
      // Distinguish between different error types for better debugging
      if (error instanceof TypeError) {
        // Network error (DNS, connection refused, etc.)
        logger.warn(`[${this.serviceName}] Token validation failed - network error:`, error.message);
      } else if (error instanceof Error) {
        // API error (401, 403, etc.)
        logger.debug(`[${this.serviceName}] Token validation failed:`, error.message);
      } else {
        logger.warn(`[${this.serviceName}] Token validation failed - unknown error:`, error);
      }

      return false;
    }
  }
}
