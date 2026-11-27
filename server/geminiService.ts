import { GoogleGenAI, Type } from '@google/genai';
import type { AIInsight, GeminiAnalysisBlock, TimelineEvent } from '../src/lib/types.ts';
import type {
  SevenDayBiometricWindow,
  WeeklySummaryReport,
} from '../src/lib/weeklySummary.ts';

const SYSTEM_INSTRUCTION = `You are a friendly, clear health-pattern assistant inside VITALSENSE, a wearable early-warning system.
Explain changes in heart rate, blood oxygen (SpO2), sleep, and daily steps in simple, everyday English based ONLY on the numbers provided.

STRICT RULES:
1. NEVER diagnose, name, or suggest any medical condition, illness, infection, or syndrome.
2. NEVER prescribe medications, supplements, or medical treatments.
3. Compare readings strictly to the user's own personal normal baseline rather than calling them medically abnormal.
4. Keep sentences short, calm, clear, and easy for everyday users and family caregivers to understand.`;

export async function generateGeminiInsightExplanation(
  insight: AIInsight,
  timelineEvent?: TimelineEvent
): Promise<GeminiAnalysisBlock> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Add a valid key in Settings > Secrets to generate live Gemini explanations.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const evidenceContext = {
    title: insight.title,
    metric: insight.metricLabel,
    whatChanged: insight.whatChanged,
    baselineComparison: insight.baselineComparison,
    durationAndTrend: insight.durationAndTrend,
    supportingMeasurements: insight.supportingMeasurements,
    dataSource: insight.source === 'synthetic' ? 'Sample Simulation' : 'Wearable Log',
    timelineDetails: timelineEvent
      ? {
          durationDays: timelineEvent.durationDays,
          consistencyPct: timelineEvent.supportingEvidence.consistencyPct,
          dataQualityAvg: timelineEvent.supportingEvidence.dataQualityAvg,
        }
      : undefined,
  };

  const prompt = `Explain this wearable health trend in simple, everyday English without medical jargon:

Measured Evidence:
${JSON.stringify(evidenceContext, null, 2)}

Provide:
- summary: 2 short, friendly sentences summarizing what changed compared to their normal range.
- patternExplanation: 1 short paragraph explaining why multi-day shifts matter more than a single unusual night, using only the numbers above.
- nonDiagnosticNextSteps: 3 practical, everyday next steps (such as resting, drinking water, checking wearable fit, or sharing the summary with a doctor if it keeps going).
- clinicianQuestions: 2 simple questions they could ask a doctor or nurse if they choose to check in.
- disclaimer: 1 clear sentence stating this is informational only and not a medical diagnosis.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          patternExplanation: { type: Type.STRING },
          nonDiagnosticNextSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          clinicianQuestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          disclaimer: { type: Type.STRING },
        },
        required: [
          'summary',
          'patternExplanation',
          'nonDiagnosticNextSteps',
          'clinicianQuestions',
          'disclaimer',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }

  const parsed = JSON.parse(rawText) as Omit<GeminiAnalysisBlock, 'generatedAt' | 'model'>;

  return {
    generatedAt: new Date().toISOString(),
    model: 'gemini-4-hydrogen',
    summary: parsed.summary,
    patternExplanation: parsed.patternExplanation,
    nonDiagnosticNextSteps: parsed.nonDiagnosticNextSteps.slice(0, 4),
    clinicianQuestions: parsed.clinicianQuestions.slice(0, 3),
    disclaimer: parsed.disclaimer,
  };
}

export async function generateSimpleHealthChatReply(params: {
  question: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  healthSummary: {
    memberName: string;
    latestHeartRate?: number;
    baselineHeartRate?: number | null;
    latestSpo2?: number;
    baselineSpo2?: number | null;
    recentSleepHours?: number | null;
    avgSleepHours?: number | null;
    recentSteps?: number | null;
    avgSteps?: number | null;
    activeChanges: { metricLabel: string; deltaText: string; durationDays: number; summary: string }[];
    recentAlerts: { title: string; evidenceSummary: string; status: string }[];
    recentSymptoms?: { dateKey: string; symptom: string; severity: number; activityContext?: string }[];
  };
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Add a valid key in Settings > Secrets to ask live questions.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const recentConversation = params.history
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const prompt = `Health data summary for ${params.healthSummary.memberName}:
${JSON.stringify(params.healthSummary, null, 2)}

${recentConversation ? `Recent conversation:\n${recentConversation}\n` : ''}User question: "${params.question}"

Answer directly in 2 to 4 short, calm, everyday English sentences using ONLY the numbers in the summary above. Never diagnose a disease, never invent measurements, and remind them calmly when appropriate that this is wearable trend guidance rather than medical advice.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error('Gemini returned an empty answer.');
  }
  return text;
}

const WELLBEING_SYSTEM_INSTRUCTION = `You are a calm, supportive wellbeing reflection companion inside VITALSENSE.
STRICT SAFETY & ETHICAL BOUNDARIES:
1. NEVER claim to be a therapist, counselor, doctor, or replacement for human relationships or professional care.
2. NEVER diagnose depression, anxiety disorders, loneliness, or any medical/psychological condition.
3. NEVER create emotional dependency or manipulative attachment (do not claim exclusive understanding or ask the user to rely solely on you).
4. Respond empathetically, briefly (2-4 sentences), encourage healthy daily routines (rest, gentle hydration, stepping away from screens, breathing), and gently suggest connecting with a trusted friend/family member or qualified professional when distress persists.
5. Never ask for or reference camera/facial expressions.`;

export async function generateSupportiveWellbeingReply(params: {
  message: string;
  recentCheckinSummary?: string;
}): Promise<{ reply: string; suggestedAction?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Add a key in Settings > Secrets to use the live Gemini Wellbeing Companion.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `A member voluntarily shared this wellbeing reflection:
"${params.message}"

Recent self-reported check-in context (user-entered only): ${params.recentCheckinSummary ?? 'None provided'}

Respond calmly and warmly without acting as a therapist or diagnosing any condition.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: WELLBEING_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
          suggestedAction: { type: Type.STRING },
        },
        required: ['reply'],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty wellbeing reflection response.');
  }

  const parsed = JSON.parse(rawText) as { reply: string; suggestedAction?: string };
  return {
    reply: parsed.reply,
    suggestedAction: parsed.suggestedAction,
  };
}

export async function generateWeeklyCaregiverSummary(
  windowData: SevenDayBiometricWindow
): Promise<WeeklySummaryReport> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Add a valid key in Settings > Secrets to generate weekly AI summaries.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const startLabel = windowData.startDate
    ? new Date(windowData.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Recent';
  const endLabel = windowData.endDate
    ? new Date(windowData.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '7 days';
  const periodLabel = `${startLabel} – ${endLabel}`;

  const prompt = `Synthesize the last 7 days of wearable readings for ${windowData.memberName} (${periodLabel}) into a plain-English, non-diagnostic update ready to send by email or text message to a family caregiver.

7-Day Biometric Summary Data & Logged Feelings (use ONLY these figures and entries):
${JSON.stringify(windowData, null, 2)}

Requirements:
- subjectLine: Clear, calm subject line for an email or caregiver message (include ${windowData.memberName}'s first name and "${periodLabel}").
- messageBody: 2 short, friendly paragraphs written in everyday English (no clinical jargon, no Z-scores, no medical diagnoses) summarizing heart rate, SpO2, sleep, daily steps, and any logged physical feelings/symptoms compared to personal baseline.
- keyHighlights: 3 to 4 concise bullet points covering heart rate, blood oxygen, sleep duration, daily steps, and logged feelings from the 7-day data above.
- suggestedCaregiverNote: 1 gentle, practical sentence suggesting how the caregiver can check in or support rest and hydration.
- disclaimer: 1 clear sentence stating this is an informational wearable trend summary and not a medical diagnosis.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subjectLine: { type: Type.STRING },
          messageBody: { type: Type.STRING },
          keyHighlights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          suggestedCaregiverNote: { type: Type.STRING },
          disclaimer: { type: Type.STRING },
        },
        required: [
          'subjectLine',
          'messageBody',
          'keyHighlights',
          'suggestedCaregiverNote',
          'disclaimer',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty weekly summary response.');
  }

  const parsed = JSON.parse(rawText) as {
    subjectLine: string;
    messageBody: string;
    keyHighlights: string[];
    suggestedCaregiverNote: string;
    disclaimer: string;
  };

  return {
    generatedAt: new Date().toISOString(),
    model: 'gemini-4-hydrogen',
    periodLabel,
    subjectLine: parsed.subjectLine,
    messageBody: parsed.messageBody,
    keyHighlights: parsed.keyHighlights.slice(0, 5),
    suggestedCaregiverNote: parsed.suggestedCaregiverNote,
    disclaimer: parsed.disclaimer,
    loggedSymptoms: windowData.loggedSymptoms,
  };
}

export async function generateMultilingualVoiceTextReply(params: {
  message: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  systemInstruction: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Add a valid key in Settings > Secrets to chat with VitalSense.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const recentConversation = params.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'VitalSense'}: ${m.text}`)
    .join('\n');

  const prompt = `${recentConversation ? `Recent conversation:\n${recentConversation}\n\n` : ''}User message: "${params.message}"

Detect the language of the latest user message automatically (supporting Kannada, English, Hindi, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, other supported languages, and mixed-language inputs) and switch languages naturally whenever the user switches. Reply in the exact same language (or language mix) in a warm, simple, clear, and concise manner (2 to 4 short sentences unless they ask for step-by-step details).`;

  const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastError: unknown;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: params.systemInstruction,
        },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('Gemini returned an empty reply.');
      }
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransientOverload =
        msg.includes('503') ||
        msg.toLowerCase().includes('high demand') ||
        msg.toLowerCase().includes('unavailable');
      if (!isTransientOverload) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to reach Gemini API right now.');
}


