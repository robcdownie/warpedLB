// iOS home-screen launch images, drawn from the same vector mark as the app
// icon (scripts/icon-source.mjs) so the launch screen and the icon look like
// one piece of design rather than two unrelated pictures.
//
// These replace generated illustrations that shared nothing with the icon or
// the in-app chrome. Usage: npm run assets:splash
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PALETTE } from './icon-source.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'public/art/splash');
mkdirSync(OUT, { recursive: true });

// Matches the iOS launch-image links in index.html.
const SIZES = [
  [1170, 2532],
  [1179, 2556],
  [1290, 2796],
  [750, 1334],
];

/**
 * The mark, centred, on the app's own header gradient, with the yellow band
 * anchored to the bottom edge — the icon's composition stretched to a phone.
 */
function splashSvg(w, h) {
  const unit = Math.min(w, h);
  const s = unit * 0.42; // mark box
  const cx = w / 2;
  const cy = h * 0.46;
  const x0 = cx - s / 2;
  const x1 = cx + s / 2;
  const top = cy - s * 0.37;
  const bot = cy + s * 0.37;
  const mid = cy - s * 0.02;
  const inner = 0.46;
  const d = [
    `M ${x0},${top}`,
    `L ${x0 + (cx - x0) * inner},${bot}`,
    `L ${cx},${mid}`,
    `L ${x1 - (x1 - cx) * inner},${bot}`,
    `L ${x1},${top}`,
  ].join(' ');
  const sw = s * 0.215;
  const off = s * 0.052;
  const band = h * 0.055;
  const pass = (color, o) =>
    `<path d="${d}" transform="translate(${o},${o})" fill="none" stroke="${color}" ` +
    `stroke-width="${sw}" stroke-linejoin="miter" stroke-miterlimit="6"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PALETTE.blueLight}"/>
      <stop offset="1" stop-color="${PALETTE.blueDeep}"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#f)"/>
    <g transform="rotate(-2 ${cx} ${cy})">
      ${pass(PALETTE.pink, off)}
      ${pass('#ffffff', 0)}
    </g>
    <rect x="0" y="${h - band}" width="${w}" height="${band}" fill="${PALETTE.yellow}"/>
  </svg>`;
}

async function main() {
  for (const [w, h] of SIZES) {
    const file = resolve(OUT, `splash-${w}x${h}.png`);
    await sharp(Buffer.from(splashSvg(w, h)))
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toFile(file);
  }
  console.log(`Splash images written to ${OUT} (${SIZES.length} sizes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
