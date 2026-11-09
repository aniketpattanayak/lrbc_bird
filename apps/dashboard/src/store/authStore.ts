import { create } from 'zustand';
import type { PublicUser, PublicTenant } from '@wsaas/types';
import { setAccessToken } from '@/lib/api';

interface AuthState {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;           // Initial auth check in progress
  user: PublicUser | null;
  tenant: PublicTenant | null;

  // Actions
  setAuth: (user: PublicUser, tenant: PublicTenant, accessToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  updateUser: (user: Partial<PublicUser>) => void;
  updateTenant: (tenant: Partial<PublicTenant>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,   // Start as loading — will be resolved by auth check
  user: null,
  tenant: null,

  setAuth: (user, tenant, accessToken) => {
    setAccessToken(accessToken);
    set({ isAuthenticated: true, isLoading: false, user, tenant });
  },

  clearAuth: () => {
    setAccessToken(null);
    set({ isAuthenticated: false, isLoading: false, user: null, tenant: null });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),

  updateTenant: (updates) =>
    set((state) => ({
      tenant: state.tenant ? { ...state.tenant, ...updates } : null,
    })),
}));

// ─── Convenience selectors ─────────────────────────────────────────────────────

export const selectUser = (state: AuthState) => state.user;
export const selectTenant = (state: AuthState) => state.tenant;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectIsLoading = (state: AuthState) => state.isLoading;
