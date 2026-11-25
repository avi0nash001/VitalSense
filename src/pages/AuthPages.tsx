import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Activity, ArrowRight, HeartHandshake, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['member', 'caregiver']),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export function LoginPage() {
  const { login, loginDemo } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<'member' | 'caregiver' | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const user = await login(values.email, values.password);
      pushToast({ title: `Welcome back, ${user.name}`, variant: 'success' });
      navigate(user.role === 'caregiver' ? '/caregiver' : '/app/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Unable to sign in.');
    }
  };

  const handleDemoLogin = async (role: 'member' | 'caregiver') => {
    setServerError(null);
    setDemoLoading(role);
    try {
      const user = await loginDemo(role);
      pushToast({
        title: `Signed in as ${user.name}`,
        description:
          role === 'caregiver'
            ? 'Viewing authorized caregiver workspace.'
            : 'Viewing personal biometric monitoring workspace.',
        variant: 'info',
      });
      navigate(role === 'caregiver' ? '/caregiver' : '/app/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--vs-bg)] text-[var(--vs-text)] flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[var(--vs-text)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)]">
              <Activity className="h-4 w-4" />
            </span>
            VITALSENSE
          </Link>
          <Link to="/signup" className="text-sm font-medium text-[var(--vs-accent)] hover:underline">
            Create an account
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Standard Credential Form */}
          <div className="lg:col-span-7 vs-surface-card p-6 sm:p-8">
            <h1 className="font-display text-2xl font-bold text-[var(--vs-text)]">
              Sign in to VITALSENSE
            </h1>
            <p className="mt-1.5 text-sm text-[var(--vs-text-secondary)]">
              Access your personal health baseline, change timeline, and caregiver coordination.
            </p>

            {serverError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-[var(--vs-danger)]/40 bg-[var(--vs-danger-soft)] px-3.5 py-2.5 text-sm text-[var(--vs-text)]"
              >
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-[var(--vs-text-secondary)]"
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  {...register('email')}
                  className="vs-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-[var(--vs-text-muted)]"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-[var(--vs-danger)]">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-[var(--vs-text-secondary)]"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password')}
                  className="vs-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-[var(--vs-text-muted)]"
                />
                {errors.password && (
                  <p className="mt-1 text-xs text-[var(--vs-danger)]">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="vs-btn-primary w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* Instant Demo Role Access */}
          <div className="lg:col-span-5 vs-surface-card p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--vs-accent)]">Interactive Workspace</p>
              <h2 className="mt-1.5 font-display text-lg font-semibold text-[var(--vs-text)]">
                Explore Demo Accounts
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--vs-text-secondary)]">
                Sign directly into the seeded 21-day longitudinal workspace as either the
                monitored member or an authorized family caregiver.
              </p>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => handleDemoLogin('member')}
                  disabled={demoLoading !== null}
                  className="w-full flex items-start gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-4 text-left hover:border-[var(--vs-accent)] hover:bg-[var(--vs-hover)] transition-colors disabled:opacity-60"
                >
                  <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--vs-accent)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--vs-text)]">
                      {demoLoading === 'member'
                        ? 'Opening Member Workspace...'
                        : 'Continue as Member (Elena Vance)'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--vs-text-secondary)]">
                      Full dashboard, baseline learning, Gemini insights, Data Lab, and consent controls.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoLogin('caregiver')}
                  disabled={demoLoading !== null}
                  className="w-full flex items-start gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] p-4 text-left hover:border-[var(--vs-accent)] hover:bg-[var(--vs-hover)] transition-colors disabled:opacity-60"
                >
                  <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-[var(--vs-accent)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--vs-text)]">
                      {demoLoading === 'caregiver'
                        ? 'Opening Caregiver Portal...'
                        : 'Continue as Caregiver (Sarah Vance)'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--vs-text-secondary)]">
                      Consent-filtered portal, alert acknowledgement, and follow-up tracking.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <p className="mt-6 border-t border-[var(--vs-border)] pt-4 text-xs text-[var(--vs-text-muted)]">
              All demo biometric trajectories are clearly labeled and separated from real
              CSV uploads.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignupPage() {
  const { register: registerAccount } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: new URLSearchParams(window.location.search).get('email') ?? '',
      password: '',
      role: 'member',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      const user = await registerAccount(values);
      pushToast({ title: 'Account created', variant: 'success' });
      navigate(user.role === 'caregiver' ? '/caregiver' : '/app/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Unable to register.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--vs-bg)] text-[var(--vs-text)] flex flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md vs-surface-card p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-base font-bold text-[var(--vs-text)]"
          >
            <Activity className="h-4 w-4 text-[var(--vs-accent)]" />
            VITALSENSE
          </Link>
          <Link to="/login" className="text-sm font-medium text-[var(--vs-accent)] hover:underline">
            Sign in instead
          </Link>
        </div>

        <h1 className="font-display text-2xl font-bold text-[var(--vs-text)]">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-[var(--vs-text-secondary)]">
          Join the longitudinal monitoring workspace as a member or authorized caregiver.
        </p>

        {serverError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[var(--vs-danger)]/40 bg-[var(--vs-danger-soft)] px-3.5 py-2.5 text-sm text-[var(--vs-text)]"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="signup-name" className="block text-sm font-medium text-[var(--vs-text-secondary)]">
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              placeholder="Jordan Patel"
              {...register('name')}
              className="vs-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-[var(--vs-text-muted)]"
            />
            {errors.name && <p className="mt-1 text-xs text-[var(--vs-danger)]">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium text-[var(--vs-text-secondary)]">
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              placeholder="jordan@example.com"
              {...register('email')}
              className="vs-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-[var(--vs-text-muted)]"
            />
            {errors.email && <p className="mt-1 text-xs text-[var(--vs-danger)]">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="signup-role" className="block text-sm font-medium text-[var(--vs-text-secondary)]">
              Workspace role
            </label>
            <select
              id="signup-role"
              {...register('role')}
              className="vs-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm"
            >
              <option value="member">Monitored Member</option>
              <option value="caregiver">Authorized Caregiver</option>
            </select>
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-[var(--vs-text-secondary)]">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              placeholder="Minimum 6 characters"
              {...register('password')}
              className="vs-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-[var(--vs-text-muted)]"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-[var(--vs-danger)]">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="vs-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
