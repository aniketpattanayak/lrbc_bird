'use client';

import { useCallback, useEffect, useState } from 'react';
import Script from 'next/script';
import { Wallet as WalletIcon, AlertTriangle, Loader2, ArrowUpRight, ArrowDownRight, RefreshCcw } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { walletApi, ApiClientError, type WalletTransactionResponse } from '@/lib/api';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const PRESET_AMOUNTS = [500, 1000, 2500, 5000];

function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function TransactionRow({ txn }: { txn: WalletTransactionResponse }) {
  const isCredit = txn.amountRupees > 0;
  const statusColor =
    txn.status === 'SUCCESS' ? 'text-emerald-700 bg-emerald-50' : txn.status === 'PENDING' ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';

  const labelMap: Record<string, string> = {
    TOPUP: 'Wallet top-up',
    MESSAGE_CHARGE: 'WhatsApp message charge',
    REFUND: 'Refund',
    ADJUSTMENT: 'Adjustment',
  };

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          {isCredit ? (
            <ArrowUpRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
          <div>
            <div className="text-sm font-medium text-gray-900">{labelMap[txn.type] ?? txn.type}</div>
            {txn.description && <div className="text-xs text-gray-500">{txn.description}</div>}
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-sm text-gray-500">{formatDateTime(txn.createdAt)}</td>
      <td className="py-3 pr-4">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>{txn.status}</span>
      </td>
      <td className={`py-3 text-right text-sm font-semibold ${isCredit ? 'text-emerald-700' : 'text-gray-900'}`}>
        {isCredit ? '+' : ''}
        {formatRupees(txn.amountRupees)}
      </td>
    </tr>
  );
}

export default function WalletPage() {
  const { wallet, isLoading: walletLoading, refetch: refetchWallet } = useWallet();
  const [transactions, setTransactions] = useState<WalletTransactionResponse[]>([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(1000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);
  const [razorpayReady, setRazorpayReady] = useState(false);

  const loadTransactions = useCallback(async () => {
    setTxnLoading(true);
    try {
      const data = await walletApi.getTransactions(1, 25);
      setTransactions(data.transactions);
    } catch {
      // Non-fatal — the balance card still works even if history fails to load.
    } finally {
      setTxnLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const activeAmount = selectedAmount ?? (customAmount ? parseInt(customAmount, 10) : 0);

  async function handleTopup() {
    setToastError(null);

    if (!razorpayReady || !window.Razorpay) {
      setToastError('Payment widget is still loading — try again in a moment.');
      return;
    }
    if (!activeAmount || activeAmount < 100) {
      setToastError('Minimum top-up amount is ₹100.');
      return;
    }

    setIsProcessing(true);
    try {
      const order = await walletApi.createTopupOrder(activeAmount);

      const razorpay = new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'WhatsPlatform Wallet',
        description: `Add ${formatRupees(activeAmount)} to your wallet`,
        order_id: order.orderId,
        theme: { color: '#4f46e5' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await walletApi.verifyTopup({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            await Promise.all([refetchWallet(), loadTransactions()]);
          } catch (err) {
            setToastError(err instanceof ApiClientError ? err.message : 'Payment succeeded but we could not confirm it — contact support with your payment ID.');
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => setIsProcessing(false),
        },
      });

      razorpay.open();
    } catch (err) {
      setIsProcessing(false);
      setToastError(err instanceof ApiClientError ? err.message : 'Could not start the top-up. Please try again.');
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setRazorpayReady(true)} strategy="afterInteractive" />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">
          Official WhatsApp (Meta Cloud API) messages are billed per conversation by Meta. Keep your wallet topped up so sends never get blocked.
        </p>
      </div>

      {/* Balance card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <WalletIcon className="w-4 h-4" />
              Current balance
            </div>
            {walletLoading && !wallet ? (
              <div className="h-10 flex items-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="text-4xl font-bold text-gray-900">{wallet ? formatRupees(wallet.balanceRupees) : '—'}</div>
            )}
            {wallet?.isLowBalance && (
              <div className="flex items-center gap-1.5 text-amber-700 text-sm mt-2">
                <AlertTriangle className="w-4 h-4" />
                Balance is low — official WhatsApp sends may start failing once it runs out.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void refetchWallet()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="text-sm font-medium text-gray-900 mb-3">Add money</div>

          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setSelectedAmount(amt);
                  setCustomAmount('');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  selectedAmount === amt ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                {formatRupees(amt)}
              </button>
            ))}
            <input
              type="number"
              min={100}
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedAmount(null);
              }}
              className={`px-4 py-2 rounded-lg text-sm border w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                customAmount ? 'border-indigo-600' : 'border-gray-200'
              }`}
            />
          </div>

          {toastError && <div className="text-sm text-red-600 mb-3">{toastError}</div>}

          <button
            type="button"
            disabled={isProcessing || !activeAmount}
            onClick={() => void handleTopup()}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
            {isProcessing ? 'Processing…' : `Add ${activeAmount ? formatRupees(activeAmount) : 'money'} via Razorpay`}
          </button>
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-sm font-semibold text-gray-900 mb-4">Transaction history</div>

        {txnLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-sm text-gray-500 py-10 text-center">No transactions yet. Top up your wallet to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-200">
                  <th className="pb-2 pr-4 font-medium">Transaction</th>
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <TransactionRow key={txn.id} txn={txn} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
