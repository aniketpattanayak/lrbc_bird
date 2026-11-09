'use client';

import Link from 'next/link';
import { Wallet as WalletIcon, AlertTriangle, Loader2 } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

/**
 * Compact wallet balance pill shown in the dashboard header, linking to the
 * full /wallet page. Polls every 30s so a balance deducted by an in-flight
 * message send (or a top-up completed in another tab) shows up on its own.
 */
export function WalletBadge() {
  const { wallet, isLoading } = useWallet();

  if (isLoading && !wallet) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 text-gray-400 text-sm">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </div>
    );
  }

  if (!wallet) return null;

  const low = wallet.isLowBalance;

  return (
    <Link
      href="/wallet"
      title={low ? 'Wallet balance is low — top up to keep sending' : 'Wallet balance'}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
        low
          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
      }`}
    >
      {low ? <AlertTriangle className="w-4 h-4" /> : <WalletIcon className="w-4 h-4" />}
      <span>{formatRupees(wallet.balanceRupees)}</span>
    </Link>
  );
}
