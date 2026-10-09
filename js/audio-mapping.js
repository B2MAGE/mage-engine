import { AUDIO_RESPONSE_TARGETS, normalizeAudioResponseConfig } from './audio-response.js';

const HOP = 0.01;
const MAX_EVENTS = 512;
const MAX_GAP = 1;
const BANDS = ['bass', 'mid', 'treble', 'overall'];
const emptyOutputs = () => Object.fromEntries(AUDIO_RESPONSE_TARGETS.map(target => [target, 0]));
const emptyLevels = () => Object.fromEntries(BANDS.map(band => [band, 0]));
const unit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const copyEvent = event => ({ ...event });

function follow(value, target, elapsed, attack, release) {
	const duration = target > value ? attack : release;
	return duration > 0 ? target + (value - target) * Math.exp(-elapsed / duration) : target;
}

/** A separate pulse for each hit, evaluated against audio time rather than render ticks. */
function pulse(age, attack, release) {
	if (age < 0) return 0;
	if (attack > 0 && age < attack) return age / attack;
	if (release === 0) return age - attack < HOP ? 1 : 0;
	return Math.exp(-(age - attack) / release);
}

/** Maps sampled measurements to visual controls without advancing analysis from rendering. */
export class AudioResponseMapper {
	constructor(config) {
		this.nextEventId = 1;
		this.setConfig(config);
	}
	setConfig(value) {
		const normalized = normalizeAudioResponseConfig(value);
		this.config = normalized.config;
		this.warnings = normalized.warnings;
		this.eventLifetime = Math.max(2, ...this.config.mappings.map(mapping => mapping.attack + mapping.release * 8 + HOP));
		this.reset();
		return { config: structuredClone(this.config), warnings: [...this.warnings] };
	}
	reset() {
		this.levelValues = emptyOutputs();
		this.outputs = emptyOutputs();
		this.levels = emptyLevels();
		this.events = [];
		this.lastTime = null;
		this.lastNow = null;
		this.lastSequence = null;
	}
	process(frames, now) {
		if (!Number.isFinite(now)) return { ...this.outputs };
		if (this.lastNow !== null && (now < this.lastNow || now - this.lastNow > MAX_GAP)) this.reset();
		this.lastNow = now;
		const ordered = Array.isArray(frames) ? frames.filter(frame => frame && Number.isFinite(frame.time)
			&& frame.time <= now + 1e-7 && now - frame.time <= MAX_GAP).sort((left, right) => left.time - right.time || left.sequence - right.sequence) : [];
		for (const frame of ordered) {
			if (this.lastTime !== null && frame.time <= this.lastTime + 1e-9) continue;
			if (this.lastSequence !== null && Number.isFinite(frame.sequence) && frame.sequence <= this.lastSequence) {
				// A newer timestamp with a restarted sequence identifies a fresh analysis epoch.
				this.reset();
				this.lastNow = now;
			}
			const elapsed = this.lastTime === null ? HOP : frame.time - this.lastTime;
			this.levels = Object.fromEntries(BANDS.map(band => [band, unit(frame.levels?.[band])]));
			for (const mapping of this.config.mappings) {
				if (!mapping.source.endsWith('-level')) continue;
				const band = mapping.source.slice(0, -6);
				this.levelValues[mapping.target] = follow(this.levelValues[mapping.target], this.levels[band], elapsed, mapping.attack, mapping.release);
			}
			for (const hit of Array.isArray(frame.hits) ? frame.hits : []) {
				if (!hit || !BANDS.includes(hit.band) || !Number.isFinite(hit.time) || hit.time > frame.time + 1e-7 || now - hit.time > this.eventLifetime) continue;
				const strength = unit(hit.strength);
				if (strength > 0) this.events.push({ id: this.nextEventId++, time: hit.time, band: hit.band, strength });
			}
			this.lastTime = frame.time;
			this.lastSequence = Number.isFinite(frame.sequence) ? frame.sequence : this.lastSequence;
		}
		if (this.lastTime !== null && now - this.lastTime > MAX_GAP) {
			this.reset();
			this.lastNow = now;
			return { ...this.outputs };
		}
		this.events = this.events.filter(event => now - event.time <= this.eventLifetime).slice(-MAX_EVENTS);
		const elapsed = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime);
		this.outputs = emptyOutputs();
		for (const mapping of this.config.mappings) {
			let value = 0;
			if (mapping.source.endsWith('-level')) {
				const band = mapping.source.slice(0, -6);
				// Projection never mutates the sampled state: more render calls cannot change the envelope.
				value = follow(this.levelValues[mapping.target], this.levels[band], elapsed, mapping.attack, mapping.release);
			} else {
				const band = mapping.source.slice(0, -4);
				for (const event of this.events) if (event.band === band) value = Math.max(value, event.strength * pulse(now - event.time, mapping.attack, mapping.release));
			}
			this.outputs[mapping.target] = Math.max(0, Math.min(4, value * mapping.amount));
		}
		return { ...this.outputs };
	}
	getSnapshot() {
		return { outputs: { ...this.outputs }, events: this.events.map(copyEvent), lastTime: this.lastTime };
	}
	getEvents(afterId = 0) {
		const cursor = Number.isFinite(afterId) ? afterId : 0;
		return this.events.filter(event => event.id > cursor).map(copyEvent);
	}
}

/** Deterministic sample frames for silent preview, consumed by the same mapper as real audio. */
export class SyntheticAudioFrames {
	constructor(seed = 0, tempoScale = 1) {
		this.configure(seed, tempoScale);
	}
	configure(seed = 0, tempoScale = 1, now) {
		this.seed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
		this.tempoScale = Number.isFinite(tempoScale) && tempoScale > 0 ? Math.max(0.25, Math.min(2, tempoScale)) : 1;
		this.reset(now);
	}
	reset(now) {
		this.origin = Number.isFinite(now) ? now : null;
		this.lastNow = this.origin;
		this.sequence = 0;
		this.lastBeat = -1;
		this.lastOffbeat = -1;
	}
	process(now) {
		if (!Number.isFinite(now)) return [];
		if (this.lastNow === null || now < this.lastNow || now - this.lastNow > MAX_GAP) {
			this.reset(now);
			return [];
		}
		this.lastNow = now;
		const count = Math.floor((now - this.origin + 1e-9) / HOP);
		const frames = [];
		const duration = 60 / ((96 + this.seed % 37) * this.tempoScale);
		while (this.sequence < count) {
			const sequence = ++this.sequence;
			const elapsed = sequence * HOP;
			const time = this.origin + elapsed;
			const beatPosition = elapsed / duration;
			const beat = Math.floor(beatPosition);
			const offbeatPosition = beatPosition + 0.5;
			const offbeat = Math.floor(offbeatPosition);
			const accent = 0.8 + Math.sin((beat + this.seed * 0.01) * 2.399963229728653) ** 2 * 0.2;
			const bass = Math.exp(-(beatPosition - beat) * 7.5) * accent;
			const treble = Math.exp(-(offbeatPosition - offbeat) * 12) * 0.65;
			const mid = (0.3 + Math.sin(elapsed * 2.17 + this.seed * 0.01) ** 2 * 0.3) * (0.7 + bass * 0.3);
			const hits = [];
			if (beat !== this.lastBeat) {
				hits.push({ band: 'bass', time, strength: accent });
				if (beat % 2 === 1) hits.push({ band: 'mid', time, strength: 0.65 });
			}
			if (offbeat !== this.lastOffbeat && sequence > 1) hits.push({ band: 'treble', time, strength: 0.65 });
			if (hits.length) hits.push({ band: 'overall', time, strength: Math.max(...hits.map(hit => hit.strength)) });
			this.lastBeat = beat;
			this.lastOffbeat = offbeat;
			frames.push({ sequence, time, levels: { bass, mid, treble, overall: Math.sqrt((bass ** 2 + mid ** 2 + treble ** 2) / 3) }, hits });
		}
		return frames;
	}
}
