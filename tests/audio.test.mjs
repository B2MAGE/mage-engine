import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioAnalysisKernel, AudioAnalysisSession } from '../js/audio-analysis.js';
import { AudioResponseMapper, SyntheticAudioFrames } from '../js/audio-mapping.js';

test('sample analysis is independent of audio buffer block size', () => {
  const rate = 48000;
  const samples = Float32Array.from({ length: 9600 }, (_, i) => Math.sin(2 * Math.PI * 80 * i / rate) * 0.6);
  const collect = blockSize => {
    const kernel = new AudioAnalysisKernel(rate);
    const frames = [];
    for (let offset = 0; offset < samples.length; offset += blockSize) {
      frames.push(...kernel.process([samples.subarray(offset, offset + blockSize)], offset / rate));
    }
    return frames;
  };
  const whole = collect(samples.length), chunked = collect(128);
  assert.equal(chunked.length, whole.length);
  for (let i = 0; i < whole.length; i++) {
    assert.deepEqual(chunked[i].levels, whole[i].levels);
    assert.ok(Math.abs(chunked[i].time - whole[i].time) < 1e-9);
  }
  assert.ok(whole.at(-1).levels.bass > whole.at(-1).levels.treble);
});

test('synthetic audio mappings do not change with render frequency', () => {
  const render = fps => {
    const source = new SyntheticAudioFrames(42);
    const mapper = new AudioResponseMapper();
    source.process(0);
    let output;
    for (let frame = 1; frame <= fps; frame++) output = mapper.process(source.process(frame / fps), frame / fps);
    return output;
  };
  assert.deepEqual(render(30), render(120));
});

test('disposing an analysis session during async module setup prevents stale node attachment', async () => {
  let finish, nodeCreated = false;
  const context = { audioWorklet: { addModule: () => new Promise(resolve => { finish = resolve; }) } };
  const session = new AudioAnalysisSession({ nodeFactory: () => { nodeCreated = true; throw new Error('stale connection'); } });
  const connecting = session.connect({ context, getOutput() { throw new Error('stale output'); } });
  session.dispose();
  finish();
  assert.equal(await connecting, false);
  assert.equal(nodeCreated, false);
  assert.equal(session.status, 'disposed');
});
