import { ThemeGallery } from '../components/theme/ThemeGallery';
import { PageHeader } from '../components/ui/Primitives';

export function ThemeGalleryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Design System & Themes"
        title="Theme Gallery"
        description="Switch VITALSENSE across six curated editorial and clinical themes. Your preference is saved automatically across sessions."
      />
      <ThemeGallery />
    </div>
  );
}
