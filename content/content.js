(() => {
  'use strict';
  if (document.getElementById('ometv-ext-hud')) return;
  const defaults = { mode: 'off', swipeSensitivity: 35, faceConfidence: 50, skipOnNoFace: true, noFaceTimeout: 8, skipCount: 0 };
  let settings = { ...defaults }, lastSkip = 0, connected = false, invalidated = false;
  let healthTimer, syncTimer;
  const statuses = { gesture: 'Off', auto: 'Off' }, logs = [];
  const engineStates = { gesture: 'idle', auto: 'idle' };
  const hud = document.createElement('div');
  hud.id = 'ometv-ext-hud';
  hud.innerHTML = `<div class="ometv-hud-panel"><div class="ometv-hud-header"><strong>Smart Skip</strong><button id="ss-collapse" aria-label="Collapse panel">−</button></div><div id="ss-body"><div class="ss-modes">${['off','gesture','auto','both'].map(mode => `<button data-mode="${mode}">${mode}</button>`).join('')}</div><p id="ss-gesture"></p><p id="ss-auto"></p><p id="ss-count"></p><button id="ss-retry">Retry engines</button><details><summary>Recent logs</summary><pre id="ss-logs"></pre></details></div></div>`;
  document.body.appendChild(hud);
  const $ = id => hud.querySelector('#' + id);
  function log(message, level = 'info') {
    const entry = `${new Date().toLocaleTimeString()} [${level}] ${String(message).slice(0, 400)}`;
    logs.push(entry); if (logs.length > 60) logs.shift();
    $('ss-logs').textContent = logs.slice(-12).join('\n');
    console[level === 'error' ? 'error' : 'log']('[SmartSkip]', message);
  }
  function render() {
    hud.querySelectorAll('[data-mode]').forEach(btn => { btn.classList.toggle('selected', btn.dataset.mode === settings.mode); btn.setAttribute('aria-pressed', String(btn.dataset.mode === settings.mode)); });
    for (const engine of ['gesture', 'auto']) {
      $('ss-' + engine).textContent = (engine === 'gesture' ? 'Gesture: ' : 'Auto: ') + statuses[engine];
      $('ss-' + engine).dataset.state = engineStates[engine];
    }
    $('ss-count').textContent = `Skips: ${settings.skipCount}`;
  }
  function invalidate() {
    if (invalidated) return;
    invalidated = true; connected = false; settings.mode = 'off';
    clearInterval(healthTimer); clearTimeout(syncTimer);
    window.postMessage({ type: 'OMETV_EXT_STOP' }, location.origin);
    for (const engine of ['gesture', 'auto']) {
      statuses[engine] = 'Extension updated · reload this OmeTV tab'; engineStates[engine] = 'error';
    }
    hud.querySelectorAll('button[data-mode], #ss-retry').forEach(button => { button.disabled = true; });
    log('Extension connection expired. Reload this OmeTV tab to reconnect.'); render();
  }
  function withExtension(action) {
    if (invalidated) return false;
    try {
      if (!chrome.runtime?.id) { invalidate(); return false; }
      action(); return true;
    } catch (error) {
      if (/context invalidated/i.test(error.message)) invalidate();
      else log(`Extension API failed: ${error.message}`, 'error');
      return false;
    }
  }
  function save(update) {
    return withExtension(() => chrome.storage.local.set(update, () => {
      withExtension(() => { if (chrome.runtime.lastError) log(chrome.runtime.lastError.message, 'error'); });
    }));
  }
  function sync(retry = false) {
    withExtension(() => window.postMessage({ type: 'OMETV_EXT_CONFIG', mode: settings.mode, settings, base: chrome.runtime.getURL(''), retry }, location.origin));
  }
  hud.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => save({ mode: btn.dataset.mode })));
  $('ss-collapse').addEventListener('click', () => { $('ss-body').hidden = !$('ss-body').hidden; });
  $('ss-retry').addEventListener('click', () => sync(true));
  function usable(btn) {
    if (!btn || btn.disabled || btn.closest('[aria-disabled="true"], [inert], .disabled')) return false;
    const style = getComputedStyle(btn);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && style.pointerEvents !== 'none' && btn.getClientRects().length > 0;
  }
  function findNext() {
    for (const selector of ['.buttons__next', '.buttons-item_next', '[data-tr="next"]', '.ip-btn-next', '.ip-btn-skip', '.btn-next', '.next-button']) {
      const btn = [...document.querySelectorAll(selector)].find(usable); if (btn) return btn;
    }
    return [...document.querySelectorAll('#app button, #app [role="button"], #start-button')].find(btn => /^(next|skip)$/i.test(btn.textContent.trim()) && usable(btn));
  }
  function performSkip(reason) {
    if (!withExtension(() => {})) return false;
    const allowed = reason === 'gesture' ? ['gesture','both'].includes(settings.mode)
      : reason === 'no_face' && settings.skipOnNoFace && ['auto','both'].includes(settings.mode);
    if (!allowed || document.hidden || Date.now() - lastSkip < 2500) return false;
    const button = findNext();
    if (!button) { log('Skip blocked: no enabled Next button', 'error'); return false; }
    lastSkip = Date.now(); button.click();
    settings.skipCount++; save({ skipCount: settings.skipCount });
    log(`Skip clicked: ${reason}`); render(); return true;
  }
  window.addEventListener('message', event => {
    if (invalidated || event.source !== window || event.origin !== location.origin) return;
    const msg = event.data;
    if (msg?.type === 'OMETV_EXT_INJECTED_READY') { connected = true; sync(); }
    if (msg?.type === 'OMETV_EXT_STATUS' && ['gesture','auto'].includes(msg.engine)) {
      connected = true; statuses[msg.engine] = String(msg.message).slice(0,400);
      engineStates[msg.engine] = ['idle','loading','waiting','ready','error'].includes(msg.status) ? msg.status : 'waiting'; render();
    }
    if (msg?.type === 'OMETV_EXT_LOG') log(msg.message, msg.level);
    if (msg?.type === 'OMETV_EXT_SKIP') window.postMessage({ type: 'OMETV_EXT_SKIP_RESULT', ok: performSkip(msg.reason) }, location.origin);
  });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.action === 'getStatus') respond({ connected, statuses, engineStates, logs, skipCount: settings.skipCount, mode: settings.mode });
    else if (msg.action === 'retry') { sync(true); respond({ ok: true }); }
  });
  document.addEventListener('click', event => {
    if (invalidated) return;
    const next = findNext();
    if (event.isTrusted && next && (event.target === next || next.contains(event.target))) {
      lastSkip = Date.now();
      window.postMessage({ type: 'OMETV_EXT_SKIP_RESULT', ok: true }, location.origin);
      log('Manual Next: reset detection for the next partner');
    }
  }, true);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (invalidated || area !== 'local') return;
    for (const key of Object.keys(defaults)) if (changes[key]) settings[key] = changes[key].newValue ?? defaults[key];
    render(); if (Object.keys(changes).some(key => key !== 'skipCount')) sync();
  });
  withExtension(() => chrome.storage.local.get(defaults, data => {
    withExtension(() => {
      if (chrome.runtime.lastError) { log(chrome.runtime.lastError.message, 'error'); return; }
      settings = data; render(); sync();
    });
  }));
  // Handles either content-script injection order.
  if (!invalidated) {
    syncTimer = setTimeout(() => { sync(); if (!invalidated && !connected) log('Waiting for engine. Reload this tab after updating the extension.', 'error'); }, 2000);
    healthTimer = setInterval(() => withExtension(() => {}), 1000);
  }
  render();
})();
