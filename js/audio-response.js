// This module deliberately has no rendering, DOM, or audio-context dependencies.
export const AUDIO_RESPONSE_SIGNALS = Object.freeze([
	'bass-level', 'mid-level', 'treble-level', 'overall-level',
	'bass-hit', 'mid-hit', 'treble-hit', 'overall-hit',
]);
export const AUDIO_RESPONSE_TARGETS = Object.freeze(['size', 'bass', 'mid', 'treble', 'audioLevel', 'audioHit']);
const DEFAULT_SOURCES = ['overall-hit', 'bass-level', 'mid-level', 'treble-level', 'overall-level', 'overall-hit'];
const MAX_INPUT_MAPPINGS = 128;

export function createDefaultAudioResponseConfig() {
	return {
		version: 1,
		sensitivity: 1,
		mappings: AUDIO_RESPONSE_TARGETS.map((target, index) => ({
			target, source: DEFAULT_SOURCES[index], amount: 1, attack: 0.04, release: 0.35,
		})),
	};
}

export function normalizeAudioResponseMode(value) {
	return value === 'mapped-v1' || value === 'transient-v1' ? value : 'legacy';
}

function boundedNumber(value, fallback, min, max, label, warnings) {
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		warnings.push(`${label} must be a finite number; using ${fallback}.`);
		return fallback;
	}
	const normalized = Math.max(min, Math.min(max, value));
	if (normalized !== value) warnings.push(`${label} was clamped to ${normalized}.`);
	return normalized;
}

export function normalizeAudioResponseConfig(value) {
	const config = createDefaultAudioResponseConfig();
	const warnings = [];
	if (value === undefined || value === null) return { config, warnings };
	if (typeof value !== 'object' || Array.isArray(value) || value.version !== 1) {
		warnings.push('Unsupported audio-response configuration; using version 1 defaults.');
		return { config, warnings };
	}
	config.sensitivity = boundedNumber(value.sensitivity, 1, 0.1, 4, 'sensitivity', warnings);
	if (value.mappings === undefined) return { config, warnings };
	if (!Array.isArray(value.mappings)) {
		warnings.push('mappings must be an array; using default mappings.');
		return { config, warnings };
	}
	const mappings = new Map();
	if (value.mappings.length > MAX_INPUT_MAPPINGS) {
		warnings.push(`Only the first ${MAX_INPUT_MAPPINGS} mappings are processed.`);
	}
	for (const [index, mapping] of value.mappings.slice(0, MAX_INPUT_MAPPINGS).entries()) {
		if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)
			|| !AUDIO_RESPONSE_TARGETS.includes(mapping.target) || !AUDIO_RESPONSE_SIGNALS.includes(mapping.source)) {
			warnings.push(`mappings[${index}] has an unsupported target or source and was dropped.`);
			continue;
		}
		if (mappings.has(mapping.target)) warnings.push(`Duplicate target ${mapping.target}; the last valid mapping wins.`);
		mappings.set(mapping.target, {
			target: mapping.target,
			source: mapping.source,
			amount: boundedNumber(mapping.amount, 1, 0, 4, `mappings[${index}].amount`, warnings),
			attack: boundedNumber(mapping.attack, 0.04, 0, 2, `mappings[${index}].attack`, warnings),
			release: boundedNumber(mapping.release, 0.35, 0, 5, `mappings[${index}].release`, warnings),
		});
	}
	config.mappings = [...mappings.values()];
	return { config, warnings };
}
