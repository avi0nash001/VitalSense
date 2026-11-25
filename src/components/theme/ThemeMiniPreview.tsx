import type { ThemeId } from '../../theme/themes';

export function ThemeMiniPreview({ themeId }: { themeId: ThemeId }) {
  if (themeId === 'dose') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-white p-3 text-[#111827]">
        <div className="relative z-10 flex items-center justify-between border-b border-[#E2E8F0] pb-1.5 text-[7px] font-semibold text-[#475569]">
          <span className="text-[#111827]">VITALSENSE</span>
          <span className="rounded bg-[#4F46E5] px-1.5 py-0.5 text-white">Start</span>
        </div>

        <div className="relative z-10 mt-3 grid grid-cols-12 items-center gap-2">
          <div className="col-span-5 space-y-1.5">
            <p className="font-display text-[11px] font-bold leading-[1.08] tracking-tight text-[#111827]">
              Notice shifts early.
            </p>
            <div className="inline-block rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[6px] font-semibold text-[#3730A3]">
              Personal Baseline
            </div>
          </div>

          <div className="col-span-7 flex flex-col gap-1.5">
            <div className="rounded-md border border-[#DDD6FE] bg-[#F5F3FF] p-1.5">
              <div className="flex items-center justify-between text-[6px] text-[#475569]">
                <span>Heart Rate</span>
                <span className="font-semibold text-[#D97706]">+6.7 bpm</span>
              </div>
              <svg viewBox="0 0 80 20" className="mt-1 h-4 w-full" aria-hidden="true">
                <polyline
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  points="2,14 18,14 34,13 50,10 64,7 78,4"
                />
              </svg>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-[6px]">
              <span className="text-[#64748B]">Daily Steps</span>
              <span className="font-mono-num font-bold text-[#111827]">5,140</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'studio') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#F5F4F0] p-3 text-[#18181B]">
        <div className="flex items-center justify-between border-b border-[#DFDDD6] pb-1 text-[7px] text-[#4B4B52]">
          <span className="font-semibold">VITALSENSE</span>
          <span className="rounded-sm bg-[#C2410C] px-1.5 py-0.5 text-white">Open</span>
        </div>
        {/* Architectural guide lines */}
        <div className="relative mt-2.5 border-y border-[#DFDDD6] py-2.5">
          <div className="flex items-center justify-between border-b border-dashed border-[#C7C3B9] pb-1">
            <span className="font-editorial text-[14px] font-medium tracking-tight text-[#18181B]">
              Baseline Studio
            </span>
            <span className="font-mono-num text-[6px] text-[#C2410C]">14d · ±2.1</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[6px] text-[#6E6E77]">
            <span>Personal equilibrium</span>
            <span className="rounded-sm bg-[#C2410C] px-1.5 py-0.5 text-white">Explore</span>
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'dusk') {
    return (
      <div
        className="relative h-full w-full overflow-hidden p-3 text-[#1E1B2E]"
        style={{
          background:
            'linear-gradient(180deg, #E8AE7B 0%, #DCA68C 34%, #6D6B7D 66%, #282B3B 100%)',
        }}
      >
        <div className="flex items-center justify-between text-[7px] font-medium text-[#1E1B2E]/85">
          <span>VITALSENSE</span>
          <span className="rounded bg-[#4F46E5] px-1.5 py-0.5 text-white">Enter</span>
        </div>

        <div className="mt-3 grid grid-cols-12 items-center gap-2">
          <div className="col-span-5">
            <p className="font-display text-[10px] font-semibold leading-tight text-[#1E1B2E]">
              Evening vitals, aligned.
            </p>
            <div className="mt-1.5 inline-block rounded bg-[#4F46E5] px-1.5 py-0.5 text-[6px] text-white">
              Timeline
            </div>
          </div>

          <div className="col-span-7 rounded-md border border-white/15 bg-[#1B1D2C]/90 p-2 text-slate-100 shadow-md">
            <div className="flex justify-between text-[6px] text-slate-400">
              <span>Nightly check</span>
              <span className="text-indigo-300">Matched</span>
            </div>
            <div className="mt-1 space-y-1 font-mono-num text-[7px]">
              <div className="flex justify-between border-b border-white/10 pb-0.5">
                <span>HR</span>
                <span>69.7 bpm</span>
              </div>
              <div className="flex justify-between">
                <span>HRV</span>
                <span>43.4 ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'vantage') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#070A0D] p-3 text-[#F1F5F9]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 70% at 76% 45%, rgba(52, 211, 153, 0.2) 0%, transparent 72%)',
          }}
        />
        <div className="relative z-10 flex items-center justify-between text-[7px] text-[#90A4B4]">
          <span className="font-semibold text-white">VITALSENSE</span>
          <span className="rounded bg-[#34D399] px-1.5 py-0.5 font-semibold text-[#052E16]">
            Live
          </span>
        </div>

        <div className="relative z-10 mt-2.5 grid grid-cols-12 items-center gap-2">
          <div className="col-span-6 space-y-1.5">
            <p className="font-display text-[11px] font-semibold leading-tight text-white">
              Every trend, measured.
            </p>
            <div className="inline-block rounded bg-[#34D399] px-1.5 py-0.5 text-[6px] font-semibold text-[#052E16]">
              CUSUM Live
            </div>
          </div>

          <div className="col-span-6 flex items-center justify-center">
            <div className="w-full rounded border border-emerald-400/25 bg-emerald-500/5 p-1.5">
              <div className="flex items-center justify-between font-mono-num text-[5px] text-emerald-300/90">
                <span>HR · 14d</span>
                <span>+6.7 bpm</span>
              </div>
              <svg viewBox="0 0 80 28" className="mt-1 h-7 w-full" aria-hidden="true">
                <line x1="0" y1="18" x2="80" y2="18" stroke="rgba(148,163,184,0.35)" strokeDasharray="2 2" strokeWidth="1" />
                <polyline
                  fill="none"
                  stroke="#34D399"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points="2,19 16,18 28,20 42,17 56,12 68,8 78,5"
                />
                <circle cx="78" cy="5" r="2" fill="#34D399" />
              </svg>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-2 grid grid-cols-4 border-t border-slate-800 pt-1 font-mono-num text-[6px] text-slate-400">
          <span>14d</span>
          <span>5ch</span>
          <span className="text-emerald-400">Z+2.9</span>
          <span>100%</span>
        </div>
      </div>
    );
  }

  if (themeId === 'coral') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#F4F1EC] p-3 text-[#181615]">
        <div className="flex items-center justify-between text-[7px] text-[#706863]">
          <span className="font-semibold text-[#181615]">VITALSENSE</span>
          <span className="rounded bg-[#181615] px-1.5 py-0.5 text-white">Open</span>
        </div>

        <div className="mt-2.5 grid grid-cols-12 items-center gap-2">
          <div className="col-span-6 space-y-1.5">
            <p className="font-display text-[11px] font-bold leading-[1.08] tracking-tight text-[#181615]">
              Calm clarity on every shift.
            </p>
            <div className="inline-block rounded bg-[#181615] px-1.5 py-0.5 text-[6px] text-white">
              Review
            </div>
          </div>

          <div className="col-span-6 flex justify-end">
            <div className="w-20 rotate-3 rounded border border-[#E4DDD3] bg-white p-2 shadow-sm">
              <p className="text-[6px] text-[#706863]">Caregiver Log</p>
              <p className="mt-0.5 font-mono-num text-[7px] font-semibold">69.7 bpm</p>
              <span className="mt-1 inline-block border border-[#D95D47] px-1 text-[5px] font-bold uppercase tracking-wider text-[#D95D47]">
                Acked
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // cobalt
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F9FBFE] p-3 text-[#0F172A]">
      {/* Faint horizontal telemetry stream lines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-4 space-y-2 opacity-30"
      >
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
        <div className="ml-6 h-[1px] w-4/5 bg-gradient-to-r from-blue-300 via-blue-500 to-transparent" />
        <div className="ml-2 h-[1px] w-5/6 bg-gradient-to-r from-transparent via-blue-300 to-blue-500" />
      </div>

      <div className="relative z-10 flex items-center justify-between text-[7px] text-[#60728B]">
        <span className="font-semibold text-[#0F172A]">VITALSENSE</span>
        <span className="rounded bg-[#2563EB] px-1.5 py-0.5 text-white">Sync</span>
      </div>

      <div className="relative z-10 mt-3 space-y-1.5">
        <p className="font-display text-[11px] font-bold leading-tight tracking-tight text-[#0F172A]">
          Signals in, structured drift out.
        </p>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[#2563EB] px-1.5 py-0.5 text-[6px] font-medium text-white">
            Start Free
          </span>
          <span className="rounded border border-[#BCCBE0] bg-white px-1.5 py-0.5 font-mono-num text-[6px] text-[#3B4C66]">
            csv.valid
          </span>
        </div>
      </div>
    </div>
  );
}
