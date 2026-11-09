'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api';

interface UsageSummary {
  plan: { id: string; name: string; displayName: string } | null;
  period: { start: string; end: string };
  messages: { sent: number; received: number; total: number; limit: number | null; percentUsed: number | null };
  instances: { used: number; limit: number | null };
  teamMembers: { used: number; limit: number | null };
}

interface TimeSeriesPoint { date: string; sent: number; received: number; }

interface InstanceUsage {
  instanceId: string;
  instanceName: string;
  phoneNumber: string | null;
  status: string;
  sent: number;
  received: number;
  failed: number;
  deliveryRatePercent: number | null;
}

interface DeliveryStats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRatePercent: number;
  failureRatePercent: number;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function MiniBarChart({ data }: { data: TimeSeriesPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.sent + d.received));
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div className="w-full flex flex-col-reverse" style={{ height: '112px' }}>
            <div className="w-full bg-indigo-500 rounded-t-sm" style={{ height: `${(d.sent / max) * 112}px` }} />
            <div className="w-full bg-green-400 rounded-t-sm" style={{ height: `${(d.received / max) * 112}px` }} />
          </div>
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
            {new Date(d.date).toLocaleDateString()}: {d.sent} sent, {d.received} received
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);
  const [byInstance, setByInstance] = useState<InstanceUsage[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, ts, bi, ds] = await Promise.all([
        api.get<UsageSummary>('/v1/usage/summary'),
        api.get<TimeSeriesPoint[]>('/v1/usage/messages?groupBy=day'),
        api.get<InstanceUsage[]>('/v1/usage/by-instance'),
        api.get<DeliveryStats>('/v1/usage/delivery-rate'),
      ]);
      setSummary(s);
      setSeries(ts);
      setByInstance(bi);
      setDeliveryStats(ds);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load usage.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading usage data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Usage &amp; analytics</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Messages sent" value={(summary?.messages.sent ?? 0).toLocaleString()} />
        <StatCard label="Messages received" value={(summary?.messages.received ?? 0).toLocaleString()} />
        <StatCard label="Delivery rate" value={`${deliveryStats?.deliveryRatePercent ?? 0}%`} sub={`${deliveryStats?.failed ?? 0} failed`} />
        <StatCard
          label="Plan usage"
          value={summary?.messages.limit ? `${summary.messages.percentUsed}%` : '—'}
          sub={summary?.messages.limit ? `of ${summary.messages.limit.toLocaleString()}/mo` : 'Unlimited plan'}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Messages over time</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Sent</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> Received</span>
          </div>
        </div>
        {series.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No message activity in this range yet.</p>
        ) : (
          <MiniBarChart data={series} />
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Per-instance breakdown</h3></div>
        {byInstance.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 py-8 text-center">No instances yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-2 font-medium">Instance</th>
                <th className="px-6 py-2 font-medium">Sent</th>
                <th className="px-6 py-2 font-medium">Received</th>
                <th className="px-6 py-2 font-medium">Failed</th>
                <th className="px-6 py-2 font-medium">Delivery rate</th>
              </tr>
            </thead>
            <tbody>
              {byInstance.map((row) => (
                <tr key={row.instanceId} className="border-t border-gray-100">
                  <td className="px-6 py-3 text-gray-900 font-medium">{row.instanceName}</td>
                  <td className="px-6 py-3 text-gray-700">{row.sent.toLocaleString()}</td>
                  <td className="px-6 py-3 text-gray-700">{row.received.toLocaleString()}</td>
                  <td className="px-6 py-3 text-red-500">{row.failed.toLocaleString()}</td>
                  <td className="px-6 py-3 text-gray-700">{row.deliveryRatePercent !== null ? `${row.deliveryRatePercent}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
