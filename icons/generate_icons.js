/**
 * Icon Generator Script — Run with Node.js to create PNG icons
 * Since we can't generate images directly, we'll create an HTML canvas-based
 * generator that can be opened in a browser to download icons.
 * 
 * Alternative: We provide SVG-to-PNG conversion via an HTML page.
 */

const fs = require('fs');
const path = require('path');

// Create a simple 1-pixel PNG header utility
// For actual icons, we'll create a self-contained HTML icon generator

const htmlGenerator = `<!DOCTYPE html>
<html>
<head><title>Icon Generator</title></head>
<body style="background:#111;color:#fff;font-family:sans-serif;padding:40px;">
<h2>OmeTV Smart Skip — Icon Generator</h2>
<p>Click each button to download the icon at that size.</p>
<div style="display:flex;gap:20px;margin-top:20px;">
  <div>
    <canvas id="c128" width="128" height="128"></canvas><br>
    <button onclick="dl('c128','icon128.png')">Download 128px</button>
  </div>
  <div>
    <canvas id="c48" width="48" height="48"></canvas><br>
    <button onclick="dl('c48','icon48.png')">Download 48px</button>
  </div>
  <div>
    <canvas id="c16" width="16" height="16"></canvas><br>
    <button onclick="dl('c16')">Download 16px</button>
  </div>
</div>
<script>
function drawIcon(canvas) {
  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  const r = s * 0.18; // corner radius

  // Background with rounded corners
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.quadraticCurveTo(s, 0, s, r);
  ctx.lineTo(s, s - r);
  ctx.quadraticCurveTo(s, s, s - r, s);
  ctx.lineTo(r, s);
  ctx.quadraticCurveTo(0, s, 0, s - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#7c3aed');
  grad.addColorStop(1, '#4c1d95');
  ctx.fillStyle = grad;
  ctx.fill();

  // Lightning bolt
  ctx.save();
  ctx.translate(s * 0.5, s * 0.5);
  ctx.scale(s / 100, s / 100);
  
  ctx.beginPath();
  ctx.moveTo(5, -38);
  ctx.lineTo(-18, 4);
  ctx.lineTo(-4, 4);
  ctx.lineTo(-8, 38);
  ctx.lineTo(18, -4);
  ctx.lineTo(4, -4);
  ctx.closePath();

  ctx.fillStyle = '#ffffff';
  ctx.fill();
  
  // Subtle glow
  ctx.shadowColor = 'rgba(167, 139, 250, 0.6)';
  ctx.shadowBlur = s * 0.08;
  ctx.fill();
  
  ctx.restore();
}

['c128','c48','c16'].forEach(id => drawIcon(document.getElementById(id)));

function dl(id, name) {
  const a = document.createElement('a');
  a.download = name;
  a.href = document.getElementById(id).toDataURL('image/png');
  a.click();
}
</script>
</body>
</html>`;

// Write the generator HTML
const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
fs.writeFileSync(path.join(iconsDir, 'generate_icons.html'), htmlGenerator);

// Also create simple placeholder PNGs using a minimal PNG encoder
// These are valid 1-color PNG files that Chrome will accept

function createMinimalPNG(width, height, r, g, b) {
  // Minimal valid PNG with a single color
  // This is a simplified approach — creates a valid PNG
  
  const { createCanvas } = (() => {
    try { return require('canvas'); } catch(e) { return null; }
  })() || {};
  
  if (createCanvas) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw rounded rect background
    const radius = width * 0.18;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.quadraticCurveTo(width, 0, width, radius);
    ctx.lineTo(width, height - radius);
    ctx.quadraticCurveTo(width, height, width - radius, height);
    ctx.lineTo(radius, height);
    ctx.quadraticCurveTo(0, height, 0, height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#7c3aed');
    grad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = grad;
    ctx.fill();
    
    // Lightning bolt
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(width / 100, height / 100);
    ctx.beginPath();
    ctx.moveTo(5, -38);
    ctx.lineTo(-18, 4);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-8, 38);
    ctx.lineTo(18, -4);
    ctx.lineTo(4, -4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    
    return canvas.toBuffer('image/png');
  }
  
  return null;
}

// Try to create icons with node-canvas, if available
const sizes = [16, 48, 128];
let usedCanvas = false;

for (const size of sizes) {
  const png = createMinimalPNG(size, size, 124, 58, 237);
  if (png) {
    fs.writeFileSync(path.join(iconsDir, \`icon\${size}.png\`), png);
    console.log(\`Created icon\${size}.png\`);
    usedCanvas = true;
  }
}

if (!usedCanvas) {
  console.log('node-canvas not available. Please open icons/generate_icons.html in a browser to download icons.');
  console.log('Or install canvas: npm install canvas');
}
