'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface Plan {
  id: string;
  name: string;
  displayName: string;
  priceMonthlyUsdCents: number;
  priceYearlyUsdCents: number;
  maxInstances: number;
  maxMessagesPerMonth: number | null;
  maxTeamMembers: number;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
}

interface Tenant {
  id: string;
  name: string;
  email: string;
  companyName: string;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  trialEndsAt: string | null;
  createdAt: string;
  plan: { id: string; name: string; displayName: string } | null;
  _count: { instances: number; messages: number; users: number };
  whatsappMode: 'UNOFFICIAL' | 'OFFICIAL' | null;
  modeLockedAt: string | null;
}

interface PlatformStats {
  totalTenants: number;
  tenantsByStatus: Record<string, number>;
  totalMessages: number;
  activeInstances: number;
  mrrCents: number;
  mrrUsd: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  ACTIVE:    { bg: 'bg-green-100',  text: 'text-green-700' },
  TRIAL:     { bg: 'bg-blue-100',   text: 'text-blue-700' },
  SUSPENDED: { bg: 'bg-red-100',    text: 'text-red-700' },
  CANCELLED: { bg: 'bg-gray-100',   text: 'text-gray-600' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function PlanModal({ plan, onClose, onSave }: { plan: Plan | null; onClose: () => void; onSave: () => void }) {
  const isNew = !plan;
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    displayName: plan?.displayName ?? '',
    priceMonthlyUsdCents: plan ? plan.priceMonthlyUsdCents / 100 : 0,
    priceYearlyUsdCents: plan ? plan.priceYearlyUsdCents / 100 : 0,
    maxInstances: plan?.maxInstances ?? 1,
    maxMessagesPerMonth: plan?.maxMessagesPerMonth ?? '',
    maxTeamMembers: plan?.maxTeamMembers ?? 1,
    isPublic: plan?.isPublic ?? true,
    isActive: plan?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const body = {
        ...form,
        priceMonthlyUsdCents: Math.round(Number(form.priceMonthlyUsdCents) * 100),
        priceYearlyUsdCents: Math.round(Number(form.priceYearlyUsdCents) * 100),
        maxInstances: Number(form.maxInstances),
        maxMessagesPerMonth: form.maxMessagesPerMonth === '' ? null : Number(form.maxMessagesPerMonth),
        maxTeamMembers: Number(form.maxTeamMembers),
        features: {},
        maxApiCallsPerMinute: 60,
        messageRetentionDays: 30,
        maxWebhookPerInstance: 5,
        storageGb: 5,
      };
      if (isNew) { await api.post('/v1/admin/plans', body); }
      else { await api.patch(`/v1/admin/plans/${plan!.id}`, body); }
      onSave(); onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save plan');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isNew ? 'Create Plan' : 'Edit Plan'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Plan Name (slug)</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={!isNew} placeholder="starter" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
              <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Starter" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Price (USD)</label>
              <input type="number" value={form.priceMonthlyUsdCents} onChange={e => setForm(f => ({ ...f, priceMonthlyUsdCents: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Yearly Price (USD)</label>
              <input type="number" value={form.priceYearlyUsdCents} onChange={e => setForm(f => ({ ...f, priceYearlyUsdCents: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Instances</label>
              <input type="number" value={form.maxInstances} onChange={e => setForm(f => ({ ...f, maxInstances: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Msgs/Month</label>
              <input type="number" value={form.maxMessagesPerMonth} onChange={e => setForm(f => ({ ...f, maxMessagesPerMonth: e.target.value }))} placeholder="unlimited" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Team</label>
              <input type="number" value={form.maxTeamMembers} onChange={e => setForm(f => ({ ...f, maxTeamMembers: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /> Visible to public
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /> Active
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={() => void handleSave()} disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
            {saving ? 'Saving...' : isNew ? 'Create Plan' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TenantDrawer({ tenantId, onClose, onStatusChange }: { tenantId: string; onClose: () => void; onStatusChange: () => void }) {
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    api.get(`/v1/admin/tenants/${tenantId}`)
      .then((r: any) => setTenant(r.data ?? r))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function changeStatus(status: string) {
    setUpdating(true);
    setStatusError('');
    try {
      await api.patch(`/v1/admin/tenants/${tenantId}`, { status });
      onStatusChange(); onClose();
    } catch (err) {
      setStatusError(err instanceof ApiClientError ? err.message : 'Failed to update status');
    } finally { setUpdating(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center sm:justify-end z-50">
      <div className="bg-white w-full sm:w-[480px] h-full sm:h-full sm:rounded-l-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Tenant Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />)}</div>
          ) : !tenant ? (
            <p className="text-gray-500">Failed to load tenant</p>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Account Info</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Company</span><span className="font-medium text-gray-900">{tenant.companyName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="font-medium text-gray-900">{tenant.email}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Status</span><StatusBadge status={tenant.status} /></div>
                  <div className="flex justify-between"><span className="text-gray-500">Plan</span><span className="font-medium text-gray-900">{tenant.plan?.displayName ?? 'None'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Joined</span><span className="font-medium text-gray-900">{new Date(tenant.createdAt).toLocaleDateString()}</span></div>
                  {tenant.trialEndsAt && <div className="flex justify-between"><span className="text-gray-500">Trial ends</span><span className="font-medium text-gray-900">{new Date(tenant.trialEndsAt).toLocaleDateString()}</span></div>}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Usage</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[{ label: 'Instances', value: tenant._count?.instances ?? 0 }, { label: 'Messages', value: tenant._count?.messages ?? 0 }, { label: 'Users', value: tenant._count?.users ?? 0 }].map(s => (
                    <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-gray-900">{s.value.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {tenant.users?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Team Members</h3>
                  <div className="space-y-2">
                    {tenant.users.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div><p className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</p><p className="text-xs text-gray-500">{u.email}</p></div>
                        <span className="text-xs text-gray-400 uppercase">{u.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Actions</h3>
                {statusError && (
                  <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                    <p className="text-xs text-red-700">{statusError}</p>
                    <button onClick={() => setStatusError('')} className="text-red-500 hover:text-red-700 text-xs font-semibold">Dismiss</button>
                  </div>
                )}
                <div className="space-y-2">
                  {tenant.status !== 'ACTIVE' && <button onClick={() => void changeStatus('ACTIVE')} disabled={updating} className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">Activate Account</button>}
                  {tenant.status !== 'SUSPENDED' && <button onClick={() => void changeStatus('SUSPENDED')} disabled={updating} className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">Suspend Account</button>}
                  {tenant.status !== 'TRIAL' && <button onClick={() => void changeStatus('TRIAL')} disabled={updating} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">Move to Trial</button>}
                  {tenant.status !== 'CANCELLED' && <button onClick={() => void changeStatus('CANCELLED')} disabled={updating} className="w-full py-2.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg">Cancel Account</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Tab = 'tenants' | 'plans' | 'stats';

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const isSuperAdmin = (user as any)?.isSuperAdmin;

  const [tab, setTab] = useState<Tab>('tenants');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [planModal, setPlanModal] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });

  useEffect(() => { if (!isSuperAdmin) router.replace('/overview'); }, [isSuperAdmin, router]);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get<{ data: Tenant[]; total: number }>(`/v1/admin/tenants?${params}`);
      setTenants((res as any).data ?? []);
      setTotal((res as any).total ?? 0);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [search, statusFilter]);

  const loadPlans = useCallback(async () => {
    try {
      const res = await api.get<{ data: Plan[] }>('/v1/admin/plans');
      setPlans((res as any).data ?? []);
    } catch (err) { console.error(err); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<{ data: PlatformStats }>('/v1/admin/stats');
      setStats((res as any).data ?? res);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void loadStats(); void loadTenants(); void loadPlans();
  }, [isSuperAdmin, loadStats, loadTenants, loadPlans]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void loadTenants();
  }, [search, statusFilter, loadTenants, isSuperAdmin]);

  if (!isSuperAdmin) return null;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all tenants, plans and platform settings</p>
        </div>
        <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full uppercase tracking-wide">Admin Only</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard label="Total Tenants" value={stats.totalTenants} />
          <StatCard label="Active" value={stats.tenantsByStatus['ACTIVE'] ?? 0} sub="paying customers" />
          <StatCard label="Trial" value={stats.tenantsByStatus['TRIAL'] ?? 0} sub="in trial period" />
          <StatCard label="Active Instances" value={stats.activeInstances} sub="connected right now" />
          <StatCard label="MRR" value={`$${stats.mrrUsd}`} sub="monthly recurring" />
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {(['tenants', 'plans', 'stats'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'tenants' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or company..." className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIAL">Trial</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <span className="text-sm text-gray-500 flex items-center">{total} tenants</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading tenants...</div>
          ) : tenants.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No tenants found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Mode</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Instances</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Messages</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{t.companyName || t.name}</td>
                      <td className="px-6 py-4 text-gray-600">{t.email}</td>
                      <td className="px-6 py-4 text-gray-600">{t.plan?.displayName ?? <span className="text-gray-400 italic">None</span>}</td>
                      <td className="px-6 py-4"><StatusBadge status={t.status} /></td>
                      <td className="px-6 py-4">
                        {t.whatsappMode ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                            {t.whatsappMode}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">(not set)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-700">{t._count.instances}</td>
                      <td className="px-6 py-4 text-center text-gray-700">{t._count.messages.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4"><button onClick={() => setSelectedTenantId(t.id)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Manage →</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'plans' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setPlanModal({ open: true, plan: null })} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg">+ Create Plan</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map(plan => (
              <div key={plan.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div><h3 className="font-bold text-gray-900">{plan.displayName}</h3><p className="text-xs text-gray-400">{plan.name}</p></div>
                  <div className="flex gap-1">
                    {!plan.isActive && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">Inactive</span>}
                    {!plan.isPublic && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Hidden</span>}
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">${(plan.priceMonthlyUsdCents / 100).toFixed(0)}<span className="text-sm font-normal text-gray-500">/mo</span></div>
                <div className="text-xs text-gray-400 mb-4">${(plan.priceYearlyUsdCents / 100).toFixed(0)}/yr</div>
                <div className="space-y-1 text-xs text-gray-600 mb-4">
                  <div className="flex justify-between"><span>Max Instances</span><span className="font-medium">{plan.maxInstances}</span></div>
                  <div className="flex justify-between"><span>Messages/month</span><span className="font-medium">{plan.maxMessagesPerMonth?.toLocaleString() ?? 'Unlimited'}</span></div>
                  <div className="flex justify-between"><span>Team Members</span><span className="font-medium">{plan.maxTeamMembers}</span></div>
                </div>
                <button onClick={() => setPlanModal({ open: true, plan })} className="w-full py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg">Edit Plan</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'stats' && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Tenants by Status</h3>
            <div className="space-y-3">
              {Object.entries(stats.tenantsByStatus).map(([status, count]) => {
                const pct = stats.totalTenants > 0 ? (count / stats.totalTenants) * 100 : 0;
                const s = STATUS_STYLES[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold w-24 text-center ${s.bg} ${s.text}`}>{status}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                    <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Platform Overview</h3>
            <div className="space-y-4">
              {[
                { label: 'Total Tenants', value: stats.totalTenants },
                { label: 'Total Messages', value: stats.totalMessages.toLocaleString() },
                { label: 'Active Instances', value: stats.activeInstances },
                { label: 'Monthly Recurring Revenue', value: `$${stats.mrrUsd}` },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className="text-sm font-bold text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedTenantId && <TenantDrawer tenantId={selectedTenantId} onClose={() => setSelectedTenantId(null)} onStatusChange={() => void loadTenants()} />}
      {planModal.open && <PlanModal plan={planModal.plan} onClose={() => setPlanModal({ open: false, plan: null })} onSave={() => void loadPlans()} />}
    </div>
  );
}
