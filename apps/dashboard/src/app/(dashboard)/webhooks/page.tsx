'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api';

const EVENT_TYPES = [
  'message.received', 'message.sent', 'message.delivered', 'message.read', 'message.failed',
  'session.connected', 'session.disconnected', 'session.qr_generated',
];

interface Instance { id: string; displayName: string; }

interface WebhookConfig {
  id: string;
  instanceId: string;
  instanceName: string;
  url: string;
  events: string[];
  isEnabled: boolean;
  secretPrefix: string;
  consecutiveFails: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
}

interface Delivery {
  id: string;
  eventType: string;
  attemptNumber: number;
  status: string;
  httpStatusCode: number | null;
  latencyMs: number | null;
  attemptedAt: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />;
}

function CreateWebhookModal({ instances, onCreated, onCancel }: { instances: Instance[]; onCreated: (c: WebhookConfig & { secret?: string }) => void; onCancel: () => void }) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? '');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['message.received']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleEvent(e: string) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instanceId || !url.trim() || events.length === 0) { setError('Select an instance, URL, and at least one event.'); return; }
    setLoading(true);
    setError('');
    try {
      const created = await api.post<WebhookConfig & { secret: string }>('/v1/webhooks', { instanceId, url: url.trim(), events });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create webhook.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-4">New webhook endpoint</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instance</label>
            <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {instances.map((i) => <option key={i.id} value={i.id}>{i.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourapp.com/webhooks/whatsapp" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} className="rounded border-gray-300 text-indigo-600" />
                  {e}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">{loading ? 'Creating…' : 'Create webhook'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Signing secret</h2>
        <p className="text-sm text-gray-600 mb-4">Save this now — it won&apos;t be shown again. Use it to verify the <code className="bg-gray-100 px-1 rounded">X-WA-Signature</code> header.</p>
        <div className="flex gap-2 mb-4">
          <input readOnly value={secret} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50" />
          <button type="button" onClick={() => { void navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-3 py-2 bg-gray-100 text-sm font-medium rounded-lg hover:bg-gray-200">{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        <button type="button" onClick={onClose} className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 text-sm">Done</button>
      </div>
    </div>
  );
}

function DeliveryLogModal({ config, onClose }: { config: WebhookConfig; onClose: () => void }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Delivery[]>(`/v1/webhooks/${config.id}/deliveries`)
      .then(setDeliveries)
      .catch(() => setDeliveries([]))
      .finally(() => setLoading(false));
  }, [config.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Delivery log · {config.instanceName}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No deliveries recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <th className="py-2">Time</th><th className="py-2">Event</th><th className="py-2">Status</th><th className="py-2">Latency</th><th className="py-2">Attempt</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-600">{new Date(d.attemptedAt).toLocaleString()}</td>
                  <td className="py-2 text-gray-700 font-mono text-xs">{d.eventType}</td>
                  <td className="py-2"><span className={`font-medium ${d.status === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}`}>{d.httpStatusCode ?? d.status}</span></td>
                  <td className="py-2 text-gray-500">{d.latencyMs ? `${d.latencyMs}ms` : '—'}</td>
                  <td className="py-2 text-gray-500">#{d.attemptNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function WebhooksPage() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [logTarget, setLogTarget] = useState<WebhookConfig | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<WebhookConfig | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfgs, insts] = await Promise.all([
        api.get<WebhookConfig[]>('/v1/webhooks'),
        api.get<Instance[]>('/v1/instances'),
      ]);
      setConfigs(cfgs);
      setInstances(insts);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load webhooks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleEnabled(config: WebhookConfig) {
    setActionError('');
    try {
      const updated = await api.patch<WebhookConfig>(`/v1/webhooks/${config.id}`, { isEnabled: !config.isEnabled });
      setConfigs((prev) => prev.map((c) => (c.id === config.id ? updated : c)));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to update webhook.');
    }
  }

  async function handleTest(config: WebhookConfig) {
    setTestResults((prev) => ({ ...prev, [config.id]: 'Testing…' }));
    try {
      const result = await api.post<{ success: boolean; httpStatusCode: number | null; latencyMs: number; errorMessage?: string }>(`/v1/webhooks/${config.id}/test`);
      setTestResults((prev) => ({ ...prev, [config.id]: result.success ? `✓ ${result.httpStatusCode} in ${result.latencyMs}ms` : `✗ ${result.errorMessage ?? result.httpStatusCode}` }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [config.id]: err instanceof ApiClientError ? `✗ ${err.message}` : '✗ Failed' }));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setActionError('');
    try {
      await api.delete(`/v1/webhooks/${deleteTarget.id}`);
      setConfigs((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to delete webhook.');
    }
  }

  const availableInstances = instances.filter((i) => !configs.some((c) => c.instanceId === i.id));

  return (
    <div className="max-w-4xl mx-auto">
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700">{actionError}</p>
          <button type="button" onClick={() => setActionError('')} className="text-red-500 hover:text-red-700 text-sm font-semibold">Dismiss</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-600 mt-0.5">Receive real-time events as they happen on each instance.</p>
        </div>
        {availableInstances.length > 0 && (
          <button type="button" onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">+ Add webhook</button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading webhooks…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      ) : configs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <h3 className="font-semibold text-gray-900 mb-1">No webhooks configured</h3>
          <p className="text-sm text-gray-500 mb-4">Add an endpoint to start receiving events from your instances.</p>
          {instances.length > 0 && <button type="button" onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">Add webhook</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <div key={config.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config.isEnabled && config.consecutiveFails === 0} />
                    <h3 className="font-semibold text-gray-900 truncate">{config.instanceName}</h3>
                  </div>
                  <p className="text-sm text-gray-500 font-mono truncate mt-0.5">{config.url}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {config.events.map((e) => <span key={e} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{e}</span>)}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Secret ends in ••••{config.secretPrefix} · {config.consecutiveFails > 0 ? `${config.consecutiveFails} consecutive failures` : 'healthy'}</p>
                  {testResults[config.id] && <p className="text-xs mt-1 font-mono">{testResults[config.id]}</p>}
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">
                  <input type="checkbox" checked={config.isEnabled} onChange={() => void toggleEnabled(config)} className="rounded border-gray-300 text-indigo-600" />
                  Active
                </label>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => void handleTest(config)} className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg">Test delivery</button>
                <button type="button" onClick={() => setLogTarget(config)} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg">View log</button>
                <button
                  type="button"
                  onClick={() => {
                    void api.post<{ secret: string }>(`/v1/webhooks/${config.id}/rotate-secret`).then((r) => setNewSecret(r.secret));
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg"
                >
                  Rotate secret
                </button>
                <button type="button" onClick={() => setDeleteTarget(config)} className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg ml-auto">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateWebhookModal
          instances={availableInstances}
          onCancel={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false);
            setConfigs((prev) => [created, ...prev]);
            if (created.secret) setNewSecret(created.secret);
          }}
        />
      )}
      {newSecret && <SecretModal secret={newSecret} onClose={() => setNewSecret(null)} />}
      {logTarget && <DeliveryLogModal config={logTarget} onClose={() => setLogTarget(null)} />}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete webhook?</h2>
            <p className="text-sm text-gray-600 mb-6">Events for <strong>{deleteTarget.instanceName}</strong> will stop being delivered.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-800 font-semibold rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
              <button type="button" onClick={() => void handleDelete()} className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
