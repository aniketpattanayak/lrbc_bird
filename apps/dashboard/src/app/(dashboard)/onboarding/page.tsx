'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type Mode = 'UNOFFICIAL' | 'OFFICIAL';

export default function OnboardingPage() {
  const router = useRouter();
  const { updateTenant } = useAuthStore();
  const [submitting, setSubmitting] = useState<Mode | null>(null);
  const [error, setError] = useState('');

  async function choose(mode: Mode) {
    setSubmitting(mode);
    setError('');
    try {
      const tenant = await api.put<{ whatsappMode: Mode; modeLockedAt: string }>('/v1/tenant/whatsapp-mode', { mode });
      updateTenant({
        whatsappMode: tenant.whatsappMode,
        modeLockedAt: tenant.modeLockedAt ? new Date(tenant.modeLockedAt) : null,
      });
      router.replace('/instances');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Choose how you&apos;ll connect WhatsApp</h1>
        <p className="text-sm text-gray-600 mt-2">Pick the connection type for this account. You&apos;ll use it for every instance you create.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
        <span className="text-amber-500 text-lg leading-none">⚠️</span>
        <p className="text-sm text-amber-800">
          <strong>This choice is permanent.</strong> Once you create your first WhatsApp instance, your account type is locked and cannot be changed.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col">
          <div className="text-3xl mb-2">📱</div>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Unofficial API</h2>
          <ul className="text-sm text-gray-600 space-y-2 mb-6 flex-1">
            <li>• Scan QR code to connect</li>
            <li>• Great for personal or small-scale use</li>
            <li>• Free, no Meta approval needed</li>
            <li>• Risk of number ban by WhatsApp</li>
          </ul>
          <button
            type="button"
            onClick={() => void choose('UNOFFICIAL')}
            disabled={submitting !== null}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {submitting === 'UNOFFICIAL' ? 'Setting up…' : 'Choose Unofficial'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col">
          <div className="text-3xl mb-2">🏢</div>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Official API</h2>
          <ul className="text-sm text-gray-600 space-y-2 mb-6 flex-1">
            <li>• Meta Business verified</li>
            <li>• Built for high message volume</li>
            <li>• Requires a Meta WhatsApp Business app</li>
            <li>• Stable and ToS compliant</li>
          </ul>
          <button
            type="button"
            onClick={() => void choose('OFFICIAL')}
            disabled={submitting !== null}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {submitting === 'OFFICIAL' ? 'Setting up…' : 'Choose Official'}
          </button>
        </div>
      </div>
    </div>
  );
}
