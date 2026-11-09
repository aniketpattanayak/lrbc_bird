/**
 * Typed API client for the dashboard.
 * All API calls go through this client which handles:
 * - Base URL configuration
 * - Auth token attachment
 * - Automatic token refresh on 401
 * - Standard error handling
 * - Request ID tracking
 */

import type { ApiResponse, ApiErrorResponse, PaginatedResponse } from '@wsaas/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

// ── Token storage ─────────────────────────────────────────────────────────────
// Access token stored in memory (not localStorage — XSS protection)
// Refresh token stored in httpOnly cookie (set by API server)
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  // Only set Content-Type for requests that have a body
  if (fetchOptions.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include', // Send cookies (refresh token)
  });

  // Handle token refresh on 401
  if (response.status === 401 && !skipAuth && !path.includes('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      headers.set('Authorization', `Bearer ${accessToken ?? ''}`);
      const retryResponse = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
      return handleResponse<T>(retryResponse);
    } else {
      // Refresh failed — user needs to log in
      accessToken = null;
      if (typeof window !== 'undefined') {
        window.location.href = '/login?reason=session_expired';
      }
      throw new ApiClientError('AUTH_TOKEN_EXPIRED', 'Session expired', 401);
    }
  }

  return handleResponse<T>(response);
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as ApiResponse<T> | ApiErrorResponse;

  if (!data.success) {
    const error = (data as ApiErrorResponse).error;
    throw new ApiClientError(
      error.code,
      error.message,
      response.status,
      error.details,
    );
  }

  return (data as ApiResponse<T>).data;
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // Sends refresh token cookie
    });

    if (!response.ok) return false;

    const data = (await response.json()) as ApiResponse<{ accessToken: string }>;
    if (data.success) {
      accessToken = data.data.accessToken;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── HTTP method helpers ───────────────────────────────────────────────────────

export const api = {
  get<T>(path: string, options?: FetchOptions) {
    return apiFetch<T>(path, { ...options, method: 'GET' });
  },

  post<T>(path: string, body?: unknown, options?: FetchOptions) {
    return apiFetch<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: unknown, options?: FetchOptions) {
    return apiFetch<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: unknown, options?: FetchOptions) {
    return apiFetch<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string, options?: FetchOptions) {
    return apiFetch<T>(path, { ...options, method: 'DELETE' });
  },

  // Paginated requests
  async paginated<T>(path: string, options?: FetchOptions): Promise<PaginatedResponse<T>> {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...options?.headers,
      },
      credentials: 'include',
    });
    return response.json() as Promise<PaginatedResponse<T>>;
  },
};

export { apiFetch };

// ── Wallet ────────────────────────────────────────────────────────────────────

export interface WalletSummaryResponse {
  balancePaise: string;
  balanceRupees: number;
  currency: string;
  lowBalanceThresholdPaise: string;
  isLowBalance: boolean;
}

export interface WalletTransactionResponse {
  id: string;
  type: 'TOPUP' | 'MESSAGE_CHARGE' | 'REFUND' | 'ADJUSTMENT';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  amountPaise: string;
  amountRupees: number;
  balanceAfterPaise: string | null;
  description: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  messageId: string | null;
  createdAt: string;
}

export interface WalletTransactionsResponse {
  wallet: WalletSummaryResponse;
  transactions: WalletTransactionResponse[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateTopupOrderResponse {
  orderId: string;
  amountPaise: number;
  currency: string;
  razorpayKeyId: string;
}

export const walletApi = {
  getWallet: () => api.get<WalletSummaryResponse>('/v1/wallet'),
  getTransactions: (page = 1, limit = 20) =>
    api.get<WalletTransactionsResponse>(`/v1/wallet/transactions?page=${page}&limit=${limit}`),
  createTopupOrder: (amountRupees: number) =>
    api.post<CreateTopupOrderResponse>('/v1/wallet/topup/order', { amountRupees }),
  verifyTopup: (payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    api.post<{ credited: boolean; wallet: WalletSummaryResponse }>('/v1/wallet/topup/verify', payload),
};
