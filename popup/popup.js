(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const defaults = { mode: 'off', swipeSensitivity: 35, faceConfidence: 50, skipOnNoFace: true, noFaceTimeout: 8, skipCount: 0 };
  function render(data) {
    document.querySelectorAll('.mode-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.mode === data.mode); btn.setAttribute('aria-pressed', String(btn.dataset.mode === data.mode)); });
    $('gesture-settings').classList.toggle('visible', ['gesture','both'].includes(data.mode));
    $('auto-settings').classList.toggle('visible', ['auto','both'].includes(data.mode));
    $('mode-help').textContent = { off: 'Paused. Choose a mode above.', gesture: 'Hold an open palm in your camera, then lower it to rearm.', auto: 'Skip after the partner video has no face for the selected timeout.', both: 'Palm gestures and automatic no-face skipping run together.' }[data.mode];
    for (const [id,key,unit] of [['sensitivity','swipeSensitivity',''],['confidence','faceConfidence','%'],['timeout','noFaceTimeout','s']]) {
      $(id + '-slider').value = data[key];
      $(id + '-value').textContent = id === 'sensitivity' ? data[key] * 10 + 'ms' : data[key] + unit;
    }
    $('no-face-skip').checked = data.skipOnNoFace;
    $('timeout-row').style.display = data.skipOnNoFace ? 'flex' : 'none';
    $('skip-count').textContent = data.skipCount;
  }
  const refresh = () => chrome.storage.local.get(defaults, render);
  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => chrome.storage.local.set({ mode: btn.dataset.mode })));
  for (const [id,key] of [['sensitivity','swipeSensitivity'],['confidence','faceConfidence'],['timeout','noFaceTimeout']]) {
    $(id + '-slider').addEventListener('input', event => chrome.storage.local.set({ [key]: Number(event.target.value) }));
  }
  $('no-face-skip').addEventListener('change', event => chrome.storage.local.set({ skipOnNoFace: event.target.checked }));
  async function query(action) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    return chrome.tabs.sendMessage(tab.id, { action });
  }
  async function poll() {
    try {
      const data = await query('getStatus');
      const active = ['gesture', 'auto'].filter(engine => data.mode === engine || data.mode === 'both');
      const states = active.map(engine => data.engineStates?.[engine] || 'waiting');
      const problem = states.includes('error'), loading = states.includes('loading');
      const ready = states.length > 0 && states.every(state => state === 'ready');
      $('status-text').textContent = !data.connected ? 'Reload OmeTV to connect engines' : data.mode === 'off' ? 'Paused' : problem ? 'Engine needs attention' : loading ? 'Loading local models…' : ready ? 'Engines running' : 'Waiting for video';
      $('status-dot').className = 'status-dot' + (problem ? ' error' : loading ? ' loading' : ready ? ' active' : '');
      $('engine-gesture').textContent = 'Gesture: ' + data.statuses.gesture;
      $('engine-auto').textContent = 'Auto: ' + data.statuses.auto;
      for (const engine of ['gesture', 'auto']) $('engine-' + engine).dataset.state = data.engineStates?.[engine] || 'idle';
      $('recent-logs').textContent = data.logs.slice(-12).join('\n');
      $('skip-count').textContent = data.skipCount;
    } catch {
      $('status-text').textContent = 'Open or reload an OmeTV tab';
      $('status-dot').className = 'status-dot error';
      $('engine-gesture').textContent = 'Gesture: Not connected';
      $('engine-auto').textContent = 'Auto: Not connected';
    }
  }
  $('retry-engines').addEventListener('click', async () => { try { await query('retry'); } catch {} await poll(); });
  chrome.storage.onChanged.addListener(refresh);
  refresh(); poll(); setInterval(poll, 1000);
})();
