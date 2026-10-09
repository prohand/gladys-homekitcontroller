// -----------------------------------------------------------------------------
// Color conversions between HomeKit and Gladys.
//
// HomeKit describes a color with Hue (0-360°) + Saturation (0-100 %), the
// brightness being a separate characteristic. Gladys stores a light color as
// an RGB integer (0xRRGGBB). We convert with a full value (V = 100 %), so the
// brightness stays owned by the brightness feature.
// -----------------------------------------------------------------------------

/**
 * @param {number} hue 0-360
 * @param {number} saturation 0-100
 * @returns {number} RGB integer (0xRRGGBB)
 */
export function hsToRgbInt(hue, saturation) {
  const h = (((Number(hue) % 360) + 360) % 360) / 60;
  const s = Math.max(0, Math.min(100, Number(saturation))) / 100;
  const c = s; // chroma, with V = 1
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = 1 - c;
  const [r1, g1, b1] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (v) => Math.round((v + m) * 255);
  return (to255(r1) << 16) | (to255(g1) << 8) | to255(b1);
}

/**
 * @param {number} rgb RGB integer (0xRRGGBB)
 * @returns {{hue: number, saturation: number}} hue 0-360, saturation 0-100
 */
export function rgbIntToHs(rgb) {
  const value = Math.max(0, Math.min(0xffffff, Math.round(Number(rgb) || 0)));
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }
  if (hue < 0) {
    hue += 360;
  }
  const saturation = max === 0 ? 0 : (delta / max) * 100;
  return { hue: Math.round(hue), saturation: Math.round(saturation) };
}
