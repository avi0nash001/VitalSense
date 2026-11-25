import { Check, Palette } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { ThemeMiniPreview } from './ThemeMiniPreview';
import { SurfaceCard } from '../ui/Primitives';

export function ThemeGallery() {
  const { themeId, themes, setTheme } = useTheme();
  const { pushToast } = useToast();

  return (
    <SurfaceCard className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vs-accent)]">
            <Palette className="h-4 w-4" />
            Visual Design System
          </div>
          <h2 className="mt-1 font-display text-lg font-semibold text-[var(--vs-text)]">
            Theme Gallery
          </h2>
          <p className="mt-0.5 text-xs text-[var(--vs-text-secondary)]">
            Preview and switch themes across navigation, charts, timeline, Data Lab, and portals. Preferences persist across reloads.
          </p>
        </div>
        <span className="font-mono-num text-xs text-[var(--vs-text-muted)]">
          {themes.length} curated themes
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((item) => {
          const isActive = item.id === themeId;
          const swatches = [
            item.preview.canvas,
            item.preview.surface,
            item.preview.secondary,
            item.preview.accent,
            item.preview.ink,
          ];

          return (
            <article
              key={item.id}
              data-theme-card={item.id}
              className={`flex flex-col justify-between overflow-hidden rounded-2xl border transition-all ${
                isActive
                  ? 'border-[var(--vs-accent)] bg-[var(--vs-surface-muted)] ring-1 ring-[var(--vs-accent)]/30'
                  : 'border-[var(--vs-border)] bg-[var(--vs-surface)] hover:border-[var(--vs-border-strong)]'
              }`}
            >
              <div>
                {/* Preview Thumbnail */}
                <div className="aspect-[16/10] w-full border-b border-[var(--vs-border)]">
                  <ThemeMiniPreview themeId={item.id} />
                </div>

                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-semibold text-[var(--vs-text)]">
                        {item.name}
                      </h3>
                      <p className="text-xs font-medium text-[var(--vs-accent)]">
                        {item.subtitle}
                      </p>
                    </div>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--vs-accent)]">
                        <Check className="h-3.5 w-3.5" />
                        Active
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-[var(--vs-text-secondary)]">
                    {item.description}
                  </p>

                  {/* Color Palette Preview Swatches */}
                  <div
                    className="flex items-center gap-1.5 pt-1"
                    aria-label={`${item.name} palette colors`}
                  >
                    {swatches.map((hex, i) => (
                      <span
                        key={`${item.id}-${i}`}
                        className="h-4 w-4 rounded-full border border-black/15"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--vs-border)] px-4 py-3">
                <button
                  type="button"
                  aria-label={`Select Theme: ${item.name}`}
                  onClick={() => {
                    setTheme(item.id);
                    pushToast({
                      title: `Theme switched to ${item.name}`,
                      description: item.subtitle,
                      variant: 'success',
                    });
                  }}
                  disabled={isActive}
                  className={`w-full rounded-xl px-3.5 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border border-[var(--vs-accent)]/40 bg-[var(--vs-accent-soft)] text-[var(--vs-accent-soft-text)] cursor-default'
                      : 'vs-btn-primary'
                  }`}
                >
                  {isActive ? 'Active Theme' : 'Select Theme'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </SurfaceCard>
  );
}
