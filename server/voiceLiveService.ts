import crypto from 'node:crypto';
import type http from 'node:http';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import { sortReadingsChronologically } from '../src/lib/vitalsEngine.ts';
import {
  buildVoiceHealthContextPrompt,
  type VoiceHealthContextSnapshot,
} from '../src/lib/voiceAssistant.ts';
import { computeStoreBaselines, getStore } from './store.ts';

interface VoiceWsTicket {
  userId: string;
  role: 'member' | 'caregiver';
  expiresAt: number;
}

const pendingTickets = new Map<string, VoiceWsTicket>();

export function issueVoiceWsTicket(userId: string, role: 'member' | 'caregiver'): string {
  // Prune expired tickets
  const now = Date.now();
  for (const [key, value] of pendingTickets.entries()) {
    if (value.expiresAt <= now) {
      pendingTickets.delete(key);
    }
  }
  const ticket = crypto.randomBytes(24).toString('hex');
  pendingTickets.set(ticket, {
    userId,
    role,
    expiresAt: now + 60_000,
  });
  return ticket;
}

function consumeVoiceWsTicket(ticket: string): VoiceWsTicket | null {
  const entry = pendingTickets.get(ticket);
  if (!entry) return null;
  pendingTickets.delete(ticket);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

export function buildLiveVoiceContextSnapshot(
  viewerRole: 'member' | 'caregiver'
): VoiceHealthContextSnapshot {
  const store = getStore();
  const sortedReadings = sortReadingsChronologically(store.readings);
  const baselines = computeStoreBaselines(store);
  const memberAccount =
    store.accounts.find((a) => a.role === 'member') ?? store.accounts[0];

  return {
    memberName: memberAccount.name,
    viewerRole,
    wearableDeviceName: store.preferences.wearableDeviceName,
    lastUpdated: store.lastUpdated,
    consent: store.consent,
    latestReading: sortedReadings[sortedReadings.length - 1] ?? null,
    recent7DayReadings: sortedReadings.slice(-7),
    baselines,
    timelineEvents: store.timelineEvents,
    alerts: store.alerts,
    realtimeDeviations: store.realtimeDeviations,
    symptomLogs: store.symptomLogs,
    chartAnnotations: store.chartAnnotations,
  };
}

function sendWsJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function attachVoiceWebSocketServer(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const parsedUrl = new URL(request.url ?? '', 'http://localhost');
    if (parsedUrl.pathname !== '/ws/voice') {
      return;
    }

    const ticketParam = parsedUrl.searchParams.get('ticket') ?? '';
    const ticket = consumeVoiceWsTicket(ticketParam);
    if (!ticket) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, ticket);
    });
  });

  wss.on('connection', async (clientWs: WebSocket, ticket: VoiceWsTicket) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      sendWsJson(clientWs, {
        type: 'error',
        code: 'MISSING_API_KEY',
        message:
          'GEMINI_API_KEY is not configured in environment secrets. Please add your key in Settings > Secrets to start real-time voice conversations.',
      });
      clientWs.close(1008, 'GEMINI_API_KEY missing');
      return;
    }

    const snapshot = buildLiveVoiceContextSnapshot(ticket.role);
    const systemInstruction = buildVoiceHealthContextPrompt(snapshot);

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: 'v1beta',
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    type LiveSession = Awaited<ReturnType<typeof ai.live.connect>>;
    let session: LiveSession | null = null;
    let isClosing = false;

    const cleanup = () => {
      if (isClosing) return;
      isClosing = true;
      try {
        session?.close();
      } catch {
        // Ignore close errors if already closed
      }
      session = null;
    };

    function extractLiveErrorMessage(err: unknown, fallback: string): string {
      if (err instanceof Error && err.message) return err.message;
      if (typeof err === 'object' && err !== null) {
        const record = err as Record<string, unknown>;
        if (typeof record.message === 'string' && record.message.trim()) {
          return record.message;
        }
        if (
          typeof record.error === 'object' &&
          record.error !== null &&
          typeof (record.error as Record<string, unknown>).message === 'string'
        ) {
          return (record.error as Record<string, unknown>).message as string;
        }
        if (typeof record.reason === 'string' && record.reason.trim()) {
          return record.reason;
        }
      }
      return fallback;
    }

    let setupFinished = false;
    let errorSent = false;

    try {
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
          inputAudioTranscription: {
            languageCodes: [],
          },
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (!content) return;

            if (content.inputTranscription?.text) {
              sendWsJson(clientWs, {
                type: 'input_transcript',
                text: content.inputTranscription.text,
              });
            }

            if (content.outputTranscription?.text) {
              sendWsJson(clientWs, {
                type: 'output_transcript',
                text: content.outputTranscription.text,
              });
            }

            for (const part of content.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendWsJson(clientWs, {
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
            }

            if (content.interrupted) {
              sendWsJson(clientWs, { type: 'interrupted' });
            }

            if (content.turnComplete) {
              sendWsJson(clientWs, { type: 'turn_complete' });
            }
          },
          onerror: (err: unknown) => {
            const msg = extractLiveErrorMessage(
              err,
              'Gemini Live voice service reported a connection error.'
            );
            console.error('[VitalSense Live API onerror]', msg);
            if (setupFinished && !errorSent) {
              errorSent = true;
              sendWsJson(clientWs, {
                type: 'error',
                code: 'LIVE_API_ERROR',
                message: msg,
              });
            }
          },
          onclose: (event: unknown) => {
            if (!isClosing && setupFinished && clientWs.readyState === WebSocket.OPEN) {
              const reason = extractLiveErrorMessage(event, 'Live voice session ended.');
              console.warn('[VitalSense Live API onclose]', reason);
              sendWsJson(clientWs, {
                type: 'session_closed',
                reason,
              });
              clientWs.close(1000, 'Live session closed');
            }
          },
        },
      });
      if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
        cleanup();
        return;
      }
      setupFinished = true;
      sendWsJson(clientWs, {
        type: 'session_ready',
        model: 'gemini-3.8-live',
        memberName: snapshot.memberName,
      });
    } catch (err) {
      const msg = extractLiveErrorMessage(
        err,
        'Unable to start Gemini Live audio session.'
      );
      console.error('[VitalSense Live API connect failed]', msg);
      if (!errorSent) {
        errorSent = true;
        sendWsJson(clientWs, {
          type: 'error',
          code: 'LIVE_CONNECT_FAILED',
          message: msg,
        });
      }
      clientWs.close(1011, 'Unable to connect Live API');
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session || isClosing) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
        };

        if (msg.type === 'audio' && typeof msg.audio === 'string' && msg.audio.length > 0) {
          session.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          session.sendRealtimeInput({
            text: msg.text.trim(),
          });
        } else if (msg.type === 'end_session') {
          cleanup();
          clientWs.close(1000, 'Ended by user');
        }
      } catch {
        sendWsJson(clientWs, {
          type: 'error',
          code: 'INVALID_FRAME',
          message: 'Received malformed voice message frame.',
        });
      }
    });

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });
}
