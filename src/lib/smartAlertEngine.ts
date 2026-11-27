import type { AlertRecord, SmartAlertThresholds } from './types';

export const DEFAULT_SMART_ALERT_THRESHOLDS: SmartAlertThresholds = {
  enabled: true,
  notifyCaregivers: true,
  heartRateAboveBaselineBpm: 10,
  heartRateBelowBaselineBpm: 10,
  heartRateMaxBpm: 96,
  heartRateMinBpm: 46,
  spo2DropBelowBaselinePct: 2.5,
  spo2MinPct: 94,
  cooldownMinutes: 15,
  updatedAt: '2026-11-22T08:00:00.000Z',
};

function clampNum(value: unknown, min: number, max: number, fallback: number, decimals = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.max(min, Math.min(max, value));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}

export function sanitizeSmartAlertThresholds(
  input: Partial<SmartAlertThresholds> | undefined | null,
  previous: SmartAlertThresholds = DEFAULT_SMART_ALERT_THRESHOLDS
): SmartAlertThresholds {
  const base = previous ?? DEFAULT_SMART_ALERT_THRESHOLDS;
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : base.enabled,
    notifyCaregivers:
      typeof input?.notifyCaregivers === 'boolean'
        ? input.notifyCaregivers
        : base.notifyCaregivers,
    heartRateAboveBaselineBpm: clampNum(
      input?.heartRateAboveBaselineBpm,
      4,
      35,
      base.heartRateAboveBaselineBpm,
      0
    ),
    heartRateBelowBaselineBpm: clampNum(
      input?.heartRateBelowBaselineBpm,
      4,
      30,
      base.heartRateBelowBaselineBpm,
      0
    ),
    heartRateMaxBpm: clampNum(input?.heartRateMaxBpm, 75, 160, base.heartRateMaxBpm, 0),
    heartRateMinBpm: clampNum(input?.heartRateMinBpm, 35, 65, base.heartRateMinBpm, 0),
    spo2DropBelowBaselinePct: clampNum(
      input?.spo2DropBelowBaselinePct,
      1,
      8,
      base.spo2DropBelowBaselinePct,
      1
    ),
    spo2MinPct: clampNum(input?.spo2MinPct, 85, 97, base.spo2MinPct, 1),
    cooldownMinutes: clampNum(input?.cooldownMinutes, 1, 240, base.cooldownMinutes, 0),
    updatedAt: new Date().toISOString(),
  };
}

export interface ThresholdBreach {
  metric: 'heartRate' | 'spo2';
  metricLabel: string;
  observedValue: number;
  baselineMean: number | null;
  deltaText: string;
  thresholdRuleText: string;
  severity: 'attention' | 'priority';
  title: string;
  plainEnglishReason: string;
}

export function isWithinCooldown(params: {
  metric: 'heartRate' | 'spo2';
  nowIso: string;
  cooldownMinutes: number;
  existingAlerts: Pick<AlertRecord, 'metric' | 'detectedAt' | 'status'>[];
}): boolean {
  const nowMs = Date.parse(params.nowIso);
  if (Number.isNaN(nowMs)) return false;
  const cooldownMs = Math.max(1, params.cooldownMinutes) * 60_000;

  return params.existingAlerts.some((alert) => {
    if (alert.metric !== params.metric || alert.status === 'resolved') return false;
    const alertMs = Date.parse(alert.detectedAt);
    if (Number.isNaN(alertMs)) return false;
    // Only consider live/recent alerts triggered within cooldown window
    return nowMs - alertMs >= 0 && nowMs - alertMs < cooldownMs;
  });
}

/**
 * Evaluates live Heart Rate and SpO2 readings against both the user's
 * personal baseline and their customized Smart Alert Thresholds.
 * Always produces calm, non-diagnostic plain-English explanations.
 */
export function evaluateRealtimeDeviation(params: {
  heartRate: number | null | undefined;
  spo2: number | null | undefined;
  timestamp?: string;
  hrBaselineMean: number | null;
  spo2BaselineMean: number | null;
  thresholds: SmartAlertThresholds;
  existingAlerts?: Pick<AlertRecord, 'metric' | 'detectedAt' | 'status'>[];
  ignoreCooldown?: boolean;
}): ThresholdBreach[] {
  const { thresholds } = params;
  if (!thresholds.enabled) return [];

  const nowIso = params.timestamp ?? new Date().toISOString();
  const existingAlerts = params.existingAlerts ?? [];
  const breaches: ThresholdBreach[] = [];

  if (typeof params.heartRate === 'number' && Number.isFinite(params.heartRate)) {
    const hr = Math.round(params.heartRate * 10) / 10;
    const base = params.hrBaselineMean;
    const delta = base !== null ? Math.round((hr - base) * 10) / 10 : null;
    const upperBaselineTrigger =
      base !== null ? Math.round((base + thresholds.heartRateAboveBaselineBpm) * 10) / 10 : null;
    const lowerBaselineTrigger =
      base !== null ? Math.round((base - thresholds.heartRateBelowBaselineBpm) * 10) / 10 : null;

    const exceededUpperBaseline = upperBaselineTrigger !== null && hr >= upperBaselineTrigger;
    const belowLowerBaseline = lowerBaselineTrigger !== null && hr <= lowerBaselineTrigger;
    const exceededMaxCap = hr >= thresholds.heartRateMaxBpm;
    const belowMinCap = hr <= thresholds.heartRateMinBpm;

    if (exceededUpperBaseline || belowLowerBaseline || exceededMaxCap || belowMinCap) {
      const cooling =
        !params.ignoreCooldown &&
        isWithinCooldown({
          metric: 'heartRate',
          nowIso,
          cooldownMinutes: thresholds.cooldownMinutes,
          existingAlerts,
        });

      if (!cooling) {
        const isHigh = exceededUpperBaseline || exceededMaxCap;
        const severity: 'attention' | 'priority' =
          exceededMaxCap ||
          belowMinCap ||
          (delta !== null && Math.abs(delta) >= thresholds.heartRateAboveBaselineBpm + 6)
            ? 'priority'
            : 'attention';

        const deltaText =
          delta !== null ? `${delta > 0 ? '+' : ''}${delta} bpm` : `${hr} bpm`;

        const ruleParts: string[] = [];
        if (exceededUpperBaseline && upperBaselineTrigger !== null) {
          ruleParts.push(`+${thresholds.heartRateAboveBaselineBpm} bpm above normal (${upperBaselineTrigger} bpm)`);
        }
        if (belowLowerBaseline && lowerBaselineTrigger !== null) {
          ruleParts.push(`-${thresholds.heartRateBelowBaselineBpm} bpm below normal (${lowerBaselineTrigger} bpm)`);
        }
        if (exceededMaxCap) {
          ruleParts.push(`above personal ceiling (${thresholds.heartRateMaxBpm} bpm)`);
        }
        if (belowMinCap) {
          ruleParts.push(`below personal floor (${thresholds.heartRateMinBpm} bpm)`);
        }

        breaches.push({
          metric: 'heartRate',
          metricLabel: 'Heart Rate',
          observedValue: hr,
          baselineMean: base,
          deltaText,
          thresholdRuleText: ruleParts.join(' · '),
          severity,
          title: isHigh
            ? `Heart rate jumped higher than your limit (${hr} bpm)`
            : `Heart rate dropped lower than your limit (${hr} bpm)`,
          plainEnglishReason:
            base !== null
              ? `Your live heart rate reached ${hr} bpm, which is ${Math.abs(delta ?? 0)} bpm ${
                  isHigh ? 'above' : 'below'
                } your usual ${base} bpm and crossed your custom alert setting. This is a trend alert, not a diagnosis.`
              : `Your live heart rate reached ${hr} bpm and crossed your custom alert setting. This is a trend alert, not a diagnosis.`,
        });
      }
    }
  }

  if (typeof params.spo2 === 'number' && Number.isFinite(params.spo2)) {
    const spo2 = Math.round(params.spo2 * 10) / 10;
    const base = params.spo2BaselineMean;
    const drop = base !== null ? Math.round((base - spo2) * 10) / 10 : null;
    const lowerBaselineTrigger =
      base !== null ? Math.round((base - thresholds.spo2DropBelowBaselinePct) * 10) / 10 : null;

    const droppedBelowBaseline = lowerBaselineTrigger !== null && spo2 <= lowerBaselineTrigger;
    const belowMinFloor = spo2 <= thresholds.spo2MinPct;

    if (droppedBelowBaseline || belowMinFloor) {
      const cooling =
        !params.ignoreCooldown &&
        isWithinCooldown({
          metric: 'spo2',
          nowIso,
          cooldownMinutes: thresholds.cooldownMinutes,
          existingAlerts,
        });

      if (!cooling) {
        const severity: 'attention' | 'priority' =
          spo2 <= thresholds.spo2MinPct - 1.5 || (drop !== null && drop >= 4)
            ? 'priority'
            : 'attention';

        const deltaText =
          drop !== null ? `${drop > 0 ? '-' : '+'}${Math.abs(drop)}%` : `${spo2}%`;

        const ruleParts: string[] = [];
        if (droppedBelowBaseline && lowerBaselineTrigger !== null) {
          ruleParts.push(`-${thresholds.spo2DropBelowBaselinePct}% below normal (${lowerBaselineTrigger}%)`);
        }
        if (belowMinFloor) {
          ruleParts.push(`at or below ${thresholds.spo2MinPct}% floor`);
        }

        breaches.push({
          metric: 'spo2',
          metricLabel: 'SpO₂ (Blood Oxygen)',
          observedValue: spo2,
          baselineMean: base,
          deltaText,
          thresholdRuleText: ruleParts.join(' · '),
          severity,
          title: `Blood oxygen (SpO₂) dipped below your limit (${spo2}%)`,
          plainEnglishReason:
            base !== null
              ? `Your blood oxygen reading dipped to ${spo2}%, which is ${Math.abs(drop ?? 0)}% below your usual ${base}% and crossed your alert threshold. Check sensor fit and rest comfortably; contact a clinician if you feel unwell.`
              : `Your blood oxygen reading dipped to ${spo2}% and crossed your alert threshold. Check sensor fit and seek medical help if you have symptoms.`,
        });
      }
    }
  }

  return breaches;
}
