'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { PublicUser, PublicTenant } from '@wsaas/types';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const twoFaSchema = z.object({
  code: z.string().min(6, 'Enter your 6-digit code').max(6),
});

type LoginForm = z.infer<typeof loginSchema>;
type TwoFaForm = z.infer<typeof twoFaSchema>;

interface LoginResponse {
  data: {
    accessToken: string;
    user: PublicUser;
    tenant: PublicTenant;
    twoFactorRequired?: boolean;
  };
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/overview';
  const { setAuth } = useAuthStore();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFaRequired, setTwoFaRequired] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const twoFaForm = useForm<TwoFaForm>({
    resolver: zodResolver(twoFaSchema),
    defaultValues: { code: '' },
  });

  async function onLoginSubmit(data: LoginForm) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<LoginResponse>('/v1/auth/login', data, { skipAuth: true });
      if (res.data.twoFactorRequired) {
        setPendingEmail(data.email);
        setPendingPassword(data.password);
        setTwoFaRequired(true);
      } else {
        setAuth(res.data.user, res.data.tenant, res.data.accessToken);
        router.replace(redirectTo);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function onTwoFaSubmit(data: TwoFaForm) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<LoginResponse>(
        '/v1/auth/login/2fa',
        { email: pendingEmail, password: pendingPassword, code: data.code },
        { skipAuth: true },
      );
      setAuth(res.data.user, res.data.tenant, res.data.accessToken);
      router.replace(redirectTo);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Invalid code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (twoFaRequired) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Two-factor authentication</h1>
        <p className="text-gray-600 mb-6 text-sm">Enter the 6-digit code from your authenticator app.</p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}
        <form onSubmit={twoFaForm.handleSubmit(onTwoFaSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
              Authentication code
            </label>
            <input
              {...twoFaForm.register('code')}
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400 tracking-widest text-center text-xl"
              autoFocus
            />
            {twoFaForm.formState.errors.code && (
              <p className="mt-1 text-sm text-red-600">{twoFaForm.formState.errors.code.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Verifying...' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => { setTwoFaRequired(false); setError(null); }}
            className="w-full text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in to your account</h1>
      <p className="text-gray-600 mb-6 text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Create one free
        </Link>
      </p>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            {...loginForm.register('email')}
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400"
            autoFocus
          />
          {loginForm.formState.errors.email && (
            <p className="mt-1 text-sm text-red-600">{loginForm.formState.errors.email.message}</p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              {...loginForm.register('password')}
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {loginForm.formState.errors.password && (
            <p className="mt-1 text-sm text-red-600">{loginForm.formState.errors.password.message}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default function LoginClient() {
  return <Suspense><LoginPageInner /></Suspense>;
}
