export type AudioAnalysisBand = 'bass' | 'mid' | 'treble' | 'overall';
export interface AudioAnalysisHit {
  band: AudioAnalysisBand;
  time: number;
  strength: number;
}
export interface AudioAnalysisFrame {
  sequence: number;
  time: number;
  levels: Record<AudioAnalysisBand, number>;
  hits: AudioAnalysisHit[];
}
export type AudioAnalysisStatus = 'idle' | 'connecting' | 'connected' | 'unsupported' | 'error' | 'disposed';
export interface AudioAnalysisSnapshot {
  status: AudioAnalysisStatus;
  error: string | null;
  frame: AudioAnalysisFrame | null;
  queuedFrames: number;
  droppedFrames: number;
}
/** Optional spectrum from the existing FFT; independent of audio response frames. */
export interface AudioSpectrumSnapshot {
  /** AudioContext time, in seconds. */
  time: number;
  minHz: number;
  maxHz: number;
  /** Up to 36 low-to-high RMS slices in [0, 1], approximately logarithmic.
   * Each slice includes at least one distinct FFT bin; low slices therefore
   * reflect the existing FFT resolution rather than synthetic interpolation. */
  values: number[];
}
export interface AudioAnalysisSource {
  context: AudioContext;
  getOutput(): AudioNode;
}
export declare class AudioAnalysisKernel {
  constructor(sampleRate: number, sensitivity?: number);
  readonly sampleRate: number;
  readonly hopSize: number;
  readonly sensitivity: number;
  setSensitivity(value: unknown): number;
  setSpectrumEnabled(enabled: boolean): void;
  /** Null when disabled, warming up, or more than 0.5 seconds from now. */
  spectrum(now: number): AudioSpectrumSnapshot | null;
  reset(): void;
  process(channels: Float32Array[], startTime: number): AudioAnalysisFrame[];
}
export declare function createAudioAnalysisWorkletSource(): string;
export declare class AudioAnalysisSession {
  constructor(options?: { sensitivity?: number; nodeFactory?: (context: AudioContext, name: string, options: AudioWorkletNodeOptions) => AudioWorkletNode });
  readonly status: AudioAnalysisStatus;
  readonly error: string | null;
  readonly sensitivity: number;
  setSensitivity(value: unknown): number;
  /** Off by default. Reset/reconnect preserve the preference, but clear its cache. */
  setSpectrumEnabled(enabled: boolean): void;
  /** Returns a copy at most 0.5 seconds old. Does not consume queued response frames. */
  spectrum(now: number): AudioSpectrumSnapshot | null;
  connect(source: AudioAnalysisSource): Promise<boolean>;
  reset(): void;
  disconnect(): void;
  dispose(): void;
  drain(now: number): AudioAnalysisFrame[];
  snapshot(now: number): AudioAnalysisSnapshot;
}
