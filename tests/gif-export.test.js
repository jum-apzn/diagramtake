import test from 'node:test';
import assert from 'node:assert/strict';
import { exportGIF, GIF_WIDTH, GIF_HEIGHT } from '../src/gif-export.js';
function fixture() {
 const data=new Uint8ClampedArray(GIF_WIDTH*GIF_HEIGHT*4).fill(255);
 const canvas={width:1280,height:720};let reads=0;
 const outputCanvas={width:0,height:0,getContext:()=>({drawImage(){},getImageData(x,y,width,height){reads++;return {data: width===GIF_WIDTH&&height===GIF_HEIGHT ? data : new Uint8ClampedArray(width*height*4).fill(255)};}})};
 return {canvas,outputCanvas,duration:0.3,renderFrame:()=>{},get reads(){return reads;}};
}
test('GIF exporter creates a local animated GIF with endpoints and progress',async()=>{
 const x=fixture(),times=[],progress=[];x.renderFrame=t=>times.push(t);x.onProgress=p=>progress.push(p);
 const blob=await exportGIF(x);assert.equal(blob.type,'image/gif');assert.equal(new TextDecoder().decode((await blob.arrayBuffer()).slice(0,6)),'GIF89a');
 assert.equal(times.length,6);assert.equal(times[0],0);assert.equal(times.at(-1),.3);assert.equal(progress[0],0);assert.equal(progress.at(-1),1);assert.equal(x.reads,6);assert.equal(x.canvas.width,1);assert.equal(x.outputCanvas.width,1);
});
test('duration limit rejects rather than silently truncating',async()=>{
 for(const duration of [0,-1,NaN,Infinity,30.01])await assert.rejects(exportGIF({...fixture(),duration}),/up to 30 seconds/);
});
test('GIF pre-abort rejects without rendering',async()=>{
 const controller=new AbortController();controller.abort();const x=fixture();await assert.rejects(exportGIF({...x,signal:controller.signal}),{name:'AbortError'});assert.equal(x.reads,0);
});
test('cancellation between frames frees canvases and permits retry',async()=>{
 const x=fixture(),controller=new AbortController();x.signal=controller.signal;x.onProgress=p=>{if(p>0)controller.abort();};await assert.rejects(exportGIF(x),{name:'AbortError'});assert.equal(x.reads,1);assert.equal(x.canvas.width,1);
 delete x.signal;delete x.onProgress;assert.equal((await exportGIF(x)).type,'image/gif');
});
test('duplicate export rejects while first is active',async()=>{
 const x=fixture();const running=exportGIF(x);await assert.rejects(exportGIF(x),/already running/);await running;
});
test('render and pixel failures release canvases and preserve error messages',async()=>{
 let x=fixture();x.renderFrame=()=>{throw Error('render failed');};await assert.rejects(exportGIF(x),/render failed/);assert.equal(x.canvas.width,1);
 x=fixture();x.outputCanvas.getContext=()=>({drawImage(){},getImageData(){throw Error('tainted');}});await assert.rejects(exportGIF(x),/pixels could not be read/);assert.equal(x.outputCanvas.height,1);
});
test('progress callback errors clean up export state',async()=>{
 const x=fixture();x.onProgress=()=>{throw Error('progress failed');};await assert.rejects(exportGIF(x),/progress failed/);assert.equal(x.canvas.height,1);
});
test('GIF refuses same canvas and missing canvas context',async()=>{
 const x=fixture();await assert.rejects(exportGIF({...x,outputCanvas:x.canvas}),/separate/);x.outputCanvas.getContext=()=>null;await assert.rejects(exportGIF(x),/cannot read/);
});

test('compact preset uses 640 by 360 and 10 fps while high stays native 720p',async()=>{
 const x=fixture(),times=[];const blob=await exportGIF({...x,quality:'compact',renderFrame:t=>times.push(t)});const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(bytes[6]+256*bytes[7],640);assert.equal(bytes[8]+256*bytes[9],360);assert.equal(times.length,3);
 await assert.rejects(exportGIF({...fixture(),quality:'unknown'}),/valid GIF quality/);
});
