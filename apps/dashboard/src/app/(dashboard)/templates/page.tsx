'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiClientError } from '@/lib/api';

type Category = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
type Status = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

interface TemplateButton { type: ButtonType; text: string; value?: string; }

interface Template {
  id: string;
  name: string;
  category: Category;
  language: string;
  headerType: HeaderType;
  headerContent: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  status: Status;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<Status, string> = {
  APPROVED: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  REJECTED: 'bg-red-100 text-red-800',
  DRAFT: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status]}`}>{status}</span>;
}

function WhatsAppPreview({ draft }: { draft: { headerType: HeaderType; headerContent?: string; body: string; footer?: string; buttons: TemplateButton[] } }) {
  return (
    <div className="bg-[#e5ddd5] rounded-xl p-4">
      <div className="bg-white rounded-lg rounded-tl-none shadow-sm p-3 max-w-xs">
        {draft.headerType === 'TEXT' && draft.headerContent && <p className="font-bold text-gray-900 text-sm mb-1">{draft.headerContent}</p>}
        {draft.headerType !== 'NONE' && draft.headerType !== 'TEXT' && (
          <div className="bg-gray-100 rounded h-24 flex items-center justify-center text-xs text-gray-400 mb-2">{draft.headerType} header</div>
        )}
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{draft.body || <span className="text-gray-300">Message body…</span>}</p>
        {draft.footer && <p className="text-xs text-gray-400 mt-1">{draft.footer}</p>}
        <p className="text-[10px] text-gray-300 text-right mt-1">10:24 AM</p>
      </div>
      {draft.buttons.length > 0 && (
        <div className="mt-1 max-w-xs space-y-1">
          {draft.buttons.map((b, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm py-2 text-center text-sm text-indigo-600 font-medium">{b.text || 'Button'}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateFormModal({ initial, onSaved, onCancel }: { initial?: Template; onSaved: (t: Template) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'UTILITY');
  const [language, setLanguage] = useState(initial?.language ?? 'en');
  const [headerType, setHeaderType] = useState<HeaderType>(initial?.headerType ?? 'NONE');
  const [headerContent, setHeaderContent] = useState(initial?.headerContent ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [footer, setFooter] = useState(initial?.footer ?? '');
  const [buttons, setButtons] = useState<TemplateButton[]>(initial?.buttons ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { type: 'QUICK_REPLY', text: '' }]);
  }
  function updateButton(i: number, patch: Partial<TemplateButton>) {
    setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeButton(i: number) {
    setButtons((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) { setError('Name and body are required.'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = { name: name.trim(), category, language, headerType, headerContent: headerContent || undefined, body, footer: footer || undefined, buttons };
      const saved = initial
        ? await api.patch<Template>(`/v1/templates/${initial.id}`, payload)
        : await api.post<Template>('/v1/templates', payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save template.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">{initial ? 'Edit template' : 'New template'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name (snake_case)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!initial} placeholder="order_confirmation" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="pt_BR">Portuguese (BR)</option>
                  <option value="hi">Hindi</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Header type</label>
                <select value={headerType} onChange={(e) => setHeaderType(e.target.value as HeaderType)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="NONE">None</option>
                  <option value="TEXT">Text</option>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </div>
              {headerType === 'TEXT' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Header text</label>
                  <input value={headerContent} onChange={(e) => setHeaderContent(e.target.value)} maxLength={60} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Body — use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> for variables</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1024} placeholder="Hi {{1}}, your order {{2}} has shipped!" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Footer (optional)</label>
              <input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-700">Buttons (up to 3)</label>
                {buttons.length < 3 && <button type="button" onClick={addButton} className="text-xs text-indigo-600 font-medium">+ Add button</button>}
              </div>
              <div className="space-y-2">
                {buttons.map((b, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <select value={b.type} onChange={(e) => updateButton(i, { type: e.target.value as ButtonType })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                      <option value="QUICK_REPLY">Quick reply</option>
                      <option value="URL">URL</option>
                      <option value="PHONE_NUMBER">Phone</option>
                    </select>
                    <input value={b.text} onChange={(e) => updateButton(i, { text: e.target.value })} placeholder="Button text" maxLength={25} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                    {b.type !== 'QUICK_REPLY' && (
                      <input value={b.value ?? ''} onChange={(e) => updateButton(i, { value: e.target.value })} placeholder={b.type === 'URL' ? 'https://…' : '+1…'} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                    )}
                    <button type="button" onClick={() => removeButton(i)} className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onCancel} className="flex-1 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">{loading ? 'Saving…' : 'Save template'}</button>
            </div>
          </form>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Live preview</p>
            <WhatsAppPreview draft={{ headerType, headerContent, body, footer, buttons }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [actionError, setActionError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await api.get<Template[]>('/v1/templates');
      setTemplates(data);
    } catch (err) {
      if (!silent) setError(err instanceof ApiClientError ? err.message : 'Failed to load templates.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30s to pick up approval status changes, while any template is PENDING
  useEffect(() => {
    const hasPending = templates.some((t) => t.status === 'PENDING');
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => void load(true), 30_000);
    }
    if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [templates, load]);

  async function handleSubmitForApproval(t: Template) {
    setActionError('');
    try {
      const updated = await api.post<Template>(`/v1/templates/${t.id}/submit`);
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to submit template.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setActionError('');
    try {
      await api.delete(`/v1/templates/${deleteTarget.id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to delete template.');
    }
  }

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
          <h1 className="text-2xl font-bold text-gray-900">Message templates</h1>
          <p className="text-sm text-gray-600 mt-0.5">Pre-approved templates for notifications and marketing messages.</p>
        </div>
        <button type="button" onClick={() => { setEditTarget(undefined); setShowForm(true); }} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">+ New template</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading templates…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <h3 className="font-semibold text-gray-900 mb-1">No templates yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create a template to send structured, pre-approved messages.</p>
          <button type="button" onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">New template</button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 font-mono text-sm">{t.name}</h3>
                    <StatusBadge status={t.status} />
                    <span className="text-xs text-gray-400">{t.category} · {t.language}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">{t.body}</p>
                  {t.status === 'REJECTED' && t.rejectionReason && (
                    <p className="text-xs text-red-600 mt-1">Rejected: {t.rejectionReason}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                {(t.status === 'DRAFT' || t.status === 'REJECTED') && (
                  <>
                    <button type="button" onClick={() => void handleSubmitForApproval(t)} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Submit for approval</button>
                    <button type="button" onClick={() => { setEditTarget(t); setShowForm(true); }} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg">Edit</button>
                  </>
                )}
                {t.status === 'PENDING' && <span className="px-3 py-1.5 text-xs text-yellow-700">Under review — checking every 30s…</span>}
                <button type="button" onClick={() => setDeleteTarget(t)} className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg ml-auto">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TemplateFormModal
          initial={editTarget}
          onCancel={() => setShowForm(false)}
          onSaved={(t) => {
            setShowForm(false);
            setTemplates((prev) => (editTarget ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]));
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete template?</h2>
            <p className="text-sm text-gray-600 mb-6"><strong className="font-mono">{deleteTarget.name}</strong> will be permanently removed.</p>
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
