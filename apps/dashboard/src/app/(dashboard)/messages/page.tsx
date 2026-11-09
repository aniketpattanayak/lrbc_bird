'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api';

interface Instance { id: string; displayName: string; status: string; }

interface Message {
  id: string;
  instanceId: string;
  instanceName: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  status: string;
  toNumber: string | null;
  fromNumber: string | null;
  content: Record<string, unknown>;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = { TEXT: '💬', IMAGE: '🖼️', VIDEO: '🎬', AUDIO: '🎵', DOCUMENT: '📄', LOCATION: '📍', TEMPLATE: '📋' };
const STATUS_STYLES: Record<string, string> = {
  SENT: 'bg-blue-100 text-blue-700', DELIVERED: 'bg-green-100 text-green-700', READ: 'bg-indigo-100 text-indigo-700',
  FAILED: 'bg-red-100 text-red-700', QUEUED: 'bg-gray-100 text-gray-600', SENDING: 'bg-yellow-100 text-yellow-700',
};

function preview(content: Record<string, unknown>): string {
  if (typeof content['text'] === 'string') return content['text'];
  if (typeof content['caption'] === 'string') return content['caption'];
  if (content['latitude']) return `📍 ${content['name'] ?? 'Location'}`;
  return '(media)';
}

function SendMessagePanel({ instances, onSent, onClose }: { instances: Instance[]; onSent: () => void; onClose: () => void }) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [type, setType] = useState<'text' | 'image' | 'document'>('text');
  const [message, setMessage] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!instanceId || !to.trim()) { setError('Instance and phone number are required.'); return; }
    setLoading(true);
    setError('');
    try {
      if (type === 'text') {
        if (!message.trim()) { setError('Message text is required.'); setLoading(false); return; }
        await api.post(`/v1/instances/${instanceId}/messages/send/text`, { to: to.trim(), message: message.trim() });
      } else if (type === 'image') {
        if (!mediaUrl.trim()) { setError('Image URL is required.'); setLoading(false); return; }
        await api.post(`/v1/instances/${instanceId}/messages/send/image`, { to: to.trim(), mediaUrl: mediaUrl.trim(), caption: message.trim() || undefined });
      } else {
        if (!mediaUrl.trim()) { setError('Document URL is required.'); setLoading(false); return; }
        await api.post(`/v1/instances/${instanceId}/messages/send/document`, { to: to.trim(), mediaUrl: mediaUrl.trim(), caption: message.trim() || undefined });
      }
      onSent();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to send message.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Send a message</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>
      <form onSubmit={(e) => void handleSend(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Instance</label>
          <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {instances.map((i) => <option key={i.id} value={i.id} disabled={i.status !== 'CONNECTED'}>{i.displayName} {i.status !== 'CONNECTED' ? '(not connected)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone number</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+15551234567" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="document">Document</option>
          </select>
        </div>
        {type !== 'text' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{type === 'image' ? 'Image' : 'Document'} URL</label>
            <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">{type === 'text' ? 'Message' : 'Caption (optional)'}</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
        <div className="sm:col-span-2">
          <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">{loading ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </div>
  );
}

function ConversationModal({ instanceId, phone, onClose }: { instanceId: string; phone: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Message[]>(`/v1/messages/conversation?instanceId=${instanceId}&phone=${encodeURIComponent(phone)}`)
      .then(setMessages).catch(() => setMessages([])).finally(() => setLoading(false));
  }, [instanceId, phone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{phone}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5] space-y-2">
          {loading ? (
            <p className="text-center text-sm text-gray-500">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-gray-500">No messages in this conversation.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direction === 'OUTBOUND' ? 'bg-[#dcf8c6]' : 'bg-white'}`}>
                  <p>{preview(m.content)}</p>
                  <p className="text-[10px] text-gray-400 text-right mt-1">{new Date(m.createdAt).toLocaleTimeString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [search, setSearch] = useState('');
  const [instanceFilter, setInstanceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showSend, setShowSend] = useState(false);
  const [thread, setThread] = useState<{ instanceId: string; phone: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      if (instanceFilter) params.set('instanceId', instanceFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.paginated<Message>(`/v1/messages?${params.toString()}`);
      if (res.success) { setMessages(res.data); setHasNext(res.meta.hasNext); }
      if (instances.length === 0) {
        const insts = await api.get<Instance[]>('/v1/instances');
        setInstances(insts);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, instanceFilter, typeFilter, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-600 mt-0.5">Everything sent and received across your instances.</p>
        </div>
        <button type="button" onClick={() => setShowSend((v) => !v)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
          {showSend ? 'Close' : '+ Send message'}
        </button>
      </div>

      {showSend && <SendMessagePanel instances={instances} onClose={() => setShowSend(false)} onSent={() => { setShowSend(false); void load(); }} />}

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search phone number or content…" className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <select value={instanceFilter} onChange={(e) => { setPage(1); setInstanceFilter(e.target.value); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All instances</option>
          {instances.map((i) => <option key={i.id} value={i.id}>{i.displayName}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => { setPage(1); setTypeFilter(e.target.value); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All types</option>
          {Object.keys(TYPE_ICONS).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading messages…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-sm">No messages match these filters.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium"></th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Preview</th>
                  <th className="px-4 py-2 font-medium">Instance</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => {
                  const contact = m.direction === 'OUTBOUND' ? m.toNumber : m.fromNumber;
                  return (
                    <tr
                      key={m.id}
                      className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => contact && setThread({ instanceId: m.instanceId, phone: contact })}
                    >
                      <td className="px-4 py-3">{TYPE_ICONS[m.type] ?? '📎'}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{contact ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{m.direction === 'INBOUND' ? '← ' : '→ '}{preview(m.content)}</td>
                      <td className="px-4 py-3 text-gray-500">{m.instanceName}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLES[m.status] ?? 'bg-gray-100 text-gray-600'}`}>{m.status}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-sm text-gray-600 disabled:opacity-40">← Previous</button>
            <span className="text-xs text-gray-400">Page {page}</span>
            <button type="button" disabled={!hasNext} onClick={() => setPage((p) => p + 1)} className="text-sm text-gray-600 disabled:opacity-40">Next →</button>
          </div>
        </>
      )}

      {thread && <ConversationModal instanceId={thread.instanceId} phone={thread.phone} onClose={() => setThread(null)} />}
    </div>
  );
}
