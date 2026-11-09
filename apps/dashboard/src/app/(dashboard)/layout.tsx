'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAuthStore } from '@/store/authStore';
import { WalletBadge } from '@/components/billing/WalletBadge';

/**
 * Dashboard layout — protects all /dashboard/* routes.
 * If not authenticated, redirects to login.
 * Shows loading spinner during the initial auth check.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, tenant } = useAuthStore();

  const needsOnboarding = isAuthenticated && !tenant?.whatsappMode;
  const onOnboardingPage = pathname === '/onboarding';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
      return;
    }
    // Tenant hasn't picked Unofficial vs Official WhatsApp yet — force them
    // through the mode-select screen before anything else (including
    // creating an instance) is reachable.
    if (!isLoading && isAuthenticated && needsOnboarding && !onOnboardingPage) {
      router.replace('/onboarding');
    }
  }, [isAuthenticated, isLoading, needsOnboarding, onOnboardingPage, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  if (needsOnboarding && !onOnboardingPage) {
    return null; // Will redirect to /onboarding
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar — built in Phase 6 with full navigation */}
      <aside className="w-64 bg-white border-r border-gray-200 flex-shrink-0">
        <DashboardSidebar />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── Sidebar (placeholder — full nav built in Phase 6) ──────────────────────

function DashboardSidebar() {
  const { tenant, user } = useAuthStore();
  const isSuperAdmin = (user as any)?.isSuperAdmin;
  const pathname = usePathname();

  return (
    <div className="h-full flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 truncate">
            {tenant?.companyName ?? process.env['NEXT_PUBLIC_APP_NAME'] ?? 'Dashboard'}
          </span>
        </div>
      </div>

      {/* Nav items — placeholder until Phase 6 full nav */}
      <nav className="flex-1 p-4 space-y-1">
        {[
          { label: 'Overview', href: '/overview', icon: '◉' },
          { label: 'Instances', href: '/instances', icon: '⬡' },
          { label: 'Messages', href: '/messages', icon: '💬' },
          { label: 'Templates', href: '/templates', icon: '📋' },
          { label: 'Webhooks', href: '/webhooks', icon: '🔗' },
          { label: 'API Keys', href: '/api-keys', icon: '⚷' },
          { label: 'Media', href: '/media', icon: '📎' },
          { label: 'Usage', href: '/usage', icon: '◑' },
          { label: 'Wallet', href: '/wallet', icon: '💳' },
          { label: 'Billing', href: '/billing', icon: '◈' },
          { label: 'Team', href: '/team', icon: '◎' },
          { label: 'Settings', href: '/settings', icon: '⚙' },
          ...(isSuperAdmin ? [{ label: 'Admin', href: '/admin', icon: '🛡️' }] : []),
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === item.href
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Docs link */}
      <div className="p-4 border-t border-gray-100">
        <a
          href={process.env['NEXT_PUBLIC_DOCS_URL'] ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <span>↗</span>
          Documentation
        </a>
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function DashboardHeader() {
  const { user, clearAuth } = useAuthStore();
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch(
        `${process.env['NEXT_PUBLIC_API_URL'] ?? ''}/v1/auth/logout`,
        { method: 'POST', credentials: 'include' },
      );
    } finally {
      clearAuth();
      router.replace('/login');
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div>{/* Breadcrumbs go here in Phase 6 */}</div>

      <div className="flex items-center gap-4">
        <WalletBadge />

        {/* Notification bell — Phase 7 */}

        {/* User menu */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-gray-900">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-xs text-gray-500">{user?.email}</div>
          </div>
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white text-sm font-semibold">
            {user?.firstName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
