'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { setAccessToken, getAccessToken } from '@/lib/api';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
import { useAuthStore } from '@/store/authStore';

const PUBLIC_ROUTES = new Set(['/login', '/register', '/verify-email', '/forgot-password', '/reset-password']);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setAuth, clearAuth, setLoading } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void (async () => {
      // If we already have a token in memory (e.g. just logged in this session),
      // skip the refresh round-trip — the store already has user/tenant data.
      const existingToken = getAccessToken();
      const { isAuthenticated } = useAuthStore.getState();
      if (existingToken && isAuthenticated) {
        setLoading(false);
        if (PUBLIC_ROUTES.has(pathname)) router.replace('/overview');
        return;
      }

      setLoading(true);
      try {
        // Get a fresh access token from the refresh cookie
        const refreshRes = await fetch(`${API_URL}/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!refreshRes.ok) {
          clearAuth();
          if (!PUBLIC_ROUTES.has(pathname)) router.replace('/login');
          return;
        }

        const refreshData = await refreshRes.json();
        const token = refreshData.data?.accessToken as string;
        setAccessToken(token);

        // Fetch user + tenant info with the new token
        const meRes = await fetch(`${API_URL}/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });

        if (!meRes.ok) {
          clearAuth();
          if (!PUBLIC_ROUTES.has(pathname)) router.replace('/login');
          return;
        }

        const meData = await meRes.json();
        setAuth(meData.data.user, meData.data.tenant, token);

        if (PUBLIC_ROUTES.has(pathname)) {
          router.replace('/overview');
        }
      } catch {
        clearAuth();
        if (!PUBLIC_ROUTES.has(pathname)) router.replace('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
