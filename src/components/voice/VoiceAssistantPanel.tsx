import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Globe,
  Hand,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LiveAudioClient } from '../../lib/liveAudioClient';
import type { MetricBaseline, MetricKey, VitalReading } from '../../lib/types';
import {
  classifyMicrophoneError,
  PRIORITY_VOICE_LANGUAGES,
  STARTER_VOICE_PROMPTS,
  upsertTranscriptTurn,
  VOICE_STATE_COPY,
  type VoiceAssistantState,
  type VoiceTranscriptEntry,
} from '../../lib/voiceAssistant';
import { VoiceWaveform } from './VoiceWaveform';

interface VoiceContextResponse {
  memberName: string;
  viewerRole: 'member' | 'caregiver';
  wearableDeviceName: string;
  lastUpdated: string;
  restrictedVitals: boolean;
  latestReading: VitalReading | null;
  baselines: Record<MetricKey, MetricBaseline> | null;
  activeAlertCount: number;
  symptomCount: number;
}

interface VoiceAssistantPanelProps {
  compact?: boolean;
}

export function VoiceAssistantPanel({ compact = false }: VoiceAssistantPanelProps) {
  const { apiFetch } = useAuth();
  const [voiceState, setVoiceState] = useState<VoiceAssistantState>('idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioClientRef = useRef<LiveAudioClient | null>(null);
  const userEndedRef = useRef<boolean>(false);
  const sessionReadyRef = useRef<boolean>(false);
  const voiceStateRef = useRef<VoiceAssistantState>('idle');
  const connectTimeoutRef = useRef<number | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  const setVoiceStateSync = useCallback((next: VoiceAssistantState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript, voiceState]);

  const contextQuery = useQuery<VoiceContextResponse>({
    queryKey: ['voice-context'],
    queryFn: () => apiFetch<VoiceContextResponse>('/api/voice/context'),
  });

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const teardownSession = useCallback(
    (nextState: VoiceAssistantState, detail?: string | null) => {
      clearConnectTimeout();
      sessionReadyRef.current = false;
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'end_session' }));
          }
          wsRef.current.close();
        } catch {
          // Ignore cleanup errors
        }
        wsRef.current = null;
      }
      if (audioClientRef.current) {
        audioClientRef.current.dispose();
        audioClientRef.current = null;
      }
      setAudioLevel(0);
      setVoiceStateSync(nextState);
      setStatusDetail(detail ?? null);
    },
    [clearConnectTimeout, setVoiceStateSync]
  );

  useEffect(() => {
    return () => {
      userEndedRef.current = true;
      teardownSession('idle', null);
    };
  }, [teardownSession]);

  const startVoiceConversation = async () => {
    const current = voiceStateRef.current;
    if (
      current === 'connecting' ||
      current === 'listening' ||
      current === 'processing' ||
      current === 'speaking'
    ) {
      return;
    }

    userEndedRef.current = false;
    sessionReadyRef.current = false;
    setStatusDetail(null);
    setTextError(null);
    setVoiceStateSync('connecting');

    const audioClient = new LiveAudioClient({
      onAudioChunkBase64: (base64Pcm) => {
        if (
          sessionReadyRef.current &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          wsRef.current.send(
            JSON.stringify({ type: 'audio', audio: base64Pcm })
          );
        }
      },
      onInputLevel: (level) => {
        if (voiceStateRef.current === 'listening') {
          setAudioLevel(level);
        }
      },
      onOutputLevel: (level) => {
        if (voiceStateRef.current === 'speaking') {
          setAudioLevel(level);
        }
      },
      onPlaybackEnded: () => {
        if (
          !userEndedRef.current &&
          wsRef.current?.readyState === WebSocket.OPEN &&
          voiceStateRef.current === 'speaking'
        ) {
          setVoiceStateSync('listening');
          setAudioLevel(0);
        }
      },
    });
    audioClientRef.current = audioClient;

    try {
      // Unlock AudioContexts synchronously inside the user's click gesture
      audioClient.prepareAudioContexts();

      // Start mic permission capture immediately inside user activation while fetching WS ticket
      const [tokenRes] = await Promise.all([
        apiFetch<{ ticket: string; wsPath: string }>('/api/voice/session-token', {
          method: 'POST',
        }),
        audioClient.startMicrophone(),
      ]);

      if (userEndedRef.current) {
        audioClient.dispose();
        audioClientRef.current = null;
        return;
      }

      // Connect WebSocket bridge to Gemini Live API
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}${tokenRes.wsPath}?ticket=${encodeURIComponent(tokenRes.ticket)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      clearConnectTimeout();
      connectTimeoutRef.current = window.setTimeout(() => {
        if (!sessionReadyRef.current && !userEndedRef.current) {
          teardownSession(
            'connection_lost',
            'Voice service timed out while connecting. Please tap the microphone to try again.'
          );
        }
      }, 12000);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data?: string;
            text?: string;
            message?: string;
            reason?: string;
          };

          if (msg.type === 'session_ready') {
            clearConnectTimeout();
            sessionReadyRef.current = true;
            setVoiceStateSync('listening');
            setStatusDetail(null);
          } else if (msg.type === 'input_transcript' && msg.text) {
            setTranscript((prev) =>
              upsertTranscriptTurn(prev, {
                role: 'user',
                textChunk: msg.text!,
                isFinal: false,
                source: 'voice',
              })
            );
            if (voiceStateRef.current === 'listening') {
              setVoiceStateSync('processing');
            }
          } else if (msg.type === 'output_transcript' && msg.text) {
            setTranscript((prev) => {
              const finalizedPrev =
                prev.length > 0 &&
                prev[prev.length - 1].role === 'user' &&
                !prev[prev.length - 1].isFinal
                  ? [...prev.slice(0, -1), { ...prev[prev.length - 1], isFinal: true }]
                  : prev;
              return upsertTranscriptTurn(finalizedPrev, {
                role: 'assistant',
                textChunk: msg.text!,
                isFinal: false,
                source: 'voice',
              });
            });
            setVoiceStateSync('speaking');
          } else if (msg.type === 'audio' && msg.data) {
            setVoiceStateSync('speaking');
            audioClientRef.current?.playPcm24kBase64(msg.data);
          } else if (msg.type === 'interrupted') {
            audioClientRef.current?.interruptPlayback();
            setTranscript((prev) =>
              prev.length > 0 &&
              prev[prev.length - 1].role === 'assistant' &&
              !prev[prev.length - 1].isFinal
                ? [...prev.slice(0, -1), { ...prev[prev.length - 1], isFinal: true }]
                : prev
            );
            setVoiceStateSync('listening');
          } else if (msg.type === 'turn_complete') {
            setTranscript((prev) =>
              prev.length > 0 && !prev[prev.length - 1].isFinal
                ? [...prev.slice(0, -1), { ...prev[prev.length - 1], isFinal: true }]
                : prev
            );
            if (!audioClientRef.current?.hasActivePlayback()) {
              setVoiceStateSync('listening');
            }
          } else if (msg.type === 'error') {
            teardownSession('error', msg.message || null);
          } else if (msg.type === 'session_closed') {
            if (!userEndedRef.current && voiceStateRef.current !== 'error') {
              teardownSession('connection_lost', msg.reason || null);
            }
          }
        } catch {
          // Ignore non-JSON frames
        }
      };

      ws.onerror = () => {
        if (!userEndedRef.current && voiceStateRef.current !== 'error') {
          teardownSession('connection_lost', 'Unable to connect the live audio stream.');
        }
      };

      ws.onclose = () => {
        if (!userEndedRef.current && voiceStateRef.current !== 'error') {
          if (
            voiceStateRef.current === 'connecting' ||
            voiceStateRef.current === 'listening' ||
            voiceStateRef.current === 'processing' ||
            voiceStateRef.current === 'speaking'
          ) {
            teardownSession('connection_lost', null);
          }
        }
      };
    } catch (err) {
      clearConnectTimeout();
      sessionReadyRef.current = false;
      audioClient.dispose();
      audioClientRef.current = null;
      setVoiceStateSync('error');
      setStatusDetail(classifyMicrophoneError(err));
    }
  };

  const handleInterruptAssistant = () => {
    audioClientRef.current?.interruptPlayback();
    setTranscript((prev) =>
      prev.length > 0 && prev[prev.length - 1].role === 'assistant' && !prev[prev.length - 1].isFinal
        ? [...prev.slice(0, -1), { ...prev[prev.length - 1], isFinal: true }]
        : prev
    );
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setVoiceStateSync('listening');
    } else {
      setVoiceStateSync('idle');
    }
  };

  const handleEndConversation = () => {
    userEndedRef.current = true;
    teardownSession('idle', null);
  };

  const textChatMutation = useMutation({
    mutationFn: (message: string) =>
      apiFetch<{ reply: string }>('/api/voice/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          history: transcript.slice(-8).map((t) => ({ role: t.role, text: t.text })),
        }),
      }),
    onMutate: (message) => {
      setStatusDetail(null);
      setTextError(null);
      setVoiceStateSync('processing');
      setTranscript((prev) =>
        upsertTranscriptTurn(prev, {
          role: 'user',
          textChunk: message,
          isFinal: true,
          source: 'text',
        })
      );
      setTextInput('');
    },
    onSuccess: (res) => {
      setTranscript((prev) =>
        upsertTranscriptTurn(prev, {
          role: 'assistant',
          textChunk: res.reply,
          isFinal: true,
          source: 'text',
        })
      );
      setVoiceStateSync('idle');
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to answer right now.';
      setVoiceStateSync('idle');
      setTextError(msg);
    },
  });

  const handleSendTextMessage = (rawMessage: string) => {
    const trimmed = rawMessage.trim();
    if (!trimmed) return;

    // If a Live WebSocket voice session is open, inject text right into that live multilingual session
    if (sessionReadyRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      audioClientRef.current?.interruptPlayback();
      setTranscript((prev) =>
        upsertTranscriptTurn(prev, {
          role: 'user',
          textChunk: trimmed,
          isFinal: true,
          source: 'text',
        })
      );
      setTextInput('');
      setVoiceStateSync('processing');
      wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
      return;
    }

    if (!textChatMutation.isPending) {
      textChatMutation.mutate(trimmed);
    }
  };

  const isSessionActive =
    voiceState === 'connecting' ||
    voiceState === 'listening' ||
    voiceState === 'processing' ||
    voiceState === 'speaking';

  const copy = VOICE_STATE_COPY[voiceState];
  const ctx = contextQuery.data;

  return (
    <div
      data-testid="voice-assistant-panel"
      data-voice-state={voiceState}
      className="rounded-2xl border border-[#DDD6FE] bg-white shadow-xs overflow-hidden"
    >
      {/* Top Voice Interaction Stage */}
      <div
        className={`bg-[#F5F3FF]/65 border-b border-[#DDD6FE]/70 ${
          compact ? 'px-5 py-5' : 'px-6 py-6 sm:px-8 sm:py-6'
        }`}
      >
        <div className="mx-auto max-w-2xl flex flex-col items-center text-center space-y-3.5">
          {/* Subtle Auto-Language Metadata */}
          <div className="inline-flex items-center justify-center gap-2 text-xs font-medium text-[#4338CA]">
            <Globe className="h-3.5 w-3.5 shrink-0 text-[#4F46E5]" />
            <span>Automatic language detection · Speaks your language naturally</span>
          </div>

          {/* Primary Microphone Control */}
          <div className="relative flex flex-col items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              {(voiceState === 'listening' || voiceState === 'speaking') && (
                <span
                  aria-hidden="true"
                  className="absolute h-20 w-20 rounded-full bg-[#DDD6FE] opacity-70 animate-ping"
                />
              )}
              <button
                type="button"
                data-testid="voice-mic-button"
                onClick={
                  isSessionActive
                    ? voiceState === 'speaking'
                      ? handleInterruptAssistant
                      : handleEndConversation
                    : startVoiceConversation
                }
                aria-label={
                  voiceState === 'speaking'
                    ? 'Interrupt assistant and listen'
                    : isSessionActive
                      ? 'Stop voice conversation'
                      : 'Start voice conversation'
                }
                className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-[#DDD6FE] ${
                  voiceState === 'error' || voiceState === 'connection_lost'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : isSessionActive
                      ? 'bg-[#4338CA] hover:bg-[#3730A3] text-white'
                      : 'bg-[#4F46E5] hover:bg-[#4338CA] text-white'
                }`}
              >
                {voiceState === 'speaking' ? (
                  <Volume2 className="h-7 w-7" />
                ) : voiceState === 'error' || voiceState === 'connection_lost' ? (
                  <MicOff className="h-7 w-7" />
                ) : (
                  <Mic className="h-7 w-7" />
                )}
              </button>
            </div>

            <VoiceWaveform state={voiceState} audioLevel={audioLevel} />
          </div>

          {/* Clear Accessible State Status */}
          <div className="space-y-1.5">
            <h2
              data-testid="voice-state-headline"
              className="font-display text-xl sm:text-2xl font-bold text-[#111827]"
            >
              {copy.headline}
            </h2>
            <p className="text-sm text-[#475569] max-w-md mx-auto">
              {statusDetail || copy.helper}
            </p>
          </div>

          {/* Active Conversation Controls: Interrupt & End */}
          {isSessionActive && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              {voiceState === 'speaking' && (
                <button
                  type="button"
                  data-testid="interrupt-assistant-btn"
                  onClick={handleInterruptAssistant}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#DDD6FE] bg-white px-4 py-2 text-xs font-semibold text-[#3730A3] hover:bg-[#EEF2FF] transition-colors"
                >
                  <Hand className="h-3.5 w-3.5" />
                  Stop &amp; Listen
                </button>
              )}
              <button
                type="button"
                data-testid="end-voice-session-btn"
                onClick={handleEndConversation}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#475569] hover:text-[#111827] hover:border-slate-300 transition-colors"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                End Conversation
              </button>
            </div>
          )}

          {/* Priority Languages Plain-Text Inline Metadata */}
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            Supported voice &amp; text languages:{' '}
            <span className="font-medium text-[#3730A3]">
              {PRIORITY_VOICE_LANGUAGES.join(' · ')}
            </span>{' '}
            &amp; mixed-language speech
          </p>
        </div>
      </div>

      {/* Live Grounded Health Snapshot Strip */}
      {ctx && (
        <div
          data-testid="voice-health-context-strip"
          className="border-b border-slate-200 bg-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <span className="font-medium text-[#475569]">
            Grounded on {ctx.memberName.split(' ')[0]}&apos;s VitalSense data:
          </span>
          {ctx.restrictedVitals ? (
            <span className="text-[#64748B]">
              Vital trends paused by member consent
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-num text-[#111827]">
              <span>
                HR{' '}
                <strong>
                  {ctx.latestReading?.heartRate ?? '—'} bpm
                </strong>
              </span>
              <span>
                SpO₂{' '}
                <strong>
                  {ctx.latestReading?.spo2 ?? '—'}%
                </strong>
              </span>
              <span>
                Sleep{' '}
                <strong>
                  {ctx.latestReading?.sleepHours ?? '—'}h
                </strong>
              </span>
              <span>
                Steps{' '}
                <strong>
                  {ctx.latestReading?.steps?.toLocaleString() ?? '—'}
                </strong>
              </span>
              <span>
                Alerts <strong>{ctx.activeAlertCount}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Body: Starter Questions + Live Transcript + Text Input */}
      <div className={`${compact ? 'p-4' : 'p-5 sm:p-6'} space-y-4 bg-white`}>
        {/* Starter Questions */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#475569]">
            Try asking by voice or tap a question:
          </p>
          <div className="flex flex-wrap gap-2">
            {STARTER_VOICE_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                data-testid="voice-starter-btn"
                disabled={textChatMutation.isPending}
                onClick={() => handleSendTextMessage(q)}
                className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF]/50 px-3 py-1.5 text-xs font-medium text-[#3730A3] hover:bg-[#EEF2FF] transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Live Transcript Container */}
        <div
          ref={transcriptScrollRef}
          data-testid="voice-transcript"
          aria-live="polite"
          className={`${
            compact ? 'min-h-[140px] max-h-[220px]' : 'min-h-[155px] max-h-[250px]'
          } overflow-y-auto rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-3`}
        >
          {transcript.length === 0 ? (
            <div className="flex h-full min-h-[115px] flex-col items-center justify-center text-center px-4">
              <p className="text-sm font-medium text-[#3730A3]">
                Your live conversation appears here
              </p>
              <p className="mt-1 text-xs text-[#64748B] max-w-md">
                Speak in Kannada, English, Hindi, or any supported language—or type below. VitalSense will explain your readings, alerts, and baselines calmly.
              </p>
            </div>
          ) : (
            transcript.map((entry) => (
              <div
                key={entry.id}
                data-testid={`transcript-turn-${entry.role}`}
                className={`flex flex-col ${
                  entry.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <span className="mb-1 text-[11px] font-medium text-[#64748B]">
                  {entry.role === 'user' ? 'You' : 'VitalSense'} ·{' '}
                  {entry.source === 'voice' ? 'Voice' : 'Typed'}
                </span>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    entry.role === 'user'
                      ? 'bg-[#4F46E5] text-white'
                      : 'border border-[#DDD6FE] bg-white text-[#111827]'
                  }`}
                >
                  {entry.text}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Error Alert Detail (voice or text error) */}
        {(((voiceState === 'error' || voiceState === 'connection_lost') && statusDetail) || textError) && (
          <div
            role="alert"
            data-testid="voice-error-banner"
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{textError || statusDetail}</span>
          </div>
        )}

        {/* Text Input Alternative */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendTextMessage(textInput);
          }}
          className="flex flex-col gap-2.5 sm:flex-row"
        >
          <input
            type="text"
            data-testid="voice-text-input"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Or type in Kannada, Hindi, English, or any language..."
            aria-label="Type a message to VitalSense"
            className="vs-input flex-1 rounded-xl px-4 py-2.5 text-sm"
          />
          <button
            type="submit"
            data-testid="voice-text-submit"
            disabled={!textInput.trim() || textChatMutation.isPending}
            className="vs-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            {textChatMutation.isPending ? 'Checking...' : 'Send'}
          </button>
        </form>

        {/* Health Safety Notice */}
        <div className="flex items-start gap-2 border-t border-slate-200 pt-3 text-[11px] text-[#64748B]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F46E5]" />
          <span>
            Supportive health-pattern assistant only—not a medical diagnosis or doctor. Wearable sensors can sometimes be inaccurate. Contact a healthcare professional if you feel unwell, or seek urgent medical care for severe symptoms.
          </span>
        </div>
      </div>
    </div>
  );
}
