'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface Instance {
  id: string;
  status: string;
}

interface WebhookConfig {
  id: string;
}

interface Delivery {
  status: string;
}

interface UsageSummary {
  messages: { total: number };
}

interface Stats {
  activeInstances: number;
  totalInstances: number;
  messagesThisMonth: number;
  apiKeyCount: number;
  webhookConfigured: boolean;
  webhookSuccessRate: number | null;
}

export default function DashboardPage() {
  const { user, tenant } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState('');

  const trialDaysLeft = tenant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatsError('');
      try {
        const [instances, usage, apiKeys, webhooks] = await Promise.all([
          api.get<Instance[]>('/v1/instances'),
          api.get<UsageSummary>('/v1/usage/summary'),
          api.get<unknown[]>('/v1/api-keys'),
          api.get<WebhookConfig[]>('/v1/webhooks'),
        ]);

        let webhookSuccessRate: number | null = null;
        if (webhooks.length > 0) {
          try {
            const deliveries = await api.get<Delivery[]>(`/v1/webhooks/${webhooks[0].id}/deliveries`);
            if (deliveries.length > 0) {
              const successCount = deliveries.filter((d) => d.status === 'SUCCESS').length;
              webhookSuccessRate = Math.round((successCount / deliveries.length) * 100);
            }
          } catch {
            // Non-fatal — leave the success rate unknown rather than failing the whole page.
          }
        }

        if (!cancelled) {
          setStats({
            activeInstances: instances.filter((i) => i.status === 'CONNECTED').length,
            totalInstances: instances.length,
            messagesThisMonth: usage.messages.total,
            apiKeyCount: apiKeys.length,
            webhookConfigured: webhooks.length > 0,
            webhookSuccessRate,
          });
        }
      } catch (err) {
        if (!cancelled) setStatsError(err instanceof ApiClientError ? err.message : 'Failed to load account stats.');
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const statCards = [
    {
      label: 'Active Instances',
      value: stats ? String(stats.activeInstances) : '…',
      sub: stats ? (stats.activeInstances > 0 ? `${stats.totalInstances} total instance${stats.totalInstances === 1 ? '' : 's'}` : 'Connect a WhatsApp number') : 'Loading…',
    },
    {
      label: 'Messages This Month',
      value: stats ? stats.messagesThisMonth.toLocaleString() : '…',
      sub: stats ? (stats.messagesThisMonth > 0 ? 'Sent + received' : 'No messages yet') : 'Loading…',
    },
    {
      label: 'Webhook Success Rate',
      value: stats ? (stats.webhookSuccessRate !== null ? `${stats.webhookSuccessRate}%` : '—') : '…',
      sub: stats ? (stats.webhookConfigured ? (stats.webhookSuccessRate !== null ? 'Last deliveries' : 'No deliveries yet') : 'No webhooks configured') : 'Loading…',
    },
    {
      label: 'API Keys',
      value: stats ? String(stats.apiKeyCount) : '…',
      sub: stats ? (stats.apiKeyCount > 0 ? 'Active keys' : 'Create a key to use the API') : 'Loading…',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="text-gray-600 mt-1">Here's what's happening with your account.</p>
      </div>

      {statsError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700">{statsError}</p>
          <button type="button" onClick={() => setStatsError('')} className="text-red-500 hover:text-red-700 text-sm font-semibold">Dismiss</button>
        </div>
      )}

      {tenant?.status === 'TRIAL' && trialDaysLeft !== null && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <div>
            <span className="font-medium text-amber-900">
              {trialDaysLeft > 0 ? `Free trial: ${trialDaysLeft} days remaining` : 'Free trial expired'}
            </span>
            <p className="text-sm text-amber-700 mt-0.5">Upgrade to keep your instances connected.</p>
          </div>
          <a href="/billing/upgrade" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors ml-4">
            Upgrade now
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-600">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Get started in 3 steps</h2>
        <div className="space-y-4">
          {[
            { step: 1, title: 'Create a WhatsApp instance', description: 'Add a phone number slot to your account.', href: '/instances/new', action: 'Create instance' },
            { step: 2, title: 'Scan the QR code', description: 'Open WhatsApp → Linked Devices → Add Device and scan.', href: null, action: null },
            { step: 3, title: 'Send your first message', description: 'Use your API key to send a test message.', href: '/api-keys', action: 'Get API key' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                {item.step}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{item.title}</p>
                <p className="text-sm text-gray-600 mt-0.5">{item.description}</p>
                {item.href && (
                  <a href={item.href} className="inline-block mt-2 text-sm font-medium text-green-700 hover:underline">
                    {item.action} →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
