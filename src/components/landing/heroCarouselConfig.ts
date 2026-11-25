export const HERO_SLIDE_INTERVAL_MS = 2500;
export const HERO_TIMER_TICK_MS = 50;

export interface HeroStorySlideMeta {
  id: 'signal' | 'baseline' | 'anomaly' | 'explainable' | 'caregiver';
  tabLabel: string;
  eyebrow: string;
  headline: string;
  description: string;
  ctaTarget: string;
  ctaLabel: string;
  accentHex: string;
}

export const HERO_STORY_SLIDES: HeroStorySlideMeta[] = [
  {
    id: 'signal',
    tabLabel: 'Personal Health',
    eyebrow: '01 · Personal Health',
    headline: 'Your Health Has Patterns. We Notice When They Change.',
    description:
      'Follow your daily heart rate, blood oxygen, sleep, and step count in one calm overview built from your wearable data.',
    ctaTarget: '/app/dashboard',
    ctaLabel: 'Open Health Overview',
    accentHex: '#4F46E5',
  },
  {
    id: 'baseline',
    tabLabel: 'Personal Baseline',
    eyebrow: '02 · Personal Baseline',
    headline: "Your Normal. Not Someone Else's.",
    description:
      'VITALSENSE learns what is typical for you from your own wearable history instead of comparing everyone to generic averages.',
    ctaTarget: '/app/baseline',
    ctaLabel: 'View Personal Baseline',
    accentHex: '#2563EB',
  },
  {
    id: 'anomaly',
    tabLabel: 'Early Detection',
    eyebrow: '03 · Early Detection',
    headline: 'Notice Changes That Last Across Days.',
    description:
      'One restless night is ignored while steady multi-day changes in heart rate, sleep, or activity stand out early.',
    ctaTarget: '/app/timeline',
    ctaLabel: 'Open Health Timeline',
    accentHex: '#D97706',
  },
  {
    id: 'explainable',
    tabLabel: 'Explainable AI',
    eyebrow: '04 · Explainable AI',
    headline: 'Every Alert Explains Why in Plain English.',
    description:
      'See clearly what changed, how long it lasted, and ask questions about your own wearable data without medical jargon.',
    ctaTarget: '/app/insights',
    ctaLabel: 'Explore AI Insights',
    accentHex: '#4F46E5',
  },
  {
    id: 'caregiver',
    tabLabel: 'Caregiver Alerts',
    eyebrow: '05 · Caregiver Alerts',
    headline: 'Keep Trusted Family Informed Automatically.',
    description:
      'Share clear reasons, when a change began, and follow-up status with authorised caregivers while raw data stays private.',
    ctaTarget: '/caregiver',
    ctaLabel: 'Open Caregiver Centre',
    accentHex: '#4F46E5',
  },
];

export function normalizeSlideIndex(index: number, total = HERO_STORY_SLIDES.length): number {
  if (total <= 0) return 0;
  return ((index % total) + total) % total;
}

export function getSlideDirection(currentIdx: number, nextNormalizedIdx: number): 1 | -1 {
  if (nextNormalizedIdx === currentIdx) return 1;
  return nextNormalizedIdx > currentIdx ? 1 : -1;
}

export function computeSlideProgressPct(
  elapsedMs: number,
  intervalMs = HERO_SLIDE_INTERVAL_MS
): number {
  if (intervalMs <= 0) return 100;
  const clamped = Math.max(0, Math.min(intervalMs, elapsedMs));
  return Math.round((clamped / intervalMs) * 1000) / 10;
}

export function advanceElapsedSlide(
  currentSlide: number,
  currentElapsedMs: number,
  deltaMs: number,
  intervalMs = HERO_SLIDE_INTERVAL_MS,
  totalSlides = HERO_STORY_SLIDES.length
): { nextSlide: number; nextElapsedMs: number; advanced: boolean } {
  const safeInterval = Math.max(250, intervalMs);
  const sum = currentElapsedMs + Math.max(0, deltaMs);
  if (sum >= safeInterval) {
    return {
      nextSlide: normalizeSlideIndex(currentSlide + 1, totalSlides),
      nextElapsedMs: sum % safeInterval,
      advanced: true,
    };
  }
  return {
    nextSlide: normalizeSlideIndex(currentSlide, totalSlides),
    nextElapsedMs: sum,
    advanced: false,
  };
}
