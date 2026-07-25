// Generates PWA icons (192, 512, maskable 512, apple-touch 180) and a favicon
// from the vector mark in scripts/icon-source.mjs. Everything is drawn from
// shapes, so the whole icon set is a few hundred bytes of source and can be
// re-derived exactly at any size. No remote assets at build time.
// Usage: npm run assets:icons
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { iconSvg, faviconSvg, PALETTE } from './icon-source.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const OUT = resolve(root, 'public/icons');
mkdirSync(OUT, { recursive: true });

async function main() {
  const standard = Buffer.from(iconSvg());
  const maskable = Buffer.from(iconSvg({ maskable: true }));

  // Palette-quantized PNGs — flat vector art compresses hard with no visible
  // loss, which keeps the offline precache small.
  const png = { palette: true, quality: 90, compressionLevel: 9 };

  // Full-bleed app icons (the OS applies its own corner rounding).
  await sharp(standard).resize(192, 192).png(png).toFile(resolve(OUT, 'pwa-192.png'));
  await sharp(standard).resize(512, 512).png(png).toFile(resolve(OUT, 'pwa-512.png'));

  // Maskable: already composed inside Android's circular safe zone, and
  // full-bleed, so there is no padding colour to blend and nothing to crop.
  await sharp(maskable).resize(512, 512).png(png).toFile(resolve(OUT, 'maskable-512.png'));

  // iOS home screen icon (no alpha; iOS masks the corners itself).
  await sharp(standard)
    .resize(180, 180)
    .flatten({ background: PALETTE.blueDeep })
    .png(png)
    .toFile(resolve(OUT, 'apple-touch-icon-180.png'));

  writeFileSync(resolve(OUT, 'favicon.svg'), faviconSvg());
  console.log('Icons written to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
