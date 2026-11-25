import type { CsvInvalidRow, CsvParseResult, MetricKey, VitalReading } from './types.ts';
import { METRIC_DEFINITIONS } from './vitalsEngine.ts';

const HEADER_ALIASES: Record<string, keyof VitalReading | 'timestamp'> = {
  timestamp: 'timestamp',
  date: 'timestamp',
  datetime: 'timestamp',
  time: 'timestamp',
  recorded_at: 'timestamp',
  heart_rate: 'heartRate',
  heartrate: 'heartRate',
  resting_heart_rate: 'heartRate',
  hr: 'heartRate',
  pulse: 'heartRate',
  spo2: 'spo2',
  blood_oxygen: 'spo2',
  oxygen: 'spo2',
  oxygen_saturation: 'spo2',
  temperature: 'temperature',
  temp: 'temperature',
  skin_temp: 'temperature',
  skin_temperature: 'temperature',
  respiratory_rate: 'respiratoryRate',
  respiratoryrate: 'respiratoryRate',
  resp_rate: 'respiratoryRate',
  breathing_rate: 'respiratoryRate',
  hrv: 'hrv',
  rmssd: 'hrv',
  heart_rate_variability: 'hrv',
  sleep: 'sleepHours',
  sleep_hours: 'sleepHours',
  sleep_duration: 'sleepHours',
  steps: 'steps',
  daily_steps: 'steps',
  step_count: 'steps',
  quality: 'qualityScore',
  quality_score: 'qualityScore',
  data_quality: 'qualityScore',
};

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseWearableCsv(csvText: string): CsvParseResult {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      validRows: [],
      invalidRows: lines.length === 1 ? [{ rowNumber: 1, rawLine: lines[0], reasons: ['CSV contains a header row without data rows.'] }] : [],
      qualitySummary: {
        totalRows: 0,
        validCount: 0,
        invalidCount: 0,
        completenessPct: 0,
        avgQualityScore: 0,
        detectedColumns: [],
      },
    };
  }

  const rawHeaders = splitCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  );
  const mappedFields = rawHeaders.map((h) => HEADER_ALIASES[h] ?? null);
  const detectedColumns = mappedFields.filter(Boolean) as string[];

  const validRows: VitalReading[] = [];
  const invalidRows: CsvInvalidRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cells = splitCsvLine(rawLine);
    const reasons: string[] = [];

    let timestampIso: string | null = null;
    const metrics: Partial<Record<MetricKey, number>> = {};
    let sleepHours: number | undefined;
    let steps: number | undefined;
    let explicitQuality: number | null = null;

    mappedFields.forEach((field, idx) => {
      if (!field) return;
      const cell = cells[idx] ?? '';
      if (cell === '' || cell.toLowerCase() === 'null' || cell.toLowerCase() === 'na') {
        return;
      }

      if (field === 'timestamp') {
        const parsed = new Date(cell);
        if (Number.isNaN(parsed.getTime())) {
          reasons.push(`Invalid timestamp "${cell}"`);
        } else {
          timestampIso = parsed.toISOString();
        }
        return;
      }

      if (field === 'qualityScore') {
        const q = Number(cell);
        if (!Number.isFinite(q) || q < 0 || q > 100) {
          reasons.push(`Quality score "${cell}" must be between 0 and 100`);
        } else {
          explicitQuality = q;
        }
        return;
      }

      if (field === 'sleepHours') {
        const s = Number(cell);
        if (!Number.isFinite(s) || s < 0 || s > 24) {
          reasons.push(`Sleep duration "${cell}" must be between 0 and 24 hours`);
        } else {
          sleepHours = Math.round(s * 10) / 10;
        }
        return;
      }

      if (field === 'steps') {
        const st = Number(cell);
        if (!Number.isFinite(st) || st < 0 || st > 100_000) {
          reasons.push(`Steps value "${cell}" must be between 0 and 100,000`);
        } else {
          steps = Math.round(st);
        }
        return;
      }

      const metricKey = field as MetricKey;
      const def = METRIC_DEFINITIONS[metricKey];
      const num = Number(cell);
      if (!Number.isFinite(num)) {
        reasons.push(`Non-numeric value "${cell}" for ${def.shortLabel}`);
      } else if (num < def.plausibleMin || num > def.plausibleMax) {
        reasons.push(
          `${def.shortLabel} value ${num} ${def.unit} outside plausible sensor range (${def.plausibleMin}-${def.plausibleMax})`
        );
      } else {
        metrics[metricKey] = num;
      }
    });

    if (!timestampIso) {
      if (!reasons.some((r) => r.startsWith('Invalid timestamp'))) {
        reasons.push('Missing required timestamp column value');
      }
    }

    const presentMetricCount = Object.keys(metrics).length;
    const hasActivityOrSleep = sleepHours !== undefined || steps !== undefined;
    if (presentMetricCount === 0 && !hasActivityOrSleep) {
      reasons.push('Row contains no valid wearable values');
    }

    if (reasons.length > 0 || !timestampIso) {
      invalidRows.push({
        rowNumber: i + 1,
        rawLine,
        reasons,
      });
      continue;
    }

    const inferredQuality =
      presentMetricCount > 0
        ? Math.min(100, Math.round((presentMetricCount / 5) * 100))
        : 85;
    validRows.push({
      id: `csv_${i}_${Date.parse(timestampIso)}`,
      timestamp: timestampIso,
      source: 'real_csv',
      qualityScore: explicitQuality ?? inferredQuality,
      ...metrics,
      ...(sleepHours !== undefined ? { sleepHours } : {}),
      ...(steps !== undefined ? { steps } : {}),
    });
  }

  const totalRows = lines.length - 1;
  const completenessPct = totalRows > 0 ? Math.round((validRows.length / totalRows) * 100) : 0;
  const avgQualityScore =
    validRows.length > 0
      ? Math.round(validRows.reduce((s, r) => s + r.qualityScore, 0) / validRows.length)
      : 0;

  return {
    validRows,
    invalidRows,
    qualitySummary: {
      totalRows,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      completenessPct,
      avgQualityScore,
      detectedColumns: Array.from(new Set(detectedColumns)),
    },
  };
}
