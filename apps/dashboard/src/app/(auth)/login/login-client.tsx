'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { api, ApiClientError, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password required'),
  rememberMe: z.boolean().default(false),
});

const twoFaSchema = z.object({
  code: z.string().length(6, 'Must be 6 digits').regex(/^\d{6}$/, 'Digits only'),
});

type LoginForm = z.infer<typeof loginSchema>;
type TwoFaForm = z.infer<typeof twoFaSchema>;

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const reason = searchParams.get('reason');

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const twoFaForm = useForm<TwoFaForm>({
    resolver: zodResolver(twoFaSchema),
    defaultValues: { code: '' },
  });

  async function onLogin(data: LoginForm) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ requires2FA: boolean; tempToken?: string; accessToken?: string }>('/v1/auth/login', data, { skipAuth: true });
      if (result.requires2FA && result.tempToken) { setTempToken(result.tempToken); setRequires2FA(true); return; }
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        const meResult = await api.get('/v1/auth/me') as any;
        setAuth(meResult.user, meResult.tenant, result.accessToken);
        router.replace('/overview');
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    } finally { setIsLoading(false); }
  }

  async function on2FA(data: TwoFaForm) {
    if (!tempToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ accessToken: string }>('/v1/auth/login/2fa', { tempToken, code: data.code }, { skipAuth: true });
      setAccessToken(result.accessToken);
      router.replace('/overview');
    } catch (err) {
      if (err instanceof ApiClientError) { setError(err.message); twoFaForm.reset(); }
      else setError('Something went wrong. Please try again.');
    } finally { setIsLoading(false); }
  }

  if (requires2FA) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Two-factor authentication</h1>
        <p className="text-gray-600 mb-6 text-sm">Enter the 6-digit code from your authenticator app.</p>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        <form onSubmit={twoFaForm.handleSubmit(on2FA)} className="space-y-4">
          <div>
            <input {...twoFaForm.register('code')} type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} className="w-full px-4 py-3 text-center text-2xl tracking-widest font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" autoFocus />
            {twoFaForm.formState.errors.code && <p className="mt-1 text-sm text-red-600">{twoFaForm.formState.errors.code.message}</p>}
          </div>
          <button type="submit" disabled={isLoading} className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify Code
          </button>
        </form>
        <div className="mt-4 text-center">
          <button type="button" onClick={() => { setRequires2FA(false); setError(null); }} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back to login</button>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 text-center">
          <Link href="/login?use=backup" className="text-sm text-primary hover:underline">Use a backup code instead</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
      <p className="text-gray-600 mb-6 text-sm">Sign in to your account to continue.</p>
      {reason === 'session_expired' && <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">Your session expired. Please sign in again.</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input {...loginForm.register('email')} id="email" type="email" autoComplete="email" placeholder="you@example.com" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400" />
          {loginForm.formState.errors.email && <p className="mt-1 text-sm text-red-600">{loginForm.formState.errors.email.message}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <input {...loginForm.register('password')} id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {loginForm.formState.errors.password && <p className="mt-1 text-sm text-red-600">{loginForm.formState.errors.password.message}</p>}
        </div>
        <div className="flex items-center gap-2">
          <input {...loginForm.register('rememberMe')} id="rememberMe" type="checkbox" className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary/30" />
          <label htmlFor="rememberMe" className="text-sm text-gray-600">Keep me signed in for 90 days</label>
        </div>
        <button type="submit" disabled={isLoading} className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <div className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary font-medium hover:underline">Start free trial</Link>
      </div>
    </div>
  );
}

export default function LoginClient() {
  return <Suspense><LoginPageInner /></Suspense>;
}
