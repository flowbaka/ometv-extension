# Smart Skip 1.2

Three active modes, plus Off:
- Gesture: hold an open palm in your own camera. Lower your hand before another skip. Palm hold controls the required hold duration (150–550 ms).
- Auto: local face-presence detection skips after a continuous no-face timeout. It does not classify gender or identity.
- Both: both engines are enabled; inference is serialized to avoid competing GPU work.

## Improvements in 1.2
- Reuses small canvases (320 px for hands, 384 px for faces), avoids processing the same decoded frame twice, and adapts detection cadence to inference time.
- Stalled streams clear pending no-face evidence. Pausing, hiding the tab, changing settings, or switching partners invalidates old results.
- Auto checks at 224 px, then confirms at 320 px before a no-face skip to help catch smaller faces. This does not guarantee detection in every frame.
- Gestures require a sustained 300 ms release before rearming. A single missed hand detection does not trigger another skip.
- Manual Next resets partner analysis. Hidden duplicate buttons and disabled controls are ignored.
- Popup and overlay distinguish running, loading, waiting, and failed engines. Status updates are throttled; logs retain meaningful transitions.

## Load the update
1. Open chrome://extensions (or edge://extensions), enable Developer mode, and reload Smart Skip. For a new installation, select Load unpacked and choose this folder.
2. Reload the OmeTV tab. Existing tabs retain old content scripts until refreshed.
3. Start a chat normally and select a mode. Both engine rows should change from loading to camera/partner status. First initialization can take several seconds.
4. Use Retry engines after a model loading error. Recent logs are available in the popup and page overlay; DevTools console entries start with [SmartSkip].

Gesture uses the existing local camera video; it does not open another camera stream. Auto requires a playing partner video. Ambiguous video roles wait instead of analyzing the wrong stream. A visible, enabled Next/Skip button is required. Inference pauses in hidden tabs. No video, image, face identity, or landmark data is stored in logs or sent to a server.

## Validation
- `npm.cmd test`: 11 tests covering mode combinations, Off cancellation, partial model failure, no-face timing, partner changes, frozen frames, palm rearming, higher-resolution confirmation, hidden/paused video, and packaged assets.
- `npm.cmd run test:browser`: uses installed Chrome; runs real local model inference on a blank frame, exercises popup controls and error/loading states, and checks single-click/cooldown, hidden/disabled buttons, and Off behavior. Writes tests/popup-preview.png.
- Local headless Chrome sample: warm blank-frame inference about 49 ms (hands) / 35 ms (face); first initialization/inference about 15 s / 10 s. Startup varies with shader compilation and machine load. These are smoke measurements, not live-camera accuracy or hardware-wide performance guarantees.

Live OmeTV camera/partner matching, real-hand recognition, and current site CSP still need verification in an actual session. Page script policy or site markup changes can prevent model execution; the UI reports errors/waiting instead of claiming the engines are active.

## Packaged dependencies
- MediaPipe Hands 0.4.1675469240, lite model: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md (Apache-2.0).
- face-api.js 0.22.2, Tiny Face Detector only: https://github.com/justadudewhohacks/face-api.js (MIT; license in vendor/face/LICENSE).
- Face detector weights pinned to the 0.22.2 release. No age/gender weights are included or loaded.

All executable inference libraries, WASM files, and model weights are packaged locally. Runtime model loading has no CDN dependency. The MAIN-world bridge is not a security boundary against the host page; skip commands are checked against mode, cooldown and the Next button in the content script.
