'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  priceMonthlyUsdCents: number;
  priceYearlyUsdCents: number;
  maxInstances: number;
  maxMessagesPerMonth: number | null;
  maxTeamMembers: number;
}

interface Subscription {
  id: string;
  status: string;
  billingCycle: 'MONTHLY' | 'YEARLY';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionResponse {
  plan: Plan | null;
  subscription: Subscription | null;
  tenantStatus: string;
}

interface UsageSummary {
  messages: { sent: number; received: number; total: number; limit: number | null; percentUsed: number | null };
  instances: { used: number; limit: number | null };
  teamMembers: { used: number; limit: number | null };
}

interface Invoice {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  invoicePdfUrl: string | null;
  createdAt: string;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function ProgressBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-indigo-600';
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{used.toLocaleString()} {limit ? `/ ${limit.toLocaleString()}` : '(unlimited)'}</span>
        {limit && <span className="text-gray-500">{pct}%</span>}
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${limit ? pct : 100}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    open: 'bg-yellow-100 text-yellow-800',
    void: 'bg-gray-100 text-gray-600',
    uncollectible: 'bg-red-100 text-red-800',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

export default function BillingPage() {
  const [sub, setSub] = useState<SubscriptionResponse | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPlans, setShowPlans] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [subRes, usageRes, plansRes, invoicesRes] = await Promise.all([
        api.get<SubscriptionResponse>('/v1/billing/subscription'),
        api.get<UsageSummary>('/v1/usage/summary'),
        api.get<Plan[]>('/v1/billing/plans'),
        api.get<Invoice[]>('/v1/billing/invoices'),
      ]);
      setSub(subRes);
      setUsage(usageRes);
      setPlans(plansRes);
      setInvoices(invoicesRes);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load billing information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleUpgrade(planId: string) {
    setActionLoading(planId);
    setActionError('');
    try {
      const { url } = await api.post<{ url: string | null }>('/v1/billing/checkout', { planId, billingCycle: 'MONTHLY' });
      if (url) window.location.href = url;
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Could not start checkout.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePortal() {
    setActionLoading('portal');
    setActionError('');
    try {
      const { url } = await api.post<{ url: string | null }>('/v1/billing/portal');
      if (url) window.location.href = url;
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Could not open billing portal.');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading billing information…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700">{actionError}</p>
          <button type="button" onClick={() => setActionError('')} className="text-red-500 hover:text-red-700 text-sm font-semibold">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current plan</p>
          <h2 className="text-xl font-bold text-gray-900">{sub?.plan?.displayName ?? 'No plan'}</h2>
          {sub?.subscription && (
            <p className="text-sm text-gray-500 mt-1">
              {sub.subscription.status.toLowerCase()} · renews {new Date(sub.subscription.currentPeriodEnd).toLocaleDateString()}
              {sub.subscription.cancelAtPeriodEnd && ' · cancels at period end'}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setShowPlans((v) => !v)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
              {showPlans ? 'Hide plans' : 'Change plan'}
            </button>
            <button type="button" onClick={() => void handlePortal()} disabled={actionLoading === 'portal'} className="px-3 py-1.5 bg-gray-100 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-60">
              {actionLoading === 'portal' ? 'Opening…' : 'Manage billing'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Usage this period</p>
          {usage ? (
            <div className="space-y-3">
              <ProgressBar used={usage.messages.total} limit={usage.messages.limit} />
              <p className="text-xs text-gray-400">Messages · {usage.instances.used}/{usage.instances.limit ?? '∞'} instances · {usage.teamMembers.used}/{usage.teamMembers.limit ?? '∞'} team members</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No usage data yet.</p>
          )}
        </div>
      </div>

      {showPlans && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Available plans</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === sub?.plan?.id;
              return (
                <div key={plan.id} className={`rounded-xl border p-5 ${isCurrent ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                  <h4 className="font-bold text-gray-900">{plan.displayName}</h4>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{money(plan.priceMonthlyUsdCents)}<span className="text-sm font-normal text-gray-500">/mo</span></p>
                  {plan.description && <p className="text-xs text-gray-500 mt-2">{plan.description}</p>}
                  <ul className="text-xs text-gray-600 mt-3 space-y-1">
                    <li>{plan.maxInstances} instance{plan.maxInstances !== 1 && 's'}</li>
                    <li>{plan.maxMessagesPerMonth ? `${plan.maxMessagesPerMonth.toLocaleString()} messages/mo` : 'Unlimited messages'}</li>
                    <li>{plan.maxTeamMembers} team member{plan.maxTeamMembers !== 1 && 's'}</li>
                  </ul>
                  <button
                    type="button"
                    disabled={isCurrent || actionLoading === plan.id}
                    onClick={() => void handleUpgrade(plan.id)}
                    className="w-full mt-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-500"
                  >
                    {isCurrent ? 'Current plan' : actionLoading === plan.id ? 'Redirecting…' : 'Upgrade'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Invoice history</h3>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 py-8 text-center">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-2 font-medium">Date</th>
                <th className="px-6 py-2 font-medium">Amount</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-100">
                  <td className="px-6 py-3 text-gray-700">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-gray-900 font-medium">{money(inv.amountCents)}</td>
                  <td className="px-6 py-3"><StatusPill status={inv.status} /></td>
                  <td className="px-6 py-3 text-right">
                    {inv.invoicePdfUrl && <a href={inv.invoicePdfUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-sm">Download PDF</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
