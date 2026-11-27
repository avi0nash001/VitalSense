import { X } from 'lucide-react';
import { VoiceAssistantPanel } from './VoiceAssistantPanel';

interface VoiceAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function VoiceAssistantDrawer({ open, onClose }: VoiceAssistantDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="VitalSense Voice Assistant"
      data-testid="voice-assistant-drawer"
    >
      <div
        className="fixed inset-0 bg-slate-900/25 transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl border-l border-[#DDD6FE] overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#DDD6FE] bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4F46E5]">
              VitalSense Voice
            </p>
            <h2 className="font-display text-base font-bold text-[#111827]">
              Multilingual Health Assistant
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice assistant"
            data-testid="close-voice-drawer-btn"
            className="rounded-xl border border-slate-200 p-2 text-[#475569] hover:bg-[#F5F3FF] hover:text-[#111827] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <VoiceAssistantPanel compact />
        </div>
      </div>
    </div>
  );
}
