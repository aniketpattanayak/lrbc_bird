'use client';

import { useState, useEffect, useRef } from 'react';
import { api, ApiClientError, getAccessToken } from '@/lib/api';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

interface PublicUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  twoFactorEnabled: boolean;
}

interface TenantProfile {
  id: string;
  name: string;
  companyName: string | null;
  timezone: string;
  logoUrl: string | null;
  whatsappMode: 'UNOFFICIAL' | 'OFFICIAL' | null;
  modeLockedAt: string | null;
}

interface NotificationPrefs {
  emailOnMessageFailed: boolean;
  emailOnWeeklyDigest: boolean;
  emailOnBillingIssue: boolean;
  emailOnTeamActivity: boolean;
  emailOnWebhookFailure: boolean;
}

const TABS = ['Profile', 'Security', 'Company', 'Notifications', 'Danger zone'] as const;
type Tab = (typeof TABS)[number];

const TIMEZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];

function SaveBanner({ message, error }: { message: string; error?: boolean }) {
  if (!message) return null;
  return <p className={`text-sm mb-3 ${error ? 'text-red-600' : 'text-green-600'}`}>{message}</p>;
}

function useUploadToUrl() {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File): Promise<string> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/v1/media/upload`);
        const token = getAccessToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const parsed = JSON.parse(xhr.responseText) as { data?: { storageUrl?: string } };
              resolve(parsed.data?.storageUrl ?? '');
            } catch {
              reject(new Error('Upload failed'));
            }
          } else {
            reject(new Error(xhr.responseText || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
      });
      return url;
    } finally {
      setUploading(false);
    }
  }
  return { upload, uploading };
}

function ProfileTab({ user, onUpdated }: { user: PublicUser; onUpdated: (u: PublicUser) => void }) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useUploadToUrl();

  async function handleAvatarChange(file: File) {
    try {
      const storageUrl = await upload(file);
      const result = await api.patch<{ user: PublicUser }>('/v1/auth/profile', { avatarUrl: storageUrl });
      onUpdated(result.user);
      setMessage('Avatar updated.');
      setError(false);
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Failed to upload avatar.');
      setError(true);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const result = await api.patch<{ user: PublicUser }>('/v1/auth/profile', { firstName, lastName });
      onUpdated(result.user);
      setMessage('Profile saved.');
      setError(false);
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Failed to save profile.');
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <SaveBanner message={message} error={error} />
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold">
              {user.firstName[0]}{user.lastName[0]}
            </div>
          )}
          {uploading && <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center text-white text-xs">…</div>}
        </div>
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Change avatar
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarChange(f); e.target.value = ''; }} />
        </div>
      </div>
      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input value={user.email} disabled className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500" />
        </div>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

function SecurityTab({ user, onUpdated }: { user: PublicUser; onUpdated: (u: PublicUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState(false);

  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string; backupCodes: string[] } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [twoFaMessage, setTwoFaMessage] = useState('');
  const [twoFaError, setTwoFaError] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwSaving(true);
    setPwMessage('');
    try {
      await api.post('/v1/auth/change-password', { currentPassword, newPassword, confirmPassword });
      setPwMessage('Password changed. You will need to sign in again next time.');
      setPwError(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMessage(err instanceof ApiClientError ? err.message : 'Failed to change password.');
      setPwError(true);
    } finally {
      setPwSaving(false);
    }
  }

  async function startSetup() {
    setTwoFaBusy(true);
    setTwoFaMessage('');
    try {
      const data = await api.post<{ qrCodeUrl: string; secret: string; backupCodes: string[] }>('/v1/auth/2fa/setup');
      setSetupData(data);
    } catch (err) {
      setTwoFaMessage(err instanceof ApiClientError ? err.message : 'Failed to start 2FA setup.');
      setTwoFaError(true);
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setTwoFaBusy(true);
    setTwoFaMessage('');
    try {
      await api.post('/v1/auth/2fa/verify-setup', { code: totpCode });
      setSetupData(null);
      setTotpCode('');
      onUpdated({ ...user, twoFactorEnabled: true });
      setTwoFaMessage('Two-factor authentication enabled.');
      setTwoFaError(false);
    } catch (err) {
      setTwoFaMessage(err instanceof ApiClientError ? err.message : 'Invalid code.');
      setTwoFaError(true);
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function disable2fa(e: React.FormEvent) {
    e.preventDefault();
    setTwoFaBusy(true);
    setTwoFaMessage('');
    try {
      await api.post('/v1/auth/2fa/disable', { password: disablePassword });
      onUpdated({ ...user, twoFactorEnabled: false });
      setDisablePassword('');
      setTwoFaMessage('Two-factor authentication disabled.');
      setTwoFaError(false);
    } catch (err) {
      setTwoFaMessage(err instanceof ApiClientError ? err.message : 'Failed to disable 2FA.');
      setTwoFaError(true);
    } finally {
      setTwoFaBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Change password</h3>
        <SaveBanner message={pwMessage} error={pwError} />
        <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={pwSaving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">
            {pwSaving ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>

      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Two-factor authentication</h3>
        <SaveBanner message={twoFaMessage} error={twoFaError} />
        {user.twoFactorEnabled ? (
          <form onSubmit={(e) => void disable2fa(e)} className="space-y-3">
            <p className="text-sm text-gray-600">2FA is currently <span className="font-medium text-green-700">enabled</span> on your account.</p>
            <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Confirm your password to disable" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button type="submit" disabled={twoFaBusy} className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60">Disable 2FA</button>
          </form>
        ) : setupData ? (
          <form onSubmit={(e) => void confirmSetup(e)} className="space-y-3">
            <p className="text-sm text-gray-600">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setupData.qrCodeUrl} alt="2FA QR code" className="w-40 h-40 border border-gray-200 rounded-lg" />
            <p className="text-xs text-gray-500">Manual entry key: <code className="bg-gray-100 px-1 rounded">{setupData.secret}</code></p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <p className="font-medium mb-1">Backup codes (save these somewhere safe):</p>
              <div className="grid grid-cols-2 gap-1 font-mono">{setupData.backupCodes.map((c) => <span key={c}>{c}</span>)}</div>
            </div>
            <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="6-digit code" maxLength={6} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="submit" disabled={twoFaBusy} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">Confirm & enable</button>
              <button type="button" onClick={() => setSetupData(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            </div>
          </form>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-3">2FA is currently <span className="font-medium text-gray-700">disabled</span>.</p>
            <button type="button" onClick={() => void startSetup()} disabled={twoFaBusy} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">Set up 2FA</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompanyTab({ tenant, onUpdated }: { tenant: TenantProfile; onUpdated: (t: TenantProfile) => void }) {
  const [name, setName] = useState(tenant.name);
  const [companyName, setCompanyName] = useState(tenant.companyName ?? '');
  const [timezone, setTimezone] = useState(tenant.timezone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useUploadToUrl();

  async function handleLogoChange(file: File) {
    try {
      const logoUrl = await upload(file);
      const updated = await api.patch<TenantProfile>('/v1/tenant', { logoUrl });
      onUpdated(updated);
      setMessage('Logo updated.');
      setError(false);
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Failed to upload logo.');
      setError(true);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const updated = await api.patch<TenantProfile>('/v1/tenant', { name, companyName: companyName || null, timezone });
      onUpdated(updated);
      setMessage('Company settings saved.');
      setError(false);
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Failed to save.');
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <SaveBanner message={message} error={error} />
      <div className="flex items-center gap-4 mb-6">
        {tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logoUrl} alt="Logo" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">No logo</div>
        )}
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            {uploading ? 'Uploading…' : 'Change logo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoChange(f); e.target.value = ''; }} />
        </div>
      </div>
      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Workspace name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Company name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Timezone</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">WhatsApp Mode</label>
          {tenant.whatsappMode ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                <span>{tenant.whatsappMode === 'UNOFFICIAL' ? '📱 Unofficial API' : '🏢 Official API'}</span>
                <span className="text-gray-400">🔒</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Your account type was locked{tenant.modeLockedAt ? ` on ${new Date(tenant.modeLockedAt).toLocaleDateString()}` : ''}. Contact support to discuss migration options.
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-500">Not chosen yet — you&apos;ll be asked to pick one before creating your first instance.</p>
          )}
        </div>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

const NOTIFICATION_LABELS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'emailOnMessageFailed', label: 'Failed messages', description: 'Get notified when an outbound message fails to send.' },
  { key: 'emailOnWeeklyDigest', label: 'Weekly digest', description: 'A weekly summary of your account activity.' },
  { key: 'emailOnBillingIssue', label: 'Billing issues', description: 'Payment failures or subscription changes.' },
  { key: 'emailOnTeamActivity', label: 'Team activity', description: 'New members joining or roles changing.' },
  { key: 'emailOnWebhookFailure', label: 'Webhook failures', description: 'When a webhook endpoint repeatedly fails to deliver.' },
];

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<NotificationPrefs>('/v1/tenant/notifications')
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : 'Failed to load preferences.'))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: keyof NotificationPrefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setMessage('');
    try {
      await api.patch('/v1/tenant/notifications', { [key]: next[key] });
      setMessage('Preferences saved.');
    } catch (err) {
      setPrefs(prefs);
      setMessage(err instanceof ApiClientError ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error || !prefs) return <p className="text-sm text-red-600">{error || 'Failed to load.'}</p>;

  return (
    <div className="max-w-lg">
      {message && <p className={`text-sm mb-3 ${saving ? 'text-gray-400' : 'text-green-600'}`}>{message}</p>}
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
        {NOTIFICATION_LABELS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-500">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggle(key)}
              className={`w-10 h-6 rounded-full transition-colors relative ${prefs[key] ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${prefs[key] ? 'translate-x-4' : ''}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DangerZoneTab() {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (confirmText !== 'DELETE') { setMessage('Type DELETE to confirm.'); return; }
    setBusy(true);
    setMessage('');
    try {
      await api.delete('/v1/auth/me', { body: JSON.stringify({ password }) });
      window.location.href = '/login?reason=account_deleted';
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Failed to delete account.');
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-red-50 border border-red-200 rounded-xl p-5">
        <h3 className="font-semibold text-red-800 mb-1">Delete your account</h3>
        <p className="text-sm text-red-700 mb-4">
          This permanently deletes your user account and signs you out everywhere. If you are the sole owner of a team with other members, transfer ownership or remove the rest of the team first.
        </p>
        {message && <p className="text-sm text-red-800 font-medium mb-3">{message}</p>}
        <form onSubmit={(e) => void handleDelete(e)} className="space-y-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm" />
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type "DELETE" to confirm' className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={busy} className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60">
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Profile');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ user: PublicUser }>('/v1/auth/me'),
      api.get<TenantProfile>('/v1/tenant'),
    ])
      .then(([me, tenantData]) => { setUser(me.user); setTenant(tenantData); })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : 'Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading settings…</p>
        </div>
      ) : error || !user || !tenant ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error || 'Failed to load settings.'}</p>
        </div>
      ) : (
        <div className="flex gap-8">
          <nav className="w-44 shrink-0">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-1 ${
                  tab === t ? 'bg-indigo-50 text-indigo-700' : t === 'Danger zone' ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
          <div className="flex-1">
            {tab === 'Profile' && <ProfileTab user={user} onUpdated={setUser} />}
            {tab === 'Security' && <SecurityTab user={user} onUpdated={setUser} />}
            {tab === 'Company' && <CompanyTab tenant={tenant} onUpdated={setTenant} />}
            {tab === 'Notifications' && <NotificationsTab />}
            {tab === 'Danger zone' && <DangerZoneTab />}
          </div>
        </div>
      )}
    </div>
  );
}
