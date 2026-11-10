'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

import { api, ApiClientError } from '@/lib/api';

type Status = 'verifying' | 'success' | 'error' | 'no_token';

function VerifyEmailPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'no_token');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;

    void (async () => {
      try {
        await api.post('/v1/auth/verify-email', { token }, { skipAuth: true });
        setStatus('success');
      } catch (err) {
        setStatus('error');
        if (err instanceof ApiClientError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Verification failed. The link may be invalid or expired.');
        }
      }
    })();
  }, [token]);

  async function handleResend() {
    if (!resendEmail) return;
    try {
      await api.post('/v1/auth/resend-verification', { email: resendEmail }, { skipAuth: true });
      setResendSent(true);
    } catch {
      // Always show success to prevent enumeration
      setResendSent(true);
    }
  }

  if (status === 'verifying') {
    return (
      <div className="text-center py-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Verifying your email...</h1>
        <p className="text-gray-600 text-sm">Just a moment.</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Email verified!</h1>
        <p className="text-gray-600 mb-6">
          Your account is ready. Sign in to start connecting your WhatsApp number.
        </p>
        <Link
          href="/login"
          className="inline-block w-full py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors text-center"
        >
          Sign in to your account
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center">
        <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification failed</h1>
        <p className="text-gray-600 mb-6 text-sm">{errorMessage}</p>

        {!resendSent ? (
          <div className="text-left">
            <p className="text-sm text-gray-700 mb-3 font-medium">
              Request a new verification email:
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => void handleResend()}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Resend
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            If an unverified account exists, a new link has been sent.
          </div>
        )}

        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  // no_token state — user navigated here directly
  return (
    <div className="text-center">
      <Mail className="w-14 h-14 text-primary mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h1>
      <p className="text-gray-600 mb-6 text-sm">
        We sent a verification link to your email address. Click the link to activate your account.
      </p>
      <p className="text-sm text-gray-500">
        Didn&apos;t receive the email? Check your spam folder or{' '}
        <Link href="/register" className="text-primary hover:underline">
          try registering again
        </Link>
        .
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><VerifyEmailPageInner /></Suspense>;
}
