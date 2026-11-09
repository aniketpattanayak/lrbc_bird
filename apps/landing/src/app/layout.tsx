import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const APP_NAME = process.env['NEXT_PUBLIC_APP_NAME'] ?? 'WhatsPlatform';
const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://yourdomain.com';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${APP_NAME} — WhatsApp API for Developers`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Connect your WhatsApp number to a powerful REST API. Send messages, receive webhooks, automate workflows. No approval needed.',
  keywords: [
    'WhatsApp API',
    'WhatsApp automation',
    'WhatsApp Business API',
    'messaging API',
    'WhatsApp webhook',
    'WhatsApp chatbot',
  ],
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: `${APP_NAME} — WhatsApp API for Developers`,
    description: 'Connect your WhatsApp number to a powerful REST API.',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — WhatsApp API for Developers`,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
