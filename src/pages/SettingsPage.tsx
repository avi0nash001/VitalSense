import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, Sliders } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { ConsentSettings, MonitoringPreferences } from '../lib/types';
import { ThemeGallery } from '../components/theme/ThemeGallery';
import {
  DashboardSkeleton,
  PageHeader,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';

interface WorkspaceSettingsResponse {
  consent: ConsentSettings;
  preferences: MonitoringPreferences;
}

const prefsSchema = z.object({
  restingHeartRateSensitivity: z.enum(['balanced', 'sensitive', 'conservative']),
  baselineWindowDays: z.number().int().min(7).max(30),
  wearableDeviceName: z.string().min(2).max(80),
});

type PrefsFormValues = z.infer<typeof prefsSchema>;

export function SettingsPage() {
  const { apiFetch } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<WorkspaceSettingsResponse>({
    queryKey: ['workspace-overview'],
    queryFn: () => apiFetch<WorkspaceSettingsResponse>('/api/workspace/overview'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PrefsFormValues>({
    resolver: zodResolver(prefsSchema),
    defaultValues: {
      restingHeartRateSensitivity: 'balanced',
      baselineWindowDays: 14,
      wearableDeviceName: 'PulseRing Gen 3 (Nightly Sync)',
    },
  });

  useEffect(() => {
    if (data?.preferences) {
      reset({
        restingHeartRateSensitivity: data.preferences.restingHeartRateSensitivity,
        baselineWindowDays: data.preferences.baselineWindowDays,
        wearableDeviceName: data.preferences.wearableDeviceName,
      });
    }
  }, [data?.preferences, reset]);

  const consentMutation = useMutation({
    mutationFn: (patch: Partial<ConsentSettings>) =>
      apiFetch<{ consent: ConsentSettings }>('/api/settings/consent', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['baseline'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      pushToast({
        title: 'Caregiver consent updated',
        description: 'Permissions applied immediately across caregiver views.',
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to update consent',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'error',
      });
    },
  });

  const prefsMutation = useMutation({
    mutationFn: (values: PrefsFormValues) =>
      apiFetch<{ preferences: MonitoringPreferences }>('/api/settings/preferences', {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['baseline'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      pushToast({
        title: 'Detection preferences saved',
        description: 'Baselines and comparison windows updated.',
        variant: 'success',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Unable to save preferences',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'error',
      });
    },
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <StateNotice
        variant="error"
        title="Unable to load Settings"
        message={error instanceof Error ? error.message : 'Please try again.'}
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="vs-btn-primary rounded-lg px-3.5 py-2 text-xs font-medium"
          >
            Retry
          </button>
        }
      />
    );
  }

  const consentItems: {
    key: keyof ConsentSettings;
    label: string;
    description: string;
  }[] = [
    {
      key: 'shareVitalTrends',
      label: 'Share vital metric trends',
      description: 'Allow authorized caregivers to view latest readings and baseline comparisons.',
    },
    {
      key: 'shareBaselineProgress',
      label: 'Share baseline calibration progress',
      description: 'Expose 14-day baseline coverage and sufficiency metrics in caregiver summaries.',
    },
    {
      key: 'shareTimelineDetails',
      label: 'Share Health Change Timeline details',
      description: 'Allow caregivers to inspect expanded progression charts and detection evidence.',
    },
    {
      key: 'shareAiInsights',
      label: 'Share Gemini pattern explanations',
      description: 'Allow caregivers to read non-diagnostic AI interpretations and clinician prompts.',
    },
    {
      key: 'notifyCaregiverOnAlerts',
      label: 'Send alert notifications to primary caregiver',
      description: 'Deliver advisory and priority health alerts to Sarah Vance when triggered.',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Appearance, Privacy & Calibration"
        title="Settings & Visual Themes"
        description="Customize your VITALSENSE interface theme, govern exactly what authorized caregivers can view, and tune personal baseline parameters."
      />

      <ThemeGallery />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Caregiver Consent Controls */}
        <SurfaceCard className="lg:col-span-7 p-6 space-y-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
            <ShieldCheck className="h-4 w-4" />
            Member Consent &amp; Access Boundaries
          </div>

          <div className="divide-y divide-[var(--vs-border)]">
            {consentItems.map((item) => {
              const enabled = data.consent[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4 py-4 first:pt-1 last:pb-1"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--vs-text)]">{item.label}</p>
                    <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                      {item.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={item.label}
                    disabled={consentMutation.isPending}
                    onClick={() =>
                      consentMutation.mutate({ [item.key]: !enabled })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      enabled ? 'bg-[var(--vs-accent)]' : 'bg-[var(--vs-border-strong)]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                        enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </SurfaceCard>

        {/* Monitoring & Detection Preferences */}
        <SurfaceCard className="lg:col-span-5 p-6 space-y-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-text)]">
            <Sliders className="h-4 w-4 text-[var(--vs-accent)]" />
            Monitoring Calibration
          </div>

          <form
            onSubmit={handleSubmit((vals) => prefsMutation.mutate(vals))}
            className="space-y-4"
            noValidate
          >
            <div>
              <label
                htmlFor="pref-device"
                className="block text-xs font-medium text-[var(--vs-text-secondary)]"
              >
                Connected wearable label
              </label>
              <input
                id="pref-device"
                type="text"
                {...register('wearableDeviceName')}
                className="vs-input mt-1.5 w-full rounded-lg px-3 py-2 text-sm"
              />
              {errors.wearableDeviceName && (
                <p className="mt-1 text-xs text-[var(--vs-danger)]">
                  {errors.wearableDeviceName.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="pref-window"
                className="block text-xs font-medium text-[var(--vs-text-secondary)]"
              >
                Target baseline window (days)
              </label>
              <input
                id="pref-window"
                type="number"
                min={7}
                max={30}
                {...register('baselineWindowDays', { valueAsNumber: true })}
                className="vs-input mt-1.5 w-full rounded-lg px-3 py-2 font-mono-num text-sm"
              />
              {errors.baselineWindowDays && (
                <p className="mt-1 text-xs text-[var(--vs-danger)]">
                  {errors.baselineWindowDays.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="pref-sensitivity"
                className="block text-xs font-medium text-[var(--vs-text-secondary)]"
              >
                Change detection sensitivity
              </label>
              <select
                id="pref-sensitivity"
                {...register('restingHeartRateSensitivity')}
                className="vs-input mt-1.5 w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="balanced">Balanced (Recommended)</option>
                <option value="sensitive">Sensitive (Earlier subtle changes)</option>
                <option value="conservative">Conservative (Larger sustained changes)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || prefsMutation.isPending}
              className="vs-btn-primary w-full rounded-xl px-4 py-2.5 text-xs font-medium disabled:opacity-60"
            >
              {prefsMutation.isPending ? 'Recalculating...' : 'Save Calibration Settings'}
            </button>
          </form>
        </SurfaceCard>
      </div>
    </div>
  );
}
