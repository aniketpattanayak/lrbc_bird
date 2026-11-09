'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Check } from 'lucide-react';

import { api, ApiClientError } from '@/lib/api';

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name required').max(50),
    lastName: z.string().min(1, 'Last name required').max(50),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'One uppercase letter')
      .regex(/[a-z]/, 'One lowercase letter')
      .regex(/[0-9]/, 'One number'),
    companyName: z.string().max(100).optional(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms of Service' }),
    }),
  });

type RegisterForm = z.infer<typeof registerSchema>;

// Password strength indicator
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-1">
      {checks.map((check) => (
        <div key={check.label} className="flex items-center gap-1.5">
          <div
            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
              check.met ? 'bg-green-500' : 'bg-gray-200'
            }`}
          >
            {check.met && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
          </div>
          <span className={`text-xs ${check.met ? 'text-green-700' : 'text-gray-500'}`}>
            {check.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      companyName: '',
    },
  });

  const password = form.watch('password');

  async function onSubmit(data: RegisterForm) {
    setIsLoading(true);
    setError(null);

    try {
      await api.post('/v1/auth/register', data, { skipAuth: true });
      setSuccess(true);
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

  // Success state
  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-gray-600 mb-6">
          We sent a verification link to <strong>{form.getValues('email')}</strong>.
          Click the link to activate your account.
        </p>
        <p className="text-sm text-gray-500">
          Didn&apos;t receive it?{' '}
          <button
            type="button"
            onClick={() => void api.post(
              '/v1/auth/resend-verification',
              { email: form.getValues('email') },
              { skipAuth: true },
            )}
            className="text-primary hover:underline"
          >
            Resend verification email
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Start your free trial</h1>
      <p className="text-gray-600 mb-6 text-sm">
        7 days free, no credit card required.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
              First name
            </label>
            <input
              {...form.register('firstName')}
              id="firstName"
              type="text"
              autoComplete="given-name"
              placeholder="John"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400 text-sm"
            />
            {form.formState.errors.firstName && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.firstName.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
              Last name
            </label>
            <input
              {...form.register('lastName')}
              id="lastName"
              type="text"
              autoComplete="family-name"
              placeholder="Doe"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400 text-sm"
            />
            {form.formState.errors.lastName && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Work email
          </label>
          <input
            {...form.register('email')}
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400"
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.email.message}</p>
          )}
        </div>

        {/* Company (optional) */}
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
            Company name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            {...form.register('companyName')}
            id="companyName"
            type="text"
            autoComplete="organization"
            placeholder="Acme Inc."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400"
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              {...form.register('password')}
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-gray-900 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <PasswordStrength password={password} />
          {form.formState.errors.password && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.password.message}</p>
          )}
        </div>

        {/* Terms acceptance */}
        <div>
          <div className="flex items-start gap-2">
            <input
              {...form.register('acceptedTerms')}
              id="acceptedTerms"
              type="checkbox"
              className="mt-0.5 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary/30"
            />
            <label htmlFor="acceptedTerms" className="text-sm text-gray-600">
              I agree to the{' '}
              <Link href="/legal/terms" className="text-primary hover:underline" target="_blank">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy" className="text-primary hover:underline" target="_blank">
                Privacy Policy
              </Link>
              . I understand this is an unofficial WhatsApp integration.
            </label>
          </div>
          {form.formState.errors.acceptedTerms && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.acceptedTerms.message}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? 'Creating account...' : 'Start free trial'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
