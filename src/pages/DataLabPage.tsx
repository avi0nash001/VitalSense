import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FlaskConical,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parseWearableCsv } from '../lib/csvParser';
import { SAMPLE_WEARABLE_CSV, SIMULATION_SCENARIOS } from '../lib/simulator';
import type { CsvParseResult, ScenarioId } from '../lib/types';
import {
  formatShortDate,
  PageHeader,
  StateNotice,
  SurfaceCard,
} from '../components/ui/Primitives';

export function DataLabPage() {
  const { apiFetch } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [parsePreview, setParsePreview] = useState<CsvParseResult | null>(null);
  const [uploadMode, setUploadMode] = useState<'merge' | 'replace'>('merge');
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>('gradual_drift');

  const invalidateWorkspace = () => {
    queryClient.invalidateQueries({ queryKey: ['workspace-overview'] });
    queryClient.invalidateQueries({ queryKey: ['timeline'] });
    queryClient.invalidateQueries({ queryKey: ['baseline'] });
    queryClient.invalidateQueries({ queryKey: ['insights'] });
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };

  const handleCsvInput = (text: string, label: string) => {
    setRawCsvText(text);
    setFileName(label);
    const parsed = parseWearableCsv(text);
    setParsePreview(parsed);
  };

  const handleFileSelected = async (file: File) => {
    const content = await file.text();
    handleCsvInput(content, file.name);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFileSelected(file);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      setUploadProgress(35);
      const res = await apiFetch<{
        parseResult: CsvParseResult;
        readingCount: number;
        timelineCount: number;
      }>('/api/data-lab/upload-csv', {
        method: 'POST',
        body: JSON.stringify({ csvText: rawCsvText, mode: uploadMode }),
      });
      setUploadProgress(100);
      return res;
    },
    onSuccess: (res) => {
      invalidateWorkspace();
      pushToast({
        title: `Imported ${res.parseResult.qualitySummary.validCount} wearable readings`,
        description: `Workspace updated (${res.readingCount} total readings, ${res.timelineCount} timeline events).`,
        variant: 'success',
      });
      setTimeout(() => setUploadProgress(0), 1200);
    },
    onError: (err) => {
      setUploadProgress(0);
      pushToast({
        title: 'CSV import failed',
        description: err instanceof Error ? err.message : 'Unable to process CSV.',
        variant: 'error',
      });
    },
  });

  const simulateMutation = useMutation({
    mutationFn: (scenarioId: ScenarioId) =>
      apiFetch<{
        scenarioId: ScenarioId;
        readingsCount: number;
        detectedChangesCount: number;
        alertsCount: number;
      }>('/api/data-lab/simulate', {
        method: 'POST',
        body: JSON.stringify({ scenarioId }),
      }),
    onSuccess: (res) => {
      invalidateWorkspace();
      pushToast({
        title: `Synthetic scenario loaded: ${res.scenarioId.replace('_', ' ')}`,
        description: `${res.readingsCount} synthetic readings generated · ${res.detectedChangesCount} gradual shifts detected.`,
        variant: 'info',
      });
    },
    onError: (err) => {
      pushToast({
        title: 'Simulation failed',
        description: err instanceof Error ? err.message : 'Unable to run scenario.',
        variant: 'error',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ activeScenario: string }>('/api/data-lab/reset-demo', {
        method: 'POST',
      }),
    onSuccess: () => {
      invalidateWorkspace();
      setParsePreview(null);
      setRawCsvText('');
      setFileName(null);
      pushToast({
        title: 'Restored default demo longitudinal log',
        variant: 'success',
      });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Wearable Ingestion & Scenario Testing"
        title="Data Lab"
        description="Upload wearable CSV exports with row-level quality validation or run synthetic biometric scenarios to verify how VITALSENSE responds."
        actions={
          <button
            type="button"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="vs-btn-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Demo Log
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: CSV Upload & Validation */}
        <SurfaceCard className="lg:col-span-6 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--vs-accent)]">
                <FileSpreadsheet className="h-4 w-4" />
                Real Wearable Export
              </div>
              <h2 className="mt-1 font-display text-lg font-semibold text-[var(--vs-text)]">
                Upload Wearable CSV
              </h2>
              <p className="mt-1 text-xs text-[var(--vs-text-secondary)]">
                Supports <span className="font-mono-num">timestamp, heart_rate, spo2, sleep_hours, steps, temperature, respiratory_rate, hrv</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCsvInput(SAMPLE_WEARABLE_CSV, 'sample_wearable_export.csv')}
              className="vs-btn-secondary shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              Load Sample CSV
            </button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)]/50'
                : 'border-[var(--vs-border-strong)] bg-[var(--vs-surface-muted)] hover:border-[var(--vs-accent)]/60'
            }`}
          >
            <Upload className="mx-auto h-7 w-7 text-[var(--vs-text-muted)]" />
            <p className="mt-2.5 text-sm font-medium text-[var(--vs-text)]">
              {fileName ? `Selected: ${fileName}` : 'Drag and drop a CSV file here'}
            </p>
            <p className="mt-1 text-xs text-[var(--vs-text-muted)]">
              or browse from your computer to validate rows before importing
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="vs-btn-secondary mt-4 rounded-lg px-4 py-2 text-xs font-medium"
            >
              Choose CSV File
            </button>
          </div>

          <div>
            <label htmlFor="csv-paste" className="block text-xs font-medium text-[var(--vs-text-secondary)]">
              Or paste CSV rows directly
            </label>
            <textarea
              id="csv-paste"
              rows={4}
              value={rawCsvText}
              onChange={(e) => handleCsvInput(e.target.value, 'pasted_wearable.csv')}
              placeholder="timestamp,heart_rate,spo2,sleep_hours,steps,temperature,respiratory_rate,hrv"
              className="vs-input mt-1.5 w-full rounded-lg px-3 py-2 font-mono-num text-xs"
            />
          </div>

          {parsePreview && (
            <div className="space-y-4 border-t border-[var(--vs-border)] pt-4">
              <div className="grid grid-cols-3 divide-x divide-[var(--vs-border)] border-y border-[var(--vs-border)] py-2.5 text-center">
                <div>
                  <p className="text-[11px] text-[var(--vs-text-muted)]">Valid Rows</p>
                  <p className="mt-0.5 font-mono-num text-base font-semibold text-[var(--vs-success)]">
                    {parsePreview.qualitySummary.validCount}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--vs-text-muted)]">Invalid Rows</p>
                  <p className="mt-0.5 font-mono-num text-base font-semibold text-[var(--vs-warning)]">
                    {parsePreview.qualitySummary.invalidCount}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--vs-text-muted)]">Quality Avg</p>
                  <p className="mt-0.5 font-mono-num text-base font-semibold text-[var(--vs-text)]">
                    {parsePreview.qualitySummary.avgQualityScore}%
                  </p>
                </div>
              </div>

              {parsePreview.invalidRows.length > 0 && (
                <div className="rounded-lg border border-[var(--vs-warning)]/40 bg-[var(--vs-warning-soft)] p-3 text-xs space-y-1.5">
                  <p className="font-semibold text-[var(--vs-text)] flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-[var(--vs-warning)]" />
                    Invalid Rows Excluded From Import
                  </p>
                  <ul className="space-y-1 text-[var(--vs-text-secondary)]">
                    {parsePreview.invalidRows.slice(0, 4).map((inv) => (
                      <li key={inv.rowNumber}>
                        Row {inv.rowNumber}: {inv.reasons.join('; ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsePreview.validRows.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--vs-border)]">
                  <table className="w-full text-left font-mono-num text-[11px]">
                    <thead className="bg-[var(--vs-table-head)] text-[var(--vs-text-muted)] border-b border-[var(--vs-border)]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-2 py-2 text-right">HR</th>
                        <th className="px-2 py-2 text-right">SpO2</th>
                        <th className="px-2 py-2 text-right">Sleep</th>
                        <th className="px-2 py-2 text-right">Steps</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--vs-border)]">
                      {parsePreview.validRows.slice(0, 6).map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-1.5 text-[var(--vs-text)]">
                            {formatShortDate(r.timestamp)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[var(--vs-text)]">
                            {r.heartRate ?? '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[var(--vs-text)]">
                            {r.spo2 ?? '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[var(--vs-text)]">
                            {r.sleepHours !== undefined ? `${r.sleepHours}h` : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[var(--vs-text)]">
                            {r.steps !== undefined ? r.steps.toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--vs-surface-muted)]">
                    <div
                      className="h-full bg-[var(--vs-accent)] transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <select
                  aria-label="CSV import mode"
                  value={uploadMode}
                  onChange={(e) => setUploadMode(e.target.value as 'merge' | 'replace')}
                  className="vs-input rounded-lg px-3 py-2 text-xs"
                >
                  <option value="merge">Merge with existing real/demo readings</option>
                  <option value="replace">Replace dataset with this CSV</option>
                </select>

                <button
                  type="button"
                  disabled={
                    parsePreview.validRows.length === 0 || uploadMutation.isPending
                  }
                  onClick={() => uploadMutation.mutate()}
                  className="vs-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {uploadMutation.isPending
                    ? 'Importing...'
                    : `Import ${parsePreview.validRows.length} Valid Rows`}
                </button>
              </div>
            </div>
          )}
        </SurfaceCard>

        {/* Right: Synthetic Scenario Simulator */}
        <SurfaceCard className="lg:col-span-6 p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--vs-warning)]">
              <FlaskConical className="h-4 w-4" />
              Synthetic Simulation Sandbox
            </div>
            <h2 className="mt-1 font-display text-lg font-semibold text-[var(--vs-text)]">
              Synthetic Scenario Simulator
            </h2>
            <p className="mt-1 text-xs text-[var(--vs-text-secondary)]">
              Test baseline calibration, gradual change detection, and noise resilience.
              Simulated data is strictly tagged as synthetic and never presented as real
              patient readings.
            </p>
          </div>

          <StateNotice
            variant="warning"
            title="Synthetic data boundary"
            message="Running a scenario updates your active preview workspace with clearly labeled synthetic readings."
          />

          <div className="space-y-2.5" role="radiogroup" aria-label="Synthetic simulation scenarios">
            {SIMULATION_SCENARIOS.map((sc) => {
              const active = selectedScenario === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedScenario(sc.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-[var(--vs-accent)] bg-[var(--vs-accent-soft)]/50 ring-1 ring-[var(--vs-accent)]/30'
                      : 'border-[var(--vs-border)] bg-[var(--vs-surface)] hover:border-[var(--vs-border-strong)] hover:bg-[var(--vs-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-[var(--vs-text)]">
                      {sc.title}
                    </span>
                    <span className="font-mono-num text-[11px] text-[var(--vs-text-muted)]">
                      {sc.subtitle}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                    {sc.description}
                  </p>
                  <p className="mt-1.5 text-[11px] font-medium text-[var(--vs-accent)]">
                    Expected: {sc.expectedBehavior}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--vs-border)] pt-4">
            <button
              type="button"
              onClick={() => navigate('/app/dashboard')}
              className="text-xs font-medium text-[var(--vs-text-secondary)] hover:text-[var(--vs-text)]"
            >
              Open Dashboard →
            </button>

            <button
              type="button"
              onClick={() => simulateMutation.mutate(selectedScenario)}
              disabled={simulateMutation.isPending}
              className="vs-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {simulateMutation.isPending ? 'Running Simulation...' : 'Run Synthetic Scenario'}
            </button>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
