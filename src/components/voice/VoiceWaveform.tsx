import type { VoiceAssistantState } from '../../lib/voiceAssistant';

interface VoiceWaveformProps {
  state: VoiceAssistantState;
  audioLevel: number;
}

const BAR_WEIGHTS = [
  0.34, 0.52, 0.72, 0.45, 0.86, 0.64, 0.96, 0.58, 1.0,
  0.88, 0.62, 0.94, 0.5, 0.82, 0.66, 0.46, 0.68, 0.36,
];

export function VoiceWaveform({ state, audioLevel }: VoiceWaveformProps) {
  const isActive = state === 'listening' || state === 'speaking';
  const isProcessing = state === 'processing' || state === 'connecting';
  const isError = state === 'error' || state === 'connection_lost';

  const clampedLevel = Math.max(0.08, Math.min(1, audioLevel || (isActive ? 0.28 : 0.12)));

  return (
    <div
      data-testid="voice-waveform"
      data-voice-state={state}
      aria-hidden="true"
      className="flex h-12 w-full max-w-[260px] items-center justify-center gap-1.5 px-3"
    >
      {BAR_WEIGHTS.map((weight, idx) => {
        let heightPct = 22 + weight * 16;
        if (isActive) {
          const waveOffset = Math.sin(idx * 0.9 + clampedLevel * 6) * 14;
          heightPct = Math.max(
            18,
            Math.min(96, 22 + weight * clampedLevel * 74 + waveOffset * clampedLevel)
          );
        } else if (isProcessing) {
          heightPct = 24 + weight * 26;
        } else if (isError) {
          heightPct = 18 + (idx % 3) * 6;
        }

        const barColorClass = isError
          ? 'bg-rose-300'
          : state === 'speaking'
            ? 'bg-violet-600'
            : state === 'listening'
              ? 'bg-indigo-600'
              : isProcessing
                ? 'bg-indigo-400 animate-pulse'
                : 'bg-indigo-200';

        return (
          <span
            key={idx}
            className={`block w-1.5 rounded-full transition-all duration-150 ease-out ${barColorClass}`}
            style={{
              height: `${Math.round(heightPct)}%`,
              animationDelay: isProcessing ? `${idx * 45}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
