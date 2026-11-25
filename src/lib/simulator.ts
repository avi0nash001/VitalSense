import type { ScenarioId, VitalReading } from './types.ts';

export interface SimulationScenarioMeta {
  id: ScenarioId;
  title: string;
  subtitle: string;
  description: string;
  expectedBehavior: string;
}

export const SIMULATION_SCENARIOS: SimulationScenarioMeta[] = [
  {
    id: 'stable',
    title: 'Steady Normal Week',
    subtitle: '21 days · Consistent overnight wearable readings',
    description:
      'Shows normal day-to-day ups and downs in heart rate, blood oxygen, sleep, and steps around a calm personal baseline.',
    expectedBehavior: 'All readings stay inside your normal range with no alerts.',
  },
  {
    id: 'gradual_drift',
    title: 'Gradual Multi-Day Change',
    subtitle: '21 days · Steady 6-day rise in heart rate with shorter sleep',
    description:
      'Models a gradual upward shift in resting heart rate (+6.2 bpm) and temperature (+0.48°C) along with slightly shorter sleep and fewer daily steps.',
    expectedBehavior: 'Notices the multi-day shift, builds a timeline, and shares a clear alert.',
  },
  {
    id: 'noisy_missing',
    title: 'Missing Windows & Loose Strap',
    subtitle: '21 days · Occasional gaps and low-quality readings',
    description:
      'Models skipped nights and loose-strap motion so the system filters low-quality data instead of raising false alerts.',
    expectedBehavior: 'Marks lower data quality clearly without creating false warnings.',
  },
  {
    id: 'isolated_anomaly',
    title: 'Single-Night Spike',
    subtitle: '21 days · One unusual night that returns to normal',
    description:
      'Models a single high heart rate night (+11 bpm) followed immediately by a return to normal.',
    expectedBehavior: 'Treats a one-off reading calmly without raising a multi-day alert.',
  },
  {
    id: 'multi_metric',
    title: 'Multi-Channel Health Shift',
    subtitle: '21 days · Linked changes in heart rate, SpO2, sleep, and activity',
    description:
      'Models steady changes across resting heart rate, breathing, blood oxygen, sleep, and daily steps over 5 days.',
    expectedBehavior: 'Creates a priority caregiver alert with plain-English evidence.',
  },
];

// Deterministic pseudo-random helper so simulations are repeatable
function seededNoise(index: number, salt: number): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1; // -1 to 1
}

export function generateScenarioReadings(
  scenarioId: ScenarioId,
  endDateIso = '2026-11-21T07:15:00.000Z',
  source: 'synthetic' | 'baseline_demo' = 'synthetic'
): VitalReading[] {
  const endMs = new Date(endDateIso).getTime();
  const totalDays = 21;
  const readings: VitalReading[] = [];

  for (let dayOffset = totalDays - 1; dayOffset >= 0; dayOffset--) {
    const idx = totalDays - 1 - dayOffset;
    const ts = new Date(endMs - dayOffset * 24 * 60 * 60 * 1000).toISOString();

    let hr = 61.5 + seededNoise(idx, 1) * 1.8;
    let spo2 = 97.8 + seededNoise(idx, 2) * 0.4;
    let temp = 36.45 + seededNoise(idx, 3) * 0.12;
    let resp = 14.6 + seededNoise(idx, 4) * 0.5;
    let hrv = 54.0 + seededNoise(idx, 5) * 3.2;
    let sleepHours = 7.4 + seededNoise(idx, 7) * 0.35;
    let steps = 7600 + seededNoise(idx, 8) * 650;
    let qualityScore = 94 + Math.round(seededNoise(idx, 6) * 4);
    let note: string | undefined;

    if (scenarioId === 'gradual_drift') {
      // Last 6 days gradually drift
      if (idx >= 15) {
        const step = idx - 14; // 1..6
        hr += step * 1.15;
        temp += step * 0.085;
        hrv -= step * 1.9;
        resp += step * 0.25;
        sleepHours -= step * 0.15;
        steps -= step * 210;
        note = `Gradual change day ${step} of 6`;
      }
    } else if (scenarioId === 'noisy_missing') {
      if (idx === 4 || idx === 11 || idx === 17) {
        // Missing window day: skip reading altogether
        continue;
      }
      if (idx === 8 || idx === 15 || idx === 19) {
        qualityScore = 52;
        hr += seededNoise(idx, 9) * 8;
        spo2 -= 1.2;
        steps -= 1100;
        note = 'Loose wrist strap or extra movement overnight';
      } else {
        qualityScore = 76;
      }
    } else if (scenarioId === 'isolated_anomaly') {
      if (idx === 17) {
        hr += 11.4;
        hrv -= 9.5;
        sleepHours -= 1.1;
        note = 'Single unusual night before returning to normal';
      }
    } else if (scenarioId === 'multi_metric') {
      if (idx >= 16) {
        const step = idx - 15; // 1..5
        hr += step * 1.7;
        resp += step * 0.52;
        temp += step * 0.12;
        spo2 -= step * 0.36;
        hrv -= step * 2.6;
        sleepHours -= step * 0.24;
        steps -= step * 420;
        note = `Multi-metric change day ${step} of 5`;
      }
    }

    readings.push({
      id: `${source}_${scenarioId}_${idx}`,
      timestamp: ts,
      source,
      qualityScore: Math.max(40, Math.min(100, qualityScore)),
      heartRate: Math.round(hr * 10) / 10,
      spo2: Math.min(100, Math.round(spo2 * 10) / 10),
      temperature: Math.round(temp * 100) / 100,
      respiratoryRate: Math.round(resp * 10) / 10,
      hrv: Math.max(15, Math.round(hrv * 10) / 10),
      sleepHours: Math.max(3.5, Math.round(sleepHours * 10) / 10),
      steps: Math.max(1200, Math.round(steps)),
      note,
    });
  }

  return readings;
}

export const SAMPLE_WEARABLE_CSV = `timestamp,heart_rate,spo2,temperature,respiratory_rate,hrv,sleep_hours,steps,quality_score
2026-11-10T07:10:00Z,61.8,97.9,36.44,14.5,54.2,7.5,7850,96
2026-11-11T07:12:00Z,62.1,98.0,36.46,14.7,53.8,7.4,7420,95
2026-11-12T07:08:00Z,61.4,97.8,36.42,14.4,55.1,7.6,8120,97
2026-11-13T07:15:00Z,62.9,97.7,36.49,14.8,52.4,7.0,6950,94
2026-11-14T07:11:00Z,63.7,97.6,36.55,15.0,50.8,6.7,6420,95
2026-11-15T07:09:00Z,64.8,97.4,36.63,15.3,48.6,6.4,5880,93
2026-11-16T07:14:00Z,66.2,97.2,36.74,15.7,46.1,6.1,5210,94
2026-11-17T07:18:00Z,67.5,97.0,36.82,16.0,44.5,5.9,4650,95`;
