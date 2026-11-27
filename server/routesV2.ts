import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  buildUnifiedPredictiveObservations,
  detectCrisisLanguage,
  evaluateRestRecommendation,
  generateSimulatedLiveSample,
  summarizeWellbeingTrends,
  WEARABLE_ADAPTERS,
} from '../src/lib/intelligenceEngine.ts';
import type {
  AlertRecord,
  ChartAnnotation,
  LiveVitalSample,
  RealtimeDeviationEvent,
  RppgMeasurement,
  SafetyAlertCategory,
  SafetyAlertRecord,
  SafetyContact,
  SensorSession,
  SymptomLog,
  SymptomSeverity,
  UserProfile,
  WellbeingCheckin,
  WellbeingCompanionMessage,
} from '../src/lib/types.ts';
import { buildThirtyDayCalibrationBand } from '../src/lib/baselineCalibration.ts';
import {
  evaluateRealtimeDeviation,
  sanitizeSmartAlertThresholds,
} from '../src/lib/smartAlertEngine.ts';
import {
  inferAnnotationCategory,
  toAnnotationDateKey,
} from '../src/lib/chartAnnotations.ts';
import { findNearestBiometricContext } from '../src/lib/symptomCorrelation.ts';
import { sortReadingsChronologically } from '../src/lib/vitalsEngine.ts';
import { generateSupportiveWellbeingReply } from './geminiService.ts';
import { computeStoreBaselines, getStore, saveStore, type WorkspaceStoreState } from './store.ts';

function evaluateAndRecordStoreBreaches(
  store: WorkspaceStoreState,
  params: {
    heartRate: number | null | undefined;
    spo2: number | null | undefined;
    timestamp?: string;
    ignoreCooldown?: boolean;
  }
): RealtimeDeviationEvent[] {
  const baselines = computeStoreBaselines(store);
  const nowIso = params.timestamp ?? new Date().toISOString();
  const breaches = evaluateRealtimeDeviation({
    heartRate: params.heartRate,
    spo2: params.spo2,
    timestamp: nowIso,
    hrBaselineMean: baselines.heartRate.mean,
    spo2BaselineMean: baselines.spo2.mean,
    thresholds: store.smartAlertThresholds,
    existingAlerts: store.alerts,
    ignoreCooldown: params.ignoreCooldown,
  });

  if (breaches.length === 0) return [];

  const allowCaregiverNotify =
    store.smartAlertThresholds.notifyCaregivers && store.consent.notifyCaregiverOnAlerts;

  const eligibleContacts = store.safetyContacts.filter(
    (c) =>
      c.consentVerified &&
      (c.role === 'caregiver' || c.notifyOnCategories.includes('physiological_change'))
  );

  const createdEvents: RealtimeDeviationEvent[] = [];

  for (const b of breaches) {
    const devId = `rdev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const alertId = `alt_rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const notifiedRecipients = allowCaregiverNotify
      ? eligibleContacts.map((c) => `${c.name} (${c.channel})`)
      : [];

    const alertRecord: AlertRecord = {
      id: alertId,
      title: b.title,
      severity: b.severity,
      status: 'open',
      detectedAt: nowIso,
      metric: b.metric,
      metricLabel: b.metricLabel,
      evidenceSummary: `${b.plainEnglishReason} (${b.thresholdRuleText})`,
      timelineEventId: store.timelineEvents[0]?.id ?? 'evt_realtime',
      source: 'synthetic',
      acknowledgement: { acknowledged: false },
      notifications:
        eligibleContacts.length > 0
          ? eligibleContacts.map((c, idx) => ({
              id: `notif_${alertId}_${idx}`,
              recipient: `${c.name} (${c.relation})`,
              channel: c.channel,
              sentAt: nowIso,
              status: allowCaregiverNotify ? 'delivered' : 'withheld_by_consent',
            }))
          : [
              {
                id: `notif_${alertId}_0`,
                recipient: 'Sarah Vance (Primary Caregiver)',
                channel: 'Caregiver Portal & Digest',
                sentAt: nowIso,
                status: allowCaregiverNotify ? 'delivered' : 'withheld_by_consent',
              },
            ],
      followUp: { status: 'none' },
    };

    const safetyAlert: SafetyAlertRecord = {
      id: `sal_rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category: 'physiological_change',
      severity: b.severity,
      title: b.title,
      description: b.plainEnglishReason,
      createdAt: nowIso,
      source: 'system_rule',
      requiresHumanConfirmation: true,
      acknowledged: false,
    };

    const devEvent: RealtimeDeviationEvent = {
      id: devId,
      triggeredAt: nowIso,
      metric: b.metric,
      metricLabel: b.metricLabel,
      observedValue: b.observedValue,
      baselineMean: b.baselineMean,
      deltaText: b.deltaText,
      thresholdRuleText: b.thresholdRuleText,
      severity: b.severity,
      title: b.title,
      plainEnglishReason: b.plainEnglishReason,
      caregiverNotified: allowCaregiverNotify && notifiedRecipients.length > 0,
      notifiedRecipients,
      acknowledged: false,
      alertId,
    };

    store.alerts.unshift(alertRecord);
    store.safetyAlerts.unshift(safetyAlert);
    store.realtimeDeviations = [devEvent, ...store.realtimeDeviations.slice(0, 29)];
    createdEvents.push(devEvent);
  }

  return createdEvents;
}

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

type Middleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;

export function registerV2Routes(
  app: Express,
  deps: { requireAuth: Middleware; requireMember: Middleware }
): void {
  const { requireAuth, requireMember } = deps;

  // =========================================================
  // 1. LIVE VITAL MONITORING & STREAMING (SSE + Adapter Sessions)
  // =========================================================

  app.get('/api/live/status', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareVitalTrends) {
      res.json({
        restrictedByConsent: true,
        adapters: WEARABLE_ADAPTERS,
        activeSession: null,
        recentSamples: [],
        baselineCalibration: null,
        heartRateBaseline: null,
        historicalReadings: [],
      });
      return;
    }

    const activeSession =
      store.sensorSessions.find((s) => s.status === 'active') ??
      store.sensorSessions[0] ??
      null;
    const recentSamples = store.liveSamples.slice(-30);
    const latestSample = recentSamples[recentSamples.length - 1] ?? null;
    const baselines = computeStoreBaselines(store);
    const historicalReadings = sortReadingsChronologically(store.readings).slice(-30);
    const baselineCalibration = buildThirtyDayCalibrationBand({
      readings: historicalReadings,
      metric: 'heartRate',
      mode: 'typical',
      fallbackBaseline: baselines.heartRate,
      liveCurrentValue: latestSample?.heartRate ?? null,
    });

    res.json({
      restrictedByConsent: false,
      adapters: WEARABLE_ADAPTERS,
      activeSession,
      recentSamples,
      baselineCalibration,
      heartRateBaseline: baselines.heartRate,
      historicalReadings,
    });
  });

  app.post(
    '/api/live/session/start',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        adapterId: z.enum([
          'smartwatch_sync',
          'fitness_band',
          'ble_heart_rate',
          'pulse_oximeter',
          'simulated_stream',
        ]),
        deviceName: z.string().min(2).max(100).optional(),
        source: z.enum(['real_sensor', 'camera_rppg_experimental', 'simulated']).default('simulated'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid sensor adapter configuration.' });
        return;
      }

      const store = getStore();
      // Stop any existing active sessions
      const now = new Date().toISOString();
      store.sensorSessions = store.sensorSessions.map((s) =>
        s.status === 'active'
          ? { ...s, status: 'stopped', stoppedAt: now, connectionStatus: 'disconnected' }
          : s
      );

      const adapter = WEARABLE_ADAPTERS.find((a) => a.id === parsed.data.adapterId);
      const newSession: SensorSession = {
        id: `sens_${Date.now()}`,
        adapterId: parsed.data.adapterId,
        deviceName: parsed.data.deviceName ?? adapter?.name ?? 'Wearable Sensor',
        source: parsed.data.source,
        status: 'active',
        startedAt: now,
        sampleCount: 0,
        connectionStatus: 'connected',
      };

      store.sensorSessions.unshift(newSession);
      saveStore(store);
      res.status(201).json({ session: newSession });
    }
  );

  app.post(
    '/api/live/session/stop',
    requireAuth,
    requireMember,
    (_req: AuthenticatedRequest, res) => {
      const store = getStore();
      const now = new Date().toISOString();
      let stopped: SensorSession | null = null;
      store.sensorSessions = store.sensorSessions.map((s) => {
        if (s.status === 'active') {
          stopped = { ...s, status: 'stopped', stoppedAt: now, connectionStatus: 'disconnected' };
          return stopped;
        }
        return s;
      });
      saveStore(store);
      res.json({ stopped });
    }
  );

  app.post('/api/live/sample', requireAuth, requireMember, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      sessionId: z.string().min(3),
      heartRate: z.number().min(30).max(220).nullable().optional(),
      spo2: z.number().min(70).max(100).nullable().optional(),
      respiratoryRate: z.number().min(6).max(45).nullable().optional(),
      temperature: z.number().min(33).max(42).nullable().optional(),
      hrv: z.number().min(5).max(250).nullable().optional(),
      signalQuality: z.number().min(0).max(100).default(90),
      source: z.enum(['real_sensor', 'camera_rppg_experimental', 'simulated']).default('simulated'),
      deviceName: z.string().min(2).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid live biometric sample payload.' });
      return;
    }

    const store = getStore();
    const missingChannels: string[] = [];
    if (parsed.data.heartRate == null) missingChannels.push('Heart Rate');
    if (parsed.data.spo2 == null) missingChannels.push('SpO2');
    if (parsed.data.respiratoryRate == null) missingChannels.push('Resp. Rate');

    const sample: LiveVitalSample = {
      id: `live_${Date.now()}`,
      sessionId: parsed.data.sessionId,
      timestamp: new Date().toISOString(),
      source: parsed.data.source,
      deviceName: parsed.data.deviceName ?? 'Connected Sensor',
      heartRate: parsed.data.heartRate ?? null,
      spo2: parsed.data.spo2 ?? null,
      respiratoryRate: parsed.data.respiratoryRate ?? null,
      temperature: parsed.data.temperature ?? null,
      hrv: parsed.data.hrv ?? null,
      activityCadence: null,
      sleepHours: null,
      signalQuality: parsed.data.signalQuality,
      missingChannels,
      reliabilityNote:
        parsed.data.source === 'real_sensor'
          ? 'Measured from connected hardware sensor'
          : 'SIMULATED live stream telemetry',
    };

    store.liveSamples = [...store.liveSamples.slice(-59), sample];
    const sess = store.sensorSessions.find((s) => s.id === parsed.data.sessionId);
    if (sess) {
      sess.sampleCount += 1;
    }
    const triggeredDeviations = evaluateAndRecordStoreBreaches(store, {
      heartRate: sample.heartRate,
      spo2: sample.spo2,
      timestamp: sample.timestamp,
    });
    saveStore(store);
    res.status(201).json({ sample, triggeredDeviations });
  });

  // Server-Sent Events (SSE) real-time simulation or active session stream
  app.get('/api/live/stream', requireAuth, (req: AuthenticatedRequest, res) => {
    const scenarioParam = String(req.query.scenario ?? 'normal');
    const scenario: 'normal' | 'gradual_drift' | 'noisy_gap' =
      scenarioParam === 'gradual_drift' || scenarioParam === 'noisy_gap' ? scenarioParam : 'normal';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let step = 0;
    const emitSample = () => {
      const store = getStore();
      const activeSession = store.sensorSessions.find((s) => s.status === 'active');
      if (!activeSession) {
        res.write(`event: status\ndata: ${JSON.stringify({ status: 'idle' })}\n\n`);
        return;
      }

      if (activeSession.source === 'simulated') {
        const sample = generateSimulatedLiveSample({
          sessionId: activeSession.id,
          deviceName: activeSession.deviceName,
          stepIndex: step++,
          scenario,
        });
        store.liveSamples = [...store.liveSamples.slice(-59), sample];
        activeSession.sampleCount += 1;
        const deviations = evaluateAndRecordStoreBreaches(store, {
          heartRate: sample.heartRate,
          spo2: sample.spo2,
          timestamp: sample.timestamp,
        });
        if (deviations.length > 0) {
          saveStore(store);
          res.write(`event: deviation\ndata: ${JSON.stringify(deviations)}\n\n`);
        }
        res.write(`event: sample\ndata: ${JSON.stringify(sample)}\n\n`);
      } else {
        const latest = store.liveSamples[store.liveSamples.length - 1];
        if (latest) {
          res.write(`event: sample\ndata: ${JSON.stringify(latest)}\n\n`);
        }
      }
    };

    emitSample();
    const interval = setInterval(emitSample, 2000);
    req.on('close', () => {
      clearInterval(interval);
    });
  });

  // =========================================================
  // 2. EXPERIMENTAL CAMERA rPPG MEASUREMENTS
  // =========================================================

  app.get('/api/rppg/history', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareVitalTrends) {
      res.json({ restrictedByConsent: true, measurements: [] });
      return;
    }
    res.json({
      restrictedByConsent: false,
      measurements: store.rppgMeasurements,
    });
  });

  app.post(
    '/api/rppg/measurement',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        source: z.enum(['camera_rppg_experimental', 'simulated']),
        estimatedHeartRate: z.number().min(35).max(200).nullable(),
        confidencePct: z.number().min(0).max(100),
        signalQuality: z.number().min(0).max(100),
        lightingStatus: z.enum(['good', 'low_light', 'overexposed']),
        motionStatus: z.enum(['steady', 'moderate_motion', 'excessive_motion']),
        passedQualityCheck: z.boolean(),
        failureReason: z.string().max(240).optional(),
        roiLabel: z.string().max(120).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid rPPG measurement summary payload.' });
        return;
      }

      const measurement: RppgMeasurement = {
        id: `rppg_${Date.now()}`,
        timestamp: new Date().toISOString(),
        source: parsed.data.source,
        estimatedHeartRate: parsed.data.passedQualityCheck ? parsed.data.estimatedHeartRate : null,
        confidencePct: parsed.data.confidencePct,
        signalQuality: parsed.data.signalQuality,
        lightingStatus: parsed.data.lightingStatus,
        motionStatus: parsed.data.motionStatus,
        passedQualityCheck: parsed.data.passedQualityCheck,
        failureReason: parsed.data.failureReason,
        roiLabel: parsed.data.roiLabel ?? 'Local Browser ROI (never uploads video)',
        disclaimer:
          'Experimental camera rPPG pulse estimate only. Not a validated pulse oximeter or medical device.',
      };

      const store = getStore();
      store.rppgMeasurements = [measurement, ...store.rppgMeasurements.slice(0, 29)];
      saveStore(store);
      res.status(201).json({ measurement });
    }
  );

  app.delete(
    '/api/rppg/history',
    requireAuth,
    requireMember,
    (_req: AuthenticatedRequest, res) => {
      const store = getStore();
      store.rppgMeasurements = [];
      saveStore(store);
      res.json({ cleared: true });
    }
  );

  // =========================================================
  // 3. DAILY WELLBEING & SUPPORTIVE CHECK-INS
  // =========================================================

  app.get('/api/wellbeing/history', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareAiInsights) {
      res.json({
        restrictedByConsent: true,
        checkins: [],
        summary: summarizeWellbeingTrends([]),
        companionMessages: [],
      });
      return;
    }
    res.json({
      restrictedByConsent: false,
      checkins: store.wellbeingCheckins,
      summary: summarizeWellbeingTrends(store.wellbeingCheckins),
      companionMessages: store.companionMessages,
    });
  });

  app.get('/api/wellbeing/summary', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    res.json({
      summary: summarizeWellbeingTrends(store.wellbeingCheckins),
    });
  });

  app.post(
    '/api/wellbeing/checkin',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        mood: z.enum(['calm', 'okay', 'low', 'stressed', 'tired']),
        sleepQuality: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        energyLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        socialConnectedness: z.enum(['connected', 'somewhat_isolated', 'isolated']),
        wantsToTalk: z.boolean().default(false),
        breakReminderRequested: z.boolean().default(false),
        journalNote: z.string().max(1000).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please complete your check-in selections.' });
        return;
      }

      const now = new Date().toISOString();
      const entry: WellbeingCheckin = {
        id: `wb_${Date.now()}`,
        timestamp: now,
        mood: parsed.data.mood,
        sleepQuality: parsed.data.sleepQuality,
        energyLevel: parsed.data.energyLevel,
        socialConnectedness: parsed.data.socialConnectedness,
        wantsToTalk: parsed.data.wantsToTalk,
        breakReminderRequested: parsed.data.breakReminderRequested,
        journalNote: parsed.data.journalNote?.trim() || undefined,
      };

      const store = getStore();
      store.wellbeingCheckins = [entry, ...store.wellbeingCheckins.slice(0, 59)];
      const summary = summarizeWellbeingTrends(store.wellbeingCheckins);

      if (parsed.data.wantsToTalk) {
        store.safetyAlerts.unshift({
          id: `sal_wb_${Date.now()}`,
          category: 'wellbeing_support',
          severity: 'advisory',
          title: 'Voluntary wellbeing check-in support request',
          description:
            'Member indicated they would appreciate talking with someone they trust.',
          createdAt: now,
          source: 'user_checkin',
          requiresHumanConfirmation: true,
          acknowledged: false,
        });
      }

      saveStore(store);
      res.status(201).json({ checkin: entry, summary });
    }
  );

  app.post(
    '/api/wellbeing/support-request',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        contactId: z.string().min(2).optional(),
        note: z.string().min(3).max(400),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please enter a brief message for your trusted contact.' });
        return;
      }

      const store = getStore();
      const contact =
        store.safetyContacts.find((c) => c.id === parsed.data.contactId) ??
        store.safetyContacts[0];
      const now = new Date().toISOString();
      const alert: SafetyAlertRecord = {
        id: `sal_sup_${Date.now()}`,
        category: 'wellbeing_support',
        severity: 'advisory',
        title: `Support check-in shared with ${contact?.name ?? 'trusted contact'}`,
        description: parsed.data.note.trim(),
        createdAt: now,
        source: 'user_checkin',
        requiresHumanConfirmation: true,
        acknowledged: false,
      };
      store.safetyAlerts.unshift(alert);
      saveStore(store);
      res.status(201).json({ alert, recipient: contact?.name ?? 'Trusted contact' });
    }
  );

  app.post(
    '/api/wellbeing/companion',
    requireAuth,
    requireMember,
    async (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        message: z.string().min(2).max(1200),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please share a few words before sending.' });
        return;
      }

      const store = getStore();
      const now = new Date().toISOString();
      const userMsg: WellbeingCompanionMessage = {
        id: `cmp_u_${Date.now()}`,
        role: 'user',
        text: parsed.data.message.trim(),
        timestamp: now,
      };
      store.companionMessages.push(userMsg);

      // Immediate deterministic crisis-resource detection
      if (detectCrisisLanguage(parsed.data.message)) {
        const crisisMsg: WellbeingCompanionMessage = {
          id: `cmp_a_${Date.now() + 1}`,
          role: 'assistant',
          text: 'It sounds like you are carrying something really heavy right now, and you do not have to carry it alone. Please reach out right now to someone you trust or free, confidential support: call or text 988 (US & Canada Suicide & Crisis Lifeline), text HOME to 741741, or contact your local emergency services immediately.',
          timestamp: new Date().toISOString(),
          crisisGuidanceShown: true,
          suggestedAction: 'Call or text 988 or reach your emergency contact now',
        };
        store.companionMessages.push(crisisMsg);
        saveStore(store);
        res.json({ reply: crisisMsg, crisisGuidanceShown: true });
        return;
      }

      const summary = summarizeWellbeingTrends(store.wellbeingCheckins);
      try {
        const geminiRes = await generateSupportiveWellbeingReply({
          message: parsed.data.message.trim(),
          recentCheckinSummary: `${summary.recentMoodSummary}; avg sleep ${summary.avgSleepQuality ?? 'N/A'}/5`,
        });
        const aiMsg: WellbeingCompanionMessage = {
          id: `cmp_a_${Date.now() + 1}`,
          role: 'assistant',
          text: geminiRes.reply,
          timestamp: new Date().toISOString(),
          suggestedAction: geminiRes.suggestedAction,
        };
        store.companionMessages.push(aiMsg);
        saveStore(store);
        res.json({ reply: aiMsg, crisisGuidanceShown: false });
      } catch (err) {
        saveStore(store);
        const message = err instanceof Error ? err.message : 'Unable to reach Gemini companion.';
        res.status(502).json({ error: message });
      }
    }
  );

  // =========================================================
  // 5. REST RECOMMENDATIONS ENGINE
  // =========================================================

  app.get('/api/rest/recommendations', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    res.json({ recommendations: store.restRecommendations });
  });

  app.post(
    '/api/rest/evaluate',
    requireAuth,
    requireMember,
    (_req: AuthenticatedRequest, res) => {
      const store = getStore();
      const latestReading = store.readings[store.readings.length - 1];
      const rec = evaluateRestRecommendation({
        recentSleepHours: latestReading?.sleepHours ?? null,
        recentTimelineEvent: store.timelineEvents[0] ?? null,
        recentCheckin: store.wellbeingCheckins[0] ?? null,
      });

      if (rec) {
        store.restRecommendations = [rec, ...store.restRecommendations.slice(0, 19)];
        saveStore(store);
      }

      res.json({ recommendation: rec });
    }
  );

  app.post('/api/rest/acknowledge', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      recommendationId: z.string().min(3),
      recordBreak: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid rest acknowledgement payload.' });
      return;
    }

    const store = getStore();
    const rec = store.restRecommendations.find((r) => r.id === parsed.data.recommendationId);
    if (!rec) {
      res.status(404).json({ error: 'Rest recommendation not found.' });
      return;
    }
    const now = new Date().toISOString();
    rec.acknowledged = true;
    rec.acknowledgedAt = rec.acknowledgedAt ?? now;
    if (parsed.data.recordBreak) {
      rec.breakRecorded = true;
      rec.breakRecordedAt = now;
      rec.followUpStatus = 'completed';
    } else {
      rec.followUpStatus = 'resting';
    }
    saveStore(store);
    res.json({ recommendation: rec });
  });

  // =========================================================
  // 6. PERSONAL SAFETY NETWORK & UNIFIED PREDICTIVE ENGINE
  // =========================================================

  app.get('/api/safety/contacts', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    res.json({ contacts: store.safetyContacts });
  });

  app.post(
    '/api/safety/contacts',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        name: z.string().min(2).max(80),
        relation: z.string().min(2).max(80),
        role: z.enum(['caregiver', 'trusted_contact', 'emergency']),
        channel: z.enum(['Portal & Digest', 'Telegram Bot', 'Email (Resend)', 'Phone']),
        contactValue: z.string().min(3).max(120),
        notifyOnCategories: z.array(
          z.enum([
            'sensor_issue',
            'physiological_change',
            'wellbeing_support',
            'missed_checkin',
            'caregiver_followup',
          ])
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please complete all safety contact details.' });
        return;
      }

      const contact: SafetyContact = {
        id: `cnt_${Date.now()}`,
        name: parsed.data.name.trim(),
        relation: parsed.data.relation.trim(),
        role: parsed.data.role,
        channel: parsed.data.channel,
        contactValue: parsed.data.contactValue.trim(),
        notifyOnCategories: parsed.data.notifyOnCategories as SafetyAlertCategory[],
        consentVerified: true,
        addedAt: new Date().toISOString(),
      };
      const store = getStore();
      store.safetyContacts.push(contact);
      saveStore(store);
      res.status(201).json({ contact });
    }
  );

  app.delete(
    '/api/safety/contacts/:id',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const store = getStore();
      store.safetyContacts = store.safetyContacts.filter((c) => c.id !== req.params.id);
      saveStore(store);
      res.json({ removed: true });
    }
  );

  app.get('/api/safety/history', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    res.json({
      alerts: store.safetyAlerts,
      contacts: store.safetyContacts,
      consentRecords: store.consentRecords,
    });
  });

  app.post('/api/safety/alerts', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      category: z.enum([
        'sensor_issue',
        'physiological_change',
        'wellbeing_support',
        'missed_checkin',
        'caregiver_followup',
      ]),
      severity: z.enum(['advisory', 'attention', 'priority']).default('advisory'),
      title: z.string().min(3).max(140),
      description: z.string().min(3).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid safety alert payload.' });
      return;
    }

    const alert: SafetyAlertRecord = {
      id: `sal_${Date.now()}`,
      category: parsed.data.category,
      severity: parsed.data.severity,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      createdAt: new Date().toISOString(),
      source: 'system_rule',
      requiresHumanConfirmation: true,
      acknowledged: false,
    };
    const store = getStore();
    store.safetyAlerts.unshift(alert);
    saveStore(store);
    res.status(201).json({ alert });
  });

  app.post('/api/safety/alerts/:id/acknowledge', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      followUpNote: z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    const store = getStore();
    const alert = store.safetyAlerts.find((a) => a.id === req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Safety alert not found.' });
      return;
    }
    alert.acknowledged = true;
    alert.acknowledgedBy = req.user?.name ?? 'Authorized Contact';
    alert.acknowledgedAt = new Date().toISOString();
    if (parsed.success && parsed.data.followUpNote) {
      alert.followUpNote = parsed.data.followUpNote.trim();
    }
    saveStore(store);
    res.json({ alert });
  });

  app.get('/api/intelligence/unified', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareAiInsights) {
      res.json({ restrictedByConsent: true, observations: [] });
      return;
    }
    const observations = buildUnifiedPredictiveObservations({
      timelineEvents: store.timelineEvents,
      wellbeingCheckins: store.wellbeingCheckins,
      safetyAlerts: store.safetyAlerts,
      latestLiveSample: store.liveSamples[store.liveSamples.length - 1] ?? null,
    });
    res.json({ restrictedByConsent: false, observations });
  });

  app.post(
    '/api/consent/record',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        scope: z.enum(['camera_rppg', 'caregiver_sharing', 'wellbeing_trends']),
        granted: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid consent scope payload.' });
        return;
      }

      const store = getStore();
      const record = store.consentRecords.find((c) => c.scope === parsed.data.scope);
      const now = new Date().toISOString();
      if (record) {
        record.granted = parsed.data.granted;
        record.updatedAt = now;
      }
      saveStore(store);
      res.json({ consentRecords: store.consentRecords });
    }
  );

  app.delete(
    '/api/privacy/cv-data',
    requireAuth,
    requireMember,
    (_req: AuthenticatedRequest, res) => {
      const store = getStore();
      store.rppgMeasurements = [];
      saveStore(store);
      res.json({ deleted: true });
    }
  );

  // =========================================================
  // 7. SMART ALERT THRESHOLDS & REAL-TIME DEVIATION ENGINE
  // =========================================================

  app.get('/api/smart-alerts/thresholds', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    const baselines = computeStoreBaselines(store);
    res.json({
      thresholds: store.smartAlertThresholds,
      baselines: {
        heartRate: baselines.heartRate,
        spo2: baselines.spo2,
      },
      contacts: store.safetyContacts,
      consent: store.consent,
      recentDeviations: store.realtimeDeviations.slice(0, 12),
    });
  });

  app.put(
    '/api/smart-alerts/thresholds',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        enabled: z.boolean().optional(),
        notifyCaregivers: z.boolean().optional(),
        heartRateAboveBaselineBpm: z.number().min(4).max(35).optional(),
        heartRateBelowBaselineBpm: z.number().min(4).max(30).optional(),
        heartRateMaxBpm: z.number().min(75).max(160).optional(),
        heartRateMinBpm: z.number().min(35).max(65).optional(),
        spo2DropBelowBaselinePct: z.number().min(1).max(8).optional(),
        spo2MinPct: z.number().min(85).max(97).optional(),
        cooldownMinutes: z.number().min(1).max(240).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please check your alert threshold numbers.' });
        return;
      }

      const store = getStore();
      store.smartAlertThresholds = sanitizeSmartAlertThresholds(
        parsed.data,
        store.smartAlertThresholds
      );
      saveStore(store);
      res.json({ thresholds: store.smartAlertThresholds });
    }
  );

  app.post('/api/smart-alerts/evaluate', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      heartRate: z.number().min(30).max(220).nullable().optional(),
      spo2: z.number().min(70).max(100).nullable().optional(),
      ignoreCooldown: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid heart rate or SpO2 reading to check.' });
      return;
    }

    const store = getStore();
    const deviations = evaluateAndRecordStoreBreaches(store, {
      heartRate: parsed.data.heartRate,
      spo2: parsed.data.spo2,
      ignoreCooldown: parsed.data.ignoreCooldown,
    });
    if (deviations.length > 0) {
      saveStore(store);
    }
    res.json({
      breached: deviations.length > 0,
      deviations,
      recentDeviations: store.realtimeDeviations.slice(0, 12),
    });
  });

  app.get('/api/smart-alerts/deviations', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    res.json({ deviations: store.realtimeDeviations.slice(0, 20) });
  });

  app.post(
    '/api/smart-alerts/deviations/:id/acknowledge',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const store = getStore();
      const target = store.realtimeDeviations.find((d) => d.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Deviation notification not found.' });
        return;
      }
      target.acknowledged = true;
      if (target.alertId) {
        const linked = store.alerts.find((a) => a.id === target.alertId);
        if (linked) {
          linked.status = 'acknowledged';
          linked.acknowledgement = {
            acknowledged: true,
            by: req.user?.name ?? 'Member',
            at: new Date().toISOString(),
          };
        }
      }
      saveStore(store);
      res.json({ deviation: target });
    }
  );

  // =========================================================
  // 8. BIOMETRIC CHART CONTEXT NOTES / ANNOTATIONS
  // =========================================================

  app.get('/api/annotations', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    res.json({ annotations: store.chartAnnotations });
  });

  app.post(
    '/api/annotations',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        timestamp: z.string().min(4).max(80),
        metric: z
          .enum(['heartRate', 'spo2', 'temperature', 'respiratoryRate', 'hrv', 'all'])
          .default('all'),
        category: z
          .enum(['exercise', 'stress', 'sleep', 'medication', 'recovery', 'other'])
          .optional(),
        note: z.string().trim().min(2).max(160),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please write a short context note (2–160 characters).' });
        return;
      }

      const store = getStore();
      const annotation: ChartAnnotation = {
        id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: parsed.data.timestamp,
        dateKey: toAnnotationDateKey(parsed.data.timestamp),
        metric: parsed.data.metric,
        category: parsed.data.category ?? inferAnnotationCategory(parsed.data.note),
        note: parsed.data.note,
        createdAt: new Date().toISOString(),
        createdBy: req.user?.name ?? 'Member',
      };
      store.chartAnnotations = [annotation, ...store.chartAnnotations.slice(0, 99)];
      saveStore(store);
      res.status(201).json({ annotation, annotations: store.chartAnnotations });
    }
  );

  app.delete(
    '/api/annotations/:id',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const store = getStore();
      const prevLen = store.chartAnnotations.length;
      store.chartAnnotations = store.chartAnnotations.filter((a) => a.id !== req.params.id);
      if (store.chartAnnotations.length === prevLen) {
        res.status(404).json({ error: 'Context note not found.' });
        return;
      }
      saveStore(store);
      res.json({ removed: true, annotations: store.chartAnnotations });
    }
  );

  // =========================================================
  // 9. SYMPTOM LOGGER ENDPOINTS
  // =========================================================

  app.get('/api/symptoms', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareAiInsights) {
      res.json({ restrictedByConsent: true, symptomLogs: [] });
      return;
    }
    res.json({ restrictedByConsent: false, symptomLogs: store.symptomLogs });
  });

  app.post(
    '/api/symptoms',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        symptom: z.string().trim().min(2).max(80),
        severity: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
        ]),
        timestamp: z.string().min(4).max(80).optional(),
        dateKey: z.string().min(8).max(20).optional(),
        activityContext: z.string().trim().max(120).optional(),
        note: z.string().trim().max(240).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please select or enter a feeling and intensity (1–5).' });
        return;
      }

      const store = getStore();
      const latestReadingTs =
        store.readings[store.readings.length - 1]?.timestamp ?? new Date().toISOString();
      const timestamp = parsed.data.timestamp ?? latestReadingTs;
      const dateKey = parsed.data.dateKey || toAnnotationDateKey(timestamp);
      const biometricContext = findNearestBiometricContext(store.readings, dateKey);

      const entry: SymptomLog = {
        id: `sym_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        dateKey,
        symptom: parsed.data.symptom,
        severity: parsed.data.severity as SymptomSeverity,
        biometricContext,
        activityContext: parsed.data.activityContext || undefined,
        note: parsed.data.note || undefined,
        createdAt: new Date().toISOString(),
        createdBy: req.user?.name ?? 'Member',
      };

      store.symptomLogs = [entry, ...store.symptomLogs.slice(0, 119)];
      saveStore(store);
      res.status(201).json({ symptomLog: entry, symptomLogs: store.symptomLogs });
    }
  );

  app.delete(
    '/api/symptoms/:id',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const store = getStore();
      const prevLen = store.symptomLogs.length;
      store.symptomLogs = store.symptomLogs.filter((s) => s.id !== req.params.id);
      if (store.symptomLogs.length === prevLen) {
        res.status(404).json({ error: 'Symptom entry not found.' });
        return;
      }
      saveStore(store);
      res.json({ removed: true, symptomLogs: store.symptomLogs });
    }
  );
}

