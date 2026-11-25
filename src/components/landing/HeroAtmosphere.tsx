import type { ThemeId } from '../../theme/themes';

interface AtmospherePalette {
  baseTop: string;
  baseBottom: string;
  gridStroke: string;
}

const ATMOSPHERE_PALETTES: Record<ThemeId, AtmospherePalette> = {
  dose: {
    baseTop: '#FFFFFF',
    baseBottom: '#F5F3FF',
    gridStroke: 'rgba(79, 70, 229, 0.045)',
  },
  dusk: {
    baseTop: '#FAF6F2',
    baseBottom: '#F3ECE5',
    gridStroke: 'rgba(79, 70, 229, 0.045)',
  },
  studio: {
    baseTop: '#F5F4F0',
    baseBottom: '#ECEAE4',
    gridStroke: 'rgba(24, 24, 27, 0.045)',
  },
  vantage: {
    baseTop: '#070A0D',
    baseBottom: '#0D1318',
    gridStroke: 'rgba(241, 245, 249, 0.045)',
  },
  coral: {
    baseTop: '#F4F1EC',
    baseBottom: '#ECE7E0',
    gridStroke: 'rgba(24, 22, 21, 0.04)',
  },
  cobalt: {
    baseTop: '#FFFFFF',
    baseBottom: '#EFF4FC',
    gridStroke: 'rgba(37, 99, 235, 0.045)',
  },
};

export function HeroAtmosphere({
  themeId,
}: {
  themeId: ThemeId;
  activeSlide?: number;
}) {
  const palette = ATMOSPHERE_PALETTES[themeId];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${palette.baseTop} 0%, ${palette.baseBottom} 100%)`,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, ${palette.gridStroke} 1px, transparent 1px),
            linear-gradient(to bottom, ${palette.gridStroke} 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
    </div>
  );
}
