import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { AudioAnalysisKernel, AudioAnalysisSession, createAudioAnalysisWorkletSource } from '../js/audio-analysis.js';
import { AudioAnalysisKernel as PackagedKernel } from '../dist/audio-analysis.js';

const rate = 48000;
const tone = (hz, length = rate / 2, amplitude = 0.6, sampleRate = rate) =>
  Float32Array.from({ length }, (_, index) => amplitude * Math.sin(2 * Math.PI * hz * index / sampleRate));

function analyze(channels, Kernel = AudioAnalysisKernel, sampleRate = rate) {
  const kernel = new Kernel(sampleRate);
  kernel.setSpectrumEnabled(true);
  kernel.process(channels, 0);
  return kernel.spectrum(channels[0].length / sampleRate);
}

for (const [name, Kernel] of [['source', AudioAnalysisKernel], ['package', PackagedKernel]]) {
  test(`${name}: spectrum localizes bass, mid and treble tones at both common sample rates`, () => {
    for (const sampleRate of [44100, 48000]) {
      const peaks = [];
      for (const hz of [sampleRate / 512, sampleRate / 32, sampleRate / 8]) {
        const snapshot = analyze([tone(hz, sampleRate / 2, 0.6, sampleRate)], Kernel, sampleRate);
        assert.equal(snapshot.values.length, 36);
        assert.equal(snapshot.minHz, 40);
        assert.equal(snapshot.maxHz, 8000);
        const peak = snapshot.values.indexOf(Math.max(...snapshot.values));
        peaks.push(peak);
        assert.ok(snapshot.values[peak] > 0.3);
        assert.ok(snapshot.values.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
        assert.ok(snapshot.values.filter((_, index) => Math.abs(index - peak) > 1).every(value => value < 0.001));
      }
      assert.ok(peaks[0] < 6, `bass belongs at the low end: ${peaks}`);
      assert.ok(peaks[1] > peaks[0] + 6 && peaks[1] < peaks[2] - 6, `distinct frequency locations: ${peaks}`);
    }
  });

  test(`${name}: stereo spectrum averages channel power, including opposite-phase signals`, () => {
    const low = tone(93.75), high = tone(6000);
    const monoLow = analyze([low], Kernel).values;
    const monoHigh = analyze([high], Kernel).values;
    const stereo = analyze([low, high], Kernel).values;
    const oppositePhase = analyze([low, Float32Array.from(low, value => -value)], Kernel).values;
    assert.deepEqual(oppositePhase, monoLow);
    for (let index = 0; index < stereo.length; index++) {
      assert.ok(Math.abs(stereo[index] - Math.sqrt((monoLow[index] ** 2 + monoHigh[index] ** 2) / 2)) < 0.0003);
    }
    assert.deepEqual(analyze([new Float32Array(rate / 2)], Kernel).values, Array(36).fill(0));
  });
}

test('spectrum is opt-in and never adds an FFT or changes response levels/hits', () => {
  const samples = Float32Array.from({ length: rate * 2 }, (_, index) => {
    const envelope = index % (rate / 4) < rate / 10 ? 0.8 : 0.02;
    return envelope * (Math.sin(2 * Math.PI * 90 * index / rate) + Math.sin(2 * Math.PI * 1400 * index / rate)) / 2;
  });
  const run = enabled => {
    const kernel = new AudioAnalysisKernel(rate);
    kernel.setSpectrumEnabled(enabled);
    let transforms = 0;
    const transform = kernel.transform;
    kernel.transform = function () { transforms++; return transform.call(this); };
    const frames = [], spectrumTimes = [];
    for (let offset = 0; offset < samples.length; offset += 128) {
      frames.push(...kernel.process([samples.subarray(offset, offset + 128)], offset / rate));
      const snapshot = kernel.spectrum((offset + 128) / rate);
      if (snapshot && spectrumTimes.at(-1) !== snapshot.time) spectrumTimes.push(snapshot.time);
    }
    return { kernel, transforms, frames, spectrumTimes };
  };
  const off = run(false), on = run(true);
  assert.deepEqual(on.frames, off.frames);
  assert.ok(on.frames.some(frame => frame.hits.length > 0), 'fixture must exercise actual hit detection');
  assert.equal(on.transforms, off.transforms);
  assert.equal(off.kernel.spectrumBounds, null, 'disabled analysis allocates no spectrum aggregation storage');
  assert.deepEqual(off.spectrumTimes, []);
  assert.equal(on.spectrumTimes.length, 20);
  assert.ok(on.spectrumTimes.every((time, index, times) => index === 0 || time - times[index - 1] >= 0.1 - 1e-9));
});

test('kernel clears disabled/reset spectrum, preserves opt-in, and never returns a stale or mutable cache', () => {
  const kernel = new AudioAnalysisKernel(rate);
  assert.equal(kernel.spectrum(0), null);
  kernel.setSpectrumEnabled(true);
  kernel.process([tone(1500)], 0);
  const snapshot = kernel.spectrum(0.5);
  snapshot.values.fill(1);
  assert.notDeepEqual(kernel.spectrum(0.5), snapshot);
  assert.equal(kernel.spectrum(2), null);
  assert.equal(kernel.spectrum(NaN), null);
  kernel.reset();
  assert.equal(kernel.spectrum(0.5), null);
  kernel.process([tone(1500)], 1);
  assert.ok(kernel.spectrum(1.5));
  kernel.setSpectrumEnabled(false);
  assert.equal(kernel.spectrum(1.5), null);
  kernel.setSpectrumEnabled(true);
  assert.equal(kernel.spectrum(1.5), null);
  kernel.process([tone(1500)], 1.5);
  assert.ok(kernel.spectrum(2));
});

test('worklet transmits optional spectrum at most 10Hz and stops immediately when disabled', () => {
  const messages = [];
  let Processor;
  const sandbox = {
    sampleRate: rate,
    currentTime: 0,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: message => messages.push(message) }; } },
    registerProcessor: (_, constructor) => { Processor = constructor; },
  };
  vm.runInNewContext(createAudioAnalysisWorkletSource(), sandbox);
  const processor = new Processor({ processorOptions: { epoch: 1, spectrumEpoch: 0, spectrumEnabled: false, sensitivity: 1 } });
  const samples = tone(1500, rate * 3);
  const processRange = (start, end) => {
    for (let offset = start; offset < end; offset += 128) {
      sandbox.currentTime = offset / rate;
      processor.process([[samples.subarray(offset, Math.min(offset + 128, end))]], [[new Float32Array(128)]]);
    }
  };
  processRange(0, rate);
  assert.equal(messages.filter(message => message.spectrum).length, 0);
  processor.port.onmessage({ data: { type: 'spectrum', enabled: true, spectrumEpoch: 1 } });
  processRange(rate, rate * 2);
  const spectrumMessages = messages.filter(message => message.spectrum);
  assert.equal(spectrumMessages.length, 10);
  assert.ok(spectrumMessages.every(message => message.epoch === 1 && message.spectrumEpoch === 1));
  assert.ok(spectrumMessages.every((message, index) => index === 0 || message.spectrum.time - spectrumMessages[index - 1].spectrum.time >= 0.1 - 1e-9));
  processor.port.onmessage({ data: { type: 'spectrum', enabled: false, spectrumEpoch: 2 } });
  processRange(rate * 2, rate * 3);
  assert.equal(messages.filter(message => message.spectrum).length, 10);
  assert.ok(messages.filter(message => message.frames).length > 100, 'normal analysis continues while the inspector is closed');
});

function sessionFixture() {
  const sent = [], nodes = [];
  const context = { currentTime: 1, destination: {}, audioWorklet: { async addModule() {} } };
  const output = { connect() {}, disconnect() {} };
  const session = new AudioAnalysisSession({ nodeFactory: (_, __, options) => {
    const node = { options, port: { postMessage: message => sent.push(message), close() {} }, connect() {}, disconnect() {} };
    nodes.push(node);
    return node;
  } });
  return { session, context, source: { context, getOutput: () => output }, sent, nodes };
}

test('session spectrum cache is independent of drain and generation-gated across toggles/reset/reconnect', async () => {
  const { session, source, sent, nodes } = sessionFixture();
  await session.connect(source);
  const node = nodes[0];
  assert.equal(node.options.processorOptions.spectrumEnabled, false);
  const snapshot = { time: 1, minHz: 40, maxHz: 8000, values: Array(36).fill(0.2) };
  const frame = { time: 1, sequence: 1, levels: { bass: 0.3, mid: 0.2, treble: 0.1, overall: 0.4 }, hits: [] };
  const receive = (spectrumEpoch, spectrum = snapshot) => node.port.onmessage({ data: { epoch: session.epoch, spectrumEpoch, spectrum } });
  receive(0);
  assert.equal(session.spectrum(1), null);
  node.port.onmessage({ data: { epoch: session.epoch, frames: [frame] } });
  const responseEpoch = session.epoch;
  session.setSpectrumEnabled(true);
  const enabledEpoch = sent.at(-1).spectrumEpoch;
  assert.equal(session.epoch, responseEpoch, 'inspector toggles do not invalidate music analysis');
  receive(enabledEpoch);
  assert.deepEqual(session.drain(1), [frame]);
  assert.deepEqual(session.spectrum(1), snapshot, 'draining response frames cannot consume spectrum');
  session.spectrum(1).values.fill(1);
  assert.deepEqual(session.spectrum(1), snapshot);
  assert.equal(session.spectrum(1.6), null);
  const sentBefore = sent.length;
  session.setSpectrumEnabled(true);
  assert.equal(sent.length, sentBefore, 'repeated preference sync is a no-op');
  session.setSpectrumEnabled(false);
  assert.equal(session.spectrum(1), null);
  session.setSpectrumEnabled(true);
  receive(enabledEpoch);
  assert.equal(session.spectrum(1), null, 'old queued spectra cannot cross close/reopen');
  receive(sent.at(-1).spectrumEpoch);
  assert.ok(session.spectrum(1));
  const previousEpoch = session.epoch;
  session.reset();
  assert.equal(session.spectrum(1), null);
  node.port.onmessage({ data: { epoch: previousEpoch, spectrumEpoch: session.spectrumEpoch, spectrum: snapshot } });
  assert.equal(session.spectrum(1), null);
  receive(session.spectrumEpoch);
  assert.ok(session.spectrum(1), 'reset keeps the requested opt-in');
  const staleHandler = node.port.onmessage;
  session.disconnect();
  staleHandler({ data: { epoch: session.epoch, spectrumEpoch: session.spectrumEpoch, spectrum: snapshot } });
  assert.equal(session.spectrum(1), null);
  await session.connect(source);
  assert.equal(nodes[1].options.processorOptions.spectrumEnabled, true);
  session.dispose();
  session.setSpectrumEnabled(true);
  assert.equal(session.spectrum(1), null);
  assert.equal(session.spectrumEnabled, false);
});

test('session ignores malformed, oversized and stale spectra without interrupting response frames', async () => {
  const { session, source, nodes } = sessionFixture();
  session.setSpectrumEnabled(true);
  await session.connect(source);
  const node = nodes[0];
  const base = { time: 1, minHz: 40, maxHz: 8000, values: Array(36).fill(0.2) };
  for (const bad of [
    { ...base, time: 0 }, { ...base, time: 2 }, { ...base, values: Array(37).fill(0) },
    { ...base, values: [NaN] }, { ...base, values: [-1] }, { ...base, values: [2] },
    { ...base, minHz: 0 }, { ...base, maxHz: Infinity },
  ]) {
    node.port.onmessage({ data: { epoch: session.epoch, spectrumEpoch: session.spectrumEpoch, spectrum: bad } });
    assert.equal(session.spectrum(1), null);
    assert.equal(session.status, 'connected');
  }
  node.port.onmessage({ data: { epoch: session.epoch, spectrumEpoch: session.spectrumEpoch, spectrum: base } });
  assert.deepEqual(session.spectrum(1), base);
});
