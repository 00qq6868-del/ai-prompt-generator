// scripts/generate-icons.js
// Generates public/icons/icon-192.png and public/icons/icon-512.png
// Pure Node.js — no Python required. Uses sharp (already a project dependency).
// Run: node scripts/generate-icons.js

const path = require("path");
const fs   = require("fs");

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.error("❌ sharp not found. Run: npm install");
    process.exit(1);
  }

  const outDir = path.join(__dirname, "..", "public", "icons");
  fs.mkdirSync(outDir, { recursive: true });

  const SIZES = [192, 512];

  for (const size of SIZES) {
    const cx = size / 2;
    const r1 = size * 0.42;  // outer gradient ring radius
    const r2 = size * 0.28;  // inner filled circle radius
    const sp = size * 0.30;  // sparkle half-extent

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="70%">
      <stop offset="0%"   stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#060610"/>
    </radialGradient>
    <radialGradient id="ring" cx="40%" cy="40%" r="65%">
      <stop offset="0%"   stop-color="#818cf8"/>
      <stop offset="50%"  stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </radialGradient>
    <radialGradient id="inner" cx="45%" cy="40%" r="60%">
      <stop offset="0%"   stop-color="#a5b4fc"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${size * 0.025}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#bg)"/>

  <!-- Outer glow ring -->
  <circle cx="${cx}" cy="${cx}" r="${r1}" fill="none"
    stroke="url(#ring)" stroke-width="${size * 0.06}" opacity="0.85" filter="url(#glow)"/>

  <!-- Inner filled circle -->
  <circle cx="${cx}" cy="${cx}" r="${r2}" fill="url(#inner)" opacity="0.9"/>

  <!-- 4-pointed star (sparkle ✦) -->
  <g transform="translate(${cx}, ${cx})" fill="white" opacity="0.95" filter="url(#glow)">
    <polygon points="
      0,${-sp}
      ${sp * 0.18},${-sp * 0.18}
      ${sp},0
      ${sp * 0.18},${sp * 0.18}
      0,${sp}
      ${-sp * 0.18},${sp * 0.18}
      ${-sp},0
      ${-sp * 0.18},${-sp * 0.18}
    "/>
  </g>
</svg>`.trim();

    const outPath = path.join(outDir, `icon-${size}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
    console.log(`✅  Created: ${outPath}`);
  }

  console.log("\n🎉  Icons generated successfully!");
  console.log("    public/icons/icon-192.png");
  console.log("    public/icons/icon-512.png");
}

main().catch((err) => {
  console.error("Icon generation failed:", err.message);
  process.exit(1);
});
