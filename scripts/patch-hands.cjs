/* Keep the legacy MediaPipe runtime out of the host page's Emscripten globals.
 * Run after replacing vendor/hands with the pinned npm package. Idempotent.
 */
const fs = require('node:fs');
const path = require('node:path');
for (const file of ['hands.js', 'hands_solution_packed_assets_loader.js', 'hands_solution_wasm_bin.js', 'hands_solution_simd_wasm_bin.js']) {
  const target = path.join(__dirname, '..', 'vendor', 'hands', file);
  let source = fs.readFileSync(target, 'utf8');
  if (!source.includes('createMediapipeSolutions') && !source.includes('createSmartSkipHands')) throw new Error('Unexpected MediaPipe build: ' + file);
  source = source.replaceAll('createMediapipeSolutionsWasm', 'createSmartSkipHandsWasm')
    .replaceAll('createMediapipeSolutionsPackedAssets', 'createSmartSkipHandsPackedAssets');
  if (file === 'hands_solution_packed_assets_loader.js') source = source.replace(/\bModule\b/g, 'SmartSkipHandsPackedModule');
  if (file.endsWith('_wasm_bin.js')) {
    const original = 'var err=Module["printErr"]||console.warn.bind(console);';
    const replacement = 'var err=Module["printErr"]||function(message){var text=String(message);if(/^I\\d{4}\\s/.test(text)){console.info("[SmartSkip:Hands]",text)}else{console.warn("[SmartSkip:Hands]",text)}};';
    if (!source.includes(original) && !source.includes(replacement)) throw new Error('Unexpected WASM logging hook: ' + file);
    source = source.replace(original, replacement);
  }
  fs.writeFileSync(target, source);
  console.log('Namespaced:', file);
}
