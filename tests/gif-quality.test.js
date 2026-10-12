import test from 'node:test';
import assert from 'node:assert/strict';
import { GIF_PRESETS, createDiagramPalette } from '../src/gif-quality.js';
import { getTheme } from '../src/themes.js';
test('quality choices retain native resolution and compact compatibility',()=>{
 assert.deepEqual([GIF_PRESETS.high.width,GIF_PRESETS.high.height,GIF_PRESETS.high.fps],[1280,720,20]);
 assert.deepEqual([GIF_PRESETS.compact.width,GIF_PRESETS.compact.height,GIF_PRESETS.compact.fps],[640,360,10]);
});
test('every theme gets exactly256 valid colors with exact base colors and antialias ramps',()=>{
 for(const theme of ['light','dark','paper']){
  const t=getTheme(theme),palette=createDiagramPalette(theme);assert.equal(palette.length,256);
  for(const c of palette)assert.ok(c.length===3&&c.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  for(const hex of [...Object.values(t),...Object.values(t.accents)].filter(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/.test(v)))assert.ok(palette.some(c=>c.join()===rgb(hex).join()));
  const mid=rgb(t.text).map((v,i)=>Math.round((v+rgb(t.background)[i])/2));assert.ok(palette.some(c=>c.join()===mid.join()));
 }
});
