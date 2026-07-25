// Crops the supplied phone screenshot down to the blue festival-map artwork
// (keeps FESTIVAL MAP title, Vans logo, the island map, and the full legend;
// removes the phone status bar, the "LONG BEACH MAP" app header, and white gaps),
// then exports it as a WebP for use as the offline map background.
//
// The seed stage/location percentage coordinates in src/data are calibrated to
// THIS crop. If you replace the map, re-run this and re-check calibration.
//
// Usage: npm run assets:map
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Source screenshot. Kept in docs/assets so the crop can always be re-derived.
const ORIGINAL = resolve(root, 'docs/assets/original-map-screenshot.png');

// Crop rectangle (measured from the 1320x2868 screenshot: blue artwork y=665..2453).
const CROP = { left: 0, top: 660, width: 1320, height: 1798 };

const OUT_DIR = resolve(root, 'public/map');
const OUT = resolve(OUT_DIR, 'festival-map.webp');

async function main() {
  const source = ORIGINAL;
  if (!existsSync(source)) {
    throw new Error(`No source map found at ${ORIGINAL}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const meta = await sharp(source).metadata();
  // Clamp crop to image bounds so an unexpected source can't throw.
  const crop = {
    left: Math.max(0, CROP.left),
    top: Math.max(0, CROP.top),
    width: Math.min(CROP.width, meta.width - CROP.left),
    height: Math.min(CROP.height, meta.height - CROP.top),
  };

  await sharp(source)
    .extract(crop)
    .webp({ quality: 84 })
    .toFile(OUT);

  const outMeta = await sharp(OUT).metadata();
  console.log(`Map written: ${OUT}`);
  console.log(`  size: ${outMeta.width}x${outMeta.height}, ${outMeta.format}`);
  console.log(`  aspect ratio: ${(outMeta.width / outMeta.height).toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
