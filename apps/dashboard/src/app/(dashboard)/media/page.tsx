'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiClientError, getAccessToken } from '@/lib/api';

interface MediaFile {
  id: string;
  type: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  isPublic: boolean;
  createdAt: string;
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const TYPE_FILTERS = ['all', 'image', 'video', 'audio', 'document'] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  const icon = { image: '🖼️', video: '🎬', audio: '🎵', document: '📄' }[type] ?? '📎';
  return <span className="text-3xl">{icon}</span>;
}

function MediaCard({ file, onPreview, onDelete }: { file: MediaFile; onPreview: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
      <button type="button" onClick={onPreview} className="w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
        {file.type === 'image' ? (
          <img src={file.storageUrl} alt={file.originalFilename ?? 'media'} className="w-full h-full object-cover" />
        ) : (
          <FileIcon type={file.type} />
        )}
      </button>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 truncate" title={file.originalFilename ?? ''}>{file.originalFilename ?? 'Untitled'}</p>
        <p className="text-xs text-gray-400">{formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()}</p>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(file.storageUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex-1 text-xs py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg font-medium"
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
          <button type="button" onClick={onDelete} className="text-xs py-1.5 px-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium">Delete</button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ file, onClose }: { file: MediaFile; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 truncate">{file.originalFilename ?? 'Untitled'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {file.type === 'image' ? (
          <img src={file.storageUrl} alt={file.originalFilename ?? ''} className="w-full max-h-[60vh] object-contain rounded-lg bg-gray-50" />
        ) : file.type === 'video' ? (
          <video src={file.storageUrl} controls className="w-full max-h-[60vh] rounded-lg bg-black" />
        ) : file.type === 'audio' ? (
          <audio src={file.storageUrl} controls className="w-full" />
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <FileIcon type={file.type} />
            <p className="text-sm text-gray-500 mt-2">{file.mimeType}</p>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 mt-4 text-sm">
          <dt className="text-gray-400">Size</dt><dd className="text-gray-700">{formatBytes(file.sizeBytes)}</dd>
          <dt className="text-gray-400">Type</dt><dd className="text-gray-700">{file.mimeType}</dd>
          <dt className="text-gray-400">Uploaded</dt><dd className="text-gray-700">{new Date(file.createdAt).toLocaleString()}</dd>
        </dl>
        <a href={file.storageUrl} target="_blank" rel="noreferrer" className="block w-full mt-4 text-center py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">Open original</a>
      </div>
    </div>
  );
}

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<typeof TYPE_FILTERS[number]>('all');
  const [preview, setPreview] = useState<MediaFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [actionError, setActionError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MediaFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (type?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '60' });
      if (type && type !== 'all') params.set('type', type);
      const res = await api.paginated<MediaFile>(`/v1/media?${params.toString()}`);
      if (res.success) setFiles(res.data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load media.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadProgress(0);
    setActionError('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/v1/media/upload`);
        const token = getAccessToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => setUploadProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || 'Upload failed')));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
      });

      await load(filter);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleDelete(file: MediaFile) {
    setActionError('');
    try {
      await api.delete(`/v1/media/${file.id}`);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to delete file.');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700">{actionError}</p>
          <button type="button" onClick={() => setActionError('')} className="text-red-500 hover:text-red-700 text-sm font-semibold">Dismiss</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media library</h1>
          <p className="text-sm text-gray-600 mt-0.5">Files available to attach to outbound messages.</p>
        </div>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">+ Upload</button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ''; }} />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void uploadFile(f); }}
        className={`mb-4 border-2 border-dashed rounded-xl p-4 text-center text-sm transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-400'}`}
      >
        {uploading ? (
          <div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2 max-w-xs mx-auto">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
            Uploading… {uploadProgress}%
          </div>
        ) : (
          'Drag and drop a file here, or click Upload'
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize ${filter === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading media…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button type="button" onClick={() => void load(filter)} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      ) : files.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-sm">No files yet. Upload one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {files.map((file) => (
            <MediaCard key={file.id} file={file} onPreview={() => setPreview(file)} onDelete={() => setDeleteTarget(file)} />
          ))}
        </div>
      )}

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete file?</h2>
            <p className="text-sm text-gray-600 mb-6"><strong>{deleteTarget.originalFilename ?? 'This file'}</strong> will be permanently removed.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
              <button type="button" onClick={() => void handleDelete(deleteTarget)} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
