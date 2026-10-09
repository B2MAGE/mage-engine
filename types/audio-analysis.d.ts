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
  connect(source: AudioAnalysisSource): Promise<boolean>;
  reset(): void;
  disconnect(): void;
  dispose(): void;
  drain(now: number): AudioAnalysisFrame[];
  snapshot(now: number): AudioAnalysisSnapshot;
}
