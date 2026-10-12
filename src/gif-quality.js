import { getTheme } from './themes.js';
export const GIF_PRESETS = Object.freeze({
  high: Object.freeze({ label: '고화질', width: 1280, height: 720, fps: 20 }),
  compact: Object.freeze({ label: '가벼움', width: 640, height: 360, fps: 10 }),
});
const rgb = hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
/** Reserve exact theme colors, then antialias ramps for text, lines and accents.
 * This spends GIF's 256 colors on the diagram instead of a general RGB cube. */
export function createDiagramPalette(theme) {
  const t = getTheme(theme), colors = [], seen = new Set();
  const add = color => { const key = color.join(','); if (!seen.has(key) && colors.length < 256) { seen.add(key); colors.push(color); } };
  const blend = (a, b, fraction) => a.map((v, i) => Math.round(v * fraction + b[i] * (1 - fraction)));
  const bg = rgb(t.background), node = rgb(t.node);
  for (const value of [...Object.values(t), ...Object.values(t.accents)])
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) add(rgb(value));
  add([255,255,255]); add([0,0,0]);
  for (const accent of Object.values(t.accents)) add(blend(rgb(accent), bg, parseInt(t.tint, 16) / 255));
  // Text consumes most antialiased pixels. Include both the page and node fills.
  for (const key of ['title','text','muted','nodeText','activeText'])
    for (const surface of [bg,node])
      for (let i=1;i<16;i++) add(blend(rgb(t[key]),surface,i/16));
  for (const color of [...Object.values(t.accents),t.edge,t.arrow,t.edgeLabel,t.nodeBorder])
    for (let i=1;i<9;i++) add(blend(rgb(color),bg,i/9));
  for (let i=0;i<256;i++) add([i,i,i]);
  // Defensive padding for any future palette with fewer unique ramp colors.
  while (colors.length < 256) colors.push([...bg]);
  return colors;
}
