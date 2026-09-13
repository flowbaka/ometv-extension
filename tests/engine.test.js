const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness({ failHands = false, failSend = false } = {}) {
  let now = 10000, timer, resolveFace, handResult = null;
  const messages = [], listeners = {}, documentListeners = {}, metrics = { hands: 0, face: 0, loads: 0, closes: 0, inputs: [] };
  const video = id => ({ id, className: '', parentElement: {}, srcObject: { getVideoTracks: () => [{ id }] }, isConnected: true, readyState: 4, videoWidth: 1280, videoHeight: 720, currentTime: 0, paused: false, ended: false });
  const videos = [video('local-video'), video('remote-video')]; videos[0].muted = true;
  const context = { console: { log() {}, error() {} }, location: { origin: 'https://ome.tv' }, performance: { now: () => now }, Date: { now: () => now },
    document: { hidden: false, querySelectorAll: () => videos, addEventListener: (name, fn) => documentListeners[name] = fn,
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) },
    setInterval: fn => { timer = fn; },
    clearInterval() {},
    Hands: class { setOptions() {} onResults(fn) { this.result = fn; } async initialize() { metrics.loads++; if (failHands) throw Error('test failure'); } async close() { metrics.closes++; } async send({ image }) { metrics.hands++; if (failSend) throw Error('Aborted(Module.arguments has been replaced)'); metrics.handSize = [image.width, image.height]; this.result(handResult || { multiHandLandmarks: [] }); } },
    faceapi: { nets: { tinyFaceDetector: { async loadFromUri() {} } }, TinyFaceDetectorOptions: class { constructor(options) { Object.assign(this, options); } },
      async detectSingleFace(image, options) { metrics.face++; metrics.inputs.push(options.inputSize); return resolveFace ? resolveFace(options) : undefined; } },
    addEventListener: (name, fn) => listeners[name] = fn,
    postMessage: message => messages.push(message) };
  context.window = context;
  vm.createContext(context); vm.runInContext(fs.readFileSync('content/injected.js', 'utf8'), context); const source = vm.runInContext('window', context);
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return { metrics, messages, videos,
    async mode(mode, settings = {}, retry = false) { listeners.message({ source, origin: 'https://ome.tv', data: { type: 'OMETV_EXT_CONFIG', base: 'chrome-extension://' + 'a'.repeat(32) + '/', mode, settings, retry } }); await flush(); },
    async stop() { listeners.message({ source, origin: 'https://ome.tv', data: { type: 'OMETV_EXT_STOP' } }); await flush(); },
    async tick(ms = 700, advance = true) { now += ms; if (advance) videos.forEach(v => { v.currentTime += ms / 1000; }); timer(); await flush(); },
    visibility(hidden) { context.document.hidden = hidden; documentListeners.visibilitychange(); },
    hand(value) { handResult = value; }, face(value) { resolveFace = value; }, flush };
}
test('gesture, auto and both enable exactly the requested engines', async () => {
  for (const mode of ['gesture', 'auto', 'both']) {
    const h = harness(); await h.mode(mode); await h.tick(1600); await h.tick(1600);
    assert.equal(h.metrics.hands > 0, mode !== 'auto'); assert.equal(h.metrics.face > 0, mode !== 'gesture');
    await h.mode('off'); const before = { ...h.metrics }; await h.tick(); assert.deepEqual(h.metrics, before);
  }
});
test('both keeps auto alive when gesture model fails', async () => {
  const h = harness({ failHands: true }); await h.mode('both'); await h.tick(); await h.tick(1600);
  assert.ok(h.metrics.face > 0); assert.equal(h.metrics.hands, 0);
});
test('late AI results cannot skip after switching off', async () => {
  const h = harness(); await h.mode('auto', { noFaceTimeout: 3 }); await h.tick(); await h.tick(1600);
  let finish; h.face(() => new Promise(resolve => finish = resolve)); await h.tick(4000);
  await h.mode('off'); finish(undefined); await h.flush();
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 0);
});
test('no-face skips only after timeout and resets on stream changes', async () => {
  const h = harness(); await h.mode('both', { noFaceTimeout: 3 }); await h.tick(); await h.tick(1600); await h.tick(2000);
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 0);
  h.videos[1].srcObject = { getVideoTracks: () => [{ id: 'new-partner' }] };
  await h.tick(2000); await h.tick(1600); await h.tick(3100);
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 1);
});
test('held palm triggers once until released', async () => {
  const h = harness(); const p = Array.from({ length: 21 }, () => ({ x: .5, y: .7 }));
  p[0] = { x: .5, y: .9 }; p[9] = { x: .5, y: .6 };
  [8,12,16,20].forEach((tip, i) => { p[tip] = { x: .3 + i * .15, y: .2 }; });
  h.hand({ multiHandLandmarks: [p] }); await h.mode('gesture'); await h.tick(); await h.tick(); await h.tick(3000);
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 1);
  h.hand({ multiHandLandmarks: [] }); await h.tick(); await h.tick(); h.hand({ multiHandLandmarks: [p] }); await h.tick(); await h.tick();
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 2);
});
test('all manifest assets and model shards exist locally', () => {
  const m = JSON.parse(fs.readFileSync('manifest.json'));
  for (const script of m.content_scripts.flatMap(s => s.js)) assert.ok(fs.existsSync(script), script);
  const weights = JSON.parse(fs.readFileSync('models/tiny_face_detector_model-weights_manifest.json'));
  for (const group of weights) for (const path of group.paths) assert.ok(fs.statSync('models/' + path).size > 0);
});
test('frozen frames are not reprocessed or used to trigger no-face skipping', async () => {
  const h = harness(); await h.mode('both', { noFaceTimeout: 3 }); await h.tick(); await h.tick(1600);
  const before = { hands: h.metrics.hands, face: h.metrics.face };
  await h.tick(4000, false); await h.tick(4000, false);
  assert.equal(h.metrics.hands, before.hands); assert.equal(h.metrics.face, before.face);
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 0);
  assert.ok(h.messages.some(m => m.message?.includes('Video stalled')));
});
test('small face found by the final 320px check prevents a skip', async () => {
  const h = harness(); h.face(options => options.inputSize === 320 ? { score: .8 } : undefined);
  await h.mode('auto', { noFaceTimeout: 3 }); await h.tick(); await h.tick(1600); await h.tick(3100);
  assert.ok(h.metrics.inputs.includes(320));
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 0);
});
test('one missed palm frame does not rearm the gesture', async () => {
  const h = harness(), p = Array.from({ length: 21 }, () => ({ x: .5, y: .7 }));
  p[0] = { x: .5, y: .9 }; p[9] = { x: .5, y: .6 };
  [8,12,16,20].forEach((tip,i) => p[tip] = { x: .3 + i * .15, y: .2 });
  h.hand({multiHandLandmarks:[p]}); await h.mode('gesture'); await h.tick(); await h.tick();
  h.hand({multiHandLandmarks:[]}); await h.tick(3000);
  h.hand({multiHandLandmarks:[p]}); await h.tick(150); await h.tick(4000);
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 1);
  assert.deepEqual(h.metrics.handSize, [320, 180]);
});
test('hidden tab invalidates an in-flight result even after resuming', async () => {
  const h = harness(); await h.mode('auto', {noFaceTimeout:3}); await h.tick(); await h.tick(1600);
  let finish; h.face(() => new Promise(resolve => finish = resolve)); await h.tick(3100);
  h.visibility(true); h.visibility(false); finish(undefined); await h.flush();
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 0);
});
test('paused video cannot produce a late automatic skip', async () => {
  const h = harness(); await h.mode('auto', {noFaceTimeout:3}); await h.tick(); await h.tick(1600);
  let finish; h.face(() => new Promise(resolve => finish = resolve)); await h.tick(3100);
  h.videos[1].paused = true; finish({score:.8}); await h.flush();
  assert.equal(h.messages.filter(m => m.type === 'OMETV_EXT_SKIP').length, 0);
});
test('fatal hand errors release the broken runtime and Retry creates a new one', async () => {
  const h = harness({ failSend: true }); await h.mode('both'); await h.tick();
  assert.equal(h.metrics.hands, 1); assert.equal(h.metrics.closes, 1);
  await h.tick(4000); assert.equal(h.metrics.hands, 1); assert.ok(h.metrics.face > 0);
  await h.mode('both', {}, true); assert.equal(h.metrics.loads, 2);
});
test('extension shutdown disposes the engine and ignores stale reactivation', async () => {
  const h = harness(); await h.mode('both'); await h.tick(); await h.stop();
  assert.equal(h.metrics.closes, 1);
  const before = [h.metrics.hands, h.metrics.face];
  await h.mode('both'); await h.tick(4000);
  assert.deepEqual([h.metrics.hands, h.metrics.face], before);
});
test('vendor loaders do not share generic Emscripten global names', () => {
  for (const file of ['hands.js','hands_solution_packed_assets_loader.js','hands_solution_wasm_bin.js','hands_solution_simd_wasm_bin.js']) {
    const code = fs.readFileSync('vendor/hands/' + file, 'utf8');
    assert.equal(code.includes('createMediapipeSolutions'), false, file);
    if (file.includes('packed_assets')) assert.equal(/\bModule\b/.test(code), false);
  }
});
