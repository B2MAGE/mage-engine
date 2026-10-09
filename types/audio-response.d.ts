export type AudioResponseMode = 'legacy' | 'transient-v1' | 'mapped-v1';
export type AudioResponseSignal = 'bass-level' | 'mid-level' | 'treble-level' | 'overall-level' | 'bass-hit' | 'mid-hit' | 'treble-hit' | 'overall-hit';
export type AudioResponseTarget = 'size' | 'bass' | 'mid' | 'treble' | 'audioLevel' | 'audioHit';
export interface AudioResponseMapping {
  target: AudioResponseTarget;
  source: AudioResponseSignal;
  amount: number;
  /** Attack time in seconds. */
  attack: number;
  /** Release time in seconds. */
  release: number;
}
export interface AudioResponseConfig {
  version: 1;
  sensitivity: number;
  mappings: AudioResponseMapping[];
}
export interface NormalizedAudioResponseConfig {
  config: AudioResponseConfig;
  warnings: string[];
}
export declare const AUDIO_RESPONSE_SIGNALS: readonly AudioResponseSignal[];
export declare const AUDIO_RESPONSE_TARGETS: readonly AudioResponseTarget[];
export declare function createDefaultAudioResponseConfig(): AudioResponseConfig;
export declare function normalizeAudioResponseMode(value: unknown): AudioResponseMode;
export declare function normalizeAudioResponseConfig(value: unknown): NormalizedAudioResponseConfig;
