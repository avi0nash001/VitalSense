import { PageHeader } from '../components/ui/Primitives';
import { VoiceAssistantPanel } from '../components/voice/VoiceAssistantPanel';

export function VoiceAssistantPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        kicker="Multilingual Voice Assistant"
        title="Talk to VitalSense"
        description="Have a calm, natural voice or text conversation about your heart rate, SpO₂, sleep, steps, baselines, and alerts—automatically in your language."
      />

      <VoiceAssistantPanel />
    </div>
  );
}
