import type { AudioResponseConfig, AudioResponseTarget, NormalizedAudioResponseConfig } from './audio-response.js';
import type { AudioAnalysisBand, AudioAnalysisFrame } from './audio-analysis.js';

export type AudioResponseOutputs = Record<AudioResponseTarget, number>;
export interface AudioResponseEvent {
  id: number;
  time: number;
  band: AudioAnalysisBand;
  strength: number;
}
export interface AudioResponseSnapshot {
  outputs: AudioResponseOutputs;
  events: AudioResponseEvent[];
  lastTime: number | null;
}
export declare class AudioResponseMapper {
  constructor(config?: unknown);
  readonly config: AudioResponseConfig;
  readonly warnings: string[];
  setConfig(config: unknown): NormalizedAudioResponseConfig;
  reset(): void;
  process(frames: AudioAnalysisFrame[], now: number): AudioResponseOutputs;
  getSnapshot(): AudioResponseSnapshot;
  /** Returns copies of retained events after a consumer-owned cursor; reads do not consume events. */
  getEvents(afterId?: number): AudioResponseEvent[];
}
export declare class SyntheticAudioFrames {
  constructor(seed?: number, tempoScale?: number);
  readonly seed: number;
  readonly tempoScale: number;
  configure(seed?: number, tempoScale?: number, now?: number): void;
  reset(now?: number): void;
  process(now: number): AudioAnalysisFrame[];
}
