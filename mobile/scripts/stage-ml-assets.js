/**
 * Copy exported ML artifacts into mobile/assets/models for APK bundling.
 *
 * Usage (from repo root, after export_mobile_models.py):
 *   node mobile/scripts/stage-ml-assets.js
 */
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '../..');
const src = path.join(repo, 'ml', 'artifacts', 'mobile');
const dest = path.join(repo, 'mobile', 'assets', 'models');

const files = [
  'mobile_manifest.json',
  'resnet50_pre.tflite',
  'resnet50_post.tflite',
  'rf_pre.onnx',
  'rf_post.onnx',
];

if (!fs.existsSync(src)) {
  console.error('Missing ml/artifacts/mobile — run export_mobile_models.py first.');
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const f of files) {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) {
    console.warn('Skip (missing):', f);
    continue;
  }
  fs.copyFileSync(from, path.join(dest, f));
  copied++;
}

if (copied > 0) {
  const manifestPath = path.join(dest, 'mobile_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.bundled = true;
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
  }
}

console.log(`Staged ${copied} file(s) → mobile/assets/models`);
