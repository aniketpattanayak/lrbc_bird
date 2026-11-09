'use client';

import { useCallback, useEffect, useState } from 'react';
import { walletApi, type WalletSummaryResponse } from '@/lib/api';

/**
 * Shared wallet-balance hook — used by the header badge and the wallet page
 * so both stay in sync. Call `refetch()` right after a top-up is verified so
 * the header updates immediately without waiting for the poll interval.
 */
export function useWallet(pollMs = 30000) {
  const [wallet, setWallet] = useState<WalletSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await walletApi.getWallet();
      setWallet(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet balance');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    if (!pollMs) return;
    const interval = setInterval(() => void refetch(), pollMs);
    return () => clearInterval(interval);
  }, [refetch, pollMs]);

  return { wallet, isLoading, error, refetch };
}
