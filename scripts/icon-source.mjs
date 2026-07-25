// The app icon, authored as vector shapes.
//
// It replaces a generated raster (guitar + palms + sunset + sticker outline)
// that had nothing to do with this app and turned to mush at home-screen size.
// An icon is 60 CSS px on a phone: it has to be two or three shapes with hard
// contrast, which is a drawing job, not a prompting job.
//
// The mark is a sibling of the in-app wordmark (src/components/WarpedWordmark):
// same palette, same punk screen-print offset (a pink pass under a white one),
// same -2° tilt, and the yellow band echoes its LONG BEACH tag.

export const PALETTE = {
  ink: '#0a0f1c',
  pink: '#ff2d78',
  yellow: '#ffd21e',
  blueDeep: '#0b2f6b',
  blueLight: '#1f5fa8',
};

/**
 * The W, as a stroked polyline rather than a font glyph — no font dependency,
 * identical output everywhere, and the miter points give it the sharp cut of a
 * stencil. Geometry is parameterised so the maskable variant can pull it into
 * Android's circular safe zone.
 */
function wPath({ x0, x1, top, bot, mid }) {
  const cx = (x0 + x1) / 2;
  const inner = 0.46; // where the inner feet land between the outer legs
  return [
    `M ${x0},${top}`,
    `L ${x0 + (cx - x0) * inner},${bot}`,
    `L ${cx},${mid}`,
    `L ${x1 - (x1 - cx) * inner},${bot}`,
    `L ${x1},${top}`,
  ].join(' ');
}

function wMark(geom, strokeWidth, offset) {
  const d = wPath(geom);
  const pass = (color, o) =>
    `<path d="${d}" transform="translate(${o},${o})" fill="none" stroke="${color}" ` +
    `stroke-width="${strokeWidth}" stroke-linejoin="miter" stroke-miterlimit="6"/>`;
  return pass(PALETTE.pink, offset) + pass('#ffffff', 0);
}

const FIELD = `
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PALETTE.blueLight}"/>
      <stop offset="1" stop-color="${PALETTE.blueDeep}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#field)"/>`;

/**
 * @param {object} opts
 * @param {boolean} opts.maskable Android may crop this to a circle 80% of the
 *   width, so the band is dropped and the W pulled into the safe zone.
 */
export function iconSvg({ maskable = false } = {}) {
  if (maskable) {
    return wrap(`
      ${FIELD}
      <g transform="rotate(-2 256 256)">
        ${wMark({ x0: 150, x1: 362, top: 190, bot: 344, mid: 260 }, 46, 11)}
      </g>`);
  }
  return wrap(`
    ${FIELD}
    <g transform="rotate(-2 256 242)">
      ${wMark({ x0: 112, x1: 400, top: 126, bot: 340, mid: 226 }, 62, 15)}
    </g>
    <rect x="0" y="430" width="512" height="82" fill="${PALETTE.yellow}"/>`);
}

/** Favicon: the same mark, simplified for 16–32px where the offset would blur. */
export function faviconSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="64" height="64">',
    `<rect width="512" height="512" rx="96" fill="${PALETTE.blueDeep}"/>`,
    `<path d="${wPath({ x0: 118, x1: 394, top: 140, bot: 344, mid: 236 })}" fill="none" ` +
      `stroke="#ffffff" stroke-width="64" stroke-linejoin="miter" stroke-miterlimit="6"/>`,
    `<rect x="0" y="418" width="512" height="94" fill="${PALETTE.yellow}"/>`,
    '</svg>',
  ].join('');
}

function wrap(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${body}</svg>`;
}
