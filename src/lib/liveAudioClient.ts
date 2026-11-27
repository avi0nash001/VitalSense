import {
  computeRmsLevel,
  decodeBase64ToFloat32Pcm,
  downsampleFloat32To16k,
  encodePcm16ToBase64,
} from './voiceAssistant';

export interface LiveAudioCallbacks {
  onAudioChunkBase64: (base64Pcm16k: string) => void;
  onInputLevel?: (level: number) => void;
  onOutputLevel?: (level: number) => void;
  onPlaybackEnded?: () => void;
}

/**
 * Coordinates 16kHz microphone PCM capture and 24kHz gapless scheduled PCM playback
 * with instant barge-in interruption for the Gemini Live API.
 */
export class LiveAudioClient {
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteGainNode: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private levelRafId: number | null = null;
  private callbacks: LiveAudioCallbacks;
  private isDisposed = false;

  constructor(callbacks: LiveAudioCallbacks) {
    this.callbacks = callbacks;
  }

  private getAudioContextConstructor(): typeof AudioContext {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Web Audio is not supported in this browser.');
    }
    return AudioCtx;
  }

  /**
   * Call synchronously inside the user's click handler so both AudioContexts
   * unlock before any async token fetch or WebSocket handshake.
   */
  prepareAudioContexts(): void {
    if (this.isDisposed) return;
    const AudioCtx = this.getAudioContextConstructor();
    if (!this.inputCtx || this.inputCtx.state === 'closed') {
      try {
        this.inputCtx = new AudioCtx({ sampleRate: 16000 });
      } catch {
        this.inputCtx = new AudioCtx();
      }
    }
    if (this.inputCtx.state === 'suspended') {
      void this.inputCtx.resume().catch(() => undefined);
    }
    this.ensureOutputContext();
  }

  async startMicrophone(): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      throw new Error(
        'Microphone capture requires a secure HTTPS or localhost connection. Type your question below instead.'
      );
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Microphone access is not supported in this browser. You can still type below.'
      );
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const errName =
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        typeof (err as { name?: unknown }).name === 'string'
          ? (err as { name: string }).name
          : '';
      if (errName === 'OverconstrainedError' || errName === 'TypeError') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw err;
      }
    }

    if (this.isDisposed) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }

    this.micStream = stream;
    this.prepareAudioContexts();

    if (!this.inputCtx || this.inputCtx.state === 'closed') {
      const AudioCtx = this.getAudioContextConstructor();
      try {
        this.inputCtx = new AudioCtx({ sampleRate: 16000 });
      } catch {
        this.inputCtx = new AudioCtx();
      }
    }

    if (this.inputCtx.state === 'suspended') {
      await this.inputCtx.resume().catch(() => undefined);
    }

    this.sourceNode = this.inputCtx.createMediaStreamSource(this.micStream);
    this.processorNode = this.inputCtx.createScriptProcessor(4096, 1, 1);
    this.muteGainNode = this.inputCtx.createGain();
    this.muteGainNode.gain.value = 0;

    this.processorNode.onaudioprocess = (event) => {
      if (this.isDisposed || !this.inputCtx) return;
      const channelData = event.inputBuffer.getChannelData(0);
      const level = computeRmsLevel(channelData);
      this.callbacks.onInputLevel?.(level);

      const resampled = downsampleFloat32To16k(
        channelData,
        this.inputCtx.sampleRate
      );
      const base64 = encodePcm16ToBase64(resampled);
      this.callbacks.onAudioChunkBase64(base64);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.muteGainNode);
    this.muteGainNode.connect(this.inputCtx.destination);
  }

  private ensureOutputContext(): AudioContext {
    if (!this.outputCtx || this.outputCtx.state === 'closed') {
      const AudioCtx = this.getAudioContextConstructor();
      try {
        this.outputCtx = new AudioCtx({ sampleRate: 24000 });
      } catch {
        this.outputCtx = new AudioCtx();
      }
      this.outputAnalyser = this.outputCtx.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.connect(this.outputCtx.destination);
      this.startOutputMeterLoop();
    }
    if (this.outputCtx.state === 'suspended') {
      void this.outputCtx.resume().catch(() => undefined);
    }
    return this.outputCtx;
  }

  private startOutputMeterLoop(): void {
    if (this.levelRafId !== null) return;
    const freqData = new Uint8Array(64);
    const tick = () => {
      if (this.isDisposed) return;
      if (this.outputAnalyser && this.activeSources.size > 0) {
        this.outputAnalyser.getByteFrequencyData(freqData);
        let total = 0;
        for (let i = 0; i < freqData.length; i++) total += freqData[i];
        const norm = Math.min(1, total / (freqData.length * 140));
        this.callbacks.onOutputLevel?.(norm);
      } else {
        this.callbacks.onOutputLevel?.(0);
      }
      this.levelRafId = window.requestAnimationFrame(tick);
    };
    this.levelRafId = window.requestAnimationFrame(tick);
  }

  playPcm24kBase64(base64Audio: string): void {
    if (this.isDisposed) return;
    const ctx = this.ensureOutputContext();
    if (ctx.state === 'closed') return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    const floatSamples = decodeBase64ToFloat32Pcm(base64Audio);
    if (floatSamples.length === 0) return;

    const buffer = ctx.createBuffer(1, floatSamples.length, 24000);
    buffer.getChannelData(0).set(floatSamples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (this.outputAnalyser) {
      source.connect(this.outputAnalyser);
    } else {
      source.connect(ctx.destination);
    }

    const startAt = Math.max(ctx.currentTime + 0.02, this.nextStartTime);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && !this.isDisposed) {
        this.callbacks.onPlaybackEnded?.();
      }
    };

    source.start(startAt);
  }

  interruptPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        // Ignore already-stopped audio buffer source
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
    this.callbacks.onOutputLevel?.(0);
  }

  hasActivePlayback(): boolean {
    return this.activeSources.size > 0;
  }

  stopMicrophone(): void {
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.muteGainNode) {
      this.muteGainNode.disconnect();
      this.muteGainNode = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }
    if (this.inputCtx) {
      void this.inputCtx.close().catch(() => undefined);
      this.inputCtx = null;
    }
    this.callbacks.onInputLevel?.(0);
  }

  dispose(): void {
    this.isDisposed = true;
    this.interruptPlayback();
    this.stopMicrophone();
    if (this.levelRafId !== null) {
      window.cancelAnimationFrame(this.levelRafId);
      this.levelRafId = null;
    }
    if (this.outputCtx) {
      void this.outputCtx.close().catch(() => undefined);
      this.outputCtx = null;
    }
    this.outputAnalyser = null;
  }
}
