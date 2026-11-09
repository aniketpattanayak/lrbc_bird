'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  environment: 'LIVE' | 'SANDBOX';
  permissions: string[];
  ipWhitelist: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  usageCount: number;
  revokedAt: string | null;
  createdAt: string;
}

interface CreateApiKeyResult {
  key: string;
  apiKey: ApiKey;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function EnvBadge({ env }: { env: 'LIVE' | 'SANDBOX' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${env === 'LIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
      {env}
    </span>
  );
}

function NewKeyModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(rawKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {
      const el = document.getElementById('new-key-value') as HTMLInputElement | null;
      el?.select();
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Your new API key</h2>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5"><strong>Save this key now.</strong> You will not be able to see it again after closing this dialog.</p>
        <div className="flex gap-2 mb-6">
          <input id="new-key-value" type="text" readOnly value={rawKey} className="flex-1 font-mono text-sm bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none" />
          <button type="button" onClick={handleCopy} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap">{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        <button type="button" onClick={onClose} className="w-full py-2.5 bg-gray-100 text-gray-800 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm">I&apos;ve saved it — close</button>
      </div>
    </div>
  );
}

function RevokeConfirmModal({ keyName, onConfirm, onCancel, loading }: { keyName: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Revoke API key?</h2>
        <p className="text-sm text-gray-600 mb-6">Revoking <strong>&ldquo;{keyName}&rdquo;</strong> will immediately block any requests using it. This cannot be undone.</p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={loading} className="flex-1 py-2.5 bg-gray-100 text-gray-800 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={loading} className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-60">{loading ? 'Revoking…' : 'Revoke key'}</button>
        </div>
      </div>
    </div>
  );
}

function CreateKeyForm({ onCreated, onCancel }: { onCreated: (result: CreateApiKeyResult) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<'LIVE' | 'SANDBOX'>('LIVE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Key name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await api.post<CreateApiKeyResult>('/v1/api-keys', { name: name.trim(), environment });
      onCreated(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6">
      <h3 className="font-semibold text-gray-900 mb-4">New API key</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="key-name" className="block text-sm font-medium text-gray-700 mb-1">Key name</label>
          <input id="key-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production server" maxLength={50} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor="key-env" className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
          <select id="key-env" value={environment} onChange={(e) => setEnvironment(e.target.value as 'LIVE' | 'SANDBOX')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="LIVE">Live</option>
            <option value="SANDBOX">Sandbox</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60">{loading ? 'Creating…' : 'Create key'}</button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await api.get<ApiKey[]>('/v1/api-keys');
      setKeys(data);
    } catch (err) {
      setFetchError(err instanceof ApiClientError ? err.message : 'Failed to load API keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.delete(`/v1/api-keys/${revokeTarget.id}`);
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch (err) {
      console.error('Revoke failed', err);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-600 mt-0.5">Authenticate your application to the WhatsApp API using these keys.</p>
        </div>
        {!showCreateForm && (
          <button type="button" onClick={() => setShowCreateForm(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">+ Create API key</button>
        )}
      </div>

      {showCreateForm && <CreateKeyForm onCreated={(r) => { setShowCreateForm(false); setNewKey(r.key); setKeys((prev) => [r.apiKey, ...prev]); }} onCancel={() => setShowCreateForm(false)} />}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading keys…</p>
        </div>
      ) : fetchError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{fetchError}</p>
          <button type="button" onClick={() => void loadKeys()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      ) : keys.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <h3 className="font-semibold text-gray-900 mb-1">No API keys yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create a key to authenticate your application with the WhatsApp API.</p>
          <button type="button" onClick={() => setShowCreateForm(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">Create your first key</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Environment</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Prefix</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Created</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Last used</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Requests</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keys.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{key.name}</td>
                    <td className="px-5 py-3.5"><EnvBadge env={key.environment} /></td>
                    <td className="px-5 py-3.5 font-mono text-gray-500 text-xs">{key.keyPrefix}…</td>
                    <td className="px-5 py-3.5 text-gray-500">{formatDate(key.createdAt)}</td>
                    <td className="px-5 py-3.5 text-gray-500">{timeAgo(key.lastUsedAt)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500">{key.usageCount.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button type="button" onClick={() => setRevokeTarget(key)} className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors">Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {newKey && <NewKeyModal rawKey={newKey} onClose={() => setNewKey(null)} />}
      {revokeTarget && <RevokeConfirmModal keyName={revokeTarget.name} onConfirm={() => void handleRevoke()} onCancel={() => setRevokeTarget(null)} loading={revoking} />}
    </div>
  );
}
