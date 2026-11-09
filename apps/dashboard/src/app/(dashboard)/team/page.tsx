'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type Role = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

interface Member {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: Role;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
  invitedBy: { firstName: string; lastName: string; email: string };
}

const ROLE_STYLES: Record<Role, string> = {
  OWNER: 'bg-purple-100 text-purple-800',
  ADMIN: 'bg-indigo-100 text-indigo-800',
  DEVELOPER: 'bg-blue-100 text-blue-800',
  VIEWER: 'bg-gray-100 text-gray-600',
};

function RoleBadge({ role }: { role: Role }) {
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${ROLE_STYLES[role]}`}>{role}</span>;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt={name} className="w-9 h-9 rounded-full object-cover" />;
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold">{initials}</div>;
}

function InviteModal({ onCreated, onCancel }: { onCreated: (invite: Invite) => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('DEVELOPER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required'); return; }
    setLoading(true);
    setError('');
    try {
      const invite = await api.post<Invite>('/v1/team/invites', { email: email.trim(), role });
      onCreated(invite);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to send invite.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Invite team member</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="ADMIN">Admin</option>
              <option value="DEVELOPER">Developer</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">{loading ? 'Sending…' : 'Send invite'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [actionError, setActionError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, i] = await Promise.all([
        api.get<Member[]>('/v1/team/members'),
        api.get<Invite[]>('/v1/team/invites'),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ownerCount = members.filter((m) => m.role === 'OWNER').length;

  async function handleRoleChange(member: Member, role: Role) {
    setActionError('');
    try {
      const updated = await api.patch<Member>(`/v1/team/members/${member.id}`, { role });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to update role.');
    }
  }

  async function handleRemove(member: Member) {
    setActionError('');
    try {
      await api.delete(`/v1/team/members/${member.id}`);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to remove member.');
    } finally {
      setRemoveTarget(null);
    }
  }

  async function handleCancelInvite(invite: Invite) {
    setActionError('');
    try {
      await api.delete(`/v1/team/invites/${invite.id}`);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to cancel invite.');
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
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-600 mt-0.5">Manage who has access to your workspace.</p>
        </div>
        <button type="button" onClick={() => setShowInvite(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">+ Invite member</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading team…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-red-600 underline">Try again</button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Members ({members.length})</h3></div>
            <div className="divide-y divide-gray-100">
              {members.map((member) => {
                const isSelf = member.id === currentUser?.id;
                const isLastOwner = member.role === 'OWNER' && ownerCount <= 1;
                return (
                  <div key={member.id} className="flex items-center gap-4 px-6 py-3">
                    <Avatar name={`${member.firstName} ${member.lastName}`} url={member.avatarUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{member.firstName} {member.lastName} {isSelf && <span className="text-xs text-gray-400">(you)</span>}</p>
                      <p className="text-sm text-gray-500 truncate">{member.email}</p>
                    </div>
                    <select
                      value={member.role}
                      disabled={isSelf || isLastOwner}
                      onChange={(e) => void handleRoleChange(member, e.target.value as Role)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 disabled:opacity-50 disabled:bg-gray-50"
                    >
                      <option value="OWNER">Owner</option>
                      <option value="ADMIN">Admin</option>
                      <option value="DEVELOPER">Developer</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <p className="text-xs text-gray-400 w-24 text-right">Joined {new Date(member.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
                    <button
                      type="button"
                      disabled={isSelf || isLastOwner}
                      onClick={() => setRemoveTarget(member)}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isSelf ? 'You cannot remove yourself' : isLastOwner ? 'Cannot remove the last owner' : 'Remove'}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Pending invites ({invites.length})</h3></div>
            {invites.length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-6 text-center">No pending invites.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-4 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{invite.email}</p>
                      <p className="text-xs text-gray-400">Invited by {invite.invitedBy.firstName} {invite.invitedBy.lastName} · expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <button type="button" onClick={() => void handleCancelInvite(invite)} className="text-xs text-gray-500 hover:text-red-600">Cancel</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showInvite && (
        <InviteModal onCancel={() => setShowInvite(false)} onCreated={(invite) => { setShowInvite(false); setInvites((prev) => [invite, ...prev]); }} />
      )}

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRemoveTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Remove team member?</h2>
            <p className="text-sm text-gray-600 mb-6"><strong>{removeTarget.firstName} {removeTarget.lastName}</strong> will lose access to this workspace.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setRemoveTarget(null)} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
              <button type="button" onClick={() => void handleRemove(removeTarget)} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
