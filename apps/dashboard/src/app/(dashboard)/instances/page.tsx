'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type InstanceStatus = 'PENDING' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'BANNED' | 'ERROR';

interface Instance {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  status: InstanceStatus;
  qrCode: string | null;
  qrExpiresAt: string | null;
  webhookUrl: string | null;
  connectedAt: string | null;
  createdAt: string;
}

interface QrResult {
  qrCode: string | null;
  qrExpiresAt: string | null;
  message: string | null;
}

const STATUS_STYLES: Record<InstanceStatus, { bg: string; text: string; dot: string }> = {
  CONNECTED:    { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
  CONNECTING:   { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-400' },
  PENDING:      { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-400' },
  DISCONNECTED: { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400' },
  ERROR:        { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500' },
  BANNED:       { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-700' },
};

function StatusBadge({ status }: { status: InstanceStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.ERROR;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function QrModal({ instanceId, displayName, onClose }: { instanceId: string; displayName: string; onClose: () => void }) {
  const [qrData, setQrData] = useState<QrResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchQr() {
      setLoading(true);
      setError('');
      try {
        const result = await api.get<QrResult>(`/v1/instances/${instanceId}/qr`);
        setQrData(result);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load QR code.');
      } finally {
        setLoading(false);
      }
    }
    void fetchQr();
  }, [instanceId]);

  const qrSrc = qrData?.qrCode
    ? qrData.qrCode.startsWith('data:') ? qrData.qrCode : `data:image/png;base64,${qrData.qrCode}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Connect {displayName}</h2>
        <p className="text-sm text-gray-500 mb-5">Open WhatsApp › Linked Devices › Add Device, then scan this code.</p>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-5 min-h-[240px] flex items-center justify-center">
          {loading ? (
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          ) : error ? (
            <p className="text-red-600 text-sm">{error}</p>
          ) : qrSrc ? (
            <img src={qrSrc} alt="WhatsApp QR code" className="w-48 h-48 object-contain" />
          ) : (
            <p className="text-gray-500 text-sm">{qrData?.message ?? 'QR code not available yet.'}</p>
          )}
        </div>
        {qrData?.qrExpiresAt && (
          <p className="text-xs text-gray-400 mb-4">Expires at {new Date(qrData.qrExpiresAt).toLocaleTimeString()}</p>
        )}
        <button type="button" onClick={onClose} className="w-full py-2.5 bg-gray-100 text-gray-800 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm">Close</button>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ displayName, onConfirm, onCancel, loading }: { displayName: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Delete instance?</h2>
        <p className="text-sm text-gray-600 mb-6"><strong>&ldquo;{displayName}&rdquo;</strong> will be disconnected and removed.</p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={loading} className="flex-1 py-2.5 bg-gray-100 text-gray-800 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={loading} className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-60">{loading ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

function CreateInstanceModal({ onCreated, onClose, lockedMode }: { onCreated: (instance: Instance) => void; onClose: () => void; lockedMode: 'UNOFFICIAL' | 'OFFICIAL' | null }) {
  const [mode, setMode] = useState<'UNOFFICIAL' | 'OFFICIAL'>(lockedMode ?? 'UNOFFICIAL');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaWebhookVerifyToken, setMetaWebhookVerifyToken] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Instance | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { setError('Display name is required.'); return; }
    if (mode === 'OFFICIAL' && (!metaPhoneNumberId.trim() || !metaAccessToken.trim() || !metaWabaId.trim() || !metaWebhookVerifyToken.trim() || !metaAppSecret.trim())) {
      setError('All Meta Cloud API fields are required for an Official instance.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const instance = await api.post<Instance>('/v1/instances', {
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        connectionMode: mode,
        ...(mode === 'OFFICIAL' && {
          metaPhoneNumberId: metaPhoneNumberId.trim(),
          metaAccessToken: metaAccessToken.trim(),
          metaWabaId: metaWabaId.trim(),
          metaWebhookVerifyToken: metaWebhookVerifyToken.trim(),
          metaAppSecret: metaAppSecret.trim(),
        }),
      });
      onCreated(instance);
      if (mode === 'OFFICIAL') {
        setCreated(instance);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">✅ &ldquo;{created.displayName}&rdquo; is ready</h2>
          <p className="text-sm text-gray-600 mb-4">Your Official instance connects via the Meta Cloud API. We verified your credentials with Meta already. One step left so inbound messages and delivery statuses reach you:</p>
          <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside mb-6">
            <li>In your Meta app, go to <strong>WhatsApp → Configuration</strong>.</li>
            <li>
              Set the <strong>Callback URL</strong> to:
              <code className="block bg-gray-100 px-2 py-1 rounded mt-1 break-all">{`${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'}/v1/meta/webhook`}</code>
            </li>
            <li>Set the <strong>Verify token</strong> to the token you entered here.</li>
            <li>Click <strong>Verify and save</strong>, then subscribe to the <code className="bg-gray-100 px-1 rounded">messages</code> webhook field.</li>
            <li>Send a test message from the API — this instance is marked connected and ready now.</li>
          </ol>
          <button type="button" onClick={onClose} className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors text-sm">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">New WhatsApp instance</h2>

        {lockedMode ? (
          <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="text-sm">🔒</span>
            <p className="text-xs font-medium text-gray-600">
              {lockedMode === 'UNOFFICIAL' ? 'Unofficial API account — QR scan only' : 'Official API account — Meta Cloud API only'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button
              type="button"
              onClick={() => setMode('UNOFFICIAL')}
              className={`text-left p-3 rounded-lg border-2 transition-colors ${mode === 'UNOFFICIAL' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <p className="font-semibold text-sm text-gray-900">Unofficial</p>
              <p className="text-xs text-gray-500 mt-0.5">QR scan via a linked device, powered by Baileys.</p>
            </button>
            <button
              type="button"
              onClick={() => setMode('OFFICIAL')}
              className={`text-left p-3 rounded-lg border-2 transition-colors ${mode === 'OFFICIAL' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <p className="font-semibold text-sm text-gray-900">Official</p>
              <p className="text-xs text-gray-500 mt-0.5">Meta Cloud API, using your own WABA credentials.</p>
            </button>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Support line" maxLength={50} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {mode === 'UNOFFICIAL' ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                You&apos;ll need these from your Meta Business / WhatsApp Business Platform app.
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Meta Phone Number ID</label>
                <input value={metaPhoneNumberId} onChange={(e) => setMetaPhoneNumberId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Meta Access Token</label>
                <input type="password" value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Meta WABA ID</label>
                <input value={metaWabaId} onChange={(e) => setMetaWabaId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Webhook Verify Token</label>
                <input value={metaWebhookVerifyToken} onChange={(e) => setMetaWebhookVerifyToken(e.target.value)} placeholder="Choose a string Meta will echo back" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">App Secret</label>
                <input type="password" value={metaAppSecret} onChange={(e) => setMetaAppSecret(e.target.value)} placeholder="From Meta app → Settings → Basic" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-800 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors text-sm disabled:opacity-60">{loading ? 'Creating…' : 'Create instance'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
      title={`Copy ${label}`}
    >
      {copied ? (
        <><span className="text-green-500">✓</span> <span className="text-green-500">Copied!</span></>
      ) : (
        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy ID</>
      )}
    </button>
  );
}

function InstanceCard({ instance, onShowQr, onDelete }: { instance: Instance; onShowQr: (i: Instance) => void; onDelete: (i: Instance) => void }) {
  const canShowQr = (instance as any).status !== 'CONNECTED' && (instance as any).status !== 'BANNED' && (instance as any).status !== 'DELETED';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{instance.displayName}</h3>
          {instance.phoneNumber ? <p className="text-sm text-gray-500 mt-0.5">{instance.phoneNumber}</p> : <p className="text-xs text-gray-400 mt-0.5">No number linked yet</p>}
        </div>
        <StatusBadge status={instance.status} />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          Created {new Date(instance.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {instance.connectedAt && <> · Connected {new Date(instance.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
        </div>
        <CopyButton text={instance.id} label="Instance ID" />
      </div>
      <div className="flex gap-2 pt-1 border-t border-gray-100">
        {canShowQr && (
          <button type="button" onClick={() => onShowQr(instance)} className="flex-1 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-center">View QR</button>
        )}
        <button type="button" onClick={() => onDelete(instance)} className="flex-1 py-2 text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors text-center">Delete</button>
      </div>
    </div>
  );
}

export default function InstancesPage() {
  const { tenant } = useAuthStore();
  const lockedMode = (tenant?.whatsappMode ?? null) as 'UNOFFICIAL' | 'OFFICIAL' | null;
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qrTarget, setQrTarget] = useState<Instance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Instance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadInstances = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await api.get<Instance[]>('/v1/instances');
      setInstances(data);
    } catch (err) {
      setFetchError(err instanceof ApiClientError ? err.message : 'Failed to load instances.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadInstances(); }, [loadInstances]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/instances/${deleteTarget.id}`);
      setInstances((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Instances</h1>
            {lockedMode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                🔒 {lockedMode === 'UNOFFICIAL' ? 'Unofficial API account' : 'Official API account'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">Each instance is a WhatsApp number slot. Scan the QR code to link a phone.</p>
        </div>
        <button type="button" onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">+ Add instance</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading instances…</p>
        </div>
      ) : fetchError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{fetchError}</p>
          <button type="button" onClick={() => void loadInstances()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      ) : instances.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <h3 className="font-semibold text-gray-900 mb-1">Create your first WhatsApp instance</h3>
          <p className="text-sm text-gray-500 mb-4">Add a phone number slot, scan the QR code, and start sending messages via the API.</p>
          <button type="button" onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">Add instance</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {instances.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} onShowQr={setQrTarget} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {showCreateModal && <CreateInstanceModal onCreated={(i) => setInstances((prev) => [i, ...prev])} onClose={() => setShowCreateModal(false)} lockedMode={lockedMode} />}
      {qrTarget && <QrModal instanceId={qrTarget.id} displayName={qrTarget.displayName} onClose={() => setQrTarget(null)} />}
      {deleteTarget && <DeleteConfirmModal displayName={deleteTarget.displayName} onConfirm={() => void handleDelete()} onCancel={() => setDeleteTarget(null)} loading={deleting} />}
    </div>
  );
}
