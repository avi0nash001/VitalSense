import { jsPDF } from 'jspdf';
import type {
  AlertRecord,
  ChartAnnotation,
  MetricBaseline,
  MetricKey,
  SymptomLog,
  VitalReading,
} from './types';
import { buildThirtyDayCalibrationBand } from './baselineCalibration';
import {
  buildSevenDayBiometricWindow,
  type SevenDayBiometricWindow,
  type WeeklySummaryReport,
} from './weeklySummary';

export interface PdfMetricRow {
  label: string;
  sevenDayAvg: string;
  sevenDayRange: string;
  personalBaseline: string;
  difference: string;
}

export interface PdfChartPoint {
  dateLabel: string;
  rawDate: string;
  value: number;
  hasAnnotation: boolean;
}

export interface PhysicianReportModel {
  fileName: string;
  memberName: string;
  deviceName: string;
  generatedAtLabel: string;
  periodLabel: string;
  windowStats: SevenDayBiometricWindow;
  metricRows: PdfMetricRow[];
  heartRateSeries: PdfChartPoint[];
  heartRateBand: { low: number | null; high: number | null; mean: number | null };
  spo2Series: PdfChartPoint[];
  spo2Band: { low: number | null; high: number | null; mean: number | null };
  annotations: ChartAnnotation[];
  symptoms: SymptomLog[];
  alerts: AlertRecord[];
  narrativeSummary: string;
  keyHighlights: string[];
  disclaimer: string;
}

function formatShortDateLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDiff(val: number | null, unit: string): string {
  if (val === null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val} ${unit}`.trim();
}

export function buildPhysicianReportModel(params: {
  memberName: string;
  deviceName?: string;
  readings: VitalReading[];
  baselines: Record<MetricKey, MetricBaseline> | null;
  alerts: AlertRecord[];
  annotations?: ChartAnnotation[];
  symptoms?: SymptomLog[];
  weeklySummaryReport?: WeeklySummaryReport | null;
}): PhysicianReportModel {
  const windowStats = buildSevenDayBiometricWindow({
    memberName: params.memberName,
    readings: params.readings,
    baselines: params.baselines,
    alerts: params.alerts,
    symptoms: params.symptoms,
  });

  const sorted = [...params.readings].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  const chartSlice = sorted.slice(-14);
  const annotations = params.annotations ?? [];
  const symptoms = params.symptoms ?? [];
  const annDateKeys = new Set([
    ...annotations.map((a) => a.dateKey),
    ...symptoms.map((s) => s.dateKey),
  ]);

  const hrBand = buildThirtyDayCalibrationBand({
    readings: sorted,
    metric: 'heartRate',
    mode: 'typical',
    fallbackBaseline: params.baselines?.heartRate ?? null,
    liveCurrentValue: sorted[sorted.length - 1]?.heartRate ?? null,
  });

  const spo2Band = buildThirtyDayCalibrationBand({
    readings: sorted,
    metric: 'spo2',
    mode: 'typical',
    fallbackBaseline: params.baselines?.spo2 ?? null,
    liveCurrentValue: sorted[sorted.length - 1]?.spo2 ?? null,
  });

  const heartRateSeries: PdfChartPoint[] = chartSlice
    .filter((r) => typeof r.heartRate === 'number' && Number.isFinite(r.heartRate))
    .map((r) => ({
      dateLabel: formatShortDateLabel(r.timestamp),
      rawDate: r.timestamp.slice(0, 10),
      value: r.heartRate as number,
      hasAnnotation: annDateKeys.has(r.timestamp.slice(0, 10)),
    }));

  const spo2Series: PdfChartPoint[] = chartSlice
    .filter((r) => typeof r.spo2 === 'number' && Number.isFinite(r.spo2))
    .map((r) => ({
      dateLabel: formatShortDateLabel(r.timestamp),
      rawDate: r.timestamp.slice(0, 10),
      value: r.spo2 as number,
      hasAnnotation: annDateKeys.has(r.timestamp.slice(0, 10)),
    }));

  const periodLabel =
    windowStats.startDate && windowStats.endDate
      ? `${formatShortDateLabel(windowStats.startDate)} – ${formatShortDateLabel(windowStats.endDate)}`
      : 'Last 7 days';

  const metricRows: PdfMetricRow[] = [
    {
      label: 'Resting Heart Rate',
      sevenDayAvg: windowStats.heartRate.avg !== null ? `${windowStats.heartRate.avg} bpm` : '—',
      sevenDayRange:
        windowStats.heartRate.min !== null && windowStats.heartRate.max !== null
          ? `${windowStats.heartRate.min} – ${windowStats.heartRate.max} bpm`
          : '—',
      personalBaseline:
        windowStats.heartRate.baselineMean !== null
          ? `${windowStats.heartRate.baselineMean} bpm`
          : 'Learning',
      difference: formatDiff(windowStats.heartRate.deltaFromBaseline, 'bpm'),
    },
    {
      label: 'Blood Oxygen (SpO₂)',
      sevenDayAvg: windowStats.spo2.avg !== null ? `${windowStats.spo2.avg}%` : '—',
      sevenDayRange:
        windowStats.spo2.min !== null && windowStats.spo2.max !== null
          ? `${windowStats.spo2.min}% – ${windowStats.spo2.max}%`
          : '—',
      personalBaseline:
        windowStats.spo2.baselineMean !== null ? `${windowStats.spo2.baselineMean}%` : 'Learning',
      difference: formatDiff(windowStats.spo2.deltaFromBaseline, '%'),
    },
    {
      label: 'Sleep Duration',
      sevenDayAvg:
        windowStats.sleepHours.avg !== null ? `${windowStats.sleepHours.avg} hrs/night` : '—',
      sevenDayRange:
        windowStats.sleepHours.min !== null && windowStats.sleepHours.max !== null
          ? `${windowStats.sleepHours.min} – ${windowStats.sleepHours.max} hrs`
          : '—',
      personalBaseline:
        windowStats.sleepHours.baselineMean !== null
          ? `${windowStats.sleepHours.baselineMean} hrs`
          : '7.2 hrs',
      difference: formatDiff(windowStats.sleepHours.deltaFromBaseline, 'hrs'),
    },
    {
      label: 'Daily Steps',
      sevenDayAvg:
        windowStats.steps.avg !== null
          ? `${windowStats.steps.avg.toLocaleString()} steps/day`
          : '—',
      sevenDayRange:
        windowStats.steps.min !== null && windowStats.steps.max !== null
          ? `${windowStats.steps.min.toLocaleString()} – ${windowStats.steps.max.toLocaleString()}`
          : '—',
      personalBaseline:
        windowStats.steps.baselineMean !== null
          ? `${windowStats.steps.baselineMean.toLocaleString()} steps`
          : '7,200 steps',
      difference: formatDiff(windowStats.steps.deltaFromBaseline, 'steps'),
    },
  ];

  const defaultSummary = [
    `Over ${periodLabel} (${windowStats.dayCount} recorded days), ${params.memberName}'s resting heart rate averaged ${
      windowStats.heartRate.avg ?? '—'
    } bpm (personal normal: ${windowStats.heartRate.baselineMean ?? '—'} bpm) and blood oxygen (SpO2) averaged ${
      windowStats.spo2.avg ?? '—'
    }% (personal normal: ${windowStats.spo2.baselineMean ?? '—'}%).`,
    `Sleep averaged ${windowStats.sleepHours.avg ?? '—'} hours per night with ${
      windowStats.steps.avg !== null ? windowStats.steps.avg.toLocaleString() : '—'
    } average daily steps.`,
  ].join(' ');

  const defaultHighlights: string[] = [];
  if (windowStats.heartRate.deltaFromBaseline !== null) {
    defaultHighlights.push(
      `Heart rate differed by ${formatDiff(windowStats.heartRate.deltaFromBaseline, 'bpm')} from personal baseline.`
    );
  }
  if (windowStats.spo2.deltaFromBaseline !== null) {
    defaultHighlights.push(
      `SpO2 differed by ${formatDiff(windowStats.spo2.deltaFromBaseline, '%')} from personal baseline.`
    );
  }
  if (annotations.length > 0) {
    defaultHighlights.push(`${annotations.length} personal context note(s) logged on the biometric timeline.`);
  }
  if (symptoms.length > 0) {
    defaultHighlights.push(
      `${symptoms.length} physical feeling/symptom entry(ies) documented (${symptoms
        .slice(0, 3)
        .map((s) => s.symptom)
        .join(', ')}).`
    );
  }
  if (params.alerts.length > 0) {
    defaultHighlights.push(`${params.alerts.length} recent early-warning alert(s) documented for review.`);
  }

  const slug = params.memberName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const dateStamp = new Date().toISOString().slice(0, 10);

  return {
    fileName: `vitalsense-weekly-report-${slug || 'member'}-${dateStamp}.pdf`,
    memberName: params.memberName,
    deviceName: params.deviceName ?? 'Connected Wearable',
    generatedAtLabel: new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    periodLabel,
    windowStats,
    metricRows,
    heartRateSeries,
    heartRateBand: {
      low: hrBand.activeLow,
      high: hrBand.activeHigh,
      mean: hrBand.mean,
    },
    spo2Series,
    spo2Band: {
      low: spo2Band.activeLow,
      high: spo2Band.activeHigh,
      mean: spo2Band.mean,
    },
    annotations: annotations.slice(0, 8),
    symptoms: symptoms.slice(0, 8),
    alerts: params.alerts.slice(0, 5),
    narrativeSummary: params.weeklySummaryReport?.messageBody?.trim() || defaultSummary,
    keyHighlights:
      params.weeklySummaryReport?.keyHighlights?.length
        ? params.weeklySummaryReport.keyHighlights
        : defaultHighlights,
    disclaimer:
      params.weeklySummaryReport?.disclaimer ||
      'For discussion with your primary care clinician or caregiver. VITALSENSE summarizes wearable trends and does not provide medical diagnoses.',
  };
}

function drawVectorChartBox(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    unit: string;
    points: PdfChartPoint[];
    band: { low: number | null; high: number | null; mean: number | null };
    lineRgb: [number, number, number];
  }
) {
  const { x, y, w, h, title, unit, points, band, lineRgb } = opts;

  // Card border & background
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text(title, x + 4, y + 6.5);

  if (band.mean !== null) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Normal avg: ${band.mean} ${unit}`, x + w - 4, y + 6.5, { align: 'right' });
  }

  const plotX = x + 11;
  const plotY = y + 11;
  const plotW = w - 16;
  const plotH = h - 20;

  if (points.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('No readings recorded in this window.', x + w / 2, y + h / 2, { align: 'center' });
    return;
  }

  const allVals = points.map((p) => p.value);
  if (band.low !== null) allVals.push(band.low);
  if (band.high !== null) allVals.push(band.high);
  if (band.mean !== null) allVals.push(band.mean);

  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const pad = Math.max((maxVal - minVal) * 0.2, 1.2);
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const mapY = (v: number) => plotY + plotH - ((v - yMin) / Math.max(0.01, yMax - yMin)) * plotH;

  // Horizontal gridlines + Y labels
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);

  for (let i = 0; i <= 2; i++) {
    const frac = i / 2;
    const gy = plotY + frac * plotH;
    const val = yMax - frac * (yMax - yMin);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.text(val.toFixed(unit === '%' ? 1 : 0), plotX - 1.5, gy + 1, { align: 'right' });
  }

  // Shaded 30-day normal range band
  if (band.low !== null && band.high !== null) {
    const byTop = mapY(band.high);
    const byBot = mapY(band.low);
    doc.setFillColor(224, 231, 255);
    doc.rect(plotX, byTop, plotW, Math.max(1, byBot - byTop), 'F');
  }

  // Baseline dashed reference line
  if (band.mean !== null) {
    const my = mapY(band.mean);
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(plotX, my, plotX + plotW, my);
    doc.setLineDashPattern([], 0);
  }

  // Plotted curve segments
  const coords = points.map((pt, idx) => {
    const px =
      points.length <= 1 ? plotX + plotW / 2 : plotX + (idx / (points.length - 1)) * plotW;
    const py = mapY(pt.value);
    return { x: px, y: py, pt };
  });

  doc.setDrawColor(lineRgb[0], lineRgb[1], lineRgb[2]);
  doc.setLineWidth(0.65);
  for (let i = 0; i < coords.length - 1; i++) {
    doc.line(coords[i].x, coords[i].y, coords[i + 1].x, coords[i + 1].y);
  }

  // Data dots + context annotation markers
  coords.forEach((c) => {
    if (c.pt.hasAnnotation) {
      doc.setFillColor(217, 119, 6);
      doc.circle(c.x, c.y, 1.35, 'F');
    } else {
      doc.setFillColor(lineRgb[0], lineRgb[1], lineRgb[2]);
      doc.circle(c.x, c.y, 0.75, 'F');
    }
  });

  // First & last date labels on X axis
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(points[0].dateLabel, plotX, y + h - 2.5);
  if (points.length > 1) {
    doc.text(points[points.length - 1].dateLabel, plotX + plotW, y + h - 2.5, { align: 'right' });
  }
}

export function buildPhysicianReportPdfDoc(model: PhysicianReportModel): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 14;
  const contentW = pageWidth - margin * 2;
  let y = 14;

  // Header Banner
  doc.setFillColor(79, 70, 229);
  doc.roundedRect(margin, y, contentW, 22, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('VITALSENSE · Weekly Personal Health Report', margin + 5, y + 8.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(238, 242, 255);
  doc.text(
    `Member: ${model.memberName}   |   Period: ${model.periodLabel}   |   Generated: ${model.generatedAtLabel}`,
    margin + 5,
    y + 15.5
  );
  y += 27;

  // Metadata + Clinical Disclaimer strip
  doc.setFillColor(245, 243, 255);
  doc.setDrawColor(221, 214, 254);
  doc.roundedRect(margin, y, contentW, 13, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(55, 48, 163);
  doc.text(`Wearable Source: ${model.deviceName}`, margin + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Prepared for personal review or primary care visits. Summarizes wearable trends only — not a medical diagnosis.',
    margin + 4,
    y + 10
  );
  y += 18;

  // Section 1: 7-Day Biometric Summary Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text('1. 7-Day Biometric Overview vs. Personal Baseline', margin, y);
  y += 4;

  const colWidths = [46, 33, 41, 33, 29];
  const headers = ['Health Metric', '7-Day Avg', '7-Day Range', 'Personal Normal', 'Change'];
  doc.setFillColor(245, 243, 255);
  doc.rect(margin, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(55, 48, 163);

  let cx = margin + 2;
  headers.forEach((h, i) => {
    doc.text(h, cx, y + 4.8);
    cx += colWidths[i];
  });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  model.metricRows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, 7, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 7, margin + contentW, y + 7);
    doc.setTextColor(17, 24, 39);
    let rx = margin + 2;
    [row.label, row.sevenDayAvg, row.sevenDayRange, row.personalBaseline, row.difference].forEach(
      (cell, i) => {
        doc.text(cell, rx, y + 4.8);
        rx += colWidths[i];
      }
    );
    y += 7;
  });
  y += 6;

  // Section 2: Embedded 2D Vector Biometric Charts
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text('2. Recent Trend Visualizations (with Shaded Normal Band)', margin, y);
  y += 4;

  const chartW = (contentW - 6) / 2;
  const chartH = 48;
  drawVectorChartBox(doc, {
    x: margin,
    y,
    w: chartW,
    h: chartH,
    title: 'Heart Rate Trend (bpm)',
    unit: 'bpm',
    points: model.heartRateSeries,
    band: model.heartRateBand,
    lineRgb: [79, 70, 229],
  });
  drawVectorChartBox(doc, {
    x: margin + chartW + 6,
    y,
    w: chartW,
    h: chartH,
    title: 'Blood Oxygen SpO2 (%)',
    unit: '%',
    points: model.spo2Series,
    band: model.spo2Band,
    lineRgb: [21, 128, 61],
  });
  y += chartH + 7;

  // Section 3: Plain-English Weekly Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text('3. Plain-English Pattern Summary', margin, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(model.narrativeSummary, contentW - 4);
  doc.text(summaryLines, margin + 2, y);
  y += summaryLines.length * 4.2 + 3;

  if (model.keyHighlights.length > 0) {
    model.keyHighlights.slice(0, 4).forEach((hl) => {
      const bulletLines = doc.splitTextToSize(`• ${hl}`, contentW - 6);
      doc.text(bulletLines, margin + 3, y);
      y += bulletLines.length * 4.0 + 1;
    });
    y += 3;
  }

  // Section 4: Symptoms & Context Notes + Section 5: Alerts (Two columns)
  const colW = (contentW - 6) / 2;
  const secY = y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text('4. Logged Symptoms & Context Notes', margin, secY);
  doc.text('5. Early-Warning Alerts', margin + colW + 6, secY);

  let leftY = secY + 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  if (model.symptoms.length === 0 && model.annotations.length === 0) {
    doc.text('No symptoms or context notes logged for this period.', margin, leftY);
  } else {
    model.symptoms.slice(0, 4).forEach((sym) => {
      const ctx = sym.activityContext ? ` (${sym.activityContext})` : '';
      const line = `${sym.dateKey}: ${sym.symptom} [${sym.severity}/5]${ctx}`;
      const wrapped = doc.splitTextToSize(`• ${line}`, colW - 2);
      doc.text(wrapped, margin, leftY);
      leftY += wrapped.length * 3.6 + 1;
    });
    model.annotations.slice(0, 3).forEach((ann) => {
      const line = `${ann.dateKey}: ${ann.note}`;
      const wrapped = doc.splitTextToSize(`• ${line}`, colW - 2);
      doc.text(wrapped, margin, leftY);
      leftY += wrapped.length * 3.6 + 1;
    });
  }

  let rightY = secY + 5;
  if (model.alerts.length === 0) {
    doc.text('No deviation alerts triggered in this period.', margin + colW + 6, rightY);
  } else {
    model.alerts.slice(0, 4).forEach((alt) => {
      const line = `[${alt.status.toUpperCase()}] ${alt.title}`;
      const wrapped = doc.splitTextToSize(`• ${line}`, colW - 2);
      doc.text(wrapped, margin + colW + 6, rightY);
      rightY += wrapped.length * 3.8 + 1.2;
    });
  }

  // Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 280, margin + contentW, 280);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(100, 116, 139);
  const disclaimerLines = doc.splitTextToSize(model.disclaimer, contentW);
  doc.text(disclaimerLines, margin, 284);

  return doc;
}

export function downloadPhysicianReportPdf(params: {
  memberName: string;
  deviceName?: string;
  readings: VitalReading[];
  baselines: Record<MetricKey, MetricBaseline> | null;
  alerts: AlertRecord[];
  annotations?: ChartAnnotation[];
  symptoms?: SymptomLog[];
  weeklySummaryReport?: WeeklySummaryReport | null;
}): PhysicianReportModel {
  const model = buildPhysicianReportModel(params);
  const doc = buildPhysicianReportPdfDoc(model);
  doc.save(model.fileName);
  return model;
}
