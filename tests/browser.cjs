const { chromium } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req,res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try { const data = fs.readFileSync(file); res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(data); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const browserLogs = [];
    page.on('console', message => browserLogs.push({ type: message.type(), text: message.text() }));
    const base = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(base + 'popup/popup.html');
    await page.addScriptTag({ url: base + 'vendor/hands/hands.js' });
    await page.addScriptTag({ url: base + 'vendor/face/face-api.min.js' });
    await page.evaluate(() => {
      // Other page libraries can own these Emscripten names. Ours must never touch them.
      for (const name of ['Module', 'createMediapipeSolutionsWasm', 'createMediapipeSolutionsPackedAssets']) {
        Object.defineProperty(window, name, { configurable: true, get() { throw new Error('Host runtime collision: ' + name); }, set() { throw new Error('Host runtime overwritten: ' + name); } });
      }
    });
    const timings = await page.evaluate(async base => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      canvas.getContext('2d').fillRect(0,0,320,240);
      const hands = new Hands({ locateFile: file => base + 'vendor/hands/' + file });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 0 });
      let result; hands.onResults(value => result = value);
      const start = performance.now(); await hands.initialize(); await hands.send({ image: canvas });
      const handMs = performance.now() - start;
      const warmHandStart = performance.now(); await hands.send({ image: canvas }); const warmHandMs = Math.round(performance.now() - warmHandStart); await hands.close();
      const retryHands = new Hands({ locateFile: file => base + 'vendor/hands/' + file });
      retryHands.setOptions({ maxNumHands: 1, modelComplexity: 0 });
      let retryResult; retryHands.onResults(value => retryResult = value);
      await retryHands.initialize(); await retryHands.send({ image: canvas }); await retryHands.close();
      await faceapi.nets.tinyFaceDetector.loadFromUri(base + 'models');
      const faceStart = performance.now();
      const face = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }));
      const coldFaceMs = Math.round(performance.now() - faceStart);
      const warmFaceStart = performance.now(); await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })); const warmFaceMs = Math.round(performance.now() - warmFaceStart);
      const confirm = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }));
      return { warmHandMs, warmFaceMs, handMs: Math.round(handMs), faceMs: coldFaceMs, hands: result.multiHandLandmarks.length, retryHands: retryResult.multiHandLandmarks.length, face: !!face, confirmFace: !!confirm };
    }, base);
    assert.equal(timings.hands, 0); assert.equal(timings.face, false); assert.equal(timings.confirmFace, false);
    assert.equal(timings.retryHands, 0);
    const startupLogs = browserLogs.filter(entry => /Successfully created a WebGL context/.test(entry.text));
    assert.ok(startupLogs.length > 0); assert.ok(startupLogs.every(entry => entry.type === 'info'));
    assert.equal(browserLogs.some(entry => /Aborted\(|Host runtime collision|Host runtime overwritten/.test(entry.text)), false);
    console.log('Real packaged model smoke test:', timings);
    await page.addInitScript(() => {
      const data = { mode:'both', swipeSensitivity:35, faceConfidence:50, skipOnNoFace:true, noFaceTimeout:8, skipCount:2 };
      let changed = () => {};
      window.testEngineStates = {gesture:'ready', auto:'ready'};
      window.chrome = { storage: { local: { get: (defaults, cb) => cb({...defaults,...data}), set: update => {const changes = Object.fromEntries(Object.entries(update).map(([key,newValue]) => [key,{newValue}])); Object.assign(data,update); changed(changes,'local');} }, onChanged: { addListener: fn => changed = fn } }, tabs: { query: async () => [{id:1}], sendMessage: async () => ({connected:true, mode:data.mode, skipCount:2, engineStates:window.testEngineStates, statuses:{gesture:'Hold an open palm · 18 ms',auto:'Face present · 24 ms'},logs:['Models ready']}) } };
    });
    await page.reload(); await page.setViewportSize({ width:380,height:820 });
    await page.locator('#engine-auto').filter({hasText:'Face present'}).waitFor();
    await page.screenshot({path:'tests/popup-preview.png',fullPage:true});
    await page.locator('[data-mode="gesture"]').click();
    assert.equal(await page.locator('#auto-settings').evaluate(el => el.classList.contains('visible')), false);
    await page.locator('[data-mode="both"]').click();
    assert.equal(await page.locator('#auto-settings').evaluate(el => el.classList.contains('visible')), true);
    await page.evaluate(() => window.testEngineStates.auto = 'error');
    await page.locator('#status-text').filter({hasText:'Engine needs attention'}).waitFor();
    assert.ok(await page.locator('#status-dot').evaluate(el => el.classList.contains('error')));
    await page.evaluate(() => window.testEngineStates.auto = 'loading');
    await page.locator('#status-text').filter({hasText:'Loading local models'}).waitFor();
    console.log('Popup mode controls and diagnostics passed.');
    await page.evaluate(() => {
      document.body.innerHTML = '<div id="app"><button class="buttons__next" hidden>Next</button><button class="buttons__next" id="real-next">Next</button></div>';
      window.clicks = 0; document.querySelector('#real-next').onclick = () => window.clicks++;
      chrome.runtime = { id: 'a'.repeat(32), getURL: () => 'chrome-extension://' + 'a'.repeat(32) + '/', onMessage: {addListener() {}} };
    });
    await page.addScriptTag({ url: base + 'content/content.js' });
    await page.evaluate(() => window.postMessage({type:'OMETV_EXT_SKIP',reason:'gesture'}, location.origin));
    await page.waitForFunction(() => window.clicks === 1);
    await page.evaluate(() => window.postMessage({type:'OMETV_EXT_SKIP',reason:'gesture'}, location.origin));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.clicks), 1);
    console.log('Content script sends exactly one click and enforces cooldown.');
    await page.waitForTimeout(2600);
    await page.evaluate(() => {
      document.querySelector('#real-next').disabled = true;
      window.postMessage({type:'OMETV_EXT_SKIP',reason:'gesture'}, location.origin);
    });
    await page.waitForFunction(() => document.querySelector('#ss-logs').textContent.includes('no enabled Next button'));
    assert.equal(await page.evaluate(() => window.clicks), 1);
    await page.evaluate(() => {
      document.querySelector('#real-next').disabled = false;
      chrome.storage.local.set({mode:'off'});
    });
    await page.evaluate(() => window.postMessage({type:'OMETV_EXT_SKIP',reason:'gesture'}, location.origin));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.clicks), 1);
    console.log('Hidden duplicate buttons, disabled Next, and Off protection passed.');
    const invalidationErrors = [];
    page.on('pageerror', error => invalidationErrors.push(error.message));
    await page.evaluate(() => {
      window.stopMessages = 0;
      window.addEventListener('message', event => { if (event.data?.type === 'OMETV_EXT_STOP') window.stopMessages++; });
      chrome.runtime.getURL = () => { throw new Error('Extension context invalidated.'); };
    });
    await page.locator('#ss-retry').click();
    await page.waitForFunction(() => window.stopMessages === 1);
    assert.ok(await page.locator('#ss-gesture').textContent().then(text => text.includes('reload this OmeTV tab')));
    assert.ok(await page.locator('#ss-retry').isDisabled());
    assert.equal(invalidationErrors.length, 0);
    console.log('Invalidated extension context is handled without an uncaught error; engine receives STOP.');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
