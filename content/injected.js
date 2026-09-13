/* Local inference engine. Frames never leave the device. */
(() => {
  'use strict';
  if (window.__OMETV_EXT_INJECTED__) return;
  window.__OMETV_EXT_INJECTED__ = true;
  const s = { mode: 'off', generation: 0, base: '', hands: null, face: false, loading: {}, busy: false,
    local: null, remote: null, stream: null, track: '', settled: 0, absent: null, palm: null,
    released: true, releaseSince: null, lastSkip: 0, nextGesture: 0, nextAuto: 0, statuses: {},
    frames: {}, canvases: {}, timings: {}, lastDiscovery: 0,
    settings: { swipeSensitivity: 35, faceConfidence: 50, skipOnNoFace: true, noFaceTimeout: 8 } };
  const emit = (type, data = {}) => window.postMessage({ type: `OMETV_EXT_${type}`, ...data }, location.origin);
  function log(message, level = 'info') {
    console[level === 'error' ? 'error' : 'log']('[SmartSkip]', message);
    emit('LOG', { message, level });
  }
  function status(engine, value, message) {
    const now = Date.now();
    if (s.statuses[engine] === message && s[engine + 'Value'] === value) return;
    if (s[engine + 'Value'] === value && now - (s[engine + 'Published'] || 0) < 500) return;
    s[engine + 'Published'] = now; s[engine + 'Value'] = value;
    s.statuses[engine] = message;
    emit('STATUS', { engine, status: value, message });
    // Status timings change frequently; only log transitions or errors once per 5 seconds.
    if (value !== s[engine + 'Status'] || now - (s[engine + 'Log'] || 0) > 5000) {
      log(`${engine}: ${message}`, value === 'error' ? 'error' : 'info');
      s[engine + 'Log'] = now; s[engine + 'Status'] = value;
    }
  }
  const enabled = engine => s.mode === 'both' || s.mode === engine;
  const ready = v => v && v.isConnected && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0 && !v.paused && !v.ended
    && !v.srcObject?.getVideoTracks?.().every(track => track.readyState === 'ended' || track.muted);
  function resetChat() { s.generation++; s.absent = null; s.settled = Date.now() + 1500; delete s.frames.auto; }
  function discover(force = false) {
    if (!force && Date.now() - s.lastDiscovery < 500) return;
    s.lastDiscovery = Date.now();
    const videos = [...document.querySelectorAll('video')];
    const role = video => {
      for (let node = video, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        const id = `${node.id || ''} ${node.className || ''}`.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
        if (/(^|[^a-z])(remote|partner|stranger)([^a-z]|$)/.test(id)) return 'remote';
        if (/(^|[^a-z])(local|self|own)([^a-z]|$)/.test(id)) return 'local';
      }
      return '';
    };
    const locals = videos.filter(v => role(v) === 'local');
    const remotes = videos.filter(v => role(v) === 'remote');
    let local = locals.length === 1 ? locals[0] : null;
    let remote = remotes.length === 1 ? remotes[0] : null;
    if (!local) { const candidates = videos.filter(v => v !== remote && v.muted); if (candidates.length === 1) local = candidates[0]; }
    if (!remote) { const candidates = videos.filter(v => v !== local && !v.muted); if (candidates.length === 1) remote = candidates[0]; }
    if (remote === local) remote = null;
    const stream = remote?.srcObject || remote?.currentSrc || null;
    const track = remote?.srcObject?.getVideoTracks?.().map(t => t.id).join(',') || '';
    if (remote !== s.remote || stream !== s.stream || track !== s.track) {
      s.remote = remote; s.stream = stream; s.track = track; resetChat();
      log(`Video source changed: local=${!!local}, remote=${!!remote}`);
    }
    if (s.local !== local) { s.palm = null; s.releaseSince = null; delete s.frames.gesture; s.generation++; }
    s.local = local;
  }
  // A stalled stream must never accumulate evidence from the same frame.
  function fresh(engine, video) {
    const decoded = video.getVideoPlaybackQuality?.().totalVideoFrames;
    const stamp = decoded > 0 ? decoded : video.currentTime;
    const previous = s.frames[engine];
    if (previous?.video === video && previous.stamp === stamp) {
      if (Date.now() - previous.at > 1500) {
        if (engine === 'auto') s.absent = null; else s.palm = null;
        status(engine, 'waiting', 'Video stalled · waiting for new frames');
      }
      return false;
    }
    s.frames[engine] = { video, stamp, at: Date.now() };
    return true;
  }
  function frame(engine, video) {
    const canvas = s.canvases[engine] ||= document.createElement('canvas');
    const scale = Math.min(1, (engine === 'gesture' ? 320 : 384) / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0, width, height);
    return canvas;
  }
  function timing(engine, start) {
    const elapsed = performance.now() - start;
    s.timings[engine] = s.timings[engine] === undefined ? elapsed : s.timings[engine] * .75 + elapsed * .25;
    return Math.round(s.timings[engine]);
  }
  function load(engine) {
    if (s.loading[engine]) return s.loading[engine];
    s.loading[engine] = Promise.resolve().then(async () => {
      status(engine, 'loading', 'Loading local model...');
      try {
        if (engine === 'gesture' && !s.hands) {
          const hands = new window.Hands({ locateFile: file => s.base + 'vendor/hands/' + file });
          hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.65, minTrackingConfidence: 0.6 });
          hands.onResults(result => { s.handResult = result; });
          try { await hands.initialize(); s.hands = hands; }
          catch (error) { await hands.close().catch(() => {}); throw error; }
        }
        if (engine === 'auto' && !s.face) {
          await window.faceapi.nets.tinyFaceDetector.loadFromUri(s.base + 'models'); s.face = true;
        }
        if (enabled(engine)) status(engine, 'ready', 'Model ready');
      } catch (error) { if (enabled(engine)) status(engine, 'error', `Model failed: ${error.message}. Use Retry engines.`); }
      finally { delete s.loading[engine]; }
    });
    return s.loading[engine];
  }
  function setMode(mode, retry = false) {
    if (!['off', 'gesture', 'auto', 'both'].includes(mode) || (mode === s.mode && !retry)) return;
    s.mode = mode; resetChat(); s.palm = null; s.releaseSince = null; s.released = true;
    s.frames = {}; s.nextGesture = 0; s.nextAuto = 0; log(`Mode: ${mode}`);
    for (const engine of ['gesture', 'auto']) {
      if (enabled(engine) && s.base) load(engine); else status(engine, 'idle', 'Off');
    }
  }
  function palmOpen(p) {
    if (!p || p.length !== 21) return false;
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const scale = d(p[0], p[9]);
    return scale > 0.04 && [8, 12, 16, 20].every(t => d(p[t], p[0]) > d(p[t - 2], p[0]) * 1.18)
      && d(p[8], p[20]) > scale * 0.65;
  }
  function skip(reason) {
    if (Date.now() - s.lastSkip < 2500) return false;
    s.lastSkip = Date.now(); s.absent = null; emit('SKIP', { reason }); return true;
  }
  async function tick() {
    if (s.busy || s.mode === 'off' || document.hidden) return;
    discover(); s.busy = true;
    try {
      let generation = s.generation;
      if (enabled('gesture') && s.hands && Date.now() >= s.nextGesture) {
        s.nextGesture = Date.now() + Math.max(100, Math.min(400, (s.timings.gesture || 0) * 1.5));
        if (!ready(s.local)) { s.palm = null; status('gesture', 'waiting', 'Waiting for your camera'); }
        else if (fresh('gesture', s.local)) {
          const start = performance.now();
          const video = s.local;
          try {
            s.handResult = null; await s.hands.send({ image: frame('gesture', video) });
            discover(true);
            if (generation !== s.generation || !ready(video) || document.hidden || !enabled('gesture')) return;
            if (!palmOpen(s.handResult?.multiHandLandmarks?.[0])) {
              s.palm = null; s.releaseSince ??= Date.now();
              if (Date.now() - s.releaseSince >= 300) s.released = true;
            }
            else if (s.released) {
              s.releaseSince = null;
              s.palm ??= Date.now();
              if (Date.now() - s.palm >= s.settings.swipeSensitivity * 10 && skip('gesture')) s.released = false;
            } else s.releaseSince = null;
            status('gesture', 'ready', `${s.released ? 'Hold an open palm to skip' : 'Lower hand to rearm'} · ${timing('gesture', start)} ms`);
          } catch (error) { s.palm = null; status('gesture', 'error', `Frame failed: ${error.message}`); s.nextGesture = Date.now() + 3000; }
        }
      }
      generation = s.generation;
      if (enabled('auto') && s.face && Date.now() >= s.nextAuto) {
        s.nextAuto = Date.now() + Math.max(600, Math.min(1800, (s.timings.auto || 0) * 2));
        if (!ready(s.remote)) { s.absent = null; s.settled = Date.now() + 1500; status('auto', 'waiting', 'Waiting for partner video'); }
        else if (Date.now() < s.settled) status('auto', 'waiting', 'New partner · waiting for video to settle');
        else if (fresh('auto', s.remote)) {
          const start = performance.now();
          const video = s.remote;
          try {
            const input = frame('auto', video);
            let face = await window.faceapi.detectSingleFace(input,
              new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: s.settings.faceConfidence / 100 }));
            discover(true);
            if (generation !== s.generation || !ready(video) || document.hidden || !enabled('auto')) return;
            // Confirm at higher resolution before an automatic skip, preserving small faces.
            if (!face && s.settings.skipOnNoFace && s.absent !== null && Date.now() - s.absent >= s.settings.noFaceTimeout * 1000) {
              face = await window.faceapi.detectSingleFace(input,
                new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: s.settings.faceConfidence / 100 }));
            }
            discover(true);
            if (generation !== s.generation || !ready(video) || document.hidden || !enabled('auto')) return;
            if (face) s.absent = null; else s.absent ??= Date.now();
            const elapsed = s.absent === null ? 0 : (Date.now() - s.absent) / 1000;
            status('auto', 'ready', `${face ? 'Face present' : s.settings.skipOnNoFace ? `No face · ${elapsed.toFixed(1)}/${s.settings.noFaceTimeout}s` : 'No face · skipping disabled'} · ${timing('auto', start)} ms`);
            if (!face && s.settings.skipOnNoFace && elapsed >= s.settings.noFaceTimeout) skip('no_face');
          } catch (error) { s.absent = null; s.nextAuto = Date.now() + 3000; status('auto', 'error', `Frame failed: ${error.message}`); }
        }
      }
    } finally { s.busy = false; }
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data;
    if (msg?.type === 'OMETV_EXT_CONFIG') {
      if (typeof msg.base !== 'string' || !/^chrome-extension:\/\/[a-p]{32}\/$/.test(msg.base)) return;
      s.base = msg.base;
      const settings = msg.settings || {};
      const before = JSON.stringify(s.settings);
      for (const [key, min, max] of [['swipeSensitivity', 15, 55], ['faceConfidence', 30, 90], ['noFaceTimeout', 3, 20]]) {
        if (Number.isFinite(settings[key])) s.settings[key] = Math.min(max, Math.max(min, settings[key]));
      }
      if (typeof settings.skipOnNoFace === 'boolean') s.settings.skipOnNoFace = settings.skipOnNoFace;
      if (before !== JSON.stringify(s.settings)) { resetChat(); s.palm = null; }
      setMode(msg.mode, msg.retry === true);
    }
    if (msg?.type === 'OMETV_EXT_SKIP_RESULT' && msg.ok) resetChat();
  });
  document.addEventListener('emptied', event => { if (event.target === s.remote) resetChat(); }, true);
  document.addEventListener('visibilitychange', () => {
    resetChat(); s.palm = null; s.releaseSince = null; s.frames = {};
    for (const engine of ['gesture', 'auto']) if (enabled(engine)) status(engine, 'waiting', document.hidden ? 'Paused while tab is hidden' : 'Resuming on fresh frames');
  });
  setInterval(() => { tick().catch(error => log(error.message, 'error')); }, 80);
  emit('INJECTED_READY');
})();
