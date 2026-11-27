import assert from 'node:assert/strict';
import test from 'node:test';
import { getDemoPersona } from './demoPersonas.ts';
import { buildPhysicianReportModel, buildPhysicianReportPdfDoc } from './physicianReportPdf.ts';

test('buildPhysicianReportModel aggregates 7-day metrics, charts, and context notes', () => {
  const persona = getDemoPersona('elena');
  const model = buildPhysicianReportModel({
    memberName: persona.name,
    deviceName: persona.deviceName,
    readings: persona.readings,
    baselines: persona.baselines,
    alerts: persona.recentAlerts,
    annotations: [
      {
        id: 'ann_test',
        timestamp: persona.readings[persona.readings.length - 1].timestamp,
        dateKey: persona.readings[persona.readings.length - 1].timestamp.slice(0, 10),
        metric: 'heartRate',
        category: 'stress',
        note: 'Stressful meeting',
        createdAt: new Date().toISOString(),
        createdBy: persona.name,
      },
    ],
    symptoms: [
      {
        id: 'sym_test',
        timestamp: persona.readings[persona.readings.length - 1].timestamp,
        dateKey: persona.readings[persona.readings.length - 1].timestamp.slice(0, 10),
        symptom: 'Dizziness',
        severity: 4,
        activityContext: 'Standing up',
        createdAt: new Date().toISOString(),
        createdBy: persona.name,
      },
    ],
  });

  assert.equal(model.metricRows.length, 4);
  assert.ok(model.heartRateSeries.length > 0);
  assert.ok(model.spo2Series.length > 0);
  assert.equal(model.annotations.length, 1);
  assert.equal(model.symptoms.length, 1);
  assert.match(model.fileName, /^vitalsense-weekly-report-elena-rostova-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.match(model.disclaimer, /does not provide medical diagnoses/i);

  const pdfDoc = buildPhysicianReportPdfDoc(model);
  const bytes = pdfDoc.output('arraybuffer');
  assert.ok(bytes.byteLength > 1500, 'Generated PDF should contain valid vector & text bytes');
});
