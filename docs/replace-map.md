# Replacing the festival map image

The map is the real Warped Long Beach festival map. If an updated map is released, swap the image and re-check the pin positions.

## Swap the image

The app displays `public/map/festival-map.webp`. You can either:

**A. Drop in a new file directly**
1. Replace `public/map/festival-map.webp` with the new map (keep the same filename).
2. Keep the full image — **do not crop out the legend**. Keep the original aspect ratio.
3. Rebuild & deploy.

**B. Re-crop from a source screenshot (recommended)**
1. Put the source image at `docs/assets/original-map-screenshot.png`.
2. Adjust the crop rectangle in `scripts/crop-map.mjs` if needed (it removes any phone status bar / app header / white margins and keeps the blue artwork + legend).
3. Run `npm run assets:map`. This writes `public/map/festival-map.webp`.
4. Rebuild & deploy.

## Re-align the pins

Pin positions are stored as **percentages** of the image, so a same-shaped map needs little or no change. After swapping:

1. Open the app → **Map → the sliders button (top-left) → Unlock calibration**.
2. Pick a location, then **tap the map** where it really is. Fine-tune with the arrow nudges. The live x%/y% readout helps.
3. Add repeated amenity pins (restrooms, water, first aid…) by tapping **＋**, choosing the amenity type, then placing each one.
4. **Export** the calibrated coordinates and share/import them to the other phones so everyone gets the corrected pins.
5. **Reset** restores the seed positions if you want to start over.

The seed coordinates in `src/data/stages.ts` and `src/data/locations.ts` are the starting positions; calibration overrides them per device.
