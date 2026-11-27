import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  BellRing,
  Clock,
  FlaskConical,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { RealtimeDeviationEvent } from '../../lib/types';
import { AvatarImage } from '../ui/Primitives';
import { ErrorBoundary } from '../ErrorBoundary';
import { VoiceAssistantDrawer } from '../voice/VoiceAssistantDrawer';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MEMBER_NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/voice', label: 'Voice Assistant', icon: Mic },
  { to: '/app/timeline', label: 'Health Timeline', icon: Clock },
  { to: '/app/baseline', label: 'Personal Baseline', icon: TrendingUp },
  { to: '/app/insights', label: 'AI Insights', icon: Sparkles },
  { to: '/app/caregiver-network', label: 'Caregiver Centre', icon: ShieldAlert },
  { to: '/app/smart-alerts', label: 'Smart Alerts', icon: SlidersHorizontal },
  { to: '/app/data-lab', label: 'Devices & Data', icon: FlaskConical },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

const CAREGIVER_NAV: NavItem[] = [
  { to: '/caregiver', label: 'Caregiver Centre', icon: HeartHandshake },
  { to: '/app/voice', label: 'Voice Assistant', icon: Mic },
  { to: '/app/timeline', label: 'Health Timeline', icon: Clock },
  { to: '/app/insights', label: 'AI Insights', icon: Sparkles },
  { to: '/app/alerts', label: 'Alerts', icon: Bell },
];

export function WorkspaceLayout() {
  const { user, logout, loginDemo, apiFetch } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [voiceDrawerOpen, setVoiceDrawerOpen] = useState(false);

  React.useEffect(() => {
    const handler = () => setVoiceDrawerOpen(true);
    window.addEventListener('vitalsense:open-voice', handler);
    return () => window.removeEventListener('vitalsense:open-voice', handler);
  }, []);

  const { data: deviationData } = useQuery<{ deviations: RealtimeDeviationEvent[] }>({
    queryKey: ['realtime-deviations'],
    queryFn: () =>
      apiFetch<{ deviations: RealtimeDeviationEvent[] }>('/api/smart-alerts/deviations'),
    enabled: Boolean(user),
    refetchInterval: 8000,
  });

  const ackDeviationMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/smart-alerts/deviations/${id}/acknowledge`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['realtime-deviations'] });
      queryClient.invalidateQueries({ queryKey: ['smart-alert-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  if (!user) return null;

  const navItems = user.role === 'caregiver' ? CAREGIVER_NAV : MEMBER_NAV;
  const activeDeviations = (deviationData?.deviations ?? []).filter((d) => !d.acknowledged);
  const latestDeviation = activeDeviations[0] ?? null;

  const handleRoleSwitch = async () => {
    const nextRole = user.role === 'member' ? 'caregiver' : 'member';
    await loginDemo(nextRole);
    navigate(nextRole === 'caregiver' ? '/caregiver' : '/app/dashboard');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const SidebarContent = (
    <div className="flex h-full flex-col justify-between bg-[var(--vs-surface)] border-r border-[var(--vs-border)] transition-colors">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--vs-border)] px-5">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-display text-base font-bold tracking-tight text-[var(--vs-text)] whitespace-nowrap"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--vs-accent)] text-[var(--vs-accent-contrast)] shadow-xs">
              <Activity className="h-4 w-4" />
            </span>
            VITALSENSE
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-muted)] lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav
          aria-label="Workspace navigation"
          className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const showBadge =
              item.to === '/app/smart-alerts' && activeDeviations.length > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)]'
                      : 'text-[var(--vs-text-secondary)] hover:bg-[var(--vs-surface-muted)] hover:text-[var(--vs-text)]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive
                            ? 'text-[var(--vs-accent)]'
                            : 'text-[var(--vs-text-muted)]'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {showBadge && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--vs-danger)] px-1.5 font-mono-num text-[10px] font-bold text-white">
                        {activeDeviations.length}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[var(--vs-border)]/75 p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] text-[var(--vs-text-muted)]">
          <span>Active Theme</span>
          <span className="font-medium text-[var(--vs-text-secondary)]">
            {theme.name}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <AvatarImage
            src={user.avatarUrl}
            alt={user.name}
            name={user.name}
            sizeClass="h-9 w-9"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--vs-text)]">
              {user.name}
            </p>
            <p className="truncate text-xs text-[var(--vs-text-muted)]">
              {user.relationOrTitle}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          <button
            type="button"
            data-testid="sidebar-talk-to-vitalsense-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              setVoiceDrawerOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] transition-colors whitespace-nowrap"
          >
            <Mic className="h-3.5 w-3.5" />
            Talk to VitalSense
          </button>
          <button
            type="button"
            onClick={handleRoleSwitch}
            className="w-full rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-muted)] px-3 py-2 text-left text-xs font-medium text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)] hover:border-[var(--vs-border-strong)] transition-colors whitespace-nowrap"
          >
            {user.role === 'member'
              ? 'Switch to Caregiver View'
              : 'Switch to Member View'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-muted)] hover:text-[var(--vs-text)] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[var(--vs-bg)] text-[var(--vs-text)] flex transition-colors">
      <aside className="relative z-20 hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {SidebarContent}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/35"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[82vw] h-full shadow-xl">
            {SidebarContent}
          </div>
        </div>
      )}

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 lg:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-2 text-[var(--vs-text)] hover:bg-[var(--vs-surface-muted)]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              to="/"
              className="font-display text-sm font-bold tracking-tight text-[var(--vs-text)]"
            >
              VITALSENSE
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="mobile-talk-to-vitalsense-btn"
              onClick={() => setVoiceDrawerOpen(true)}
              aria-label="Talk to VitalSense"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] whitespace-nowrap"
            >
              <Mic className="h-3.5 w-3.5" />
              Voice
            </button>
            <button
              type="button"
              onClick={handleRoleSwitch}
              className="rounded-lg border border-[var(--vs-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--vs-text-secondary)] hover:bg-[var(--vs-surface-muted)] whitespace-nowrap"
            >
              {user.role === 'member' ? 'Caregiver View' : 'Member View'}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {latestDeviation && (
            <div
              role="alert"
              data-testid="realtime-deviation-banner"
              className="mb-6 flex flex-col gap-3 rounded-2xl border border-[var(--vs-warning)]/40 bg-[var(--vs-warning-soft)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[var(--vs-warning)]" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-[var(--vs-text)]">
                    {latestDeviation.title}
                  </p>
                  <p className="text-xs text-[var(--vs-text-secondary)]">
                    {latestDeviation.plainEnglishReason}{' '}
                    {latestDeviation.caregiverNotified &&
                      `Caregiver notified (${latestDeviation.notifiedRecipients[0] ?? 'Primary Caregiver'}).`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {user.role === 'member' && (
                  <Link
                    to="/app/smart-alerts"
                    className="vs-btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                  >
                    Adjust Limits
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => ackDeviationMutation.mutate(latestDeviation.id)}
                  className="vs-btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                >
                  Mark as Seen
                </button>
              </div>
            </div>
          )}

          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <VoiceAssistantDrawer
        open={voiceDrawerOpen}
        onClose={() => setVoiceDrawerOpen(false)}
      />
    </div>
  );
}
