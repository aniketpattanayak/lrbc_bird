/**
 * Landing Page — Placeholder
 * Full landing page is built in Phase 10.
 * For now, shows a minimal "coming soon" that proves routing works.
 */

const APP_NAME = process.env['NEXT_PUBLIC_APP_NAME'] ?? 'WhatsPlatform';
const DASHBOARD_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        {/* Logo placeholder */}
        <div className="mb-8 inline-flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight">{APP_NAME}</span>
        </div>

        <h1 className="text-5xl font-bold tracking-tight mb-6 bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
          WhatsApp API for Developers
        </h1>

        <p className="text-xl text-gray-400 mb-10 leading-relaxed">
          Connect your WhatsApp number to a powerful REST API.
          Send messages, receive webhooks, automate workflows.
          No Meta approval needed.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={`${DASHBOARD_URL}/register`}
            className="px-8 py-4 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-xl transition-colors"
          >
            Start Free Trial
          </a>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
          >
            Sign In
          </a>
        </div>

        <p className="mt-8 text-sm text-gray-600">
          Full landing page coming in Phase 10.
          Platform is under active development.
        </p>
      </div>
    </main>
  );
}
