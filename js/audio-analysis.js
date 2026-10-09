/** Pure sample-driven kernel, also embedded verbatim in the AudioWorklet. */
export class AudioAnalysisKernel {
	constructor(sampleRate, sensitivity = 1) {
		this.sampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48000;
		this.hopSize = Math.max(1, Math.round(this.sampleRate * 0.01));
		this.fftSize = 2048;
		this.window = Float64Array.from({ length: this.fftSize }, (_, index) => 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (this.fftSize - 1)));
		this.windowPower = this.window.reduce((sum, value) => sum + value * value, 0);
		this.real = new Float64Array(this.fftSize);
		this.imaginary = new Float64Array(this.fftSize);
		this.setSensitivity(sensitivity);
		this.reset();
	}
	setSensitivity(value) {
		const next = typeof value === 'number' && Number.isFinite(value) ? Math.max(0.1, Math.min(4, value)) : 1;
		if (next !== this.sensitivity) {
			this.sensitivity = next;
			// Keep learned dynamics and cooldown while tuning; only discard an
			// unfinished onset that began with the previous threshold.
			if (this.detectors) for (const detector of Object.values(this.detectors)) detector.pendingStrength = 0;
		}
		return next;
	}
	reset() {
		this.sequence = 0;
		this.sampleCount = 0;
		this.energy = 0;
		this.valueCount = 0;
		this.expectedTime = null;
		this.rings = [];
		this.ringPosition = 0;
		this.ringCount = 0;
		this.detectors = null;
	}
	transform() {
		const real = this.real, imaginary = this.imaginary, size = this.fftSize;
		for (let index = 1, reversed = 0; index < size; index++) {
			let bit = size >> 1;
			for (; reversed & bit; bit >>= 1) reversed ^= bit;
			reversed ^= bit;
			if (index < reversed) {
				const value = real[index]; real[index] = real[reversed]; real[reversed] = value;
			}
		}
		for (let width = 2; width <= size; width *= 2) {
			const angle = -2 * Math.PI / width;
			const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
			for (let start = 0; start < size; start += width) {
				let twiddleReal = 1, twiddleImaginary = 0;
				for (let offset = 0; offset < width / 2; offset++) {
					const left = start + offset, right = left + width / 2;
					const oddReal = real[right] * twiddleReal - imaginary[right] * twiddleImaginary;
					const oddImaginary = real[right] * twiddleImaginary + imaginary[right] * twiddleReal;
					real[right] = real[left] - oddReal;
					imaginary[right] = imaginary[left] - oddImaginary;
					real[left] += oddReal;
					imaginary[left] += oddImaginary;
					const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
					twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
					twiddleReal = nextReal;
				}
			}
		}
	}
	bandLevels() {
		const powers = { bass: 0, mid: 0, treble: 0 };
		if (this.ringCount < this.fftSize) return powers;
		for (const ring of this.rings) {
			for (let index = 0; index < this.fftSize; index++) this.real[index] = ring[(this.ringPosition + index) % this.fftSize] * this.window[index];
			this.imaginary.fill(0);
			this.transform();
			for (let bin = 1; bin < this.fftSize / 2; bin++) {
				const hz = bin * this.sampleRate / this.fftSize;
				const band = hz >= 40 && hz < 180 ? 'bass' : hz >= 180 && hz < 2000 ? 'mid' : hz >= 2000 && hz <= 8000 ? 'treble' : null;
				if (band) powers[band] += this.real[bin] ** 2 + this.imaginary[bin] ** 2;
			}
		}
		const scale = 2 / (this.fftSize * this.windowPower * this.rings.length);
		for (const band of ['bass', 'mid', 'treble']) {
			const rms = Math.sqrt(powers[band] * scale);
			powers[band] = rms < 0.0003 ? 0 : Math.min(1, rms);
		}
		return powers;
	}
	detectHits(levels, time) {
		if (this.ringCount < this.fftSize) return [];
		if (!this.detectors) {
			this.detectors = Object.fromEntries(['bass', 'mid', 'treble'].map(band => [band, { previous: levels[band], baseline: levels[band], peak: levels[band], pendingStrength: 0, lastHit: -Infinity }]));
			return [];
		}
		const hits = [];
		for (const band of ['bass', 'mid', 'treble']) {
			const detector = this.detectors[band], level = levels[band];
			const novelty = Math.max(0, level - detector.previous);
			// Keep recent accents as a reference through the trough between beats.
			// A short-lived baseline alone makes every isolated rise a full-strength hit.
			detector.peak = Math.max(level, detector.peak * Math.exp(-this.hopSize / this.sampleRate / 2));
			const reference = Math.max(0.003, detector.peak);
			const prominence = Math.max(0, level - detector.baseline) / reference;
			const score = novelty > Math.max(0.0006, detector.peak * 0.03) ? prominence : 0;
			// Finish measuring the onset before applying sensitivity. This keeps a
			// more sensitive setting from firing early with a weaker pulse.
			if (score > detector.pendingStrength) detector.pendingStrength = score;
			else if (detector.pendingStrength > 0) {
				const threshold = 0.85 * Math.pow(0.035 / 0.85, (this.sensitivity - 0.1) / 3.9);
				if (detector.pendingStrength >= threshold && time - detector.lastHit >= 0.1) {
					hits.push({ band, time, strength: detector.pendingStrength });
					detector.lastHit = time;
				}
				detector.pendingStrength = 0;
			}
			detector.baseline += (level - detector.baseline) * (level > detector.baseline ? 0.08 : 0.3);
			detector.previous = level;
		}
		if (hits.length) hits.push({ band: 'overall', time, strength: Math.max(...hits.map(hit => hit.strength)) });
		return hits;
	}
	process(channels, startTime) {
		if (!Array.isArray(channels) || channels.length === 0 || !Number.isFinite(startTime)) return [];
		const length = channels[0]?.length || 0;
		if (!length) return [];
		if (this.expectedTime !== null && Math.abs(startTime - this.expectedTime) > 1.5 / this.sampleRate) {
			this.reset();
		}
		if (channels.length !== this.rings.length) {
			this.reset();
			this.rings = channels.map(() => new Float64Array(this.fftSize));
		}
		const frames = [];
		for (let index = 0; index < length; index++) {
			for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
				const channel = channels[channelIndex];
				const value = Number.isFinite(channel[index]) ? channel[index] : 0;
				this.energy += value * value;
				this.valueCount++;
				this.rings[channelIndex][this.ringPosition] = value;
			}
			this.ringPosition = (this.ringPosition + 1) % this.fftSize;
			this.ringCount = Math.min(this.fftSize, this.ringCount + 1);
			this.sampleCount++;
			if (this.sampleCount === this.hopSize) {
				const time = startTime + (index + 1) / this.sampleRate;
				const levels = { ...this.bandLevels(), overall: Math.min(1, Math.sqrt(this.energy / this.valueCount)) };
				frames.push({
					sequence: ++this.sequence,
					time, levels, hits: this.detectHits(levels, time),
				});
				this.sampleCount = 0;
				this.energy = 0;
				this.valueCount = 0;
			}
		}
		this.expectedTime = startTime + length / this.sampleRate;
		return frames;
	}
}

export function createAudioAnalysisWorkletSource() {
	return `const AudioAnalysisKernel = ${AudioAnalysisKernel.toString()};
class MAGEAudioAnalysisProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.kernel = new AudioAnalysisKernel(sampleRate, options.processorOptions.sensitivity);
    this.epoch = options.processorOptions.epoch;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'reset') {
        this.epoch = data.epoch;
        this.kernel.reset();
        this.kernel.setSensitivity(data.sensitivity);
      } else if (data?.type === 'sensitivity') {
        this.epoch = data.epoch;
        this.kernel.setSensitivity(data.value);
      }
    };
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const frames = this.kernel.process(inputs[0] || [], currentTime);
    if (frames.length) this.port.postMessage({ epoch: this.epoch, frames });
    return true;
  }
}
registerProcessor('mage-audio-analysis-v1', MAGEAudioAnalysisProcessor);
`;
}

const MAX_QUEUE = 512;
const MAX_AGE = 1;
const contextModules = new WeakMap();

function copyFrame(frame) {
	return { ...frame, levels: { ...frame.levels }, hits: frame.hits.map(hit => ({ ...hit })) };
}

function loadModule(context) {
	let loading = contextModules.get(context);
	if (!loading) {
		loading = (async () => {
			const url = URL.createObjectURL(new Blob([createAudioAnalysisWorkletSource()], { type: 'text/javascript' }));
			try { await context.audioWorklet.addModule(url); }
			finally { URL.revokeObjectURL(url); }
		})();
		contextModules.set(context, loading);
		loading.catch(() => { if (contextModules.get(context) === loading) contextModules.delete(context); });
	}
	return loading;
}

export class AudioAnalysisSession {
	constructor({ nodeFactory, sensitivity = 1 } = {}) {
		this.nodeFactory = nodeFactory || ((context, name, options) => new AudioWorkletNode(context, name, options));
		this._status = 'idle';
		this.error = null;
		this.generation = 0;
		this.epoch = 0;
		this.node = null;
		this.source = null;
		this.output = null;
		this.context = null;
		this.frames = [];
		this.latest = null;
		this.droppedFrames = 0;
		this.sensitivity = typeof sensitivity === 'number' && Number.isFinite(sensitivity) ? Math.max(0.1, Math.min(4, sensitivity)) : 1;
	}
	get status() { return this._status; }
	setSensitivity(value) {
		const next = typeof value === 'number' && Number.isFinite(value) ? Math.max(0.1, Math.min(4, value)) : 1;
		if (this._status === 'disposed') return this.sensitivity;
		if (this.sensitivity !== next) {
			this.sensitivity = next;
			this.epoch++;
			this.frames.length = 0;
			this.latest = null;
			this.node?.port.postMessage({ type: 'sensitivity', value: next, epoch: this.epoch });
		}
		return next;
	}
	async connect(source) {
		if (this._status === 'disposed') return false;
		if (this.source === source && this._status === 'connected') return true;
		this.disconnect();
		const generation = this.generation;
		const context = source?.context;
		if (!context?.audioWorklet?.addModule || typeof source?.getOutput !== 'function'
			|| typeof URL.createObjectURL !== 'function') {
			this._status = 'unsupported';
			this.error = 'AudioWorklet analysis is unavailable in this browser or audio context.';
			return false;
		}
		this.context = context;
		this.source = source;
		this._status = 'connecting';
		try {
			await loadModule(context);
			if (generation !== this.generation || this._status === 'disposed') return false;
			const node = this.nodeFactory(context, 'mage-audio-analysis-v1', {
				numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
				processorOptions: { epoch: this.epoch, sensitivity: this.sensitivity },
			});
			this.node = node;
			this.output = source.getOutput();
			node.port.onmessage = ({ data }) => {
				if (generation !== this.generation || data?.epoch !== this.epoch || !Array.isArray(data.frames)) return;
				for (const frame of data.frames) {
					if (!Number.isFinite(frame?.time) || !frame.levels || !Array.isArray(frame.hits)) continue;
					if (context.currentTime - frame.time > MAX_AGE) { this.droppedFrames++; continue; }
					if (this.latest && frame.time < this.latest.time) this.frames.length = 0;
					this.latest = copyFrame(frame);
					this.frames.push(this.latest);
				}
				if (this.frames.length > MAX_QUEUE) {
					this.droppedFrames += this.frames.length - MAX_QUEUE;
					this.frames.splice(0, this.frames.length - MAX_QUEUE);
				}
			};
			node.onprocessorerror = () => {
				if (generation !== this.generation) return;
				this.disconnect();
				this._status = 'error';
				this.error = 'Audio analysis processor failed.';
			};
			this.output.connect(node);
			node.connect(context.destination);
			this._status = 'connected';
			return true;
		} catch (error) {
			if (generation !== this.generation || this._status === 'disposed') return false;
			this.disconnect();
			this._status = 'error';
			this.error = error instanceof Error ? error.message : String(error);
			return false;
		}
	}
	reset() {
		if (this._status === 'disposed') return;
		if (this._status === 'connecting') { this.disconnect(); return; }
		this.epoch++;
		this.frames.length = 0;
		this.latest = null;
		this.droppedFrames = 0;
		this.node?.port.postMessage({ type: 'reset', epoch: this.epoch, sensitivity: this.sensitivity });
	}
	disconnect() {
		this.generation++;
		this.epoch++;
		if (this.node) {
			this.node.port.onmessage = null;
			this.node.onprocessorerror = null;
			try { this.output?.disconnect(this.node); } catch { /* The audio graph may already be closed. */ }
			try { this.node.disconnect(); } catch { /* The audio graph may already be closed. */ }
			this.node.port.close?.();
		}
		this.node = null;
		this.source = null;
		this.output = null;
		this.context = null;
		this.frames.length = 0;
		this.latest = null;
		this.droppedFrames = 0;
		this.error = null;
		if (this._status !== 'disposed') this._status = 'idle';
	}
	drain(now) {
		if (!Number.isFinite(now)) return [];
		const ready = [];
		const future = [];
		for (const frame of this.frames) {
			if (now - frame.time > MAX_AGE || frame.time - now > MAX_AGE) this.droppedFrames++;
			else if (frame.time <= now) ready.push(copyFrame(frame));
			else future.push(frame);
		}
		this.frames = future;
		if (this.latest && Math.abs(now - this.latest.time) > MAX_AGE) this.latest = null;
		return ready;
	}
	snapshot(now) {
		const fresh = Number.isFinite(now) && this.latest && Math.abs(now - this.latest.time) <= MAX_AGE;
		return {
			status: this._status, error: this.error, frame: fresh ? copyFrame(this.latest) : null,
			queuedFrames: this.frames.length, droppedFrames: this.droppedFrames,
		};
	}
	dispose() {
		this.disconnect();
		this._status = 'disposed';
	}
}
