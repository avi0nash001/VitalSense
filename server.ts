import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  assessLatestMetrics,
  computeOverallBaselineSummary,
  sortReadingsChronologically,
} from './src/lib/vitalsEngine.ts';
import { parseWearableCsv } from './src/lib/csvParser.ts';
import { generateScenarioReadings } from './src/lib/simulator.ts';
import { getDemoPersona } from './src/lib/demoPersonas.ts';
import { buildSevenDayBiometricWindow } from './src/lib/weeklySummary.ts';
import { buildVoiceHealthContextPrompt } from './src/lib/voiceAssistant.ts';
import type { ScenarioId, UserProfile } from './src/lib/types.ts';
import {
  generateGeminiInsightExplanation,
  generateMultilingualVoiceTextReply,
  generateSimpleHealthChatReply,
  generateWeeklyCaregiverSummary,
} from './server/geminiService.ts';
import {
  attachVoiceWebSocketServer,
  buildLiveVoiceContextSnapshot,
  issueVoiceWsTicket,
} from './server/voiceLiveService.ts';
import {
  computeStoreBaselines,
  getStore,
  recomputeStoreAnalysis,
  registerNewMemberAccount,
  resetStoreToDemo,
  saveStore,
  verifyPassword,
} from './server/store.ts';
import { registerV2Routes } from './server/routesV2.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

function signSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: string;
      exp: number;
    };
    if (!parsed.uid || Date.now() > parsed.exp) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

function toPublicProfile(account: UserProfile): UserProfile {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    avatarUrl: account.avatarUrl,
    relationOrTitle: account.relationOrTitle,
  };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const uid = verifySessionToken(token);
  if (!uid) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }
  const store = getStore();
  const account = store.accounts.find((a) => a.id === uid);
  if (!account) {
    res.status(401).json({ error: 'Account not found' });
    return;
  }
  req.user = toPublicProfile(account);
  next();
}

function requireMember(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'member') {
    res.status(403).json({ error: 'Member permissions required for this action' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'vitalsense-api' });
  });

  // Auth routes
  app.post('/api/auth/login', (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(4),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid email and password.' });
      return;
    }

    const store = getStore();
    const account = store.accounts.find(
      (a) => a.email.toLowerCase() === parsed.data.email.trim().toLowerCase()
    );
    if (!account || !verifyPassword(parsed.data.password, account)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signSessionToken(account.id);
    res.json({ token, user: toPublicProfile(account) });
  });

  app.post('/api/auth/demo', (req, res) => {
    const schema = z.object({
      role: z.enum(['member', 'caregiver']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Specify role: member or caregiver' });
      return;
    }
    const store = getStore();
    const targetId =
      parsed.data.role === 'caregiver' ? 'user_caregiver_sarah' : 'user_member_elena';
    const account = store.accounts.find((a) => a.id === targetId) ?? store.accounts[0];
    const token = signSessionToken(account.id);
    res.json({ token, user: toPublicProfile(account) });
  });

  app.post('/api/auth/register', (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80),
      email: z.string().email(),
      password: z.string().min(6).max(128),
      role: z.enum(['member', 'caregiver']).default('member'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please check your registration details.' });
      return;
    }
    try {
      const account = registerNewMemberAccount(parsed.data);
      const token = signSessionToken(account.id);
      res.status(201).json({ token, user: toPublicProfile(account) });
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Unable to register account.',
      });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // Public landing preview summary (synthetic preview figures only, never private user data)
  app.get('/api/public/preview', (_req, res) => {
    const previewReadings = generateScenarioReadings(
      'gradual_drift',
      '2026-11-21T07:15:00.000Z',
      'synthetic'
    );
    const baselines = computeStoreBaselines({
      ...getStore(),
      readings: previewReadings,
    });
    const snapshots = assessLatestMetrics(previewReadings, baselines);
    res.json({
      sourceLabel: 'Synthetic Product Preview',
      readings: previewReadings.slice(-14),
      snapshots,
      baselineSummary: computeOverallBaselineSummary(baselines),
    });
  });

  // Workspace overview (Dashboard)
  app.get('/api/workspace/overview', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    const isCaregiver = req.user?.role === 'caregiver';
    const baselines = computeStoreBaselines(store);
    const baselineSummary = computeOverallBaselineSummary(baselines);
    const sortedReadings = sortReadingsChronologically(store.readings);
    const latestSnapshots = assessLatestMetrics(sortedReadings, baselines);

    const memberAccount =
      store.accounts.find((a) => a.role === 'member') ?? store.accounts[0];

    res.json({
      memberProfile: {
        name: memberAccount.name,
        avatarUrl: memberAccount.avatarUrl,
        wearableDeviceName: store.preferences.wearableDeviceName,
      },
      activeScenario: store.activeScenario,
      lastUpdated: store.lastUpdated,
      consent: store.consent,
      preferences: store.preferences,
      baselineSummary:
        isCaregiver && !store.consent.shareBaselineProgress ? null : baselineSummary,
      baselines: isCaregiver && !store.consent.shareBaselineProgress ? null : baselines,
      latestSnapshots:
        isCaregiver && !store.consent.shareVitalTrends ? [] : latestSnapshots,
      readings:
        isCaregiver && !store.consent.shareVitalTrends ? [] : sortedReadings.slice(-30),
      recentChanges:
        isCaregiver && !store.consent.shareTimelineDetails
          ? []
          : store.timelineEvents.slice(0, 4),
      recentInsights:
        isCaregiver && !store.consent.shareAiInsights ? [] : store.insights.slice(0, 3),
      recentAlerts: store.alerts.slice(0, 8),
      smartAlertThresholds: store.smartAlertThresholds,
      chartAnnotations: store.chartAnnotations,
      realtimeDeviations: store.realtimeDeviations.slice(0, 10),
      symptomLogs: isCaregiver && !store.consent.shareAiInsights ? [] : store.symptomLogs,
    });
  });

  // Health Change Timeline
  app.get('/api/timeline', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareTimelineDetails) {
      res.json({
        restrictedByConsent: true,
        events: [],
        consent: store.consent,
      });
      return;
    }
    res.json({
      restrictedByConsent: false,
      events: store.timelineEvents,
      consent: store.consent,
    });
  });

  // Baseline page
  app.get('/api/baseline', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareBaselineProgress) {
      res.json({
        restrictedByConsent: true,
        baselines: null,
        summary: null,
        readings: [],
      });
      return;
    }
    const baselines = computeStoreBaselines(store);
    const summary = computeOverallBaselineSummary(baselines);
    res.json({
      restrictedByConsent: false,
      baselines,
      summary,
      readings: sortReadingsChronologically(store.readings),
      preferences: store.preferences,
      activeScenario: store.activeScenario,
    });
  });

  // AI Insights
  app.get('/api/insights', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareAiInsights) {
      res.json({
        restrictedByConsent: true,
        insights: [],
        timelineEvents: [],
        readings: [],
        baselines: null,
        chartAnnotations: [],
        symptomLogs: [],
      });
      return;
    }
    const sortedReadings = sortReadingsChronologically(store.readings);
    const baselines = computeStoreBaselines(store);
    res.json({
      restrictedByConsent: false,
      insights: store.insights,
      timelineEvents: store.timelineEvents,
      readings: sortedReadings.slice(-21),
      baselines,
      chartAnnotations: store.chartAnnotations,
      symptomLogs: store.symptomLogs,
    });
  });

  app.post(
    '/api/insights/:id/explain',
    requireAuth,
    requireMember,
    async (req: AuthenticatedRequest, res) => {
      const store = getStore();
      const insight = store.insights.find((i) => i.id === req.params.id);
      if (!insight) {
        res.status(404).json({ error: 'Insight not found' });
        return;
      }

      const linkedEvent = store.timelineEvents.find(
        (e) => e.id === insight.timelineEventId
      );

      try {
        const analysis = await generateGeminiInsightExplanation(insight, linkedEvent);
        insight.geminiAnalysis = analysis;
        insight.lastError = null;
        saveStore(store);
        res.json({ insight });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to reach Gemini API.';
        insight.lastError = message;
        saveStore(store);
        res.status(502).json({ error: message, insight });
      }
    }
  );

  app.post('/api/insights/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      question: z.string().min(2).max(500),
      history: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            text: z.string().max(1200),
          })
        )
        .max(12)
        .default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a brief question about your health trends.' });
      return;
    }

    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareAiInsights) {
      res.status(403).json({
        error: 'The member has paused sharing AI insights with caregivers.',
      });
      return;
    }

    const sortedReadings = sortReadingsChronologically(store.readings);
    const baselines = computeStoreBaselines(store);
    const memberAccount =
      store.accounts.find((a) => a.role === 'member') ?? store.accounts[0];
    const latest = sortedReadings[sortedReadings.length - 1];
    const sleepVals = sortedReadings
      .map((r) => r.sleepHours)
      .filter((v): v is number => typeof v === 'number');
    const stepVals = sortedReadings
      .map((r) => r.steps)
      .filter((v): v is number => typeof v === 'number');

    const avgSleepHours =
      sleepVals.length > 0
        ? Number((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1))
        : null;
    const avgSteps =
      stepVals.length > 0
        ? Math.round(stepVals.reduce((a, b) => a + b, 0) / stepVals.length)
        : null;

    try {
      const answer = await generateSimpleHealthChatReply({
        question: parsed.data.question.trim(),
        history: parsed.data.history,
        healthSummary: {
          memberName: memberAccount.name,
          latestHeartRate: latest?.heartRate,
          baselineHeartRate: baselines.heartRate.mean,
          latestSpo2: latest?.spo2,
          baselineSpo2: baselines.spo2.mean,
          recentSleepHours: latest?.sleepHours ?? null,
          avgSleepHours,
          recentSteps: latest?.steps ?? null,
          avgSteps,
          activeChanges: store.timelineEvents.slice(0, 3).map((e) => ({
            metricLabel: e.metricLabel,
            deltaText: e.deltaText,
            durationDays: e.durationDays,
            summary: e.supportingEvidence.summary,
          })),
          recentAlerts: store.alerts.slice(0, 3).map((a) => ({
            title: a.title,
            evidenceSummary: a.evidenceSummary,
            status: a.status,
          })),
          recentSymptoms: store.symptomLogs.slice(0, 5).map((s) => ({
            dateKey: s.dateKey,
            symptom: s.symptom,
            severity: s.severity,
            activityContext: s.activityContext,
          })),
        },
      });
      res.json({ reply: answer, answer });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to reach Gemini API right now.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/dashboard/weekly-summary', requireAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      personaId: z.enum(['elena', 'arjun', 'maya', 'live']).default('live'),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid weekly summary request.' });
      return;
    }

    const store = getStore();
    if (req.user?.role === 'caregiver' && !store.consent.shareAiInsights) {
      res.status(403).json({
        error: 'The member has paused sharing AI summaries with caregivers.',
      });
      return;
    }

    const isDemoPersona = parsed.data.personaId !== 'live';
    const demo = isDemoPersona
      ? getDemoPersona(parsed.data.personaId as 'elena' | 'arjun' | 'maya')
      : null;

    const memberAccount =
      store.accounts.find((a) => a.role === 'member') ?? store.accounts[0];

    const windowData = buildSevenDayBiometricWindow({
      memberName: demo ? demo.name : memberAccount.name,
      readings: demo ? demo.readings : store.readings,
      baselines: demo ? demo.baselines : computeStoreBaselines(store),
      alerts: demo ? demo.recentAlerts : store.alerts,
      symptoms: store.symptomLogs,
    });

    try {
      const report = await generateWeeklyCaregiverSummary(windowData);
      res.json({ report });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to generate weekly summary right now.';
      res.status(502).json({ error: message });
    }
  });

  // Alerts & Caregiver workflows
  app.get('/api/alerts', requireAuth, (_req: AuthenticatedRequest, res) => {
    const store = getStore();
    res.json({
      alerts: store.alerts,
      consent: store.consent,
    });
  });

  app.post('/api/alerts/:id/acknowledge', requireAuth, (req: AuthenticatedRequest, res) => {
    const store = getStore();
    const alert = store.alerts.find((a) => a.id === req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    const now = new Date().toISOString();
    const actor = req.user?.name ?? 'Authorized Caregiver';

    alert.status = alert.status === 'resolved' ? 'resolved' : 'acknowledged';
    alert.acknowledgement = {
      acknowledged: true,
      by: actor,
      at: now,
    };

    const linkedEvent = store.timelineEvents.find(
      (e) => e.id === alert.timelineEventId
    );
    if (linkedEvent) {
      linkedEvent.caregiverAck = {
        ...linkedEvent.caregiverAck,
        acknowledged: true,
        acknowledgedBy: actor,
        acknowledgedAt: now,
      };
    }

    saveStore(store);
    res.json({ alert });
  });

  app.post('/api/alerts/:id/followup', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      status: z.enum(['scheduled', 'completed']),
      note: z.string().min(3).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please include a follow-up status and a brief note (min 3 characters).' });
      return;
    }

    const store = getStore();
    const alert = store.alerts.find((a) => a.id === req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    const now = new Date().toISOString();
    const actor = req.user?.name ?? 'Authorized Caregiver';

    alert.acknowledgement = {
      acknowledged: true,
      by: alert.acknowledgement.by ?? actor,
      at: alert.acknowledgement.at ?? now,
    };
    alert.status = parsed.data.status === 'completed' ? 'resolved' : 'acknowledged';
    alert.followUp = {
      status: parsed.data.status,
      note: parsed.data.note.trim(),
      updatedAt: now,
      updatedBy: actor,
    };

    const linkedEvent = store.timelineEvents.find(
      (e) => e.id === alert.timelineEventId
    );
    if (linkedEvent) {
      linkedEvent.caregiverAck = {
        acknowledged: true,
        acknowledgedBy: alert.acknowledgement.by,
        acknowledgedAt: alert.acknowledgement.at,
        followUpNote: parsed.data.note.trim(),
        followUpStatus: parsed.data.status === 'completed' ? 'completed' : 'in_progress',
      };
      if (parsed.data.status === 'completed') {
        linkedEvent.status = 'resolved';
      }
    }

    saveStore(store);
    res.json({ alert });
  });

  // Data Lab: CSV Upload + Synthetic Scenario Simulator
  app.post(
    '/api/data-lab/upload-csv',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        csvText: z.string().min(10).max(500_000),
        mode: z.enum(['replace', 'merge']).default('merge'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid CSV payload.' });
        return;
      }

      const result = parseWearableCsv(parsed.data.csvText);
      if (result.validRows.length === 0) {
        res.status(422).json({
          error: 'No valid biometric rows were found in the uploaded CSV.',
          parseResult: result,
        });
        return;
      }

      const store = getStore();
      if (parsed.data.mode === 'replace') {
        store.readings = result.validRows;
      } else {
        const existingRealOrDemo = store.readings.filter((r) => r.source !== 'synthetic');
        const mapByDay = new Map<string, typeof result.validRows[number]>();
        for (const r of existingRealOrDemo) {
          mapByDay.set(r.timestamp.slice(0, 10), r);
        }
        for (const r of result.validRows) {
          mapByDay.set(r.timestamp.slice(0, 10), r);
        }
        store.readings = sortReadingsChronologically(Array.from(mapByDay.values()));
      }
      store.activeScenario = 'csv_upload';
      store.timelineEvents = [];
      store.insights = [];
      store.alerts = [];
      recomputeStoreAnalysis(store);

      res.json({
        parseResult: result,
        readingCount: store.readings.length,
        timelineCount: store.timelineEvents.length,
      });
    }
  );

  app.post(
    '/api/data-lab/simulate',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        scenarioId: z.enum([
          'stable',
          'gradual_drift',
          'noisy_missing',
          'isolated_anomaly',
          'multi_metric',
        ]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Unknown simulation scenario.' });
        return;
      }

      const store = getStore();
      const simulated = generateScenarioReadings(
        parsed.data.scenarioId as ScenarioId,
        '2026-11-21T07:15:00.000Z',
        'synthetic'
      );
      store.readings = simulated;
      store.activeScenario = parsed.data.scenarioId;
      store.timelineEvents = [];
      store.insights = [];
      store.alerts = [];
      recomputeStoreAnalysis(store);

      res.json({
        scenarioId: parsed.data.scenarioId,
        readingsCount: simulated.length,
        detectedChangesCount: store.timelineEvents.length,
        alertsCount: store.alerts.length,
        readings: simulated,
      });
    }
  );

  app.post(
    '/api/data-lab/reset-demo',
    requireAuth,
    requireMember,
    (_req: AuthenticatedRequest, res) => {
      const fresh = resetStoreToDemo();
      res.json({
        activeScenario: fresh.activeScenario,
        readingsCount: fresh.readings.length,
      });
    }
  );

  // Settings & Consent
  app.patch(
    '/api/settings/consent',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        shareVitalTrends: z.boolean().optional(),
        shareBaselineProgress: z.boolean().optional(),
        shareTimelineDetails: z.boolean().optional(),
        shareAiInsights: z.boolean().optional(),
        notifyCaregiverOnAlerts: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid consent settings payload.' });
        return;
      }
      const store = getStore();
      store.consent = { ...store.consent, ...parsed.data };
      saveStore(store);
      res.json({ consent: store.consent });
    }
  );

  app.patch(
    '/api/settings/preferences',
    requireAuth,
    requireMember,
    (req: AuthenticatedRequest, res) => {
      const schema = z.object({
        restingHeartRateSensitivity: z
          .enum(['balanced', 'sensitive', 'conservative'])
          .optional(),
        baselineWindowDays: z.number().int().min(7).max(30).optional(),
        wearableDeviceName: z.string().min(2).max(80).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid preferences payload.' });
        return;
      }
      const store = getStore();
      store.preferences = { ...store.preferences, ...parsed.data };
      recomputeStoreAnalysis(store);
      res.json({ preferences: store.preferences });
    }
  );

  // VITALSENSE 2.0 Modular Routes
  registerV2Routes(app, { requireAuth, requireMember });

  // Multilingual Voice Assistant Routes (Gemini Live WebSocket ticket + text fallback)
  app.get('/api/voice/context', requireAuth, (req: AuthenticatedRequest, res) => {
    const role = req.user?.role ?? 'member';
    const snapshot = buildLiveVoiceContextSnapshot(role);
    const restrictedVitals = role === 'caregiver' && !snapshot.consent.shareVitalTrends;
    res.json({
      memberName: snapshot.memberName,
      viewerRole: snapshot.viewerRole,
      wearableDeviceName: snapshot.wearableDeviceName,
      lastUpdated: snapshot.lastUpdated,
      restrictedVitals,
      latestReading: restrictedVitals ? null : snapshot.latestReading,
      baselines:
        role === 'caregiver' && !snapshot.consent.shareBaselineProgress
          ? null
          : snapshot.baselines,
      activeAlertCount: snapshot.alerts.filter((a) => a.status !== 'resolved').length,
      symptomCount:
        role === 'caregiver' && !snapshot.consent.shareAiInsights
          ? 0
          : snapshot.symptomLogs.length,
    });
  });

  app.post('/api/voice/session-token', requireAuth, (req: AuthenticatedRequest, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'Live voice needs a configured GEMINI_API_KEY in Settings > Secrets. You can configure the key and tap the microphone again.',
      });
      return;
    }
    const userId = req.user?.id ?? 'user_member_elena';
    const role = req.user?.role ?? 'member';
    const ticket = issueVoiceWsTicket(userId, role);
    res.json({
      ticket,
      wsPath: '/ws/voice',
      model: 'gemini-3.8-live',
    });
  });

  app.post('/api/voice/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      message: z.string().min(1).max(800),
      history: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            text: z.string().max(1500),
          })
        )
        .max(12)
        .default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a brief question or message.' });
      return;
    }

    const role = req.user?.role ?? 'member';
    const snapshot = buildLiveVoiceContextSnapshot(role);
    const systemInstruction = buildVoiceHealthContextPrompt(snapshot);

    try {
      const reply = await generateMultilingualVoiceTextReply({
        message: parsed.data.message.trim(),
        history: parsed.data.history,
        systemInstruction,
      });
      res.json({ reply });
    } catch (err) {
      let msg =
        err instanceof Error ? err.message : 'Unable to reach Gemini API right now.';
      if (msg.trim().startsWith('{')) {
        try {
          const parsedErr = JSON.parse(msg) as { error?: { message?: string } };
          if (parsedErr?.error?.message) {
            msg = parsedErr.error.message;
          }
        } catch {
          // Keep original message if not valid JSON
        }
      }
      res.status(502).json({ error: msg });
    }
  });

  // Vite dev middleware or production static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`VITALSENSE server listening on http://0.0.0.0:${port}`);
  });
  attachVoiceWebSocketServer(server);
}

startServer().catch((err) => {
  console.error('Failed to start VITALSENSE server:', err);
  process.exit(1);
});
